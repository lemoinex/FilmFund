import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Ouvre une session depuis un lien reçu par e-mail.
 *
 * Deux formats coexistent selon la configuration du projet :
 *
 *   - `code` : flux PKCE, celui qu'emploie `@supabase/ssr` par défaut. Le
 *     jeton s'échange contre une session.
 *   - `token_hash` + `type` : flux historique, encore servi par certains
 *     modèles d'e-mail.
 *
 * Ne gérer que le second laisse passer des liens que l'utilisateur voit
 * pourtant arriver dans sa boîte : la route répond alors « lien invalide »
 * sur un lien parfaitement valide.
 */
export async function ouvrirSessionDepuisLien(
  request: NextRequest,
  typeAttendu: EmailOtpType,
): Promise<boolean> {
  const { searchParams } = request.nextUrl;
  const supabase = await createClient();

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return !error;
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (token_hash && type === typeAttendu) {
    const { error } = await supabase.auth.verifyOtp({ type: typeAttendu, token_hash });
    return !error;
  }

  return false;
}

/** Destination interne sûre : jamais une URL absolue fournie par la requête. */
export function destinationInterne(valeur: string | null, defaut: string): string {
  return valeur && valeur.startsWith("/") && !valeur.startsWith("//") ? valeur : defaut;
}
