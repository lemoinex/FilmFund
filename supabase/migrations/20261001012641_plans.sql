-- Plans, versions de plan et abonnements des studios (lot F1).
--
-- Décisions de l'utilisateur (1er octobre 2026) :
--   - trois plans : Gratuit, Pro (20 000 XAF par mois), Studio (100 000 XAF
--     par mois), en francs CFA BEAC ;
--   - quotas renouvelés chaque mois, à date anniversaire ;
--   - valeurs modifiables par l'administration depuis l'application.
--
-- Une modification ne réécrit jamais l'existant : elle publie une nouvelle
-- version du plan. Une version s'applique à un studio à partir de sa
-- prochaine période — la période en cours garde les valeurs avec
-- lesquelles elle a commencé : les droits d'un studio ne changent pas
-- silencieusement en cours de route. Changer le plan d'un studio, en
-- revanche, s'applique aussitôt.
--
-- Ce lot applique les limites aux ressources qui existent déjà : nombre de
-- projets et de membres d'un studio. Les unités texte, images et PDF sont
-- au catalogue ; leur registre de consommation viendra avec le devis (lot G),
-- les coûts fournisseurs avec la passerelle IA (lot I), les paiements avec
-- le lot N : trois registres distincts, aucun n'est mélangé à celui-ci.
--
-- L'exploitant, en SQL direct, n'est pas soumis aux limites, comme pour les
-- autres règles de l'application.
--
-- Retour arrière : retirer déclencheurs, politiques et fonctions, puis les
-- tables. Les versions publiées sont un historique : les supprimer efface la
-- trace des valeurs appliquées.

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

create table public.plans (
  code text primary key,
  name text not null,
  position smallint not null unique,

  constraint plan_nom_non_vide check (char_length(btrim(name)) between 1 and 60)
);

comment on table public.plans is
  'Plans commerciaux proposés aux studios. Leurs valeurs vivent dans plan_versions.';

create table public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.plans (code),
  -- Fixé par le déclencheur de numérotation ; la valeur par défaut ne sert
  -- qu'à rendre la colonne facultative à l'insertion, et la contrainte
  -- ci-dessous refuserait une version 0 si le déclencheur manquait.
  version_number integer not null default 0,
  -- Volumes : entiers, jamais de flottants. Le stockage est en mégaoctets.
  max_projects integer not null,
  max_members integer not null,
  storage_mb integer not null,
  text_units_per_month integer not null,
  images_per_month integer not null,
  pdf_exports_per_month integer not null,
  -- Montant en francs CFA BEAC : la devise n'a pas de subdivision en usage.
  price_xaf_per_month bigint not null,
  published_at timestamptz not null default now(),
  -- Pas de clé étrangère : supprimer un compte modifierait l'historique.
  -- Nul : version publiée par migration ou en SQL direct.
  published_by uuid,

  constraint version_unique unique (plan_code, version_number),
  constraint version_positive check (version_number >= 1),
  constraint volumes_positifs check (
    max_projects >= 0
    and storage_mb >= 0
    and text_units_per_month >= 0
    and images_per_month >= 0
    and pdf_exports_per_month >= 0
    and price_xaf_per_month >= 0
  ),
  -- Le propriétaire du studio compte parmi ses membres.
  constraint au_moins_un_membre check (max_members >= 1)
);

comment on table public.plan_versions is
  'Valeurs successives des plans, en ajout seul. Publiées par l''administration ; jamais modifiées ni supprimées.';

alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;

-- Numéro, date et auteur sont fixés par la base, pas par le formulaire. Le
-- verrou sur le plan sérialise deux publications simultanées. En SQL direct,
-- la date fournie est conservée : c'est ce qui permet d'éprouver la règle de
-- la prochaine période sur des versions antidatées.
create or replace function public.numeroter_version_plan()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform 1 from public.plans where code = new.plan_code for update;

  select coalesce(max(v.version_number), 0) + 1
  into new.version_number
  from public.plan_versions v
  where v.plan_code = new.plan_code;

  if (select auth.uid()) is not null then
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger plan_versions_numerotation
  before insert on public.plan_versions
  for each row
  execute function public.numeroter_version_plan();

create or replace function public.version_plan_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Une version de plan ne se modifie ni ne se supprime : publiez-en une nouvelle.'
    using errcode = '42501';
end;
$$;

create trigger plan_versions_ajout_seul
  before update or delete on public.plan_versions
  for each row
  execute function public.version_plan_en_ajout_seul();

create trigger plan_versions_pas_de_vidage
  before truncate on public.plan_versions
  for each statement
  execute function public.version_plan_en_ajout_seul();

