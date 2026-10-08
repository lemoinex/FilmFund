/**
 * Comparaison de deux versions d'un texte : ce qui a été retiré, ajouté ou
 * modifié de l'une à l'autre. Module pur, sans import : il est aussi chargé
 * tel quel par les tests Node.
 *
 * La comparaison se fait ligne par ligne, puis mot par mot à l'intérieur
 * d'une ligne modifiée. Rien n'est interprété : un texte reste du texte, et
 * ses marqueurs éventuels sont comparés comme le reste.
 */

/**
 * Borne du calcul, en cellules du tableau de comparaison (lignes de l'une ×
 * lignes de l'autre, une fois écarté ce qu'elles ont de commun au début et à
 * la fin). Au-delà, la page dit que les textes sont trop différents pour être
 * comparés ici, plutôt que de faire attendre.
 */
export const LIMITE_COMPARAISON = 4_000_000;

/** Lignes inchangées gardées de part et d'autre d'une modification. */
export const CONTEXTE_COMPARAISON = 3;

export type Segment = { type: "egal" | "retire" | "ajoute"; texte: string };

export type LigneComparee =
  | { type: "egal"; texte: string }
  | { type: "retire"; texte: string }
  | { type: "ajoute"; texte: string }
  /** Une ligne récrite : ses mots retirés et ajoutés, dans l'ordre. */
  | { type: "modifie"; segments: Segment[] };

export type Comparaison =
  | { tropLong: false; lignes: LigneComparee[] }
  /** Trop de différences pour un calcul raisonnable : rien n'est comparé. */
  | { tropLong: true };

type Operation = "egal" | "retire" | "ajoute";

/** Fins de ligne ramenées à « \n » : un texte venu d'ailleurs peut les mêler. */
function enLignes(texte: string): string[] {
  return texte.replace(/\r\n?/g, "\n").split("\n");
}

/**
 * Suite d'opérations qui mène de `a` à `b`, par la plus longue sous-suite
 * commune. Null si le tableau dépasserait `limite` cellules.
 */
function operations<T>(a: readonly T[], b: readonly T[], limite: number): Operation[] | null {
  // Ce qui est commun au début et à la fin ne se calcule pas : la plupart
  // des retouches sont locales.
  let debut = 0;
  while (debut < a.length && debut < b.length && a[debut] === b[debut]) {
    debut += 1;
  }
  let fin = 0;
  while (
    fin < a.length - debut &&
    fin < b.length - debut &&
    a[a.length - 1 - fin] === b[b.length - 1 - fin]
  ) {
    fin += 1;
  }

  const n = a.length - debut - fin;
  const m = b.length - debut - fin;
  if (n * m > limite) {
    return null;
  }

  // Longueur de la plus longue sous-suite commune des suffixes.
  const largeur = m + 1;
  const table = new Uint32Array((n + 1) * largeur);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * largeur + j] =
        a[debut + i] === b[debut + j]
          ? table[(i + 1) * largeur + j + 1] + 1
          : Math.max(table[(i + 1) * largeur + j], table[i * largeur + j + 1]);
    }
  }

  const suite: Operation[] = Array<Operation>(debut).fill("egal");
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[debut + i] === b[debut + j]) {
      suite.push("egal");
      i += 1;
      j += 1;
    } else if (table[(i + 1) * largeur + j] >= table[i * largeur + j + 1]) {
      suite.push("retire");
      i += 1;
    } else {
      suite.push("ajoute");
      j += 1;
    }
  }
  for (; i < n; i += 1) suite.push("retire");
  for (; j < m; j += 1) suite.push("ajoute");
  for (let k = 0; k < fin; k += 1) suite.push("egal");
  return suite;
}

/** Mots et blancs d'une ligne, chacun son élément : rien n'est perdu au recollage. */
function enMots(ligne: string): string[] {
  return ligne.split(/(\s+)/).filter((morceau) => morceau !== "");
}

/** Une ligne récrite, mot par mot. Null si elle est trop longue pour l'être. */
function comparerLigne(ancienne: string, recente: string): Segment[] | null {
  const a = enMots(ancienne);
  const b = enMots(recente);
  const suite = operations(a, b, 250_000);
  if (suite === null) {
    return null;
  }
  const segments: Segment[] = [];
  let i = 0;
  let j = 0;
  for (const operation of suite) {
    const texte = operation === "ajoute" ? b[j] : a[i];
    if (operation !== "ajoute") i += 1;
    if (operation !== "retire") j += 1;
    const dernier = segments.at(-1);
    if (dernier && dernier.type === operation) {
      dernier.texte += texte;
    } else {
      segments.push({ type: operation, texte });
    }
  }
  return segments;
}

/**
 * Compare deux textes, de l'ancien vers le récent. Autant de lignes retirées
 * que de lignes ajoutées, à la suite, sont lues comme des lignes récrites et
 * comparées mot par mot ; sinon elles restent retirées et ajoutées.
 */
