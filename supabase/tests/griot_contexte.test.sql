-- GRIOT, contexte historique et culturel (lot L3) : ce que la suite du worker
-- ne voit pas — le barème, et les droits lus au catalogue. Le parcours d'une
-- demande est éprouvé par tests/worker-griot.test.mjs, qui mène une vraie
-- tâche jusqu'au dépôt ; les tables, elles, sont celles de SCOUT.

begin;

select plan(7);

select is(
  (select array_agg(distinct cultural_context) from public.text_unit_rate_versions),
  array[3],
  'Chaque version publiée du barème compte un contexte pour 3 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'cultural_context', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'cultural_context', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list, gear_list, research,
        cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, 3, 6, 3, 4, 5, 3, -1, 8, 10, 2, 1, 1) $$,
  '23514', null, 'Un prix négatif pour le contexte est refusé'
);

select ok(
  (select pg_get_constraintdef(oid) like '%''cultural_context''%'
          and pg_get_constraintdef(oid) like '%''research''%'
          and pg_get_constraintdef(oid) like '%''storyboard_image''%'
   from pg_constraint
   where conname = 'devis_action_connue' and conrelid = 'public.quotes'::regclass),
  'Les devis connaissent le contexte, sans rien perdre des autres actions'
);

-- Les fonctions rechargées gardent leurs droits : au worker, et à lui seul.
select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_recherche(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition_recherche(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_recherche(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_recherche(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.contexte_recherche(uuid)', 'execute'),
  'Le contexte, la provision et le dépôt restent au worker, et à lui seul'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.livrer_proposition_recherche(uuid, text, jsonb)'::regprocedure)
    and (select proconfig::text like '%search_path=pg_catalog, public%'
         from pg_proc where oid = 'public.livrer_proposition_recherche(uuid, text, jsonb)'::regprocedure),
  'Le dépôt garde son chemin de recherche fixé'
);

-- Aucune table de plus : GRIOT dépose dans celles de SCOUT.
select is(
  (select count(*)::integer from pg_tables
   where schemaname = 'public' and tablename like '%source%'),
  2,
  'Les sources n''ont que deux tables : proposées et retenues'
);

select * from finish();

rollback;
