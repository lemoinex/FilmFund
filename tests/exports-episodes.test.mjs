/**
 * Les épisodes dans les exports (lot SE4) : la section de la saison, l'épisode
 * de chaque scénario, dans le plan du dossier puis dans les trois formats, de
 * la tâche réclamée au fichier déposé — et ce que l'écran en propose.
 *
 * Aucun fournisseur n'est en jeu : l'export ne coûte rien et n'appelle
 * personne. Les fichiers sont réellement fabriqués ; leur contenu se vérifie
 * dans le XML qu'ils contiennent. Qu'un tableur ou un traitement de texte les
 * ouvre ne se vérifie pas ici.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import {
  normaliserDemande,
  ORDRE_SECTIONS,
  SECTIONS,
  SECTIONS_D_OUVERTURE,
  SECTIONS_DE_SERIE,
} from "../src/lib/exports.ts";
import { lireContexteExport } from "../worker/src/base.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { rendreArchive } from "../worker/src/exports/archive.ts";
import { rendreDocx } from "../worker/src/exports/docx.ts";
import { composerDossier } from "../worker/src/exports/dossier.ts";
import { executeursExport } from "../worker/src/exports/executeur.ts";
import { rendrePdf } from "../worker/src/exports/pdf.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  engager,
  executerSqlLocal as sql,
  ouvrirBaseDuWorker,
} from "./helpers.mjs";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

/** Les fichiers d'une archive ZIP, en octets, lus depuis leurs en-têtes locaux. */
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

const lireArchive = (archive) =>
  new Map([...lireEntrees(archive)].map(([nom, donnees]) => [nom, donnees.toString("utf8")]));

/** Feuille d'un classeur, cellule par cellule : un texte relu dans la table partagée, un nombre tel quel. */
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
  return cellules;
}

const JOUR = new Date(Date.UTC(2026, 9, 10));

/** Contenu d'essai, tel que la base le remettrait pour une série. */
function contenuSerie() {
  return {
    demande: {
      sections: ["episodes", "fiche_projet", "planning", "synthese"],
      documents: ["scenario"],
    },
    fiche: { titre: "Les Marées de Kribi", format: "serie", etape: "ecriture" },
    synthese: { pitch: "Une pêcheuse défie le fleuve.", synopsis: "" },
    fiche_projet: {
      genre: "drame",
      pays: ["CM"],
      langues: "Français",
      duree: 26,
      synopsis_court: "",
      theme: "",
      enjeux: "",
      vision: "",
      objectifs: "",
      public: "",
      personnages: [],
    },
    episodes: [
      { numero: 1, titre: "Le filet", duree: 26, resume: "Awa perd son filet." },
      { numero: 2, titre: "La dette", duree: null, resume: "  " },
      {
        numero: 3,
        titre: "La crue",
        duree: 52,
        resume: "Le fleuve monte.\nTout le village avec lui.",
      },
    ],
    documents: [
      { type: "scenario", titre: "Scénario général", contenu: "EXT. ROUTE — NUIT" },
      { type: "scenario", titre: "Scénario — épisode 1", contenu: "EXT. BERGE — AUBE", episode: 1 },
      { type: "scenario", titre: "Un titre changé", contenu: "EXT. FLEUVE — JOUR", episode: 3 },
    ],
    planning: [
      { titre: "Tournage", phase: "production", debut: null, fin: null, statut: "a_venir" },
    ],
  };
}

