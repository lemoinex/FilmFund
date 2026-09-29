-- Retire le droit d'exécution directe des fonctions de déclencheur.
--
-- Signalé par le Security Advisor de Supabase : `handle_new_user` et
-- `empecher_changement_de_role`, toutes deux `security definer`, restaient
-- exécutables par anon et authenticated. Supabase accorde ce droit par défaut
-- à toute nouvelle fonction, et les migrations qui les ont créées ne
-- l'avaient pas retiré.
--
-- Risque concret nul à ce jour : PostgREST n'expose pas les fonctions qui
-- renvoient `trigger`, et Postgres refuse de les exécuter hors d'un
-- déclencheur. Mais une fonction qui contourne la RLS ne doit être appelable
-- par personne qui n'en a pas l'usage, et ces deux-là n'ont d'usage que par
-- leur déclencheur.
--
-- Les déclencheurs continuent de fonctionner : Postgres ne vérifie le droit
-- d'exécution d'une fonction de déclencheur qu'à la création du
-- déclencheur, jamais à son déclenchement.
--
-- Réversible par :
--   grant execute on function public.handle_new_user() to anon, authenticated;
--   grant execute on function public.empecher_changement_de_role() to anon, authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.empecher_changement_de_role() from public, anon, authenticated;
