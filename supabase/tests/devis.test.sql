-- Devis, réservations et règlements, vus depuis la base.
--
-- Ce que l'API ne permet pas d'éprouver : barème antidaté, devis expiré,
-- changement de plan ou de barème entre le devis et son acceptation,
-- règlement réservé au worker et imputé à la période d'origine, registre en
-- ajout seul. Un plan d'essai, créé pour ce test, évite de toucher au
-- catalogue réel ; la transaction est annulée.

begin;

select plan(23);

insert into public.plans (code, name, position) values ('essai_devis', 'Essai devis', 301);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_devis', 5, 1, 0, 20, 3, 1, 0, now() - interval '90 days');

-- Deux versions antidatées du barème ; seul le poids du traitement change.
insert into public.text_unit_rate_versions (
  logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
  treatment, bible, screenplay_per_sequence, dialogue_per_scene, published_at
)
values
  (1, 1, 2, 3, 3, 5, 10, 2, 1, now() - interval '60 days'),
  (1, 1, 2, 3, 3, 7, 10, 2, 1, now() - interval '5 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-00000000d001', 'devis-ancien@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000d002', 'devis-recent@exemple.test', 'authenticated', 'authenticated');

-- Période ouverte il y a dix jours : la version publiée il y a cinq jours
-- attendra la prochaine.
update public.studio_subscriptions
set plan_code = 'essai_devis', period_anchor = now() - interval '40 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d001');

-- Période ouverte il y a trois jours : la version d'il y a cinq jours la précède.
update public.studio_subscriptions
set plan_code = 'essai_devis', period_anchor = now() - interval '3 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d002');

insert into public.projects (id, owner_id, title)
values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000d001', 'Projet ancien'),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-00000000d002', 'Projet récent');

-- ---------------------------------------------------------------------------
-- Barème en vigueur
-- ---------------------------------------------------------------------------

