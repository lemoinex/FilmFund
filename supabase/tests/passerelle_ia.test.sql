-- Passerelle IA : coûts fournisseurs, plafond, propositions et limite de
-- débit, vus depuis la base.
--
-- Aucun fournisseur n'est appelé : le worker est joué par le propriétaire de
-- la base ou sous son rôle, avec des montants donnés à la main. Un plan
-- d'essai évite de toucher au catalogue réel ; la transaction est annulée.

begin;

select plan(45);

-- Les tâches laissées par d'autres suites passeraient avant celles du test.
select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par le test de la passerelle'))
from public.jobs j
where j.state = 'queued';

update public.jobs set lease_until = now() + interval '1 day' where state = 'running';

-- Repères du test, lus sous n'importe quel rôle : ils s'exécutent avec les
-- droits du propriétaire, sans quoi la RLS les rendrait muets.
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

-- Ce que le worker lit, écrit sous son propre rôle.
create temp table lu (titre text, logline text);
grant insert, select on lu to filmfund_worker;

insert into public.plans (code, name, position) values ('essai_ia', 'Essai IA', 501);
insert into public.plan_versions (
  plan_code, max_projects, max_members, storage_mb,
  text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month, published_at
)
values ('essai_ia', 5, 1, 0, 100, 0, 0, 0, now() - interval '90 days');

insert into auth.users (id, email, aud, role)
values
  ('00000000-0000-0000-0000-0000000a1001', 'ia-porteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1002', 'ia-editeur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1003', 'ia-lecteur@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1004', 'ia-admin@exemple.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000a1005', 'ia-etranger@exemple.test', 'authenticated', 'authenticated');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000a1004';

update public.studio_subscriptions
set plan_code = 'essai_ia', period_anchor = now() - interval '3 days'
where studio_id in (
  select id from public.studios
  where personal_owner_id in ('00000000-0000-0000-0000-0000000a1001', '00000000-0000-0000-0000-0000000a1005')
);

insert into public.projects (id, owner_id, title, logline, synopsis)
values
  ('00000000-0000-0000-0000-0000000a10a1', '00000000-0000-0000-0000-0000000a1001', 'Projet IA', 'Le pitch d''origine.', 'Un synopsis.'),
  ('00000000-0000-0000-0000-0000000a10a5', '00000000-0000-0000-0000-0000000a1005', 'Projet étranger', '', '');

insert into public.project_members (project_id, user_id, role)
values
  ('00000000-0000-0000-0000-0000000a10a1', '00000000-0000-0000-0000-0000000a1002', 'editor'),
  ('00000000-0000-0000-0000-0000000a10a1', '00000000-0000-0000-0000-0000000a1003', 'viewer');

-- Le registre local garde les dépenses des autres suites : le plafond du
-- test se règle par rapport à elles, et les montants se mesurent en écart.
update public.ai_settings set monthly_budget_usd = ceil(public.depense_ia_du_mois()) + 1;
select set_config('test.depense_avant', public.depense_ia_du_mois()::text, true);

-- Deux tâches de logline : la première réclamée et menée à son terme, la
-- seconde ensuite.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-0000000a10a1', 'logline');
select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000a10a1'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-acceptee'
);
reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-ia', array['logline']);

-- ---------------------------------------------------------------------------
-- Fiche du projet et provision
-- ---------------------------------------------------------------------------

set local role filmfund_worker;
insert into lu select title, logline from public.contexte_travail(pg_temp.essai('k-acceptee'));
reset role;

select is(
  (select titre || ' / ' || logline from lu),
  'Projet IA / Le pitch d''origine.',
  'Le worker, sous son rôle, lit la fiche du projet de sa tâche'
);

select is(
  (select count(*)::int from public.contexte_travail(gen_random_uuid())),
  0,
  'Aucune fiche pour un essai qui n''existe pas'
);

select throws_ok(
  format($$ select public.provisionner_cout(%L, 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 100, 200, 0.40) $$, pg_temp.essai('k-acceptee')),
  'TR001',
  null,
  'Pas de provision avant que l''essai soit marqué soumis'
);

