import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

/*
 * Next 16 appelle « proxy » ce qu'il appelait « middleware », et l'exécute
 * sous Node.js. La garde elle-même n'a pas bougé : elle reste dans
 * `lib/supabase/middleware.ts`, que les tests lisent par ce chemin.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Toutes les routes sauf les fichiers statiques et les images : les
     * exclure évite un appel d'authentification inutile à chaque ressource.
     * S'y ajoutent trois adresses publiques que lit l'application installée —
     * la version du build, le manifest, l'association Android : elles ne
     * portent ni session ni donnée, et ne doivent jamais être redirigées.
     */
    "/((?!_next/static|_next/image|favicon.ico|images/|api/version$|manifest.webmanifest$|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