describe("Épisodes dans le dossier : le plan", () => {
  it("la saison ouvre le dossier après la fiche, avant les documents", () => {
    const dossier = composerDossier(contenuSerie(), JOUR);
    assert.deepEqual(
      dossier.sections.map((section) => [section.origine, section.titre]),
      [
        ["synthese", "Synthèse"],
        ["fiche_projet", "Fiche du projet"],
        ["episodes", "Épisodes"],
        ["document", "Scénario général"],
        ["document", "Scénario — épisode 1"],
        ["document", "Un titre changé"],
        ["planning", "Planning"],
      ],
    );
  });

  it("un épisode par ligne : numéro, titre, durée, résumé entier ; le premier est le pilote", () => {
    const [tableau] = composerDossier(contenuSerie(), JOUR).sections.find(
      (section) => section.origine === "episodes",
    ).blocs;
    assert.equal(tableau.type, "tableau");
    assert.deepEqual(
      tableau.colonnes.map((colonne) => colonne.titre),
      ["Épisode", "Titre", "Durée", "Résumé"],
    );
    assert.ok(Math.abs(tableau.colonnes.reduce((somme, c) => somme + c.largeur, 0) - 1) < 1e-9);
    assert.deepEqual(
      tableau.lignes.map((ligne) => ligne.cellules),
      [
        ["1 — pilote", "Le filet", "26 min", "Awa perd son filet."],
        ["2", "La dette", "—", "—"],
        ["3", "La crue", "52 min", "Le fleuve monte.\nTout le village avec lui."],
      ],
    );
  });

  it("le scénario d'un épisode dit lequel, d'après la base et non d'après son titre", () => {
    const documents = composerDossier(contenuSerie(), JOUR).sections.filter(
      (section) => section.origine === "document",
    );
    assert.deepEqual(
      documents.map((section) => [section.surTitre, section.titre]),
      [
        ["Scénario", "Scénario général"],
        ["Scénario · Épisode 1", "Scénario — épisode 1"],
        ["Scénario · Épisode 3", "Un titre changé"],
      ],
    );
    // Un scénario reste du texte brut, épisode ou non.
    assert.ok(documents.every((section) => section.blocs[0].type === "texte"));
  });

  it("une saison vide est omise sans mention ; sans la section, rien ne change", () => {
    const vide = composerDossier({ ...contenuSerie(), episodes: [] }, JOUR);
    assert.ok(!vide.sections.some((section) => section.origine === "episodes"));
    const { episodes: _retirees, ...sans } = contenuSerie();
    assert.ok(Object.keys(_retirees).length);
    assert.deepEqual(
      composerDossier(sans, JOUR).sections.map((section) => section.origine),
      ["synthese", "fiche_projet", "document", "document", "document", "planning"],
    );
  });

  it("un document d'un film n'a pas de mention d'épisode", () => {
    const dossier = composerDossier(
      {
        demande: { sections: [], documents: ["scenario", "note_intention"] },
        fiche: { titre: "Un film", format: "long_metrage", etape: "ecriture" },
        documents: [
          { type: "note_intention", titre: "Note d'intention", contenu: "Pourquoi." },
          { type: "scenario", titre: "Scénario", contenu: "EXT. ROUTE" },
        ],
      },
      JOUR,
    );
    assert.deepEqual(
      dossier.sections.map((section) => section.surTitre),
      ["Note d'intention", "Scénario"],
    );
  });
});