-- Le catalogue est lu par tout compte connecté : c'est l'offre.
create policy "Les comptes connectés lisent les plans"
  on public.plans for select
  to authenticated
  using (true);

create policy "Les administrateurs renomment les plans"
  on public.plans for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.plans
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

create policy "Les comptes connectés lisent les versions de plan"
  on public.plan_versions for select
  to authenticated
  using (true);

create policy "Les administrateurs publient des versions de plan"
  on public.plan_versions for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.plan_versions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.plans from anon, authenticated;
grant select on table public.plans to authenticated;
grant update (name) on table public.plans to authenticated;

revoke all on table public.plan_versions from anon, authenticated;
grant select on table public.plan_versions to authenticated;
grant insert (
  plan_code,
  max_projects,
  max_members,
  storage_mb,
  text_units_per_month,
  images_per_month,
  pdf_exports_per_month,
  price_xaf_per_month
) on table public.plan_versions to authenticated;

insert into public.plans (code, name, position)
values
  ('gratuit', 'Gratuit', 1),
  ('pro', 'Pro', 2),
  ('studio', 'Studio', 3);

-- Valeurs validées par l'utilisateur le 1er octobre 2026.
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month
)
values
  ('gratuit', 1, 1, 100, 20, 10, 2, 0),
  ('pro', 10, 1, 2048, 300, 200, 30, 20000),
  ('studio', 50, 10, 20480, 1500, 1000, 150, 100000);

-- ---------------------------------------------------------------------------
-- Abonnements
-- ---------------------------------------------------------------------------

create table public.studio_subscriptions (
  studio_id uuid primary key references public.studios (id) on delete cascade,
  plan_code text not null references public.plans (code),
  -- Point de départ des périodes mensuelles : la date anniversaire.
  period_anchor timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.studio_subscriptions is
  'Plan de chaque studio et point de départ de ses périodes. Lu par les membres du studio et les administrateurs ; le plan n''est changé que par l''administration.';

alter table public.studio_subscriptions enable row level security;

create policy "Les membres et les administrateurs lisent l'abonnement"
  on public.studio_subscriptions for select
  to authenticated
  using (public.role_dans_studio(studio_id) is not null or (select public.is_admin()));

create policy "Les administrateurs changent le plan"
  on public.studio_subscriptions for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.studio_subscriptions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Seul le plan se change ; la date anniversaire ne bouge pas.
revoke all on table public.studio_subscriptions from anon, authenticated;
grant select on table public.studio_subscriptions to authenticated;
grant update (plan_code) on table public.studio_subscriptions to authenticated;

create trigger studio_subscriptions_avant_update
  before update on public.studio_subscriptions
  for each row
  execute function public.touch_updated_at();

-- Tout studio naît au plan Gratuit, à la date de sa création.
create or replace function public.abonner_studio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.studio_subscriptions (studio_id, plan_code, period_anchor)
  values (new.id, 'gratuit', new.created_at);
  return null;
end;
$$;

create trigger studios_abonnement
  after insert on public.studios
  for each row
  execute function public.abonner_studio();

insert into public.studio_subscriptions (studio_id, plan_code, period_anchor)
select s.id, 'gratuit', s.created_at
from public.studios s;

-- ---------------------------------------------------------------------------
-- Période et version en vigueur
-- ---------------------------------------------------------------------------

-- Début de la période mensuelle en cours : le dernier « ancre + n mois »
-- qui ne dépasse pas l'instant. PostgreSQL ramène un 31 au dernier jour des
-- mois courts : ancré au 31 janvier, février commence le 28.
--
-- `age()` seul ne suffit pas : il ne compte un mois plein qu'au même
-- quantième, et ferait commencer la période de février le 3 mars. Il ne
-- sert ici qu'à estimer n, vérifié sur ses voisins.
create or replace function public.debut_periode(p_ancre timestamptz, p_instant timestamptz default now())
returns timestamptz
language sql
stable
set search_path = pg_catalog, public
as $$
  select max(p_ancre + make_interval(months => m))
  from generate_series(
    greatest(
      (extract(year from age(p_instant, p_ancre)) * 12 + extract(month from age(p_instant, p_ancre)))::integer - 1,
      0
    ),
    (extract(year from age(p_instant, p_ancre)) * 12 + extract(month from age(p_instant, p_ancre)))::integer + 1
  ) as m
  where p_ancre + make_interval(months => m) <= p_instant;
$$;

-- Version du plan du studio applicable à sa période en cours : la plus
-- récente publiée avant le début de la période ; à défaut — studio dont la
-- période a commencé avant toute publication —, la première version.
-- Security invoker : l'appelant ne voit que l'abonnement de ses studios.
create or replace function public.plan_en_vigueur(p_studio_id uuid)
returns public.plan_versions
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select v.*
  from public.studio_subscriptions a
  cross join lateral (select public.debut_periode(a.period_anchor) as debut) d
  join public.plan_versions v on v.plan_code = a.plan_code
  where a.studio_id = p_studio_id
  order by
    (v.published_at <= d.debut) desc,
    case when v.published_at <= d.debut then -v.version_number else v.version_number end
  limit 1;
$$;

revoke all on function public.debut_periode(timestamptz, timestamptz) from public, anon;
grant execute on function public.debut_periode(timestamptz, timestamptz) to authenticated;
revoke all on function public.plan_en_vigueur(uuid) from public, anon;
grant execute on function public.plan_en_vigueur(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Limites
-- ---------------------------------------------------------------------------

-- Le verrou sur la ligne du studio sérialise deux créations simultanées :
-- la seconde compte après que la première a abouti, et ne peut donc pas
-- prendre la même dernière place. Un compte qui n'est pas membre du studio
-- n'apprend rien de son plan : la politique de création le refusera.
create or replace function public.limiter_projets_du_studio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  limite integer;
  nombre integer;
begin
  if (select auth.uid()) is null
     or (public.role_dans_studio(new.studio_id) is null and not public.is_admin()) then
    return new;
  end if;

  perform 1 from public.studios where id = new.studio_id for update;

  select v.max_projects into limite from public.plan_en_vigueur(new.studio_id) v;
  select count(*) into nombre from public.projects where studio_id = new.studio_id;

  if nombre >= coalesce(limite, 0) then
    raise exception 'Le plan de ce studio ne permet pas d''autre projet (limite : %).', coalesce(limite, 0)
      using errcode = '53400';
  end if;

  return new;
end;
$$;

-- Nommé pour s'exécuter après projects_studio_par_defaut (ordre alphabétique) :
-- le studio est alors connu.
create trigger projects_studio_quota
  before insert on public.projects
  for each row
  execute function public.limiter_projets_du_studio();

create or replace function public.limiter_membres_du_studio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  limite integer;
  nombre integer;
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  perform 1 from public.studios where id = new.studio_id for update;

  select v.max_members into limite from public.plan_en_vigueur(new.studio_id) v;
  select count(*) into nombre from public.studio_members where studio_id = new.studio_id;

  if nombre >= coalesce(limite, 0) then
    raise exception 'Le plan de ce studio ne permet pas d''autre membre (limite : %).', coalesce(limite, 0)
      using errcode = '53400';
  end if;

  return new;
end;
$$;

create trigger studio_members_quota
  before insert on public.studio_members
  for each row
  execute function public.limiter_membres_du_studio();

-- ---------------------------------------------------------------------------
-- Journal d'administration
-- ---------------------------------------------------------------------------

alter table public.admin_audit_log
  drop constraint action_connue,
  add constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu',
      'intervention_studio',
      'publication_plan',
      'changement_plan_studio'
    )
  );

