-- FIELD : proposition de lignes de budget (lot J3b-1), vue depuis la base.
--
-- AUCUN FOURNISSEUR N'EST APPELÉ : le worker est joué sous son rôle, et les
-- lignes sont écrites à la main. Un plan d'essai à 100 unités texte évite de
-- toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(28);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test de FIELD'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Déclarées stables : appelées dans un filtre, elles sont évaluées une fois,
-- et non à chaque ligne d'une base locale chargée de milliers de tâches.
create function pg_temp.travail(p_cle text) returns uuid language sql stable security definer as $$
  select j.id from public.jobs j
  join public.reservations r on r.id = j.reservation_id
  where r.idempotency_key = p_cle;
$$;

create function pg_temp.essai(p_cle text) returns uuid language sql stable security definer as $$
  select a.id from public.job_attempts a
  join public.jobs j on j.id = a.job_id
  where j.id = pg_temp.travail(p_cle) and a.number = j.attempts;
$$;

create function pg_temp.proposition(p_cle text) returns uuid language sql stable security definer as $$
  select s.id from public.ai_suggestions s where s.job_id = pg_temp.travail(p_cle);
$$;

create function pg_temp.ligne(p_cle text, p_rang integer) returns uuid
language sql stable security definer as $$
  select l.id from public.ai_suggestion_budget_lines l
  where l.suggestion_id = pg_temp.proposition(p_cle) and l.position = p_rang;
$$;

-- Fonction ordinaire, appelée sous le rôle du worker : ses droits sont
-- éprouvés, et non contournés.
create function pg_temp.preparer_essai(p_cle text) returns uuid
language plpgsql as $$
declare
  v_essai uuid := pg_temp.essai(p_cle);
begin
  perform public.marquer_tentative_soumise(v_essai);
  perform public.provisionner_cout(
    v_essai, 'anthropic', 'claude-opus-5-5', 'field.essai@1', 1500, 3000, 0.08
  );
  return v_essai;
end;
$$;

create temp table lu (repere text, contexte jsonb);
grant insert, select on lu to filmfund_worker;

-- ---------------------------------------------------------------------------
-- Le barème et les droits
-- ---------------------------------------------------------------------------

-- Les droits du barème sont accordés colonne par colonne : la colonne
-- nouvelle doit être ouverte à la publication et à la vitrine.
select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'budget_plan', 'INSERT'),
  'Une version du barème peut être publiée avec le prix d''un budget'
);

select ok(
  has_column_privilege('anon', 'public.text_unit_rate_versions', 'budget_plan', 'SELECT'),
  'La vitrine lit le prix d''un budget sans session'
);

-- Le worker dépose, l'équipe décide : personne n'écrit les lignes directement.
select ok(
  not has_table_privilege('authenticated', 'public.ai_suggestion_budget_lines', 'INSERT')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_budget_lines', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_budget_lines', 'DELETE')
    and not has_table_privilege('anon', 'public.ai_suggestion_budget_lines', 'SELECT'),
  'Aucun compte n''écrit une ligne proposée, aucun visiteur n''en lit'
);

-- Le défaut a été retiré : publier une version sans ce prix échoue.
select throws_ok(
  $$
    insert into public.text_unit_rate_versions (
      logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
      dramatic_analysis, schedule_plan, treatment, bible, screenplay_per_sequence,
      dialogue_per_scene, text_edit_per_passage
    ) values (1, 1, 2, 3, 3, 4, 3, 8, 10, 2, 1, 1)
  $$,
  '23502',
  null,
  'Une version publiée sans prix de budget est refusée'
);

-- ---------------------------------------------------------------------------
-- Préparation
-- ---------------------------------------------------------------------------

insert into public.plans (code, name, position) values ('essai_field', 'Essai FIELD', 505);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_field', 5, 5, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000f1001', 'field-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1002', 'field-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1003', 'field-etranger@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000f1004', 'field-revoque@exemple.test', 'authenticated', 'authenticated');

update public.studio_subscriptions
set plan_code = 'essai_field', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios where personal_owner_id = '00000000-0000-0000-0000-0000000f1001'
);

insert into public.projects (id, owner_id, title, format, stage, logline, synopsis)
values (
  '00000000-0000-0000-0000-0000000f10a1', '00000000-0000-0000-0000-0000000f1001',
  'Le Fleuve immobile', 'long_metrage', 'ecriture', 'Un passeur sans rive.', 'Un synopsis.'
);

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000f10a1', '00000000-0000-0000-0000-0000000f1002', 'viewer'),
  ('00000000-0000-0000-0000-0000000f10a1', '00000000-0000-0000-0000-0000000f1004', 'editor');

