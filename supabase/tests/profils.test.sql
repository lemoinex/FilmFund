-- Profil professionnel (lot Q1) : forme des champs, et qui les lit ou les
-- modifie, vu depuis des sessions simulées au niveau SQL.
--
-- Les lectures sous RLS sont relevées dans un réglage de session, puis
-- vérifiées une fois le rôle rendu : une ligne invisible ne lève pas d'erreur,
-- elle ne revient simplement pas.

begin;

select plan(30);

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000a0f1', 'admin-profil@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000b0f1', 'membre-profil@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000c0f1', 'autre-profil@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-00000000a0f1';

-- ---------------------------------------------------------------------------
-- Valeurs à la naissance du compte
-- ---------------------------------------------------------------------------

select is(
  (
    select row(first_name, last_name, country, city, profession, profile_type)::text
    from public.profiles
    where id = '00000000-0000-0000-0000-00000000b0f1'
  ),
  row(''::text, ''::text, null::text, ''::text, ''::text, null::public.profile_type)::text,
  'Un compte naît avec un profil professionnel vide'
);

-- ---------------------------------------------------------------------------
-- Forme des champs : les contraintes valent pour tous, exploitant compris
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.profiles set first_name = repeat('a', 80), last_name = repeat('é', 80)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  'Prénom et nom de 80 caractères sont admis'
);

select throws_ok(
  $$ update public.profiles set first_name = repeat('a', 81)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un prénom de 81 caractères est refusé'
);

select throws_ok(
  $$ update public.profiles set last_name = repeat('a', 81)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un nom de 81 caractères est refusé'
);

select lives_ok(
  $$ update public.profiles set city = repeat('a', 120), profession = repeat('a', 120)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  'Ville et profession de 120 caractères sont admises'
);

select throws_ok(
  $$ update public.profiles set city = repeat('a', 121)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Une ville de 121 caractères est refusée'
);

select throws_ok(
  $$ update public.profiles set profession = repeat('a', 121)
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Une profession de 121 caractères est refusée'
);

select throws_ok(
  $$ update public.profiles set first_name = 'Awa' || chr(10) || 'Marie'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un prénom sur deux lignes est refusé'
);

select throws_ok(
  $$ update public.profiles set city = 'Da' || chr(27) || 'kar'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un caractère de contrôle dans la ville est refusé'
);

select lives_ok(
  $$ update public.profiles set country = 'CM'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  'Un code de pays à deux majuscules est admis'
);

select throws_ok(
  $$ update public.profiles set country = 'cm'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un code de pays en minuscules est refusé'
);

select throws_ok(
  $$ update public.profiles set country = 'CMR'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un code de pays à trois lettres est refusé'
);

select throws_ok(
  $$ update public.profiles set country = ''
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '23514', null, 'Un pays vide est refusé : l''absence de pays est nulle'
);

select lives_ok(
  $$ update public.profiles set country = null, profile_type = 'DIRECTOR'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  'Le pays peut être retiré, et un type connu est admis'
);

select throws_ok(
  $$ update public.profiles set profile_type = 'ADMIN'
     where id = '00000000-0000-0000-0000-00000000c0f1' $$,
  '22P02', null, 'Un type de profil inconnu est refusé'
);

-- Retour à un profil vide pour la suite.
update public.profiles
set first_name = '', last_name = '', city = '', profession = '', country = null, profile_type = null
where id = '00000000-0000-0000-0000-00000000c0f1';

-- ---------------------------------------------------------------------------
-- Session d'un membre : son profil, et lui seul
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000b0f1", "role": "authenticated"}',
  true
);

update public.profiles
set first_name = 'Bintou', last_name = 'Ngono', country = 'CM', city = 'Douala',
    profession = 'Productrice', profile_type = 'PRODUCER'
where id = '00000000-0000-0000-0000-00000000b0f1';

update public.profiles set city = 'PIRATE'
where id = '00000000-0000-0000-0000-00000000c0f1';

select set_config(
  'test.profils_vus',
  (
    select count(*)::text from public.profiles
    where id <> '00000000-0000-0000-0000-00000000b0f1'
  ),
  true
);

-- Le rôle ne se glisse pas dans une mise à jour du profil.
select throws_ok(
  $$ update public.profiles set city = 'Yaoundé', role = 'admin'
     where id = '00000000-0000-0000-0000-00000000b0f1' $$,
  '42501', null, 'Un membre ne change pas son rôle en modifiant son profil'
);

