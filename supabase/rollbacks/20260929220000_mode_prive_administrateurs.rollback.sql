-- Retrait complet du mode privé (migration 20260929220000).
--
-- Ce fichier n'est PAS appliqué automatiquement : il vit hors de
-- supabase/migrations. Pour l'utiliser, le copier dans supabase/migrations
-- sous un nouveau nom horodaté, puis suivre le parcours habituel (branche,
-- pull request, tests, `supabase db push`). Voir docs/mode-prive.md.
--
-- Pour simplement lever le verrou, ce retrait n'est pas nécessaire :
--   update public.app_settings set private_admin_only = false where id;
--
-- Ce qui est retiré : uniquement les objets créés par la migration du mode
-- privé. Aucune donnée applicative n'est touchée ; seule la table
-- app_settings, qui ne contient que l'interrupteur, disparaît.

begin;

drop trigger if exists profiles_roles_mode_prive on public.profiles;
drop trigger if exists project_invitations_mode_prive on public.project_invitations;
drop trigger if exists project_members_mode_prive on public.project_members;

drop function if exists public.geler_roles();
drop function if exists public.geler_gestion_membres();

drop policy if exists "Mode privé : administrateurs uniquement" on public.profiles;
drop policy if exists "Mode privé : administrateurs uniquement" on public.projects;
drop policy if exists "Mode privé : administrateurs uniquement" on public.project_members;
drop policy if exists "Mode privé : administrateurs uniquement" on public.project_invitations;
drop policy if exists "Mode privé : administrateurs uniquement" on public.project_budgets;
drop policy if exists "Mode privé : administrateurs uniquement" on public.budget_lines;

-- Après les politiques, qui l'appellent.
drop function if exists public.mode_prive();

drop table if exists public.app_settings;

commit;
