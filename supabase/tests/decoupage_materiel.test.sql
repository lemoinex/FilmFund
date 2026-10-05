-- Découpage technique et matériel (lot J3c-1) : ce que la suite d'API ne voit
-- pas — le mode privé, le journal d'administration, les droits d'un visiteur
-- et le sort des lignes quand leur projet disparaît.
--
-- Les lectures sous RLS sont relevées dans un réglage de session, puis
-- vérifiées une fois le rôle rendu : une ligne invisible ne lève pas
-- d'erreur, elle ne revient simplement pas.

begin;

select plan(27);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000d3c01', 'decoupage-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d3c02', 'decoupage-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d3c03', 'decoupage-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000d3c03';

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3c01', 'Projet à découper'),
  ('00000000-0000-0000-0000-0000000d3a02', '00000000-0000-0000-0000-0000000d3c01', 'Autre projet');

insert into public.project_members (project_id, user_id, role)
values ('00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3c02', 'viewer');

insert into public.storyboard_scenes (id, project_id, position, title)
values
  ('00000000-0000-0000-0000-0000000d3b01', '00000000-0000-0000-0000-0000000d3a01', 1, 'Scène à découper'),
  ('00000000-0000-0000-0000-0000000d3b02', '00000000-0000-0000-0000-0000000d3a02', 1, 'Scène d''un autre projet');

create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

-- ---------------------------------------------------------------------------
-- Forme
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.scene_shots (project_id, scene_id, position, shot)
     values ('00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3b02', 1, 'plan_moyen') $$,
  '23503', null, 'Un plan ne se rattache pas à la scène d''un autre projet'
);

select throws_ok(
  $$ insert into public.scene_shots (project_id, scene_id, position, shot)
     values ('00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3b01', 1, null) $$,
  '23502', null, 'Un plan a toujours un cadrage'
);

select is(
  (
    select count(*)::int from pg_proc
    where oid = 'public.deplacer_plan(uuid, boolean)'::regprocedure and not prosecdef
  ),
  1,
  'Le déplacement d''un plan s''exécute avec les droits de l''appelant'
);

select ok(
  not has_function_privilege('anon', 'public.deplacer_plan(uuid, boolean)', 'execute'),
  'Un visiteur anonyme ne déplace aucun plan'
);

select ok(
  not has_table_privilege('anon', 'public.scene_shots', 'select')
    and not has_table_privilege('anon', 'public.project_gear', 'select')
    and not has_table_privilege('anon', 'public.project_power_settings', 'select'),
  'Un visiteur anonyme n''a aucun droit sur les trois tables'
);

select ok(
  not has_any_column_privilege('filmfund_worker', 'public.scene_shots', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_gear', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_power_settings', 'select'),
  'Le worker ne lit aucune des trois tables'
);

select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'scene_shots'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ),
  array['angle', 'description', 'duration_seconds', 'focal_mm', 'movement', 'position', 'shot'],
  'Seuls les champs d''un plan se modifient : ni son projet, ni sa scène, ni son auteur'
);

select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'project_gear'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ),
  array['category', 'label', 'quantity', 'simultaneous', 'unit_power_watts'],
  'Seuls les champs d''un équipement se modifient'
);

select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'project_power_settings'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ),
  array['generator_margin_percent', 'voltage_volts'],
  'Seules la tension et la marge se modifient'
);

-- ---------------------------------------------------------------------------
-- Travail de l'équipe, puis intervention d'un administrateur
-- ---------------------------------------------------------------------------

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-0000000d3c01');

insert into public.scene_shots (id, project_id, scene_id, position, shot)
values
  ('00000000-0000-0000-0000-0000000d3e01', '00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3b01', 1, 'plan_large'),
  ('00000000-0000-0000-0000-0000000d3e02', '00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3b01', 2, 'gros_plan');

insert into public.project_gear (id, project_id, category, label, quantity, unit_power_watts)
values ('00000000-0000-0000-0000-0000000d3f01', '00000000-0000-0000-0000-0000000d3a01', 'lumiere', 'Projecteur', 2, 650);

insert into public.project_power_settings (project_id)
values ('00000000-0000-0000-0000-0000000d3a01');

select lives_ok(
  $$ select public.deplacer_plan('00000000-0000-0000-0000-0000000d3e02', true) $$,
  'Le porteur déplace un plan'
);

select pg_temp.session('00000000-0000-0000-0000-0000000d3c02');

select throws_ok(
  $$ select public.deplacer_plan('00000000-0000-0000-0000-0000000d3e02', false) $$,
  '42501', null, 'Un lecteur ne déplace pas un plan'
);

select pg_temp.session('00000000-0000-0000-0000-0000000d3c03');

update public.scene_shots set focal_mm = 35 where id = '00000000-0000-0000-0000-0000000d3e01';
update public.project_gear set quantity = 3 where id = '00000000-0000-0000-0000-0000000d3f01';
update public.project_power_settings set voltage_volts = 220
where project_id = '00000000-0000-0000-0000-0000000d3a01';

