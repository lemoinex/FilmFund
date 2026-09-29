import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Déconnexion par une route dédiée.
 *
 * La page d'accès réservé ne peut pas se reposer sur une action serveur :
 * une action se poste à l'adresse de la page courante, et si celle-ci est
 * une route protégée, la garde du mode privé la refuse. Le compte tenu à
 * l'écart ne pourrait alors plus se déconnecter. Cette route vit sous
 * /auth, que la garde laisse toujours passer.
 */
export async function POST(request: NextRequest) {
  // Refuse les formulaires postés depuis un autre site : sans ce contrôle,
  // n'importe quelle page pourrait déconnecter l'utilisateur à son insu.
  const origine = request.headers.get("origin");
  if (origine && origine !== request.nextUrl.origin) {
    return new NextResponse(null, { status: 403 });
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  // 303 : le navigateur suit la redirection en GET, et non en rejouant le POST.
  return NextResponse.redirect(new URL("/connexion", request.nextUrl.origin), 303);
}
