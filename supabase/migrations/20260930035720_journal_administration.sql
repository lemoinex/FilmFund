-- Journal des actions d'administration.
--
-- Trace qui a fait quoi, et quand, pour les actions sensibles :
--   - changement de rôle applicatif (member ↔ admin) ;
--   - modification du profil d'un autre compte ;
--   - bascule du mode privé ;
--   - suppression d'un projet par un administrateur qui n'en est pas le
--     porteur, ou par l'exploitant en SQL direct ;
--   - écriture d'un administrateur dans le contenu d'un projet dont il n'est
--     pas membre (budget, documents, storyboard, planning, financements,
--     équipe).
--
-- Ce dernier cas est ouvert par peut_editer_contenu() et peut_gerer_budget(),
-- qui donnent aux administrateurs la main sur le contenu de tout projet. Le
-- déclencheur porte sur chaque table de contenu, et non sur ces fonctions :
-- une politique future qui ouvrirait la même porte autrement serait
-- journalisée d'office.
--
-- Journalisation en base, par déclencheurs, et non dans l'application :
-- c'est le seul endroit qui voit aussi les actions faites en SQL direct —
-- la bascule du mode privé ou la promotion d'un compte passent par là.
-- Chaque entrée s'écrit AVANT l'écriture qu'elle décrit, dans la même
-- transaction : une action ne peut pas aboutir sans sa trace. Une
-- tentative que la base refuse n'est pas une action, et ne laisse rien.
--
-- Les lectures ne sont pas journalisées, et aucun contenu d'œuvre n'est
-- recopié dans le journal : il dit qu'un document a été modifié, pas ce
-- qu'il contient.
--
-- Retour arrière : les déclencheurs peuvent être retirés ; la table, jamais.
-- Un journal d'audit ne s'efface pas.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- Pas de clé étrangère, ni vers les comptes ni vers les projets. Avec
  -- `on delete set null`, supprimer un compte modifierait le journal, ce que
  -- sa protection refuserait ; avec `on delete cascade`, supprimer un projet
  -- effacerait sa trace. Les identifiants restent tels quels.
  --
  -- Nul : action faite hors de l'application, par l'exploitant — en SQL
  -- direct ou avec la clé secrète, que l'application n'emploie pas.
  actor_id uuid,
  action text not null,
  project_id uuid,
  details jsonb not null default '{}',

  constraint action_connue check (
    action in (
      'changement_role',
      'modification_profil',
      'mode_prive',
      'suppression_projet',
      'intervention_contenu'
    )
  )
);

comment on table public.admin_audit_log is
  'Journal des actions d''administration, en ajout seul. Lisible par les administrateurs ; jamais modifié ni supprimé.';

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

create policy "Les administrateurs lisent le journal"
  on public.admin_audit_log for select
  to authenticated
  using ((select public.is_admin()));

-- Aucune politique d'écriture : seules les fonctions de journalisation
-- ci-dessous, exécutées avec les droits de leur propriétaire, y écrivent.

create policy "Mode privé : administrateurs uniquement"
  on public.admin_audit_log
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

revoke all on table public.admin_audit_log from anon, authenticated;
grant select on table public.admin_audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Ajout seul
-- ---------------------------------------------------------------------------

-- Refusé à tous, rôle de service et SQL direct compris : les privilèges ne
-- suffisent pas, le propriétaire de la table les contourne.
create or replace function public.journal_en_ajout_seul()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Le journal d''administration ne se modifie ni ne se supprime.'
    using errcode = '42501';
end;
$$;

create trigger admin_audit_log_ajout_seul
  before update or delete on public.admin_audit_log
  for each row
  execute function public.journal_en_ajout_seul();

create trigger admin_audit_log_pas_de_vidage
  before truncate on public.admin_audit_log
  for each statement
  execute function public.journal_en_ajout_seul();

-- ---------------------------------------------------------------------------
-- Écriture dans le journal
-- ---------------------------------------------------------------------------

-- Seul point d'écriture. Jamais exécutable par un compte : sinon n'importe
-- quel administrateur pourrait fabriquer des entrées.
create or replace function public.journaliser(
  p_action text,
  p_project_id uuid,
  p_details jsonb
)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  insert into public.admin_audit_log (actor_id, action, project_id, details)
  values ((select auth.uid()), p_action, p_project_id, coalesce(p_details, '{}'));
$$;

-- ---------------------------------------------------------------------------
-- Déclencheurs de journalisation
-- ---------------------------------------------------------------------------

-- Toutes `security definer` : elles appellent journaliser(), que les comptes
-- ne peuvent pas exécuter. `auth.uid()` reste celui de l'appelant : il est
-- lu dans la requête, pas dans l'identité SQL.

