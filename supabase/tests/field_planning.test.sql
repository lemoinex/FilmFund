-- FIELD : proposition de jalons de planning (lot J3b-3a), vue depuis le
-- catalogue.
--
-- Ce qui ne s'observe pas par l'API : les droits par colonne du barème, les
-- privilèges de la table et des fonctions, les garde-fous posés sur la table.
-- Le chemin complet — devis, dépôt, acceptation — est éprouvé par
-- `tests/worker-field-planning.test.mjs`. La transaction est annulée.

begin;

select plan(14);

-- ---------------------------------------------------------------------------
-- Le barème et ses droits
-- ---------------------------------------------------------------------------

-- Les droits du barème sont accordés colonne par colonne : la colonne
-- nouvelle doit être ouverte à la publication et à la vitrine.
select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'schedule_plan', 'INSERT'),
  'Une version du barème peut être publiée avec le prix d''un planning'
);

select ok(
  has_column_privilege('anon', 'public.text_unit_rate_versions', 'schedule_plan', 'SELECT'),
  'La vitrine lit le prix d''un planning sans session'
);

select is(
  (select schedule_plan from public.text_unit_rate_versions order by version_number limit 1),
  3,
  'Les versions déjà publiées valent 3 unités pour un planning'
);

-- Le défaut a été retiré : publier une version sans ce prix échoue.
select throws_ok(
  $$
    insert into public.text_unit_rate_versions (
      logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
      dramatic_analysis, budget_plan, treatment, bible, screenplay_per_sequence,
      dialogue_per_scene
    ) values (1, 1, 2, 3, 3, 4, 6, 8, 10, 2, 1)
  $$,
  '23502',
  null,
  'Une version publiée sans prix de planning est refusée'
);

-- ---------------------------------------------------------------------------
-- La table des jalons proposés
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_suggestion_milestones'::regclass),
  'La RLS est active sur les jalons proposés'
);

-- Le worker dépose, l'équipe décide : personne n'écrit les jalons directement.
select ok(
  has_table_privilege('authenticated', 'public.ai_suggestion_milestones', 'SELECT')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_milestones', 'INSERT')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_milestones', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_milestones', 'DELETE')
    and not has_table_privilege('anon', 'public.ai_suggestion_milestones', 'SELECT')
    and not has_table_privilege('filmfund_worker', 'public.ai_suggestion_milestones', 'SELECT'),
  'L''équipe lit les jalons proposés ; aucun compte n''en écrit, aucun visiteur n''en lit'
);

select set_eq(
  $$
    select policyname::text, permissive::text, cmd::text
    from pg_policies
    where schemaname = 'public' and tablename = 'ai_suggestion_milestones'
  $$,
  $$
    values
      ('L''équipe et les administrateurs lisent les jalons proposés', 'PERMISSIVE', 'SELECT'),
      ('Mode privé : administrateurs uniquement', 'RESTRICTIVE', 'ALL')
  $$,
  'Deux politiques : la lecture par l''équipe, et le verrou du mode privé'
);

select set_eq(
  $$
    select tgname::text from pg_trigger
    where tgrelid = 'public.ai_suggestion_milestones'::regclass and not tgisinternal
  $$,
  $$ values ('ai_suggestion_milestones_controle'), ('ai_suggestion_milestones_pas_de_vidage') $$,
  'Un jalon proposé ne se modifie, ne se supprime ni ne se vide hors de ses fonctions'
);

-- « Terminé » décrit un projet achevé, pas une période de travail ; une durée
-- reste entre 1 et 730 jours.
select set_eq(
  $$
    select conname::text from pg_constraint
    where conrelid = 'public.ai_suggestion_milestones'::regclass and contype = 'c'
  $$,
  $$
    values
      ('jalon_propose_etat_connu'), ('jalon_propose_titre'), ('jalon_propose_phase'),
      ('jalon_propose_duree'), ('jalon_propose_decision')
  $$,
  'Les bornes d''un jalon proposé sont tenues par la table'
);

-- ---------------------------------------------------------------------------
-- Les fonctions et leurs droits
-- ---------------------------------------------------------------------------

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_planning(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition_planning(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_planning(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_planning(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.contexte_planning(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.livrer_proposition_planning(uuid, jsonb)', 'execute'),
  'Le contexte et le dépôt sont réservés au worker'
);

select ok(
  has_function_privilege('authenticated', 'public.accepter_jalon_propose(uuid, text, text, date, date)', 'execute')
    and has_function_privilege('authenticated', 'public.ecarter_jalon_propose(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_jalon_propose(uuid, text, text, date, date)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_jalon_propose(uuid)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_jalon_propose(uuid, text, text, date, date)', 'execute'),
  'Les comptes connectés décident d''un jalon ; ni les visiteurs, ni le worker'
);

select ok(
  not has_function_privilege('authenticated', 'public.jalon_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_planning(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.controler_jalon_propose()', 'execute')
    and not has_function_privilege('anon', 'public.jalon_a_decider(uuid)', 'execute'),
  'Les fonctions internes ne s''appellent pas depuis l''API'
);

-- Le droit de décider est celui d'écrire le planning, sous le verrou du mode
-- privé : relu dans la fonction que les deux décisions traversent.
select ok(
  (select prosrc ~ 'peut_editer_contenu\(v_jalon\.project_id\)'
      and prosrc ~ 'mode_prive\(\) and not public\.is_admin\(\)'
   from pg_proc where oid = 'public.jalon_a_decider(uuid)'::regprocedure),
  'Décider d''un jalon exige d''écrire le planning, et d''être administrateur en mode privé'
);

-- Écarter la proposition d'un bloc écarte aussi les jalons restants.
select ok(
  (select prosrc ~ 'update public\.ai_suggestion_milestones'
      and prosrc ~ 'update public\.ai_suggestion_budget_lines'
   from pg_proc where oid = 'public.ecarter_lignes_restantes()'::regprocedure),
  'Le déclencheur d''écart en bloc couvre les lignes de budget et les jalons'
);

select * from finish();

rollback;