describe("Épisodes dans le dossier : les trois formats", () => {
  it("en PDF : le fichier est fabriqué, avec une page par section au moins", async () => {
    const dossier = composerDossier(contenuSerie(), JOUR);
    const { fichier, pages } = await rendrePdf(dossier);
    assert.equal(fichier.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(pages >= dossier.sections.length, `${pages} pages`);
  });

  it("en Word : la saison et l'épisode de chaque scénario se lisent, dans l'ordre", async () => {
    const document = lireArchive(await rendreDocx(composerDossier(contenuSerie(), JOUR))).get(
      "word/document.xml",
    );
    for (const attendu of [
      "Épisodes",
      "1 — pilote",
      "Le filet",
      "26 min",
      "La crue",
      "Tout le village avec lui.",
      "SCÉNARIO · ÉPISODE 1",
      "SCÉNARIO · ÉPISODE 3",
    ]) {
      assert.ok(document.includes(attendu), attendu);
    }
    const rangs = ["Fiche du projet", "1 — pilote", "EXT. ROUTE", "EXT. BERGE", "EXT. FLEUVE"].map(
      (repere) => document.indexOf(repere),
    );
    assert.deepEqual(
      rangs,
      [...rangs].sort((a, b) => a - b),
      "ordre du dossier",
    );
    assert.ok(rangs.every((rang) => rang >= 0));
  });

  it("en archive : un classeur pour la saison, et les scénarios nommés par leur épisode", async () => {
    const contenu = contenuSerie();
    const archive = lireEntrees(await rendreArchive(composerDossier(contenu, JOUR), contenu));
    assert.deepEqual(
      [...archive.keys()].filter((nom) => !nom.endsWith("/")),
      [
        "presentation.docx",
        "documents/01-scenario-scenario-general.docx",
        "documents/02-scenario-episode-1-scenario-episode-1.docx",
        "documents/03-scenario-episode-3-un-titre-change.docx",
        "episodes.xlsx",
        "planning.xlsx",
      ],
    );
    // La présentation ne redit pas la saison : elle a son classeur.
    assert.ok(
      !lireArchive(archive.get("presentation.docx")).get("word/document.xml").includes("pilote"),
    );

    const feuille = lireFeuille(archive.get("episodes.xlsx"));
    assert.deepEqual(
      [feuille.A1, feuille.B1, feuille.C1, feuille.D1],
      ["Épisode", "Titre", "Durée (min)", "Résumé"],
    );
    // Numéros et durées restent des nombres ; une durée absente laisse la cellule vide.
    assert.deepEqual(
      [feuille.A2, feuille.B2, feuille.C2, feuille.D2],
      [1, "Le filet", 26, "Awa perd son filet."],
    );
    assert.deepEqual([feuille.A3, feuille.B3, feuille.C3], [2, "La dette", undefined]);
    assert.deepEqual([feuille.A4, feuille.C4], [3, 52]);
    assert.match(feuille.D4, /Le fleuve monte\.[\s\S]*Tout le village avec lui\./);
  });

  it("en archive : sans épisode, pas de classeur de saison", async () => {
    const contenu = { ...contenuSerie(), episodes: [] };
    const archive = lireEntrees(await rendreArchive(composerDossier(contenu, JOUR), contenu));
    assert.ok(!archive.has("episodes.xlsx"));
    assert.ok(archive.has("planning.xlsx"));
  });
});

describe("Épisodes dans le dossier : ce que l'écran propose", () => {
  const page = aPlat(lire("src/app/(app)/projets/[id]/dossier/page.tsx"));

  it("la section est celle de la base, placée à l'ouverture du dossier", () => {
    assert.equal(SECTIONS.episodes.libelle, "Épisodes");
    assert.deepEqual(SECTIONS_D_OUVERTURE, ["synthese", "fiche_projet", "episodes"]);
    assert.deepEqual(SECTIONS_DE_SERIE, ["episodes"]);
    assert.ok(ORDRE_SECTIONS.includes("episodes"));
    const types = ["scenario", "note_intention"];
    assert.deepEqual(normaliserDemande(["synthese", "episodes"], ["scenario"], types), {
      sections: ["episodes", "synthese"],
      documents: ["scenario"],
    });
    // La liste de la base, telle que la migration du lot l'écrit.
    const migration = lire("supabase/migrations/20261010180000_exports_episodes.sql");
    const enBase = /if not v_sections <@ array\[([\s\S]*?)\]/.exec(migration)[1];
    assert.deepEqual(
      [...enBase.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort(),
      [...ORDRE_SECTIONS].sort(),
    );
  });

  it("elle ne se propose qu'à une série, avec le décompte de sa saison", () => {
    assert.match(
      page,
      /SECTIONS_D_OUVERTURE\.filter\( \(code\) => !SECTIONS_DE_SERIE\.includes\(code\) \|\| estSerie\(projet\.format\), \)\.map\(section\)/,
    );
    assert.match(page, /"id, title, format, logline,/);
    assert.match(
      page,
      /\.from\("project_episodes"\) \.select\("id", \{ count: "exact", head: true \}\) \.eq\("project_id", id\)/,
    );
    assert.match(page, /episodes: \{ detail: episodes \?/);
    assert.match(page, /numéro, titre, durée et résumé/);
    assert.match(page, /"Aucun épisode pour l'instant"/);
    assert.match(page, /disponible: \(episodes \?\? 0\) > 0,/);
  });

  it("l'accès au dossier ne change pas : qui gère le budget, et personne d'autre", () => {
    assert.match(page, /if \(!projet \|\| !autorise\) \{ notFound\(\); \}/);
    assert.match(page, /supabase\.rpc\("peut_gerer_budget", \{ p_project_id: id \}\)/);
  });
});

describe("Épisodes dans le dossier : du devis au fichier, par le worker", () => {
  let base;

  before(async () => {
    base = await ouvrirBaseDuWorker();
  });

  after(async () => {
    await base.end();
  });

  /** Une série, trois épisodes saisis dans le désordre, et ses scénarios. */
  async function preparerSerie(prefixe) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, `Les Marées de ${prefixe}`);
    const { error } = await porteur.client
      .from("projects")
      .update({ format: "serie", logline: "Un pitch." })
      .eq("id", projet.id);
    assert.ifError(error);

    const episode = async (number, title, summary, duration_minutes) => {
      const { data, error: refus } = await porteur.client
        .from("project_episodes")
        .insert({
          project_id: projet.id,
          number,
          title,
          summary,
          duration_minutes,
          created_by: porteur.id,
        })
        .select("id")
        .single();
      assert.ifError(refus);
      return data.id;
    };
    const troisieme = await episode(3, "La crue", "Le fleuve monte.", 52);
    const premier = await episode(1, "Le filet", "Awa perd son filet.", 26);
    const second = await episode(2, "La dette", "", null);

    const scenario = async (title, content, status, episode_id) => {
      const { error: refus } = await porteur.client.from("project_documents").insert({
        project_id: projet.id,
        type: "scenario",
        title,
        content,
        status,
        episode_id,
        created_by: porteur.id,
      });
      assert.ifError(refus);
    };
    // Créés dans un ordre qui n'est pas celui de la saison.
    await scenario("Un titre changé", "EXT. FLEUVE — JOUR", "finalise", troisieme);
    await scenario("Scénario général", "EXT. ROUTE — NUIT", "finalise", null);
    await scenario("Scénario — épisode 1", "EXT. BERGE — AUBE", "finalise", premier);
    await scenario("Brouillon de l'épisode 2", "INT. MARCHÉ — JOUR", "brouillon", second);
    return { porteur, projet };
  }

  /** Engage un export et le fait fabriquer par le worker ; rend ce qui a été remis et déposé. */
  async function exporter(porteur, projet, action, cle, demande) {
    const tache = await engager(porteur, projet.id, action, cle, demande);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    let remis;
    const fabriquer = executeursExport(base)[action];
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "exports-episodes-test",
        executeurs: {
          [action]: async (travail, signal) => {
            remis = await lireContexteExport(base, travail.attemptId);
            return fabriquer(travail, signal);
          },
        },
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    const { data: exports } = await porteur.client
      .from("project_exports")
      .select("format, params, file")
      .eq("job_id", tache.id);
    return { remis, travail, exports: exports ?? [] };
  }

  it("une série en ZIP : la saison dans l'ordre, les scénarios à leur place, jusque dans l'archive", async () => {
    const { porteur, projet } = await preparerSerie("export-serie-zip");
    const { remis, travail, exports } = await exporter(
      porteur,
      projet,
      "zip_export",
      "serie-zip-1",
      {
        sections: ["episodes"],
        documents: ["scenario"],
      },
    );

    assert.deepEqual(
      remis.contenu.episodes.map((e) => [e.numero, e.titre, e.duree]),
      [
        [1, "Le filet", 26],
        [2, "La dette", null],
        [3, "La crue", 52],
      ],
    );
    assert.deepEqual(
      remis.contenu.documents.map((d) => [d.titre, d.episode]),
      [
        ["Scénario général", undefined],
        ["Scénario — épisode 1", 1],
        ["Un titre changé", 3],
      ],
    );
    assert.equal(travail.state, "succeeded", travail.reason);
    assert.deepEqual(exports[0].params, { sections: ["episodes"], documents: ["scenario"] });

    const archive = lireEntrees(Buffer.from(exports[0].file.slice(2), "hex"));
    assert.deepEqual(
      [...archive.keys()].filter((nom) => !nom.endsWith("/")),
      [
        "documents/01-scenario-scenario-general.docx",
        "documents/02-scenario-episode-1-scenario-episode-1.docx",
        "documents/03-scenario-episode-3-un-titre-change.docx",
        "episodes.xlsx",
      ],
    );
    const feuille = lireFeuille(archive.get("episodes.xlsx"));
    assert.deepEqual(
      [feuille.A2, feuille.B2, feuille.A4, feuille.B4],
      [1, "Le filet", 3, "La crue"],
    );
    // Le brouillon de l'épisode 2 n'est nulle part.
    for (const [nom, donnees] of archive) {
      if (nom.endsWith(".docx")) {
        const texte = lireArchive(donnees).get("word/document.xml");
        assert.ok(!texte.includes("MARCHÉ"), nom);
      }
    }
  });

  it("une série en Word et en PDF : la section et les mentions d'épisode y sont", async () => {
    const { porteur, projet } = await preparerSerie("export-serie-word");
    const word = await exporter(porteur, projet, "docx_export", "serie-word-1", {
      sections: ["synthese", "episodes"],
      documents: ["scenario"],
    });
    assert.equal(word.travail.state, "succeeded", word.travail.reason);
    const document = lireArchive(Buffer.from(word.exports[0].file.slice(2), "hex")).get(
      "word/document.xml",
    );
    for (const attendu of [
      "Épisodes",
      "1 — pilote",
      "La dette",
      "SCÉNARIO · ÉPISODE 3",
      "Un titre changé",
    ]) {
      assert.ok(document.includes(attendu), attendu);
    }
    assert.ok(document.indexOf("1 — pilote") < document.indexOf("EXT. ROUTE"), "la saison ouvre");
    assert.ok(
      document.indexOf("EXT. BERGE") < document.indexOf("EXT. FLEUVE"),
      "épisode 1 avant 3",
    );

    const pdf = await exporter(porteur, projet, "pdf_export", "serie-pdf-1", {
      sections: ["synthese", "episodes"],
      documents: ["scenario"],
    });
    assert.equal(pdf.travail.state, "succeeded", pdf.travail.reason);
    assert.equal(
      Buffer.from(pdf.exports[0].file.slice(2), "hex").subarray(0, 5).toString("latin1"),
      "%PDF-",
    );
  });

  it("un film : la section demandée est vide, omise sans mention, et le dossier sort", async () => {
    const porteur = await creerCompte("export-film-episodes");
    const projet = await creerProjet(porteur, "Un film");
    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Un pitch." })
      .eq("id", projet.id);
    assert.ifError(error);

    const { remis, travail, exports } = await exporter(porteur, projet, "docx_export", "film-1", {
      sections: ["synthese", "episodes"],
    });
    assert.deepEqual(remis.contenu.episodes, []);
    assert.equal(travail.state, "succeeded", travail.reason);
    const document = lireArchive(Buffer.from(exports[0].file.slice(2), "hex")).get(
      "word/document.xml",
    );
    assert.ok(document.includes("Un pitch."));
    assert.ok(!document.includes("Épisodes"));
  });
});
