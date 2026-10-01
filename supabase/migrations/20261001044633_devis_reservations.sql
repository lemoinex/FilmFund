-- Devis, réservation atomique et idempotence (lot G).
--
-- Décisions de l'utilisateur (1er octobre 2026) :
--   - un devis reste valable 15 minutes ; expiré, ou si son contexte a
--     changé, il doit être recalculé et accepté à nouveau ;
--   - le barème des livrables (unités texte) est versionné en base et publié
--     par l'administration depuis « Plans et quotas » ; comme un plan, une
--     version s'applique à chaque studio à partir de sa prochaine période ;
--   - seuls le porteur et les éditeurs d'un projet — et les administrateurs —
--     demandent un devis et réservent des unités : une génération écrit dans
--     le projet.
--
-- Déroulé d'une action coûteuse :
--   1. creer_devis() calcule en base ce que coûte l'action : unités, plan et
--      barème en vigueur, période, empreinte de la requête ;
--   2. accepter_devis() réserve ces unités, sous une clé d'idempotence ;
--   3. regler_reservation() impute ce qui a réellement été livré et rend le
--      reste, une seule fois, sur la période d'origine.
-- La tâche qui exécutera l'action naîtra dans la transaction de
-- l'acceptation (lot H), qui confiera le règlement au worker. Aucune action
-- de l'application ne consomme encore d'unités.
--
-- Ces tables forment le registre des droits commerciaux (texte, images,
-- exports PDF). Les coûts fournisseurs (lot I) et les paiements (lot N)
-- auront les leurs : aucun n'est mélangé à celui-ci.
--
-- Rien ne s'y écrit directement : les quantités sont calculées par la base,
-- jamais reçues du navigateur. Les fonctions d'écriture s'exécutent avec les
-- droits de leur propriétaire, donc hors RLS : chacune vérifie elle-même
-- l'identité de l'appelant, ses droits sur le projet et le mode privé.
--
-- Retour arrière : retirer fonctions, déclencheurs et politiques, puis les
-- tables. Réservations et règlements sont un registre, les versions du
-- barème un historique : les supprimer efface la trace des unités engagées
-- et des valeurs appliquées. Une erreur s'y corrige par une écriture
-- nouvelle, jamais par une modification.

-- ---------------------------------------------------------------------------
-- Barème des unités texte
-- ---------------------------------------------------------------------------

create table public.text_unit_rate_versions (
  id uuid primary key default gen_random_uuid(),
  -- Fixé par le déclencheur de numérotation, comme pour les plans.
  version_number integer not null default 0,
  -- Unités texte par livrable ; le scénario se compte par séquence, les
  -- dialogues par scène.
  logline integer not null,
  synopsis_short integer not null,
  synopsis_standard integer not null,
  synopsis_detailed integer not null,
  intention_note integer not null,
  treatment integer not null,
  bible integer not null,
  screenplay_per_sequence integer not null,
  dialogue_per_scene integer not null,
  published_at timestamptz not null default now(),
  -- Pas de clé étrangère : supprimer un compte modifierait l'historique.
  -- Nul : version publiée par migration ou en SQL direct.
  published_by uuid,

  constraint bareme_version_unique unique (version_number),
  constraint bareme_version_positive check (version_number >= 1),
  constraint bareme_poids_positifs check (
    logline >= 0
    and synopsis_short >= 0
    and synopsis_standard >= 0
    and synopsis_detailed >= 0
    and intention_note >= 0
    and treatment >= 0
    and bible >= 0
    and screenplay_per_sequence >= 0
    and dialogue_per_scene >= 0
  )
);

comment on table public.text_unit_rate_versions is
  'Barème des unités texte par livrable, en ajout seul. Publié par l''administration ; jamais modifié ni supprimé.';

alter table public.text_unit_rate_versions enable row level security;

-- Sans plan à verrouiller, un verrou consultatif sérialise deux
-- publications simultanées, qui prendraient sinon le même numéro.
create or replace function public.numeroter_version_bareme()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.text_unit_rate_versions'));

  select coalesce(max(v.version_number), 0) + 1
  into new.version_number
  from public.text_unit_rate_versions v;

  if (select auth.uid()) is not null then
    new.published_at := now();
    new.published_by := (select auth.uid());
  end if;

  return new;
end;
$$;

create trigger text_unit_rate_versions_numerotation
  before insert on public.text_unit_rate_versions
  for each row
  execute function public.numeroter_version_bareme();

