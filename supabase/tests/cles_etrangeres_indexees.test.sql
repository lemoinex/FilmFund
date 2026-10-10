-- Clés étrangères indexées (lot DU3) : toute clé étrangère de `public` a un
-- index qui commence par sa première colonne. Sans lui, supprimer la ligne
-- référencée relit en entier la table qui la désigne.
--
-- Un index partiel ne compte que s'il écarte les seules lignes où la colonne
-- est vide : celles-là ne désignent rien.
--
-- Le contrôle est éprouvé dans le test même : un index retiré, il doit nommer
-- la clé laissée à nu. Un test qui ne peut pas échouer ne protège rien.

begin;

select plan(4);

create function pg_temp.cles_sans_index() returns setof text language sql stable as $$
  select c.conrelid::regclass::text || '.' || c.conname
  from pg_constraint c
  join pg_namespace n on n.oid = c.connamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and n.nspname = 'public'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = c.conrelid and i.indisvalid and i.indkey[0] = c.conkey[1]
        and (
          i.indpred is null
          or pg_get_expr(i.indpred, i.indrelid) = '(' || a.attname || ' IS NOT NULL)'
        )
    )
  order by 1;
$$;

select is_empty(
  'select pg_temp.cles_sans_index()',
  'Toute clé étrangère de public a un index qui commence par sa première colonne'
);

select cmp_ok(
  (select count(*)::integer from pg_constraint c join pg_namespace n on n.oid = c.connamespace
   where c.contype = 'f' and n.nspname = 'public'),
  '>=',
  29,
  'Le contrôle porte bien sur les clés du schéma, pas sur du vide'
);

select is(
  (
    select count(*)::integer from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'account_suspensions_suspended_by_idx', 'ai_provider_keys_configured_by_idx',
        'budget_lines_created_by_idx', 'project_characters_created_by_idx',
        'project_documents_created_by_idx', 'project_episodes_created_by_idx',
        'project_fundings_created_by_idx', 'project_gear_created_by_idx',
        'project_invitations_invited_by_idx', 'project_members_added_by_idx',
        'project_milestones_created_by_idx', 'project_sources_created_by_idx',
        'scene_shots_created_by_idx', 'storyboard_scenes_created_by_idx',
        'ai_suggestion_budget_lines_budget_line_id_idx', 'ai_suggestion_characters_character_id_idx',
        'ai_suggestion_episodes_episode_id_idx', 'ai_suggestion_gear_gear_id_idx',
        'ai_suggestion_milestones_milestone_id_idx', 'ai_suggestion_opportunities_opportunity_id_idx',
        'ai_suggestion_shots_shot_id_idx', 'ai_suggestion_sources_source_id_idx',
        'ai_suggestions_studio_id_idx', 'jobs_studio_id_idx', 'project_exports_studio_id_idx',
        'quotes_studio_id_idx', 'quotes_plan_version_id_idx', 'quotes_rate_version_id_idx',
        'studio_subscriptions_plan_code_idx'
      )
  ),
  29,
  'Les vingt-neuf index du lot existent'
);

-- L'épreuve : un index de moins, et le contrôle nomme la clé.
drop index public.jobs_studio_id_idx;

select results_eq(
  'select pg_temp.cles_sans_index()',
  array['jobs.jobs_studio_id_fkey'],
  'Un index retiré, le contrôle nomme la clé laissée sans index'
);

select * from finish();

rollback;