select public.marquer_tentative_soumise(pg_temp.essai('k-acceptee'));

select is(
  (select c.estimated_usd from public.provisionner_cout(pg_temp.essai('k-acceptee'), 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 100, 200, 0.40) c),
  0.40::numeric,
  'Le coût est provisionné avant l''appel'
);

select is(
  (select c.estimated_usd from public.provisionner_cout(pg_temp.essai('k-acceptee'), 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 100, 200, 0.90) c),
  0.40::numeric,
  'Rejouer la provision renvoie la première : un essai, une dépense'
);

select is(
  public.depense_ia_du_mois() - current_setting('test.depense_avant')::numeric,
  0.40::numeric,
  'Une provision pas encore confirmée compte déjà dans la dépense du mois'
);

select throws_ok(
  format($$ select public.confirmer_cout(%L, 'claude-opus-5-5', 1, 1, 0.01) $$, gen_random_uuid()),
  'IA002',
  null,
  'Pas de coût confirmé sans provision'
);

select is(
  (select s.usd from public.confirmer_cout(pg_temp.essai('k-acceptee'), 'claude-opus-5-5', 90, 50, 0.001360) s),
  0.001360::numeric,
  'L''usage facturé est confirmé'
);

select is(
  (select s.usd from public.confirmer_cout(pg_temp.essai('k-acceptee'), 'claude-opus-5-5', 900, 500, 0.5) s),
  0.001360::numeric,
  'Une seule confirmation par essai'
);

select is(
  public.depense_ia_du_mois() - current_setting('test.depense_avant')::numeric,
  0.001360::numeric,
  'La dépense confirmée remplace la provision, elle ne s''y ajoute pas'
);

-- ---------------------------------------------------------------------------
-- Livraison de la proposition
-- ---------------------------------------------------------------------------

select throws_ok(
  format($$ select public.livrer_proposition(%L, E'Deux\nlignes') $$, pg_temp.essai('k-acceptee')),
  '22023',
  null,
  'Une logline tient en un paragraphe'
);

select throws_ok(
  format($$ select public.livrer_proposition(%L, repeat('x', 501)) $$, pg_temp.essai('k-acceptee')),
  '22023',
  null,
  'Une logline ne dépasse pas 500 caractères'
);

select isnt(
  public.livrer_proposition(pg_temp.essai('k-acceptee'), '  La proposition de l''assistant.  '),
  null,
  'Le worker dépose sa proposition'
);

select is(
  (select j.state || ' / ' || s.state || ' / ' || s.content || ' / ' || s.profile
   from public.jobs j join public.ai_suggestions s on s.job_id = j.id
   where j.id = pg_temp.travail('k-acceptee')),
  'succeeded / proposed / La proposition de l''assistant. / weaver.logline@1',
  'La tâche réussit avec sa proposition, dans la même transaction'
);

select is(
  (select p.logline from public.projects p where p.id = '00000000-0000-0000-0000-0000000a10a1'),
  'Le pitch d''origine.',
  'Déposer une proposition n''écrit rien dans le projet'
);

select is(
  (select count(*)::int from public.contexte_travail(pg_temp.essai('k-acceptee'))),
  0,
  'La fiche n''est plus lisible une fois la tâche terminée'
);

select throws_ok(
  format($$ select public.livrer_proposition(%L, 'Une seconde proposition.') $$, pg_temp.essai('k-acceptee')),
  'TR001',
  null,
  'Une tâche ne reçoit pas deux propositions'
);

select throws_ok(
  format($$ update public.ai_suggestions set content = 'Réécrite' where id = %L $$, pg_temp.proposition('k-acceptee')),
  '42501',
  'Le texte et l''origine d''une proposition ne changent pas.',
  'Le texte d''une proposition ne se réécrit pas, même par l''exploitant'
);

-- ---------------------------------------------------------------------------
-- Plafond de dépense
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1001", "role": "authenticated"}', true);
select public.creer_devis('00000000-0000-0000-0000-0000000a10a1', 'logline');
select public.accepter_devis(
  (select q.id from public.quotes q where q.project_id = '00000000-0000-0000-0000-0000000a10a1'
     and not exists (select 1 from public.reservations r where r.quote_id = q.id)),
  'k-ecartee'
);
reset role;
select set_config('request.jwt.claims', '', true);

