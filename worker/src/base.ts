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
  /**
   * Séquence à écrire, décrite par l'équipe : présente pour un scénario, et
   * pour lui seul.
   */
  sequence?: string | null;
  /**
   * Scénario déjà écrit, pour s'y raccorder : sa longueur et sa fin. Null
   * s'il n'existe pas encore ; absent des autres actions.
   */
  scenario?: { longueur: number; fin: string } | null;
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

/** Ligne de budget, telle que le worker la dépose : contrôlée de nouveau par la base. */
export type LigneBudget = { category: string; label: string; quantity: number; unit_cost: number };

/**
 * Ce que FIELD lit pour proposer un budget : le projet, ce qu'il raconte, le
 * budget déjà saisi et le planning. Ni documents, ni équipe.
 */
export type ContexteBudget = {
  action: string;
  projet: ContexteRedaction["projet"];
  contexte: ContexteRedaction["contexte"];
  vision: ContexteRedaction["vision"];
  /** Nombre de personnages : de quoi estimer une distribution, sans les nommer. */
  personnages: number;
  budget: {
    devise: string;
    lignes: { categorie: string; libelle: string; quantite: number; cout_unitaire: number }[];
  };
  planning: { titre: string; phase: string; debut: string | null; echeance: string | null }[];
};

/**
 * Contexte de la tâche de budget en cours ; null si l'essai ne nous
 * appartient plus, si le projet n'existe plus, ou si son budget n'est pas
 * ouvert.
 */
