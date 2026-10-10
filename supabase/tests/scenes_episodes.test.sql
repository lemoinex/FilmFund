-- La scène d'un épisode (lot SE5) : droits lus au catalogue, règles de la
-- colonne, et ce que le contexte de FRAME lit dans la fonction en place. Ce
-- que lisent et écrivent réellement le porteur, un éditeur, un lecteur, un
-- étranger et un administrateur est éprouvé par tests/scenes-episodes.test.mjs ;
-- le contexte remis à FRAME, par tests/worker-frame-episode.test.mjs.

begin;

select plan(20);

select is(
  (
    select array[data_type::text, is_nullable::text, coalesce(column_default::text, 'aucun')]
    from information_schema.columns
    where table_schema = 'public' and table_name = 'storyboard_scenes'
      and column_name = 'episode_id'
  ),
  array['uuid', 'YES', 'aucun'],
  'La colonne est facultative, sans défaut : une scène n''est rattachée à rien tant qu''on ne le dit pas'
);

select ok(
  has_column_privilege('authenticated', 'public.storyboard_scenes', 'episode_id', 'update')
    and has_column_privilege('authenticated', 'public.storyboard_scenes', 'episode_id', 'insert')
    and not has_column_privilege('anon', 'public.storyboard_scenes', 'episode_id', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.storyboard_scenes', 'select')
    -- Ce que le lot n'a pas à ouvrir reste fermé.
    and not has_column_privilege('authenticated', 'public.storyboard_scenes', 'project_id', 'update')
    and not has_column_privilege('authenticated', 'public.storyboard_scenes', 'created_by', 'update'),
  'Le rattachement s''écrit comme le reste de la scène ; ni visiteur ni worker ne le lisent'
);

select ok(
  not has_function_privilege('authenticated', 'public.controler_episode_de_la_scene()', 'execute')
    and not has_function_privilege('anon', 'public.controler_episode_de_la_scene()', 'execute')
    and not (select prosecdef from pg_proc where oid = 'public.controler_episode_de_la_scene()'::regprocedure),
  'La fonction de déclencheur ne s''appelle pas directement, et s''exécute sous les droits de l''appelant'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'storyboard_scenes'),
  array[
    'Création de scènes',
    'L''équipe et les administrateurs lisent le storyboard',
    'Mode privé : administrateurs uniquement',
    'Modification de scènes',
    'Suppression de scènes'
  ],
  'Aucune politique des scènes n''a changé'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_decoupage(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_decoupage(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.contexte_decoupage(uuid)', 'execute')
    and (select prosecdef and proconfig::text = '{"search_path=pg_catalog, public"}'
         from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure),
  'Le contexte du découpage reste au worker seul, au chemin de recherche fermé'
);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000e6c01', 'scenes-sql@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title, format)
values
  ('00000000-0000-0000-0000-0000000e6a01', '00000000-0000-0000-0000-0000000e6c01', 'Série d''essai', 'serie'),
  ('00000000-0000-0000-0000-0000000e6a02', '00000000-0000-0000-0000-0000000e6c01', 'Autre série', 'serie'),
  ('00000000-0000-0000-0000-0000000e6a03', '00000000-0000-0000-0000-0000000e6c01', 'Un film', 'long_metrage');

insert into public.project_episodes (id, project_id, number, title)
values
  ('00000000-0000-0000-0000-0000000e6e01', '00000000-0000-0000-0000-0000000e6a01', 1, 'Pilote'),
  ('00000000-0000-0000-0000-0000000e6e02', '00000000-0000-0000-0000-0000000e6a01', 2, 'Le filet'),
  ('00000000-0000-0000-0000-0000000e6e09', '00000000-0000-0000-0000-0000000e6a02', 1, 'Ailleurs');

prepare creer(uuid, uuid, integer, text, uuid) as
  insert into public.storyboard_scenes (id, project_id, position, title, setting, time_of_day, episode_id)
  values ($1, $2, $3, $4, 'ext', 'aube', $5);

select lives_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b00', '00000000-0000-0000-0000-0000000e6a01', 1, 'Scène sans épisode', null) $$,
  'Une scène sans épisode reste possible'
);

