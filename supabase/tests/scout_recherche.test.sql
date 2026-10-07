-- SCOUT, recherche sourcée (lot L1) : ce que la suite du worker ne voit pas —
-- le barème, les droits lus au catalogue, les bornes des tables et le compte
-- de la dépense du mois. Le parcours d'une recherche, ses garde-fous et le
-- mode privé sont éprouvés par tests/worker-scout.test.mjs, qui mène une
-- vraie tâche jusqu'au dépôt.

begin;

select plan(17);

select is(
  (select array_agg(distinct research) from public.text_unit_rate_versions),
  array[3],
  'Chaque version publiée du barème compte une recherche pour 3 unités'
);

select ok(
  has_column_privilege('authenticated', 'public.text_unit_rate_versions', 'research', 'insert')
    and has_column_privilege('anon', 'public.text_unit_rate_versions', 'research', 'select'),
  'L''administration publie la colonne, la vitrine la lit'
);

select throws_ok(
  $$ insert into public.text_unit_rate_versions
       (logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note,
        direction_note, pitch_extended, pitch_oral,
        dramatic_analysis, budget_plan, schedule_plan, shot_list, gear_list, research, cultural_context,
        treatment, bible, screenplay_per_sequence, dialogue_per_scene)
     values (1, 1, 2, 3, 3, 3, 2, 2, 4, 6, 3, 4, 5, -1, 3, 8, 10, 2, 1) $$,
  '23514', null, 'Un prix négatif pour la recherche est refusé'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_sources', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_sources', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_sources', 'insert')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_sources', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_sources', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_sources', 'select'),
  'Les sources proposées se lisent, et ne s''écrivent que par leurs fonctions'
);

-- Une source retenue se lit et se supprime ; elle ne s'ajoute ni ne se
-- corrige à la main — son statut compris.
select ok(
  not has_table_privilege('anon', 'public.project_sources', 'select')
    and has_table_privilege('authenticated', 'public.project_sources', 'select')
    and has_table_privilege('authenticated', 'public.project_sources', 'delete')
    and not has_table_privilege('authenticated', 'public.project_sources', 'insert')
    and not has_any_column_privilege('authenticated', 'public.project_sources', 'update')
    and not has_any_column_privilege('filmfund_worker', 'public.project_sources', 'select'),
  'Une source retenue ne s''ajoute ni ne se corrige à la main'
);

select ok(
  not has_table_privilege('anon', 'public.provider_search_charges', 'select')
    and not has_table_privilege('authenticated', 'public.provider_search_charges', 'insert')
    and not has_table_privilege('authenticated', 'public.provider_search_settlements', 'insert')
    and not has_any_column_privilege('filmfund_worker', 'public.provider_search_charges', 'select')
    and not has_any_column_privilege('filmfund_worker', 'public.provider_search_settlements', 'select'),
  'Les coûts de recherche ne s''écrivent que par leurs fonctions'
);

select ok(
  not has_function_privilege('authenticated', 'public.contexte_recherche(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_recherche(uuid, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'public.confirmer_recherche(uuid, integer, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'public.source_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_recherche(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_source_proposee(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_source_proposee(uuid)', 'execute'),
  'Le contexte, les coûts et le dépôt restent au worker ; un visiteur ne décide de rien'
);

select is(public.contexte_recherche('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte de la recherche ne rend rien');

select throws_ok(
  $$ truncate public.ai_suggestion_sources $$,
  null, null, 'La table des sources proposées ne se vide pas'
);

select throws_ok(
  $$ truncate public.provider_search_charges, public.provider_search_settlements $$,
  null, null, 'Le registre des coûts de recherche ne se vide pas'
);

-- Le coffre admet Perplexity, et lui seul de plus.
select ok(
  (select pg_get_constraintdef(oid) like '%''perplexity''%'
          and pg_get_constraintdef(oid) not like '%mistral%'
   from pg_constraint
   where conname = 'fournisseur_ia_connu' and conrelid = 'public.ai_provider_keys'::regclass),
  'Le coffre des clés connaît Perplexity'
);

select throws_ok(
  $$ insert into public.provider_search_charges
       (attempt_id, job_id, studio_id, project_id, provider, profile, estimated_requests, estimated_usd)
     values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
             'openai', 'scout.recherche@1', 1, 0.005) $$,
  '23514', null, 'Un coût de recherche ne se rattache qu''à un moteur connu'
);

-- La dépense du mois compte les recherches : la provision tant que rien
-- n'est confirmé, le montant confirmé ensuite.
create temporary table depense_avant as select public.depense_ia_du_mois() as usd;

insert into public.provider_search_charges
  (attempt_id, job_id, studio_id, project_id, provider, profile, estimated_requests, estimated_usd)
values
  ('11111111-1111-4111-8111-111111111111', gen_random_uuid(), gen_random_uuid(),
   gen_random_uuid(), 'perplexity', 'scout.recherche@1', 1, 1.5);

select is(
  public.depense_ia_du_mois() - (select usd from depense_avant),
  1.5::numeric,
  'Une recherche provisionnée compte au pire dans la dépense du mois'
);

insert into public.provider_search_settlements (attempt_id, requests, usd)
values ('11111111-1111-4111-8111-111111111111', 1, 0.25);

select is(
  public.depense_ia_du_mois() - (select usd from depense_avant),
  0.25::numeric,
  'Une fois confirmée, c''est son montant réel qui compte'
);

select throws_ok(
  $$ update public.provider_search_settlements set usd = 0
     where attempt_id = '11111111-1111-4111-8111-111111111111' $$,
  null, null, 'Un coût de recherche confirmé ne se corrige pas'
);

-- Aucune colonne où une source se dirait vérifiée par la plateforme : elle
-- ne l'est pas. Ni organisme : le moteur ne le donne pas.
select is(
  (
    select array_agg(column_name::text order by ordinal_position)
    from information_schema.columns
    where table_schema = 'public' and table_name = 'ai_suggestion_sources'
  ),
  array['id', 'suggestion_id', 'project_id', 'position', 'url', 'title', 'site', 'excerpt',
        'published_on', 'collected_at', 'cited', 'state', 'source_id', 'decided_by', 'decided_at',
        'created_at'],
  'Une source proposée ne porte que ce que la collecte a rendu'
);

-- Les cinq statuts du dépôt, et pas un de plus ; une adresse en clair est refusée.
select ok(
  (select pg_get_constraintdef(oid) like '%non_verifie%verifie%expire%introuvable%demo%'
   from pg_constraint
   where conname = 'source_statut_connu' and conrelid = 'public.project_sources'::regclass)
  and (select column_default like '%non_verifie%'
       from information_schema.columns
       where table_schema = 'public' and table_name = 'project_sources' and column_name = 'status')
  and (select pg_get_constraintdef(oid) like '%^https://%'
       from pg_constraint
       where conname = 'source_adresse' and conrelid = 'public.project_sources'::regclass),
  'Une source retenue naît non vérifiée, parmi cinq statuts, à une adresse HTTPS'
);

select * from finish();

rollback;
