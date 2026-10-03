-- Fiche du projet et personnages (lot R1) : forme des champs, et qui les lit
-- ou les écrit, vu depuis des sessions simulées au niveau SQL.
--
-- Les lectures sous RLS sont relevées dans un réglage de session, puis
-- vérifiées une fois le rôle rendu : une ligne invisible ne lève pas
-- d'erreur, elle ne revient simplement pas.

begin;

select plan(40);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000f1c1', 'fiche-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1c2', 'fiche-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1c3', 'fiche-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1c4', 'fiche-etranger@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000f1c5', 'fiche-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000f1c5';

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-00000000f1a1', '00000000-0000-0000-0000-00000000f1c1', 'Projet à ficher');

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000000f1a1', '00000000-0000-0000-0000-00000000f1c2', 'editor'),
  ('00000000-0000-0000-0000-00000000f1a1', '00000000-0000-0000-0000-00000000f1c3', 'viewer');

create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Fiche : valeurs par défaut et forme
-- ---------------------------------------------------------------------------

select is(
  (
    select row(genre, countries, languages, duration_minutes, short_synopsis, theme,
               stakes, artistic_vision, goals, audience)::text
    from public.projects where id = '00000000-0000-0000-0000-00000000f1a1'
  ),
  row(null::text, '{}'::text[], '', null::integer, '', '', '', '', '', '')::text,
  'Un projet naît avec une fiche vide : le titre suffit toujours'
);

select lives_ok(
  $$ update public.projects
     set genre = 'comedie_dramatique', countries = '{CM,SN}', languages = 'Français, ewondo',
         duration_minutes = 95, theme = 'La mer'
     where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  'Une fiche bien formée est admise'
);

select throws_ok(
  $$ update public.projects set genre = 'western' where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un genre inconnu est refusé'
);

select throws_ok(
  $$ update public.projects set countries = '{cm}' where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un code de pays en minuscules est refusé'
);

select throws_ok(
  $$ update public.projects set countries = '{CMR}' where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un code de pays à trois lettres est refusé'
);

select throws_ok(
  $$ update public.projects set countries = array['CM', null] where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un pays nul dans la liste est refusé'
);

select throws_ok(
  $$ update public.projects set countries = '{CM,SN,CI,FR,BE,GA,CG,CD,BJ,TG,ML}'
     where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Plus de dix pays de production sont refusés'
);

select throws_ok(
  $$ update public.projects set duration_minutes = 0 where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Une durée nulle est refusée'
);

select throws_ok(
  $$ update public.projects set duration_minutes = 1001 where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Une durée de plus de 1000 minutes est refusée'
);

select throws_ok(
  $$ update public.projects set languages = repeat('a', 201) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Des langues de plus de 200 caractères sont refusées'
);

select throws_ok(
  $$ update public.projects set theme = 'La' || chr(10) || 'mer' where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un thème sur deux lignes est refusé'
);

select throws_ok(
  $$ update public.projects set short_synopsis = repeat('a', 1501) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un synopsis court de plus de 1500 caractères est refusé'
);

select throws_ok(
  $$ update public.projects set stakes = repeat('a', 5001) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Des enjeux de plus de 5000 caractères sont refusés'
);

select throws_ok(
  $$ update public.projects set artistic_vision = repeat('a', 5001) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Une vision de plus de 5000 caractères est refusée'
);

select throws_ok(
  $$ update public.projects set goals = repeat('a', 3001) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Des objectifs de plus de 3000 caractères sont refusés'
);

select throws_ok(
  $$ update public.projects set audience = repeat('a', 2001) where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  '23514', null, 'Un public cible de plus de 2000 caractères est refusé'
);

select lives_ok(
  $$ update public.projects set stakes = 'Premier enjeu.' || chr(10) || 'Second enjeu.'
     where id = '00000000-0000-0000-0000-00000000f1a1' $$,
  'Un texte long admet les retours à la ligne'
);

-- ---------------------------------------------------------------------------
-- Fiche : qui l'écrit
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-00000000f1c2');
update public.projects set audience = 'Par l''éditeur' where id = '00000000-0000-0000-0000-00000000f1a1';