create or replace function public.version_bareme_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Une version du barème ne se modifie ni ne se supprime : publiez-en une nouvelle.'
    using errcode = '42501';
end;
$$;

create trigger text_unit_rate_versions_ajout_seul
  before update or delete on public.text_unit_rate_versions
  for each row
  execute function public.version_bareme_en_ajout_seul();

create trigger text_unit_rate_versions_pas_de_vidage
  before truncate on public.text_unit_rate_versions
  for each statement
  execute function public.version_bareme_en_ajout_seul();

-- Le barème fait partie de l'offre : la vitrine l'explique aux visiteurs.
create policy "Les comptes connectés lisent le barème"
  on public.text_unit_rate_versions for select
  to authenticated
  using (true);

create policy "Les visiteurs lisent le barème"
  on public.text_unit_rate_versions for select
  to anon
  using (true);

create policy "Les administrateurs publient le barème"
  on public.text_unit_rate_versions for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.text_unit_rate_versions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.text_unit_rate_versions from anon, authenticated;
grant select on table public.text_unit_rate_versions to authenticated;
-- L'identifiant d'une version et son auteur restent fermés aux visiteurs.
grant select (
  version_number,
  logline,
  synopsis_short,
  synopsis_standard,
  synopsis_detailed,
  intention_note,
  treatment,
  bible,
  screenplay_per_sequence,
  dialogue_per_scene,
  published_at
) on table public.text_unit_rate_versions to anon;
grant insert (
  logline,
  synopsis_short,
  synopsis_standard,
  synopsis_detailed,
  intention_note,
  treatment,
  bible,
  screenplay_per_sequence,
  dialogue_per_scene
) on table public.text_unit_rate_versions to authenticated;

-- Valeurs validées par l'utilisateur le 1er octobre 2026.
insert into public.text_unit_rate_versions (
  logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
  treatment, bible, screenplay_per_sequence, dialogue_per_scene
)
values (1, 1, 2, 3, 3, 8, 10, 2, 1);

-- Même règle que plan_en_vigueur() : la version la plus récente publiée
-- avant le début de la période du studio ; à défaut, la première.
create or replace function public.bareme_en_vigueur(p_studio_id uuid)
returns public.text_unit_rate_versions
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select v.*
  from public.studio_subscriptions a
  cross join lateral (select public.debut_periode(a.period_anchor) as debut) d
  cross join public.text_unit_rate_versions v
  where a.studio_id = p_studio_id
  order by
    (v.published_at <= d.debut) desc,
    case when v.published_at <= d.debut then -v.version_number else v.version_number end
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Registre : devis, réservations, règlements
-- ---------------------------------------------------------------------------

-- Seul endroit où la durée de validité d'un devis est fixée.
create or replace function public.duree_validite_devis()
returns interval
language sql
immutable
set search_path = pg_catalog
as $$
  select interval '15 minutes';
$$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references public.studios (id) on delete cascade,
  -- Pas de clé étrangère vers le projet : le supprimer ne doit ni effacer ni
  -- modifier la trace des unités engagées pour lui.
  project_id uuid not null,
  created_by uuid not null,
  action text not null,
  params jsonb not null default '{}',
  unit text not null,
  quantity integer not null,
  -- Contexte du calcul, revérifié à l'acceptation.
  plan_version_id uuid not null references public.plan_versions (id),
  rate_version_id uuid references public.text_unit_rate_versions (id),
  period_start timestamptz not null,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint devis_action_connue check (
    action in (
      'logline',
      'synopsis_short',
      'synopsis_standard',
      'synopsis_detailed',
      'intention_note',
      'treatment',
      'bible',
      'screenplay',
      'dialogue',
      'image',
      'pdf_export'
    )
  ),
  constraint devis_unite_connue check (unit in ('text', 'image', 'pdf')),
  constraint devis_quantite_positive check (quantity >= 0),
  constraint devis_bareme_des_unites_texte check ((unit = 'text') = (rate_version_id is not null))
);

