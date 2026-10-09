-- Épisodes d'une série (lot SE1), sans IA.
--
-- Les formats « série » et « web-série » existaient, mais rien ne traitait une
-- série autrement qu'un film : ni saison, ni épisodes, ni pilote. Décisions du
-- 9 octobre 2026 : une seule saison par projet, un épisode se repère par son
-- numéro, et l'épisode 1 se présente comme le pilote.
--
-- Ce que cette migration ouvre :
--   1. la table `project_episodes` : numéro, titre, résumé et durée d'un
--      épisode, saisis par l'équipe ;
--   2. ses droits, ceux des personnages : toute l'équipe lit, le porteur, les
--      éditeurs et les administrateurs écrivent ;
--   3. deux garde-fous tenus par la base, quel que soit le chemin.
--
-- Ce que la base garantit, quoi que fasse l'écran :
--   - un épisode n'existe que dans un projet de série ou de web-série ;
--   - deux épisodes d'un projet n'ont pas le même numéro ;
--   - un projet qui a des épisodes ne quitte pas le format série : il faut les
--     retirer d'abord. Les supprimer en silence effacerait un travail sans que
--     personne l'ait demandé.
--
-- Rien ici n'appelle un fournisseur, et le worker n'a aucun droit sur la table.
--
-- Retour arrière — ce qui emporte les épisodes saisis :
--   `drop trigger projects_format_avec_episodes on public.projects` ;
--   `drop function public.garder_format_serie()` ;
--   `drop table public.project_episodes` ;
--   `drop function public.refuser_episode_hors_serie()`.

create table public.project_episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Rang dans la saison ; le premier se présente comme le pilote.
  number integer not null,
  title text not null,
  summary text not null default '',
  -- Nulle : l'équipe ne l'a pas dite.
  duration_minutes integer,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint episode_numero check (number between 1 and 500),
  constraint episode_titre check (
    char_length(btrim(title)) between 1 and 200 and title !~ '[[:cntrl:]]'
  ),
  constraint episode_resume check (char_length(summary) <= 2000),
  -- Les bornes de la durée d'un projet.
  constraint episode_duree check (duration_minutes is null or duration_minutes between 1 and 1000),
  constraint episode_numero_unique unique (project_id, number)
);

comment on table public.project_episodes is
  'Épisodes d''un projet de série, une seule saison. Lus par toute l''équipe, écrits par le porteur, les éditeurs et les administrateurs.';

alter table public.project_episodes enable row level security;

-- Un épisode n'existe que dans une série. Exécutée sous les droits de
-- l'appelant : qui ne lit pas le projet n'apprend rien de son format.
create or replace function public.refuser_episode_hors_serie()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.projects p
    where p.id = new.project_id and p.format in ('serie', 'web_serie')
  ) then
    raise exception 'Les épisodes sont réservés aux projets de série.' using errcode = 'SE001';
  end if;
  return new;
end;
$$;

revoke all on function public.refuser_episode_hors_serie() from public, anon, authenticated;

create trigger project_episodes_serie
  before insert or update of project_id on public.project_episodes
  for each row
  execute function public.refuser_episode_hors_serie();

create trigger project_episodes_avant_update
  before update on public.project_episodes
  for each row
  execute function public.touch_updated_at();

-- Une intervention d'un administrateur hors de ses projets laisse sa trace,
-- comme sur les personnages.
create trigger project_episodes_journal_admin
  before insert or update or delete on public.project_episodes
  for each row
  execute function public.journaliser_intervention_admin();

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

create policy "L'équipe et les administrateurs lisent les épisodes"
  on public.project_episodes for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création d'épisodes"
  on public.project_episodes for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification d'épisodes"
  on public.project_episodes for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression d'épisodes"
  on public.project_episodes for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_episodes
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Un épisode ne change ni de projet ni d'auteur, et ses dates sont celles de
-- la base.
revoke all on table public.project_episodes from anon, authenticated;
grant select, delete on table public.project_episodes to authenticated;
grant insert (project_id, number, title, summary, duration_minutes, created_by)
  on table public.project_episodes to authenticated;
grant update (number, title, summary, duration_minutes)
  on table public.project_episodes to authenticated;

-- ---------------------------------------------------------------------------
-- Le format d'un projet qui a des épisodes
-- ---------------------------------------------------------------------------

-- `security definer` : la règle ne doit pas dépendre de ce que l'appelant lit
-- des épisodes. Elle ne lui apprend rien — il modifie déjà le projet.
create or replace function public.garder_format_serie()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.format not in ('serie', 'web_serie')
     and exists (select 1 from public.project_episodes e where e.project_id = new.id) then
    raise exception 'Ce projet a des épisodes : retirez-les avant de changer son format.'
      using errcode = 'SE002';
  end if;
  return new;
end;
$$;

revoke all on function public.garder_format_serie() from public, anon, authenticated;

create trigger projects_format_avec_episodes
  before update of format on public.projects
  for each row
  when (old.format is distinct from new.format)
  execute function public.garder_format_serie();
