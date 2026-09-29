-- Storyboard : les scènes d'un projet, dans l'ordre du film.
--
-- Chaque scène porte un en-tête au format scénario (INT./EXT. LIEU —
-- JOUR/NUIT), un intitulé, une description et un cadrage. Les images
-- viendront avec le stockage : cette première version décrit les scènes,
-- elle ne les illustre pas encore.
--
-- Mêmes droits que les documents : toute l'équipe lit, lecteurs compris ;
-- le porteur, les éditeurs et les administrateurs écrivent.

-- ---------------------------------------------------------------------------
-- Énumérations
-- ---------------------------------------------------------------------------

create type public.scene_setting as enum ('int', 'ext', 'int_ext');

create type public.scene_time as enum ('jour', 'nuit', 'aube', 'crepuscule');

create type public.shot_type as enum (
  'plan_ensemble',
  'plan_large',
  'plan_moyen',
  'plan_americain',
  'plan_rapproche',
  'gros_plan',
  'tres_gros_plan',
  'insert',
  'plan_sequence'
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.storyboard_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null,
  title text not null,
  setting public.scene_setting not null default 'int',
  location text not null default '',
  time_of_day public.scene_time not null default 'jour',
  shot public.shot_type,
  description text not null default '',
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint scene_titre_non_vide check (char_length(btrim(title)) between 1 and 200),
  constraint scene_lieu_longueur check (char_length(location) <= 200),
  constraint scene_description_longueur check (char_length(description) <= 5000),
  constraint scene_position_positive check (position > 0),

  -- Deux scènes ne partagent pas un rang. Contrainte différée à la fin de
  -- la transaction : l'échange de deux scènes passe par un état
  -- intermédiaire où elles ont brièvement la même position.
  constraint une_scene_par_position unique (project_id, position) deferrable initially deferred
);

comment on table public.storyboard_scenes is
  'Scène du storyboard d''un projet. Lue par toute l''équipe, écrite par le porteur, les éditeurs et les administrateurs.';

comment on column public.storyboard_scenes.position is
  'Rang de la scène dans le film. Le numéro affiché est calculé à la lecture : une suppression ne laisse pas de trou dans la numérotation.';

alter table public.storyboard_scenes enable row level security;

create trigger storyboard_scenes_avant_update
  before update on public.storyboard_scenes
  for each row
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------------

-- peut_editer_contenu : porteur, éditeur ou administrateur (migration
-- documents).

create policy "L'équipe et les administrateurs lisent le storyboard"
  on public.storyboard_scenes for select
  to authenticated
  using (public.acces_au_projet(project_id) is not null or (select public.is_admin()));

create policy "Création de scènes"
  on public.storyboard_scenes for insert
  to authenticated
  with check (
    public.peut_editer_contenu(project_id)
    and created_by = (select auth.uid())
  );

create policy "Modification de scènes"
  on public.storyboard_scenes for update
  to authenticated
  using (public.peut_editer_contenu(project_id))
  with check (public.peut_editer_contenu(project_id));

create policy "Suppression de scènes"
  on public.storyboard_scenes for delete
  to authenticated
  using (public.peut_editer_contenu(project_id));

create policy "Mode privé : administrateurs uniquement"
  on public.storyboard_scenes
  as restrictive
  for all
  to authenticated
  using (not (select public.mode_prive()) or (select public.is_admin()))
  with check (not (select public.mode_prive()) or (select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Privilèges par colonne
-- ---------------------------------------------------------------------------

-- Une scène ne change ni de projet ni d'auteur. Sa position, elle, change
-- quand on réordonne le storyboard.
revoke all on table public.storyboard_scenes from anon;
revoke update on table public.storyboard_scenes from authenticated;
grant update (position, title, setting, location, time_of_day, shot, description)
  on table public.storyboard_scenes to authenticated;

-- ---------------------------------------------------------------------------
-- Déplacement d'une scène
-- ---------------------------------------------------------------------------

-- Échange la scène avec sa voisine, vers le haut ou vers le bas, dans une
-- seule transaction : deux requêtes séparées depuis l'application pourraient
-- s'intercaler avec celles d'un coéquipier et laisser deux scènes au même
-- rang.
--
-- `security invoker` : la fonction s'exécute avec les droits de l'appelant,
-- la RLS s'applique à chacune de ses requêtes. Elle ne donne aucun pouvoir
-- que l'appelant n'aurait pas déjà ; elle rend seulement l'échange atomique.
create or replace function public.deplacer_scene(p_scene_id uuid, p_vers_le_haut boolean)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  scene public.storyboard_scenes;
  voisine public.storyboard_scenes;
  modifiees integer;
begin
  select * into scene from public.storyboard_scenes where id = p_scene_id;

  if scene.id is null then
    raise exception 'Scène introuvable.' using errcode = 'P0002';
  end if;

  if p_vers_le_haut then
    select * into voisine from public.storyboard_scenes
    where project_id = scene.project_id and position < scene.position
    order by position desc limit 1;
  else
    select * into voisine from public.storyboard_scenes
    where project_id = scene.project_id and position > scene.position
    order by position asc limit 1;
  end if;

  -- Déjà en tête ou en fin de storyboard : rien à faire.
  if voisine.id is null then
    return;
  end if;

  update public.storyboard_scenes set position = voisine.position where id = scene.id;
  get diagnostics modifiees = row_count;

  -- La RLS ne lève pas d'erreur sur une modification interdite : elle ne
  -- touche aucune ligne. Un lecteur qui appelle cette fonction doit
  -- l'apprendre, pas croire que la scène a bougé.
  if modifiees = 0 then
    raise exception 'Vous n''avez pas le droit de modifier ce storyboard.' using errcode = '42501';
  end if;

  update public.storyboard_scenes set position = scene.position where id = voisine.id;
end;
$$;

revoke all on function public.deplacer_scene(uuid, boolean) from public, anon;
grant execute on function public.deplacer_scene(uuid, boolean) to authenticated;