update public.ai_settings set monthly_budget_usd = ceil(public.depense_ia_du_mois()) + 10;

-- ---------------------------------------------------------------------------
-- Devis : pas de proposition sans budget ouvert
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);

select throws_ok(
  $$ select * from public.creer_devis('00000000-0000-0000-0000-0000000f10a1', 'budget_plan') $$,
  '55000',
  null,
  'Sans budget ouvert, aucun devis : la devise manquerait'
);

reset role;
select set_config('request.jwt.claims', '', true);

insert into public.project_budgets (project_id, currency)
values ('00000000-0000-0000-0000-0000000f10a1', 'XAF');
insert into public.budget_lines (project_id, category, label, quantity, unit_cost)
values ('00000000-0000-0000-0000-0000000f10a1', 'droits', 'Option sur le roman', 1, 500000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);

select is(
  (
    select d.unit || d.quantity
    from public.creer_devis('00000000-0000-0000-0000-0000000f10a1', 'budget_plan') d
  ),
  'text6',
  'Une proposition de budget coûte 6 unités texte, comme au barème'
);

select public.accepter_devis(
  (
    select q.id from public.quotes q
    where q.project_id = '00000000-0000-0000-0000-0000000f10a1' and q.action = 'budget_plan'
      and not exists (select 1 from public.reservations r where r.quote_id = q.id)
    order by q.created_at desc
    limit 1
  ),
  'k-budget'
);

reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- Contexte et dépôt, sous le rôle du worker
-- ---------------------------------------------------------------------------

select public.reclamer_travail('worker-field', array['budget_plan']);
update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

set local role filmfund_worker;
insert into lu select 'budget', public.contexte_budget(pg_temp.essai('k-budget'));
reset role;

select is(
  (select c.contexte -> 'budget' ->> 'devise' from lu c where c.repere = 'budget'),
  'XAF',
  'Le contexte remis au worker porte la devise du budget'
);

select is(
  (select c.contexte -> 'budget' -> 'lignes' -> 0 ->> 'libelle' from lu c where c.repere = 'budget'),
  'Option sur le roman',
  'FIELD reçoit les lignes déjà saisies : il n''a pas à les redire'
);

set local role filmfund_worker;
select pg_temp.preparer_essai('k-budget');
reset role;

select throws_ok(
  format(
    $$ select public.livrer_proposition_budget(%L, %L::jsonb) $$,
    pg_temp.essai('k-budget'),
    (
      select jsonb_agg(
        jsonb_build_object('category', 'materiel', 'label', 'Ligne ' || n, 'quantity', 1, 'unit_cost', 1)
      )
      from generate_series(1, 41) n
    )
  ),
  '22023',
  null,
  'Plus de quarante lignes sont refusées'
);

select throws_ok(
  format(
    $$ select public.livrer_proposition_budget(%L, %L::jsonb) $$,
    pg_temp.essai('k-budget'),
    '[{"category": "catering", "label": "Repas", "quantity": 1, "unit_cost": 1}]'
  ),
  '22023',
  null,
  'Une catégorie que le budget ignore est refusée'
);

select throws_ok(
  format(
    $$ select public.livrer_proposition_budget(%L, %L::jsonb) $$,
    pg_temp.essai('k-budget'),
    '[{"category": "materiel", "label": "Caméra", "quantity": 0, "unit_cost": 85000}]'
  ),
  '22023',
  null,
  'Une quantité nulle est refusée, quoi qu''ait vérifié le worker'
);

set local role filmfund_worker;
select public.livrer_proposition_budget(
  pg_temp.essai('k-budget'),
  '[
    {"category": "materiel", "label": "Location caméra (jours)", "quantity": 12, "unit_cost": 85000},
    {"category": "transport_regie", "label": "Repas (jours)", "quantity": 12, "unit_cost": 40000}
  ]'::jsonb
);
reset role;

-- Le texte de la proposition se lit de toute l'équipe : il ne doit porter
-- aucun montant, et rien de ce que le worker a remis.
select is(
  (select s.content from public.ai_suggestions s where s.id = pg_temp.proposition('k-budget')),
  '2 lignes de budget proposées par l''assistant.',
  'La proposition parente est écrite par la base, sans montant'
);

-- ---------------------------------------------------------------------------
-- Cloisonnement : qui lit les lignes proposées
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.ai_suggestion_budget_lines),
  2,
  'Le porteur lit les lignes proposées'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1002", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.ai_suggestion_budget_lines),
  0,
  'Un lecteur de l''équipe ne lit aucune ligne proposée : le budget ne lui est pas ouvert'
);
select is(
  (select count(*)::int from public.ai_suggestions s where s.action = 'budget_plan'),
  1,
  'Ce lecteur lit pourtant la proposition, comme toute l''équipe'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1003", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.ai_suggestion_budget_lines),
  0,
  'Un compte étranger au projet ne lit rien'
);

