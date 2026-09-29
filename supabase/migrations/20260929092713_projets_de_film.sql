-- Projets de film.
--
-- Même règle : RLS activée ici, avec ses politiques. Un projet appartient à
-- son porteur, qui seul y accède tant que le partage d'équipe n'existe pas.

-- ---------------------------------------------------------------------------
-- Énumérations métier
-- ---------------------------------------------------------------------------

create type public.project_format as enum (
  'long_metrage',
  'court_metrage',
  'documentaire',
  'serie',
  'web_serie',
  'animation'
);

create type public.project_stage as enum (
  'idee',
  'developpement',
  'ecriture',
  'preproduction',
  'production',
  'postproduction',
  'termine'
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  format public.project_format not null default 'long_metrage',
  stage public.project_stage not null default 'idee',
  logline text not null default '',
  synopsis text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint title_non_vide check (char_length(btrim(title)) between 1 and 200),
  constraint logline_longueur check (char_length(logline) <= 500),
  constraint synopsis_longueur check (char_length(synopsis) <= 20000)
);

comment on table public.projects is
  'Projet de film porté par un utilisateur. Le partage avec une équipe viendra dans un lot ultérieur, via une table d''appartenance dédiée.';

-- La liste des projets est toujours filtrée par porteur et triée par date :
-- l'index suit cet accès, sans quoi chaque affichage balaierait la table.
create index projects_owner_id_created_at_idx
  on public.projects (owner_id, created_at desc);

alter table public.projects enable row level security;

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "Un utilisateur lit ses projets"
  on public.projects for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Un utilisateur crée ses projets"
  on public.projects for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Un utilisateur modifie ses projets"
  on public.projects for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "Un utilisateur supprime ses projets"
  on public.projects for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- Aucune politique d'administration ici : lire les projets des autres n'est
-- pas nécessaire à l'exploitation du service. Elle sera ajoutée le jour où un
-- besoin précis le justifiera, et pas avant.

-- ---------------------------------------------------------------------------
-- Horodatage de modification
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger projects_avant_update
  before update on public.projects
  for each row
  execute function public.touch_updated_at();
