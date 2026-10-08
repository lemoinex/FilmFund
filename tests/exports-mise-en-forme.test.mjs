/**
 * Mise en forme dans les exports (lot ED2b) : la copie de la règle que tient
 * le worker, le plan du dossier, et les fichiers PDF, Word et ZIP réellement
 * fabriqués.
 *
 * Aucune base, aucun fournisseur : le dossier est composé à partir d'un
 * contenu d'essai. Le Word se vérifie dans son XML ; le PDF, dont le texte est
 * écrit en numéros de glyphes, dans ses polices et dans la position de ses
 * lignes. Qu'un lecteur de PDF ou un traitement de texte l'affiche bien ne se
 * vérifie pas ici.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { inflateRawSync, inflateSync } from "node:zlib";

import * as ecran from "../src/lib/mise-en-forme.ts";
import { rendreArchive } from "../worker/src/exports/archive.ts";
import { rendreDocx } from "../worker/src/exports/docx.ts";
import { composerDossier } from "../worker/src/exports/dossier.ts";
import * as worker from "../worker/src/exports/mise-en-forme.ts";
import { rendrePdf } from "../worker/src/exports/pdf.ts";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

const NOTE = [
  "# Pourquoi ce film",
  "",
  "Le fleuve garde la **mémoire** du village,",
  "et *personne* ne l'écoute plus.",
  "",
  "## Ce que je veux montrer",
  "- la crue",
  "- le **départ** d'Awa, une phrase assez longue pour passer à la ligne et montrer que le retrait de la liste est gardé sous la puce",
  "",
  "Un marqueur **non refermé reste du texte.",
  "<script>alert(1)</script>",
].join("\n");
const SCENARIO = ["# 1. INT. CASE - NUIT", "", "AWA", "- Tu pars **vraiment** ?"].join("\n");

/** Contenu d'essai, tel que la base le remettrait. */
const contenu = (documents, fiche_projet) => ({
  demande: { sections: fiche_projet ? ["fiche_projet"] : [], documents: [] },
  fiche: { titre: "Le Fleuve", format: "long_metrage", etape: "ecriture" },
  ...(fiche_projet ? { fiche_projet } : {}),
  documents,
});
const dossierDe = (documents, fiche) =>
  composerDossier(contenu(documents, fiche), new Date("2026-10-08T12:00:00Z"));
const note = (texte = NOTE) => ({
  type: "note_intention",
  titre: "Note d'intention",
  contenu: texte,
});
const scenario = { type: "scenario", titre: "Scénario", contenu: SCENARIO };

/** Fichiers d'une archive ZIP, lus en-tête local après en-tête local. */
function lireEntrees(archive) {
  const fichiers = new Map();
  let i = 0;
  while (i + 30 <= archive.length && archive.readUInt32LE(i) === 0x04034b50) {
    const methode = archive.readUInt16LE(i + 8);
    const taille = archive.readUInt32LE(i + 18);
    const longueurNom = archive.readUInt16LE(i + 26);
    const longueurExtra = archive.readUInt16LE(i + 28);
    const nom = archive.toString("utf8", i + 30, i + 30 + longueurNom);
    const debut = i + 30 + longueurNom + longueurExtra;
    const donnees = archive.subarray(debut, debut + taille);
    fichiers.set(nom, methode === 8 ? inflateRawSync(donnees) : Buffer.from(donnees));
    i = debut + taille;
  }
  return fichiers;
}
const xmlDuWord = (fichier) => lireEntrees(fichier).get("word/document.xml").toString("utf8");
/** Les paragraphes d'un document Word, chacun avec son XML. */
const paragraphes = (xml) => [...xml.matchAll(/<w:p>[\s\S]*?<\/w:p>/g)].map((trouve) => trouve[0]);
/** Le texte d'un morceau de XML, ses passages mis bout à bout. */
const texteDe = (xml) =>
  [...xml.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((trouve) => trouve[1]).join("");
/** Les passages d'un paragraphe : « [g:…] », « [i:…] » ou le texte, « / » pour un retour. */
const passagesDe = (paragraphe) =>
  [...paragraphe.matchAll(/<w:r>[\s\S]*?<\/w:r>/g)].map((trouve) => {
    const passage = trouve[0];
    const texte = `${passage.includes("<w:br/>") ? "/" : ""}${texteDe(passage)}`;
    return passage.includes("<w:b/>")
      ? `[g:${texte}]`
      : passage.includes("<w:i/>")
        ? `[i:${texte}]`
        : texte;
  });

/** Polices qu'un PDF embarque. */
const policesDu = (pdf) => [
  ...new Set(
    [...pdf.toString("latin1").matchAll(/\/BaseFont \/[A-Z]+\+NotoSerif-(\w+)/g)].map(
      (trouve) => trouve[1],
    ),
  ),
];
/** Pour une page de texte d'un PDF, chaque passage écrit : abscisse, ordonnée, corps. */
function passagesDuPdf(pdf, page) {
  const brut = pdf.toString("latin1");
  const pages = [];
  for (const trouve of brut.matchAll(/stream\r?\n/g)) {
    const debut = trouve.index + trouve[0].length;
    let flux;
    try {
      flux = inflateSync(pdf.subarray(debut, brut.indexOf("endstream", debut))).toString("latin1");
    } catch {
      continue;
    }
    if (flux.includes(" Tm")) {
      pages.push(
        [...flux.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*\/F\d+ ([\d.]+) Tf/g)].map((t) => ({
          x: Math.round(Number(t[1])),
          y: Math.round(Number(t[2])),
          corps: Number(t[3]),
        })),
      );
    }
  }
  return pages[page];
}