select pg_temp.session('00000000-0000-0000-0000-00000000f1c3');
update public.projects set goals = 'Par le lecteur' where id = '00000000-0000-0000-0000-00000000f1a1';

select pg_temp.session('00000000-0000-0000-0000-00000000f1c4');
update public.projects set goals = 'Par un étranger' where id = '00000000-0000-0000-0000-00000000f1a1';

select pg_temp.session('00000000-0000-0000-0000-00000000f1c5');
update public.projects set goals = 'Par l''administrateur' where id = '00000000-0000-0000-0000-00000000f1a1';

reset role;

select is(
  (select audience from public.projects where id = '00000000-0000-0000-0000-00000000f1a1'),
  'Par l''éditeur',
  'Un éditeur complète la fiche'
);

select is(
  (select goals from public.projects where id = '00000000-0000-0000-0000-00000000f1a1'),
  '',
  'Ni le lecteur, ni un étranger, ni un administrateur ne réécrivent la fiche d''un auteur'
);

-- ---------------------------------------------------------------------------
-- Personnages : forme
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.project_characters (project_id, name) values ('00000000-0000-0000-0000-00000000f1a1', '  ') $$,
  '23514', null, 'Un personnage sans nom est refusé'
);

select throws_ok(
  $$ insert into public.project_characters (project_id, name) values ('00000000-0000-0000-0000-00000000f1a1', repeat('a', 121)) $$,
  '23514', null, 'Un nom de plus de 120 caractères est refusé'
);

select throws_ok(
  $$ insert into public.project_characters (project_id, name, role) values ('00000000-0000-0000-0000-00000000f1a1', 'Awa', 'figurant') $$,
  '23514', null, 'Un rôle inconnu est refusé'
);

select throws_ok(
  $$ insert into public.project_characters (project_id, name, description) values ('00000000-0000-0000-0000-00000000f1a1', 'Awa', repeat('a', 2001)) $$,
  '23514', null, 'Une description de plus de 2000 caractères est refusée'
);

select throws_ok(
  $$ insert into public.project_characters (project_id, name, position) values ('00000000-0000-0000-0000-00000000f1a1', 'Awa', -1) $$,
  '23514', null, 'Une position négative est refusée'
);

-- ---------------------------------------------------------------------------
-- Personnages : qui les écrit, qui les lit
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-00000000f1c1');
insert into public.project_characters (id, project_id, name, role)
values ('00000000-0000-0000-0000-00000000f1e1', '00000000-0000-0000-0000-00000000f1a1', 'Ɛyɔ', 'principal');

select pg_temp.session('00000000-0000-0000-0000-00000000f1c2');
insert into public.project_characters (id, project_id, name)
values ('00000000-0000-0000-0000-00000000f1e2', '00000000-0000-0000-0000-00000000f1a1', 'Le pêcheur');

select throws_ok(
  $$ insert into public.project_characters (project_id, name, created_by)
     values ('00000000-0000-0000-0000-00000000f1a1', 'Auteur usurpé', '00000000-0000-0000-0000-00000000f1c1') $$,
  '42501', null, 'Un éditeur ne crée pas de personnage au nom d''un autre auteur'
);

select pg_temp.session('00000000-0000-0000-0000-00000000f1c3');

select throws_ok(
  $$ insert into public.project_characters (project_id, name) values ('00000000-0000-0000-0000-00000000f1a1', 'Par le lecteur') $$,
  '42501', null, 'Un lecteur ne crée pas de personnage'
);

select set_config(
  'test.vus_lecteur',
  (select count(*)::text from public.project_characters where project_id = '00000000-0000-0000-0000-00000000f1a1'),
  true
);

update public.project_characters set name = 'Renommé par le lecteur'
where id = '00000000-0000-0000-0000-00000000f1e1';
delete from public.project_characters where id = '00000000-0000-0000-0000-00000000f1e2';

select pg_temp.session('00000000-0000-0000-0000-00000000f1c4');

select throws_ok(
  $$ insert into public.project_characters (project_id, name) values ('00000000-0000-0000-0000-00000000f1a1', 'Par un étranger') $$,
  '42501', null, 'Un compte étranger ne crée pas de personnage'
);

