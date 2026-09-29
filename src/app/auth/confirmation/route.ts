import { NextResponse, type NextRequest } from "next/server";

import { destinationInterne, ouvrirSessionDepuisLien } from "@/lib/supabase/ouvrir-session";

/**
 * Point d'arrivée des liens de confirmation d'adresse e-mail.
 *
 * Accepte les deux formats de lien émis par Supabase — `code` (PKCE) et
 * `token_hash` — car le format dépend de la configuration du projet et des
 * modèles d'e-mail. N'en gérer qu'un seul revient à rejeter comme invalides
 * des liens que l'utilisateur vient pourtant de recevoir.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;

  // Redirection toujours interne : un paramètre absolu permettrait d'expédier
  // l'utilisateur ailleurs depuis un lien d'apparence légitime.
  const destination = destinationInterne(searchParams.get("suite"), "/tableau-de-bord");

  if (await ouvrirSessionDepuisLien(request, "email")) {
    return NextResponse.redirect(new URL(destination, origin));
  }

  const echec = new URL("/connexion", origin);
  echec.searchParams.set("erreur", "lien-invalide");
  return NextResponse.redirect(echec);
}