describe("Exports, mise en forme : une seule règle, en deux copies", () => {
  const source = {
    ecran: lire("src/lib/mise-en-forme.ts"),
    worker: lire("worker/src/exports/mise-en-forme.ts"),
  };
  const DECLARATIONS = [
    ["les types sans mise en forme", /export const TYPES_SANS_MISE_EN_FORME[^\n]*\n/],
    ["estMisEnForme", /export function estMisEnForme[\s\S]*?\n}\n/],
    ["le type Segment", /export type Segment[^\n]*\n/],
    ["le type BlocTexte", /export type BlocTexte[\s\S]*?;\n\n/],
    ["le motif des marques", /const MARQUE = [^\n]*\n/],
    ["lireSegments", /export function lireSegments[\s\S]*?\n}\n/],
    ["lireMiseEnForme", /export function lireMiseEnForme[\s\S]*?\n}\n/],
  ];

  for (const [nom, motif] of DECLARATIONS) {
    it(`${nom} : le worker en tient la copie exacte`, () => {
      const [original] = motif.exec(source.ecran) ?? [];
      const [copie] = motif.exec(source.worker) ?? [];
      assert.ok(original, "introuvable dans l'application");
      assert.equal(copie, original);
    });
  }

  it("les deux copies lisent tout texte de la même façon", () => {
    const corpus = [
      NOTE,
      SCENARIO,
      "",
      "***trois***",
      "a*b*c**d**e*",
      "#Titre collé\n-tiret collé\n# \n- ",
      "### Trois",
      "- a\n- b\n\n- c",
      "# Titre\r\n\r\nTexte\r\n- un\r\n- deux",
      "ni * là * non plus, ni ** là **",
    ];
    for (const texte of corpus) {
      assert.deepEqual(worker.lireMiseEnForme(texte), ecran.lireMiseEnForme(texte), texte);
    }
    for (const type of ["scenario", "note_intention", "synopsis", "autre"]) {
      assert.equal(worker.estMisEnForme(type), ecran.estMisEnForme(type), type);
    }
    assert.deepEqual(worker.TYPES_SANS_MISE_EN_FORME, ecran.TYPES_SANS_MISE_EN_FORME);
  });

  it("le worker n'importe rien de l'application", () => {
    assert.doesNotMatch(source.worker, /^import /m);
  });
});

