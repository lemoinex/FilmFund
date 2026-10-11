/**
 * Fiches des personnages dans le dossier exporté (lot PF2) : la section, ce
 * qu'elle contient dans chaque format, et ce que l'écran en propose.
 *
 * Les fichiers sont réellement fabriqués — un PDF, un Word, une archive —,
 * mais sans passer par la file des tâches : ce test compose et rend. Ce que
 * la base remet pour la section est éprouvé par
 * supabase/tests/exports_fiches_personnages.test.sql.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import {
  AVERTISSEMENT_FICHES_DOCUMENTAIRE,
  ORDRE_SECTIONS,
  SECTIONS,
  SECTIONS_D_OUVERTURE,
  SECTIONS_NON_COCHEES,
} from "../src/lib/exports.ts";
import { CHAMPS_FICHE } from "../worker/src/agents/personnage.ts";
import { rendreArchive } from "../worker/src/exports/archive.ts";
import { rendreDocx } from "../worker/src/exports/docx.ts";
import { composerDossier } from "../worker/src/exports/dossier.ts";
import { rendrePdf } from "../worker/src/exports/pdf.ts";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const lire = (chemin) => readFileSync(RACINE + chemin, "utf8");
const JOUR = new Date("2026-10-11T12:00:00Z");

/** Les fichiers d'une archive ZIP, lus depuis leurs en-têtes locaux. */
function lireArchive(archive) {
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

/** Les textes d'une feuille de classeur, cellule par cellule. */
function lireFeuille(classeur) {
  const parties = lireArchive(classeur);
  const textes = [
    ...parties
      .get("xl/sharedStrings.xml")
      .toString("utf8")
      .matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g),
  ].map((m) => m[1]);
  const cellules = {};
  for (const [, reference, attributs, valeur] of parties
    .get("xl/worksheets/sheet1.xml")
    .toString("utf8")
    .matchAll(/<c r="([A-Z]+\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
    cellules[reference] = /t="s"/.test(attributs) ? textes[Number(valeur)] : Number(valeur);
  }
  return cellules;
}

const FICHE_PROJET = {
  genre: null,
  pays: [],
  langues: "",
  duree: null,
  synopsis_court: "",
  theme: "",
  enjeux: "",
  vision: "",
  objectifs: "",
  public: "",
  personnages: [
    { nom: "Awa", role: "principal", description: "Pêcheuse." },
    { nom: "Le chef", role: "secondaire", description: "Autoritaire." },
  ],
};

/** Ce que la base remet : les seuls personnages qui ont une fiche, et leurs seuls champs remplis. */
const FICHES = [
  {
    nom: "Awa",
    role: "principal",
    age: "la quarantaine",
    objectif: "Retrouver sa fille.",
    liens: "Sœur du chef.",
  },
];

const contenu = (sections, parties) => ({
  demande: { sections, documents: [] },
  fiche: { titre: "Les Eaux", format: "long_metrage", etape: "ecriture" },
  ...parties,
});

const AVEC = contenu(["fiche_projet", "fiches_personnages"], {
  fiche_projet: FICHE_PROJET,
  fiches_personnages: FICHES,
});
const SANS = contenu(["fiche_projet"], { fiche_projet: FICHE_PROJET });

describe("Fiches des personnages : le plan du dossier", () => {
  it("la section suit la fiche du projet, sous son titre", () => {
    const dossier = composerDossier(AVEC, JOUR);
    assert.deepEqual(
      dossier.sections.map((section) => [section.origine, section.titre]),
      [
        ["fiche_projet", "Fiche du projet"],
        ["fiches_personnages", "Fiches des personnages"],
      ],
    );
  });

  it("chaque fiche dit le nom et le rôle, puis ses champs remplis, dans l'ordre", () => {
    const [, section] = composerDossier(AVEC, JOUR).sections;
    assert.deepEqual(section.blocs[0], { type: "intertitre", texte: "Awa · Principal" });
    assert.equal(section.blocs[1].type, "tableau");
    assert.deepEqual(
      section.blocs[1].lignes.map((ligne) => ligne.cellules),
      [
        ["Âge", "la quarantaine"],
        ["Objectif", "Retrouver sa fille."],
        ["Liens", "Sœur du chef."],
      ],
    );
    assert.equal(section.blocs.length, 2);
  });

  it("un champ vide n'est pas écrit ; un personnage sans champ est omis ; rien : pas de section", () => {
    const partiel = composerDossier(
      contenu(["fiches_personnages"], {
        fiches_personnages: [
          { nom: "Awa", role: "principal", age: "  ", traits: "Têtue." },
          { nom: "Le chef", role: "secondaire" },
        ],
      }),
      JOUR,
    );
    assert.deepEqual(
      partiel.sections[0].blocs.map((bloc) =>
        bloc.type === "tableau" ? bloc.lignes.map((ligne) => ligne.cellules) : bloc.texte,
      ),
      ["Awa · Principal", [["Traits", "Têtue."]]],
    );

    const vide = composerDossier(contenu(["fiches_personnages"], { fiches_personnages: [] }), JOUR);
    assert.deepEqual(vide.sections, []);
  });

  it("sans la section, le dossier est exactement celui d'avant", () => {
    const sans = composerDossier(SANS, JOUR);
    const avec = composerDossier(AVEC, JOUR);
    // La fiche du projet ne change pas quand la section s'ajoute.
    assert.deepEqual(avec.sections[0], sans.sections[0]);
    assert.equal(sans.sections.length, 1);
    // Le tableau des personnages garde ses trois colonnes.
    const tableau = sans.sections[0].blocs.find((bloc) => bloc.type === "tableau");
    assert.deepEqual(
      tableau.colonnes.map((colonne) => colonne.titre),
      ["Nom", "Rôle", "Description"],
    );
    assert.ok(!JSON.stringify(sans).includes("la quarantaine"));
  });
});

describe("Fiches des personnages : les fichiers fabriqués", () => {
  it("le PDF sort, avec sa signature", async () => {
    const { fichier, pages } = await rendrePdf(composerDossier(AVEC, JOUR));
    assert.equal(fichier.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(pages >= 1);
  });

  it("le Word porte la section et ses champs", async () => {
    const fichier = await rendreDocx(composerDossier(AVEC, JOUR));
    assert.equal(fichier.readUInt32LE(0), 0x04034b50);
    const texte = lireArchive(fichier).get("word/document.xml").toString("utf8");
    for (const attendu of [
      "Fiches des personnages",
      "Awa · Principal",
      "la quarantaine",
      "Retrouver sa fille.",
    ]) {
      assert.ok(texte.includes(attendu), attendu);
    }

    const sans = await rendreDocx(composerDossier(SANS, JOUR));
    const texteSans = lireArchive(sans).get("word/document.xml").toString("utf8");
    assert.ok(!texteSans.includes("Fiches des personnages"));
    assert.ok(!texteSans.includes("la quarantaine"));
  });

  it("le ZIP porte un classeur des personnages, et les fiches dans la présentation", async () => {
    const archive = lireArchive(await rendreArchive(composerDossier(AVEC, JOUR), AVEC));
    assert.deepEqual([...archive.keys()].sort(), ["personnages.xlsx", "presentation.docx"]);

    const cellules = lireFeuille(archive.get("personnages.xlsx"));
    // Une colonne par champ, dans l'ordre du worker ; une ligne par personnage.
    const entetes = ["Nom", "Rôle", ...CHAMPS_FICHE.map(([, titre]) => titre)];
    assert.deepEqual(
      entetes.map((_, rang) => cellules[`${String.fromCharCode(65 + rang)}1`]),
      entetes,
    );
    assert.equal(cellules.A2, "Awa");
    assert.equal(cellules.B2, "Principal");
    assert.equal(cellules.C2, "la quarantaine");
    assert.equal(cellules.A3, undefined, "un seul personnage a une fiche");

    const presentation = lireArchive(archive.get("presentation.docx"))
      .get("word/document.xml")
      .toString("utf8");
    assert.ok(presentation.includes("Fiches des personnages"));
  });

  it("sans la section, l'archive n'a pas de classeur des personnages", async () => {
    const archive = lireArchive(await rendreArchive(composerDossier(SANS, JOUR), SANS));
    assert.deepEqual([...archive.keys()], ["presentation.docx"]);
  });
});

describe("Fiches des personnages : la base, le worker et l'écran", () => {
  const MIGRATION = lire("supabase/migrations/20261011220000_exports_fiches_personnages.sql");

  it("la base écrit les champs que le worker lit, sous les mêmes noms", () => {
    for (const [cle] of CHAMPS_FICHE) {
      assert.ok(MIGRATION.includes(`'${cle}', nullif(btrim(t.`), cle);
    }
    assert.equal(MIGRATION.split("nullif(btrim(t.").length - 1, CHAMPS_FICHE.length);
    // La description reste dans la fiche du projet.
    assert.ok(MIGRATION.includes("jsonb_build_object('nom', t.name, 'role', t.role)"));
    // Fermée aux comptes, la fonction des agents n'est pas appelée ici.
    assert.ok(!MIGRATION.includes("public.personnage_pour_agent("));
  });

  it("la section est à l'ouverture du dossier, après la fiche du projet", () => {
    assert.equal(SECTIONS.fiches_personnages.libelle, "Fiches des personnages");
    assert.deepEqual(SECTIONS_D_OUVERTURE, [
      "synthese",
      "fiche_projet",
      "fiches_personnages",
      "episodes",
    ]);
    assert.equal(
      ORDRE_SECTIONS.indexOf("fiches_personnages"),
      ORDRE_SECTIONS.indexOf("fiche_projet") + 1,
    );
  });

  it("l'écran la laisse décochée : elle ne part que si on la demande", () => {
    assert.deepEqual(SECTIONS_NON_COCHEES, ["fiches_personnages"]);
    const selection = lire("src/app/(app)/projets/[id]/dossier/selection.tsx");
    assert.ok(selection.includes("option.disponible && !option.decochee"));
    const page = lire("src/app/(app)/projets/[id]/dossier/page.tsx");
    assert.ok(page.includes("decochee: SECTIONS_NON_COCHEES.includes(code)"));
  });

  it("pour un documentaire, la case dit que ces fiches décrivent des personnes réelles", () => {
    assert.match(AVERTISSEMENT_FICHES_DOCUMENTAIRE, /personnes réelles/);
    const page = lire("src/app/(app)/projets/[id]/dossier/page.tsx");
    assert.ok(
      page.includes('projet.format === "documentaire" ? AVERTISSEMENT_FICHES_DOCUMENTAIRE'),
    );
  });
});
