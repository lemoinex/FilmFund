/**
 * Actualisation de l'application ouverte : savoir qu'un déploiement a eu
 * lieu, et ne recharger qu'à un moment sûr. Module pur ; le composant
 * `components/actualisation.tsx` ne fait qu'écouter le navigateur et suivre
 * ce que ces fonctions décident.
 *
 * Les délais sont un choix de ce lot, pas une mesure.
 */

/** Version d'un poste de développement : jamais comparée, jamais rechargée. */
export const VERSION_LOCALE = "developpement";

/** Intervalle entre deux lectures de la version, fenêtre ouverte. */
export const INTERVALLE_VERSION_MS = 5 * 60 * 1000;

/** Délai minimal entre deux lectures déclenchées par une navigation. */
export const DELAI_ENTRE_VERIFICATIONS_MS = 60 * 1000;

/** Temps sans clic ni frappe avant un rechargement automatique. */
export const DELAI_CALME_MS = 30 * 1000;

/** Délai minimal entre deux relectures des données de la page. */
export const DELAI_ENTRE_RAFRAICHISSEMENTS_MS = 30 * 1000;

/** Rythme auquel une version en attente est réexaminée. */
export const INTERVALLE_ATTENTE_MS = 15 * 1000;

/**
 * Version du build en cours : le commit déployé, tel que Vercel le donne au
 * build comme à l'exécution. Elle ne change pas d'une requête à l'autre —
 * jamais un horodatage. Côté serveur seulement.
 */
export function versionDuBuild(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || VERSION_LOCALE;
}

const VERSION = /^[\w.-]{1,80}$/;

/** Version lue de `/api/version`, ou `null` si la réponse n'en porte pas une lisible. */
export function lireVersion(corps: unknown): string | null {
  if (typeof corps !== "object" || corps === null) return null;
  const version = (corps as { version?: unknown }).version;
  return typeof version === "string" && VERSION.test(version) ? version : null;
}

export type EtatActualisation = {
  /** Version qui a rendu la page ouverte. */
  chargee: string;
  /** Dernière version lue du serveur, si une lecture a abouti. */
  lue: string | null;
  /** Un champ a été modifié sur cette page depuis qu'on y est arrivé. */
  saisie: boolean;
  /** Instant du dernier clic ou de la dernière frappe. */
  dernierGeste: number;
  maintenant: number;
  /** Version pour laquelle un rechargement automatique a déjà eu lieu. */
  dejaRechargeePour: string | null;
  enLigne: boolean;
};

export type Decision = "rien" | "recharger" | "attendre" | "proposer";

/**
 * Que faire d'une version lue.
 *
 * - « rien » : même version, ou poste de développement.
 * - « proposer » : on a déjà rechargé pour cette version et la page n'est
 *   toujours pas à jour ; recharger encore tournerait en boucle, on laisse
 *   la main à l'utilisateur.
 * - « attendre » : hors ligne, saisie en cours, ou geste trop récent — un
 *   rechargement pourrait faire perdre un travail ou couper une opération.
 * - « recharger » : sinon.
 */
export function decider(etat: EtatActualisation): Decision {
  if (etat.lue === null || etat.lue === etat.chargee) return "rien";
  if (etat.chargee === VERSION_LOCALE || etat.lue === VERSION_LOCALE) return "rien";
  if (etat.dejaRechargeePour === etat.lue) return "proposer";
  if (!etat.enLigne || etat.saisie) return "attendre";
  if (etat.maintenant - etat.dernierGeste < DELAI_CALME_MS) return "attendre";
  return "recharger";
}

/**
 * Peut-on relire les données de la page sans rien déranger ? Jamais pendant
 * une saisie : l'état distant ne remplace pas ce que l'utilisateur écrit.
 */
export function peutRafraichir(etat: {
  saisie: boolean;
  enLigne: boolean;
  dernierRafraichissement: number;
  maintenant: number;
}): boolean {
  if (!etat.enLigne || etat.saisie) return false;
  return etat.maintenant - etat.dernierRafraichissement >= DELAI_ENTRE_RAFRAICHISSEMENTS_MS;
}
