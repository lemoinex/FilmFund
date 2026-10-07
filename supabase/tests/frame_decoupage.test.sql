-- FRAME, découpage proposé (lot J3c-2a) : ce que la suite du worker ne voit
-- pas — le barème, et les droits lus au catalogue. Le parcours d'une
-- proposition, ses garde-fous et le mode privé sont éprouvés par
-- tests/worker-frame.test.mjs, qui mène une vraie tâche jusqu'au dépôt.

begin;

select plan(7);

-- ---------------------------------------------------------------------------
-- Barème et catalogue
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(distinct shot_list) from public.text_unit_rate_versions),
  array[4],
  'Chaque version publiée du barème compte le découpage d''une scène pour 4 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'shot_list', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'shot_list', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, budget_plan, schedule_plan, shot_list, gear_list, research, cultural_context, treatment, bible,
        screenplay_per_sequence, dialogue_per_scene)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, 6, 3, -1, 5, 3, 3, 8, 10, 2, 1) $$,
  '23514', null, 'Un prix négatif pour le découpage est refusé'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_shots', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_shots', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_shots', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_shots', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_shots', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_shots', 'select'),
  'Les plans proposés se lisent, et ne s''écrivent que par leurs fonctions'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_decoupage(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_decoupage(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.plan_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_decoupage(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_plan_propose(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_plan_propose(uuid)', 'execute'),
  'Le contexte et le dépôt restent au worker ; un visiteur ne décide de rien'
);

select is(public.contexte_decoupage('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte du découpage ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_shots $$,
  null, null, 'La table des plans proposés ne se vide pas'
);

select * from finish();

rollback;
