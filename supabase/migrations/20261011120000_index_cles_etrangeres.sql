-- Un index pour chaque clé étrangère qui n'en avait pas (lot DU3).
--
-- PostgreSQL indexe la colonne référencée, jamais celle qui référence. Sans
-- index de ce côté, supprimer ou modifier la ligne référencée — un profil, un
-- studio, une ligne de budget — fait relire en entier chaque table qui la
-- désigne, sous verrou. Sans effet au volume d'aujourd'hui, où ces tables
-- comptent moins de cent lignes ; à corriger avant qu'il ne grandisse.
--
-- Vingt-neuf clés, relevées en production le 10 octobre 2026 : celles dont
-- aucun index ne commence par la colonne de la clé. Les clés à deux colonnes
-- du dépôt — (scène, projet), (document, projet) — ont déjà leur index sur la
-- première, qui identifie seule la ligne référencée : elles ne sont pas ici.
--
-- Rien d'autre ne change : ni table, ni colonne, ni politique, ni fonction.
--
-- La création n'est pas concurrente — une migration est une transaction — :
-- chaque table est fermée à l'écriture le temps de son index, un instant à ce
-- volume.
--
-- `supabase/tests/cles_etrangeres_indexees.test.sql` refuse désormais toute
-- clé étrangère de `public` sans index : une table nouvelle indexe les siennes.
--
-- Retour arrière : `drop index public.<nom>` pour chacun des index ci-dessous.

-- Qui a créé ou décidé : la colonne ne sert qu'à la suppression d'un profil.
create index account_suspensions_suspended_by_idx on public.account_suspensions (suspended_by);
create index ai_provider_keys_configured_by_idx on public.ai_provider_keys (configured_by);
create index budget_lines_created_by_idx on public.budget_lines (created_by);
create index project_characters_created_by_idx on public.project_characters (created_by);
create index project_documents_created_by_idx on public.project_documents (created_by);
create index project_episodes_created_by_idx on public.project_episodes (created_by);
create index project_fundings_created_by_idx on public.project_fundings (created_by);
create index project_gear_created_by_idx on public.project_gear (created_by);
create index project_invitations_invited_by_idx on public.project_invitations (invited_by);
create index project_members_added_by_idx on public.project_members (added_by);
create index project_milestones_created_by_idx on public.project_milestones (created_by);
create index project_sources_created_by_idx on public.project_sources (created_by);
create index scene_shots_created_by_idx on public.scene_shots (created_by);
create index storyboard_scenes_created_by_idx on public.storyboard_scenes (created_by);

-- Ce qu'une ligne proposée est devenue, une fois acceptée.
create index ai_suggestion_budget_lines_budget_line_id_idx
  on public.ai_suggestion_budget_lines (budget_line_id);
create index ai_suggestion_characters_character_id_idx
  on public.ai_suggestion_characters (character_id);
create index ai_suggestion_episodes_episode_id_idx
  on public.ai_suggestion_episodes (episode_id);
create index ai_suggestion_gear_gear_id_idx on public.ai_suggestion_gear (gear_id);
create index ai_suggestion_milestones_milestone_id_idx
  on public.ai_suggestion_milestones (milestone_id);
create index ai_suggestion_opportunities_opportunity_id_idx
  on public.ai_suggestion_opportunities (opportunity_id);
create index ai_suggestion_shots_shot_id_idx on public.ai_suggestion_shots (shot_id);
create index ai_suggestion_sources_source_id_idx on public.ai_suggestion_sources (source_id);

-- Le studio d'une tâche, d'une proposition, d'un export, d'un devis.
create index ai_suggestions_studio_id_idx on public.ai_suggestions (studio_id);
create index jobs_studio_id_idx on public.jobs (studio_id);
create index project_exports_studio_id_idx on public.project_exports (studio_id);
create index quotes_studio_id_idx on public.quotes (studio_id);

-- Les versions du catalogue qu'un devis ou un abonnement désigne.
create index quotes_plan_version_id_idx on public.quotes (plan_version_id);
create index quotes_rate_version_id_idx on public.quotes (rate_version_id);
create index studio_subscriptions_plan_code_idx on public.studio_subscriptions (plan_code);
