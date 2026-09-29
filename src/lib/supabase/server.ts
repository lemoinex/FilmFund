import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/supabase/types";

/**
 * Client Supabase pour le code serveur : composants serveur, actions et
 * gestionnaires de route.
 *
 * Utilise la même clé publiable que le navigateur, plus les cookies de
 * session. La clé secrète n'apparaît nulle part : elle contournerait la RLS,
 * et une requête qui en aurait besoin trahirait une politique mal écrite.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Écriture impossible depuis un composant serveur rendu : le
            // middleware rafraîchit déjà la session, donc l'ignorer est sans
            // conséquence.
          }
        },
      },
    },
  );
}
