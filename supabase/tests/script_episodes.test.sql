-- SCRIPT, épisodes proposés (lot SE2a) : ce que la suite du worker ne voit pas
-- — le barème, les droits lus au catalogue, et les bornes lues dans les
-- fonctions en place. Le parcours d'une proposition, ses garde-fous et le mode
-- privé sont éprouvés par tests/worker-script-episodes.test.mjs, qui mène une
-- vraie tâche jusqu'au dépôt.

begin;

select plan(16);

select is(
  (select array_agg(distinct episode_list) from public.text_unit_rate_versions),
  array[3],
  'Chaque version publiée du barème compte une liste d''épisodes pour 3 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'episode_list', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'episode_list', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select is(
  (
    select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'text_unit_rate_versions'
      and column_name = 'episode_list'
  ),
  null,
  'Une version publiée ensuite doit dire son prix : aucun défaut ne le remplace'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list,
        gear_list, research, cultural_context, treatment, bible,
        screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, -1, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, 1) $$,
  '23514', null, 'Un prix négatif pour les épisodes est refusé'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, budget_plan, schedule_plan, shot_list,
        gear_list, research, cultural_context, treatment, bible,
        screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, 1) $$,
  '23502', null, 'Une version qui tait ce prix est refusée, au lieu de valoir un défaut'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%''episode_list''%'
       and pg_get_constraintdef(oid) like '%''character_list''%'
       and pg_get_constraintdef(oid) like '%''text_correct''%'
       and pg_get_constraintdef(oid) like '%''zip_export''%'
    from pg_constraint
    where conrelid = 'public.quotes'::regclass and conname = 'devis_action_connue'
  ),
  'Le devis admet les épisodes, sans perdre les actions déjà en place'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_suggestion_episodes'::regclass)
    and (
      select array_agg(policyname::text order by policyname) from pg_policies
      where schemaname = 'public' and tablename = 'ai_suggestion_episodes'
    ) = array['L''équipe et les administrateurs lisent ces propositions',
              'Mode privé : administrateurs uniquement']
    and (
      select qual like '%acces_au_projet(project_id)%' and qual like '%is_admin()%'
      from pg_policies
      where tablename = 'ai_suggestion_episodes' and cmd = 'SELECT'
    ),
  'La RLS est active : l''équipe et l''administration lisent, sous la politique du mode privé'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_episodes', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_episodes', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_episodes', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_episodes', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_episodes', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_episodes', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_episodes', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_documents', 'select'),
  'Les épisodes proposés se lisent, et ne s''écrivent que par leurs fonctions ; le worker ne lit aucune table'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_episodes(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_episodes(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.episode_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_episodes(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.controler_episode_propose()', 'execute')
    and not has_function_privilege('anon', 'public.accepter_episode_propose(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_episode_propose(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.accepter_episode_propose(uuid, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.ecarter_episode_propose(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.contexte_episodes(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition_episodes(uuid, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_episode_propose(uuid, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.ecarter_episode_propose(uuid)', 'execute'),
  'Le contexte et le dépôt restent au worker ; il ne décide de rien, un visiteur non plus'
);

select is(public.contexte_episodes('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte des épisodes ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_episodes $$,
  null, null, 'La table des épisodes proposés ne se vide pas'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_suggestion_episodes'
  ),
  array['id', 'suggestion_id', 'project_id', 'position', 'title', 'summary',
        'state', 'episode_id', 'decided_by', 'decided_at', 'created_at'],
  'Une ligne proposée ne porte ni numéro ni durée : un titre, un résumé, un ordre'
);

-- Le numéro d'un épisode accepté suit le plus grand, sous le verrou du projet,
-- et la saison s'arrête à son dernier numéro.
select ok(
  (select prosrc from pg_proc where oid = 'public.accepter_episode_propose(uuid, jsonb)'::regprocedure)
    ~ 'select coalesce\(max\(e\.number\), 0\) \+ 1 into v_numero'
  and (select prosrc from pg_proc where oid = 'public.accepter_episode_propose(uuid, jsonb)'::regprocedure)
    ~ 'if v_numero > 500 then\s+raise exception [^;]+\s+using errcode = ''PR003'''
  and (select prosrc from pg_proc where oid = 'public.accepter_episode_propose(uuid, jsonb)'::regprocedure)
    ~ 'from public\.projects p where p\.id = v_ligne\.project_id for update'
  and (select prosrc from pg_proc where oid = 'public.accepter_episode_propose(uuid, jsonb)'::regprocedure)
    !~ 'update public\.project_episodes|delete from public\.project_episodes',
  'L''acceptation ajoute au numéro suivant, sous le verrou du projet, sans toucher un épisode existant'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'when ''episode_list'' then[^;]+format in \(''serie'', ''web_serie''\)[^;]+raise exception'
  and (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ '>= 500 then\s+raise exception ''Cette série a atteint son dernier numéro'
  and (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'v_quantite := v_bareme\.episode_list;',
  'Un devis d''épisodes est refusé hors d''une série, ou quand la saison n''a plus de numéro'
);

-- Le worker refuse déjà une réponse hors bornes avant de la déposer : sans
-- cette lecture, relever une borne du dépôt ne ferait tomber aucun test.
select ok(
  (select prosrc from pg_proc where oid = 'public.livrer_proposition_episodes(uuid, jsonb)'::regprocedure)
    ~ 'if v_nombre not between 1 and 12 then'
  and (select prosrc from pg_proc where oid = 'public.livrer_proposition_episodes(uuid, jsonb)'::regprocedure)
    ~ 'char_length\(v_titre\) not between 1 and 200\s'
  and (select prosrc from pg_proc where oid = 'public.livrer_proposition_episodes(uuid, jsonb)'::regprocedure)
    ~ 'char_length\(v_resume\) not between 1 and 2000\s'
  and (select prosrc from pg_proc where oid = 'public.livrer_proposition_episodes(uuid, jsonb)'::regprocedure)
    ~ 'if v_job\.action <> ''episode_list'' then',
  'Le dépôt tient ses bornes : douze épisodes, 200 caractères de titre, 2 000 de résumé'
);

-- Ce que SCRIPT lit : la bible, et elle seule parmi les documents ; les
-- épisodes et la bible sont bornés avant de partir.
select ok(
  (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    ~ 'd\.type = ''bible'''
  and (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    ~ 'left\(d\.content, 20000\)'
  and (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    ~ 'left\(t\.summary, 600\)'
  and (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    ~ 'order by e\.number\s+limit 100'
  -- Rendu à la seule tâche d'épisodes : la tâche d'une autre action n'en lit rien.
  and (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    ~ 'and j\.action = ''episode_list'';'
  and (select prosrc from pg_proc where oid = 'public.contexte_episodes(uuid)'::regprocedure)
    !~ 'project_budgets|budget_lines|project_fundings|project_members|scenario|profiles',
  'Le contexte lit la bible seule, bornée, et cent épisodes au plus ; ni budget, ni scénario, ni équipe'
);

select * from finish();

rollback;
