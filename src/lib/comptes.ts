/**
 * Administration des comptes (lot V1) : ce que l'écran demande à la base, et
 * ce qu'il affiche d'un compte. Module pur, testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/** Rôles applicatifs. Mêmes codes que l'énumération `user_role` en base. */
export const ROLES_COMPTE = {
  member: "Membre",
  admin: "Administrateur",
} as const;

export type RoleCompte = keyof typeof ROLES_COMPTE;

/**
 * Bornes de la liste. La base refuse plus de cent comptes par appel et une
 * recherche de plus de 120 caractères : l'écran reste en deçà.
 */
export const LISTE_COMPTES = {
  parPage: 50,
  rechercheMax: 120,
  pageMax: 2000,
} as const;

/** Un compte, tel que `comptes_administration()` le rend. */
export type Compte = {
  id: string;
  email: string | null;
  email_confirme: boolean;
  cree_le: string;
  derniere_connexion: string | null;
  display_name: string;
  role: RoleCompte;
  profile_type: string | null;
  country: string | null;
  total: number;
};

const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;
const IDENTIFIANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Texte cherché, ramené à une ligne. Vide : toute la liste. Nul si la saisie
 * n'a pas la forme d'un texte, déborde, ou garde un caractère de contrôle.
 */
export function lireRecherche(valeur: unknown): string | null {
  if (valeur === undefined || valeur === null) {
    return "";
  }
  if (typeof valeur !== "string") {
    return null;
  }
  const texte = valeur.replace(/\s+/g, " ").trim();
  if (CONTROLE.test(texte) || [...texte].length > LISTE_COMPTES.rechercheMax) {
    return null;
  }
  return texte;
}

/** Numéro de page lu dans l'adresse : 1 pour tout ce qui n'en est pas un. */
export function lirePage(valeur: unknown): number {
  if (typeof valeur !== "string" || !/^[1-9]\d{0,3}$/.test(valeur)) {
    return 1;
  }
  return Math.min(Number(valeur), LISTE_COMPTES.pageMax);
}

export function nombreDePages(total: number): number {
  return Math.max(1, Math.ceil(total / LISTE_COMPTES.parPage));
}

export function lireRole(valeur: unknown): RoleCompte | null {
  return typeof valeur === "string" && Object.hasOwn(ROLES_COMPTE, valeur)
    ? (valeur as RoleCompte)
    : null;
}

/** Identifiant de compte bien formé : la base n'est pas interrogée sans cela. */
export function estIdentifiantDeCompte(valeur: unknown): valeur is string {
  return typeof valeur === "string" && IDENTIFIANT.test(valeur);
}

/** Adresse de la liste, pour une recherche et une page données. */
export function adresseListe(recherche: string, page: number): string {
  const parametres = new URLSearchParams();
  if (recherche) {
    parametres.set("q", recherche);
  }
  if (page > 1) {
    parametres.set("page", String(page));
  }
  const suite = parametres.toString();
  return suite ? `/administration/utilisateurs?${suite}` : "/administration/utilisateurs";
}

/**
 * Pourquoi un rôle ne se change pas ici, ou nul s'il se change.
 *
 * La base a le dernier mot — `definir_role()` et le gel du mode privé
 * refusent de toute façon ; l'écran le dit avant, plutôt que d'afficher un
 * refus après coup.
 */
export function obstacleAuChangementDeRole({
  soiMeme,
  modePrive,
}: {
  soiMeme: boolean;
  modePrive: boolean;
}): string | null {
  if (modePrive) {
    return "Le mode privé est actif : les changements de rôle sont suspendus pour tous les comptes, administrateurs compris.";
  }
  if (soiMeme) {
    return "Un administrateur ne retire pas son propre rôle : un autre administrateur doit le faire.";
  }
  return null;
}

/** Ce que l'écran annonce avant le second clic. */
export function annonceChangementDeRole(nouveau: RoleCompte): string {
  return nouveau === "admin"
    ? "Un administrateur lit et gère tout : projets, budgets, comptes, plans et clés des fournisseurs. Tant que le mode privé est actif, ce compte doit aussi figurer dans la liste des adresses autorisées pour entrer dans l'application."
    : "Ce compte perdra l'accès à l'administration et ne lira plus que ses propres projets et ceux de ses équipes.";
}