select public.reclamer_travail('worker-ia', array['logline']);
select public.marquer_tentative_soumise(pg_temp.essai('k-ecartee'));

-- Ce qu'il reste avant le plafond, au millionième de dollar près.
select set_config(
  'test.marge',
  ((select monthly_budget_usd from public.ai_settings) - public.depense_ia_du_mois())::text,
  true
);

select throws_ok(
  format(
    $$ select public.provisionner_cout(%L, 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 100, 200, %s) $$,
    pg_temp.essai('k-ecartee'),
    current_setting('test.marge')::numeric + 0.000001
  ),
  'IA001',
  'Plafond mensuel des dépenses d''IA atteint.',
  'Une provision qui dépasserait le plafond d''un millionième de dollar est refusée'
);

select is(
  (select c.estimated_usd
   from public.provisionner_cout(
     pg_temp.essai('k-ecartee'), 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 100, 200,
     current_setting('test.marge')::numeric
   ) c),
  current_setting('test.marge')::numeric,
  'Une provision qui atteint exactement le plafond passe'
);

select public.livrer_proposition(pg_temp.essai('k-ecartee'), 'Une autre proposition.');

-- ---------------------------------------------------------------------------
-- Qui lit, qui applique, qui écarte
-- ---------------------------------------------------------------------------

set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1005", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.ai_suggestions),
  0,
  'Un compte étranger au projet ne lit aucune proposition'
);
select throws_ok(
  format($$ select public.ecarter_proposition(%L) $$, pg_temp.proposition('k-ecartee')),
  '42501',
  null,
  'Un compte étranger n''écarte pas une proposition'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1003", "role": "authenticated"}', true);
select is(
  (select count(*)::int from public.ai_suggestions),
  2,
  'Un lecteur de l''équipe lit les propositions du projet'
);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-acceptee')),
  '42501',
  null,
  'Un lecteur n''applique pas une proposition'
);
select is(
  (select count(*)::int from public.provider_charges) + (select count(*)::int from public.ai_settings),
  0,
  'Un compte ordinaire ne lit ni les coûts fournisseurs ni le plafond'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1004", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-acceptee')),
  '42501',
  null,
  'Un administrateur hors de l''équipe ne réécrit pas le projet d''un auteur'
);
select ok(
  (select count(*) from public.provider_charges) >= 2
    and (select count(*) from public.provider_charge_settlements) >= 1
    and (select count(*) from public.ai_settings) = 1,
  'Un administrateur lit les coûts fournisseurs et le plafond'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1002", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L, repeat('x', 501)) $$, pg_temp.proposition('k-acceptee')),
  '22023',
  null,
  'Un pitch de plus de 500 caractères n''est pas appliqué'
);
select is(
  (select s.state || ' / ' || s.final_content || ' / ' || s.replaced_content
   from public.accepter_proposition(pg_temp.proposition('k-acceptee'), '  Le pitch, retouché par l''éditeur.  ') s),
  'accepted / Le pitch, retouché par l''éditeur. / Le pitch d''origine.',
  'Un éditeur applique la proposition, modifiée ; le texte remplacé est conservé'
);
select is(
  (select p.logline from public.projects p where p.id = '00000000-0000-0000-0000-0000000a10a1'),
  'Le pitch, retouché par l''éditeur.',
  'Le pitch du projet est celui que l''éditeur a retenu'
);
select is(
  (select s.final_content from public.accepter_proposition(pg_temp.proposition('k-acceptee'), 'Un autre texte.') s),
  'Le pitch, retouché par l''éditeur.',
  'Appliquer deux fois ne change rien'
);
select throws_ok(
  format($$ select public.ecarter_proposition(%L) $$, pg_temp.proposition('k-acceptee')),
  'PR001',
  null,
  'Une proposition appliquée ne s''écarte plus'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1004", "role": "authenticated"}', true);
select is(
  (select s.state from public.ecarter_proposition(pg_temp.proposition('k-ecartee')) s),
  'dismissed',
  'Un administrateur écarte une proposition'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1001", "role": "authenticated"}', true);
select throws_ok(
  format($$ select public.accepter_proposition(%L) $$, pg_temp.proposition('k-ecartee')),
  'PR001',
  null,
  'Une proposition écartée ne s''applique plus'
);
select is(
  (select p.logline from public.projects p where p.id = '00000000-0000-0000-0000-0000000a10a1'),
  'Le pitch, retouché par l''éditeur.',
  'Écarter une proposition n''écrit rien dans le projet'
);

-- ---------------------------------------------------------------------------
-- Plafond : lecture, modification, journal
-- ---------------------------------------------------------------------------

update public.ai_settings set monthly_budget_usd = 1234.00;

-- L'administrateur relit le réglage : le compte ordinaire, lui, ne le voit pas.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1004", "role": "authenticated"}', true);
select isnt(
  (select monthly_budget_usd from public.ai_settings),
  1234.00::numeric,
  'Un compte ordinaire ne modifie pas le plafond'
);

update public.ai_settings set monthly_budget_usd = 7.50;

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select monthly_budget_usd from public.ai_settings),
  7.50::numeric,
  'Un administrateur modifie le plafond'
);

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'plafond_ia'
     and actor_id = '00000000-0000-0000-0000-0000000a1004'
     and details ->> 'nouveau' = '7.50'),
  1,
  'Le changement de plafond est journalisé'
);

