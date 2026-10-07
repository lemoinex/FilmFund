import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { accesAutorise, MESSAGE_ACCES_RESERVE } from "@/lib/acces-prive";
import { CODE_COMPTE_SUSPENDU, MESSAGE_COMPTE_SUSPENDU } from "@/lib/comptes";
import type { Database } from "@/lib/supabase/types";

/** Préfixes réservés aux utilisateurs connectés. */
const ROUTES_PROTEGEES = [
  "/tableau-de-bord",
  "/projets",
  "/documents",
  "/storyboard",
  "/opportunites",
  "/administration",
  "/profil",
];

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

/** Page d'explication pour un compte suspendu. */
const ROUTE_COMPTE_SUSPENDU = "/compte-suspendu";

/** Les pages sous ce préfixe n'existent que pour les administrateurs. */
const ROUTE_ADMINISTRATION = "/administration";

/**
 * Adresse que rien ne sert, ni ne servira : un dossier préfixé d'un tiret bas
 * est exclu du routage de Next. Y réécrire une requête la fait répondre comme
 * toute page absente.
 */
const ROUTE_INEXISTANTE = "/_introuvable";

function sousAdministration(pathname: string) {
  return pathname === ROUTE_ADMINISTRATION || pathname.startsWith(`${ROUTE_ADMINISTRATION}/`);
}

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

  /*
   * Compte suspendu : la base lui refuse toute requête, sous un code qui lui
   * est propre. Sans ce renvoi, chaque page échouerait à sa première lecture,
   * sans rien lui dire. Une requête de plus par page protégée, pour tous :
   * c'est le prix d'une suspension qui prend effet à la page suivante, sans
   * attendre l'expiration d'un jeton.
   *
   * Tout autre échec de l'appel laisse passer : la base reste le verrou, et
   * une panne passagère ne doit pas fermer l'application à tout le monde.
   */
  if (user && ROUTES_PROTEGEES.some((route) => pathname.startsWith(route))) {
    const { error } = await supabase.rpc("compte_suspendu");

    if (error?.code === CODE_COMPTE_SUSPENDU) {
      if (request.method !== "GET" || request.headers.has("next-action")) {
        return new NextResponse(MESSAGE_COMPTE_SUSPENDU, {
          status: 403,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      }

      const url = request.nextUrl.clone();
      url.pathname = ROUTE_COMPTE_SUSPENDU;
      url.search = "";
      const renvoi = NextResponse.redirect(url);
      // La session a pu être rafraîchie plus haut : ses cookies suivent.
      response.cookies.getAll().forEach((cookie) => renvoi.cookies.set(cookie));
      return renvoi;
    }
  }

  /*
   * Administration : pour un compte ordinaire, ces pages n'existent pas. Les
   * laisser répondre 404 elles-mêmes ne suffit pas : leur 404 s'affiche dans
   * la coque de l'application et sous leur propre titre d'onglet, là où une
   * adresse inexistante s'affiche hors de la coque — la différence les
   * trahit. La requête est donc réécrite avant d'atteindre la page, et la
   * réponse est celle de n'importe quelle page absente.
   *
   * En cas d'échec de l'appel, on refuse : mieux vaut un 404 pour un
   * administrateur pendant une panne qu'une page révélée à qui ne l'est pas.
   * Les pages gardent leur propre contrôle, en seconde ligne.
   */
  if (user && sousAdministration(pathname)) {
    const { data: administrateur } = await supabase.rpc("is_admin");

    if (administrateur !== true) {
      const url = request.nextUrl.clone();
      url.pathname = ROUTE_INEXISTANTE;
      const reecriture = NextResponse.rewrite(url, { request });
      // La session a pu être rafraîchie plus haut : ses cookies suivent.
      response.cookies.getAll().forEach((cookie) => reecriture.cookies.set(cookie));
      return reecriture;
    }
  }

  if (user && ROUTES_INVITE.some((route) => pathname.startsWith(route))) {
    const url = request.nextUrl.clone();
    url.pathname = "/tableau-de-bord";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
