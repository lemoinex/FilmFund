/**
 * Propositions de l'assistant d'écriture : ce qu'il sait produire, où en est
 * une demande, et comment l'écran en parle. Module pur, testable sans pile
 * Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/** Codes d'erreur de la base que l'écran traduit. */
export const ERREURS_BASE = {
  quota: "53400",
  devisPerime: "DV001",
  cleEnConflit: "DV002",
  devisDejaAccepte: "DV003",
  debit: "DV005",
  refus: "42501",
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

/** Ordre d'affichage, et liste de référence pour les tests. */
export const ORDRE_LIVRABLES = Object.keys(LIVRABLES_IA) as ActionIa[];

/** Vrai pour une action du catalogue : tout ce qui vient du navigateur passe par là. */
export function estActionIa(valeur: unknown): valeur is ActionIa {
  return typeof valeur === "string" && Object.hasOwn(LIVRABLES_IA, valeur);
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
    case ERREURS_BASE.tacheDejaPrise:
      return "La proposition est déjà en cours de rédaction : elle ne s'annule plus.";
    case ERREURS_BASE.propositionDejaTraitee:
      return "Cette proposition a déjà été appliquée ou écartée.";
    default:
      return "La demande n'a pas abouti. Réessayez dans un instant.";
  }
}

const NOMBRE = new Intl.NumberFormat("fr-FR");

/** Nombre écrit à la française : « 1 500 ». */
export function enNombre(nombre: number): string {
  return NOMBRE.format(nombre);
}

/** « 1 unité texte », « 3 unités texte ». */
export function unitesTexte(nombre: number): string {
  return `${enNombre(nombre)} ${nombre > 1 ? "unités texte" : "unité texte"}`;
}
