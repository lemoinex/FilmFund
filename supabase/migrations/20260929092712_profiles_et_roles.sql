-- Profils utilisateurs et rôles.
--
-- Règle du projet : la RLS est activée dans la migration qui crée la table,
-- avec ses politiques. L'ajouter après coup sur une table déjà peuplée coûte
-- bien plus cher, et laisse une fenêtre où tout est lisible par tous.

-- ---------------------------------------------------------------------------
-- Rôles applicatifs
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('member', 'admin');

-- ---------------------------------------------------------------------------
-- Profils
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint display_name_longueur check (char_length(display_name) <= 120)
);

comment on table public.profiles is
  'Profil applicatif, un par compte auth.users. Le rôle vit ici, jamais dans les métadonnées du jeton : celles-ci sont modifiables par l''utilisateur.';

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------------
-- Lecture du rôle
-- ---------------------------------------------------------------------------

-- `security definer` : la fonction lit profiles en contournant la RLS, sans
-- quoi la politique d'administration s'appellerait elle-même en boucle.
-- `search_path` figé : sans cela, un schéma malveillant en tête de chemin
-- pourrait détourner l'appel.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Politiques sur les profils
-- ---------------------------------------------------------------------------

create policy "Un utilisateur lit son propre profil"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Un administrateur lit tous les profils"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "Un utilisateur modifie son propre profil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Un administrateur modifie tous les profils"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Ni insert ni delete : le profil naît avec le compte et meurt avec lui,
-- par le déclencheur ci-dessous et la cascade de la clé étrangère.

-- ---------------------------------------------------------------------------
-- Interdiction de s'auto-promouvoir
-- ---------------------------------------------------------------------------

-- Sans ce garde-fou, la politique « un utilisateur modifie son propre profil »
-- suffirait à n'importe qui pour passer son propre rôle à 'admin'. C'est le
-- défaut le plus courant sur ce schéma.
create or replace function public.empecher_changement_de_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_avant_update
  before update on public.profiles
  for each row
  execute function public.empecher_changement_de_role();

-- ---------------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Le nom vient des métadonnées d'inscription ; à défaut, la partie
    -- locale de l'adresse e-mail. Jamais le rôle : il n'est pas négociable
    -- par le client.
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
