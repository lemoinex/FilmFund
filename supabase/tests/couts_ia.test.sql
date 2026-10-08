-- Coûts de l'IA, lecture agrégée (lot Z1) : ses droits, ce qu'elle additionne,
-- et ce que la RLS des registres lui laisse voir sous chaque identité.

begin;

select plan(14);

select ok(
  has_function_privilege('authenticated', 'public.couts_ia_par_mois()', 'execute')
    and not has_function_privilege('anon', 'public.couts_ia_par_mois()', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.couts_ia_par_mois()', 'execute'),
  'La lecture est ouverte aux comptes, fermée aux visiteurs et au worker'
);

-- Sous les droits de l'appelant : c'est la RLS des registres qui décide. Une
-- fonction `security definer` montrerait les coûts à tout compte connecté.
select ok(
  (select not prosecdef and provolatile = 's' from pg_proc
   where oid = 'public.couts_ia_par_mois()'::regprocedure),
  'La fonction lit avec les droits de l''appelant, sans rien écrire'
);

select is(
  (
    select array_agg(p.tablename || ' : ' || p.qual order by p.tablename)
    from pg_policies p
    where p.schemaname = 'public' and p.permissive = 'PERMISSIVE' and p.cmd = 'SELECT'
      and p.tablename in ('provider_charges', 'provider_charge_settlements',
                          'provider_search_charges', 'provider_search_settlements')
  ),
  array[
    'provider_charge_settlements : ( SELECT is_admin() AS is_admin)',
    'provider_charges : ( SELECT is_admin() AS is_admin)',
    'provider_search_charges : ( SELECT is_admin() AS is_admin)',
    'provider_search_settlements : ( SELECT is_admin() AS is_admin)'
  ],
  'Les quatre registres ne se lisent que des administrateurs : la fonction en dépend'
);

select is(
  (select coalesce(sum(compte), 0) from public.couts_ia_par_mois()
   where mois = date_trunc('month', now() at time zone 'utc')::date),
  public.depense_ia_du_mois(),
  'La somme du mois courant est la dépense que le plafond compte'
);

-- Des appels d'un profil qui n'existe pas ailleurs, ce mois-ci : un soldé, un
-- sans issue, un au tarif inconnu servi par un repli, un refusé sans coût.
insert into public.provider_charges
  (attempt_id, job_id, studio_id, project_id, provider, model, profile,
   estimated_input_tokens, estimated_output_tokens, estimated_usd)
values
  ('00000000-0000-0000-0000-00000000c001', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1000, 2000, 0.500000),
  ('00000000-0000-0000-0000-00000000c002', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1000, 2000, 0.300000),
  ('00000000-0000-0000-0000-00000000c003', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1000, 2000, 0.200000),
  ('00000000-0000-0000-0000-00000000c004', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1000, 2000, 0.400000);

insert into public.provider_charge_settlements
  (attempt_id, model, input_tokens, output_tokens, usd, fallback)
values
  ('00000000-0000-0000-0000-00000000c001', 'modele-a', 800, 1500, 0.100000, false),
  ('00000000-0000-0000-0000-00000000c003', 'modele-b', 700, 900, null, true),
  ('00000000-0000-0000-0000-00000000c004', 'modele-a', 0, 0, 0, false);

-- Une recherche soldée, et un appel de treize mois : hors de la fenêtre.
insert into public.provider_search_charges
  (attempt_id, job_id, studio_id, project_id, provider, profile, estimated_requests, estimated_usd)
values
  ('00000000-0000-0000-0000-00000000c005', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'perplexity', 'essai.z1@1', 3, 0.015000);

insert into public.provider_search_settlements (attempt_id, requests, usd)
values ('00000000-0000-0000-0000-00000000c005', 2, 0.010000);

insert into public.provider_charges
  (attempt_id, job_id, studio_id, project_id, provider, model, profile,
   estimated_input_tokens, estimated_output_tokens, estimated_usd, created_at)
values
  ('00000000-0000-0000-0000-00000000c006', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1, 1, 9.000000,
   date_trunc('month', now() at time zone 'utc') - interval '12 months' + interval '1 day'),
  ('00000000-0000-0000-0000-00000000c007', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
   'anthropic', 'modele-a', 'essai.z1@1', 1, 1, 7.000000,
   date_trunc('month', now() at time zone 'utc') - interval '11 months' + interval '1 day');

select results_eq(
  $$ select modele, appels, non_soldes, a_rapprocher, sans_cout, replis,
            jetons_entree, jetons_sortie, requetes, compte, dont_reserve
     from public.couts_ia_par_mois()
     where profil = 'essai.z1@1' and mois = date_trunc('month', now() at time zone 'utc')::date
     order by modele nulls last $$,
  $$ values
       ('modele-a'::text, 3::bigint, 1::bigint, 0::bigint, 1::bigint, 0::bigint,
        800::bigint, 1500::bigint, 0::bigint, 0.400000::numeric, 0.300000::numeric),
       ('modele-b', 1, 0, 1, 0, 1, 700, 900, 0, 0.200000, 0.200000),
       (null, 1, 0, 0, 0, 0, 0, 0, 2, 0.010000, 0) $$,
  'Chaque appel est compté une fois, sous le modèle qui a répondu, au coût confirmé ou à sa réserve'
);

select is(
  (select coalesce(sum(compte), 0) from public.couts_ia_par_mois()
   where mois = date_trunc('month', now() at time zone 'utc')::date),
  public.depense_ia_du_mois(),
  'Après ces appels, la somme du mois reste la dépense que le plafond compte'
);

select is(
  (select array_agg(compte order by mois) from public.couts_ia_par_mois()
   where profil = 'essai.z1@1' and mois < date_trunc('month', now() at time zone 'utc')::date),
  array[7.000000::numeric],
  'Onze mois avant celui-ci sont lus ; le douzième ne l''est plus'
);

select is(
  (select count(distinct mois) from public.couts_ia_par_mois()) <= 12,
  true,
  'Douze mois au plus'
);

select is(
  (
    select array_agg(a.attname::text order by a.attnum)
    from pg_proc p, unnest(p.proargnames) with ordinality as a(attname, attnum)
    where p.oid = 'public.couts_ia_par_mois()'::regprocedure
  ),
  array['mois', 'fournisseur', 'profil', 'modele', 'appels', 'non_soldes', 'a_rapprocher',
        'sans_cout', 'replis', 'jetons_entree', 'jetons_sortie', 'requetes', 'compte',
        'dont_reserve'],
  'Ni studio, ni projet, ni tâche, ni compte dans ce que la fonction rend'
);

-- Deux comptes : une administratrice et un membre.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000c71a1', 'couts-admin@exemple.test'),
  ('00000000-0000-0000-0000-0000000c71a2', 'couts-membre@exemple.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000c71a1';

set local role authenticated;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c71a2","role":"authenticated"}', true);
select is_empty(
  $$ select * from public.couts_ia_par_mois() $$,
  'Un compte ordinaire ne lit aucun coût'
);

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select is_empty(
  $$ select * from public.couts_ia_par_mois() $$,
  'Sans identité, aucun coût n''est lu'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000c71a1","role":"authenticated"}', true);
select is(
  (select count(*) from public.couts_ia_par_mois() where profil = 'essai.z1@1'),
  4::bigint,
  'Une administratrice lit les lignes du profil : trois ce mois-ci, une il y a onze mois'
);

select is(
  (select sum(appels) from public.couts_ia_par_mois() where profil = 'essai.z1@1'),
  6::numeric,
  'Elle y compte les six appels de la fenêtre'
);

reset role;

select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ set local role anon; select * from public.couts_ia_par_mois(); $$,
  '42501', null, 'Un visiteur n''exécute pas la fonction'
);

select * from finish();

rollback;
