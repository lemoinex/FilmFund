/**
 * Propositions de l'assistant d'écriture : ce qu'il sait produire, où en est
 * une demande, et comment l'écran en parle. Module pur, testable sans pile
 * Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

const NOMBRE = new Intl.NumberFormat("fr-FR");

/** Codes d'erreur de la base que l'écran traduit. */
export const ERREURS_BASE = {
  quota: "53400",
  devisPerime: "DV001",
  cleEnConflit: "DV002",
  devisDejaAccepte: "DV003",
  debit: "DV005",
  refus: "42501",
  invalide: "22023",
  tacheDejaPrise: "TR002",
  propositionDejaTraitee: "PR001",
} as const;

/**
 * Ce que l'assistant sait écrire, par action de tâche.
 *
 * `longueurMax` est la borne que la base applique à l'acceptation : l'écran
 * la reprend pour ne pas laisser composer un texte qu'elle refuserait. Un
 * test d'architecture vérifie qu'elles s'accordent, et que chaque action est
 * bien celle d'un profil du worker.
 *
 * Le navigateur choisit un livrable de cette liste, et rien d'autre : ni
 * modèle, ni budget, ni limite. Le profil, le fournisseur et le coût sont
 * décidés par le worker ; les droits et les quotas, par la base.
 */
export const LIVRABLES_IA = {
  logline: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "projet",
    titre: "Proposition de pitch",
    bouton: "Proposer un pitch",
    /** Ce que la proposition remplacerait, nommé comme à l'écran. */
    remplace: "Pitch actuel",
    description:
      "L'assistant rédige une proposition à partir de la fiche du projet — titre, format, étape, synopsis et pitch actuel —, transmise pour cela à notre fournisseur d'IA.",
    longueurMax: 500,
    lignes: 4,
  },
  synopsis_standard: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "projet",
    titre: "Proposition de synopsis",
    bouton: "Proposer un synopsis",
    remplace: "Synopsis actuel",
    description:
      "L'assistant rédige le récit du début au dénouement, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 20_000,
    lignes: 14,
  },
  synopsis_short: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "fiche",
    titre: "Proposition de synopsis court",
    bouton: "Proposer un synopsis court",
    remplace: "Synopsis court actuel",
    description:
      "L'assistant résume le film en un ou deux paragraphes, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 1500,
    lignes: 8,
  },
  synopsis_detailed: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition de synopsis détaillé",
    bouton: "Proposer un synopsis détaillé",
    remplace: "Document actuel",
    description:
      "L'assistant déroule le récit séquence par séquence, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 20_000,
    lignes: 16,
  },
  dramatic_analysis: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition d'analyse dramaturgique",
    bouton: "Proposer une analyse",
    remplace: "Document actuel",
    description:
      "L'assistant lit la structure du récit, les arcs des personnages et ce qui manque pour que le projet tienne debout, à partir de la fiche, des personnages, de la vision et des documents finalisés, transmis pour cela à notre fournisseur d'IA. Il analyse : il ne réécrit rien.",
    longueurMax: 20_000,
    lignes: 16,
  },
  treatment: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition de traitement",
    bouton: "Proposer un traitement",
    remplace: "Document actuel",
    description:
      "L'assistant raconte le film scène par scène, sans dialogues, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 20_000,
    lignes: 16,
  },
  bible: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition de bible de série",
    bouton: "Proposer une bible de série",
    remplace: "Document actuel",
    description:
      "L'assistant pose le concept, l'univers, les personnages, la mécanique d'un épisode et l'arc de la première saison, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 20_000,
    lignes: 16,
  },
  screenplay: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition de séquence de scénario",
    bouton: "Proposer cette séquence",
    remplace: "Fin du scénario actuel",
    description:
      "L'assistant écrit une séquence du scénario, dialogues compris, à partir de votre description, de la fiche du projet, de ses personnages, de sa vision, de ses documents finalisés et de la fin du scénario déjà écrit — brouillon compris —, transmis pour cela à notre fournisseur d'IA. Un scénario s'écrit ainsi séquence par séquence.",
    longueurMax: 20_000,
    lignes: 16,
    /**
     * Ce livrable ne se demande pas d'un clic : l'équipe dit quelle séquence
     * écrire. La borne est celle que la base applique au devis ; un test
     * d'architecture vérifie qu'elles s'accordent.
     */
    consigne: {
      libelle: "Séquence à écrire",
      aide: "Dites où elle se passe, qui s'y trouve et ce qui s'y joue. L'assistant ne relit que la fin du scénario : rappelez ce qu'il doit savoir du début.",
      longueurMax: 800,
    },
  },
  intention_note: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "documents",
    titre: "Proposition de note d'intention",
    bouton: "Proposer une note d'intention",
    remplace: "Document actuel",
    description:
      "L'assistant écrit la note à la première personne, à partir de la fiche du projet, de ses personnages, de sa vision et de ses documents finalisés, transmis pour cela à notre fournisseur d'IA.",
    longueurMax: 20_000,
    lignes: 16,
  },
} as const;

