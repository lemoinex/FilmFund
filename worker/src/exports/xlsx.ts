/**
 * Fabrication d'un classeur Excel (XLSX) à une feuille : un tableau, sa ligne
 * de titres, des textes, des nombres et des dates.
 *
 * Un XLSX est une archive ZIP de fichiers XML. Celui-ci s'en tient au strict
 * nécessaire, écrit à la main plutôt que par une bibliothèque : six fichiers,
 * dont la table des textes partagés — la forme que tous les tableurs lisent.
 *
 * Un texte est rangé dans cette table et désigné par son rang : le tableur ne
 * l'interprète jamais. Un libellé qui commence par « = » reste donc un texte,
 * là où un fichier CSV en ferait une formule.
 *
 * Aucune image, aucun appel extérieur : le fichier est fabriqué en mémoire.
 */
import JSZip from "jszip";

export type CelluleXlsx =
  | { type: "texte"; valeur: string; gras?: boolean }
  /** `montant` : séparateur de milliers et deux décimales. */
  | { type: "nombre"; valeur: number; montant?: boolean; gras?: boolean }
  /** Date de la base, `AAAA-MM-JJ`. */
  | { type: "date"; valeur: string }
  /** Cellule vide. */
  | null;

export type FeuilleXlsx = {
  /** Nom de l'onglet : 31 caractères au plus, sans `[ ] : * ? / \`. */
  nom: string;
  /** Titres de la première ligne ; `largeur` en caractères. */
  colonnes: { titre: string; largeur: number }[];
  lignes: CelluleXlsx[][];
};

export const texte = (valeur: string, gras = false): CelluleXlsx => ({
  type: "texte",
  valeur,
  gras,
});

export const nombre = (valeur: number): CelluleXlsx => ({ type: "nombre", valeur });

export const montant = (valeur: number, gras = false): CelluleXlsx => ({
  type: "nombre",
  valeur,
  montant: true,
  gras,
});

export const date = (valeur: string): CelluleXlsx => ({ type: "date", valeur });

/*
 * Styles de cellule, par rang dans `cellXfs` (styles.xml). Les formats de
 * nombre 4 (« #,##0.00 ») et 14 (date courte) sont ceux qu'Excel prédéfinit :
 * le tableur les affiche selon la langue du poste.
 */
const STYLE = { normal: 0, gras: 1, montant: 2, montantGras: 3, date: 4 } as const;

const ENTETE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const PRINCIPAL = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const RELATIONS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PAQUET = "http://schemas.openxmlformats.org/package/2006";
const TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml";

/**
 * Texte admis dans du XML : les caractères de contrôle qu'il interdit sont
 * retirés, les retours à la ligne ramenés à un seul signe, puis les signes
 * réservés échappés.
 */
