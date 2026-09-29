import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/supabase/types";

/** Préfixes réservés aux utilisateurs connectés. */
const ROUTES_PROTEGEES = ["/tableau-de-bord", "/projets"];

/** Pages d'authentification, inutiles une fois connecté. */
const ROUTES_INVITE = ["/connexion", "/inscription"];

/**
 * Rafraîchit la session à chaque requête et garde les routes protégées.
 *
 * Sans ce rafraîchissement, le jeton expire côté serveur et l'utilisateur se
 * retrouve déconnecté en pleine navigation.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  /*
   * `getUser()` et non `getSession()` : le premier vérifie le jeton auprès du
   * serveur d'authentification, le second se contente de lire un cookie que
   * le client peut avoir forgé. Une garde bâtie sur `getSession()` se
   * contourne.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && ROUTES_PROTEGEES.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    // Mémorise la destination pour y revenir après connexion.
    url.searchParams.set("suite", pathname);
    return NextResponse.redirect(url);
  }

  if (user && ROUTES_INVITE.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/tableau-de-bord";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