export async function lireContexteBudget(
  base: Base,
  attemptId: string,
): Promise<ContexteBudget | null> {
  const { rows } = await base.query("select public.contexte_budget($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose les lignes proposées et conclut l'essai. Faux : l'essai ne nous
 * appartenait plus, rien n'a été déposé.
 */
export async function livrerPropositionBudget(
  base: Base,
  attemptId: string,
  lignes: readonly LigneBudget[],
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition_budget($1, $2::jsonb)", [
      attemptId,
      JSON.stringify(lignes),
    ]);
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

/** Jalon de planning, tel que le worker le dépose : contrôlé de nouveau par la base. */
export type JalonPropose = { title: string; phase: string; duration_days: number };

/**
 * Ce que FIELD lit pour proposer un planning : le projet, ce qu'il raconte,
 * et le planning déjà saisi. Ni budget, ni documents, ni équipe.
 */
export type ContextePlanning = {
  action: string;
  projet: ContexteRedaction["projet"];
  contexte: ContexteRedaction["contexte"];
  vision: ContexteRedaction["vision"];
  /** Nombre de personnages : de quoi estimer un tournage, sans les nommer. */
  personnages: number;
  planning: {
    titre: string;
    phase: string;
    statut: string;
    debut: string | null;
    echeance: string | null;
  }[];
};

/**
 * Contexte de la tâche de planning en cours ; null si l'essai ne nous
 * appartient plus ou si le projet n'existe plus.
 */
export async function lireContextePlanning(
  base: Base,
  attemptId: string,
): Promise<ContextePlanning | null> {
  const { rows } = await base.query("select public.contexte_planning($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose les jalons proposés et conclut l'essai. Faux : l'essai ne nous
 * appartenait plus, rien n'a été déposé.
 */
export async function livrerPropositionPlanning(
  base: Base,
  attemptId: string,
  jalons: readonly JalonPropose[],
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition_planning($1, $2::jsonb)", [
      attemptId,
      JSON.stringify(jalons),
    ]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/** Plan proposé, tel que le worker le dépose : contrôlé de nouveau par la base. */
export type PlanPropose = {
  shot: string;
  focal_mm: number | null;
  angle: string;
  movement: string;
  description: string;
  duration_seconds: number | null;
};

/** En-tête d'une scène du storyboard. */
type SceneStoryboard = { titre: string; decor: string; lieu: string; moment: string };

/**
 * Ce que FRAME lit pour découper une scène : le projet et son concept, la
 * scène désignée par la demande, celles qui la précèdent, ses plans déjà
 * saisis et le scénario enregistré. Ni budget, ni équipe, ni autre document.
 */
export type ContexteDecoupage = {
  action: string;
  projet: ContexteRedaction["projet"];
  contexte: ContexteRedaction["contexte"];
  vision: ContexteRedaction["vision"];
  scene: SceneStoryboard & { cadrage: string | null; description: string };
  avant: SceneStoryboard[];
  plans: {
    cadrage: string;
    focale: number | null;
    angle: string;
    mouvement: string;
    description: string;
    duree: number | null;
  }[];
  /** Le scénario enregistré ; vide si le projet n'en a pas. */
  scenario: string;
};

/**
 * Contexte de la tâche de découpage en cours ; null si l'essai ne nous
 * appartient plus, si le projet n'existe plus, ou si la scène désignée a été
 * supprimée — rien ne doit alors être envoyé.
 */
export async function lireContexteDecoupage(
  base: Base,
  attemptId: string,
): Promise<ContexteDecoupage | null> {
  const { rows } = await base.query("select public.contexte_decoupage($1) as contexte", [
    attemptId,
  ]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose les plans proposés et conclut l'essai. Faux : l'essai ne nous
 * appartenait plus, rien n'a été déposé.
 */
export async function livrerPropositionDecoupage(
  base: Base,
  attemptId: string,
  plans: readonly PlanPropose[],
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition_decoupage($1, $2::jsonb)", [
      attemptId,
      JSON.stringify(plans),
    ]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/** Équipement proposé, tel que le worker le dépose : contrôlé de nouveau par la base. */
export type EquipementPropose = {
  category: string;
  label: string;
  quantity: number;
  unit_power_watts: number | null;
  simultaneous: boolean;
};

/**
 * Ce que GEAR lit pour proposer du matériel : le projet et son concept, les
 * scènes du storyboard, le découpage et le matériel déjà saisi. Ni scénario,
 * ni budget, ni équipe.
 */
export type ContexteMateriel = {
  action: string;
  projet: ContexteRedaction["projet"];
  contexte: ContexteRedaction["contexte"];
  vision: ContexteRedaction["vision"];
  scenes: { titre: string; decor: string; lieu: string; moment: string }[];
  plans: { cadrage: string; mouvement: string; angle: string; focale: number | null }[];
  materiel: { categorie: string; designation: string; quantite: number }[];
};

/**
 * Contexte de la tâche de matériel en cours ; null si l'essai ne nous
 * appartient plus ou si le projet n'existe plus.
 */
export async function lireContexteMateriel(
  base: Base,
  attemptId: string,
): Promise<ContexteMateriel | null> {
  const { rows } = await base.query("select public.contexte_materiel($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose les équipements proposés et conclut l'essai. Faux : l'essai ne nous
 * appartenait plus, rien n'a été déposé.
 */
export async function livrerPropositionMateriel(
  base: Base,
  attemptId: string,
  equipements: readonly EquipementPropose[],
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition_materiel($1, $2::jsonb)", [
      attemptId,
      JSON.stringify(equipements),
    ]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/**
 * Ce que BOARD lit pour dessiner une scène : la scène, ses premiers plans et
 * le genre du projet. Ni scénario, ni budget, ni équipe.
 */
export type ContexteImage = {
  action: string;
  projet: { format: string; genre: string | null; vision: string };
  scene: {
    titre: string;
    decor: string;
    lieu: string;
    moment: string;
    cadrage: string | null;
    description: string;
  };
  plans: { cadrage: string; angle: string; description: string }[];
};

/**
 * Contexte de la tâche de vignette en cours ; null si l'essai ne nous
 * appartient plus, si le projet n'existe plus, ou si la scène désignée a été
 * supprimée — rien ne doit alors être envoyé.
 */
export async function lireContexteImage(
  base: Base,
  attemptId: string,
): Promise<ContexteImage | null> {
  const { rows } = await base.query("select public.contexte_image($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}

/**
 * Dépose la vignette et conclut l'essai. Faux : l'essai ne nous appartenait
 * plus, rien n'a été déposé.
 */
export async function livrerPropositionImage(
  base: Base,
  attemptId: string,
  image: Buffer,
): Promise<boolean> {
  try {
    await base.query("select public.livrer_proposition_image($1, $2)", [attemptId, image]);
    return true;
  } catch (erreur) {
    if (codeDe(erreur) === ESSAI_PERDU) {
      return false;
    }
    throw erreur;
  }
}

/**
 * Ce que VOICE lit pour réécrire les répliques d'une scène : le projet, ses
 * personnages, la scène désignée par la demande, et ce qui la précède.
 */
export type ContexteDialogue = {
  action: string;
  projet: ContexteRedaction["projet"];
  contexte: ContexteRedaction["contexte"];
  personnages: Personnage[];
  /** Le passage du scénario à réécrire, relu et contrôlé par la base. */
  scene: string;
  /** Ce qui précède la scène dans le document : vide si elle l'ouvre. */
  avant: string;
};

/**
 * Contexte de la tâche de dialogues en cours ; null si l'essai ne nous
 * appartient plus, si le projet n'existe plus, ou si le passage désigné n'est
 * plus celui du scénario — rien ne doit alors être envoyé.
 */
export async function lireContexteDialogue(
  base: Base,
  attemptId: string,
): Promise<ContexteDialogue | null> {
  const { rows } = await base.query("select public.contexte_dialogue($1) as contexte", [attemptId]);
  return rows[0]?.contexte ?? null;
}
