/**
 * Exports PDF (lot M1), Word (lot M3) et ZIP (lot M5) : de la tâche réclamée
 * au fichier déposé, contre la base locale et sous le rôle du worker.
 *
 * Aucun fournisseur n'est en jeu : l'export ne coûte rien et n'appelle
 * personne. Les fichiers sont réellement fabriqués ; leur contenu se vérifie
 * sur le plan du dossier, que la mise en page ne fait que dessiner, et, pour
 * le Word, le classeur Excel et l'archive, dans le XML qu'ils contiennent.
 * Qu'un tableur ouvre ces classeurs ne se vérifie pas ici : aucun n'est
 * installé sur les postes de test.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import { lireContexteExport, purgerExports } from "../worker/src/base.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { nomSur, rendreArchive } from "../worker/src/exports/archive.ts";
import { rendreDocx } from "../worker/src/exports/docx.ts";
import { composerDossier } from "../worker/src/exports/dossier.ts";
import { executeursExport, TAILLE_MAX_EXPORT } from "../worker/src/exports/executeur.ts";
import { rendrePdf } from "../worker/src/exports/pdf.ts";
import { date, montant, nombre, rendreXlsx, texte } from "../worker/src/exports/xlsx.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
} from "./helpers.mjs";

/** Contenu d'essai, tel que la base le remettrait pour une demande complète. */
function contenuComplet() {
  return {
    demande: {
      sections: ["budget", "fiche_projet", "financements", "planning", "synthese"],
      documents: ["note_intention"],
    },
    fiche: { titre: "Mɔ́ŋ ma Ɛyɔ", format: "long_metrage", etape: "ecriture" },
    synthese: { pitch: "Une pêcheuse défend sa plage.", synopsis: "À Kribi, la mer nourrit." },
    fiche_projet: {
      genre: "drame",
      pays: ["CM", "SN"],
      langues: "Batanga, français",
      duree: 95,
      synopsis_court: "Une pêcheuse refuse de vendre sa plage.",
      theme: "La transmission",
      enjeux: "Perdre la plage, c'est perdre le village.",
      vision: "Caméra à l'épaule, lumière naturelle.",
      objectifs: "",
      public: "Tout public, festivals et salles.",
      personnages: [
        { nom: "Ɛyɔ", role: "principal", description: "Pêcheuse, quarante ans.\nNe cède rien." },
        { nom: "Le promoteur", role: "secondaire", description: "" },
      ],
    },
    documents: [
      { type: "note_intention", titre: "Note d'intention", contenu: "Pourquoi ce film." },
      { type: "note_intention", titre: "Note vide", contenu: "   " },
    ],
    budget: {
      devise: "XAF",
      lignes: [
        {
          poste: "developpement",
          libelle: "Écriture",
          quantite: 1,
          cout_unitaire: 4500000,
          total: 4500000,
        },
        {
          poste: "developpement",
          libelle: "Repérages",
          quantite: 2,
          cout_unitaire: 850000,
          total: 1700000,
        },
        {
          poste: "postproduction",
          libelle: "Montage",
          quantite: 1,
          cout_unitaire: 3000000,
          total: 3000000,
        },
      ],
    },
    financements: [
      {
        organisme: "Fonds Image",
        programme: "Développement",
        type: "aide_publique",
        statut: "deposee",
        devise: "EUR",
        demande: 25000,
        accorde: null,
        echeance: "2027-03-01",
      },
      {
        organisme: "Ministère",
        programme: "",
        type: "aide_publique",
        statut: "acceptee",
        devise: "XAF",
        demande: 15000000,
        accorde: 12000000,
        echeance: null,
      },
    ],
    planning: [
      {
        titre: "Écriture",
        phase: "ecriture",
        debut: "2026-11-01",
        fin: "2027-01-15",
        statut: "en_cours",
      },
      { titre: "Dépôt", phase: "developpement", debut: null, fin: "2027-03-12", statut: "a_faire" },
    ],
  };
}

/**
 * Cellules d'un tableau. `Intl` sépare les milliers par une espace fine
 * insécable : elle est ramenée à une espace ordinaire, pour que les valeurs
 * attendues restent lisibles.
 */
const cellules = (section) =>
  section.blocs
    .find((bloc) => bloc.type === "tableau")
    .lignes.map((ligne) => ligne.cellules.map((cellule) => cellule.replace(/[  ]/g, " ")));

/** Tous les tableaux d'une section, dans l'ordre : la fiche en a deux. */
const tableaux = (section) =>
  section.blocs
    .filter((bloc) => bloc.type === "tableau")
    .map((bloc) => bloc.lignes.map((ligne) => ligne.cellules));

/** Une fiche où rien n'est renseigné. */
function ficheVide() {
  return {
    genre: null,
    pays: [],
    langues: " ",
    duree: null,
    synopsis_court: "",
    theme: "",
    enjeux: "",
    vision: " \n ",
    objectifs: "",
    public: "",
    personnages: [],
  };
}

/**
 * Fichiers d'une archive ZIP, lus en-tête local après en-tête local : de quoi
 * vérifier un DOCX sans dépendance. Les entrées compressées le sont par
 * « deflate » (méthode 8), les autres sont rangées telles quelles.
 */
function lireArchive(archive) {
  return new Map(
    [...lireEntrees(archive)].map(([nom, donnees]) => [nom, donnees.toString("utf8")]),
  );
}

/** Les mêmes fichiers, en octets : une archive peut en contenir d'autres. */
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

/**
 * Feuille d'un classeur, cellule par cellule : `{ A1: "Poste", C2: 1 }`. Un
 * texte est relu dans la table des textes partagés, un nombre tel quel.
 */