reset role;

select is(
  (
    select array_agg(id::text order by position) from public.scene_shots
    where scene_id = '00000000-0000-0000-0000-0000000d3b01'
  ),
  array['00000000-0000-0000-0000-0000000d3e02', '00000000-0000-0000-0000-0000000d3e01'],
  'Le plan déplacé a échangé sa place avec son voisin, et le refus du lecteur n''a rien bougé'
);

select is(
  (select focal_mm from public.scene_shots where id = '00000000-0000-0000-0000-0000000d3e01'),
  35,
  'Un administrateur hors équipe modifie un plan'
);

select is(
  (select voltage_volts from public.project_power_settings where project_id = '00000000-0000-0000-0000-0000000d3a01'),
  220,
  'Un administrateur hors équipe modifie les réglages électriques'
);

select is(
  (
    select array_agg(details ->> 'table' order by details ->> 'table') from public.admin_audit_log
    where action = 'intervention_contenu'
      and actor_id = '00000000-0000-0000-0000-0000000d3c03'
      and project_id = '00000000-0000-0000-0000-0000000d3a01'
      and details ->> 'operation' = 'update'
  ),
  array['project_gear', 'project_power_settings', 'scene_shots'],
  'Chaque intervention de l''administrateur est journalisée, table par table'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where project_id = '00000000-0000-0000-0000-0000000d3a01'
      and details ->> 'table' in ('scene_shots', 'project_gear', 'project_power_settings')
      and actor_id <> '00000000-0000-0000-0000-0000000d3c03'
  ),
  0,
  'Le travail de l''équipe sur son découpage et son matériel n''est pas journalisé'
);

-- ---------------------------------------------------------------------------
-- Mode privé
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;

select pg_temp.session('00000000-0000-0000-0000-0000000d3c01');

select set_config('test.plans_prive', (select count(*)::text from public.scene_shots), true);
select set_config('test.materiel_prive', (select count(*)::text from public.project_gear), true);
select set_config('test.reglages_prive', (select count(*)::text from public.project_power_settings), true);

select throws_ok(
  $$ insert into public.scene_shots (project_id, scene_id, position, shot)
     values ('00000000-0000-0000-0000-0000000d3a01', '00000000-0000-0000-0000-0000000d3b01', 3, 'insert') $$,
  '42501', null, 'En mode privé, le porteur n''ajoute plus de plan'
);

select throws_ok(
  $$ insert into public.project_gear (project_id, category, label)
     values ('00000000-0000-0000-0000-0000000d3a01', 'son', 'Perche') $$,
  '42501', null, 'En mode privé, le porteur n''ajoute plus de matériel'
);

select throws_ok(
  $$ insert into public.project_power_settings (project_id)
     values ('00000000-0000-0000-0000-0000000d3a02') $$,
  '42501', null, 'En mode privé, le porteur ne crée plus de réglages'
);

select throws_ok(
  $$ select public.deplacer_plan('00000000-0000-0000-0000-0000000d3e02', false) $$,
  'P0002', null, 'En mode privé, le porteur ne déplace plus un plan : il ne le voit plus'
);

select pg_temp.session('00000000-0000-0000-0000-0000000d3c03');

select set_config(
  'test.plans_prive_admin',
  (select count(*)::text from public.scene_shots where project_id = '00000000-0000-0000-0000-0000000d3a01'),
  true
);
select set_config(
  'test.materiel_prive_admin',
  (select count(*)::text from public.project_gear where project_id = '00000000-0000-0000-0000-0000000d3a01'),
  true
);

reset role;

select is(current_setting('test.plans_prive'), '0', 'En mode privé, le porteur ne lit plus son découpage');
select is(current_setting('test.materiel_prive'), '0', 'En mode privé, le porteur ne lit plus son matériel');
select is(current_setting('test.reglages_prive'), '0', 'En mode privé, le porteur ne lit plus ses réglages');
select is(current_setting('test.plans_prive_admin'), '2', 'En mode privé, un administrateur lit toujours le découpage');
select is(current_setting('test.materiel_prive_admin'), '1', 'En mode privé, un administrateur lit toujours le matériel');

update public.app_settings set private_admin_only = false where id;

-- ---------------------------------------------------------------------------
-- Suppression
-- ---------------------------------------------------------------------------

delete from public.storyboard_scenes where id = '00000000-0000-0000-0000-0000000d3b01';

select is(
  (select count(*)::int from public.scene_shots where project_id = '00000000-0000-0000-0000-0000000d3a01'),
  0,
  'Les plans disparaissent avec leur scène'
);

delete from public.projects where id = '00000000-0000-0000-0000-0000000d3a01';

select is(
  (
    select (select count(*) from public.project_gear where project_id = '00000000-0000-0000-0000-0000000d3a01')
         + (select count(*) from public.project_power_settings where project_id = '00000000-0000-0000-0000-0000000d3a01')
  )::int,
  0,
  'Le matériel et les réglages disparaissent avec leur projet'
);

select * from finish();

rollback;
