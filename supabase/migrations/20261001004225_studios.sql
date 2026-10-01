-- Studios : une organisation au-dessus des projets.
--
-- Décisions de l'utilisateur (1er octobre 2026) :
--   - chaque compte reçoit automatiquement un studio personnel, dont il est
--     propriétaire — à l'inscription, et ici même pour les comptes existants ;
--   - tout projet appartient à un studio, déduit côté serveur et jamais reçu
--     du navigateur, et n'en change plus ;
--   - tout membre d'un studio peut y créer un projet ;
--   - l'isolation par projet est conservée à l'intérieur d'un studio : le
--     propriétaire d'un studio ne voit rien d'un projet dont il ne fait pas
--     partie de l'équipe. `acces_au_projet()` est donc inchangée, et un
--     collaborateur de projet n'a pas à être membre du studio ;
--   - socle seul : aucun écran ni invitation de studio dans ce lot. Les
--     adhésions ne s'écrivent que par l'administration (journalisée) ou par
--     les déclencheurs ci-dessous.
--
-- Les administrateurs globaux gardent l'accès à tout (règle du projet ; la
-- question de l'accès du support reste ouverte).
--
-- Retour arrière : la colonne `projects.studio_id`, les déclencheurs et les
-- politiques peuvent être retirés ; les tables `studios` et `studio_members`
-- ensuite, sans perte pour les projets. Aucune donnée existante n'est
-- modifiée hors du rattachement des projets à leur studio.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create type public.studio_role as enum ('owner', 'member');

create table public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Titulaire du studio personnel ; nul pour un studio partagé, à venir.
  -- Un compte n'a qu'un studio personnel, qui disparaît avec lui.
  personal_owner_id uuid unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint studio_nom_non_vide check (char_length(btrim(name)) between 1 and 120)
);

comment on table public.studios is
  'Organisation au-dessus des projets. Lue par ses membres et les administrateurs ; écrite par les administrateurs et par les déclencheurs.';