-- Mode privé : même le porteur, s'il n'est pas administrateur, ne lit ni ne
-- décide plus rien.
reset role;
update public.app_settings set private_admin_only = true where id;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.ai_suggestion_budget_lines),
  0,
  'En mode privé, un porteur non administrateur ne lit plus les lignes'
);
select throws_ok(
  format($$ select public.accepter_ligne_budget(%L) $$, pg_temp.ligne('k-budget', 1)),
  '42501',
  null,
  'En mode privé, il n''en accepte aucune'
);

reset role;
update public.app_settings set private_admin_only = false where id;

-- ---------------------------------------------------------------------------
-- Décision : qui accepte, et ce que cela écrit
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1002", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_ligne_budget(%L) $$, pg_temp.ligne('k-budget', 1)),
  '42501',
  null,
  'Un lecteur n''accepte pas une ligne de budget'
);

-- Adhésion révoquée : l'éditeur d'hier ne décide plus.
reset role;
delete from public.project_members
where project_id = '00000000-0000-0000-0000-0000000f10a1'
  and user_id = '00000000-0000-0000-0000-0000000f1004';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1004", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.ecarter_ligne_budget(%L) $$, pg_temp.ligne('k-budget', 2)),
  '42501',
  null,
  'Un éditeur dont l''adhésion a été révoquée ne décide plus'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);
select is(
  (
    select l.state
    from public.accepter_ligne_budget(pg_temp.ligne('k-budget', 1), null, null, null, 70000) l
  ),
  'accepted',
  'Le porteur accepte une ligne, en corrigeant son coût'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (
    select b.category::text || ' / ' || b.quantity || ' / ' || b.unit_cost || ' / ' || b.created_by
    from public.budget_lines b
    join public.ai_suggestion_budget_lines l on l.budget_line_id = b.id
    where l.id = pg_temp.ligne('k-budget', 1)
  ),
  'materiel / 12.00 / 70000.00 / 00000000-0000-0000-0000-0000000f1001',
  'La ligne entre au budget, corrigée, au nom de qui l''a acceptée'
);

select is(
  (select s.state from public.ai_suggestions s where s.id = pg_temp.proposition('k-budget')),
  'proposed',
  'Tant qu''une ligne attend, la proposition reste ouverte'
);

-- Ce que l'agent a proposé ne se réécrit pas, même par l'exploitant.
select throws_ok(
  format(
    $$ update public.ai_suggestion_budget_lines set unit_cost = 1 where id = %L $$,
    pg_temp.ligne('k-budget', 2)
  ),
  '42501',
  null,
  'Une ligne proposée ne se réécrit pas'
);

select throws_ok(
  format(
    $$ delete from public.ai_suggestion_budget_lines where id = %L $$,
    pg_temp.ligne('k-budget', 2)
  ),
  '42501',
  null,
  'Une ligne proposée ne se supprime pas'
);

-- L'équipe supprime ensuite la ligne de son budget : la décision reste
-- inscrite, détachée de ce qui n'existe plus.
delete from public.budget_lines b
using public.ai_suggestion_budget_lines l
where l.budget_line_id = b.id and l.id = pg_temp.ligne('k-budget', 1);

select is(
  (
    select l.state || ' / ' || coalesce(l.budget_line_id::text, 'détachée')
    from public.ai_suggestion_budget_lines l
    where l.id = pg_temp.ligne('k-budget', 1)
  ),
  'accepted / détachée',
  'Une ligne de budget supprimée laisse la décision en place'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000f1001", "role": "authenticated"}', true);
select public.ecarter_ligne_budget(pg_temp.ligne('k-budget', 2));
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (
    select s.state || ' / ' || s.decided_by
    from public.ai_suggestions s
    where s.id = pg_temp.proposition('k-budget')
  ),
  'accepted / 00000000-0000-0000-0000-0000000f1001',
  'La dernière décision clôt la proposition, appliquée puisqu''une ligne a été acceptée'
);

select is(
  (
    select st.consumed || '/' || r.quantity
    from public.jobs j
    join public.reservations r on r.id = j.reservation_id
    join public.reservation_settlements st on st.reservation_id = r.id
    where j.id = pg_temp.travail('k-budget')
  ),
  '6/6',
  'Les six unités devisées sont consommées, rien n''est rendu'
);

select * from finish();

rollback;
