-- Mode privé temporaire : l'application réservée aux administrateurs.
--
-- Tant que le mode privé est actif :
--   - seuls les administrateurs (public.is_admin()) lisent et écrivent les
--     données ; tout autre compte connecté ne voit plus rien ;
--   - la gestion des membres (inviter, accepter une invitation, modifier ou
--     retirer un membre) est réservée aux administrateurs ;
--   - personne, administrateurs compris, ne peut changer un rôle applicatif.
--
-- Migration strictement additive : aucune table, fonction, politique ou
-- déclencheur existant n'est modifié ni supprimé. Les protections ajoutées
-- se superposent aux règles en place.
--
-- L'interrupteur vit en base, et non dans cette migration : le verrou
-- s'active et se lève par une simple mise à jour de public.app_settings,
-- sans nouvelle migration. Il est INACTIF par défaut, pour deux raisons :
--   1. l'activer avant que les comptes autorisés soient administrateurs
--      fermerait l'application à tout le monde, eux compris ;
--   2. les tests d'intégration éprouvent les règles historiques, qui
--      doivent rester intactes quand le mode privé est levé.
--
-- Activation (SQL Editor, après vérification des administrateurs) :
--   update public.app_settings set private_admin_only = true where id;
--
-- Retrait complet : voir supabase/rollbacks/ et docs/mode-prive.md.

-- ---------------------------------------------------------------------------
-- Interrupteur
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  -- Une seule ligne possible : la clé primaire est un booléen contraint à vrai.
  id boolean primary key default true,
  private_admin_only boolean not null default false,
  updated_at timestamptz not null default now(),

  constraint une_seule_ligne check (id)
);

comment on table public.app_settings is
  'Réglages globaux de l''application, une seule ligne. Modifiable uniquement par SQL direct : aucune politique d''écriture.';

comment on column public.app_settings.private_admin_only is
  'Mode privé : quand vrai, seuls les administrateurs accèdent aux données, et la gestion des membres est gelée.';

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Lecture seule pour les comptes connectés : les politiques et déclencheurs
-- ci-dessous s'exécutent avec leurs droits et doivent lire l'interrupteur.
-- Le révéler n'apprend rien d'exploitable.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'app_settings'
      and policyname = 'Les comptes connectés lisent les réglages'
  ) then
    create policy "Les comptes connectés lisent les réglages"
      on public.app_settings for select
      to authenticated
      using (true);
  end if;
end;
$$;

revoke all on table public.app_settings from anon;
revoke insert, update, delete, truncate on table public.app_settings from authenticated;

-- ---------------------------------------------------------------------------
-- Lecture de l'interrupteur
-- ---------------------------------------------------------------------------

-- `security invoker` (le défaut) : la table est lisible par authenticated,
-- aucun privilège supplémentaire n'est nécessaire. En l'absence de ligne, le
-- mode privé est considéré comme inactif — l'état historique.
create or replace function public.mode_prive()
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select s.private_admin_only from public.app_settings s where s.id),
    false
  );
$$;

revoke all on function public.mode_prive() from public, anon;
grant execute on function public.mode_prive() to authenticated;

-- ---------------------------------------------------------------------------
-- Politiques restrictives : données réservées aux administrateurs
-- ---------------------------------------------------------------------------

-- Une politique RESTRICTIVE s'ajoute aux politiques permissives existantes
-- par un ET : elle ne donne aucun droit, elle en retire. Mode privé levé,
-- sa condition est toujours vraie et rien ne change.
--
-- `(select ...)` : la fonction est évaluée une fois par requête et non une
-- fois par ligne.
do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'profiles',
    'projects',
    'project_members',
    'project_invitations',
    'project_budgets',
    'budget_lines'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = nom_table
        and policyname = 'Mode privé : administrateurs uniquement'
    ) then
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
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gestion des membres réservée aux administrateurs
-- ---------------------------------------------------------------------------

-- Un déclencheur plutôt qu'une politique : accepter_invitation et
-- refuser_invitation sont `security definer` et contournent la RLS, pas les
-- déclencheurs.
--
-- Trois exemptions :
--   - les administrateurs, qui gardent la main sur les équipes ;
--   - `auth.uid()` nul : requête SQL directe de l'exploitant, qui garde la
--     main sur la base (même règle que pour les rôles) ;
--   - `pg_trigger_depth() > 1` : suppression en cascade. Supprimer un projet
--     emporte son équipe et ses invitations ; le bloquer empêcherait les
--     administrateurs de supprimer un projet, ce qui doit rester possible.
create or replace function public.geler_gestion_membres()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.mode_prive()
     and (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and not public.is_admin() then
    raise exception 'La gestion des membres est temporairement désactivée.'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

create or replace trigger project_members_mode_prive
  before insert or update or delete on public.project_members
  for each row
  execute function public.geler_gestion_membres();

create or replace trigger project_invitations_mode_prive
  before insert or update or delete on public.project_invitations
  for each row
  execute function public.geler_gestion_membres();

-- ---------------------------------------------------------------------------
-- Gel des rôles
-- ---------------------------------------------------------------------------

-- Couvre la modification directe du profil comme definir_role(), qui passe
-- par un UPDATE de profiles. Le déclencheur existant profiles_avant_update
-- reste en place et inchangé ; celui-ci s'y ajoute.
create or replace function public.geler_roles()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if public.mode_prive()
     and new.role is distinct from old.role
     and (select auth.uid()) is not null then
    raise exception 'Les changements de rôle sont temporairement désactivés.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace trigger profiles_roles_mode_prive
  before update on public.profiles
  for each row
  execute function public.geler_roles();

-- Fonctions de déclencheur : jamais appelables directement.
revoke all on function public.geler_gestion_membres() from public, anon, authenticated;
revoke all on function public.geler_roles() from public, anon, authenticated;
