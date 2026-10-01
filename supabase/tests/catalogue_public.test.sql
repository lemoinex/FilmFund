-- Catalogue public : ce qu'un visiteur lit, et ce qu'il ne lit pas.

begin;

select plan(8);

set local role anon;

select is(
  (select count(*)::int from public.plans where code in ('gratuit', 'pro', 'studio')),
  3,
  'Un visiteur lit les trois plans'
);

select ok(
  (select count(*) > 0 from (select plan_code, version_number, price_xaf_per_month from public.plan_versions) v),
  'Un visiteur lit les valeurs publiées des plans'
);

select throws_ok(
  $$ select published_by from public.plan_versions $$,
  '42501',
  null,
  'Un visiteur ne lit pas l''auteur d''une version'
);

select throws_ok(
  $$ select id from public.plan_versions $$,
  '42501',
  null,
  'Un visiteur ne lit pas l''identifiant d''une version'
);

select throws_ok(
  $$ select plan_code from public.studio_subscriptions $$,
  '42501',
  null,
  'Un visiteur ne lit pas les abonnements des studios'
);

select throws_ok(
  $$ insert into public.plan_versions (plan_code, max_projects, max_members, storage_mb, text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month)
     values ('gratuit', 1000, 1000, 1000, 1000, 1000, 1000, 0) $$,
  '42501',
  null,
  'Un visiteur ne publie pas de version'
);

select throws_ok(
  $$ update public.plans set name = 'Offert' where code = 'gratuit' $$,
  '42501',
  null,
  'Un visiteur ne renomme pas un plan'
);

reset role;

select ok(
  not has_column_privilege('anon', 'public.plan_versions', 'published_by', 'select')
    and not has_table_privilege('anon', 'public.studio_subscriptions', 'select'),
  'Les droits du visiteur s''arrêtent aux colonnes de l''offre'
);

select * from finish();

rollback;
