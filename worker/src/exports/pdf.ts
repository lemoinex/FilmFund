/**
 * Mise en page d'un dossier en PDF, format A4.
 *
 * La police est embarquée : les polices de base d'un PDF n'ont pas les
 * lettres ɛ, ɔ ou ŋ, courantes dans un titre en langue africaine. Noto Serif
 * couvre l'alphabet latin étendu, le grec et le cyrillique ; pas l'arabe,
 * l'amharique ni le tifinagh, dont les caractères sortiraient en cases vides.
 *
 * Aucune image, aucun appel extérieur : le fichier est fabriqué en mémoire à
 * partir du seul plan reçu.
 */
import { createRequire } from "node:module";

import PDFDocument from "pdfkit";

import type { Bloc, Colonne, Dossier, Ligne, Section } from "./dossier.ts";

const require = createRequire(import.meta.url);
const police = (fichier: string) => require.resolve(`@expo-google-fonts/noto-serif/${fichier}`);

const POLICES = {
  corps: police("400Regular/NotoSerif_400Regular.ttf"),
  italique: police("400Regular_Italic/NotoSerif_400Regular_Italic.ttf"),
  gras: police("700Bold/NotoSerif_700Bold.ttf"),
} as const;

const MARGES = { top: 64, bottom: 72, left: 62, right: 62 };

const ENCRE = "#1c1f26";
const DISCRET = "#5b6470";
const FILET = "#c9ced6";
const FOND = "#f1f2f4";
// L'or assombri de l'application : lisible sur blanc, à l'écran comme imprimé.
const OR = "#8a6b1f";

const CORPS = 10.5;
const TABLEAU = 9;
const MARGE_CELLULE = 5;
/** Au-delà, le titre est abrégé dans le pied de page. */
const TITRE_PIED_MAX = 80;

type Document = InstanceType<typeof PDFDocument>;

function largeurUtile(doc: Document): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function bas(doc: Document): number {
  return doc.page.height - doc.page.margins.bottom;
}

function pageDeGarde(doc: Document, dossier: Dossier): void {
  const gauche = doc.page.margins.left;
  const largeur = largeurUtile(doc);

  doc
    .moveTo(gauche, 250)
    .lineTo(gauche + 48, 250)
    .lineWidth(2)
    .strokeColor(OR)
    .stroke();

  doc
    .font("gras")
    .fontSize(9)
    .fillColor(OR)
    .text("DOSSIER DE PROJET", gauche, 266, { width: largeur, characterSpacing: 1.6 });

  doc
    .font("gras")
    .fontSize(30)
    .fillColor(ENCRE)
    .text(dossier.titre, gauche, 292, { width: largeur, lineGap: 4 });

  doc.moveDown(0.6).font("corps").fontSize(13).fillColor(DISCRET).text(dossier.sousTitre, {
    width: largeur,
  });

  doc
    .font("corps")
    .fontSize(9.5)
    .fillColor(DISCRET)
    .text(dossier.date, gauche, doc.page.height - 120, { width: largeur, lineBreak: false });
}

function enTeteDeSection(doc: Document, section: Section): void {
  const gauche = doc.page.margins.left;
  const largeur = largeurUtile(doc);

  if (section.surTitre) {
    doc
      .font("gras")
      .fontSize(8.5)
      .fillColor(OR)
      .text(section.surTitre.toUpperCase(), gauche, doc.y, {
        width: largeur,
        characterSpacing: 1.2,
      });
    doc.moveDown(0.5);
  }

  doc.font("gras").fontSize(20).fillColor(ENCRE).text(section.titre, gauche, doc.y, {
    width: largeur,
    lineGap: 2,
  });

  const y = doc.y + 8;
  doc
    .moveTo(gauche, y)
    .lineTo(gauche + largeur, y)
    .lineWidth(0.5)
    .strokeColor(FILET)
    .stroke();
  doc.y = y + 18;
}

function texte(doc: Document, contenu: string): void {
  const gauche = doc.page.margins.left;
  // Une ligne vide sépare deux paragraphes ; un simple retour reste un retour.
  const paragraphes = contenu
    .replaceAll("\r\n", "\n")
    .split(/\n[ \t]*\n+/)
    .map((paragraphe) => paragraphe.trim())
    .filter(Boolean);

  doc.font("corps").fontSize(CORPS).fillColor(ENCRE);
  for (const paragraphe of paragraphes) {
    doc.text(paragraphe, gauche, doc.y, {
      width: largeurUtile(doc),
      align: "left",
      lineGap: 3.5,
      paragraphGap: 9,
    });
  }
}

function intertitre(doc: Document, contenu: string): void {
  if (doc.y > bas(doc) - 60) {
    doc.addPage();
  }
  doc
    .moveDown(0.4)
    .font("gras")
    .fontSize(12)
    .fillColor(ENCRE)
    .text(contenu, doc.page.margins.left, doc.y, {
      width: largeurUtile(doc),
    });
  doc.moveDown(0.4);
}