select is(
  (select v.treatment from public.bareme_en_vigueur(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d001')) v),
  5,
  'Une version du barème publiée en cours de période ne s''applique qu''à la suivante'
);

select is(
  (select v.treatment from public.bareme_en_vigueur(
    (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d002')) v),
  7,
  'Une période ouverte après la publication applique la nouvelle version du barème'
);

-- ---------------------------------------------------------------------------
-- Devis et réservations, en session
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select is(
  (select d.quantity from public.creer_devis('00000000-0000-0000-0000-00000000d0a1', 'treatment') d),
  5,
  'Le devis applique le barème en vigueur pour la période du studio'
);

select isnt(
  (select r.id from public.accepter_devis(
    (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-00000000d0a1' and q.action = 'treatment'),
    'cle-traitement'
  ) r),
  null,
  'Le porteur accepte son devis'
);

select is(
  (select d.quantity from public.creer_devis('00000000-0000-0000-0000-00000000d0a1', 'logline') d),
  1,
  'Une logline coûte une unité'
);

select isnt(
  (select r.id from public.accepter_devis(
    (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-00000000d0a1' and q.action = 'logline'),
    'cle-logline'
  ) r),
  null,
  'Un second devis se réserve sous sa propre clé'
);

select throws_ok(
  $$ insert into public.quotes (studio_id, project_id, created_by, action, unit, quantity, plan_version_id, period_start, fingerprint, expires_at)
     select studio_id, project_id, created_by, action, 'image', 0, plan_version_id, period_start, fingerprint, expires_at
     from public.quotes limit 1 $$,
  '42501',
  null,
  'Un compte n''écrit pas lui-même un devis : la base le calcule'
);

select throws_ok(
  $$ select public.regler_reservation(
       (select r.id from public.reservations r where r.action = 'logline'), 0) $$,
  '42501',
  null,
  'Un compte ne règle pas une réservation : le worker s''en chargera'
);

reset role;

-- ---------------------------------------------------------------------------
-- Devis expiré ou dont le contexte a changé
-- ---------------------------------------------------------------------------

-- Devis inscrit à la main, cohérent en tout point mais expiré depuis une minute.
insert into public.quotes (
  studio_id, project_id, created_by, action, unit, quantity, plan_version_id,
  rate_version_id, period_start, fingerprint, expires_at
)
select
  s.id,
  '00000000-0000-0000-0000-00000000d0a1',
  '00000000-0000-0000-0000-00000000d001',
  'synopsis_short',
  'text',
  1,
  (select v.id from public.plan_en_vigueur(s.id) v),
  (select b.id from public.bareme_en_vigueur(s.id) b),
  public.debut_periode(a.period_anchor),
  public.empreinte_demande('00000000-0000-0000-0000-00000000d0a1', 'synopsis_short', '{}'),
  now() - interval '1 minute'
from public.studios s
join public.studio_subscriptions a on a.studio_id = s.id
where s.personal_owner_id = '00000000-0000-0000-0000-00000000d001';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select public.accepter_devis(
       (select q.id from public.quotes q where q.action = 'synopsis_short' and q.project_id = '00000000-0000-0000-0000-00000000d0a1'),
       'cle-expiree') $$,
  'DV001',
  'Ce devis a expiré : demandez-en un nouveau.',
  'Un devis expiré n''est pas accepté'
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d002", "role": "authenticated"}',
  true
);

select is(
  (select d.quantity from public.creer_devis('00000000-0000-0000-0000-00000000d0a2', 'bible') d),
  10,
  'Le devis d''une bible est calculé'
);

reset role;

-- Le plan du studio change entre le devis et son acceptation.
update public.studio_subscriptions
set plan_code = 'gratuit'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d002');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d002", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select public.accepter_devis(
       (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-00000000d0a2' and q.action = 'bible'),
       'cle-bible') $$,
  'DV001',
  'Le plan, le barème ou la période ont changé depuis ce devis : demandez-en un nouveau.',
  'Un devis dont le plan a changé doit être recalculé'
);

select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select is(
  (select d.quantity from public.creer_devis('00000000-0000-0000-0000-00000000d0a1', 'intention_note') d),
  3,
  'Le devis d''une note d''intention est calculé'
);

reset role;
-- Sans identité, comme l'exploitant : la date fournie est conservée.
select set_config('request.jwt.claims', '', true);

-- Une version du barème antidatée d'avant la période du studio la remplace.
insert into public.text_unit_rate_versions (
  logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
  treatment, bible, screenplay_per_sequence, dialogue_per_scene, published_at
)
values (1, 1, 2, 3, 4, 5, 10, 2, 1, now() - interval '20 days');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub": "00000000-0000-0000-0000-00000000d001", "role": "authenticated"}',
  true
);

select throws_ok(
  $$ select public.accepter_devis(
       (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-00000000d0a1' and q.action = 'intention_note'),
       'cle-note') $$,
  'DV001',
  'Le plan, le barème ou la période ont changé depuis ce devis : demandez-en un nouveau.',
  'Un devis dont le barème a changé doit être recalculé'
);

reset role;

-- ---------------------------------------------------------------------------
-- Règlement
-- ---------------------------------------------------------------------------

select is(
  (select s.released from public.regler_reservation(
    (select r.id from public.reservations r where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'treatment'),
    3
  ) s),
  2,
  'Un règlement partiel rend les unités non livrées'
);

select is(
  (select s.consumed from public.regler_reservation(
    (select r.id from public.reservations r where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'treatment'),
    3
  ) s),
  3,
  'Rejouer le même règlement renvoie le premier'
);

select throws_ok(
  $$ select public.regler_reservation(
       (select r.id from public.reservations r where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'treatment'),
       0) $$,
  'DV004',
  'Cette réservation est déjà réglée.',
  'Une réservation ne se règle qu''une fois : la restitution n''a lieu qu''une fois'
);

select throws_ok(
  $$ select public.regler_reservation(
       (select r.id from public.reservations r where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'logline'),
       2) $$,
  '22023',
  null,
  'On ne consomme pas plus que la réservation'
);

-- La période du studio change avant le second règlement : il s'impute
-- quand même sur la période d'origine.
update public.studio_subscriptions
set period_anchor = now() - interval '45 days'
where studio_id = (select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-00000000d001');

select public.regler_reservation(
  (select r.id from public.reservations r where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'logline'),
  1
);

select is(
  (select public.unites_engagees(r.studio_id, 'text', r.period_start)
   from public.reservations r
   where r.project_id = '00000000-0000-0000-0000-00000000d0a1' and r.action = 'logline'),
  4,
  'Le règlement s''impute sur la période d''origine : 3 unités livrées, puis 1'
);

select is(
  (select public.unites_engagees(s.id, 'text', public.debut_periode(a.period_anchor))
   from public.studios s
   join public.studio_subscriptions a on a.studio_id = s.id
   where s.personal_owner_id = '00000000-0000-0000-0000-00000000d001'),
  0,
  'La nouvelle période ne porte rien de la précédente'
);

-- ---------------------------------------------------------------------------
-- Registre en ajout seul
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.reservations set quantity = 0 $$,
  '42501',
  null,
  'Le propriétaire de la base ne modifie pas une réservation'
);

select throws_ok(
  $$ delete from public.reservation_settlements $$,
  '42501',
  null,
  'Le propriétaire de la base ne supprime pas un règlement'
);

-- Supprimer un compte emporte son studio personnel et son registre : le
-- registre n'empêche pas l'effacement d'un compte.
delete from auth.users where id = '00000000-0000-0000-0000-00000000d001';

select is(
  (select count(*)::int from public.quotes where project_id = '00000000-0000-0000-0000-00000000d0a1'),
  0,
  'Le registre d''un studio disparaît avec lui, en cascade'
);

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.accepter_devis(uuid, text)', 'execute')
    and not has_function_privilege('anon', 'public.creer_devis(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_devis(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.regler_reservation(uuid, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.unites_engagees(uuid, text, timestamptz)', 'execute')
    and not has_function_privilege('authenticated', 'public.peut_engager_unites(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.bareme_en_vigueur(uuid)', 'execute'),
  'Seuls le devis et son acceptation sont ouverts aux comptes connectés'
);

select * from finish();

rollback;
