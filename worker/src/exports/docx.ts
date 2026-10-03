/**
 * Mise en page d'un dossier en Word (DOCX), format A4.
 *
 * Même plan que le PDF (dossier.ts), autre rendu : celui-ci se modifie. Le
 * texte reste du texte, les titres sont de vrais styles de titre — le
 * traitement de texte en tire un sommaire —, les tableaux de vrais tableaux.
 *
 * La police n'est pas embarquée : un fichier Word s'ouvre avec les polices
 * du poste. Cambria, livrée avec Office, couvre les lettres ɛ, ɔ et ŋ ;
 * LibreOffice la remplace par Caladea, de mêmes dimensions. La pagination
 * est recalculée à l'ouverture : le fichier ne déclare pas de nombre de
 * pages.
 *
 * Aucune image, aucun appel extérieur : le fichier est fabriqué en mémoire à
 * partir du seul plan reçu.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import type { Bloc, Colonne, Dossier, Ligne, Section } from "./dossier.ts";

const POLICE = "Cambria";

const ENCRE = "1C1F26";
const DISCRET = "5B6470";
const FILET = "C9CED6";
const FOND = "F1F2F4";
// L'or assombri de l'application : lisible sur blanc, à l'écran comme imprimé.
const OR = "8A6B1F";

/** Tailles en demi-points, comme Word les compte. */
const CORPS = 21;
const TABLEAU = 18;

/** Page A4 et marges, en vingtièmes de point. */
const PAGE = { largeur: 11906, hauteur: 16838 };
const MARGE = 1240;
const LARGEUR_UTILE = PAGE.largeur - 2 * MARGE;

/** Au-delà, le titre est abrégé dans le pied de page. */
const TITRE_PIED_MAX = 80;

function pageDeGarde(dossier: Dossier): Paragraph[] {
  return [
    new Paragraph({
      spacing: { before: 4200, after: 120 },
      children: [
        new TextRun({
          text: "DOSSIER DE PROJET",
          bold: true,
          size: 18,
          color: OR,
          characterSpacing: 30,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: dossier.titre, bold: true, size: 60, color: ENCRE })],
    }),
    new Paragraph({
      spacing: { after: 2400 },
      children: [new TextRun({ text: dossier.sousTitre, size: 26, color: DISCRET })],
    }),
    new Paragraph({
      children: [new TextRun({ text: dossier.date, size: 19, color: DISCRET })],
    }),
  ];
}

function enTeteDeSection(section: Section): Paragraph[] {
  const titre = new Paragraph({
    heading: HeadingLevel.HEADING_1,
    // Chaque section commence une page, comme dans le PDF.
    pageBreakBefore: !section.surTitre,
    spacing: { after: 280 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: FILET, space: 8 } },
    children: [new TextRun({ text: section.titre, bold: true, size: 40, color: ENCRE })],
  });
  if (!section.surTitre) {
    return [titre];
  }
  return [
    new Paragraph({
      pageBreakBefore: true,
      keepNext: true,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: section.surTitre.toUpperCase(),
          bold: true,
          size: 17,
          color: OR,
          characterSpacing: 24,
        }),
      ],
    }),
    titre,
  ];
}

/**
 * Une ligne vide sépare deux paragraphes ; un simple retour reste un retour
 * à la ligne dans le paragraphe — même règle que le PDF.
 */
function texte(contenu: string): Paragraph[] {
  return contenu
    .replaceAll("\r\n", "\n")
    .split(/\n[ \t]*\n+/)
    .map((paragraphe) => paragraphe.trim())
    .filter(Boolean)
    .map(
      (paragraphe) =>
        new Paragraph({
          spacing: { after: 180, line: 300 },
          children: paragraphe
            .split("\n")
            .map((ligne, i) => new TextRun({ text: ligne, break: i > 0 ? 1 : 0 })),
        }),
    );
}

function intertitre(contenu: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text: contenu, bold: true, size: 24, color: ENCRE })],
  });
}