comment on table public.quotes is
  'Devis : coût d''une action, calculé par la base. Valable un temps limité ; jamais modifié.';

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  -- Un devis ne s'accepte qu'une fois.
  quote_id uuid not null unique references public.quotes (id) on delete cascade,
  studio_id uuid not null references public.studios (id) on delete cascade,
  project_id uuid not null,
  action text not null,
  unit text not null,
  quantity integer not null,
  -- Période d'origine : le règlement s'y impute, même s'il arrive après
  -- son terme.
  period_start timestamptz not null,
  idempotency_key text not null,
  fingerprint text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),

  constraint reservation_cle_unique unique (studio_id, action, idempotency_key),
  -- Cible de la clé étrangère des règlements, qui reprennent la quantité.
  constraint reservation_quantite_unique unique (id, quantity),
  constraint reservation_quantite_positive check (quantity >= 0),
  constraint reservation_cle_longueur check (char_length(idempotency_key) between 1 and 200)
);

comment on table public.reservations is
  'Unités réservées par un devis accepté, sur la période d''origine. En ajout seul.';

create index reservations_periode_idx on public.reservations (studio_id, unit, period_start);

create table public.reservation_settlements (
  -- Un seul règlement par réservation : les unités non livrées sont
  -- rendues exactement une fois.
  reservation_id uuid primary key,
  reserved integer not null,
  consumed integer not null,
  released integer generated always as (reserved - consumed) stored,
  settled_at timestamptz not null default now(),

  constraint reglement_de_la_reservation foreign key (reservation_id, reserved)
    references public.reservations (id, quantity) on delete cascade,
  constraint reglement_dans_la_reservation check (consumed between 0 and reserved)
);

comment on table public.reservation_settlements is
  'Règlement d''une réservation : unités consommées, le reste rendu. Un seul par réservation, jamais modifié.';

alter table public.quotes enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_settlements enable row level security;

-- Seul effacement admis : la suppression en cascade, avec le studio.
-- Refusé à tous sinon, rôle de service et SQL direct compris.
create or replace function public.registre_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'Le registre des unités ne se modifie ni ne se supprime : une correction s''y ajoute.'
    using errcode = '42501';
end;
$$;

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['quotes', 'reservations', 'reservation_settlements']
  loop
    execute format(
      $f$
        create trigger %I
          before update or delete on public.%I
          for each row
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_ajout_seul',
      nom_table
    );
    execute format(
      $f$
        create trigger %I
          before truncate on public.%I
          for each statement
          execute function public.registre_en_ajout_seul()
      $f$,
      nom_table || '_pas_de_vidage',
      nom_table
    );
  end loop;
end;
$$;

-- Lecture : l'équipe du projet et les administrateurs. Le propriétaire d'un
-- studio ne voit pas ce qui s'engage dans un projet dont il n'est pas.
-- Aucune politique d'écriture : seules les fonctions ci-dessous écrivent.
create policy "L'équipe du projet et les administrateurs lisent les devis"
  on public.quotes for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "L'équipe du projet et les administrateurs lisent les réservations"
  on public.reservations for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Qui lit la réservation lit son règlement"
  on public.reservation_settlements for select
  to authenticated
  using (exists (select 1 from public.reservations r where r.id = reservation_id));

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array['quotes', 'reservations', 'reservation_settlements']
  loop
    execute format(
      $f$
        create policy "Mode privé : administrateurs uniquement"
          on public.%I
          as restrictive
          for all
          to authenticated
          using (not (select public.mode_prive()) or (select public.is_admin()))
          with check (not (select public.mode_prive()) or (select public.is_admin()))
      $f$,
      nom_table
    );
    execute format('revoke all on table public.%I from anon, authenticated', nom_table);
    execute format('grant select on table public.%I to authenticated', nom_table);
  end loop;
end;
$$;

-- Une réservation faite par un administrateur sur un projet dont il n'est
-- pas membre consomme les droits d'un studio : elle est journalisée comme
-- toute intervention sur un projet.
create trigger reservations_journal_admin
  before insert on public.reservations
  for each row
  execute function public.journaliser_intervention_admin();

-- ---------------------------------------------------------------------------
-- Fonctions internes
-- ---------------------------------------------------------------------------

-- Toujours vrai ou faux, jamais nul : un nul pris pour un refus serait
-- inoffensif, mais un `not nul` laisserait passer.
create or replace function public.peut_engager_unites(p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select auth.uid()) is not null
    and (not public.mode_prive() or public.is_admin())
    and exists (select 1 from public.projects p where p.id = p_project_id)
    and (
      coalesce(public.acces_au_projet(p_project_id) in ('owner', 'editor'), false)
      or public.is_admin()
    ),
    false
  );
$$;

