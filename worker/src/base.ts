/**
 * Accès du worker à la base : sa connexion, et les fonctions SQL qu'il a le
 * droit d'exécuter — rien d'autre. Le rôle `filmfund_worker` n'a aucun droit
 * sur les tables.
 */
import pg from "pg";

import type { Travail } from "./executeurs.ts";
import type { ContenuDossier } from "./exports/dossier.ts";

export type ConfigurationBase = {
  hote: string;
  port: number;
  base: string;
  utilisateur: string;
  motDePasse: string;
  /**
   * Certificat racine du serveur : la connexion est chiffrée et l'identité
   * du serveur vérifiée. `false` n'existe que pour la base locale des tests,
   * qui n'a pas de TLS ; le point d'entrée du worker ne le passe jamais.
   */
  tls: { ca: string } | false;
};

/** Ce dont le worker a besoin : exécuter une requête. */
export type Base = Pick<pg.Pool, "query" | "end">;

/** Code levé par la base quand l'essai n'appartient plus au worker. */
const ESSAI_PERDU = "TR001";

export function ouvrirBase(configuration: ConfigurationBase): pg.Pool {
  return new pg.Pool({
    host: configuration.hote,
    port: configuration.port,
    database: configuration.base,
    user: configuration.utilisateur,
    password: configuration.motDePasse,
    ssl: configuration.tls ? { ca: configuration.tls.ca, rejectUnauthorized: true } : false,
    // Une connexion pour le travail en cours, une pour prolonger son bail.
    max: 2,
    application_name: "filmfund-worker",
    /*
     * Sans ces délais, une connexion coupée sans préavis laisse une requête
     * en attente pour toujours : la boucle se fige, le processus reste en vie
     * et rien ne le relance. La base borne déjà toute requête du worker à
     * 30 secondes ; au-delà de 45, c'est donc qu'elle ne répond plus.
     */
    connectionTimeoutMillis: 10_000,
    query_timeout: 45_000,
    keepAlive: true,
  });
}

/** Code levé par la base quand le plafond mensuel des dépenses d'IA est atteint. */
export const PLAFOND_ATTEINT = "IA001";

/** Code levé par la base quand les paramètres d'une tâche sont invalides. */
export const PARAMETRES_INVALIDES = "22023";

/** Code SQL d'une erreur de la base, s'il y en a un. */
export function codeDe(erreur: unknown): string | undefined {
  return typeof erreur === "object" && erreur !== null && "code" in erreur
    ? String((erreur as { code: unknown }).code)
    : undefined;
}

/** Rôle sous lequel la connexion est ouverte : à journaliser au démarrage. */
export async function roleCourant(base: Base): Promise<string> {
  const { rows } = await base.query("select current_user as role");
  return rows[0].role;
}

/** Plus ancienne tâche en attente parmi les actions données, ou null. */
export async function reclamer(
  base: Base,
  worker: string,
  actions: string[],
): Promise<Travail | null> {
  const { rows } = await base.query("select * from public.reclamer_travail($1, $2)", [
    worker,
    actions,
  ]);
  const ligne = rows[0];
  if (!ligne) {
    return null;
  }
  return {
    jobId: ligne.job_id,
    attemptId: ligne.attempt_id,
    attemptNumber: ligne.attempt_number,
    action: ligne.action,
    params: ligne.params,
    projectId: ligne.project_id,
    studioId: ligne.studio_id,
  };
}

/** Faux : la tâche ne nous appartient plus, il faut s'arrêter. */
export async function prolongerBail(base: Base, attemptId: string): Promise<boolean> {
  const { rows } = await base.query("select public.prolonger_bail($1) as prolonge", [attemptId]);
  return rows[0].prolonge === true;
}

/**
 * À valider avant tout envoi au fournisseur. Faux : la tâche a été
 * récupérée entre-temps, rien ne doit être envoyé.
 */