function tableau(colonnes: Colonne[], lignes: Ligne[]): Table {
  const largeurs = colonnes.map((colonne) => Math.round(colonne.largeur * LARGEUR_UTILE));

  const cellule = (contenu: string, i: number, gras: boolean, encre: string, fond?: string) =>
    new TableCell({
      width: { size: largeurs[i], type: WidthType.DXA },
      margins: { top: 80, bottom: 80, left: 100, right: 100 },
      ...(fond ? { shading: { type: ShadingType.CLEAR, color: "auto", fill: fond } } : {}),
      children: [
        new Paragraph({
          alignment: colonnes[i].alignement === "droite" ? AlignmentType.RIGHT : AlignmentType.LEFT,
          children: [new TextRun({ text: contenu, bold: gras, size: TABLEAU, color: encre })],
        }),
      ],
    });

  const enTete = new TableRow({
    // Répété en haut de chaque page, et jamais coupé.
    tableHeader: true,
    cantSplit: true,
    children: colonnes.map((colonne, i) => cellule(colonne.titre, i, true, DISCRET, FOND)),
  });

  const corps = lignes.map(
    (ligne) =>
      new TableRow({
        cantSplit: true,
        children: ligne.cellules.map((contenu, i) =>
          cellule(
            contenu,
            i,
            Boolean(ligne.style),
            ENCRE,
            ligne.style === "total" ? FOND : undefined,
          ),
        ),
      }),
  );

  const filet = { style: BorderStyle.SINGLE, size: 4, color: FILET };
  const aucun = { style: BorderStyle.NONE, size: 0, color: "auto" };

  return new Table({
    width: { size: LARGEUR_UTILE, type: WidthType.DXA },
    columnWidths: largeurs,
    borders: {
      top: filet,
      bottom: filet,
      insideHorizontal: filet,
      left: aucun,
      right: aucun,
      insideVertical: aucun,
    },
    rows: [enTete, ...corps],
  });
}

function bloc(element: Bloc): (Paragraph | Table)[] {
  switch (element.type) {
    case "intertitre":
      return [intertitre(element.texte)];
    case "texte":
      return texte(element.texte);
    case "tableau":
      // Un paragraphe vide après le tableau : sans lui, deux tableaux qui se
      // suivent fusionneraient en un seul à l'ouverture.
      return [
        tableau(element.colonnes, element.lignes),
        new Paragraph({ spacing: { after: 120 } }),
      ];
  }
}

/** Titre du projet et numéro de page, sur toutes les pages sauf la garde. */
function piedDePage(dossier: Dossier): Footer {
  const titre =
    dossier.titre.length > TITRE_PIED_MAX
      ? `${dossier.titre.slice(0, TITRE_PIED_MAX - 1)}…`
      : dossier.titre;
  return new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: "right", position: LARGEUR_UTILE }],
        children: [
          new TextRun({ text: titre, size: 16, color: DISCRET }),
          new TextRun({
            children: ["\t", PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES],
            size: 16,
            color: DISCRET,
          }),
        ],
      }),
    ],
  });
}

/** Fabrique le fichier Word du dossier. */
export async function rendreDocx(dossier: Dossier): Promise<Buffer> {
  const document = new Document({
    title: dossier.titre,
    creator: "filmfundAfrica",
    lastModifiedBy: "filmfundAfrica",
    styles: {
      default: {
        document: {
          run: { font: POLICE, size: CORPS, color: ENCRE, language: { value: "fr-FR" } },
        },
        heading1: { run: { font: POLICE } },
        heading2: { run: { font: POLICE } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE.largeur, height: PAGE.hauteur },
            margin: { top: 1280, bottom: 1440, left: MARGE, right: MARGE },
          },
          // La page de garde n'a pas de pied de page.
          titlePage: true,
        },
        footers: { default: piedDePage(dossier), first: new Footer({ children: [] }) },
        children: [
          ...pageDeGarde(dossier),
          ...dossier.sections.flatMap((section) => [
            ...enTeteDeSection(section),
            ...section.blocs.flatMap(bloc),
          ]),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