export type ActionIa = keyof typeof LIVRABLES_IA;

/**
 * Ce que l'assistant sait proposer sous une autre forme qu'un texte : des
 * lignes, acceptées ou écartées une à une. Tenu à part de `LIVRABLES_IA`,
 * dont chaque entrée est un texte borné par une longueur ; un test
 * d'architecture lie celui-ci aux profils structurés du worker.
 *
 * Le navigateur choisit un livrable de cette liste, et rien d'autre.
 */
export const LIVRABLES_STRUCTURES = {
  budget_plan: {
    /** Rubrique du projet où l'encart se tient, près de ce qu'il écrit. */
    page: "budget",
    titre: "Proposition de lignes de budget",
    bouton: "Proposer des lignes de budget",
    description:
      "L'assistant propose des lignes de dépense à partir de la fiche du projet, du budget déjà saisi et du planning, transmis pour cela à notre fournisseur d'IA.",
    /**
     * Dit à chaque affichage des lignes : l'assistant n'a aucune grille
     * tarifaire, et un montant proposé ne doit pas passer pour une donnée.
     */
    avertissement:
      "Estimations de l'assistant, sans grille tarifaire : vérifiez chaque montant avant de l'accepter.",
    /** Lignes qu'une proposition peut porter : la borne de la base et du profil. */
    lignesMax: 40,
  },
} as const;

export type ActionStructuree = keyof typeof LIVRABLES_STRUCTURES;

/** Vrai pour une action du catalogue structuré : tout ce qui vient du navigateur passe par là. */
export function estActionStructuree(valeur: unknown): valeur is ActionStructuree {
  return typeof valeur === "string" && Object.hasOwn(LIVRABLES_STRUCTURES, valeur);
}

/** Ligne proposée, telle que l'écran la lit. */
export type LigneProposee = {
  id: string;
  position: number;
  category: string;
  label: string;
  quantity: number;
  unit_cost: number;
  state: string;
};

/**
 * Où en est une proposition de lignes : combien attendent une décision,
 * combien ont été acceptées ou écartées, et ce que pèsent celles qui
 * attendent. Le total est compté en centimes entiers, comme le budget :
 * additionner des flottants finit par afficher un centime de trop.
 */
export function bilanLignes(lignes: readonly LigneProposee[]): {
  enAttente: number;
  acceptees: number;
  ecartees: number;
  totalEnAttenteCentimes: number;
} {
  let enAttente = 0;
  let acceptees = 0;
  let ecartees = 0;
  let totalEnAttenteCentimes = 0;
  for (const ligne of lignes) {
    if (ligne.state === "accepted") {
      acceptees += 1;
    } else if (ligne.state === "dismissed") {
      ecartees += 1;
    } else {
      enAttente += 1;
      totalEnAttenteCentimes += Math.round(Number(ligne.quantity) * Number(ligne.unit_cost) * 100);
    }
  }
  return { enAttente, acceptees, ecartees, totalEnAttenteCentimes };
}

/** « 1 ligne », « 12 lignes ». */
export function nombreLignes(nombre: number): string {
  return `${NOMBRE.format(nombre)} ${nombre > 1 ? "lignes" : "ligne"}`;
}

/**
 * Ce que l'écran dit après « tout accepter », qui n'est pas atomique : si une
 * ligne est refusée en chemin, les précédentes sont déjà entrées au budget,
 * et l'écran doit le dire plutôt que d'annoncer un échec.
 */
export function messageLot(acceptees: number, demandees: number): string {
  if (acceptees >= demandees) {
    return `${nombreLignes(acceptees)} ${acceptees > 1 ? "ajoutées" : "ajoutée"} au budget.`;
  }
  if (acceptees === 0) {
    return "Aucune ligne n'a pu être ajoutée. Réessayez dans un instant.";
  }
  return `${nombreLignes(acceptees)} sur ${NOMBRE.format(demandees)} ${
    acceptees > 1 ? "ajoutées" : "ajoutée"
  } au budget ; les autres attendent toujours votre décision.`;
}