describe("Exports, mise en forme : le plan du dossier", () => {
  it("le texte d'un document se lit mis en forme, celui d'un scénario reste brut", () => {
    const dossier = dossierDe([note(), scenario]);
    assert.deepEqual(
      dossier.sections.map((section) => [section.titre, section.blocs.map((bloc) => bloc.type)]),
      [
        ["Note d'intention", ["texte_mis_en_forme"]],
        ["Scénario", ["texte"]],
      ],
    );
    // Le plan porte le texte tel qu'il est enregistré : rien n'y est retiré.
    assert.equal(dossier.sections[0].blocs[0].texte, NOTE);
  });

  it("les champs de la fiche restent du texte brut", () => {
    const dossier = dossierDe([], {
      genre: "drame",
      pays: ["CM"],
      langues: "",
      duree: null,
      synopsis_court: "Un **mot** et\n- un tiret",
      theme: "",
      enjeux: "# Pas un titre",
      vision: "",
      objectifs: "",
      public: "",
      personnages: [],
    });
    const types = dossier.sections.flatMap((section) => section.blocs.map((bloc) => bloc.type));
    assert.ok(types.includes("texte"));
    assert.ok(!types.includes("texte_mis_en_forme"));
  });
});

describe("Exports, mise en forme : Word", () => {
  it("rend titres, liste, gras et italique, et ne laisse aucun marqueur lu", async () => {
    const xml = xmlDuWord(await rendreDocx(dossierDe([note()])));
    const lus = paragraphes(xml);
    const trouver = (debut) => lus.find((paragraphe) => texteDe(paragraphe).startsWith(debut));

    // De vrais titres, sous ceux du dossier.
    assert.match(trouver("Pourquoi ce film"), /<w:pStyle w:val="Heading3"\/>/);
    assert.match(trouver("Ce que je veux montrer"), /<w:pStyle w:val="Heading4"\/>/);
    assert.equal(texteDe(trouver("Pourquoi ce film")), "Pourquoi ce film");

    // Un paragraphe, son retour à la ligne gardé, ses passages marqués.
    assert.deepEqual(passagesDe(trouver("Le fleuve garde")), [
      "Le fleuve garde la ",
      "[g:mémoire]",
      " du village,",
      "/et ",
      "[i:personne]",
      " ne l&apos;écoute plus.",
    ]);

    // Une vraie liste à puces, de deux éléments.
    const puces = lus.filter((paragraphe) => paragraphe.includes("<w:numPr>"));
    assert.equal(puces.length, 2);
    assert.equal(texteDe(puces[0]), "la crue");
    assert.deepEqual(passagesDe(puces[1]).slice(0, 2), ["le ", "[g:départ]"]);

    const texte = texteDe(xml);
    for (const marqueur of ["**mémoire**", "*personne*", "# Pourquoi", "## Ce que", "- la crue"]) {
      assert.ok(!texte.includes(marqueur), marqueur);
    }
  });

  it("garde en texte un marqueur non refermé et un balisage saisi", async () => {
    const xml = xmlDuWord(await rendreDocx(dossierDe([note()])));
    assert.ok(texteDe(xml).includes("Un marqueur **non refermé reste du texte."));
    assert.ok(xml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(!xml.includes("<script>"));
  });

  it("laisse un scénario tel qu'il est écrit", async () => {
    const xml = xmlDuWord(await rendreDocx(dossierDe([scenario])));
    const texte = texteDe(xml);
    assert.ok(texte.includes("# 1. INT. CASE - NUIT"));
    assert.ok(texte.includes("- Tu pars **vraiment** ?"));
    assert.doesNotMatch(xml, /<w:numPr>|Heading3|Heading4/);
  });

  it("un document sans marqueur sort comme avant : des paragraphes, rien d'autre", async () => {
    const xml = xmlDuWord(
      await rendreDocx(dossierDe([note("Un paragraphe.\nSa suite.\n\nUn autre.")])),
    );
    const lus = paragraphes(xml).filter((paragraphe) => /Un paragraphe|Un autre/.test(paragraphe));
    assert.deepEqual(lus.map(passagesDe), [["Un paragraphe.", "/Sa suite."], ["Un autre."]]);
    assert.doesNotMatch(xml, /<w:numPr>|Heading3|Heading4/);
  });

  it("retire d'un texte mis en forme les caractères que XML interdit", async () => {
    const xml = xmlDuWord(await rendreDocx(dossierDe([note("# Ti\u000Btre\n\n**gr\u0001as**")])));
    assert.ok(texteDe(xml).includes("Titre"));
    assert.ok(xml.includes(">gras<"));
    assert.doesNotMatch(xml, /[\u0001\u000B]/);
  });
});

describe("Exports, mise en forme : PDF", () => {
  it("n'embarque l'italique que si le texte en porte", async () => {
    const avec = await rendrePdf(dossierDe([note()]));
    const sans = await rendrePdf(dossierDe([note("Un texte **gras**, sans plus.")]));
    assert.equal(avec.fichier.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(policesDu(avec.fichier).includes("Italic"));
    assert.deepEqual(policesDu(sans.fichier).sort(), ["Bold", "Regular"]);
  });

  it("un scénario n'y prend ni italique ni puce", async () => {
    const { fichier } = await rendrePdf(
      dossierDe([{ ...scenario, contenu: "AWA\n- Tu *pars* ?" }]),
    );
    assert.deepEqual(policesDu(fichier).sort(), ["Bold", "Regular"]);
  });

  it("pose la puce à la marge et le texte en retrait, sur la même ligne, retrait gardé à la ligne", async () => {
    const { fichier } = await rendrePdf(dossierDe([note()]));
    const passages = passagesDuPdf(fichier, 1);
    const marge = Math.min(...passages.map((passage) => passage.x));
    const enRetrait = passages.filter((passage) => passage.x === marge + 14);
    // Deux éléments, et la suite du second, passée à la ligne sous son texte.
    assert.equal(enRetrait.length, 3);
    const lignes = [...new Set(enRetrait.map((passage) => passage.y))];
    assert.equal(lignes.length, 3);
    for (const y of lignes.slice(0, 2)) {
      assert.ok(
        passages.some((passage) => passage.x === marge && passage.y === y),
        `pas de puce à la marge sur la ligne ${y}`,
      );
    }
    assert.ok(!passages.some((passage) => passage.x === marge && passage.y === lignes[2]));
  });

  it("écrit un titre plus grand que le corps, un sous-titre entre les deux", async () => {
    const { fichier } = await rendrePdf(dossierDe([note()]));
    const corps = new Set(passagesDuPdf(fichier, 1).map((passage) => passage.corps));
    for (const taille of [14, 12, 10.5]) {
      assert.ok(corps.has(taille), String(taille));
    }
  });

  it("écrit sur une même ligne les passages d'une phrase, dans l'ordre", async () => {
    const { fichier } = await rendrePdf(dossierDe([note("Avant **gras** après.")]));
    const ligne = passagesDuPdf(fichier, 1).filter((passage) => passage.corps === 10.5);
    assert.equal(ligne.length, 3);
    assert.equal(new Set(ligne.map((passage) => passage.y)).size, 1);
    assert.ok(ligne[0].x < ligne[1].x && ligne[1].x < ligne[2].x);
  });

  it("pagine un long document mis en forme sans échouer", async () => {
    const long = Array.from({ length: 120 }, (_, i) =>
      [`## Partie ${i + 1}`, `Un **paragraphe** et *sa suite*.`, "- un", "- deux"].join("\n"),
    ).join("\n\n");
    const { pages } = await rendrePdf(dossierDe([note(long)]));
    assert.ok(pages > 5, String(pages));
  });
});

describe("Exports, mise en forme : archive ZIP", () => {
  it("le fichier Word d'un document y est mis en forme lui aussi", async () => {
    const donnees = contenu([note(), scenario]);
    const dossier = composerDossier(donnees, new Date("2026-10-08T12:00:00Z"));
    const archive = lireEntrees(await rendreArchive(dossier, donnees));
    const noms = [...archive.keys()].filter(
      (nom) => nom.startsWith("documents/") && nom.endsWith(".docx"),
    );
    assert.equal(noms.length, 2);

    const xmlNote = xmlDuWord(archive.get(noms[0]));
    assert.match(xmlNote, /Heading3/);
    assert.ok(!texteDe(xmlNote).includes("**mémoire**"));
    const xmlScenario = xmlDuWord(archive.get(noms[1]));
    assert.ok(texteDe(xmlScenario).includes("- Tu pars **vraiment** ?"));
  });
});
