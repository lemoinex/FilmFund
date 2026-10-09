-- ARC, personnages proposés (lot X2a) : ce que la suite du worker ne voit pas
-- — le barème, les droits lus au catalogue, et la borne lue dans les fonctions
-- en place. Le parcours d'une proposition, ses garde-fous et le mode privé
-- sont éprouvés par tests/worker-arc-personnages.test.mjs, qui mène une vraie
-- tâche jusqu'au dépôt.

begin;

select plan(13);

select is(
  (select array_agg(distinct character_list) from public.text_unit_rate_versions),
  array[3],
  'Chaque version publiée du barème compte une liste de personnages pour 3 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'character_list', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'character_list', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select is(
  (
    select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'text_unit_rate_versions'
      and column_name = 'character_list'
  ),
  null,
  'Une version publiée ensuite doit dire son prix : aucun défaut ne le remplace'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list, gear_list,
        research, cultural_context, treatment, bible,
        screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, -1, 3, 6, 3, 4, 5, 3, 3, 8, 10, 2, 1, 1) $$,
  '23514', null, 'Un prix négatif pour les personnages est refusé'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_characters', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_characters', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_characters', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_characters', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_characters', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_characters', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.project_characters', 'select'),
  'Les personnages proposés se lisent, et ne s''écrivent que par leurs fonctions ; le worker ne lit aucune table'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_personnages(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_personnages(uuid, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.personnage_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_personnages(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_personnage_propose(uuid, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_personnage_propose(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.contexte_personnages(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition_personnages(uuid, jsonb)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_personnage_propose(uuid, jsonb)', 'execute'),
  'Le contexte et le dépôt restent au worker ; il ne décide de rien, un visiteur non plus'
);

select is(public.contexte_personnages('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte des personnages ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_characters $$,
  null, null, 'La table des personnages proposés ne se vide pas'
);

select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_suggestion_characters'
  ),
  array['id', 'suggestion_id', 'project_id', 'position', 'name', 'role', 'description',
        'state', 'character_id', 'decided_by', 'decided_at', 'created_at'],
  'Une ligne proposée ne porte que les champs d''un personnage'
);

-- La borne de cinquante se lit dans les fonctions en place : l'acceptation
-- la tient, et le devis refuse une liste déjà pleine.
select ok(
  (select prosrc from pg_proc where oid = 'public.accepter_personnage_propose(uuid, jsonb)'::regprocedure)
    ~ 'if v_nombre >= 50 then\s+raise exception [^;]+using errcode = ''PR003'''
  and (select prosrc from pg_proc where oid = 'public.accepter_personnage_propose(uuid, jsonb)'::regprocedure)
    ~ 'from public\.projects p where p\.id = v_ligne\.project_id for update',
  'L''acceptation s''arrête à cinquante personnages, sous le verrou du projet'
);

select ok(
  (select prosrc from pg_proc where oid = 'public.creer_devis(uuid, text, jsonb)'::regprocedure)
    ~ 'when ''character_list'' then[^;]+>= 50 then\s+raise exception',
  'Un devis de personnages est refusé quand la liste est pleine'
);

-- Le worker refuse déjà une réponse trop longue avant de la déposer : sans
-- cette lecture, relever la borne du dépôt ne ferait tomber aucun test.
select ok(
  (select prosrc from pg_proc where oid = 'public.livrer_proposition_personnages(uuid, jsonb)'::regprocedure)
    ~ 'if v_nombre not between 1 and 12 then'
  and (select prosrc from pg_proc where oid = 'public.livrer_proposition_personnages(uuid, jsonb)'::regprocedure)
    ~ 'char_length\(v_nom\) not between 1 and 120\s'
  and (select prosrc from pg_proc where oid = 'public.livrer_proposition_personnages(uuid, jsonb)'::regprocedure)
    ~ 'char_length\(v_description\) not between 1 and 2000\s',
  'Le dépôt tient ses bornes : douze personnages, 120 caractères de nom, 2 000 de description'
);

-- Même raison : le worker écarte un rôle inconnu avant le dépôt, si bien que
-- seule cette lecture voit la base cesser de le recontrôler.
select ok(
  (select prosrc from pg_proc where oid = 'public.livrer_proposition_personnages(uuid, jsonb)'::regprocedure)
    ~ 'if not coalesce\(\(v_ligne ->> ''role''\) in \(''principal'', ''secondaire''\), false\)'
  and (select prosrc from pg_proc where oid = 'public.accepter_personnage_propose(uuid, jsonb)'::regprocedure)
    ~ '\(v_retenu ->> ''role''\) in \(''principal'', ''secondaire''\)',
  'Le dépôt et l''acceptation recontrôlent le rôle, quoi qu''ait vérifié le worker'
);

select * from finish();

rollback;