select set_config(
  'test.vus_etranger',
  (select count(*)::text from public.project_characters where project_id = '00000000-0000-0000-0000-00000000f1a1'),
  true
);

select pg_temp.session('00000000-0000-0000-0000-00000000f1c2');

select throws_ok(
  $$ update public.project_characters set project_id = gen_random_uuid() where id = '00000000-0000-0000-0000-00000000f1e2' $$,
  '42501', null, 'Un personnage ne change pas de projet'
);

select throws_ok(
  $$ update public.project_characters set created_by = '00000000-0000-0000-0000-00000000f1c4' where id = '00000000-0000-0000-0000-00000000f1e2' $$,
  '42501', null, 'Un personnage ne change pas d''auteur'
);

update public.project_characters set description = 'Il connaît les courants.'
where id = '00000000-0000-0000-0000-00000000f1e2';

select pg_temp.session('00000000-0000-0000-0000-00000000f1c5');
insert into public.project_characters (id, project_id, name)
values ('00000000-0000-0000-0000-00000000f1e3', '00000000-0000-0000-0000-00000000f1a1', 'Par l''administrateur');

reset role;

select is(current_setting('test.vus_lecteur'), '2', 'Un lecteur lit les personnages de son équipe');
select is(current_setting('test.vus_etranger'), '0', 'Un compte étranger ne lit aucun personnage');

select is(
  (select name from public.project_characters where id = '00000000-0000-0000-0000-00000000f1e1'),
  'Ɛyɔ',
  'Un lecteur ne renomme pas un personnage'
);

select is(
  (select count(*)::int from public.project_characters where id = '00000000-0000-0000-0000-00000000f1e2'),
  1,
  'Un lecteur ne supprime pas un personnage'
);

select is(
  (select description from public.project_characters where id = '00000000-0000-0000-0000-00000000f1e2'),
  'Il connaît les courants.',
  'Un éditeur modifie un personnage'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where action = 'intervention_contenu'
      and actor_id = '00000000-0000-0000-0000-00000000f1c5'
      and details ->> 'table' = 'project_characters'
      and details ->> 'operation' = 'insert'
  ),
  1,
  'Un administrateur crée un personnage, et le journal le retient'
);

select is(
  (
    -- Ce projet seulement : d'autres suites laissent au journal des entrées
    -- bien réelles sur leurs propres personnages.
    select count(*)::int from public.admin_audit_log
    where details ->> 'table' = 'project_characters'
      and project_id = '00000000-0000-0000-0000-00000000f1a1'
      and actor_id <> '00000000-0000-0000-0000-00000000f1c5'
  ),
  0,
  'Le travail de l''équipe sur ses personnages n''est pas journalisé'
);

-- ---------------------------------------------------------------------------
-- Mode privé et suppression du projet
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-00000000f1c1');
select set_config(
  'test.vus_prive',
  (select count(*)::text from public.project_characters),
  true
);

select throws_ok(
  $$ insert into public.project_characters (project_id, name) values ('00000000-0000-0000-0000-00000000f1a1', 'En mode privé') $$,
  '42501', null, 'En mode privé, le porteur ne crée plus de personnage'
);

select pg_temp.session('00000000-0000-0000-0000-00000000f1c5');
select set_config(
  'test.vus_prive_admin',
  (select count(*)::text from public.project_characters where project_id = '00000000-0000-0000-0000-00000000f1a1'),
  true
);

reset role;

select is(current_setting('test.vus_prive'), '0', 'En mode privé, le porteur ne lit plus ses personnages');
select is(current_setting('test.vus_prive_admin'), '3', 'En mode privé, un administrateur lit toujours les personnages');

update public.app_settings set private_admin_only = false where id;

delete from public.projects where id = '00000000-0000-0000-0000-00000000f1a1';

select is(
  (select count(*)::int from public.project_characters where project_id = '00000000-0000-0000-0000-00000000f1a1'),
  0,
  'Les personnages disparaissent avec leur projet'
);

select * from finish();

rollback;
