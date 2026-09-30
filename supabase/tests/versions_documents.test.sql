-- Versions des documents, vues depuis le propriétaire de la base.
--
-- L'API ne montre pas tout : le propriétaire contourne privilèges et RLS.
-- L'ajout seul doit tenir face à lui aussi, et seule la suppression du
-- document doit pouvoir emporter ses versions.

begin;

select plan(10);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000c001', 'porteur-versions@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000c001', 'Projet versionné'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000c001', 'Autre projet');

insert into public.project_documents (id, project_id, type, title, content)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'note_intention', 'Note', 'Version A.');

update public.project_documents set content = 'Version B.'
where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (select count(*)::int from public.project_document_versions where document_id = '00000000-0000-0000-0000-0000000000d1'),
  2,
  'Chaque texte enregistré devient une version'
);

select throws_ok(
  $$ update public.project_document_versions set content = 'Réécrit.' where document_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  null,
  'Le propriétaire de la base ne modifie pas une version'
);

select throws_ok(
  $$ delete from public.project_document_versions where document_id = '00000000-0000-0000-0000-0000000000d1' $$,
  '42501',
  null,
  'Le propriétaire de la base ne supprime pas une version directement'
);

select throws_ok(
  $$ truncate public.project_document_versions $$,
  '42501',
  null,
  'Le propriétaire de la base ne vide pas la table des versions'
);

select throws_ok(
  $$
    insert into public.project_document_versions (document_id, project_id, version_number, title, content)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e2', 3, 'Note', 'Égarée.')
  $$,
  '23503',
  null,
  'Une version ne se rattache pas au projet d''un autre document'
);

select throws_ok(
  $$
    insert into public.project_document_versions (document_id, project_id, version_number, title, content, restored_from)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 3, 'Note', 'Version A.', 3)
  $$,
  '23514',
  null,
  'Une restauration désigne une version antérieure'
);

-- Session du porteur : la restauration passe par sa RLS.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000c001", "role": "authenticated"}',
  true
);

select public.restaurer_version_document(
  (select id from public.project_document_versions
   where document_id = '00000000-0000-0000-0000-0000000000d1' and version_number = 1)
);

-- Enregistrement suivant, dans la même transaction : la marque de
-- restauration ne doit pas le suivre. Par l'API, chaque requête a sa propre
-- transaction, et ce cas ne s'observe pas.
update public.project_documents set content = 'Version C.'
where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (
    select array_agg(restored_from order by version_number)::text
    from public.project_document_versions
    where document_id = '00000000-0000-0000-0000-0000000000d1'
  ),
  '{NULL,NULL,1,NULL}',
  'La marque de restauration ne vaut que pour la restauration elle-même'
);

reset role;

delete from public.project_documents where id = '00000000-0000-0000-0000-0000000000d1';

select is(
  (select count(*)::int from public.project_document_versions where document_id = '00000000-0000-0000-0000-0000000000d1'),
  0,
  'Supprimer le document emporte ses versions, restaurations comprises'
);

select ok(
  has_function_privilege('authenticated', 'public.restaurer_version_document(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.restaurer_version_document(uuid)', 'execute'),
  'La restauration est ouverte aux comptes connectés, pas aux visiteurs'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.restaurer_version_document(uuid)'::regprocedure),
  false,
  'La restauration s''exécute avec les droits de l''appelant, sous sa RLS'
);

select * from finish();

rollback;