-- Unités engagées par un studio sur une période : réservées et pas encore
-- réglées, ou consommées. Le reste d'un règlement est rendu.
create or replace function public.unites_engagees(
  p_studio_id uuid,
  p_unit text,
  p_period_start timestamptz
)
returns integer
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(sum(coalesce(s.consumed, r.quantity)), 0)::integer
  from public.reservations r
  left join public.reservation_settlements s on s.reservation_id = r.id
  where r.studio_id = p_studio_id
    and r.unit = p_unit
    and r.period_start = p_period_start;
$$;

-- Empreinte d'une demande : même projet, même action, mêmes paramètres.
-- Le texte d'un jsonb est canonique — clés triées, espaces normalisés —,
-- si bien qu'une même demande donne toujours la même empreinte.
create or replace function public.empreinte_demande(
  p_project_id uuid,
  p_action text,
  p_params jsonb
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    sha256(convert_to(
      jsonb_build_object('projet', p_project_id, 'action', p_action, 'parametres', p_params)::text,
      'UTF8'
    )),
    'hex'
  );
$$;

create or replace function public.parametre_entier(
  p_params jsonb,
  p_cle text,
  p_maximum integer
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  valeur numeric;
begin
  if jsonb_typeof(p_params -> p_cle) is distinct from 'number' then
    raise exception 'Paramètre « % » manquant : un nombre entier est attendu.', p_cle
      using errcode = '22023';
  end if;
  valeur := (p_params ->> p_cle)::numeric;
  if valeur <> trunc(valeur) or valeur < 1 or valeur > p_maximum then
    raise exception 'Paramètre « % » : un entier entre 1 et % est attendu.', p_cle, p_maximum
      using errcode = '22023';
  end if;
  return valeur::integer;
end;
$$;

-- Unités allouées par la version de plan, selon leur nature.
create or replace function public.allocation_du_plan(
  p_plan public.plan_versions,
  p_unit text
)
returns integer
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case p_unit
    when 'text' then p_plan.text_units_per_month
    when 'image' then p_plan.images_per_month
    when 'pdf' then p_plan.pdf_exports_per_month
  end;
$$;

-- ---------------------------------------------------------------------------
-- Devis
-- ---------------------------------------------------------------------------

-- Ce que coûte une action, à cet instant. Un devis qui dépasse ce qui reste
-- est refusé d'emblée : il ne pourrait pas être accepté.
--
-- Les paramètres sont repris tels quels dans l'empreinte : l'appelant y
-- place aussi ce dont dépend le résultat — la version d'un document source,
-- par exemple —, si bien qu'une demande sur une autre version est une autre
-- demande.
create or replace function public.creer_devis(
  p_project_id uuid,
  p_action text,
  p_params jsonb default '{}'
)
returns table (
  quote_id uuid,
  unit text,
  quantity integer,
  expires_at timestamptz,
  allowance integer,
  available integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_parametres jsonb := coalesce(p_params, '{}');
  v_studio uuid;
  v_debut timestamptz;
  v_plan public.plan_versions;
  v_bareme public.text_unit_rate_versions;
  v_unite text := 'text';
  v_quantite integer;
  v_allocation integer;
  v_disponible integer;
  v_devis public.quotes;
begin
  if not public.peut_engager_unites(p_project_id) then
    raise exception 'Projet introuvable, ou droits insuffisants pour y engager des unités.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(v_parametres) <> 'object' or octet_length(v_parametres::text) > 2000 then
    raise exception 'Paramètres invalides : un objet de taille raisonnable est attendu.'
      using errcode = '22023';
  end if;

  select p.studio_id into v_studio from public.projects p where p.id = p_project_id;
  select public.debut_periode(a.period_anchor) into v_debut
  from public.studio_subscriptions a
  where a.studio_id = v_studio;
  select * into v_plan from public.plan_en_vigueur(v_studio);
  select * into v_bareme from public.bareme_en_vigueur(v_studio);

  if v_debut is null or v_plan.id is null or v_bareme.id is null then
    raise exception 'Ce studio n''a pas de plan en vigueur.' using errcode = '55000';
  end if;

  case p_action
    when 'logline' then v_quantite := v_bareme.logline;
    when 'synopsis_short' then v_quantite := v_bareme.synopsis_short;
    when 'synopsis_standard' then v_quantite := v_bareme.synopsis_standard;
    when 'synopsis_detailed' then v_quantite := v_bareme.synopsis_detailed;
    when 'intention_note' then v_quantite := v_bareme.intention_note;
    when 'treatment' then v_quantite := v_bareme.treatment;
    when 'bible' then v_quantite := v_bareme.bible;
    when 'screenplay' then
      v_quantite := v_bareme.screenplay_per_sequence
        * public.parametre_entier(v_parametres, 'sequences', 500);
    when 'dialogue' then
      v_quantite := v_bareme.dialogue_per_scene
        * public.parametre_entier(v_parametres, 'scenes', 1000);
    when 'image' then
      v_unite := 'image';
      v_quantite := public.parametre_entier(v_parametres, 'count', 100);
    when 'pdf_export' then
      v_unite := 'pdf';
      v_quantite := 1;
    else
      raise exception 'Action inconnue : %.', p_action using errcode = '22023';
  end case;

  v_allocation := public.allocation_du_plan(v_plan, v_unite);
  v_disponible := greatest(v_allocation - public.unites_engagees(v_studio, v_unite, v_debut), 0);

  if v_quantite > v_disponible then
    raise exception 'Quota insuffisant pour cette période : l''action demande %, il reste % sur %.',
      v_quantite, v_disponible, v_allocation
      using errcode = '53400';
  end if;

  insert into public.quotes (
    studio_id, project_id, created_by, action, params, unit, quantity,
    plan_version_id, rate_version_id, period_start, fingerprint, expires_at
  )
  values (
    v_studio, p_project_id, (select auth.uid()), p_action, v_parametres, v_unite, v_quantite,
    v_plan.id, case when v_unite = 'text' then v_bareme.id end, v_debut,
    public.empreinte_demande(p_project_id, p_action, v_parametres),
    now() + public.duree_validite_devis()
  )
  returning * into v_devis;

  return query
    select v_devis.id, v_devis.unit, v_devis.quantity, v_devis.expires_at, v_allocation, v_disponible;
end;
$$;

-- ---------------------------------------------------------------------------
-- Réservation
-- ---------------------------------------------------------------------------

-- Accepter un devis réserve ses unités. Codes d'erreur :
--   42501 devis introuvable ou hors de portée — un seul message pour les
--         deux, qui ne révèle pas l'existence d'un devis ;
--   DV001 devis expiré, ou dont le plan, le barème ou la période ont changé ;
--   DV002 clé déjà employée pour une autre demande ;
--   DV003 devis déjà accepté sous une autre clé ;
--   53400 quota insuffisant.
-- La même clé, pour la même demande, renvoie la réservation déjà faite :
-- un double envoi ne réserve pas deux fois.
create or replace function public.accepter_devis(p_quote_id uuid, p_idempotency_key text)
returns public.reservations
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_devis public.quotes;
  v_existante public.reservations;
  v_debut timestamptz;
  v_plan public.plan_versions;
  v_bareme public.text_unit_rate_versions;
  v_allocation integer;
  v_disponible integer;
  v_reservation public.reservations;
begin
  select * into v_devis from public.quotes q where q.id = p_quote_id;

  if v_devis.id is null or not public.peut_engager_unites(v_devis.project_id) then
    raise exception 'Devis introuvable, ou droits insuffisants pour l''accepter.'
      using errcode = '42501';
  end if;

  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 then
    raise exception 'Clé d''idempotence manquante, ou de plus de 200 caractères.'
      using errcode = '22023';
  end if;

  -- Sérialise les acceptations d'un même studio : la seconde lit ce que la
  -- première a écrit, et ne peut prendre ni la même dernière unité ni la
  -- même clé.
  perform 1 from public.studios s where s.id = v_devis.studio_id for update;

  select * into v_existante
  from public.reservations r
  where r.studio_id = v_devis.studio_id
    and r.action = v_devis.action
    and r.idempotency_key = p_idempotency_key;

  if v_existante.id is not null then
    if v_existante.fingerprint = v_devis.fingerprint then
      return v_existante;
    end if;
    raise exception 'Cette clé a déjà servi pour une autre demande.' using errcode = 'DV002';
  end if;

  if exists (select 1 from public.reservations r where r.quote_id = v_devis.id) then
    raise exception 'Ce devis a déjà été accepté.' using errcode = 'DV003';
  end if;

  if now() > v_devis.expires_at then
    raise exception 'Ce devis a expiré : demandez-en un nouveau.' using errcode = 'DV001';
  end if;

  select public.debut_periode(a.period_anchor) into v_debut
  from public.studio_subscriptions a
  where a.studio_id = v_devis.studio_id;
  select * into v_plan from public.plan_en_vigueur(v_devis.studio_id);
  select * into v_bareme from public.bareme_en_vigueur(v_devis.studio_id);

  if v_debut is distinct from v_devis.period_start
     or v_plan.id is distinct from v_devis.plan_version_id
     or (v_devis.unit = 'text' and v_bareme.id is distinct from v_devis.rate_version_id) then
    raise exception 'Le plan, le barème ou la période ont changé depuis ce devis : demandez-en un nouveau.'
      using errcode = 'DV001';
  end if;

  v_allocation := public.allocation_du_plan(v_plan, v_devis.unit);
  v_disponible := greatest(
    v_allocation - public.unites_engagees(v_devis.studio_id, v_devis.unit, v_devis.period_start),
    0
  );

  if v_devis.quantity > v_disponible then
    raise exception 'Quota insuffisant pour cette période : l''action demande %, il reste % sur %.',
      v_devis.quantity, v_disponible, v_allocation
      using errcode = '53400';
  end if;

  insert into public.reservations (
    quote_id, studio_id, project_id, action, unit, quantity, period_start,
    idempotency_key, fingerprint, created_by
  )
  values (
    v_devis.id, v_devis.studio_id, v_devis.project_id, v_devis.action, v_devis.unit,
    v_devis.quantity, v_devis.period_start, p_idempotency_key, v_devis.fingerprint,
    (select auth.uid())
  )
  returning * into v_reservation;

  return v_reservation;
end;
$$;

-- ---------------------------------------------------------------------------
-- Règlement
-- ---------------------------------------------------------------------------

-- Impute ce qui a été livré et rend le reste : 0 rend tout, la quantité
-- réservée consomme tout. Rejouer le même règlement renvoie le premier ; en
-- demander un autre est refusé (DV004).
--
-- Aucun compte ne l'exécute : le worker qui la recevra arrive au lot H.
create or replace function public.regler_reservation(p_reservation_id uuid, p_consumed integer)
returns public.reservation_settlements
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_reservation public.reservations;
  v_reglement public.reservation_settlements;
begin
  select * into v_reservation
  from public.reservations r
  where r.id = p_reservation_id
  for update;

  if v_reservation.id is null then
    raise exception 'Réservation introuvable.' using errcode = 'P0002';
  end if;

  select * into v_reglement
  from public.reservation_settlements s
  where s.reservation_id = p_reservation_id;

  if v_reglement.reservation_id is not null then
    if v_reglement.consumed = p_consumed then
      return v_reglement;
    end if;
    raise exception 'Cette réservation est déjà réglée.' using errcode = 'DV004';
  end if;

  if p_consumed is null or p_consumed < 0 or p_consumed > v_reservation.quantity then
    raise exception 'Quantité consommée hors de la réservation : entre 0 et % attendue.',
      v_reservation.quantity
      using errcode = '22023';
  end if;

  insert into public.reservation_settlements (reservation_id, reserved, consumed)
  values (v_reservation.id, v_reservation.quantity, p_consumed)
  returning * into v_reglement;

  return v_reglement;
end;
$$;

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
      'changement_plan_studio',
      'publication_bareme'
    )
  );

