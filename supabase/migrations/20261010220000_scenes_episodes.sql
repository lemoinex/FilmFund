-- FRAME : la scène d'un épisode (lot SE5).
--
-- Depuis le lot SE3a, un épisode a son scénario. Mais une scène du storyboard
-- n'avait aucun lien avec un épisode, et FRAME découpait toute scène d'après
-- « le scénario le plus récemment modifié » du projet : dans une série, celui
-- d'un autre épisode.
--
--   1. `storyboard_scenes.episode_id` : colonne facultative, jamais remplie
--      d'office. Retirer un épisode ne supprime aucune scène : le lien se vide.
--   2. La base refuse l'épisode d'un autre projet (`SE005`).
--   3. `contexte_decoupage` : le scénario de l'épisode de la scène, et aucun
--      autre ; les scènes précédentes du même épisode ; l'épisode lui-même.
--
-- Décisions du 10 octobre 2026, alignées sur l'écriture d'une séquence
-- (lot SE3b) :
--   - une scène rattachée dont l'épisode n'a pas de scénario n'en reçoit
--     aucun : FRAME travaille d'après la scène et le concept, jamais d'après
--     le scénario d'un autre épisode ;
--   - une scène sans épisode ne lit que les scénarios sans épisode. Pour un
--     film, rien ne change, et le contexte garde exactement sa forme ;
--   - le profil de FRAME ne change pas : `frame.decoupage@1`.
--
-- Aucune politique ne change : la scène se lit de toute l'équipe et s'écrit
-- par qui écrit le storyboard. Le droit d'écrire est accordé pour la colonne.
-- Les droits de `contexte_decoupage` ne changent pas : `create or replace`
-- les garde. BOARD et GEAR lisent aussi les scènes : leur contexte n'est pas
-- touché.
--
-- Retour arrière :
--   rétablir contexte_decoupage de la migration 20261006010000_frame_decoupage ;
--   drop trigger storyboard_scenes_episode on public.storyboard_scenes ;
--   drop function public.controler_episode_de_la_scene() ;
--   alter table public.storyboard_scenes drop column episode_id — ce qui perd
--   le rattachement des scènes, et lui seul.

-- ---------------------------------------------------------------------------
-- La colonne et sa règle
-- ---------------------------------------------------------------------------

alter table public.storyboard_scenes
  add column episode_id uuid references public.project_episodes (id) on delete set null;

comment on column public.storyboard_scenes.episode_id is
  'Épisode dont cette scène fait partie. Nul : la scène n''est rattachée à aucun épisode.';

-- Pour vider le lien quand un épisode est retiré, sans parcourir la table.
create index storyboard_scenes_episode_idx
  on public.storyboard_scenes (episode_id)
  where episode_id is not null;

-- L'épisode est celui du même projet. Exécutée sous les droits de l'appelant :
-- qui ne lit pas l'épisode n'apprend rien de lui, et n'y rattache rien.
create or replace function public.controler_episode_de_la_scene()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.episode_id is not null and not exists (
    select 1 from public.project_episodes e
    where e.id = new.episode_id and e.project_id = new.project_id
  ) then
    raise exception 'Cet épisode n''est pas un épisode de ce projet.' using errcode = 'SE005';
  end if;
  return new;
end;
$$;

revoke all on function public.controler_episode_de_la_scene() from public, anon, authenticated;

create trigger storyboard_scenes_episode
  before insert or update of episode_id, project_id on public.storyboard_scenes
  for each row
  execute function public.controler_episode_de_la_scene();

-- Les droits de la table sont accordés colonne par colonne : celle-ci s'écrit
-- comme le reste de la scène, sous les mêmes politiques.
grant insert (episode_id), update (episode_id) on table public.storyboard_scenes to authenticated;

-- ---------------------------------------------------------------------------
-- Contexte de FRAME : le scénario de l'épisode de la scène
-- ---------------------------------------------------------------------------

