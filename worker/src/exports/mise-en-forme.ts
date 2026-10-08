/**
 * Mise en forme des documents, côté worker : la lecture des marqueurs.
 *
 * COPIE de la lecture de `src/lib/mise-en-forme.ts`. Le worker ne peut pas
 * importer l'application ; un dossier exporté doit pourtant lire un texte
 * comme l'écran le montre. `tests/exports-mise-en-forme.test.mjs` refuse que
 * les deux copies diffèrent : changer l'une, c'est changer l'autre.
 *
 *   # Titre             une ligne qui commence par « # » et une espace
 *   ## Sous-titre       une ligne qui commence par « ## » et une espace
 *   - élément           une ligne qui commence par « - » et une espace
 *   **gras**            deux astérisques de part et d'autre, sur une ligne
 *   *italique*          un astérisque de part et d'autre, sur une ligne
 *
 * Rien d'autre n'est interprété. Un marqueur qui n'est pas refermé, ou qui
 * entoure du vide, reste du texte : aucun caractère n'est jamais perdu.
 */

/**
 * Types de document qui gardent leur texte brut. Un scénario a sa propre
 * présentation, que les agents écrivent sans marqueur : un tiret en début de
 * réplique n'y est pas une puce.
 */
export const TYPES_SANS_MISE_EN_FORME: readonly string[] = ["scenario"];

/** Vrai si les marqueurs de ce type de document se lisent comme une mise en forme. */
export function estMisEnForme(type: string): boolean {
  return !TYPES_SANS_MISE_EN_FORME.includes(type);
}

export type Segment = { texte: string; gras: boolean; italique: boolean };

export type BlocTexte =
  | { type: "titre"; niveau: 1 | 2; segments: Segment[] }
  /** Des lignes qui se suivent : un paragraphe, ses retours à la ligne gardés. */
  | { type: "paragraphe"; lignes: Segment[][] }
  | { type: "liste"; elements: Segment[][] };

/**
 * Un passage entre astérisques : il ne commence ni ne finit par un blanc, et
 * tient sur une ligne. Le gras se cherche avant l'italique.
 */
const MARQUE = /\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*|\*(?!\s)([^*\n]+?)(?<!\s)\*/g;

/** Une ligne, découpée en passages ordinaires, gras ou en italique. */
export function lireSegments(ligne: string): Segment[] {
  const segments: Segment[] = [];
  let depuis = 0;
  for (const trouve of ligne.matchAll(MARQUE)) {
    if (trouve.index > depuis) {
      segments.push({ texte: ligne.slice(depuis, trouve.index), gras: false, italique: false });
    }
    segments.push(
      trouve[1] !== undefined
        ? { texte: trouve[1], gras: true, italique: false }
        : { texte: trouve[2], gras: false, italique: true },
    );
    depuis = trouve.index + trouve[0].length;
  }
  if (depuis < ligne.length) {
    segments.push({ texte: ligne.slice(depuis), gras: false, italique: false });
  }
  return segments;
}

/**
 * Le texte, découpé en titres, paragraphes et listes. Une ligne vide sépare
 * deux paragraphes ; des éléments de liste qui se suivent font une liste.
 */
export function lireMiseEnForme(texte: string): BlocTexte[] {
  const blocs: BlocTexte[] = [];
  let paragraphe: Segment[][] | null = null;
  let liste: Segment[][] | null = null;

  for (const ligne of texte.replace(/\r\n?/g, "\n").split("\n")) {
    const titre = /^(#{1,2}) (\S.*)$/.exec(ligne);
    const element = /^- (\S.*)$/.exec(ligne);

    if (titre) {
      paragraphe = null;
      liste = null;
      blocs.push({
        type: "titre",
        niveau: titre[1].length === 1 ? 1 : 2,
        segments: lireSegments(titre[2].trimEnd()),
      });
    } else if (element) {
      paragraphe = null;
      if (!liste) {
        liste = [];
        blocs.push({ type: "liste", elements: liste });
      }
      liste.push(lireSegments(element[1].trimEnd()));
    } else if (ligne.trim() === "") {
      paragraphe = null;
      liste = null;
    } else {
      liste = null;
      if (!paragraphe) {
        paragraphe = [];
        blocs.push({ type: "paragraphe", lignes: paragraphe });
      }
      paragraphe.push(lireSegments(ligne));
    }
  }
  return blocs;
}

/** Le texte d'une suite de passages, sans ses marques. */
export function texteSeul(segments: readonly Segment[]): string {
  return segments.map((segment) => segment.texte).join("");
}
