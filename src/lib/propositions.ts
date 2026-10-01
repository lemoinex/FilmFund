/**
 * Propositions de l'assistant d'écriture : où en est une demande, vue de
 * l'écran. Module pur, testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/** Limite de la colonne `projects.logline`. */
export const PITCH_MAX = 500;

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

export type TacheVue = { id: string; state: string } | null;
export type PropositionVue = { id: string; content: string; state: string } | null;

export type EtapePitch =
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
 * Étape affichée, d'après la dernière tâche de pitch du projet et sa
 * proposition. Un état inconnu ramène au repos : mieux vaut laisser
 * redemander que d'afficher une attente sans fin.
 */
export function etapePitch(tache: TacheVue, proposition: PropositionVue): EtapePitch {
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
