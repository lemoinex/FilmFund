-- Brouillons des documents (lot ED3) : ce que la suite d'API ne voit pas — la
-- forme de la table, les droits d'un visiteur et du worker, la version de
-- départ posée par la base, le journal d'administration, le mode privé et le
-- sort d'un brouillon quand son document disparaît.
--
-- Les lectures sous RLS sont relevées par des comptages, vérifiés sous le
-- rôle du compte : une ligne invisible ne lève pas d'erreur, elle ne revient
-- simplement pas.

begin;

select plan(27);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000ed301', 'brouillon-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ed302', 'brouillon-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ed303', 'brouillon-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000ed304', 'brouillon-admin@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000ed304';

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000ed3a1', '00000000-0000-0000-0000-0000000ed301', 'Projet au brouillon'),
  ('00000000-0000-0000-0000-0000000ed3a2', '00000000-0000-0000-0000-0000000ed301', 'Autre projet');

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000ed3a1', '00000000-0000-0000-0000-0000000ed302', 'editor'),
  ('00000000-0000-0000-0000-0000000ed3a1', '00000000-0000-0000-0000-0000000ed303', 'viewer');

insert into public.project_documents (id, project_id, type, title, content)
values
  ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'note_intention', 'Note', 'Version A.'),
  ('00000000-0000-0000-0000-0000000ed3d2', '00000000-0000-0000-0000-0000000ed3a1', 'synopsis', 'Synopsis', '');

update public.project_documents set content = 'Version B.'
where id = '00000000-0000-0000-0000-0000000ed3d1';

create function pg_temp.session(p_compte text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_compte, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.versions() returns integer language sql stable as $$
  select count(*)::int from public.project_document_versions
  where document_id = '00000000-0000-0000-0000-0000000ed3d1';
$$;

-- ---------------------------------------------------------------------------
-- Forme et privilèges
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.project_document_drafts', 'select')
    and not has_table_privilege('anon', 'public.project_document_drafts', 'insert')
    and not has_table_privilege('anon', 'public.project_document_drafts', 'delete'),
  'Un visiteur anonyme n''a aucun droit sur les brouillons'
);

select ok(
  not has_any_column_privilege('filmfund_worker', 'public.project_document_drafts', 'select'),
  'Le worker ne lit aucun brouillon'
);

select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'project_document_drafts'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
  ),
  array['content', 'title'],
  'Seuls le titre et le texte d''un brouillon se modifient'
);

select is(
  (
    select array_agg(column_name::text order by column_name::text)
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'project_document_drafts'
      and grantee = 'authenticated' and privilege_type = 'INSERT'
  ),
  array['content', 'document_id', 'project_id', 'title'],
  'Ni le titulaire, ni la version de départ, ni les dates ne s''écrivent à la création'
);

select is(
  (
    select count(*)::int from pg_proc p
    where p.proname in ('dater_base_brouillon', 'journaliser_suppression_brouillon')
      and p.pronamespace = 'public'::regnamespace
      and (
        has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
      )
  ),
  0,
  'Les deux fonctions de déclencheur ne s''appellent pas par l''API'
);

-- Un compte ne supprime que ce qu'il lit : tant que la lecture est fermée, la
-- politique de suppression ne se constate pas par un essai. Elle est donc
-- lue ici, pour qu'elle ne s'ouvre pas sans bruit le jour où la lecture change.
select is(
  (
    select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'project_document_drafts'
      and cmd = 'DELETE' and permissive = 'PERMISSIVE'
      and qual like '%user_id = %auth.uid()%'
      and qual like '%peut_editer_contenu(project_id)%'
      and qual like '%is_admin()%'
  ),
  1,
  'La suppression est réservée au titulaire qui édite le projet, et aux administrateurs'
);

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, user_id, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a2',
             '00000000-0000-0000-0000-0000000ed301', 'Égaré.') $$,
  '23503', null, 'Un brouillon ne se rattache pas au projet d''un autre document'
);

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, user_id, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1',
             '00000000-0000-0000-0000-0000000ed301', repeat('x', 200001)) $$,
  '23514', null, 'Un brouillon ne dépasse pas la longueur d''un document'
);

-- ---------------------------------------------------------------------------
-- Le titulaire
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.session('00000000-0000-0000-0000-0000000ed301');

select lives_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'Note', 'Brouillon du porteur.') $$,
  'Le porteur crée son brouillon'
);

select lives_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d2', '00000000-0000-0000-0000-0000000ed3a1', 'Synopsis', 'Premier jet.') $$,
  'Le porteur crée un brouillon pour un document encore vide'
);

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'Note', 'Un second.') $$,
  '23505', null, 'Un compte n''a qu''un brouillon par document'
);

select throws_ok(
  $$ update public.project_document_drafts set base_version = 99
     where document_id = '00000000-0000-0000-0000-0000000ed3d1' $$,
  '42501', null, 'Le titulaire ne réécrit pas la version de départ de son brouillon'
);

update public.project_document_drafts set content = 'Brouillon du porteur, repris.'
where document_id = '00000000-0000-0000-0000-0000000ed3d1';

-- ---------------------------------------------------------------------------
-- L'éditeur, le lecteur
-- ---------------------------------------------------------------------------

select pg_temp.session('00000000-0000-0000-0000-0000000ed302');

