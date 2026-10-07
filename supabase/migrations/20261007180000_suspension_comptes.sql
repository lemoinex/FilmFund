-- Suspension d'un compte (lot V2a).
--
-- Un compte suspendu garde ses données et peut encore se connecter, mais ne
-- lit ni n'écrit plus rien : ni table, ni fonction, ni fichier, et ses tâches
-- en attente ne sont pas exécutées. Le rétablir lui rend tout, tel quel.
--
-- Pourquoi pas une politique de plus sur chaque table : trente-quatre
-- fonctions `security definer` sont appelables par un compte, et la RLS ne
-- les ferme pas. Il faudrait un contrôle dans chacune, et dans chaque
-- fonction à venir. La suspension se joue donc en trois endroits, un par
-- chemin d'accès :
--   1. l'API (tables et fonctions) : PostgREST appelle
--      `controle_avant_requete()` avant chaque requête ;
--   2. le stockage, que ce contrôle ne couvre pas : une politique restrictive
--      sur `storage.objects` ;
--   3. le worker, qui ne passe pas par l'API : `peut_engager_unites_pour()`,
--      déjà consultée quand il réclame une tâche, refuse un auteur suspendu.
--
-- L'état vit dans une table à part, et non dans `profiles` : chaque compte
-- modifie son propre profil.
--
-- Ce que la suspension ne fait pas : elle ne ferme pas la session chez
-- Supabase Auth — le compte se connecte et change son mot de passe —, elle
-- n'interrompt pas une tâche déjà en cours d'exécution, et un lien signé déjà
-- émis vers un fichier reste valable jusqu'à son expiration.
--
-- Garde-fous : un administrateur ne se suspend pas, et aucun administrateur
-- ne peut être suspendu — il faut d'abord lui retirer son rôle. Un compte
-- suspendu ne devient pas administrateur. L'administration ne peut donc pas
-- se fermer la porte.
--
-- Le mode privé ne gèle pas la suspension, contrairement aux rôles : fermer
-- un compte doit rester possible à tout moment.
--
-- Retour arrière, dans cet ordre — le premier pas suffit à tout rouvrir :
--   alter role authenticator reset pgrst.db_pre_request;
--   notify pgrst, 'reload config';
--   drop policy "Compte suspendu : aucun accès" on storage.objects;
--   rétablir `peut_engager_unites_pour()` depuis la migration
--     20261001061231_taches.sql ;
--   drop trigger profiles_pas_admin_suspendu on public.profiles;
--   drop table public.account_suspensions;
--   drop function public.controle_avant_requete(), public.compte_suspendu(),
--     public.marquer_suspension(), public.journaliser_retablissement(),
--     public.refuser_admin_suspendu();
-- Les entrées du journal restent : un journal d'audit ne s'efface pas.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.account_suspensions (
  -- Une ligne par compte suspendu ; la retirer le rétablit. L'historique est
  -- au journal d'administration.
  user_id uuid primary key references public.profiles (id) on delete cascade,
  reason text not null,
  suspended_by uuid references public.profiles (id) on delete set null,
  suspended_at timestamptz not null default now(),

  constraint reason_forme check (
    char_length(reason) between 10 and 500 and reason !~ '[[:cntrl:]]'
  )
);

comment on table public.account_suspensions is
  'Comptes suspendus : une ligne par compte, retirée au rétablissement. Lue et écrite par les seuls administrateurs ; le motif n''est jamais montré au compte.';

alter table public.account_suspensions enable row level security;

create policy "Les administrateurs lisent les suspensions"
  on public.account_suspensions for select
  to authenticated
  using ((select public.is_admin()));

create policy "Les administrateurs suspendent un compte"
  on public.account_suspensions for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Les administrateurs rétablissent un compte"
  on public.account_suspensions for delete
  to authenticated
  using ((select public.is_admin()));

-- Aucune politique de modification : un motif ne se réécrit pas. Pour le
-- changer, rétablir puis suspendre de nouveau — deux entrées au journal.

create policy "Mode privé : administrateurs uniquement"
  on public.account_suspensions
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Ni l'auteur ni la date ne se fournissent : le déclencheur les fixe.
revoke all on table public.account_suspensions from anon, authenticated;
grant select, delete on table public.account_suspensions to authenticated;
grant insert (user_id, reason) on table public.account_suspensions to authenticated;

-- ---------------------------------------------------------------------------
-- Journal d'administration : deux actions de plus
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
      'publication_bareme',
      'rapprochement_travail',
      'plafond_ia',
      'cle_fournisseur',
      'publication_ponderations',
      'opportunite',
      'veille_opportunites',
      'suspension_compte',
      'retablissement_compte'
    )
  );

-- ---------------------------------------------------------------------------
-- Suspendre : garde-fous et trace, dans la même transaction
-- ---------------------------------------------------------------------------

-- `security definer` : elle lit le rôle du compte visé et appelle
-- journaliser(), que les comptes n'exécutent pas. `auth.uid()` reste celui de
-- l'appelant ; nul, c'est l'exploitant en SQL direct.
create function public.marquer_suspension()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.user_id = (select auth.uid()) then
    raise exception 'Un administrateur ne suspend pas son propre compte.'
      using errcode = '42501';
  end if;

  -- Vaut pour tous, exploitant compris : c'est ce qui garantit qu'il reste
  -- toujours un administrateur pour rétablir les autres.
  if exists (
    select 1 from public.profiles p where p.id = new.user_id and p.role = 'admin'
  ) then
    raise exception 'Un administrateur ne peut pas être suspendu : retirez d''abord son rôle.'
      using errcode = '42501';
  end if;

  new.reason := btrim(new.reason);
  new.suspended_by := (select auth.uid());
  new.suspended_at := now();

  -- Le motif entre au journal : il doit rester lisible après le
  -- rétablissement, qui retire la ligne.
  perform public.journaliser(
    'suspension_compte',
    null,
    jsonb_build_object('compte', new.user_id, 'motif', new.reason)
  );

  return new;