create table public.studio_members (
  studio_id uuid not null references public.studios (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.studio_role not null default 'member',
  created_at timestamptz not null default now(),

  primary key (studio_id, user_id)
);

comment on table public.studio_members is
  'Adhésions aux studios. Être membre permet d''y créer des projets ; cela ne donne accès à aucun projet dont on n''est pas l''équipe.';

-- Les studios d'un compte se cherchent par compte.
create index studio_members_user_id_idx on public.studio_members (user_id);

alter table public.studios enable row level security;
alter table public.studio_members enable row level security;

-- ---------------------------------------------------------------------------
-- Rôle de l'utilisateur courant dans un studio
-- ---------------------------------------------------------------------------

-- Security definer : appelée par les politiques de `studio_members`, elle
-- lirait sinon la table qu'elle protège, et bouclerait.
create or replace function public.role_dans_studio(p_studio_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select m.role::text
  from public.studio_members m
  where m.studio_id = p_studio_id
    and m.user_id = (select auth.uid());
$$;

revoke all on function public.role_dans_studio(uuid) from public, anon, authenticated;
grant execute on function public.role_dans_studio(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "Les membres et les administrateurs lisent le studio"
  on public.studios for select
  to authenticated
  using (public.role_dans_studio(id) is not null or (select public.is_admin()));

create policy "Les administrateurs créent des studios"
  on public.studios for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Les administrateurs modifient les studios"
  on public.studios for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Les administrateurs suppriment des studios"
  on public.studios for delete
  to authenticated
  using ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.studios
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

create policy "Les membres et les administrateurs lisent les adhésions"
  on public.studio_members for select
  to authenticated
  using (public.role_dans_studio(studio_id) is not null or (select public.is_admin()));

create policy "Les administrateurs ajoutent des membres"
  on public.studio_members for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Les administrateurs modifient les adhésions"
  on public.studio_members for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Les administrateurs retirent des membres"
  on public.studio_members for delete
  to authenticated
  using ((select public.is_admin()));

create policy "Mode privé : administrateurs uniquement"
  on public.studio_members
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.studios from anon;
revoke all on table public.studio_members from anon;

-- ---------------------------------------------------------------------------
-- Studio personnel
-- ---------------------------------------------------------------------------

-- Créé avec le profil, donc à l'inscription.
create or replace function public.creer_studio_personnel()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  studio uuid;
begin
  insert into public.studios (name, personal_owner_id)
  values ('Studio personnel', new.id)
  returning id into studio;

  insert into public.studio_members (studio_id, user_id, role)
  values (studio, new.id, 'owner');

  return null;
end;
$$;

create trigger profiles_studio_personnel
  after insert on public.profiles
  for each row
  execute function public.creer_studio_personnel();

-- Un studio personnel garde son titulaire, propriétaire, et n'est jamais
-- supprimé directement : sans lui, son titulaire ne pourrait plus créer de
-- projet. Il ne disparaît qu'avec le compte, en cascade — donc à une
-- profondeur de déclencheur supérieure à 1.
create or replace function public.proteger_studio_personnel()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'studios' then
    if old.personal_owner_id is not null
       and (tg_op = 'DELETE' or new.personal_owner_id is distinct from old.personal_owner_id) then
      raise exception 'Un studio personnel ne se supprime ni ne change de titulaire.'
        using errcode = '42501';
    end if;
  elsif exists (
    select 1 from public.studios s
    where s.id = old.studio_id
      and s.personal_owner_id = old.user_id
  ) and (
    tg_op = 'DELETE'
    or new.role <> 'owner'
    or new.user_id <> old.user_id
    or new.studio_id <> old.studio_id
  ) then
    raise exception 'Le titulaire d''un studio personnel en reste propriétaire.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger studios_personnel_protege
  before update or delete on public.studios
  for each row
  execute function public.proteger_studio_personnel();

create trigger studio_members_titulaire_protege
  before update or delete on public.studio_members
  for each row
  execute function public.proteger_studio_personnel();

-- ---------------------------------------------------------------------------
-- Reprise de l'existant : un studio personnel par compte
-- ---------------------------------------------------------------------------

insert into public.studios (name, personal_owner_id)
select 'Studio personnel', p.id
from public.profiles p;

insert into public.studio_members (studio_id, user_id, role)
select s.id, s.personal_owner_id, 'owner'
from public.studios s
where s.personal_owner_id is not null;

-- ---------------------------------------------------------------------------
-- Projets rattachés à un studio
-- ---------------------------------------------------------------------------

alter table public.projects
  add column studio_id uuid references public.studios (id);

comment on column public.projects.studio_id is
  'Studio du projet, déduit à la création (studio personnel du porteur par défaut) et immuable par l''application.';

create index projects_studio_id_idx on public.projects (studio_id);

-- Rattachement des projets existants au studio personnel de leur porteur.
-- La date de modification n'est pas touchée : ce n'est pas une modification
-- du projet.
alter table public.projects disable trigger projects_avant_update;

update public.projects p
set studio_id = s.id
from public.studios s
where s.personal_owner_id = p.owner_id;

alter table public.projects enable trigger projects_avant_update;

alter table public.projects alter column studio_id set not null;

-- Valeur par défaut : le studio personnel de l'utilisateur courant, lu sous
-- sa propre RLS (security invoker). Elle rend la colonne facultative à la
-- création pour l'application, qui n'a pas à connaître son studio.
create or replace function public.studio_personnel_courant()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select s.id
  from public.studios s
  where s.personal_owner_id = (select auth.uid());
$$;

revoke all on function public.studio_personnel_courant() from public, anon;
grant execute on function public.studio_personnel_courant() to authenticated;

alter table public.projects
  alter column studio_id set default public.studio_personnel_courant();

-- Sans utilisateur courant (SQL direct), la valeur par défaut est nulle : le
-- déclencheur prend alors le studio personnel du porteur. Un studio précisé
-- n'est jamais cru sur parole : la politique restrictive ci-dessous exige
-- d'en être membre.
create or replace function public.studio_par_defaut()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.studio_id is null then
    select s.id into new.studio_id
    from public.studios s
    where s.personal_owner_id = new.owner_id;
  end if;

  return new;
end;
$$;

create trigger projects_studio_par_defaut
  before insert on public.projects
  for each row
  execute function public.studio_par_defaut();

-- Même règle que pour le porteur : l'application ne déplace pas un projet
-- d'un studio à l'autre ; l'exploitant, en SQL direct, le peut.
create or replace function public.empecher_changement_de_studio()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.studio_id is distinct from old.studio_id
     and (select auth.uid()) is not null then
    raise exception 'Un projet ne change pas de studio.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger projects_studio_immuable
  before update on public.projects
  for each row
  execute function public.empecher_changement_de_studio();

-- Restrictive : s'ajoute aux politiques de création existantes sans les
-- réécrire. Évaluée après le déclencheur, donc sur le studio effectif.
create policy "Un projet naît dans un studio dont on est membre"
  on public.projects
  as restrictive
  for insert
  to authenticated
  with check (public.role_dans_studio(studio_id) is not null or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Journal : interventions de l'administration dans les studios
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
      'intervention_studio'
    )
  );

-- Écriture d'un administrateur dans un studio dont il n'est pas membre.
-- Les déclencheurs (studio personnel, cascades) écrivent à une profondeur
-- supérieure à 1 et ne sont pas journalisés.
create or replace function public.journaliser_intervention_studio()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ligne jsonb := to_jsonb(coalesce(new, old));
  studio uuid := coalesce((ligne ->> 'studio_id')::uuid, (ligne ->> 'id')::uuid);
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and public.is_admin()
     and public.role_dans_studio(studio) is null then
    perform public.journaliser(
      'intervention_studio',
      null,
      jsonb_build_object(
        'table', tg_table_name,
        'operation', lower(tg_op),
        'studio', studio,
        'compte', ligne ->> 'user_id'
      )
    );
  end if;
  return coalesce(new, old);
end;
$$;

create trigger studios_journal_admin
  before insert or update or delete on public.studios
  for each row
  execute function public.journaliser_intervention_studio();

create trigger studio_members_journal_admin
  before insert or update or delete on public.studio_members
  for each row
  execute function public.journaliser_intervention_studio();

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.creer_studio_personnel() from public, anon, authenticated;
revoke all on function public.proteger_studio_personnel() from public, anon, authenticated;
revoke all on function public.studio_par_defaut() from public, anon, authenticated;
revoke all on function public.empecher_changement_de_studio() from public, anon, authenticated;
revoke all on function public.journaliser_intervention_studio() from public, anon, authenticated;
