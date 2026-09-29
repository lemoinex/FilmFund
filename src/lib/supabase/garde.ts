import type { User } from "@supabase/supabase-js";

import { accesAutorise, MESSAGE_ACCES_RESERVE } from "@/lib/acces-prive";
import type { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

/**
 * Garde des actions serveur : session valide, et accès permis par le mode
 * privé.
 *
 * Le middleware refuse déjà les actions postées sur une page protégée. Mais
 * une action serveur reste un point d'entrée à part entière, joignable par
 * une requête forgée : elle vérifie elle-même qui l'appelle. `getUser()`
 * interroge le serveur d'authentification, et ne se contente pas d'un
 * cookie que le client aurait pu forger.
 */
export async function exigerAcces(
  supabase: ClientServeur,
): Promise<{ user: User } | { erreur: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { erreur: "Votre session a expiré. Reconnectez-vous." };
  }
  if (!accesAutorise(user.email)) {
    return { erreur: MESSAGE_ACCES_RESERVE };
  }

  return { user };
}
