-- Durcissements : ce qui ne s'observe que dans le catalogue.
--
-- La forme d'une politique ne change pas ce qu'elle autorise — les tests
-- d'intégration le vérifient — mais son coût, qui ne se voit pas par l'API.

begin;

select plan(4);

-- `(select public.is_admin())` apparaît dans le catalogue sous la forme
-- `( SELECT is_admin() AS is_admin)` : on retire celle-ci, et il ne doit
-- plus rester aucun appel nu.
select is_empty(
  $$
    select schemaname || '.' || tablename || ' : ' || policyname
    from pg_policies
    where regexp_replace(
            coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            'SELECT is_admin\(\) AS is_admin',
            '',
            'g'
          ) like '%is_admin()%'
  $$,
  'Aucune politique n''appelle is_admin() ligne par ligne'
);

select ok(
  not has_function_privilege('anon', 'public.touch_updated_at()', 'execute')
    and not has_function_privilege('authenticated', 'public.touch_updated_at()', 'execute'),
  'touch_updated_at() n''est plus appelable directement'
);

select is(
  (
    select count(*)::int
    from pg_trigger
    where tgfoid = 'public.touch_updated_at()'::regprocedure
      and tgenabled <> 'D'
  ),
  7,
  'Les sept déclencheurs de date de modification restent actifs'
);

-- Le retrait du droit ne doit pas empêcher le déclencheur de s'exécuter
-- pour un compte connecté.
insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-00000000e001', 'porteur-durcissements@exemple.test', 'authenticated', 'authenticated');

insert into public.projects (id, owner_id, title, updated_at)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000e001', 'Projet daté', now() - interval '1 day');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000e001", "role": "authenticated"}',
  true
);

update public.projects set title = 'Projet redaté'
where id = '00000000-0000-0000-0000-0000000000f9';

reset role;

select ok(
  (select updated_at > now() - interval '1 minute' from public.projects where id = '00000000-0000-0000-0000-0000000000f9'),
  'La date de modification suit toujours une écriture faite par un compte connecté'
);

select * from finish();

rollback;
