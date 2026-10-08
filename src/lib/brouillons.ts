/**
 * Brouillon en cours d'un document (lot ED3) : la sauvegarde automatique.
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 *
 * L'éditeur sauvegarde ce qui est tapé dans un brouillon, propre à chaque
 * compte, sans créer de version : une version ne naît que du bouton
 * « Enregistrer ». Rien d'autre que l'éditeur ne lit un brouillon.
 */

/**
 * Temps sans frappe au bout duquel le brouillon est sauvegardé. Un choix du
 * lot : assez court pour ne rien perdre, assez long pour ne pas écrire à
 * chaque mot.
 */
export const DELAI_BROUILLON_MS = 5000;

/** Ce que l'écran dit de la sauvegarde automatique, sous l'éditeur. */
export const AIDE_BROUILLON =
  "Ce que vous tapez est sauvegardé en brouillon, pour vous seul, quelques secondes après la dernière frappe. Seul « Enregistrer » modifie le document et crée une version.";

export type Brouillon = {
  title: string;
  content: string;
  /** Dernière version du document quand le brouillon est né ; zéro s'il n'en avait pas. */
  base_version: number;
  updated_at: string;
};

type Texte = { title: string; content: string };

/**
 * Le brouillon à proposer à l'ouverture de l'éditeur : celui qui diffère du
 * document. Un brouillon identique au document n'a plus rien à rendre.
 */
export function brouillonAProposer<B extends Texte>(
  document: Texte,
  brouillon: B | null,
): B | null {
  if (!brouillon) {
    return null;
  }
  return brouillon.title === document.title && brouillon.content === document.content
    ? null
    : brouillon;
}

/**
 * Vrai si le document a été enregistré depuis la naissance du brouillon :
 * le reprendre remplacerait à l'écran un texte plus récent que lui.
 */
export function documentEnregistreDepuis(
  brouillon: Pick<Brouillon, "base_version">,
  derniereVersion: number,
): boolean {
  return derniereVersion > brouillon.base_version;
}

/**
 * Vrai s'il y a quelque chose à sauvegarder : le texte saisi diffère du
 * document enregistré, et de ce qui a déjà été sauvegardé ou tenté.
 */
export function brouillonASauver(saisi: Texte, enregistre: Texte, dernier: Texte | null): boolean {
  const differe = (a: Texte, b: Texte) => a.title !== b.title || a.content !== b.content;
  return differe(saisi, enregistre) && (dernier === null || differe(saisi, dernier));
}
