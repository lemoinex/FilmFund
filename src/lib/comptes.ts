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
  suspendu = false,
}: {
  soiMeme: boolean;
  modePrive: boolean;
  /** Le compte est suspendu, et c'est le rôle d'administrateur qui est demandé. */
  suspendu?: boolean;
}): string | null {
  if (modePrive) {
    return "Le mode privé est actif : les changements de rôle sont suspendus pour tous les comptes, administrateurs compris.";
  }
  if (soiMeme) {
    return "Un administrateur ne retire pas son propre rôle : un autre administrateur doit le faire.";
  }
  if (suspendu) {
    return "Ce compte est suspendu : rétablissez-le avant de lui donner le rôle d'administrateur.";
  }
  return null;
}

/** Ce que l'écran annonce avant le second clic. */
export function annonceChangementDeRole(nouveau: RoleCompte): string {
  return nouveau === "admin"
    ? "Un administrateur lit et gère tout : projets, budgets, comptes, plans et clés des fournisseurs. Tant que le mode privé est actif, ce compte doit aussi figurer dans la liste des adresses autorisées pour entrer dans l'application."
    : "Ce compte perdra l'accès à l'administration et ne lira plus que ses propres projets et ceux de ses équipes.";
}

/*
 * Suspension d'un compte (lot V2b).
 */

/** Code que la base rend à toute requête d'un compte suspendu. */
export const CODE_COMPTE_SUSPENDU = "CS001";

/** Ce que le compte suspendu lit : jamais le motif, réservé à l'administration. */
export const MESSAGE_COMPTE_SUSPENDU =
  "Ce compte est suspendu. Vos projets et vos documents sont conservés, mais vous ne pouvez plus y accéder.";

/** Bornes du motif. Mêmes bornes que la contrainte de `account_suspensions`. */
export const MOTIF_SUSPENSION = { min: 10, max: 500 } as const;

/**
 * Motif saisi, ramené à une ligne. Nul s'il n'a pas la forme d'un texte, sort
 * des bornes ou garde un caractère de contrôle.
 */
export function lireMotif(valeur: unknown): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const texte = valeur.replace(/\s+/g, " ").trim();
  const longueur = [...texte].length;
  if (CONTROLE.test(texte) || longueur < MOTIF_SUSPENSION.min || longueur > MOTIF_SUSPENSION.max) {
    return null;
  }
  return texte;
}

/**
 * Pourquoi un compte ne se suspend pas, ou nul s'il se suspend. La base
 * refuse de toute façon ; l'écran le dit avant.
 */
export function obstacleALaSuspension({
  soiMeme,
  administrateur,
}: {
  soiMeme: boolean;
  administrateur: boolean;
}): string | null {
  if (soiMeme) {
    return "Un administrateur ne suspend pas son propre compte.";
  }
  if (administrateur) {
    return "Un administrateur ne peut pas être suspendu : retirez d'abord son rôle.";
  }
  return null;
}

/** Ce que l'écran annonce avant le second clic. */
export const ANNONCE_SUSPENSION =
  "Ce compte ne lira ni n'écrira plus rien : ni projet, ni document, ni fichier, et ses tâches en attente seront annulées. Il pourra encore se connecter, et verra qu'il est suspendu, sans le motif. Ses données sont conservées ; le rétablir lui rend tout.";

export const ANNONCE_RETABLISSEMENT =
  "Ce compte retrouvera aussitôt l'accès à ses projets et à ceux de ses équipes.";
