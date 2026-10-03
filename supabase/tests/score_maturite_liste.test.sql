-- Score de maturité (lot S2) : les faits de plusieurs projets en une lecture,
-- vus depuis la base.
--
-- Les listes de projets affichent un score par carte. La fonction groupée ne
-- rend que les projets dont l'appelant gère le budget : c'est elle qui décide
-- de ce qu'une liste peut montrer. La transaction est annulée.

begin;

select plan(15);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000005d001', 'liste-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005d002', 'liste-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005d003', 'liste-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005d004', 'liste-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000005d005', 'liste-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000005d004';

-- Deux projets, de deux porteurs : au plan Gratuit, un studio n'en a qu'un.
insert into public.projects (id, owner_id, title, logline, genre)
values
  (
    '00000000-0000-0000-0000-00000005d0a1', '00000000-0000-0000-0000-00000005d001',
    'Projet en liste', 'Le pitch.', 'drame'
  ),
  (
    '00000000-0000-0000-0000-00000005d0a2', '00000000-0000-0000-0000-00000005d005',
    'Projet voisin', '', null
  );

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-00000005d0a1', '00000000-0000-0000-0000-00000005d002', 'editor'),
  ('00000000-0000-0000-0000-00000005d0a1', '00000000-0000-0000-0000-00000005d003', 'viewer');

insert into public.project_budgets (project_id, currency)
values ('00000000-0000-0000-0000-00000005d0a1', 'XAF');

-- Les deux projets, et un identifiant qui n'existe pas.
select set_config(
  'test.demandes',
  '{00000000-0000-0000-0000-00000005d0a1,00000000-0000-0000-0000-00000005d0a2,00000000-0000-0000-0000-00000005d0ff}',
  true
);

-- ---------------------------------------------------------------------------
-- La fonction
-- ---------------------------------------------------------------------------

select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.faits_maturite_projets(uuid[])'::regprocedure),
  false,
  'La lecture groupée s''exécute sous la RLS de l''appelant, sans security definer'
);

select ok(
  not has_function_privilege('anon', 'public.faits_maturite_projets(uuid[])', 'execute')
  and has_function_privilege('authenticated', 'public.faits_maturite_projets(uuid[])', 'execute'),
  'Les comptes connectés l''appellent ; les visiteurs, non'
);

-- ---------------------------------------------------------------------------
-- Ce que chaque rôle obtient
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d001", "role": "authenticated"}', true);

select is(
  (
    select array_agg(f.project_id order by f.project_id)
    from public.faits_maturite_projets(current_setting('test.demandes')::uuid[]) f
  ),
  array['00000000-0000-0000-0000-00000005d0a1']::uuid[],
  'Le porteur n''obtient que son projet : ni celui d''un autre, ni un projet inexistant'
);

select is(
  (
    select f.faits
    from public.faits_maturite_projets(current_setting('test.demandes')::uuid[]) f
  ),
  public.faits_maturite('00000000-0000-0000-0000-00000005d0a1'),
  'Les faits rendus en lot sont ceux de la lecture d''un seul projet'
);

select is(
  (
    select bool_and(jsonb_typeof(valeur) in ('boolean', 'number'))
    from public.faits_maturite_projets(current_setting('test.demandes')::uuid[]) f,
      jsonb_each(f.faits) as e(cle, valeur)
  ),
  true,
  'En lot aussi, les faits ne sont que des compteurs et des oui/non'
);

select is(
  (select count(*)::int from public.faits_maturite_projets(null)),
  0,
  'Sans identifiant, aucune ligne'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d002", "role": "authenticated"}', true);

select is(
  (
    select array_agg(f.project_id order by f.project_id)
    from public.faits_maturite_projets(current_setting('test.demandes')::uuid[]) f
  ),
  array['00000000-0000-0000-0000-00000005d0a1']::uuid[],
  'Un éditeur obtient le projet dont il gère le budget'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d003", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.faits_maturite_projets(current_setting('test.demandes')::uuid[])),
  0,
  'Un lecteur n''obtient aucune ligne pour le projet qu''il lit : le score ne lui est pas dû'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d005", "role": "authenticated"}', true);

select is(
  (
    select array_agg(f.project_id order by f.project_id)
    from public.faits_maturite_projets(current_setting('test.demandes')::uuid[]) f
  ),
  array['00000000-0000-0000-0000-00000005d0a2']::uuid[],
  'Un compte étranger au premier projet n''obtient que le sien'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d004", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.faits_maturite_projets(current_setting('test.demandes')::uuid[])),
  2,
  'Un administrateur hors des équipes obtient les deux projets'
);

-- ---------------------------------------------------------------------------
-- Plafond
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ select * from public.faits_maturite_projets(
       (select array_agg(gen_random_uuid()) from generate_series(1, 100))
     ) $$,
  'Cent projets se lisent en une fois'
);

select throws_ok(
  $$ select * from public.faits_maturite_projets(
       (select array_agg(gen_random_uuid()) from generate_series(1, 101))
     ) $$,
  '22023',
  null,
  'Au-delà de cent projets, la lecture est refusée'
);

-- ---------------------------------------------------------------------------
-- Mode privé
-- ---------------------------------------------------------------------------

reset role;
select set_config('request.jwt.claims', '', true);
update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d001", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.faits_maturite_projets(current_setting('test.demandes')::uuid[])),
  0,
  'En mode privé, le porteur n''obtient plus rien en lot'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000005d004", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.faits_maturite_projets(current_setting('test.demandes')::uuid[])),
  2,
  'En mode privé, un administrateur obtient toujours les projets demandés'
);

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.faits_maturite_projets(current_setting('test.demandes')::uuid[])),
  0,
  'Sans session, la fonction ne rend rien : elle ne s''appuie sur aucun droit qui lui serait propre'
);

select * from finish();

rollback;
