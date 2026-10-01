-- Durcissements mineurs relevés par l'audit d'implémentation.
--
-- 1. Quatre politiques anciennes appellent `public.is_admin()` directement.
--    Sous la forme `(select public.is_admin())`, PostgreSQL l'évalue une
--    fois par requête au lieu d'une fois par ligne. Le sens ne change pas :
--    seule l'expression est réécrite, par `alter policy`, sans recréer les
--    politiques ni ouvrir de fenêtre où elles manqueraient.
--
-- 2. `touch_updated_at()` est une fonction de déclencheur. L'appeler
--    directement n'a pas de sens, mais Supabase en accorde l'exécution à
--    tous, visiteurs compris : on la retire. Les déclencheurs, eux, ne
--    vérifient pas ce droit et continuent de l'exécuter.
--
-- Retour arrière : réversible à l'identique — `alter policy` vers la forme
-- précédente, `grant execute` à public, anon et authenticated.

-- ---------------------------------------------------------------------------
-- Politiques : is_admin() évaluée une fois par requête
-- ---------------------------------------------------------------------------

alter policy "Un administrateur lit tous les profils" on public.profiles
  using ((select public.is_admin()));

alter policy "Un administrateur modifie tous les profils" on public.profiles
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "Un administrateur lit tous les projets" on public.projects
  using ((select public.is_admin()));

alter policy "Un administrateur supprime tout projet" on public.projects
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Fonction de déclencheur : plus d'exécution directe
-- ---------------------------------------------------------------------------

revoke all on function public.touch_updated_at() from public, anon, authenticated;
