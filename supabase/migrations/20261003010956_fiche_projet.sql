-- Fiche du projet et personnages (lot R1).
--
-- Décidé par l'utilisateur le 3 octobre 2026 : un assistant de création
-- guide la saisie, étape par étape (lot R2). Le projet naît à la première
-- étape ; chacune des suivantes complète sa fiche. Cette migration pose la
-- base, sans écran : les champs de la fiche sur `projects`, et une table des
-- personnages.
--
-- Les champs de la fiche suivent les droits du projet, déjà en place : le
-- porteur et les éditeurs les modifient, l'équipe les lit ; un administrateur
-- les lit et peut supprimer le projet, mais ne réécrit pas l'œuvre d'un
-- auteur (décision du lot A, testée).
--
-- Les personnages suivent le modèle du storyboard : lus par l'équipe, écrits
-- par le porteur, les éditeurs et les administrateurs (`peut_editer_contenu`),
-- toute intervention d'un administrateur hors de ses projets étant
-- journalisée.
--
-- Aucune fonction nouvelle.
--
-- Retour arrière — les fiches et les personnages saisis seraient perdus :
--   drop table public.project_characters;
--   alter table public.projects
--     drop column genre, drop column countries, drop column languages,
--     drop column duration_minutes, drop column short_synopsis, drop column theme,
--     drop column stakes, drop column artistic_vision, drop column goals,
--     drop column audience;

-- ---------------------------------------------------------------------------
-- Fiche du projet
-- ---------------------------------------------------------------------------

-- Tous facultatifs : le titre suffit toujours pour créer un projet. Un compte
-- peut écrire son projet par l'API sans passer par l'écran : les bornes sont
-- donc ici, et pas seulement dans l'application. Les textes d'une ligne
-- n'admettent aucun caractère de contrôle ; les textes longs, des retours à
-- la ligne.
alter table public.projects
  add column genre text,
  -- Codes ISO 3166-1 à deux lettres ; le premier est le pays principal. La
  -- liste des pays proposés et l'absence de doublon relèvent de
  -- l'application : la base ne garantit que la forme et le nombre.
  add column countries text[] not null default '{}',
  -- Texte libre : bien des langues de tournage africaines n'ont pas de code
  -- court, et un film en mêle souvent plusieurs.
  add column languages text not null default '',
  add column duration_minutes integer,
  add column short_synopsis text not null default '',
  add column theme text not null default '',
  add column stakes text not null default '',
  add column artistic_vision text not null default '',
  add column goals text not null default '',
  add column audience text not null default '';

alter table public.projects
  add constraint projet_genre check (
    genre in (
      'drame',
      'comedie',
      'comedie_dramatique',
      'thriller',
      'policier',
      'action',
      'aventure',
      'fantastique',
      'science_fiction',
      'horreur',
      'romance',
      'historique',
      'biopic',
      'guerre',
      'musical',
      'jeunesse',
      'societe',
      'portrait',
      'nature',
      'autre'
    )
  ),
  add constraint projet_pays check (
    cardinality(countries) <= 10
    and array_position(countries, null) is null
    and array_to_string(countries, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'
  ),
  add constraint projet_langues check (
    char_length(languages) <= 200 and languages !~ '[[:cntrl:]]'
  ),
  add constraint projet_duree check (duration_minutes between 1 and 1000),
  add constraint projet_synopsis_court check (char_length(short_synopsis) <= 1500),
  add constraint projet_theme check (char_length(theme) <= 300 and theme !~ '[[:cntrl:]]'),
  add constraint projet_enjeux check (char_length(stakes) <= 5000),
  add constraint projet_vision check (char_length(artistic_vision) <= 5000),
  add constraint projet_objectifs check (char_length(goals) <= 3000),
  add constraint projet_public check (char_length(audience) <= 2000);

comment on column public.projects.countries is
  'Pays de production, codes ISO 3166-1 ; le premier est le pays principal.';
comment on column public.projects.stakes is 'Enjeux du récit (assistant de création).';
comment on column public.projects.artistic_vision is 'Vision artistique (assistant de création).';
comment on column public.projects.goals is
  'Objectifs du projet : festivals, financements, diffusion (assistant de création).';
comment on column public.projects.audience is 'Public cible (assistant de création).';

-- ---------------------------------------------------------------------------
-- Personnages
-- ---------------------------------------------------------------------------

create table public.project_characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  role text not null default 'secondaire',
  description text not null default '',
  -- Rang dans la liste ; l'ordre de saisie, à défaut d'un autre.
  position integer not null default 0,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint personnage_nom check (
    char_length(btrim(name)) between 1 and 120 and name !~ '[[:cntrl:]]'
  ),
  constraint personnage_role check (role in ('principal', 'secondaire')),
  constraint personnage_description check (char_length(description) <= 2000),
  constraint personnage_position check (position between 0 and 10000)
);

comment on table public.project_characters is
  'Personnages d''un projet. Lus par toute l''équipe, écrits par le porteur, les éditeurs et les administrateurs.';

create index project_characters_project_id_position_idx
  on public.project_characters (project_id, position);

alter table public.project_characters enable row level security;

create trigger project_characters_avant_update
  before update on public.project_characters
  for each row
  execute function public.touch_updated_at();

-- Une intervention d'un administrateur hors de ses projets laisse sa trace,
-- comme sur le storyboard.
create trigger project_characters_journal_admin
  before insert or update or delete on public.project_characters
  for each row
  execute function public.journaliser_intervention_admin();

-- peut_editer_contenu : porteur, éditeur ou administrateur (migration
-- documents).

create policy "L'équipe et les administrateurs lisent les personnages"
  on public.project_characters for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création de personnages"
  on public.project_characters for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification de personnages"
  on public.project_characters for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression de personnages"
  on public.project_characters for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.project_characters
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- Un personnage ne change ni de projet ni d'auteur.
revoke all on table public.project_characters from anon;
revoke update on table public.project_characters from authenticated;
grant update (name, role, description, position)
  on table public.project_characters to authenticated;
