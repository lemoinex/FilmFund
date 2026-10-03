/**
 * Exports PDF (lot M1) et Word (lot M3) : de la tâche réclamée au fichier
 * déposé, contre la base locale et sous le rôle du worker.
 *
 * Aucun fournisseur n'est en jeu : l'export ne coûte rien et n'appelle
 * personne. Les fichiers sont réellement fabriqués ; leur contenu se vérifie
 * sur le plan du dossier, que la mise en page ne fait que dessiner, et, pour
 * le Word, dans le XML de l'archive.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";
import { inflateRawSync } from "node:zlib";

import { lireContexteExport, purgerExports } from "../worker/src/base.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { rendreDocx } from "../worker/src/exports/docx.ts";
import { composerDossier } from "../worker/src/exports/dossier.ts";
import { executeursExport, TAILLE_MAX_EXPORT } from "../worker/src/exports/executeur.ts";
import { rendrePdf } from "../worker/src/exports/pdf.ts";
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
      sections: ["budget", "financements", "planning", "synthese"],
      documents: ["note_intention"],
    },
    fiche: { titre: "Mɔ́ŋ ma Ɛyɔ", format: "long_metrage", etape: "ecriture" },
    synthese: { pitch: "Une pêcheuse défend sa plage.", synopsis: "À Kribi, la mer nourrit." },
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

/**
 * Fichiers d'une archive ZIP, lus en-tête local après en-tête local : de quoi
 * vérifier un DOCX sans dépendance. Les entrées compressées le sont par
 * « deflate » (méthode 8), les autres sont rangées telles quelles.
 */
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
    fichiers.set(nom, (methode === 8 ? inflateRawSync(donnees) : donnees).toString("utf8"));
    i = debut + taille;
  }
  return fichiers;
}

describe("Dossier : composition", () => {
  const dossier = composerDossier(contenuComplet(), new Date("2026-10-01T12:00:00Z"));
  const section = (titre) => dossier.sections.find((s) => s.titre === titre);

  it("place les sections dans l'ordre d'un dossier de film", () => {
    assert.deepEqual(
      dossier.sections.map((s) => s.titre),
      ["Synthèse", "Note d'intention", "Budget prévisionnel", "Plan de financement", "Planning"],
    );
    assert.equal(dossier.titre, "Mɔ́ŋ ma Ɛyɔ");
    assert.equal(dossier.sousTitre, "Long métrage · Écriture");
    assert.equal(dossier.date, "Dossier établi le 1er octobre 2026");
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
        demande: { sections: ["budget", "financements", "planning", "synthese"], documents: [] },
        fiche: { titre: "Projet nu", format: "documentaire", etape: "idee" },
        synthese: { pitch: "", synopsis: " " },
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

  it("sait exécuter l'export PDF et l'export Word, sans aucune clé", () => {
    assert.deepEqual(Object.keys(executeursExport(base)), ["pdf_export", "docx_export"]);
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
    assert.deepEqual(Object.keys(remis.contenu.fiche).sort(), ["etape", "format", "titre"]);
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
