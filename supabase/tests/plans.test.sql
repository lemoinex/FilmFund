-- Plans : période, version en vigueur et limites, vues depuis la base.
--
-- La règle « une version s'applique à partir de la prochaine période » ne
-- s'éprouve qu'avec des versions et des abonnements antidatés : en SQL
-- direct, la date de publication fournie est conservée. Deux plans d'essai,
-- créés pour ce test, évitent de toucher au catalogue réel.

begin;

select plan(12);

-- ---------------------------------------------------------------------------
-- Période mensuelle à date anniversaire
-- ---------------------------------------------------------------------------

select is(
  public.debut_periode('2026-01-15 10:00+00', '2026-03-20 00:00+00'),
  '2026-03-15 10:00+00'::timestamptz,
  'La période en cours commence au dernier anniversaire passé'
);

select is(
  public.debut_periode('2026-01-15 10:00+00', '2026-03-15 09:59+00'),
  '2026-02-15 10:00+00'::timestamptz,
  'Une minute avant l''anniversaire, la période précédente court encore'
);

select is(
  public.debut_periode('2026-01-31 10:00+00', '2026-02-28 12:00+00'),
  '2026-02-28 10:00+00'::timestamptz,
  'Ancrée un 31, la période de février commence le dernier jour du mois'
);

-- ---------------------------------------------------------------------------
-- Version en vigueur
-- ---------------------------------------------------------------------------

insert into public.plans (code, name, position)
values ('essai', 'Essai', 101), ('essai_tardif', 'Essai tardif', 102);

insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values
  ('essai', 1, 1, 0, 0, 0, 0, 0, now() - interval '60 days'),
  ('essai', 2, 1, 0, 0, 0, 0, 0, now() - interval '5 days'),
  ('essai_tardif', 7, 1, 0, 0, 0, 0, 0, now());

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000a101', 'ancien-abonne@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a102', 'nouvel-abonne@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000a103', 'abonne-precoce@exemple.test', 'authenticated', 'authenticated');

-- Période ouverte il y a dix jours : la version 2, publiée il y a cinq jours,
-- attendra la prochaine.
update public.studio_subscriptions
set plan_code = 'essai', period_anchor = now() - interval '40 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a101');

-- Période ouverte il y a trois jours : la version 2 la précède.
update public.studio_subscriptions
set plan_code = 'essai', period_anchor = now() - interval '3 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a102');

-- Période ouverte avant toute publication du plan : repli sur la première.
update public.studio_subscriptions
set plan_code = 'essai_tardif', period_anchor = now() - interval '1 day'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a103');

select is(
  (select v.version_number from public.plan_en_vigueur(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a101')) v),
  1,
  'Une version publiée en cours de période ne s''applique qu''à la suivante'
);

select is(
  (select v.version_number from public.plan_en_vigueur(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a102')) v),
  2,
  'Une période ouverte après la publication applique la nouvelle version'
);

select is(
  (select v.max_projects from public.plan_en_vigueur(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000a103')) v),
  7,
  'Sans version antérieure à la période, la première version s''applique'
);

-- ---------------------------------------------------------------------------
-- Limites : exemption du SQL direct, application en session
-- ---------------------------------------------------------------------------

-- Plan d'essai, version 1 en vigueur : un projet au plus. En SQL direct,
-- l'exploitant n'est pas limité.
insert into public.projects (owner_id, title)
values
  ('00000000-0000-0000-0000-00000000a101', 'Premier projet'),
  ('00000000-0000-0000-0000-00000000a101', 'Projet de l''exploitant');

select is(
  (select count(*)::int from public.projects where owner_id = '00000000-0000-0000-0000-00000000a101'),
  2,
  'L''exploitant, en SQL direct, n''est pas soumis aux limites'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000a101", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.projects (owner_id, title) values ('00000000-0000-0000-0000-00000000a101', 'Projet de trop') $$,
  '53400',
  null,
  'Un compte connecté au-delà de sa limite est refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- Versions en ajout seul
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.plan_versions set max_projects = 1000 where plan_code = 'essai' $$,
  '42501',
  null,
  'Le propriétaire de la base ne modifie pas une version publiée'
);

select throws_ok(
  $$ delete from public.plan_versions where plan_code = 'essai' $$,
  '42501',
  null,
  'Le propriétaire de la base ne supprime pas une version publiée'
);

select is(
  (select array_agg(version_number order by version_number) from public.plan_versions where plan_code = 'essai'),
  array[1, 2],
  'Les versions sont numérotées par la base, dans l''ordre de publication'
);

select ok(
  has_function_privilege('authenticated', 'public.plan_en_vigueur(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.plan_en_vigueur(uuid)', 'execute')
    and not (select prosecdef from pg_proc where oid = 'public.plan_en_vigueur(uuid)'::regprocedure),
  'plan_en_vigueur() s''exécute sous la RLS de l''appelant, pour les seuls comptes connectés'
);

select * from finish();

rollback;
