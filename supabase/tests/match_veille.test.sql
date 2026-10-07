-- MATCH, veille des opportunités (lot L6a) : ce que la suite du worker ne
-- voit pas — les droits lus au catalogue, et les bornes qui tiennent une
-- tâche sans projet à la seule veille. Le parcours d'une veille, de la
-- demande à l'opportunité acceptée, est éprouvé par
-- tests/worker-match.test.mjs, qui mène une vraie tâche jusqu'au dépôt.

begin;

select plan(17);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_suggestion_opportunities'::regclass),
  'La RLS est active sur les opportunités proposées'
);

select is(
  (select array_agg(policyname::text order by policyname) from pg_policies
   where schemaname = 'public' and tablename = 'ai_suggestion_opportunities'),
  array[
    'Les administrateurs lisent les opportunités proposées',
    'Mode privé : administrateurs uniquement'
  ],
  'Deux politiques : la lecture de l''administration, et le mode privé'
);

select ok(
  (select qual like '%is_admin()%' and qual not like '%acces_au_projet%'
   from pg_policies
   where tablename = 'ai_suggestion_opportunities'
     and policyname = 'Les administrateurs lisent les opportunités proposées'),
  'Seule l''administration lit une opportunité proposée : aucune équipe de projet'
);

select ok(
  not has_table_privilege('anon', 'public.ai_suggestion_opportunities', 'select')
    and has_table_privilege('authenticated', 'public.ai_suggestion_opportunities', 'select')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_opportunities', 'insert')
    and not has_any_column_privilege('authenticated', 'public.ai_suggestion_opportunities', 'update')
    and not has_table_privilege('authenticated', 'public.ai_suggestion_opportunities', 'delete')
    and not has_any_column_privilege('filmfund_worker', 'public.ai_suggestion_opportunities', 'select'),
  'Les opportunités proposées se lisent, et ne s''écrivent que par leurs fonctions'
);

select ok(
  has_function_privilege('filmfund_worker', 'public.contexte_veille(uuid)', 'execute')
    and has_function_privilege('filmfund_worker', 'public.livrer_proposition_veille(uuid, jsonb, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.contexte_veille(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.livrer_proposition_veille(uuid, jsonb, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.livrer_proposition_veille(uuid, jsonb, jsonb)', 'execute'),
  'Le contexte et le dépôt d''une veille restent au worker, et à lui seul'
);

select ok(
  has_function_privilege('authenticated', 'public.demander_veille(text)', 'execute')
    and has_function_privilege('authenticated', 'public.accepter_opportunite_proposee(uuid, text, text, text)', 'execute')
    and has_function_privilege('authenticated', 'public.ecarter_opportunite_proposee(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.demander_veille(text)', 'execute')
    and not has_function_privilege('anon', 'public.accepter_opportunite_proposee(uuid, text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.ecarter_opportunite_proposee(uuid)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.demander_veille(text)', 'execute')
    and not has_function_privilege('filmfund_worker', 'public.accepter_opportunite_proposee(uuid, text, text, text)', 'execute'),
  'Demander et décider passent par les comptes ; ni un visiteur ni le worker'
);

select ok(
  not has_function_privilege('authenticated', 'public.opportunite_a_decider(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_proposition_veille(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.controler_opportunite_proposee()', 'execute')
    and not has_function_privilege('authenticated', 'public.veilles_par_jour()', 'execute'),
  'Les fonctions internes ne s''appellent pas directement'
);

-- Sans session, personne n'est administrateur : rien ne se demande ni ne se décide.
select throws_ok(
  $$ select public.demander_veille('Fonds pour le documentaire en Afrique centrale') $$,
  '42501', null, 'Sans session, une veille ne se demande pas'
);

select throws_ok(
  $$ select public.accepter_opportunite_proposee('00000000-0000-0000-0000-000000000000') $$,
  '42501', null, 'Sans session, une opportunité proposée ne s''accepte pas'
);

select is(public.contexte_veille('00000000-0000-0000-0000-000000000000'), null,
  'Sans essai en cours, le contexte de la veille ne rend rien');

-- Une tâche sans projet est une veille, et une veille n'a pas de projet : la
-- base le tient, quel que soit le chemin.
select throws_ok(
  $$ insert into public.jobs (action, params, created_by)
     values ('logline', '{}', '00000000-0000-0000-0000-000000000001') $$,
  '23514', null, 'Aucune autre action ne naît sans réservation ni projet'
);

select throws_ok(
  $$ insert into public.jobs (action, params, created_by, project_id)
     values ('opportunity_watch', '{}', '00000000-0000-0000-0000-000000000001',
             '00000000-0000-0000-0000-000000000002') $$,
  '23514', null, 'Une veille ne se rattache pas à un projet'
);

select ok(
  (select pg_get_constraintdef(oid) like '%opportunity_watch%'
   from pg_constraint
   where conname = 'proposition_plateforme' and conrelid = 'public.ai_suggestions'::regclass),
  'Seule la proposition d''une veille se passe de projet'
);

-- Les interventions d'un administrateur sur un projet restent journalisées ;
-- une veille, qui n'en a pas, ne s'y inscrit pas sous ce nom.
select ok(
  (select bool_and(pg_get_triggerdef(t.oid) like '%project_id IS NOT NULL%')
          and count(*) = 2
   from pg_trigger t
   where t.tgname in ('jobs_journal_admin', 'ai_suggestions_journal_admin')
     and t.tgrelid in ('public.jobs'::regclass, 'public.ai_suggestions'::regclass)),
  'Le journal des interventions ne se déclenche que pour une tâche de projet'
);

select ok(
  (select pg_get_constraintdef(oid) like '%''veille_opportunites''%'
          and pg_get_constraintdef(oid) like '%''opportunite''%'
          and pg_get_constraintdef(oid) like '%''cle_fournisseur''%'
   from pg_constraint
   where conname = 'action_connue' and conrelid = 'public.admin_audit_log'::regclass),
  'Le journal connaît la demande de veille, sans rien perdre des autres actions'
);

select throws_ok(
  $$ truncate public.ai_suggestion_opportunities $$,
  null, null, 'La table des opportunités proposées ne se vide pas'
);

-- Les fonctions reprises gardent leurs droits.
select ok(
  has_function_privilege('filmfund_worker', 'public.reclamer_travail(text, text[])', 'execute')
    and has_function_privilege('filmfund_worker', 'public.provisionner_recherche(uuid, text, text, integer, numeric, numeric)', 'execute')
    and not has_function_privilege('authenticated', 'public.reclamer_travail(text, text[])', 'execute')
    and not has_function_privilege('authenticated', 'public.clore_travail(public.jobs, text, integer, text)', 'execute')
    and has_function_privilege('authenticated', 'public.annuler_travail(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.annuler_travail(uuid)', 'execute'),
  'Réclamer, clore, provisionner et annuler gardent leurs droits'
);

select * from finish();

rollback;
