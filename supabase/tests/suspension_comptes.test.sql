-- Suspension d'un compte (lot V2a) : ce que la base tient, lu au catalogue et
-- vu depuis des sessions simulées. Ce que le contrôle de l'API refuse
-- réellement, requête par requête, est éprouvé par
-- tests/suspension-comptes.test.mjs : PostgREST ne se simule pas ici.

begin;

select plan(24);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000a5001', 'admin-suspension@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000b5001', 'membre-suspension@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000c5001', 'autre-suspension@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000d5001', 'second-admin-suspension@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin'
where id in ('00000000-0000-0000-0000-0000000a5001', '00000000-0000-0000-0000-0000000d5001');

insert into public.projects (id, owner_id, title)
values ('00000000-0000-0000-0000-0000000e5001', '00000000-0000-0000-0000-0000000b5001', 'Projet du membre');

-- ---------------------------------------------------------------------------
-- Ce que la table est
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.account_suspensions'::regclass),
  'La RLS est active sur les suspensions'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'account_suspensions'),
  array[
    'Les administrateurs lisent les suspensions',
    'Les administrateurs rétablissent un compte',
    'Les administrateurs suspendent un compte',
    'Mode privé : administrateurs uniquement'
  ],
  'Quatre politiques, dont celle du mode privé ; aucune de modification'
);

select ok(
  (select bool_and(coalesce(qual, with_check) like '%is_admin()%') from pg_policies
   where schemaname = 'public' and tablename = 'account_suspensions'),
  'Chaque politique passe par is_admin()'
);

select ok(
  not has_table_privilege('anon', 'public.account_suspensions', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.account_suspensions', 'select')
    and has_column_privilege('authenticated', 'public.account_suspensions', 'reason', 'insert')
    and not has_column_privilege('authenticated', 'public.account_suspensions', 'suspended_by', 'insert')
    and not has_column_privilege('authenticated', 'public.account_suspensions', 'suspended_at', 'insert')
    and not has_any_column_privilege('authenticated', 'public.account_suspensions', 'update'),
  'Ni l''auteur ni la date ne se fournissent, et rien ne se modifie'
);

-- ---------------------------------------------------------------------------
-- Les trois verrous, lus au catalogue
-- ---------------------------------------------------------------------------

select ok(
  (select rolconfig @> array['pgrst.db_pre_request=public.controle_avant_requete']
   from pg_roles where rolname = 'authenticator'),
  'PostgREST appelle le contrôle avant chaque requête'
);

select ok(
  (select not p.prosecdef from pg_proc p where p.oid = 'public.controle_avant_requete()'::regprocedure)
    and has_function_privilege('anon', 'public.controle_avant_requete()', 'execute')
    and has_function_privilege('authenticated', 'public.controle_avant_requete()', 'execute')
    and has_function_privilege('service_role', 'public.controle_avant_requete()', 'execute'),
  'Le contrôle est exécutable par tous ceux que PostgREST sert, et n''a aucun privilège'
);

select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'public.compte_suspendu()'::regprocedure)
    and has_function_privilege('authenticated', 'public.compte_suspendu()', 'execute')
    and not has_function_privilege('anon', 'public.compte_suspendu()', 'execute')
    and not has_function_privilege('authenticated', 'public.marquer_suspension()', 'execute')
    and not has_function_privilege('authenticated', 'public.journaliser_retablissement()', 'execute')
    and not has_function_privilege('authenticated', 'public.refuser_admin_suspendu()', 'execute')
    and not has_function_privilege('authenticated', 'public.peut_engager_unites_pour(uuid, uuid)', 'execute'),
  'Seule la lecture de son propre état est appelable par un compte'
);

select is(
  (select row(permissive, cmd, roles::text, qual, with_check)::text from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname = 'Compte suspendu : aucun accès'),
  row('RESTRICTIVE'::text, 'ALL'::text, '{authenticated}'::text,
      '(NOT ( SELECT compte_suspendu() AS compte_suspendu))'::text,
      '(NOT ( SELECT compte_suspendu() AS compte_suspendu))'::text)::text,
  'Le stockage refuse un compte suspendu, tous compartiments confondus'
);

-- ---------------------------------------------------------------------------
-- Le contrôle : visiteur, compte ordinaire
-- ---------------------------------------------------------------------------

set local role anon;
select lives_ok(
  $$ select public.controle_avant_requete() $$,
  'Un visiteur passe le contrôle : la vitrine reste servie'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000b5001", "role": "authenticated"}',
  true
);

select lives_ok(
  $$ select public.controle_avant_requete() $$,
  'Un compte qui n''est pas suspendu passe le contrôle'
);