/** Ordre d'affichage, et liste de référence pour les tests. */
export const ORDRE_LIVRABLES = Object.keys(LIVRABLES_IA) as ActionIa[];

/** Vrai pour une action du catalogue : tout ce qui vient du navigateur passe par là. */
export function estActionIa(valeur: unknown): valeur is ActionIa {
  return typeof valeur === "string" && Object.hasOwn(LIVRABLES_IA, valeur);
}

/** Ce qu'un livrable demande à l'équipe de préciser avant un devis, s'il le demande. */
export type Consigne = { libelle: string; aide: string; longueurMax: number };

/** Consigne du livrable, ou null s'il se demande d'un clic. */
export function consigneDe(action: ActionIa): Consigne | null {
  const livrable = LIVRABLES_IA[action];
  return "consigne" in livrable ? livrable.consigne : null;
}

/**
 * Remet une consigne saisie en texte admissible : fins de ligne normalisées,
 * espaces de bord retirés. Null si elle est vide, trop longue, ou porte un
 * caractère de contrôle — la base la refuserait au devis.
 */
export function lireConsigne(valeur: unknown, max: number): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const nette = valeur.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  if (nette.length < 1 || nette.length > max) {
    return null;
  }
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(nette) ? null : nette;
}

/** Limite de la colonne `projects.logline`, telle que l'écran la connaît. */
export const PITCH_MAX = LIVRABLES_IA.logline.longueurMax;

export type TacheVue = { id: string; state: string } | null;
export type PropositionVue = { id: string; content: string; state: string } | null;

export type EtapeProposition =
  /** Rien en cours : une demande peut être faite. */
  | { etape: "repos" }
  /** La dernière demande a échoué ; l'unité a été rendue. */
  | { etape: "echec" }
  /** En file : annulable. */
  | { etape: "en_attente"; tacheId: string }
  | { etape: "en_cours" }
  /** Interrompue après l'envoi : issue inconnue, unité toujours réservée. */
  | { etape: "a_rapprocher" }
  | { etape: "proposition"; propositionId: string; texte: string };

/**
 * Étape affichée, d'après la dernière tâche de cette action sur le projet et
 * sa proposition. Un état inconnu ramène au repos : mieux vaut laisser
 * redemander que d'afficher une attente sans fin.
 */
export function etapeProposition(tache: TacheVue, proposition: PropositionVue): EtapeProposition {
  if (!tache) {
    return { etape: "repos" };
  }
  switch (tache.state) {
    case "queued":
      return { etape: "en_attente", tacheId: tache.id };
    case "running":
      return { etape: "en_cours" };
    case "awaiting_reconciliation":
      return { etape: "a_rapprocher" };
    case "failed":
      return { etape: "echec" };
    case "succeeded":
      return proposition?.state === "proposed"
        ? { etape: "proposition", propositionId: proposition.id, texte: proposition.content }
        : { etape: "repos" };
    default:
      return { etape: "repos" };
  }
}

/** Message lisible pour une erreur de la base ; générique si elle est inconnue. */
export function messageErreur(code: string | undefined): string {
  switch (code) {
    case ERREURS_BASE.quota:
      return "Le quota d'unités texte de ce studio est épuisé pour la période en cours.";
    case ERREURS_BASE.devisPerime:
      return "Ce devis n'est plus valable : demandez-en un nouveau.";
    case ERREURS_BASE.cleEnConflit:
    case ERREURS_BASE.devisDejaAccepte:
      return "Cette demande a déjà été enregistrée.";
    case ERREURS_BASE.debit:
      return "Trop de demandes en une minute : patientez un instant.";
    case ERREURS_BASE.refus:
      return "Vous n'avez pas le droit de faire cette demande sur ce projet.";
    case ERREURS_BASE.invalide:
      return "Ce texte n'est pas admis tel quel : il est vide, trop long, ou le document qui le recevrait est plein.";
    case ERREURS_BASE.tacheDejaPrise:
      return "La proposition est déjà en cours de rédaction : elle ne s'annule plus.";
    case ERREURS_BASE.propositionDejaTraitee:
      return "Cette proposition a déjà été appliquée ou écartée.";
    default:
      return "La demande n'a pas abouti. Réessayez dans un instant.";
  }
}

/** Nombre écrit à la française : « 1 500 ». */
export function enNombre(nombre: number): string {
  return NOMBRE.format(nombre);
}

/** « 1 unité texte », « 3 unités texte ». */
export function unitesTexte(nombre: number): string {
  return `${enNombre(nombre)} ${nombre > 1 ? "unités texte" : "unité texte"}`;
}
