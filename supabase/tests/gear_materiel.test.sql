-- GEAR, matériel proposé (lot J3c-3) : ce que la suite du worker ne voit pas
-- — le barème, et les droits lus au catalogue. Le parcours d'une proposition,
-- ses garde-fous et le mode privé sont éprouvés par tests/worker-gear.test.mjs,
-- qui mène une vraie tâche jusqu'au dépôt.

begin;

select plan(8);

select is(
  (select array_agg(distinct gear_list) from public.text_unit_rate_versions),
  array[5],
  'Chaque version publiée du barème compte une liste de matériel pour 5 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'gear_list', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'gear_list', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        dramatic_analysis, budget_plan, schedule_plan, shot_list, gear_list, treatment, bible,
        screenplay_per_sequence, dialogue_per_scene)
     values (1, 1, 2, 3, 3, 4, 6, 3, 4, -1, 8, 10, 2, 1) $$,
  '23514', null, 'Un prix négatif pour le matériel est refusé'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_gear', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_gear', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_gear', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_gear', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_gear', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_gear', 'select'),
  'Le matériel proposé se lit, et ne s''écrit que par ses fonctions'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_materiel(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_materiel(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.materiel_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_materiel(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_materiel_propose(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_materiel_propose(uuid)', 'execute'),
  'Le contexte et le dépôt restent au worker ; un visiteur ne décide de rien'
);

select is(public.contexte_materiel('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte du matériel ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_gear $$,
  null, null, 'La table du matériel proposé ne se vide pas'
);

-- Aucune colonne où un modèle déposerait un calcul : ni total, ni intensité.
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_suggestion_gear'
  ),
  array['id', 'suggestion_id', 'project_id', 'position', 'category', 'label', 'quantity',
        'unit_power_watts', 'simultaneous', 'state', 'gear_id', 'decided_by', 'decided_at',
        'created_at'],
  'Une ligne proposée ne porte que les champs d''un équipement : aucun calcul'
);

select * from finish();

rollback;
