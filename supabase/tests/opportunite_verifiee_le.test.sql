-- Opportunités, date de vérification (lot W2) : la base la pose seule, au bon
-- moment, et personne ne la réécrit.

begin;

select plan(14);

select is(
  (
    select data_type || ' ' || is_nullable || ' ' || coalesce(column_default, 'sans défaut')
    from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_opportunities'
      and column_name = 'verified_at'
  ),
  'timestamp with time zone YES sans défaut',
  'La date de vérification est un instant, nul tant qu''on ne le connaît pas'
);

select ok(
  has_column_privilege('authenticated', 'public.funding_opportunities', 'verified_at', 'select')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'verified_at', 'insert')
    and not has_column_privilege('authenticated', 'public.funding_opportunities', 'verified_at', 'update')
    and not has_column_privilege('anon', 'public.funding_opportunities', 'verified_at', 'select'),
  'Un compte lit la date ; il ne la fournit ni ne la modifie ; un visiteur ne la lit pas'
);

select ok(
  (select tgenabled = 'O' from pg_trigger where tgname = 'funding_opportunities_verifiee_le')
    and not has_function_privilege('authenticated', 'public.dater_verification()', 'execute'),
  'Le déclencheur est actif, et sa fonction ne s''appelle pas directement'
);

-- Une administratrice et un compte ordinaire.
insert into auth.users (id, email)
values
  ('00000000-0000-0000-0000-0000000e21a1', 'verif-admin@exemple.test'),
  ('00000000-0000-0000-0000-0000000e21a2', 'verif-membre@exemple.test');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000e21a1';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e21a1","role":"authenticated"}', true);

insert into public.funding_opportunities (name, organization, category, status)
values ('Fonds du lot W2', 'Organisme du lot W2', 'fonds', 'non_verifie');

insert into public.funding_opportunities
  (name, organization, category, status, source_url, collected_on, source_excerpt)
values
  ('Bourse du lot W2', 'Organisme du lot W2', 'bourse', 'verifie',
   'https://exemple.test/bourse', current_date, 'Extrait de la page consultée pour ce test.');

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  null,
  'Une opportunité saisie sans être vérifiée n''a pas de date'
);

select is(
  (select verified_at from public.funding_opportunities where name = 'Bourse du lot W2'),
  now(),
  'Une opportunité créée vérifiée est datée à sa création'
);

update public.funding_opportunities
set status = 'verifie', source_url = 'https://exemple.test/fonds', collected_on = current_date,
    source_excerpt = 'Extrait de la page consultée pour ce test.'
where name = 'Fonds du lot W2';

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  now(),
  'Elle est datée à l''instant où elle devient vérifiée'
);

-- L'écran ne fournit pas cette date : la colonne ne lui est pas accordée.
select throws_ok(
  $$ update public.funding_opportunities set verified_at = now() - interval '1 year'
     where name = 'Fonds du lot W2' $$,
  '42501', null, 'Une administratrice ne réécrit pas la date depuis l''écran'
);

select throws_ok(
  $$ insert into public.funding_opportunities (name, organization, category, status, verified_at)
     values ('Antidatée', 'Organisme du lot W2', 'fonds', 'non_verifie', now()) $$,
  '42501', null, 'Ni ne la fournit à la création'
);

reset role;

-- Même l'exploitant, en SQL direct, ne la réécrit pas : le déclencheur la garde.
update public.funding_opportunities set verified_at = now() - interval '1 year'
where name = 'Fonds du lot W2';

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  now(),
  'Une requête directe ne déplace pas la date'
);

-- Pour distinguer une date gardée d'une date reposée, on l'antidate
-- déclencheur coupé : dans une transaction, `now()` ne bouge pas.
alter table public.funding_opportunities disable trigger funding_opportunities_verifiee_le;
update public.funding_opportunities set verified_at = now() - interval '20 days'
where name = 'Fonds du lot W2';
alter table public.funding_opportunities enable trigger funding_opportunities_verifiee_le;

update public.funding_opportunities set description = 'Une faute de frappe corrigée.'
where name = 'Fonds du lot W2';

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  now() - interval '20 days',
  'Corriger une opportunité vérifiée ne la rend pas nouvelle'
);

update public.funding_opportunities set status = 'expire' where name = 'Fonds du lot W2';

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  now() - interval '20 days',
  'Quitter le statut « vérifiée » garde la date de la dernière vérification'
);

update public.funding_opportunities set status = 'verifie' where name = 'Fonds du lot W2';

select is(
  (select verified_at from public.funding_opportunities where name = 'Fonds du lot W2'),
  now(),
  'Y revenir la date de nouveau : l''opportunité redevient visible, donc nouvelle'
);

-- Un compte ordinaire lit la date d'une opportunité vérifiée, comme le reste
-- de la ligne ; il ne lit toujours pas ce qui n'est pas vérifié.
insert into public.funding_opportunities (name, organization, category, status)
values ('En attente du lot W2', 'Organisme du lot W2', 'fonds', 'non_verifie');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000e21a2","role":"authenticated"}', true);

select is(
  (select count(verified_at) from public.funding_opportunities
   where organization = 'Organisme du lot W2'),
  2::bigint,
  'Un compte lit la date des deux opportunités vérifiées'
);

select is(
  (select count(*) from public.funding_opportunities where name = 'En attente du lot W2'),
  0::bigint,
  'Et ne lit toujours pas celle qui attend sa vérification'
);

reset role;

select * from finish();

rollback;