select lives_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b01', '00000000-0000-0000-0000-0000000e6a01', 2, 'Première du pilote', '00000000-0000-0000-0000-0000000e6e01') $$,
  'Une scène se rattache à un épisode de son projet'
);

select lives_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b02', '00000000-0000-0000-0000-0000000e6a01', 3, 'Seconde du pilote', '00000000-0000-0000-0000-0000000e6e01') $$,
  'Un épisode a autant de scènes qu''il en faut'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b03', '00000000-0000-0000-0000-0000000e6a01', 4, 'Épisode d''un autre projet', '00000000-0000-0000-0000-0000000e6e09') $$,
  'SE005', null, 'L''épisode d''un autre projet est refusé'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b04', '00000000-0000-0000-0000-0000000e6a01', 4, 'Épisode inconnu', '00000000-0000-0000-0000-0000000effff') $$,
  'SE005', null, 'Un épisode qui n''existe pas est refusé, avant même la clé étrangère'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e6b05', '00000000-0000-0000-0000-0000000e6a03', 1, 'Scène d''un film', '00000000-0000-0000-0000-0000000e6e01') $$,
  'SE005', null, 'La scène d''un film ne se rattache à l''épisode d''aucune série'
);

-- Les mêmes règles à la modification.
select throws_ok(
  $$ update public.storyboard_scenes set episode_id = '00000000-0000-0000-0000-0000000e6e09'
     where id = '00000000-0000-0000-0000-0000000e6b00' $$,
  'SE005', null, 'Rattacher à l''épisode d''un autre projet est refusé'
);

select lives_ok(
  $$ update public.storyboard_scenes set episode_id = '00000000-0000-0000-0000-0000000e6e02'
     where id = '00000000-0000-0000-0000-0000000e6b02' $$,
  'Une scène change d''épisode'
);

select lives_ok(
  $$ update public.storyboard_scenes set episode_id = null
     where id = '00000000-0000-0000-0000-0000000e6b02' $$,
  'Une scène se détache de son épisode'
);

-- Retirer un épisode ne supprime aucune scène : le lien se vide.
delete from public.project_episodes where id = '00000000-0000-0000-0000-0000000e6e01';

select is(
  (select array_agg(s.title || ' ' || coalesce(s.episode_id::text, 'sans épisode') order by s.position)
   from public.storyboard_scenes s where s.project_id = '00000000-0000-0000-0000-0000000e6a01'),
  array[
    'Scène sans épisode sans épisode',
    'Première du pilote sans épisode',
    'Seconde du pilote sans épisode'
  ],
  'Épisode retiré : ses scènes restent, sans épisode'
);

-- ---------------------------------------------------------------------------
-- Le contexte de FRAME, lu dans la fonction en place
-- ---------------------------------------------------------------------------

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure)
    ~ 'where e\.id = v_scene\.episode_id and e\.project_id = v_projet\.id',
  'L''épisode de la scène est relu dans le projet de la tâche'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure)
    ~ 'and d\.episode_id is not distinct from v_episode\.id',
  'Le scénario est celui de l''épisode de la scène — sans épisode, un scénario sans épisode'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure)
    ~ 'and \(v_episode\.id is null or s\.episode_id = v_episode\.id\)',
  'Pour la scène d''un épisode, les scènes précédentes sont celles du même épisode'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure)
    ~ 'when v_episode\.id is not null then jsonb_build_object\(\s+''episode'''
  and (select prosrc from pg_proc where oid = 'public.contexte_decoupage(uuid)'::regprocedure)
    ~ 'else ''\{\}''::jsonb\s+end;',
  'L''épisode n''est rendu que s''il existe : sans lui, le contexte garde sa forme'
);

-- BOARD et GEAR lisent aussi les scènes : leur contexte ne lit pas la colonne.
select ok(
  not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('contexte_image', 'contexte_materiel', 'contenu_dossier')
      and p.prosrc ~ 'storyboard_scenes[\s\S]*episode_id'
  )
  and (select prosrc from pg_proc where oid = 'public.contexte_image(uuid)'::regprocedure) !~ 'v_scene\.episode_id',
  'Les autres lectures des scènes ne sont pas touchées'
);

select * from finish();

rollback;
