-- Le scénario d'un épisode (lot SE3a) : droits lus au catalogue et règles de
-- la colonne. Ce que lisent et écrivent réellement le porteur, un éditeur, un
-- lecteur, un étranger et un administrateur est éprouvé par
-- tests/scenarios-episodes.test.mjs.

begin;

select plan(17);

select is(
  (
    select array[data_type::text, is_nullable::text, coalesce(column_default::text, 'aucun')]
    from information_schema.columns
    where table_schema = 'public' and table_name = 'project_documents'
      and column_name = 'episode_id'
  ),
  array['uuid', 'YES', 'aucun'],
  'La colonne est facultative, sans défaut : un document n''est rattaché à rien tant qu''on ne le dit pas'
);

select ok(
  has_column_privilege('authenticated', 'public.project_documents', 'episode_id', 'update')
    and has_column_privilege('authenticated', 'public.project_documents', 'episode_id', 'insert')
    and not has_column_privilege('anon', 'public.project_documents', 'episode_id', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_documents', 'select')
    -- Ce que le lot n'a pas à ouvrir reste fermé.
    and not has_column_privilege('authenticated', 'public.project_documents', 'project_id', 'update')
    and not has_column_privilege('authenticated', 'public.project_documents', 'created_by', 'update'),
  'Le rattachement s''écrit comme le reste du document ; ni visiteur ni worker ne le lisent'
);

select ok(
  not has_function_privilege('authenticated', 'public.controler_episode_du_document()', 'execute')
    and not has_function_privilege('anon', 'public.controler_episode_du_document()', 'execute')
    and not (select prosecdef from pg_proc where oid = 'public.controler_episode_du_document()'::regprocedure),
  'La fonction de déclencheur ne s''appelle pas directement, et s''exécute sous les droits de l''appelant'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'project_documents'),
  array[
    'Création de documents',
    'L''équipe et les administrateurs lisent les documents',
    'Mode privé : administrateurs uniquement',
    'Modification de documents',
    'Suppression de documents'
  ],
  'Aucune politique des documents n''a changé'
);

-- Rattacher ne crée aucune version : seuls le titre et le contenu en créent.
select is(
  (select pg_get_triggerdef(oid) ~ 'UPDATE OF title, content ON' from pg_trigger
   where tgrelid = 'public.project_documents'::regclass and tgname = 'project_documents_versions'),
  true,
  'Les versions ne naissent que d''un titre ou d''un contenu changés'
);

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000e3a01', 'scenarios-sql@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title, format)
values
  ('00000000-0000-0000-0000-0000000e3aa1', '00000000-0000-0000-0000-0000000e3a01', 'Série d''essai', 'serie'),
  ('00000000-0000-0000-0000-0000000e3aa2', '00000000-0000-0000-0000-0000000e3a01', 'Autre série', 'serie');

insert into public.project_episodes (id, project_id, number, title)
values
  ('00000000-0000-0000-0000-0000000e3ae1', '00000000-0000-0000-0000-0000000e3aa1', 1, 'Pilote'),
  ('00000000-0000-0000-0000-0000000e3ae2', '00000000-0000-0000-0000-0000000e3aa1', 2, 'Le filet'),
  ('00000000-0000-0000-0000-0000000e3ae9', '00000000-0000-0000-0000-0000000e3aa2', 1, 'Ailleurs');

prepare creer(uuid, uuid, public.document_type, text, uuid) as
  insert into public.project_documents (id, project_id, type, title, episode_id)
  values ($1, $2, $3, $4, $5);

select lives_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad0', '00000000-0000-0000-0000-0000000e3aa1',
       'scenario', 'Scénario général', null) $$,
  'Un scénario sans épisode reste possible'
);

select lives_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad1', '00000000-0000-0000-0000-0000000e3aa1',
       'scenario', 'Scénario — épisode 1', '00000000-0000-0000-0000-0000000e3ae1') $$,
  'Un scénario se rattache à un épisode de son projet'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad2', '00000000-0000-0000-0000-0000000e3aa1',
       'scenario', 'Second scénario', '00000000-0000-0000-0000-0000000e3ae1') $$,
  '23505', null, 'Un épisode n''a pas deux scénarios'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad3', '00000000-0000-0000-0000-0000000e3aa1',
       'note_intention', 'Note d''intention', '00000000-0000-0000-0000-0000000e3ae2') $$,
  '23514', null, 'Seul un scénario se rattache à un épisode'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad4', '00000000-0000-0000-0000-0000000e3aa1',
       'scenario', 'Épisode d''un autre projet', '00000000-0000-0000-0000-0000000e3ae9') $$,
  'SE003', null, 'L''épisode d''un autre projet est refusé'
);

select throws_ok(
  $$ execute creer('00000000-0000-0000-0000-0000000e3ad5', '00000000-0000-0000-0000-0000000e3aa1',
       'scenario', 'Épisode inconnu', '00000000-0000-0000-0000-0000000effff') $$,
  'SE003', null, 'Un épisode qui n''existe pas est refusé, avant même la clé étrangère'
);

-- Les mêmes règles à la modification.
select throws_ok(
  $$ update public.project_documents set type = 'traitement'
     where id = '00000000-0000-0000-0000-0000000e3ad1' $$,
  '23514', null, 'Un scénario rattaché ne change pas de type'
);

select throws_ok(
  $$ update public.project_documents set episode_id = '00000000-0000-0000-0000-0000000e3ae1'
     where id = '00000000-0000-0000-0000-0000000e3ad0' $$,
  '23505', null, 'Rattacher à un épisode déjà pourvu est refusé'
);

select throws_ok(
  $$ update public.project_documents set episode_id = '00000000-0000-0000-0000-0000000e3ae9'
     where id = '00000000-0000-0000-0000-0000000e3ad0' $$,
  'SE003', null, 'Rattacher à l''épisode d''un autre projet est refusé'
);

-- Un premier texte : la version 1 du document, contre laquelle le
-- rattachement se mesure.
update public.project_documents set content = 'INT. BERGE — JOUR'
where id = '00000000-0000-0000-0000-0000000e3ad0';

select lives_ok(
  $$ update public.project_documents set episode_id = '00000000-0000-0000-0000-0000000e3ae2'
     where id = '00000000-0000-0000-0000-0000000e3ad0' $$,
  'Un scénario sans épisode se rattache à un épisode libre'
);

-- Rattacher n'a créé aucune version : le document garde celle de son premier texte.
select is(
  (select count(*)::int from public.project_document_versions
   where document_id = '00000000-0000-0000-0000-0000000e3ad0'),
  1,
  'Rattacher un scénario ne crée aucune version'
);

-- Retirer un épisode ne supprime pas son scénario : le lien disparaît, le texte reste.
delete from public.project_episodes where id = '00000000-0000-0000-0000-0000000e3ae1';

select is(
  (select array[title, coalesce(episode_id::text, 'sans épisode')] from public.project_documents
   where id = '00000000-0000-0000-0000-0000000e3ad1'),
  array['Scénario — épisode 1', 'sans épisode'],
  'Retirer un épisode garde son scénario, détaché'
);

select * from finish();

rollback;
