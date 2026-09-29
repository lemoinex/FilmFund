import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { accesAutorise, MESSAGE_ACCES_RESERVE } from "@/lib/acces-prive";
import type { Database } from "@/lib/supabase/types";

/** Préfixes réservés aux utilisateurs connectés. */
const ROUTES_PROTEGEES = ["/tableau-de-bord", "/projets"];

/**
 * Pages d'authentification, inutiles une fois connecté.
 *
 * `/nouveau-mot-de-passe` n'y figure pas volontairement : le lien de
 * réinitialisation ouvre une session de récupération avant d'y mener. L'y
 * ajouter renverrait l'utilisateur au tableau de bord sans qu'il ait pu
 * changer son mot de passe, et rendrait le parcours inutilisable.
 */
const ROUTES_INVITE = ["/connexion", "/inscription"];

/** Page d'explication pour les comptes que le mode privé tient à l'écart. */
const ROUTE_ACCES_REFUSE = "/acces-refuse";

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

  /*
   * Mode privé : un compte hors liste blanche est authentifié, mais tenu à
   * l'écart de l'application. Les pages publiques, la connexion et le
   * parcours de réinitialisation restent accessibles : ils ne livrent
   * aucune donnée, et bloquer les routes /auth casserait les liens reçus
   * par e-mail avant même que la garde ait quelque chose à protéger.
   */
  if (
    user &&
    !accesAutorise(user.email) &&
    ROUTES_PROTEGEES.some((route) => pathname.startsWith(route))
  ) {
    // Action serveur ou requête d'écriture : un refus explicite. Une
    // redirection n'aurait pas de sens pour un appel qui attend une réponse.
    if (request.method !== "GET" || request.headers.has("next-action")) {
      return new NextResponse(MESSAGE_ACCES_RESERVE, {
        status: 403,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    const url = request.nextUrl.clone();
    url.pathname = ROUTE_ACCES_REFUSE;
    url.search = "";
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
