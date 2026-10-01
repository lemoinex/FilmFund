/**
 * Accès du worker à la base : sa connexion, et les fonctions SQL qu'il a le
 * droit d'exécuter — rien d'autre. Le rôle `filmfund_worker` n'a aucun droit
 * sur les tables.
 */
import pg from "pg";

import type { Travail } from "./executeurs.ts";

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
  });
}

function codeDe(erreur: unknown): string | undefined {
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
