/**
 * Mise en forme des documents : des marqueurs dans le texte, et rien d'autre.
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 *
 * Le contenu d'un document reste une chaîne de texte — c'est ce que lisent
 * les exports, les agents, l'ajout d'une séquence au scénario et le repérage
 * d'un passage. La mise en forme ne s'y ajoute pas : elle s'y écrit, par
 * cinq marqueurs, que ce module sait lire et poser.
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

/** Ce que l'écran dit des marqueurs, sous l'éditeur. */
export const AIDE_MISE_EN_FORME =
  "Mise en forme : « # » en début de ligne pour un titre, « ## » pour un sous-titre, « - » pour un élément de liste ; **gras** et *italique* autour d'un passage. Ces marqueurs restent dans le texte.";

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

/** Les marques que la barre d'outils sait poser. */
export const MARQUES = {
  titre: { libelle: "Titre", prefixe: "# " },
  sous_titre: { libelle: "Sous-titre", prefixe: "## " },
  liste: { libelle: "Liste", prefixe: "- " },
  gras: { libelle: "Gras", autour: "**" },
  italique: { libelle: "Italique", autour: "*" },
} as const;

export type Marque = keyof typeof MARQUES;

export type Saisie = { texte: string; debut: number; fin: number };

const PREFIXES = ["## ", "# ", "- "] as const;

/**
 * Pose ou retire une marque sur la sélection, et rend le texte avec la
 * sélection à garder.
 *
 * Gras et italique entourent la sélection ; s'ils l'entourent déjà, ils sont
 * retirés. Sans sélection, les marqueurs sont posés et le curseur placé entre
 * eux. Titre, sous-titre et liste portent sur chaque ligne touchée : la
 * marque est posée en tête, remplace une autre marque de ligne, ou est
 * retirée si toutes les lignes la portent déjà.
 */
export function appliquerMarque(saisie: Saisie, marque: Marque): Saisie {
  const { texte } = saisie;
  const debut = Math.max(0, Math.min(saisie.debut, saisie.fin, texte.length));
  const fin = Math.min(texte.length, Math.max(saisie.debut, saisie.fin, 0));
  const definition = MARQUES[marque];

  if ("autour" in definition) {
    const m = definition.autour;
    const avant = texte.slice(0, debut);
    const choisi = texte.slice(debut, fin);
    const apres = texte.slice(fin);
    // Déjà entourée de cette marque, et d'elle seule : on la retire.
    const entoure =
      avant.endsWith(m) &&
      apres.startsWith(m) &&
      (m === "**" || (!avant.endsWith("**") && !apres.startsWith("**")));
    if (entoure) {
      return {
        texte: avant.slice(0, -m.length) + choisi + apres.slice(m.length),
        debut: debut - m.length,
        fin: fin - m.length,
      };
    }
    return {
      texte: avant + m + choisi + m + apres,
      debut: debut + m.length,
      fin: fin + m.length,
    };
  }

  // Les lignes entières que la sélection touche.
  const premiere = texte.lastIndexOf("\n", debut - 1) + 1;
  const suivante = texte.indexOf("\n", fin);
  const derniere = suivante === -1 ? texte.length : suivante;
  const lignes = texte.slice(premiere, derniere).split("\n");
  const prefixe = definition.prefixe;
  const toutes = lignes.every((ligne) => ligne.startsWith(prefixe));

  const nouvelles = lignes.map((ligne) => {
    if (toutes) {
      return ligne.slice(prefixe.length);
    }
    const autre = PREFIXES.find((p) => ligne.startsWith(p));
    return prefixe + (autre ? ligne.slice(autre.length) : ligne);
  });
  const bloc = nouvelles.join("\n");
  return {
    texte: texte.slice(0, premiere) + bloc + texte.slice(derniere),
    debut: premiere,
    fin: premiere + bloc.length,
  };
}