function echapper(valeur: string): string {
  return valeur
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** « A », « B », … « Z », « AA » : la lettre d'une colonne, d'après son rang. */
function lettre(rang: number): string {
  let nom = "";
  for (let n = rang + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    nom = String.fromCharCode(65 + ((n - 1) % 26)) + nom;
  }
  return nom;
}

/**
 * Numéro de série d'une date, comme Excel les compte : en jours depuis le
 * 30 décembre 1899. Nul si la date n'en est pas une.
 */
function numeroDeSerie(jour: string): number | null {
  const parties = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jour);
  if (!parties) {
    return null;
  }
  const [annee, mois, quantieme] = parties.slice(1).map(Number);
  const instant = Date.UTC(annee, mois - 1, quantieme);
  const relu = new Date(instant);
  // Un 31 février serait reporté au mois suivant sans rien dire.
  if (relu.getUTCMonth() !== mois - 1 || relu.getUTCDate() !== quantieme) {
    return null;
  }
  return Math.round((instant - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/** Nom d'onglet admis par Excel, quoi qu'on lui donne. */
function nomDOnglet(nom: string): string {
  return (
    nom
      .replace(/[[\]:*?/\\]/g, " ")
      .trim()
      .slice(0, 31) || "Feuille"
  );
}

export async function rendreXlsx(feuille: FeuilleXlsx): Promise<Buffer> {
  // Table des textes partagés : chaque texte distinct y figure une fois.
  const textes: string[] = [];
  const rangs = new Map<string, number>();
  let emplois = 0;
  const rangDe = (valeur: string) => {
    emplois += 1;
    let rang = rangs.get(valeur);
    if (rang === undefined) {
      rang = textes.push(valeur) - 1;
      rangs.set(valeur, rang);
    }
    return rang;
  };

  const cellule = (contenu: CelluleXlsx, colonne: number, ligne: number): string => {
    const reference = `${lettre(colonne)}${ligne}`;
    if (contenu === null) {
      return "";
    }
    if (contenu.type === "texte") {
      const style = contenu.gras ? STYLE.gras : STYLE.normal;
      return `<c r="${reference}" t="s" s="${style}"><v>${rangDe(contenu.valeur)}</v></c>`;
    }
    if (contenu.type === "date") {
      const serie = numeroDeSerie(contenu.valeur);
      // Une date illisible reste lisible : écrite telle quelle, en texte.
      return serie === null
        ? `<c r="${reference}" t="s" s="${STYLE.normal}"><v>${rangDe(contenu.valeur)}</v></c>`
        : `<c r="${reference}" s="${STYLE.date}"><v>${serie}</v></c>`;
    }
    if (!Number.isFinite(contenu.valeur)) {
      return "";
    }
    const style = contenu.montant
      ? contenu.gras
        ? STYLE.montantGras
        : STYLE.montant
      : contenu.gras
        ? STYLE.gras
        : STYLE.normal;
    return `<c r="${reference}" s="${style}"><v>${contenu.valeur}</v></c>`;
  };

  const rangee = (cellules: CelluleXlsx[], ligne: number) =>
    `<row r="${ligne}">${cellules.map((c, colonne) => cellule(c, colonne, ligne)).join("")}</row>`;

  const lignes = [
    rangee(
      feuille.colonnes.map((colonne) => texte(colonne.titre, true)),
      1,
    ),
    ...feuille.lignes.map((cellules, rang) => rangee(cellules, rang + 2)),
  ];

  const colonnes = feuille.colonnes
    .map(
      (colonne, rang) =>
        `<col min="${rang + 1}" max="${rang + 1}" width="${colonne.largeur}" customWidth="1"/>`,
    )
    .join("");

  // La ligne de titres reste visible quand le tableau défile.
  const feuilleXml =
    `${ENTETE}<worksheet xmlns="${PRINCIPAL}">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<cols>${colonnes}</cols>` +
    `<sheetData>${lignes.join("")}</sheetData>` +
    `</worksheet>`;

  const textesXml =
    `${ENTETE}<sst xmlns="${PRINCIPAL}" count="${emplois}" uniqueCount="${textes.length}">` +
    textes.map((valeur) => `<si><t xml:space="preserve">${echapper(valeur)}</t></si>`).join("") +
    `</sst>`;

  const stylesXml =
    `${ENTETE}<styleSheet xmlns="${PRINCIPAL}">` +
    `<fonts count="2">` +
    `<font><sz val="11"/><name val="Calibri"/></font>` +
    `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
    `</fonts>` +
    `<fills count="2">` +
    `<fill><patternFill patternType="none"/></fill>` +
    `<fill><patternFill patternType="gray125"/></fill>` +
    `</fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="5">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `<xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
    `<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const classeurXml =
    `${ENTETE}<workbook xmlns="${PRINCIPAL}" xmlns:r="${RELATIONS}">` +
    `<sheets><sheet name="${echapper(nomDOnglet(feuille.nom))}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const relationsDuClasseur =
    `${ENTETE}<Relationships xmlns="${PAQUET}/relationships">` +
    `<Relationship Id="rId1" Type="${RELATIONS}/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="${RELATIONS}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId3" Type="${RELATIONS}/sharedStrings" Target="sharedStrings.xml"/>` +
    `</Relationships>`;

  const relationsDuPaquet =
    `${ENTETE}<Relationships xmlns="${PAQUET}/relationships">` +
    `<Relationship Id="rId1" Type="${RELATIONS}/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const types =
    `${ENTETE}<Types xmlns="${PAQUET}/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="${TYPE}.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="${TYPE}.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="${TYPE}.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="${TYPE}.sharedStrings+xml"/>` +
    `</Types>`;

  // « [Content_Types].xml » en tête : c'est là que les tableurs l'attendent.
  // Sans entrée de dossier : un classeur ne contient que ses fichiers, et
  // certains lecteurs refusent le reste.
  const archive = new JSZip();
  const fichiers: [string, string][] = [
    ["[Content_Types].xml", types],
    ["_rels/.rels", relationsDuPaquet],
    ["xl/workbook.xml", classeurXml],
    ["xl/_rels/workbook.xml.rels", relationsDuClasseur],
    ["xl/styles.xml", stylesXml],
    ["xl/sharedStrings.xml", textesXml],
    ["xl/worksheets/sheet1.xml", feuilleXml],
  ];
  for (const [chemin, contenu] of fichiers) {
    archive.file(chemin, contenu, { createFolders: false });
  }

  return archive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