export async function marquerSoumise(base: Base, attemptId: string): Promise<boolean> {
  try {
    await base.query("select public.marquer_tentative_soumise($1)", [attemptId]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/**
 * Conclut l'essai. Faux : il ne nous appartenait plus — la base a déjà
 * décidé de son sort, rien n'a été réglé ici.
 */
export async function terminer(
  base: Base,
  attemptId: string,
  succes: boolean,
  consomme: number | null,
  erreur: string | null,
): Promise<boolean> {
  try {
    await base.query("select public.terminer_tentative($1, $2, $3, $4)", [
      attemptId,
      succes,
      consomme,
      erreur,
    ]);
    return true;
  } catch (echec) {
    if (codeDe(echec) === ESSAI_PERDU) {
      return false;
    }
    throw echec;
  }
}

/** Récupère les tâches au bail expiré ; renvoie leur nombre. */
export async function recupererExpires(base: Base): Promise<number> {
  const { rows } = await base.query("select public.recuperer_travaux_expires() as nombre");
  return Number(rows[0].nombre);
}

/**
 * Clé d'API d'un fournisseur, lue dans le coffre. Null : le fournisseur n'est
 * pas configuré depuis l'écran Intégrations IA, et son agent reste hors
 * service. La valeur ne sort jamais d'ici : ni journal, ni message d'erreur.
 */
export async function lireCleFournisseur(base: Base, fournisseur: string): Promise<string | null> {
  const { rows } = await base.query("select public.cle_fournisseur($1) as cle", [fournisseur]);
  return rows[0]?.cle ?? null;
}

/** Fiche du projet d'une tâche : ce que le worker a le droit d'en lire. */
export type Fiche = {
  titre: string;
  format: string;
  etape: string;
  logline: string;
  synopsis: string;
};

/** Fiche du projet de la tâche en cours ; null si l'essai ne nous appartient plus. */
export async function lireContexte(base: Base, attemptId: string): Promise<Fiche | null> {
  const { rows } = await base.query("select * from public.contexte_travail($1)", [attemptId]);
  const ligne = rows[0];
  if (!ligne) {
    return null;
  }
  return {
    titre: ligne.title,
    format: ligne.format,
    etape: ligne.stage,
    logline: ligne.logline,
    synopsis: ligne.synopsis,
  };
}

/** Personnage d'un projet, tel que la base le remet au worker. */
export type Personnage = { nom: string; role: string; description: string };

/** Document finalisé d'un projet, tel que la base le remet au worker. */
export type DocumentProjet = { type: string; titre: string; contenu: string };

/**
 * Contexte d'une tâche de rédaction : la fiche du projet, ses personnages,
 * sa vision et ses documents finalisés. Plus riche que `Fiche`, qui reste le
 * contexte de la logline — son profil a été écrit pour elle.
 */
export type ContexteRedaction = {
  action: string;
  projet: {
    titre: string;
    format: string;
    etape: string;
    genre: string | null;
    pays: string[] | null;
    langues: string | null;
    duree: number | null;
  };
  contexte: {
    pitch: string | null;
    synopsis_court: string | null;
    synopsis: string | null;
    theme: string | null;
    enjeux: string | null;
  };
  personnages: Personnage[];
  vision: { artistique: string | null; objectifs: string | null; public: string | null };
  documents: DocumentProjet[];
};

/**
 * Contexte de rédaction de la tâche en cours ; null si l'essai ne nous
 * appartient plus, si le projet n'existe plus, ou si l'action n'est pas une
 * rédaction.
 */
export async function lireContexteRedaction(
  base: Base,
  attemptId: string,
): Promise<ContexteRedaction | null> {
  const { rows } = await base.query("select public.contexte_redaction($1) as contexte", [
    attemptId,
  ]);
  return rows[0]?.contexte ?? null;
}

/**
 * Inscrit, avant l'appel, ce qu'il coûterait au pire. Lève `PLAFOND_ATTEINT`
 * si le plafond du mois serait dépassé, `ESSAI_PERDU` si la tâche a été
 * récupérée : dans les deux cas, rien ne doit être envoyé.
 */
export async function provisionnerCout(
  base: Base,
  attemptId: string,
  provision: {
    fournisseur: string;
    modele: string;
    profil: string;
    jetonsEntree: number;
    jetonsSortie: number;
    dollars: string;
  },
): Promise<void> {
  await base.query("select public.provisionner_cout($1, $2, $3, $4, $5, $6, $7)", [
    attemptId,
    provision.fournisseur,
    provision.modele,
    provision.profil,
    provision.jetonsEntree,
    provision.jetonsSortie,
    provision.dollars,
  ]);
}

/** Inscrit l'usage facturé par le fournisseur. `dollars` nul : tarif inconnu, à rapprocher. */
export async function confirmerCout(
  base: Base,
  attemptId: string,
  usage: {
    modele: string;
    jetonsEntree: number;
    jetonsSortie: number;
    dollars: string | null;
    repli: boolean;
  },
): Promise<void> {
  await base.query("select public.confirmer_cout($1, $2, $3, $4, $5, $6)", [
    attemptId,
    usage.modele,
    usage.jetonsEntree,
    usage.jetonsSortie,
    usage.dollars,
    usage.repli,
  ]);
}

/**
 * Dépose la proposition et conclut l'essai. Faux : l'essai ne nous
 * appartenait plus, rien n'a été déposé.
 */
export async function livrerProposition(
  base: Base,
  attemptId: string,
  texte: string,
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition($1, $2)", [attemptId, texte]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/**
 * Contenu du dossier d'une tâche d'export, et l'empreinte de ce contenu.
 * `format` est absent d'une base antérieure au lot M3 : l'exécuteur se fie
 * à l'action de la tâche, pas à ce champ.
 */
export type ContexteExport = { contenu: ContenuDossier; empreinte: string; format?: string };

/**
 * Contenu du dossier de la tâche en cours ; null si l'essai ne nous
 * appartient plus, ou si le projet n'existe plus. Lève `PARAMETRES_INVALIDES`
 * si la demande ne désigne aucune section connue.
 */
export async function lireContexteExport(
  base: Base,
  attemptId: string,
): Promise<ContexteExport | null> {
  const { rows } = await base.query("select public.contexte_export($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose le fichier et conclut l'essai. Faux : l'essai ne nous appartenait
 * plus, rien n'a été déposé. `pages` est nul pour un fichier Word, dont le
 * traitement de texte recalcule la pagination.
 */
export async function livrerExport(
  base: Base,
  attemptId: string,
  fichier: Buffer,
  pages: number | null,
  empreinte: string,
): Promise<boolean> {
  try {
    await base.query("select public.livrer_export($1, $2, $3, $4)", [
      attemptId,
      fichier,
      pages,
      empreinte,
    ]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/** Supprime les exports expirés ; renvoie leur nombre. */
export async function purgerExports(base: Base): Promise<number> {
  const { rows } = await base.query("select public.purger_exports_expires() as nombre");
  return Number(rows[0].nombre);
}
