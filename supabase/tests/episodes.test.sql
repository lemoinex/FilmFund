-- Épisodes d'une série (lot SE1) : droits lus au catalogue et bornes de la
-- table. Ce que lisent et écrivent réellement le porteur, un éditeur, un
-- lecteur, un étranger et un administrateur est éprouvé par
-- tests/episodes.test.mjs.

begin;

select plan(24);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.project_episodes'::regclass),
  'La RLS est active sur les épisodes'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'project_episodes'),
  array[
    'Création d''épisodes',
    'L''équipe et les administrateurs lisent les épisodes',
    'Mode privé : administrateurs uniquement',
    'Modification d''épisodes',
    'Suppression d''épisodes'
  ],
  'Cinq politiques, dont celle du mode privé'
);

-- Lire : l'équipe ou l'administration. Écrire : qui peut éditer le contenu.
select ok(
  (select qual like '%acces_au_projet(project_id)%' and qual like '%is_admin()%'
   from pg_policies
   where tablename = 'project_episodes'
     and policyname = 'L''équipe et les administrateurs lisent les épisodes')
  and (select bool_and(coalesce(qual, with_check) like '%peut_editer_contenu(project_id)%')
       from pg_policies
       where tablename = 'project_episodes' and cmd in ('INSERT', 'UPDATE', 'DELETE')
         and permissive = 'PERMISSIVE')
  and (select with_check like '%created_by = %auth.uid()%' from pg_policies
       where tablename = 'project_episodes' and cmd = 'INSERT'),
  'L''équipe lit ; seuls ceux qui éditent le contenu écrivent, en leur nom'
);

select ok(
  not has_any_column_privilege('anon', 'public.project_episodes', 'select')
    and not has_table_privilege('anon', 'public.project_episodes', 'insert')
    and not has_any_column_privilege('filmfund_worker', 'public.project_episodes', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_episodes', 'insert')
    and has_table_privilege('authenticated', 'public.project_episodes', 'select')
    and has_table_privilege('authenticated', 'public.project_episodes', 'delete'),
  'Ni un visiteur ni le worker n''ont de droit sur les épisodes'
);

-- Un épisode ne change ni de projet ni d'auteur ; ses dates sont celles de la base.
select ok(
  (select bool_and(has_column_privilege('authenticated', 'public.project_episodes', colonne, 'update'))
   from unnest(array['number', 'title', 'summary', 'duration_minutes']) as colonne)
  and not has_column_privilege('authenticated', 'public.project_episodes', 'project_id', 'update')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'created_by', 'update')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'created_at', 'update')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'updated_at', 'update')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'id', 'update')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'created_at', 'insert')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'updated_at', 'insert')
  and not has_column_privilege('authenticated', 'public.project_episodes', 'id', 'insert'),
  'Seuls le numéro, le titre, le résumé et la durée se modifient'
);

select ok(
  not has_function_privilege('authenticated', 'public.refuser_episode_hors_serie()', 'execute')
    and not has_function_privilege('anon', 'public.refuser_episode_hors_serie()', 'execute')
    and not has_function_privilege('authenticated', 'public.garder_format_serie()', 'execute')
    and not has_function_privilege('anon', 'public.garder_format_serie()', 'execute'),
  'Les fonctions de déclencheur ne s''appellent pas directement'
);

select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
   where tgrelid = 'public.project_episodes'::regclass and not tgisinternal),
  array['project_episodes_avant_update', 'project_episodes_journal_admin', 'project_episodes_serie'],
  'Les épisodes portent leurs trois déclencheurs, dont le journal d''administration'
);

-- Les bornes, éprouvées en SQL direct : la base les tient quel que soit le chemin.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000e5001', 'episodes-sql@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title, format)
values
  ('00000000-0000-0000-0000-0000000e50a1', '00000000-0000-0000-0000-0000000e5001', 'Série d''essai', 'serie'),
  ('00000000-0000-0000-0000-0000000e50a2', '00000000-0000-0000-0000-0000000e5001', 'Web-série d''essai', 'web_serie'),
  ('00000000-0000-0000-0000-0000000e50a3', '00000000-0000-0000-0000-0000000e5001', 'Film d''essai', 'long_metrage');

prepare ajouter(uuid, integer, text, text, integer) as
  insert into public.project_episodes (project_id, number, title, summary, duration_minutes)
  values ($1, $2, $3, $4, $5);

select lives_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 1, 'Pilote', 'Résumé.', 26) $$,
  'Une série reçoit un épisode'
);

select lives_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a2', 1, 'Pilote', '', null) $$,
  'Une web-série aussi, sans résumé ni durée ; le même numéro dans une autre série ne gêne pas'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a3', 1, 'Pilote', '', null) $$,
  'SE001', null, 'Un film ne reçoit pas d''épisode'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 1, 'Doublon', '', null) $$,
  '23505', null, 'Deux épisodes d''une série n''ont pas le même numéro'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 0, 'Zéro', '', null) $$,
  '23514', null, 'Un numéro nul est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 501, 'Trop loin', '', null) $$,
  '23514', null, 'Un numéro au-delà de 500 est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, '   ', '', null) $$,
  '23514', null, 'Un titre vide est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, E'Deux\nlignes', '', null) $$,
  '23514', null, 'Un titre sur deux lignes est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, repeat('t', 201), '', null) $$,
  '23514', null, 'Un titre de plus de 200 caractères est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, 'Long', repeat('r', 2001), null) $$,
  '23514', null, 'Un résumé de plus de 2 000 caractères est refusé'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, 'Sans durée', '', 0) $$,
  '23514', null, 'Une durée de zéro minute est refusée'
);

select throws_ok(
  $$ execute ajouter('00000000-0000-0000-0000-0000000e50a1', 2, 'Démesuré', '', 1001) $$,
  '23514', null, 'Une durée au-delà de celle d''un projet est refusée'
);

-- Un épisode ne se déplace pas vers un projet qui n'est pas une série.
select throws_ok(
  $$ update public.project_episodes set project_id = '00000000-0000-0000-0000-0000000e50a3'
     where project_id = '00000000-0000-0000-0000-0000000e50a2' $$,
  'SE001', null, 'Un épisode ne se déplace pas vers un film'
);

-- Le format d'un projet qui a des épisodes.
select throws_ok(
  $$ update public.projects set format = 'documentaire'
     where id = '00000000-0000-0000-0000-0000000e50a1' $$,
  'SE002', null, 'Une série qui a des épisodes ne devient pas un documentaire'
);

select lives_ok(
  $$ update public.projects set format = 'web_serie', title = 'Série devenue web-série'
     where id = '00000000-0000-0000-0000-0000000e50a1' $$,
  'D''une série à une web-série, rien ne s''y oppose'
);

delete from public.project_episodes where project_id = '00000000-0000-0000-0000-0000000e50a1';

select lives_ok(
  $$ update public.projects set format = 'documentaire'
     where id = '00000000-0000-0000-0000-0000000e50a1' $$,
  'Ses épisodes retirés, le projet change de format'
);

-- Supprimer le projet emporte ses épisodes.
delete from public.projects where id = '00000000-0000-0000-0000-0000000e50a2';

select is(
  (select count(*)::int from public.project_episodes
   where project_id = '00000000-0000-0000-0000-0000000e50a2'),
  0,
  'Supprimer le projet emporte ses épisodes'
);

select * from finish();

rollback;