select throws_ok(
  $$ insert into public.account_suspensions (user_id, reason)
     values ('00000000-0000-0000-0000-0000000c5001', 'Un membre tente de suspendre un autre compte.') $$,
  '42501', null, 'Un membre ne suspend personne'
);

-- ---------------------------------------------------------------------------
-- Suspendre : garde-fous
-- ---------------------------------------------------------------------------

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000a5001", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.account_suspensions (user_id, reason)
     values ('00000000-0000-0000-0000-0000000a5001', 'Un administrateur tente de se suspendre.') $$,
  '42501', 'Un administrateur ne suspend pas son propre compte.',
  'Un administrateur ne se suspend pas'
);

select throws_ok(
  $$ insert into public.account_suspensions (user_id, reason)
     values ('00000000-0000-0000-0000-0000000d5001', 'Un administrateur en suspend un autre.') $$,
  '42501', null, 'Un administrateur ne peut pas être suspendu'
);

select throws_ok(
  $$ insert into public.account_suspensions (user_id, reason)
     values ('00000000-0000-0000-0000-0000000b5001', 'Court') $$,
  '23514', null, 'Un motif de moins de dix caractères est refusé'
);

select lives_ok(
  $$ insert into public.account_suspensions (user_id, reason)
     values ('00000000-0000-0000-0000-0000000b5001', '  Usage contraire aux conditions.  ') $$,
  'Un administrateur suspend un membre'
);

select throws_ok(
  $$ update public.account_suspensions set reason = 'Un motif réécrit après coup.'
     where user_id = '00000000-0000-0000-0000-0000000b5001' $$,
  '42501', null, 'Un motif ne se réécrit pas'
);

reset role;

select is(
  (select row(reason, suspended_by)::text from public.account_suspensions
   where user_id = '00000000-0000-0000-0000-0000000b5001'),
  row('Usage contraire aux conditions.'::text, '00000000-0000-0000-0000-0000000a5001'::uuid)::text,
  'Le motif est nettoyé, et l''auteur fixé par la base'
);

select is(
  (select row(actor_id, details ->> 'motif')::text from public.admin_audit_log
   where action = 'suspension_compte'
     and details ->> 'compte' = '00000000-0000-0000-0000-0000000b5001'),
  row('00000000-0000-0000-0000-0000000a5001'::uuid, 'Usage contraire aux conditions.'::text)::text,
  'La suspension est journalisée avec son motif, sous le nom de son auteur'
);

-- ---------------------------------------------------------------------------
-- Suspendu : le contrôle refuse, le worker n'exécute plus, le rôle est figé
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000b5001", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select public.controle_avant_requete() $$,
  'CS001', 'Ce compte est suspendu.', 'Le contrôle refuse un compte suspendu, sous son code'
);

reset role;

select is(
  public.peut_engager_unites_pour(
    '00000000-0000-0000-0000-0000000b5001', '00000000-0000-0000-0000-0000000e5001'
  ),
  false,
  'Le worker n''exécute plus la tâche d''un porteur suspendu'
);

-- En SQL direct, comme l'exploitant : le garde-fou vaut pour tous.
select throws_ok(
  $$ update public.profiles set role = 'admin'
     where id = '00000000-0000-0000-0000-0000000b5001' $$,
  '42501', null, 'Un compte suspendu ne devient pas administrateur'
);

-- ---------------------------------------------------------------------------
-- Rétablir
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-0000000d5001", "role": "authenticated"}',
  true
);

delete from public.account_suspensions
where user_id = '00000000-0000-0000-0000-0000000b5001';

reset role;

select is(
  (select actor_id from public.admin_audit_log
   where action = 'retablissement_compte'
     and details ->> 'compte' = '00000000-0000-0000-0000-0000000b5001'),
  '00000000-0000-0000-0000-0000000d5001'::uuid,
  'Le rétablissement est journalisé sous le nom de son auteur'
);

select is(
  public.peut_engager_unites_pour(
    '00000000-0000-0000-0000-0000000b5001', '00000000-0000-0000-0000-0000000e5001'
  ),
  true,
  'Rétabli, le porteur engage de nouveau des unités'
);

-- Supprimer un compte emporte sa suspension : ce n'est pas un rétablissement.
select set_config('request.jwt.claims', '', true);

insert into public.account_suspensions (user_id, reason)
values ('00000000-0000-0000-0000-0000000c5001', 'Compte suspendu puis supprimé.');

delete from auth.users where id = '00000000-0000-0000-0000-0000000c5001';

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'retablissement_compte'
     and details ->> 'compte' = '00000000-0000-0000-0000-0000000c5001'),
  0,
  'La suppression d''un compte suspendu n''est pas journalisée comme un rétablissement'
);

select * from finish();

rollback;