reset role;

select is(
  (
    select row(first_name, last_name, country, city, profession, profile_type)::text
    from public.profiles
    where id = '00000000-0000-0000-0000-00000000b0f1'
  ),
  row('Bintou'::text, 'Ngono'::text, 'CM'::text, 'Douala'::text, 'Productrice'::text,
      'PRODUCER'::public.profile_type)::text,
  'Un membre complète son propre profil'
);

select is(
  (select city from public.profiles where id = '00000000-0000-0000-0000-00000000c0f1'),
  '',
  'Un membre ne modifie pas le profil d''un autre compte'
);

select is(
  current_setting('test.profils_vus'),
  '0',
  'Un membre ne lit le profil de personne d''autre'
);

select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000b0f1'),
  'member',
  'Le rôle du membre n''a pas changé'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where details ->> 'compte' = '00000000-0000-0000-0000-00000000b0f1'
  ),
  0,
  'Un compte qui modifie son propre profil n''est pas journalisé'
);

-- ---------------------------------------------------------------------------
-- Session d'un administrateur : tout profil, avec une trace
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000a0f1", "role": "authenticated"}',
  true
);

update public.profiles set profession = 'Scénariste confidentielle', city = 'Kribi'
where id = '00000000-0000-0000-0000-00000000c0f1';

reset role;

select is(
  (select profession from public.profiles where id = '00000000-0000-0000-0000-00000000c0f1'),
  'Scénariste confidentielle',
  'Un administrateur corrige le profil d''un autre compte'
);

select is(
  (
    select details -> 'champs' from public.admin_audit_log
    where action = 'modification_profil'
      and actor_id = '00000000-0000-0000-0000-00000000a0f1'
      and details ->> 'compte' = '00000000-0000-0000-0000-00000000c0f1'
  ),
  '["city", "profession"]'::jsonb,
  'Le journal retient les champs que l''administrateur a modifiés'
);

select is(
  (
    select count(*)::int from public.admin_audit_log
    where details::text like '%confidentielle%' or details::text like '%Kribi%'
  ),
  0,
  'Le journal ne recopie pas les valeurs du profil'
);

-- ---------------------------------------------------------------------------
-- Mode privé : le profil professionnel suit le verrou
-- ---------------------------------------------------------------------------

update public.app_settings set private_admin_only = true where id;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000b0f1", "role": "authenticated"}',
  true
);

select set_config(
  'test.profil_prive_vu',
  (select count(*)::text from public.profiles),
  true
);

update public.profiles set city = 'Garoua'
where id = '00000000-0000-0000-0000-00000000b0f1';

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000a0f1", "role": "authenticated"}',
  true
);

select set_config(
  'test.profil_prive_vu_admin',
  (
    select count(*)::text from public.profiles
    where id = '00000000-0000-0000-0000-00000000b0f1'
  ),
  true
);

update public.profiles set profession = 'Productrice déléguée'
where id = '00000000-0000-0000-0000-00000000b0f1';

reset role;

select is(
  current_setting('test.profil_prive_vu'),
  '0',
  'En mode privé, un membre ne lit plus aucun profil, pas même le sien'
);

select is(
  (select city from public.profiles where id = '00000000-0000-0000-0000-00000000b0f1'),
  'Douala',
  'En mode privé, un membre ne modifie plus son profil'
);

select is(
  current_setting('test.profil_prive_vu_admin'),
  '1',
  'En mode privé, un administrateur lit toujours le profil d''un membre'
);

select is(
  (select profession from public.profiles where id = '00000000-0000-0000-0000-00000000b0f1'),
  'Productrice déléguée',
  'En mode privé, un administrateur modifie toujours le profil d''un membre'
);

-- ---------------------------------------------------------------------------
-- Rien de plus n'est exposé aux coéquipiers
-- ---------------------------------------------------------------------------

select is(
  (
    select pg_get_function_result(p.oid)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'equipe_du_projet'
  ),
  'TABLE(user_id uuid, display_name text, role text, job_title text, depuis timestamp with time zone)',
  'equipe_du_projet() ne livre d''un profil que le nom affiché'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
      and permissive = 'PERMISSIVE'
  ),
  2,
  'Deux politiques seulement ouvrent la lecture des profils : soi-même, et les administrateurs'
);

select * from finish();

rollback;