-- Profils : tout changement de rôle, quel qu'en soit l'auteur ; toute autre
-- modification du profil d'un compte par quelqu'un d'autre que lui. Seuls
-- les noms des champs modifiés sont retenus, pas leurs valeurs.
create or replace function public.journaliser_profil()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  champs text[];
begin
  if old.role is distinct from new.role then
    perform public.journaliser(
      'changement_role',
      null,
      jsonb_build_object('compte', new.id, 'ancien_role', old.role, 'nouveau_role', new.role)
    );
  end if;

  select array_agg(avant.key order by avant.key) into champs
  from jsonb_each(to_jsonb(old)) avant
  join jsonb_each(to_jsonb(new)) apres using (key)
  where avant.value is distinct from apres.value
    and avant.key not in ('role', 'updated_at');

  if champs is not null
     and new.id is distinct from (select auth.uid()) then
    perform public.journaliser(
      'modification_profil',
      null,
      jsonb_build_object('compte', new.id, 'champs', to_jsonb(champs))
    );
  end if;

  return new;
end;
$$;

create trigger profiles_journal
  before update on public.profiles
  for each row
  execute function public.journaliser_profil();

-- Bascule du mode privé.
create or replace function public.journaliser_mode_prive()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.journaliser(
    'mode_prive',
    null,
    jsonb_build_object('actif', new.private_admin_only)
  );
  return new;
end;
$$;

create trigger app_settings_journal_mode_prive
  before update of private_admin_only on public.app_settings
  for each row
  when (old.private_admin_only is distinct from new.private_admin_only)
  execute function public.journaliser_mode_prive();

-- Suppression d'un projet : par un administrateur qui n'en est pas le
-- porteur, ou par l'exploitant en SQL direct. Un porteur qui supprime son
-- propre projet n'exerce aucun pouvoir d'administration.
create or replace function public.journaliser_suppression_projet()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null
     or (public.is_admin() and old.owner_id <> (select auth.uid())) then
    perform public.journaliser(
      'suppression_projet',
      old.id,
      jsonb_build_object('titre', old.title, 'porteur', old.owner_id)
    );
  end if;
  return old;
end;
$$;

create trigger projects_journal_suppression
  before delete on public.projects
  for each row
  execute function public.journaliser_suppression_projet();

-- Écriture d'un administrateur dans un projet dont il n'est pas membre.
--
-- Commune à toutes les tables de contenu : elle lit project_id sur la ligne,
-- quelle que soit la table. `pg_trigger_depth() = 1` écarte les suppressions
-- en cascade : supprimer un projet est journalisé une fois, et non une fois
-- par ligne de budget ou par scène qu'il emporte.
--
-- Un administrateur qui répond à une invitation qui lui est adressée agit
-- comme n'importe quel invité, pas en administrateur : ni son invitation
-- ni son entrée dans l'équipe ne sont journalisées.
create or replace function public.journaliser_intervention_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  ligne jsonb := to_jsonb(coalesce(new, old));
  projet uuid := (ligne ->> 'project_id')::uuid;
begin
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and public.is_admin()
     and public.acces_au_projet(projet) is null
     and not (
       tg_table_name = 'project_invitations'
       and ligne ->> 'email' = public.email_confirme_courant()
     )
     and not (
       tg_table_name = 'project_members'
       and tg_op = 'INSERT'
       and (ligne ->> 'user_id')::uuid = (select auth.uid())
       and exists (
         select 1 from public.project_invitations i
         where i.project_id = projet
           and i.email = public.email_confirme_courant()
       )
     ) then
    perform public.journaliser(
      'intervention_contenu',
      projet,
      jsonb_build_object(
        'table', tg_table_name,
        'operation', lower(tg_op),
        'ligne', coalesce(ligne ->> 'id', ligne ->> 'user_id', ligne ->> 'document_id')
      )
    );
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'project_members',
    'project_invitations',
    'project_budgets',
    'budget_lines',
    'project_documents',
    'storyboard_scenes',
    'project_milestones',
    'project_fundings',
    'funding_documents'
  ]
  loop
    execute format(
      $f$
        create trigger %I
          before insert or update or delete on public.%I
          for each row
          execute function public.journaliser_intervention_admin()
      $f$,
      nom_table || '_journal_admin',
      nom_table
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilèges sur les fonctions
-- ---------------------------------------------------------------------------

revoke all on function public.journaliser(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.journal_en_ajout_seul() from public, anon, authenticated;
revoke all on function public.journaliser_profil() from public, anon, authenticated;
revoke all on function public.journaliser_mode_prive() from public, anon, authenticated;
revoke all on function public.journaliser_suppression_projet() from public, anon, authenticated;
revoke all on function public.journaliser_intervention_admin() from public, anon, authenticated;
