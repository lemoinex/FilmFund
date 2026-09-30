-- Planning : les étapes datées d'un projet.
--
-- Chaque étape a une phase (celles du cycle de vie d'un projet, déjà
-- définies par project_stage), des dates facultatives et un statut. La part
-- des étapes terminées donne l'avancement réel du projet — une mesure, et
-- non une estimation déduite de son étape.
--
-- Mêmes droits que les documents et le storyboard : toute l'équipe lit ;
-- le porteur, les éditeurs et les administrateurs écrivent.

create type public.milestone_status as enum ('a_faire', 'en_cours', 'termine');

create table public.project_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  -- Réutilise les étapes du projet : une seule liste de phases dans
  -- l'application, pas deux qui divergeraient.
  phase public.project_stage not null default 'developpement',
  starts_on date,
  due_on date,
  status public.milestone_status not null default 'a_faire',
  notes text not null default '',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint etape_titre_non_vide check (char_length(btrim(title)) between 1 and 200),
  constraint etape_notes_longueur check (char_length(notes) <= 2000),
  constraint etape_dates_ordonnees check (
    starts_on is null or due_on is null or due_on >= starts_on
  )
);

comment on table public.project_milestones is
  'Étape datée du planning d''un projet. Lue par toute l''équipe, écrite par le porteur, les éditeurs et les administrateurs.';

-- Le planning s'affiche par projet, dans l'ordre des échéances.
create index project_milestones_project_id_due_on_idx
  on public.project_milestones (project_id, due_on);

alter table public.project_milestones enable row level security;

create trigger project_milestones_avant_update
  before update on public.project_milestones
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

create policy "L'équipe et les administrateurs lisent le planning"
  on public.project_milestones for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création d'étapes"
  on public.project_milestones for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification d'étapes"
  on public.project_milestones for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression d'étapes"
  on public.project_milestones for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_milestones
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privilèges par colonne
-- ---------------------------------------------------------------------------

-- Une étape ne change ni de projet ni d'auteur.
revoke all on table public.project_milestones from anon;
revoke update on table public.project_milestones from authenticated;
grant update (title, phase, starts_on, due_on, status, notes)
  on table public.project_milestones to authenticated;