export function comparerTextes(
  ancien: string,
  recent: string,
  limite: number = LIMITE_COMPARAISON,
): Comparaison {
  const a = enLignes(ancien);
  const b = enLignes(recent);
  const suite = operations(a, b, limite);
  if (suite === null) {
    return { tropLong: true };
  }

  const lignes: LigneComparee[] = [];
  let i = 0;
  let j = 0;
  let k = 0;
  while (k < suite.length) {
    if (suite[k] === "egal") {
      lignes.push({ type: "egal", texte: a[i] });
      i += 1;
      j += 1;
      k += 1;
      continue;
    }
    // Un passage modifié : ses lignes retirées, puis ses lignes ajoutées.
    const retirees: string[] = [];
    const ajoutees: string[] = [];
    while (k < suite.length && suite[k] !== "egal") {
      if (suite[k] === "retire") {
        retirees.push(a[i]);
        i += 1;
      } else {
        ajoutees.push(b[j]);
        j += 1;
      }
      k += 1;
    }
    if (retirees.length === ajoutees.length) {
      for (let rang = 0; rang < retirees.length; rang += 1) {
        const segments = comparerLigne(retirees[rang], ajoutees[rang]);
        // Deux lignes sans un mot en commun ne sont pas « une ligne récrite ».
        if (
          segments &&
          segments.some((segment) => segment.type === "egal" && /\S/.test(segment.texte))
        ) {
          lignes.push({ type: "modifie", segments });
        } else {
          lignes.push({ type: "retire", texte: retirees[rang] });
          lignes.push({ type: "ajoute", texte: ajoutees[rang] });
        }
      }
    } else {
      for (const texte of retirees) lignes.push({ type: "retire", texte });
      for (const texte of ajoutees) lignes.push({ type: "ajoute", texte });
    }
  }
  return { tropLong: false, lignes };
}

/** Ce qui a changé, en nombre de lignes. */
export function bilanComparaison(lignes: readonly LigneComparee[]): {
  ajoutees: number;
  retirees: number;
  modifiees: number;
  identiques: boolean;
} {
  let ajoutees = 0;
  let retirees = 0;
  let modifiees = 0;
  for (const ligne of lignes) {
    if (ligne.type === "ajoute") ajoutees += 1;
    else if (ligne.type === "retire") retirees += 1;
    else if (ligne.type === "modifie") modifiees += 1;
  }
  return { ajoutees, retirees, modifiees, identiques: ajoutees + retirees + modifiees === 0 };
}

export type GroupeCompare =
  | { type: "lignes"; lignes: LigneComparee[] }
  /** Des lignes inchangées, loin de toute modification : repliées, comptées. */
  | { type: "repli"; nombre: number };

/**
 * Replie les longues suites de lignes inchangées, en gardant `contexte`
 * lignes autour de chaque modification. Deux textes identiques ne sont pas
 * repliés : il n'y a rien à mettre en contexte.
 */
export function replierInchange(
  lignes: readonly LigneComparee[],
  contexte: number = CONTEXTE_COMPARAISON,
): GroupeCompare[] {
  const garder = new Array<boolean>(lignes.length).fill(false);
  let modifications = 0;
  lignes.forEach((ligne, rang) => {
    if (ligne.type === "egal") {
      return;
    }
    modifications += 1;
    for (
      let voisin = Math.max(0, rang - contexte);
      voisin <= Math.min(lignes.length - 1, rang + contexte);
      voisin += 1
    ) {
      garder[voisin] = true;
    }
  });
  if (modifications === 0) {
    return lignes.length ? [{ type: "lignes", lignes: [...lignes] }] : [];
  }

  const groupes: GroupeCompare[] = [];
  let rang = 0;
  while (rang < lignes.length) {
    const debut = rang;
    const visible = garder[rang];
    while (rang < lignes.length && garder[rang] === visible) {
      rang += 1;
    }
    // Replier une seule ligne ne ferait rien gagner : elle reste affichée.
    if (visible || rang - debut === 1) {
      const dernier = groupes.at(-1);
      if (dernier?.type === "lignes") {
        dernier.lignes.push(...lignes.slice(debut, rang));
      } else {
        groupes.push({ type: "lignes", lignes: lignes.slice(debut, rang) });
      }
    } else {
      groupes.push({ type: "repli", nombre: rang - debut });
    }
  }
  return groupes;
}

/** « 1 ligne », « 12 lignes ». */
function nombreLignes(nombre: number): string {
  return nombre === 1 ? "1 ligne" : `${nombre} lignes`;
}

/** Le bilan en une phrase : « 2 lignes ajoutées, 1 ligne retirée, 3 lignes modifiées. » */
export function bilanEnClair(bilan: {
  ajoutees: number;
  retirees: number;
  modifiees: number;
  identiques: boolean;
}): string {
  if (bilan.identiques) {
    return "Les deux versions ont le même texte.";
  }
  const parties = [
    bilan.ajoutees
      ? `${nombreLignes(bilan.ajoutees)} ${bilan.ajoutees > 1 ? "ajoutées" : "ajoutée"}`
      : null,
    bilan.retirees
      ? `${nombreLignes(bilan.retirees)} ${bilan.retirees > 1 ? "retirées" : "retirée"}`
      : null,
    bilan.modifiees
      ? `${nombreLignes(bilan.modifiees)} ${bilan.modifiees > 1 ? "modifiées" : "modifiée"}`
      : null,
  ].filter(Boolean);
  return `${parties.join(", ")}.`;
}

/**
 * Les deux numéros d'une comparaison, lus d'une adresse : deux entiers
 * positifs distincts, rendus de l'ancienne à la récente quel que soit l'ordre
 * dans lequel ils sont donnés. Null sinon.
 */
export function lireVersionsComparees(
  de: unknown,
  a: unknown,
): { ancienne: number; recente: number } | null {
  const lire = (valeur: unknown) =>
    typeof valeur === "string" && /^[1-9]\d{0,8}$/.test(valeur) ? Number(valeur) : null;
  const premier = lire(de);
  const second = lire(a);
  if (premier === null || second === null || premier === second) {
    return null;
  }
  return { ancienne: Math.min(premier, second), recente: Math.max(premier, second) };
}