select is(
  (select count(*)::int from public.admin_audit_log
   where action = 'intervention_contenu'
     and actor_id = '00000000-0000-0000-0000-0000000a1004'
     and details ->> 'table' = 'ai_suggestions'),
  1,
  'La proposition écartée par un administrateur hors de l''équipe est journalisée'
);

-- ---------------------------------------------------------------------------
-- Registre des coûts en ajout seul
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.provider_charges set estimated_usd = 0 $$,
  '42501',
  null,
  'Le propriétaire de la base ne modifie pas un coût provisionné'
);

select throws_ok(
  $$ delete from public.provider_charge_settlements $$,
  '42501',
  null,
  'Le propriétaire de la base ne supprime pas un coût confirmé'
);

-- Supprimer le compte emporte ses tâches et ses propositions, pas la dépense.
delete from auth.users where id = '00000000-0000-0000-0000-0000000a1001';

select is(
  (select count(*)::int from public.ai_suggestions where project_id = '00000000-0000-0000-0000-0000000a10a1')
    || ' / ' ||
  (select count(*)::int from public.provider_charges where project_id = '00000000-0000-0000-0000-0000000a10a1'),
  '0 / 2',
  'Les propositions disparaissent avec le compte ; les coûts fournisseurs restent'
);

-- ---------------------------------------------------------------------------
-- Limite de débit
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000a1005", "role": "authenticated"}', true);

-- L'action dépend de `g` : sans cela, la fonction serait évaluée une seule
-- fois et son résultat relu dix fois.
select is(
  (select count(distinct d.quote_id)::int
   from generate_series(1, 10) g
   cross join lateral public.creer_devis(
     '00000000-0000-0000-0000-0000000a10a5',
     case when g > 0 then 'logline' end
   ) d),
  10,
  'Dix devis en une minute passent'
);

select throws_ok(
  $$ select public.creer_devis('00000000-0000-0000-0000-0000000a10a5', 'logline') $$,
  'DV005',
  'Trop de demandes en une minute : patientez un instant.',
  'Le onzième devis de la minute est refusé'
);

reset role;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated', 'public.accepter_proposition(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.ecarter_proposition(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_proposition(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_travail(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.provisionner_cout(uuid, text, text, text, integer, integer, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'public.confirmer_cout(uuid, text, integer, integer, numeric, boolean)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition(uuid, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.depense_ia_du_mois()', 'execute'),
  'Les comptes n''appellent que l''application et l''écart d''une proposition'
);

select * from finish();

rollback;