-- Après l'écriture, dans la même transaction : le numéro de version n'est
-- connu qu'une fois attribué, et l'entrée ne peut pas survivre à une
-- publication annulée.
create or replace function public.journaliser_publication_plan()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null then
    perform public.journaliser(
      'publication_plan',
      null,
      jsonb_build_object('plan', new.plan_code, 'version', new.version_number)
    );
  end if;
  return null;
end;
$$;

create trigger plan_versions_journal
  after insert on public.plan_versions
  for each row
  execute function public.journaliser_publication_plan();

create or replace function public.journaliser_changement_plan()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.plan_code is distinct from old.plan_code
     and (select auth.uid()) is not null then
    perform public.journaliser(
      'changement_plan_studio',
      null,
      jsonb_build_object(
        'studio', new.studio_id,
        'compte', (select s.personal_owner_id from public.studios s where s.id = new.studio_id),
        'ancien_plan', old.plan_code,
        'nouveau_plan', new.plan_code
      )
    );
  end if;
  return new;
end;
$$;

create trigger studio_subscriptions_journal
  before update on public.studio_subscriptions
  for each row
  execute function public.journaliser_changement_plan();

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.numeroter_version_plan() from public, anon, authenticated;
revoke all on function public.version_plan_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.abonner_studio() from public, anon, authenticated;
revoke all on function public.limiter_projets_du_studio() from public, anon, authenticated;
revoke all on function public.limiter_membres_du_studio() from public, anon, authenticated;
revoke all on function public.journaliser_publication_plan() from public, anon, authenticated;
revoke all on function public.journaliser_changement_plan() from public, anon, authenticated;