function lireFeuille(classeur) {
  const parties = lireArchive(classeur);
  const textes = [
    ...parties.get("xl/sharedStrings.xml").matchAll(/<si><t[^>]*>([\s\S]*?)<\/t><\/si>/g),
  ].map((m) => m[1]);
  const cellules = {};
  for (const [, reference, attributs, valeur] of parties
    .get("xl/worksheets/sheet1.xml")
    .matchAll(/<c r="([A-Z]+\d+)"([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
    cellules[reference] = /t="s"/.test(attributs) ? textes[Number(valeur)] : Number(valeur);
  }
  return { cellules, parties };
}

describe("Dossier : composition", () => {
  const dossier = composerDossier(contenuComplet(), new Date("2026-10-01T12:00:00Z"));
  const section = (titre) => dossier.sections.find((s) => s.titre === titre);

  it("place les sections dans l'ordre d'un dossier de film", () => {
    assert.deepEqual(
      dossier.sections.map((s) => s.titre),
      [
        "Synthèse",
        "Fiche du projet",
        "Note d'intention",
        "Budget prévisionnel",
        "Plan de financement",
        "Planning",
      ],
    );
    assert.equal(dossier.titre, "Mɔ́ŋ ma Ɛyɔ");
    assert.equal(dossier.sousTitre, "Long métrage · Écriture");
    assert.equal(dossier.date, "Dossier établi le 1er octobre 2026");
  });

  it("présente la fiche dans l'ordre de l'assistant, sans ses champs vides", () => {
    const fiche = section("Fiche du projet");
    assert.deepEqual(
      fiche.blocs.map((bloc) => (bloc.type === "intertitre" ? bloc.texte : bloc.type)),
      [
        "tableau",
        "Synopsis court",
        "texte",
        "Thème",
        "texte",
        "Personnages",
        "tableau",
        "Enjeux",
        "texte",
        "Vision artistique",
        "texte",
        // Les objectifs, laissés vides, n'apparaissent pas.
        "Public cible",
        "texte",
      ],
    );

    const [reperes, personnages] = tableaux(fiche);
    assert.deepEqual(reperes, [
      ["Genre", "Drame"],
      ["Durée", "95 minutes"],
      ["Pays de production", "Cameroun (principal), Sénégal"],
      ["Langues", "Batanga, français"],
    ]);
    assert.deepEqual(personnages, [
      ["Ɛyɔ", "Principal", "Pêcheuse, quarante ans.\nNe cède rien."],
      ["Le promoteur", "Secondaire", ""],
    ]);
  });

  it("omet une fiche où rien n'est renseigné", () => {
    const vide = composerDossier(
      {
        demande: { sections: ["fiche_projet"], documents: [] },
        fiche: { titre: "Projet nu", format: "documentaire", etape: "idee" },
        fiche_projet: ficheVide(),
      },
      new Date("2026-10-02T12:00:00Z"),
    );
    assert.deepEqual(vide.sections, []);
  });

  it("ne dit un pays principal que s'il y en a plusieurs, et garde lisible un code inconnu", () => {
    const dossierSeul = composerDossier(
      {
        demande: { sections: ["fiche_projet"], documents: [] },
        fiche: { titre: "Projet", format: "court_metrage", etape: "idee" },
        fiche_projet: {
          ...ficheVide(),
          genre: "western_spaghetti",
          pays: ["CM"],
          duree: 1,
          personnages: [{ nom: "Figurante", role: "silhouette", description: "" }],
        },
      },
      new Date("2026-10-02T12:00:00Z"),
    );
    const [reperes, personnages] = tableaux(dossierSeul.sections[0]);
    assert.deepEqual(reperes, [
      ["Genre", "western spaghetti"],
      ["Durée", "1 minute"],
      ["Pays de production", "Cameroun"],
    ]);
    assert.deepEqual(personnages, [["Figurante", "silhouette", ""]]);

    // Un code sans nom français reste un code, plutôt que de disparaître.
    const sansNom = composerDossier(
      {
        demande: { sections: ["fiche_projet"], documents: [] },
        fiche: { titre: "Projet", format: "court_metrage", etape: "idee" },
        fiche_projet: { ...ficheVide(), pays: ["QQ", "CM"] },
      },
      new Date("2026-10-02T12:00:00Z"),
    );
    assert.deepEqual(tableaux(sansNom.sections[0])[0], [
      ["Pays de production", "QQ (principal), Cameroun"],
    ]);
  });

  it("nomme un document par son titre, sous son type ; un document vide est omis", () => {
    assert.equal(section("Note d'intention").surTitre, "Note d'intention");
    assert.equal(section("Note vide"), undefined);
  });

  it("groupe le budget par poste, avec sous-totaux et total", () => {
    assert.deepEqual(cellules(section("Budget prévisionnel")), [
      ["Développement et écriture", "", "", "6 200 000"],
      ["Écriture", "1", "4 500 000", "4 500 000"],
      ["Repérages", "2", "850 000", "1 700 000"],
      ["Postproduction", "", "", "3 000 000"],
      ["Montage", "1", "3 000 000", "3 000 000"],
      ["Total", "", "", "9 200 000"],
    ]);
  });

  it("totalise les financements par devise, sans additionner des monnaies différentes", () => {
    const lignes = cellules(section("Plan de financement"));
    assert.deepEqual(lignes[0], [
      "Fonds Image — Développement\nÉchéance : 1er mars 2027",
      "Aide publique",
      "Déposée",
      "25 000 EUR",
      "—",
    ]);
    // Rien d'accordé en euros : pas de somme, plutôt qu'un zéro.
    assert.deepEqual(lignes.at(-2), ["Total EUR", "", "", "25 000 EUR", "—"]);
    assert.deepEqual(lignes.at(-1), ["Total XAF", "", "", "15 000 000 XAF", "12 000 000 XAF"]);
  });

  it("écrit les périodes du planning en clair", () => {
    assert.deepEqual(cellules(section("Planning")), [
      ["Écriture", "Écriture", "1er novembre 2026 – 15 janvier 2027", "En cours"],
      ["Dépôt", "Développement", "jusqu'au 12 mars 2027", "À faire"],
    ]);
  });

  it("omet sans mention une section demandée mais vide", () => {
    const vide = composerDossier(
      {
        demande: {
          sections: ["budget", "fiche_projet", "financements", "planning", "synthese"],
          documents: [],
        },
        fiche: { titre: "Projet nu", format: "documentaire", etape: "idee" },
        synthese: { pitch: "", synopsis: " " },
        fiche_projet: ficheVide(),
        budget: null,
        financements: [],
        planning: [],
      },
      new Date("2026-10-02T12:00:00Z"),
    );
    assert.deepEqual(vide.sections, []);
  });

  it("garde lisible un code que le worker ne connaît pas", () => {
    const inconnu = composerDossier(
      {
        demande: { sections: ["synthese"], documents: [] },
        fiche: { titre: "Projet", format: "realite_virtuelle", etape: "idee" },
        synthese: { pitch: "Un pitch.", synopsis: "" },
      },
      new Date("2026-10-02T12:00:00Z"),
    );
    assert.equal(inconnu.sousTitre, "realite virtuelle · Idée");
  });
});

describe("Dossier : mise en page", () => {
  it("fabrique un PDF, une page de garde puis une page par section au moins", async () => {
    const dossier = composerDossier(contenuComplet(), new Date("2026-10-01T12:00:00Z"));
    const { fichier, pages } = await rendrePdf(dossier);
    assert.equal(fichier.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(pages, 1 + dossier.sections.length);
    assert.ok(fichier.length < TAILLE_MAX_EXPORT);
  });

  it("pagine un long document et un long tableau sans rien perdre", async () => {
    const contenu = contenuComplet();
    contenu.documents[0].contenu = Array.from(
      { length: 400 },
      (_, i) => `Paragraphe ${i + 1}. La mer n'attend personne, et Ɛyɔ le sait.`,
    ).join("\n\n");
    contenu.budget.lignes = Array.from({ length: 120 }, (_, i) => ({
      poste: "equipe_technique",
      libelle: `Ligne ${i + 1}`,
      quantite: 1,
      cout_unitaire: 1000,
      total: 1000,
    }));
    const dossier = composerDossier(contenu, new Date("2026-10-01T12:00:00Z"));
    const { pages } = await rendrePdf(dossier);
    assert.ok(pages > 1 + dossier.sections.length + 4, `${pages} pages`);
  });
});

describe("Dossier : Word", () => {
  it("fabrique une archive DOCX lisible : contenu, styles et pied de page", async () => {
    const dossier = composerDossier(contenuComplet(), new Date("2026-10-01T12:00:00Z"));
    const fichier = await rendreDocx(dossier);
    assert.equal(fichier.subarray(0, 4).toString("hex"), "504b0304");
    assert.ok(fichier.length < TAILLE_MAX_EXPORT);

    const archive = lireArchive(fichier);
    for (const partie of ["[Content_Types].xml", "word/document.xml", "word/styles.xml"]) {
      assert.ok(archive.has(partie), partie);
    }
    const document = archive.get("word/document.xml");
    // Les lettres d'une langue africaine traversent intactes.
    assert.ok(document.includes("Mɔ́ŋ ma Ɛyɔ"));
    for (const section of dossier.sections) {
      assert.ok(
        document.includes(section.titre.replace("'", "&apos;")) || document.includes(section.titre),
        section.titre,
      );
    }
    // La fiche : ses repères et ses personnages, lettres africaines comprises.
    for (const attendu of [
      "Cameroun (principal), Sénégal",
      "95 minutes",
      "Le promoteur",
      ">Ɛyɔ<",
    ]) {
      assert.ok(document.includes(attendu), attendu);
    }
    // De vrais titres, et de vrais tableaux à en-tête répété.
    assert.match(document, /w:pStyle w:val="Heading1"/);
    assert.match(document, /<w:tbl>/);
    assert.match(document, /<w:tblHeader\/>/);
    // Montants groupés comme à l'écran, espaces insécables comprises.
    assert.ok(document.replace(/[  ]/g, " ").includes("9 200 000"));

    // Numéro de page et nombre de pages : des champs, que Word recalcule.
    const pieds = [...archive.keys()].filter((nom) => /^word\/footer\d+\.xml$/.test(nom));
    assert.ok(
      pieds.some((nom) => /PAGE/.test(archive.get(nom)) && /NUMPAGES/.test(archive.get(nom))),
    );
  });

  it("rend un retour à la ligne dans une cellule par un vrai retour, pas par une espace", async () => {
    const dossier = composerDossier(contenuComplet(), new Date("2026-10-01T12:00:00Z"));
    const document = lireArchive(await rendreDocx(dossier)).get("word/document.xml");

    // Laissé dans le texte, un retour brut s'afficherait comme une espace.
    assert.doesNotMatch(document, /<w:t(?: [^>]*)?>[^<]*\n/);

    // Les deux lignes restent dans la même cellule, séparées par un retour.
    const separes = (avant, apres) => {
      const debut = document.indexOf(avant);
      const fin = document.indexOf(apres);
      assert.ok(debut >= 0 && fin > debut, `« ${avant} » puis « ${apres} »`);
      const entre = document.slice(debut + avant.length, fin);
      assert.equal(entre.split("<w:br/>").length - 1, 1, `un retour après « ${avant} »`);
      assert.doesNotMatch(entre, /<\/w:tc>/, `« ${apres} » dans la même cellule`);
    };
    separes("Pêcheuse, quarante ans.", "Ne cède rien.");
    separes("Fonds Image — Développement", "Échéance : 1er mars 2027");
  });

  it("garde un long document et un long tableau sans rien perdre", async () => {
    const contenu = contenuComplet();
    contenu.documents[0].contenu = Array.from(
      { length: 400 },
      (_, i) => `Paragraphe ${i + 1}. La mer n'attend personne.`,
    ).join("\n\n");
    contenu.budget.lignes = Array.from({ length: 120 }, (_, i) => ({
      poste: "equipe_technique",
      libelle: `Ligne ${i + 1}`,
      quantite: 1,
      cout_unitaire: 1000,
      total: 1000,
    }));
    const dossier = composerDossier(contenu, new Date("2026-10-01T12:00:00Z"));
    const document = lireArchive(await rendreDocx(dossier)).get("word/document.xml");
    assert.ok(document.includes("Paragraphe 400."));
    assert.ok(document.includes("Ligne 120"));
  });
});

describe("Dossier : classeur Excel", () => {
  const feuille = {
    nom: "Budget",
    colonnes: [
      { titre: "Ligne", largeur: 30 },
      { titre: "Quantité", largeur: 12 },
      { titre: "Total", largeur: 20 },
      { titre: "Échéance", largeur: 14 },
    ],
    lignes: [
      [texte("Écriture"), nombre(12.5), montant(4500000), date("2027-03-01")],
      [texte("Total", true), null, montant(4500000.5, true), null],
    ],
  };

  it("fabrique un classeur complet : ses six fichiers, sans entrée de dossier", async () => {
    const classeur = await rendreXlsx(feuille);
    assert.equal(classeur.subarray(0, 4).toString("hex"), "504b0304");
    assert.deepEqual(
      [...lireEntrees(classeur).keys()],
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/workbook.xml",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/sharedStrings.xml",
        "xl/worksheets/sheet1.xml",
      ],
    );

    const { parties } = lireFeuille(classeur);
    assert.match(parties.get("xl/workbook.xml"), /<sheet name="Budget" sheetId="1" r:id="rId1"\/>/);
    // Chaque fichier du classeur est déclaré, et relié.
    for (const partie of ["workbook", "worksheets/sheet1", "styles", "sharedStrings"]) {
      assert.ok(parties.get("[Content_Types].xml").includes(`/xl/${partie}.xml`), partie);
    }
    for (const cible of ["worksheets/sheet1.xml", "styles.xml", "sharedStrings.xml"]) {
      assert.ok(parties.get("xl/_rels/workbook.xml.rels").includes(`Target="${cible}"`), cible);
    }
  });

  it("range un nombre en nombre, une date en date, un texte en texte", async () => {
    const { cellules, parties } = lireFeuille(await rendreXlsx(feuille));
    assert.deepEqual(cellules, {
      A1: "Ligne",
      B1: "Quantité",
      C1: "Total",
      D1: "Échéance",
      A2: "Écriture",
      B2: 12.5,
      C2: 4500000,
      // Le 1er mars 2027, en jours depuis le 30 décembre 1899.
      D2: 46447,
      A3: "Total",
      C3: 4500000.5,
    });

    const feuilleXml = parties.get("xl/worksheets/sheet1.xml");
    // Un montant porte son format, une date le sien, un total est en gras.
    assert.match(feuilleXml, /<c r="C2" s="2"><v>4500000<\/v><\/c>/);
    assert.match(feuilleXml, /<c r="D2" s="4"><v>46447<\/v><\/c>/);
    assert.match(feuilleXml, /<c r="A3" t="s" s="1">/);
    assert.match(feuilleXml, /<c r="C3" s="3">/);
    // Une cellule vide n'est pas écrite.
    assert.doesNotMatch(feuilleXml, /r="B3"|r="D3"/);
  });

  it("ne laisse rien d'un texte devenir une formule, une balise ou un caractère interdit", async () => {
    const pieges = [
      "=1+1",
      "+SUM(A1:A9)",
      "@commande",
      '<script>alert("x")</script> & co',
      "avant\u0000\u0008\u001Fapres",
      "ligne 1\r\nligne 2",
    ];
    const classeur = await rendreXlsx({
      nom: "Pièges",
      colonnes: [{ titre: "Texte", largeur: 30 }],
      lignes: pieges.map((piege) => [texte(piege)]),
    });
    const { cellules, parties } = lireFeuille(classeur);
    const feuilleXml = parties.get("xl/worksheets/sheet1.xml");
    const textesXml = parties.get("xl/sharedStrings.xml");

    // Aucune formule dans la feuille ; chaque piège est un texte partagé.
    assert.doesNotMatch(feuilleXml, /<f>|<f /);
    for (let ligne = 2; ligne <= pieges.length + 1; ligne += 1) {
      assert.match(feuilleXml, new RegExp(`<c r="A${ligne}" t="s" `), `A${ligne}`);
    }
    assert.equal(cellules.A2, "=1+1");
    assert.equal(cellules.A3, "+SUM(A1:A9)");
    assert.equal(cellules.A5, "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    assert.equal(cellules.A6, "avantapres");
    assert.equal(cellules.A7, "ligne 1\nligne 2");
    // Rien d'interdit en XML ne subsiste, et aucune balise n'est née du texte.
    assert.doesNotMatch(textesXml, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    assert.doesNotMatch(textesXml, /<script/);
  });

  it("écrit telle quelle une date illisible, et ignore un nombre qui n'en est pas un", async () => {
    const { cellules } = lireFeuille(
      await rendreXlsx({
        nom: "Limites",
        colonnes: [
          { titre: "Date", largeur: 14 },
          { titre: "Nombre", largeur: 14 },
        ],
        lignes: [
          [date("2027-02-31"), nombre(Number.NaN)],
          [date("bientôt"), nombre(Number.POSITIVE_INFINITY)],
        ],
      }),
    );
    assert.deepEqual(cellules, { A1: "Date", B1: "Nombre", A2: "2027-02-31", A3: "bientôt" });
  });

  it("donne à l'onglet un nom qu'Excel admet", async () => {
    const { parties } = lireFeuille(
      await rendreXlsx({
        nom: "Budget [v2] : coûts/recettes d'un très long métrage ?",
        colonnes: [{ titre: "A", largeur: 10 }],
        lignes: [],
      }),
    );
    const nom = /<sheet name="([^"]*)"/.exec(parties.get("xl/workbook.xml"))[1];
    assert.ok(nom.length <= 31, nom);
    assert.doesNotMatch(nom, /[[\]:*?/\\]/);
  });
});

describe("Dossier : archive ZIP", () => {
  const fabriquer = async (contenu = contenuComplet()) => {
    const dossier = composerDossier(contenu, new Date("2026-10-01T12:00:00Z"));
    return lireEntrees(await rendreArchive(dossier, contenu));
  };
  /** Les fichiers d'une archive, sans ses entrées de dossier. */
  const fichiersDe = (entrees) => [...entrees.keys()].filter((nom) => !nom.endsWith("/"));

  it("range un fichier Word par texte et un classeur par tableau, dans l'ordre du dossier", async () => {
    const contenu = contenuComplet();
    const dossier = composerDossier(contenu, new Date("2026-10-01T12:00:00Z"));
    const archive = await rendreArchive(dossier, contenu);
    assert.equal(archive.subarray(0, 4).toString("hex"), "504b0304");
    assert.ok(archive.length < TAILLE_MAX_EXPORT);

    const entrees = lireEntrees(archive);
    // La note vide est omise, comme dans un dossier.
    assert.deepEqual(fichiersDe(entrees), [
      "presentation.docx",
      "documents/01-note-d-intention-note-d-intention.docx",
      "budget.xlsx",
      "plan-de-financement.xlsx",
      "planning.xlsx",
    ]);
    for (const nom of fichiersDe(entrees)) {
      assert.equal(entrees.get(nom).subarray(0, 4).toString("hex"), "504b0304", nom);
    }
  });

  it("sépare la présentation des documents : chacun dans son fichier", async () => {
    const entrees = await fabriquer();
    const presentation = lireArchive(entrees.get("presentation.docx")).get("word/document.xml");
    const note = lireArchive(
      entrees.get("documents/01-note-d-intention-note-d-intention.docx"),
    ).get("word/document.xml");

    assert.ok(presentation.includes("Une pêcheuse défend sa plage."));
    assert.ok(presentation.includes("Cameroun (principal), Sénégal"));
    assert.ok(
      !presentation.includes("Pourquoi ce film."),
      "la note n'est pas dans la présentation",
    );
    assert.ok(!presentation.includes("Budget prévisionnel"), "ni le budget");

    assert.ok(note.includes("Pourquoi ce film."));
    assert.ok(
      !note.includes("Une pêcheuse défend sa plage."),
      "la synthèse n'est pas dans la note",
    );
    // Chaque fichier garde la page de garde du projet.
    assert.ok(note.includes("Mɔ́ŋ ma Ɛyɔ"));
  });

  it("écrit le budget en nombres, avec son total", async () => {
    const { cellules } = lireFeuille((await fabriquer()).get("budget.xlsx"));
    assert.deepEqual(
      [cellules.A1, cellules.B1, cellules.C1, cellules.D1, cellules.E1],
      ["Poste", "Ligne", "Quantité", "Coût unitaire (XAF)", "Total (XAF)"],
    );
    assert.deepEqual(
      [cellules.A2, cellules.B2, cellules.C2, cellules.D2, cellules.E2],
      ["Développement et écriture", "Écriture", 1, 4500000, 4500000],
    );
    assert.deepEqual([cellules.B3, cellules.C3, cellules.E3], ["Repérages", 2, 1700000]);
    assert.deepEqual([cellules.A4, cellules.B4], ["Postproduction", "Montage"]);
    assert.deepEqual([cellules.A5, cellules.E5], ["Total", 9200000]);
  });

  it("totalise le plan de financement par devise, sans additionner des monnaies différentes", async () => {
    const { cellules } = lireFeuille((await fabriquer()).get("plan-de-financement.xlsx"));
    assert.deepEqual(
      ["A", "B", "C", "D", "E", "F", "G", "H"].map((colonne) => cellules[`${colonne}2`]),
      ["Fonds Image", "Développement", "Aide publique", "Déposée", "EUR", 25000, undefined, 46447],
    );
    // Sans programme ni échéance : cellules vides, pas de tiret.
    assert.deepEqual(
      ["A", "B", "E", "F", "G", "H"].map((colonne) => cellules[`${colonne}3`]),
      ["Ministère", undefined, "XAF", 15000000, 12000000, undefined],
    );
    // Rien d'accordé en euros : pas de somme, plutôt qu'un zéro.
    assert.deepEqual(
      ["A", "E", "F", "G"].map((colonne) => cellules[`${colonne}4`]),
      ["Total EUR", "EUR", 25000, undefined],
    );
    assert.deepEqual(
      ["A", "E", "F", "G"].map((colonne) => cellules[`${colonne}5`]),
      ["Total XAF", "XAF", 15000000, 12000000],
    );
  });

  it("écrit le planning avec de vraies dates", async () => {
    const { cellules } = lireFeuille((await fabriquer()).get("planning.xlsx"));
    assert.deepEqual(
      ["A", "B", "C", "D", "E"].map((colonne) => cellules[`${colonne}1`]),
      ["Étape", "Phase", "Début", "Fin", "Statut"],
    );
    // 1er novembre 2026 et 15 janvier 2027, en numéros de série.
    assert.deepEqual(
      ["A", "B", "C", "D", "E"].map((colonne) => cellules[`${colonne}2`]),
      ["Écriture", "Écriture", 46327, 46402, "En cours"],
    );
    assert.deepEqual([cellules.A3, cellules.C3, cellules.D3], ["Dépôt", undefined, 46458]);
  });

  it("n'y met que ce que le dossier retient : une pièce demandée mais vide est omise", async () => {
    const contenu = contenuComplet();
    contenu.budget.lignes = [];
    contenu.planning = [];
    delete contenu.financements;
    delete contenu.fiche_projet;
    assert.deepEqual(fichiersDe(await fabriquer(contenu)), [
      "presentation.docx",
      "documents/01-note-d-intention-note-d-intention.docx",
    ]);

    const sansTexte = contenuComplet();
    delete sansTexte.synthese;
    delete sansTexte.fiche_projet;
    sansTexte.documents = [];
    assert.deepEqual(fichiersDe(await fabriquer(sansTexte)), [
      "budget.xlsx",
      "plan-de-financement.xlsx",
      "planning.xlsx",
    ]);
  });

  it("numérote les documents : deux titres identiques ne se recouvrent pas", async () => {
    const contenu = contenuComplet();
    contenu.documents = [
      { type: "note_intention", titre: "Note", contenu: "Première." },
      { type: "note_intention", titre: "Note", contenu: "Seconde." },
      { type: "scenario", titre: "../../etc/passwd", contenu: "Rien à voir." },
    ];
    const noms = fichiersDe(await fabriquer(contenu)).filter((nom) => nom.startsWith("documents/"));
    assert.deepEqual(noms, [
      "documents/01-note-d-intention-note.docx",
      "documents/02-note-d-intention-note.docx",
      "documents/03-scenario-etc-passwd.docx",
    ]);
  });

  it("réduit un titre à un nom de fichier sûr, sans séparateur de dossier", () => {
    assert.equal(nomSur("Note d'intention — Été 2027"), "note-d-intention-ete-2027");
    assert.equal(nomSur("../../secret\\fichier:nom"), "secret-fichier-nom");
    assert.equal(nomSur("  ...  "), "");
    assert.ok(nomSur("x".repeat(200)).length <= 60);
    for (const titre of ["a/b", "a\\b", "..", "C:\\Windows", "Mɔ́ŋ ma Ɛyɔ"]) {
      assert.match(nomSur(titre), /^[a-z0-9-]*$/, titre);
    }
  });
});

describe("Export PDF : worker", () => {
  let base;
  const journal = [];

  before(async () => {
    base = await ouvrirBaseDuWorker();
  });

  after(async () => {
    await base.end();
  });

  function options(executeurs = executeursExport(base)) {
    return {
      base,
      nom: "worker-export-test",
      executeurs,
      journal: (evenement) => journal.push(evenement),
      battementMs: 50,
    };
  }

  async function preparer(
    prefixe,
    demande,
    { documents = [], budget = true, action = "pdf_export" } = {},
  ) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, `Les Eaux de ${prefixe}`);
    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Un pitch.", synopsis: "Un synopsis." })
      .eq("id", projet.id);
    assert.ifError(error);

    if (documents.length) {
      const { error: ajout } = await porteur.client.from("project_documents").insert(
        documents.map((document) => ({
          project_id: projet.id,
          created_by: porteur.id,
          ...document,
        })),
      );
      assert.ifError(ajout);
    }
    if (budget) {
      const { error: ouverture } = await porteur.client
        .from("project_budgets")
        .insert({ project_id: projet.id, currency: "XAF" });
      assert.ifError(ouverture);
      const { error: ligne } = await porteur.client.from("budget_lines").insert({
        project_id: projet.id,
        category: "developpement",
        label: "Écriture",
        quantity: 1,
        unit_cost: 2_500_000,
        created_by: porteur.id,
      });
      assert.ifError(ligne);
    }

    const tache = await engager(porteur, projet.id, action, `${prefixe}-cle`, demande);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return { porteur, projet, tache };
  }

  async function etat(porteur, tache) {
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, attempts, reason, reservation_id")
      .eq("id", tache.id)
      .single();
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .maybeSingle();
    const { data: exports } = await porteur.client
      .from("project_exports")
      .select("id, format, pages, size_bytes, params, content_fingerprint, file")
      .eq("job_id", tache.id);
    return { travail, reglement, exports };
  }

  it("sait exécuter l'export PDF, l'export Word et l'export ZIP, sans aucune clé", () => {
    assert.deepEqual(Object.keys(executeursExport(base)), [
      "pdf_export",
      "docx_export",
      "zip_export",
    ]);
  });

  it("succès : le PDF est déposé, la tâche conclue, l'unité consommée", async () => {
    const { porteur, tache } = await preparer(
      "export-succes",
      { sections: ["synthese", "budget"], documents: ["note_intention"] },
      {
        documents: [
          {
            type: "note_intention",
            title: "Note finale",
            content: "Le texte.",
            status: "finalise",
          },
        ],
      },
    );

    assert.equal(await traiterUnTravail(options()), true);

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.deepEqual([travail.state, travail.attempts], ["succeeded", 1]);
    assert.deepEqual(reglement, { consumed: 1, released: 0 });
    assert.equal(exports.length, 1);
    // Garde, synthèse, note, budget.
    assert.equal(exports[0].pages, 4);
    assert.match(exports[0].file, /^\\x255044462d/);
    assert.equal(exports[0].size_bytes, (exports[0].file.length - 2) / 2);
    assert.deepEqual(exports[0].params, {
      sections: ["budget", "synthese"],
      documents: ["note_intention"],
    });
    assert.match(exports[0].content_fingerprint, /^[0-9a-f]{64}$/);
  });

  it("succès en Word : l'archive est déposée sans nombre de pages, l'unité consommée", async () => {
    const { porteur, tache } = await preparer(
      "export-word",
      { sections: ["synthese", "budget"] },
      { action: "docx_export" },
    );
    assert.equal(tache.action, "docx_export");

    assert.equal(await traiterUnTravail(options()), true);

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.deepEqual([travail.state, travail.attempts], ["succeeded", 1]);
    assert.deepEqual(reglement, { consumed: 1, released: 0 });
    assert.equal(exports.length, 1);
    assert.equal(exports[0].format, "docx");
    assert.equal(exports[0].pages, null);
    assert.match(exports[0].file, /^\\x504b0304/);

    const archive = lireArchive(Buffer.from(exports[0].file.slice(2), "hex"));
    const document = archive.get("word/document.xml");
    assert.ok(document.includes("Les Eaux de export-word"));
    assert.ok(document.includes("Budget prévisionnel"));
  });

  it("succès en ZIP : l'archive est déposée sans nombre de pages, l'unité consommée", async () => {
    const { porteur, tache } = await preparer(
      "export-zip",
      { sections: ["synthese", "budget"], documents: ["note_intention"] },
      {
        action: "zip_export",
        documents: [
          {
            type: "note_intention",
            title: "Note finale",
            content: "Le texte.",
            status: "finalise",
          },
        ],
      },
    );
    assert.equal(tache.action, "zip_export");

    assert.equal(await traiterUnTravail(options()), true);

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.deepEqual([travail.state, travail.attempts], ["succeeded", 1]);
    assert.deepEqual(reglement, { consumed: 1, released: 0 });
    assert.equal(exports.length, 1);
    assert.equal(exports[0].format, "zip");
    assert.equal(exports[0].pages, null);
    assert.match(exports[0].file, /^\\x504b0304/);
    assert.deepEqual(exports[0].params, {
      sections: ["budget", "synthese"],
      documents: ["note_intention"],
    });

    // Du contenu de la base jusque dans les fichiers de l'archive.
    const entrees = lireEntrees(Buffer.from(exports[0].file.slice(2), "hex"));
    assert.deepEqual(
      [...entrees.keys()].filter((nom) => !nom.endsWith("/")),
      ["presentation.docx", "documents/01-note-d-intention-note-finale.docx", "budget.xlsx"],
    );
    assert.ok(
      lireArchive(entrees.get("presentation.docx")).get("word/document.xml").includes("Un pitch."),
    );
    const { cellules } = lireFeuille(entrees.get("budget.xlsx"));
    assert.deepEqual(
      [cellules.B2, cellules.C2, cellules.D2, cellules.E2, cellules.E3],
      ["Écriture", 1, 2500000, 2500000, 2500000],
    );
  });

  it("ne reçoit que les sections demandées, et que les documents finalisés", async () => {
    const { tache } = await preparer(
      "export-contenu",
      { sections: ["synthese"], documents: ["note_intention", "scenario"] },
      {
        documents: [
          { type: "note_intention", title: "Note finale", content: "Finale.", status: "finalise" },
          {
            type: "note_intention",
            title: "Note brouillon",
            content: "Brouillon.",
            status: "brouillon",
          },
          { type: "scenario", title: "Scénario", content: "INT. JOUR", status: "en_relecture" },
          { type: "lettre", title: "Lettre", content: "Madame.", status: "finalise" },
        ],
      },
    );

    // L'exécuteur d'origine, précédé d'un regard sur ce que la base lui remet.
    let remis;
    const export_ = executeursExport(base).pdf_export;
    const executeurs = {
      pdf_export: async (travail, signal) => {
        remis = await lireContexteExport(base, travail.attemptId);
        return export_(travail, signal);
      },
    };
    assert.equal(await traiterUnTravail(options(executeurs)), true);

    assert.equal(tache.action, "pdf_export");
    assert.deepEqual(
      remis.contenu.documents.map((document) => document.titre),
      ["Note finale"],
    );
    assert.equal("budget" in remis.contenu, false, "le budget n'a pas été demandé");
    assert.equal("financements" in remis.contenu, false);
    assert.equal("fiche_projet" in remis.contenu, false, "la fiche n'a pas été demandée");
    assert.deepEqual(Object.keys(remis.contenu.fiche).sort(), ["etape", "format", "titre"]);
  });

  it("avec la fiche : ses repères et ses seuls personnages, dans l'ordre de l'écran, jusque dans le fichier", async () => {
    const { porteur, projet, tache } = await preparer(
      "export-fiche",
      { sections: ["fiche_projet"] },
      { budget: false, action: "docx_export" },
    );
    // Le contenu se lit à l'exécution : la fiche se remplit après la demande.
    const { error: fiche } = await porteur.client
      .from("projects")
      .update({
        genre: "drame",
        countries: ["CM", "SN"],
        duration_minutes: 95,
        theme: "La transmission",
      })
      .eq("id", projet.id);
    assert.ifError(fiche);
    const autre = await creerProjet(porteur, "Un autre film");
    // Mêmes colonnes pour chaque ligne : dans une insertion groupée, l'API met
    // à nul celles qu'une ligne ne nomme pas.
    const personnage = (projetId, name, role, description, position) => ({
      project_id: projetId,
      name,
      role,
      description,
      position,
      created_by: porteur.id,
    });
    const { error: personnages } = await porteur.client
      .from("project_characters")
      .insert([
        personnage(projet.id, "Second venu", "secondaire", "", 2),
        personnage(projet.id, "Première venue", "principal", "Pêcheuse à Kribi.", 1),
        personnage(autre.id, "Personnage d'ailleurs", "principal", "", 0),
      ]);
    assert.ifError(personnages);

    let remis;
    const export_ = executeursExport(base).docx_export;
    const executeurs = {
      docx_export: async (travail, signal) => {
        remis = await lireContexteExport(base, travail.attemptId);
        return export_(travail, signal);
      },
    };
    assert.equal(await traiterUnTravail(options(executeurs)), true);

    assert.deepEqual(
      remis.contenu.fiche_projet.personnages.map((personnage) => personnage.nom),
      ["Première venue", "Second venu"],
    );
    assert.equal("synthese" in remis.contenu, false, "la synthèse n'a pas été demandée");

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.deepEqual([travail.state, travail.attempts], ["succeeded", 1]);
    assert.deepEqual(reglement, { consumed: 1, released: 0 });
    assert.deepEqual(exports[0].params, { sections: ["fiche_projet"], documents: [] });

    const document = lireArchive(Buffer.from(exports[0].file.slice(2), "hex")).get(
      "word/document.xml",
    );
    for (const attendu of [
      "Fiche du projet",
      "Drame",
      "95 minutes",
      "Cameroun (principal), Sénégal",
      "La transmission",
      "Première venue",
      "Pêcheuse à Kribi.",
    ]) {
      assert.ok(document.includes(attendu), attendu);
    }
    assert.ok(
      document.indexOf("Première venue") < document.indexOf("Second venu"),
      "les personnages suivent leur rang",
    );
    for (const absent of ["Personnage d", "Un pitch."]) {
      assert.equal(document.includes(absent), false, absent);
    }
  });

  it("rien à exporter : échec connu, deux essais, l'unité est rendue", async () => {
    const { porteur, tache } = await preparer(
      "export-vide",
      { documents: ["scenario"] },
      { budget: false },
    );

    assert.equal(await traiterUnTravail(options()), true);
    assert.equal(await traiterUnTravail(options()), true);

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.deepEqual([travail.state, travail.attempts], ["failed", 2]);
    assert.equal(travail.reason, "Aucune des sections demandées n'a de contenu à exporter.");
    assert.deepEqual(reglement, { consumed: 0, released: 1 });
    assert.equal(exports.length, 0);
  });

  it("demande invalide : échec connu, sans fichier", async () => {
    const { porteur, tache } = await preparer("export-invalide", { sections: ["storyboard"] });

    assert.equal(await traiterUnTravail(options()), true);
    assert.equal(await traiterUnTravail(options()), true);

    const { travail, reglement, exports } = await etat(porteur, tache);
    assert.equal(travail.state, "failed");
    assert.equal(travail.reason, "La demande d'export ne désigne aucune section connue.");
    assert.deepEqual(reglement, { consumed: 0, released: 1 });
    assert.equal(exports.length, 0);
  });

  it("le journal ne contient ni contenu ni paramètres : des repères seulement", () => {
    const texte = JSON.stringify(journal);
    assert.ok(journal.some((evenement) => evenement.evenement === "tache_reussie"));
    // Ni contenu d'œuvre, ni valeur de paramètre : les messages d'échec, eux,
    // sont des phrases générales.
    for (const interdit of [
      "Un pitch",
      "Un synopsis",
      "Le texte",
      "Finale",
      "Écriture",
      "note_intention",
      "synthese",
      "storyboard",
      "fiche_projet",
      "Première venue",
      "La transmission",
    ]) {
      assert.equal(texte.includes(interdit), false, `« ${interdit} » dans le journal`);
    }
  });

  it("le worker ne lit ni les exports ni le contenu d'un projet : il passe par ses fonctions", async () => {
    await assert.rejects(base.query("select id from public.project_exports"), /permission denied/);
    await assert.rejects(
      base.query("select public.contenu_dossier($1, $2)", [
        crypto.randomUUID(),
        JSON.stringify({ sections: ["budget"] }),
      ]),
      /permission denied/,
    );
    assert.equal(await lireContexteExport(base, crypto.randomUUID()), null);
  });

  it("un lecteur entré dans l'équipe ne lit pas l'export produit", async () => {
    const { porteur, projet, tache } = await preparer("export-lecteur", {
      sections: ["budget"],
    });
    const lecteur = await creerCompte("export-lecteur-invite");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    assert.equal(await traiterUnTravail(options()), true);

    const { exports } = await etat(porteur, tache);
    assert.equal(exports.length, 1);
    const { data } = await lecteur.client.from("project_exports").select("id");
    assert.equal(data.length, 0);
  });

  it("purge : un export expiré disparaît, les autres restent", async () => {
    const { porteur, tache } = await preparer("export-purge", { sections: ["synthese"] });
    assert.equal(await traiterUnTravail(options()), true);
    const avant = await etat(porteur, tache);
    assert.equal(avant.exports.length, 1);

    // Les autres suites peuvent avoir laissé des exports, non expirés.
    const { sortie: restants } = await sql(
      `select count(*) from public.project_exports where id <> '${avant.exports[0].id}';`,
    );
    const vieillir = await sql(`
      update public.project_exports
      set created_at = now() - interval '31 days', expires_at = now() - interval '1 day'
      where id = '${avant.exports[0].id}';
    `);
    assert.equal(vieillir.code, 0, vieillir.erreurs);

    assert.equal(await purgerExports(base), 1);

    const apres = await etat(porteur, tache);
    assert.equal(apres.exports.length, 0);
    assert.equal(apres.travail.state, "succeeded", "la tâche survit à son fichier");
    const { sortie: toujours } = await sql(
      `select count(*) from public.project_exports where id <> '${avant.exports[0].id}';`,
    );
    assert.equal(toujours.trim(), restants.trim());
  });
});
