import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Point d'arrivée des liens de confirmation d'adresse e-mail.
 *
 * Supabase renvoie ici avec un jeton à usage unique, que l'on échange contre
 * une session.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const suite = searchParams.get("suite");

  // Redirection toujours interne : un paramètre `suite` absolu permettrait
  // d'expédier l'utilisateur ailleurs depuis un lien d'apparence légitime.
  const destination =
    suite && suite.startsWith("/") && !suite.startsWith("//") ? suite : "/tableau-de-bord";

  if (token_hash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash });

    if (!error) {
      return NextResponse.redirect(new URL(destination, origin));
    }
  }

  const echec = new URL("/connexion", origin);
  echec.searchParams.set("erreur", "lien-invalide");
  return NextResponse.redirect(echec);
}
