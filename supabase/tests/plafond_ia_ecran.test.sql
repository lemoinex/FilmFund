-- Plafond mensuel des dépenses d'IA, lecture de l'écran (lot Y1) : les droits
-- de la fonction, lus au catalogue, et ce qu'elle rend sous chaque identité.
-- Le changement du plafond et son journal sont éprouvés depuis l'API par
-- tests/plafond-ia-ecran.test.mjs.

begin;

select plan(11);

select ok(
  has_function_privilege('authenticated', 'public.depense_ia_administration()', 'execute')
    and not has_function_privilege('anon', 'public.depense_ia_administration()', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.depense_ia_administration()', 'execute'),
  'La lecture est ouverte aux comptes, fermée aux visiteurs et au worker'
);

select ok(
  not has_function_privilege('authenticated', 'public.depense_ia_du_mois()', 'execute')
    and not has_function_privilege('anon', 'public.depense_ia_du_mois()', 'execute'),
  'La fonction du worker reste fermée aux comptes : la migration ne l''a pas ouverte'
);

select ok(
  (select prosecdef and provolatile = 's' from pg_proc
   where oid = 'public.depense_ia_administration()'::regprocedure),
  'La fonction lit avec les droits de son propriétaire, sans rien écrire'
);

-- Le contrôle se lit dans la fonction en place : c'est lui, et lui seul, qui
-- sépare un administrateur d'un compte ordinaire.
select ok(
  (select prosrc from pg_proc where oid = 'public.depense_ia_administration()'::regprocedure)
    ~ 'if \(select auth\.uid\(\)\) is null or not public\.is_admin\(\) then\s+raise exception [^;]+using errcode = ''42501''',
  'Elle refuse quiconque n''est pas administrateur, session absente comprise'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.depense_ia_administration()'::regprocedure)
    ~ 'select public\.depense_ia_du_mois\(\), s\.monthly_budget_usd\s+from public\.ai_settings s',
  'Elle rend la dépense telle que le worker la compte : un seul calcul'
);

-- L'écran écrit le plafond sous la RLS. Un compte ordinaire ne lit pas la
-- ligne, si bien qu'une politique d'écriture relâchée ne se verrait pas depuis
-- l'API : elle se lit ici, au catalogue.
select is(
  (
    select array_agg(p.cmd || ' : ' || p.qual || ' / ' || coalesce(p.with_check, '—') order by p.cmd)
    from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'ai_settings' and p.permissive = 'PERMISSIVE'
  ),
  array[
    'SELECT : ( SELECT is_admin() AS is_admin) / —',
    'UPDATE : ( SELECT is_admin() AS is_admin) / ( SELECT is_admin() AS is_admin)'
  ],
  'Seuls les administrateurs lisent et modifient le plafond ; personne n''en crée ni n''en supprime'
);

select ok(
  has_column_privilege('authenticated', 'public.ai_settings', 'monthly_budget_usd', 'update')
    and not has_column_privilege('authenticated', 'public.ai_settings', 'id', 'update')
    and not has_table_privilege('authenticated', 'public.ai_settings', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_settings', 'delete')
    and not has_table_privilege('anon', 'public.ai_settings', 'select'),
  'Un compte n''écrit que le montant : ni l''identifiant, ni une seconde ligne, ni une suppression'
);

-- Deux comptes : une administratrice et un membre.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000a71a1', 'plafond-admin@exemple.test'),
  ('00000000-0000-0000-0000-0000000a71a2', 'plafond-membre@exemple.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000a71a1';

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a71a2","role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.depense_ia_administration() $$,
  '42501', null, 'Un compte ordinaire ne lit pas la dépense'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok(
  $$ select * from public.depense_ia_administration() $$,
  '42501', null, 'Sans identité, la lecture est refusée'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a71a1","role":"authenticated"}', true);
select is(
  (select count(*) from public.depense_ia_administration()),
  1::bigint,
  'Une administratrice lit une ligne, et une seule'
);

select is(
  (select plafond from public.depense_ia_administration()),
  (select monthly_budget_usd from public.ai_settings),
  'Le plafond rendu est celui de la table'
);

reset role;

select * from finish();

rollback;