select is(
  (select count(*)::int from public.project_document_drafts),
  0,
  'Un éditeur de l''équipe ne lit pas le brouillon d''un autre'
);

select lives_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'Note', 'Brouillon de l''éditeur.') $$,
  'L''éditeur a son propre brouillon du même document'
);

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, user_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d2', '00000000-0000-0000-0000-0000000ed3a1',
             '00000000-0000-0000-0000-0000000ed301', 'Synopsis', 'Au nom d''un autre.') $$,
  '42501', null, 'Un compte n''écrit pas un brouillon au nom d''un autre'
);

update public.project_document_drafts set content = 'Réécrit par l''éditeur.'
where user_id = '00000000-0000-0000-0000-0000000ed301';
delete from public.project_document_drafts
where user_id = '00000000-0000-0000-0000-0000000ed301';

select pg_temp.session('00000000-0000-0000-0000-0000000ed303');

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'Note', 'Brouillon d''un lecteur.') $$,
  '42501', null, 'Un lecteur n''a pas de brouillon : il n''édite pas le projet'
);

select is(
  (select count(*)::int from public.project_document_drafts),
  0,
  'Un lecteur ne lit aucun brouillon'
);

reset role;

select is(
  (
    select array_agg(content order by user_id) from public.project_document_drafts
    where document_id = '00000000-0000-0000-0000-0000000ed3d1'
  ),
  array['Brouillon du porteur, repris.', 'Brouillon de l''éditeur.'],
  'Le brouillon du porteur a résisté à l''éditeur : ni réécrit, ni supprimé'
);

select is(
  (
    select array_agg(base_version order by document_id) from public.project_document_drafts
    where user_id = '00000000-0000-0000-0000-0000000ed301'
  ),
  array[2, 0],
  'La base pose la version de départ : la dernière du document, zéro s''il n''en a pas'
);

select is(
  pg_temp.versions(),
  2,
  'Aucun brouillon, créé ou modifié, n''a créé de version du document'
);

-- ---------------------------------------------------------------------------
-- Adhésion révoquée
-- ---------------------------------------------------------------------------

delete from public.project_members
where project_id = '00000000-0000-0000-0000-0000000ed3a1'
  and user_id = '00000000-0000-0000-0000-0000000ed302';

set local role authenticated;
select pg_temp.session('00000000-0000-0000-0000-0000000ed302');

select is(
  (select count(*)::int from public.project_document_drafts),
  0,
  'Un éditeur sorti de l''équipe ne lit plus son propre brouillon'
);

-- ---------------------------------------------------------------------------
-- L'administrateur
-- ---------------------------------------------------------------------------

select pg_temp.session('00000000-0000-0000-0000-0000000ed304');

select is(
  (select count(*)::int from public.project_document_drafts),
  3,
  'Un administrateur lit tous les brouillons'
);

update public.project_document_drafts set content = 'Réécrit par l''administrateur.'
where user_id = '00000000-0000-0000-0000-0000000ed301';

insert into public.project_document_drafts (document_id, project_id, title, content)
values ('00000000-0000-0000-0000-0000000ed3d1', '00000000-0000-0000-0000-0000000ed3a1', 'Note', 'Brouillon de l''administrateur.');
delete from public.project_document_drafts
where user_id = '00000000-0000-0000-0000-0000000ed304';

delete from public.project_document_drafts
where user_id = '00000000-0000-0000-0000-0000000ed302';

reset role;

select is(
  (
    select content from public.project_document_drafts
    where document_id = '00000000-0000-0000-0000-0000000ed3d1'
      and user_id = '00000000-0000-0000-0000-0000000ed301'
  ),
  'Brouillon du porteur, repris.',
  'Un administrateur ne réécrit pas le brouillon d''un autre'
);

select is(
  (
    select array_agg(details ->> 'ligne') from public.admin_audit_log
    where action = 'intervention_contenu'
      and actor_id = '00000000-0000-0000-0000-0000000ed304'
      and details ->> 'table' = 'project_document_drafts'
  ),
  array['00000000-0000-0000-0000-0000000ed3d1'],
  'Seule la suppression du brouillon d''un autre est journalisée : ni ses propres écritures, ni l''abandon du sien'
);

-- ---------------------------------------------------------------------------
-- Mode privé
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select pg_temp.session('00000000-0000-0000-0000-0000000ed301');

select is(
  (select count(*)::int from public.project_document_drafts),
  0,
  'En mode privé, un compte ordinaire ne lit plus son brouillon'
);

select throws_ok(
  $$ insert into public.project_document_drafts (document_id, project_id, title, content)
     values ('00000000-0000-0000-0000-0000000ed3d2', '00000000-0000-0000-0000-0000000ed3a2', 'Synopsis', 'Mode privé.') $$,
  null, null, 'En mode privé, un compte ordinaire n''écrit aucun brouillon'
);

reset role;
update public.app_settings set private_admin_only = false where id;

-- ---------------------------------------------------------------------------
-- Suppression en cascade
-- ---------------------------------------------------------------------------

delete from public.project_documents where id = '00000000-0000-0000-0000-0000000ed3d1';

select is(
  (
    select count(*)::int from public.project_document_drafts
    where document_id = '00000000-0000-0000-0000-0000000ed3d1'
  ),
  0,
  'Un brouillon disparaît avec son document'
);

select * from finish();
rollback;
