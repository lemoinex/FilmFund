import { NextResponse, type NextRequest } from "next/server";

import { ouvrirSessionDepuisLien } from "@/lib/supabase/ouvrir-session";

/**
 * Point d'arrivée des liens de réinitialisation de mot de passe.
 *
 * Le lien porte un jeton à usage unique, échangé ici contre une session de
 * récupération. Celle-ci autorise la seule opération dont l'utilisateur a
 * besoin : choisir un nouveau mot de passe.
 */
export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;

  if (await ouvrirSessionDepuisLien(request, "recovery")) {
    return NextResponse.redirect(new URL("/nouveau-mot-de-passe", origin));
  }

  /*
   * Lien expiré, déjà utilisé ou malformé. On renvoie vers la demande plutôt
   * que vers la connexion : qui arrive ici a justement oublié son mot de
   * passe, un formulaire de connexion ne l'avancerait à rien.
   */
  const echec = new URL("/mot-de-passe-oublie", origin);
  echec.searchParams.set("erreur", "lien-invalide");
  return NextResponse.redirect(echec);
}