-- Même fonction qu'au lot J3c-2a, le cas de l'épisode en plus.
create or replace function public.contexte_decoupage(p_attempt_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_job public.jobs;
  v_projet public.projects;
  v_scene public.storyboard_scenes;
  v_episode public.project_episodes;
begin
  select j.* into v_job
  from public.job_attempts a
  join public.jobs j on j.id = a.job_id and j.state = 'running' and j.attempts = a.number
  where a.id = p_attempt_id
    and a.state in ('prepared', 'submitted')
    and j.action = 'shot_list';

  if v_job.id is null
     or (v_job.params ->> 'scene') is null
     or (v_job.params ->> 'scene') !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' then
    return null;
  end if;

  select p.* into v_projet from public.projects p where p.id = v_job.project_id;
  select s.* into v_scene
  from public.storyboard_scenes s
  where s.id = (v_job.params ->> 'scene')::uuid and s.project_id = v_job.project_id;

  if v_projet.id is null or v_scene.id is null then
    return null;
  end if;

  -- L'épisode de la scène, s'il y en a un : relu dans le projet de la tâche.
  if v_scene.episode_id is not null then
    select e.* into v_episode
    from public.project_episodes e
    where e.id = v_scene.episode_id and e.project_id = v_projet.id;
  end if;

  return jsonb_build_object(
    'action', v_job.action,
    'projet', jsonb_build_object(
      'titre', v_projet.title,
      'format', v_projet.format,
      'etape', v_projet.stage,
      'genre', v_projet.genre,
      'pays', to_jsonb(v_projet.countries),
      'langues', v_projet.languages,
      'duree', v_projet.duration_minutes
    ),
    'contexte', jsonb_build_object(
      'pitch', v_projet.logline,
      'synopsis_court', v_projet.short_synopsis,
      'synopsis', v_projet.synopsis,
      'theme', v_projet.theme,
      'enjeux', v_projet.stakes
    ),
    'vision', jsonb_build_object(
      'artistique', v_projet.artistic_vision,
      'objectifs', v_projet.goals,
      'public', v_projet.audience
    ),
    'scene', jsonb_build_object(
      'titre', v_scene.title,
      'decor', v_scene.setting,
      'lieu', v_scene.location,
      'moment', v_scene.time_of_day,
      'cadrage', v_scene.shot,
      'description', v_scene.description
    ),
    -- Les trente scènes qui précèdent, dans l'ordre du film : de quoi situer
    -- la scène, sans redonner tout le storyboard. Pour la scène d'un épisode,
    -- celles du même épisode seulement.
    'avant', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'titre', t.title, 'decor', t.setting, 'lieu', t.location, 'moment', t.time_of_day
          )
          order by t.position
        )
        from (
          select s.* from public.storyboard_scenes s
          where s.project_id = v_projet.id and s.position < v_scene.position
            and (v_episode.id is null or s.episode_id = v_episode.id)
          order by s.position desc
          limit 30
        ) t
      ),
      '[]'::jsonb
    ),
    'plans', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'cadrage', p.shot, 'focale', p.focal_mm, 'angle', p.angle,
            'mouvement', p.movement, 'description', p.description, 'duree', p.duration_seconds
          )
          order by p.position
        )
        from public.scene_shots p
        where p.scene_id = v_scene.id
      ),
      '[]'::jsonb
    ),
    -- Le scénario enregistré, comme le choisit l'écriture d'une séquence
    -- (lot SE3b) : celui de l'épisode de la scène, et aucun autre ; sans
    -- épisode, le scénario sans épisode le plus récemment modifié. Vide s'il
    -- n'y en a pas : FRAME travaille alors d'après la scène et le concept —
    -- jamais d'après le scénario d'un autre épisode.
    'scenario', coalesce(
      (
        select left(d.content, 220000)
        from public.project_documents d
        where d.project_id = v_projet.id and d.type = 'scenario'
          and d.episode_id is not distinct from v_episode.id
        order by d.updated_at desc, d.id
        limit 1
      ),
      ''
    )
  ) || case
    -- L'épisode de la scène. Sans épisode, le contexte garde exactement la
    -- forme qu'il avait : pour un film, rien ne change.
    when v_episode.id is not null then jsonb_build_object(
      'episode', jsonb_build_object(
        'numero', v_episode.number,
        'titre', v_episode.title,
        'resume', v_episode.summary
      )
    )
    else '{}'::jsonb
  end;
end;
$$;