function tableau(doc: Document, colonnes: Colonne[], lignes: Ligne[]): void {
  const gauche = doc.page.margins.left;
  const largeur = largeurUtile(doc);
  const largeurs = colonnes.map((colonne) => colonne.largeur * largeur);

  const hauteur = (cellules: string[], fonte: string) => {
    doc.font(fonte).fontSize(TABLEAU);
    const hauteurs = cellules.map((cellule, i) =>
      doc.heightOfString(cellule || " ", { width: largeurs[i] - 2 * MARGE_CELLULE, lineGap: 1.5 }),
    );
    return Math.max(...hauteurs) + 2 * MARGE_CELLULE;
  };

  const dessiner = (cellules: string[], fonte: string, fond: string | null, encre: string) => {
    const h = hauteur(cellules, fonte);
    const y = doc.y;
    if (fond) {
      doc.rect(gauche, y, largeur, h).fill(fond);
    }
    doc.font(fonte).fontSize(TABLEAU).fillColor(encre);
    let x = gauche;
    cellules.forEach((cellule, i) => {
      doc.text(cellule, x + MARGE_CELLULE, y + MARGE_CELLULE, {
        width: largeurs[i] - 2 * MARGE_CELLULE,
        align: colonnes[i].alignement === "droite" ? "right" : "left",
        lineGap: 1.5,
      });
      x += largeurs[i];
    });
    doc
      .moveTo(gauche, y + h)
      .lineTo(gauche + largeur, y + h)
      .lineWidth(0.5)
      .strokeColor(FILET)
      .stroke();
    doc.x = gauche;
    doc.y = y + h;
  };

  const enTete = () =>
    dessiner(
      colonnes.map((colonne) => colonne.titre),
      "gras",
      FOND,
      DISCRET,
    );

  enTete();
  for (const ligne of lignes) {
    const fonte = ligne.style ? "gras" : "corps";
    // Une ligne ne se coupe pas : elle passe entière à la page suivante, sous
    // un en-tête répété.
    if (doc.y + hauteur(ligne.cellules, fonte) > bas(doc)) {
      doc.addPage();
      enTete();
    }
    dessiner(ligne.cellules, fonte, ligne.style === "total" ? FOND : null, ENCRE);
  }
  doc.moveDown(1);
}

function bloc(doc: Document, element: Bloc): void {
  switch (element.type) {
    case "intertitre":
      intertitre(doc, element.texte);
      break;
    case "texte":
      texte(doc, element.texte);
      break;
    case "tableau":
      tableau(doc, element.colonnes, element.lignes);
      break;
  }
}

/** Titre du projet et numéro de page, sur toutes les pages sauf la garde. */
function piedsDePage(doc: Document, dossier: Dossier): void {
  const { count } = doc.bufferedPageRange();
  const titre =
    dossier.titre.length > TITRE_PIED_MAX
      ? `${dossier.titre.slice(0, TITRE_PIED_MAX - 1)}…`
      : dossier.titre;

  for (let page = 1; page < count; page += 1) {
    doc.switchToPage(page);
    const gauche = doc.page.margins.left;
    const largeur = largeurUtile(doc);
    const y = doc.page.height - 46;
    // Le pied s'écrit sous la marge basse : sans cela, pdfkit ouvrirait une
    // page de plus pour l'accueillir.
    doc.page.margins.bottom = 0;
    doc.font("corps").fontSize(8).fillColor(DISCRET);
    doc.text(titre, gauche, y, { width: largeur * 0.8, lineBreak: false });
    doc.text(`${page + 1} / ${count}`, gauche, y, {
      width: largeur,
      align: "right",
      lineBreak: false,
    });
  }
}

/** Fabrique le PDF du dossier. `pages` compte la page de garde. */
export function rendrePdf(dossier: Dossier): Promise<{ fichier: Buffer; pages: number }> {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: MARGES,
      bufferPages: true,
      lang: "fr-FR",
      displayTitle: true,
      info: { Title: dossier.titre, Creator: "filmfundAfrica", Producer: "filmfundAfrica" },
    });

    const morceaux: Buffer[] = [];
    let pages = 0;
    doc.on("data", (morceau: Buffer) => morceaux.push(morceau));
    doc.on("error", rejeter);
    doc.on("end", () => resoudre({ fichier: Buffer.concat(morceaux), pages }));

    for (const [nom, chemin] of Object.entries(POLICES)) {
      doc.registerFont(nom, chemin);
    }

    pageDeGarde(doc, dossier);
    for (const section of dossier.sections) {
      doc.addPage();
      enTeteDeSection(doc, section);
      section.blocs.forEach((element) => bloc(doc, element));
    }
    piedsDePage(doc, dossier);

    pages = doc.bufferedPageRange().count;
    doc.end();
  });
}