end;
$$;

create trigger account_suspensions_avant_insert
  before insert on public.account_suspensions
  for each row
  execute function public.marquer_suspension();

-- `pg_trigger_depth() = 1` écarte la cascade : supprimer un compte emporte sa
-- suspension, ce qui n'est pas un rétablissement.
create function public.journaliser_retablissement()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if pg_trigger_depth() = 1 then
    perform public.journaliser(
      'retablissement_compte',
      null,
      jsonb_build_object('compte', old.user_id)
    );
  end if;
  return old;
end;
$$;

create trigger account_suspensions_avant_delete
  before delete on public.account_suspensions
  for each row
  execute function public.journaliser_retablissement();

-- Un compte suspendu ne devient pas administrateur : sans cela, un
-- administrateur se retrouverait suspendu par un simple changement de rôle.
create function public.refuser_admin_suspendu()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.role = 'admin' and old.role is distinct from new.role
     and exists (select 1 from public.account_suspensions s where s.user_id = new.id) then
    raise exception 'Ce compte est suspendu : rétablissez-le avant de lui donner le rôle d''administrateur.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_pas_admin_suspendu
  before update of role on public.profiles
  for each row
  execute function public.refuser_admin_suspendu();

revoke all on function public.marquer_suspension() from public, anon, authenticated;
revoke all on function public.journaliser_retablissement() from public, anon, authenticated;
revoke all on function public.refuser_admin_suspendu() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lecture de l'état : le compte appelant est-il suspendu ?
-- ---------------------------------------------------------------------------

-- `security definer` : un compte ne lit pas la table, donc pas son motif. La
-- fonction ne dit qu'oui ou non, et seulement pour l'appelant.
create function public.compte_suspendu()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.account_suspensions s where s.user_id = (select auth.uid())
  );
$$;

revoke all on function public.compte_suspendu() from public, anon, authenticated;
grant execute on function public.compte_suspendu() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. L'API : contrôle avant chaque requête
-- ---------------------------------------------------------------------------

-- Appelée par PostgREST avant toute requête, visiteurs compris : elle doit
-- rester minuscule, et ne jamais échouer pour une autre raison que celle
-- qu'elle annonce. Sans session, elle ne lit rien. `security invoker` : elle
-- est exécutable par un visiteur, ce qu'une fonction privilégiée ne doit
-- jamais être ; la lecture privilégiée est dans compte_suspendu(), que seul
-- un compte connecté atteint.
--
-- Code propre, que l'application reconnaît sans lire le message.
create function public.controle_avant_requete()
returns void
language plpgsql
stable
set search_path = pg_catalog, public
as $$
begin
  -- Deux instructions, et non une condition en « et » : PostgreSQL vérifie le
  -- droit d'exécuter compte_suspendu() dès qu'il prépare l'expression qui la
  -- nomme, même si elle n'est jamais évaluée. En une seule condition, tout
  -- visiteur serait refusé — et la vitrine avec lui.
  if (select auth.uid()) is null then
    return;
  end if;

  if public.compte_suspendu() then
    raise exception 'Ce compte est suspendu.' using errcode = 'CS001';
  end if;
end;
$$;

comment on function public.controle_avant_requete() is
  'Appelée par PostgREST avant chaque requête (pgrst.db_pre_request) : refuse tout à un compte suspendu, sous le code CS001.';

revoke all on function public.controle_avant_requete() from public;
grant execute on function public.controle_avant_requete() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.controle_avant_requete';
notify pgrst, 'reload config';

-- ---------------------------------------------------------------------------
-- 2. Le stockage, que le contrôle de l'API ne couvre pas
-- ---------------------------------------------------------------------------

-- Tous compartiments confondus, existants et à venir.
create policy "Compte suspendu : aucun accès"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (not (select public.compte_suspendu()))
  with check (not (select public.compte_suspendu()));

-- ---------------------------------------------------------------------------
-- 3. Le worker : une tâche en attente d'un auteur suspendu n'est pas exécutée
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot H1, une condition de plus. Elle est consultée par
-- reclamer_travail(), sous les droits de son propriétaire : la tâche est alors
-- close « Droits de l'auteur retirés avant l'exécution », et ses unités
-- rendues. Aucun compte ne l'exécute directement : ses droits, retirés au lot
-- H1, ne changent pas ici.
create or replace function public.peut_engager_unites_pour(p_user uuid, p_project_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  with auteur as (
    select exists (
      select 1 from public.profiles pr where pr.id = p_user and pr.role = 'admin'
    ) as admin
  )
  select coalesce(
    p_user is not null
    and exists (select 1 from public.projects p where p.id = p_project_id)
    and (not public.mode_prive() or auteur.admin)
    and not exists (select 1 from public.account_suspensions s where s.user_id = p_user)
    and (
      exists (
        select 1 from public.projects p
        where p.id = p_project_id and p.owner_id = p_user
      )
      or exists (
        select 1 from public.project_members m
        where m.project_id = p_project_id and m.user_id = p_user and m.role = 'editor'
      )
      or auteur.admin
    ),
    false
  )
  from auteur;
$$;