create or replace function public.journaliser_publication_bareme()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is not null then
    perform public.journaliser(
      'publication_bareme',
      null,
      jsonb_build_object('version', new.version_number)
    );
  end if;
  return null;
end;
$$;

create trigger text_unit_rate_versions_journal
  after insert on public.text_unit_rate_versions
  for each row
  execute function public.journaliser_publication_bareme();

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.numeroter_version_bareme() from public, anon, authenticated;
revoke all on function public.version_bareme_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.bareme_en_vigueur(uuid) from public, anon, authenticated;
revoke all on function public.duree_validite_devis() from public, anon, authenticated;
revoke all on function public.registre_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.peut_engager_unites(uuid) from public, anon, authenticated;
revoke all on function public.unites_engagees(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.empreinte_demande(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.parametre_entier(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.allocation_du_plan(public.plan_versions, text) from public, anon, authenticated;
revoke all on function public.regler_reservation(uuid, integer) from public, anon, authenticated;
revoke all on function public.journaliser_publication_bareme() from public, anon, authenticated;

revoke all on function public.creer_devis(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.creer_devis(uuid, text, jsonb) to authenticated;
revoke all on function public.accepter_devis(uuid, text) from public, anon, authenticated;
grant execute on function public.accepter_devis(uuid, text) to authenticated;
