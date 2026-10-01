/**
 * Intégrations IA : les fournisseurs configurables depuis l'administration.
 *
 * Module pur, sans pile Supabase : ce qui s'affiche, et comment une erreur de
 * la base se dit. Les clés elles-mêmes ne passent jamais par ici.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/** Longueurs acceptées par `definir_cle_fournisseur`. */
export const CLE_MIN = 20;
export const CLE_MAX = 500;

export type Fournisseur = {
  code: "anthropic" | "openai";
  nom: string;
  /** Ce que la clé met réellement en service aujourd'hui. */
  usage: string;
  /** Faux tant qu'aucun agent n'appelle ce fournisseur. */
  employe: boolean;
};

export const FOURNISSEURS: readonly Fournisseur[] = [
  {
    code: "anthropic",
    nom: "Anthropic",
    usage: "Assistant d'écriture : proposition de pitch.",
    employe: true,
  },
  {
    code: "openai",
    nom: "OpenAI",
    usage: "Prévu pour le storyboard. Aucun agent ne l'appelle pour l'instant.",
    employe: false,
  },
];

export const CODES_FOURNISSEURS = FOURNISSEURS.map((f) => f.code);

export function estFournisseurConnu(code: string): code is Fournisseur["code"] {
  return (CODES_FOURNISSEURS as readonly string[]).includes(code);
}

/**
 * La clé telle que la base l'acceptera. Les contrôles sont les mêmes des deux
 * côtés : ici pour répondre tout de suite, en base parce que l'écran n'est
 * pas le seul chemin possible.
 */
export function cleValide(cle: string): boolean {
  return cle.length >= CLE_MIN && cle.length <= CLE_MAX && !/\s/.test(cle);
}

/** Codes d'erreur de la base que l'écran traduit. */
export const ERREURS_BASE = {
  refus: "42501",
  invalide: "22023",
  absente: "IN001",
} as const;

export function messageErreur(code: string | undefined): string {
  switch (code) {
    case ERREURS_BASE.refus:
      return "Action réservée à l'administration.";
    case ERREURS_BASE.invalide:
      return `La clé doit compter de ${CLE_MIN} à ${CLE_MAX} caractères, sans espace ni retour à la ligne.`;
    case ERREURS_BASE.absente:
      return "Aucune clé n'est enregistrée pour ce fournisseur.";
    default:
      return "L'enregistrement n'a pas abouti. Réessayez dans un instant.";
  }
}
