/**
 * Exports PDF (lot M1) : ce que chaque compte peut en lire et en demander
 * par l'API.
 *
 * AUCUN PDF RÉEL : les exports sont déposés par `deposerExport`, avec un
 * en-tête de PDF pour tout fichier. La mise en page a sa propre suite
 * (worker-export.test.mjs).
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  creerCompte,
  creerProjet,
  deposerExport,
  engager,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

/** Sections demandées par les exports de cette suite. */
const DEMANDE = { sections: ["synthese", "budget"], documents: ["note_intention"] };

describe("Exports PDF : cloisonnement", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let tache;
  let exportDepose;

  before(async () => {
    porteur = await creerCompte("export-porteur");
    editeur = await creerCompte("export-editeur");
    lecteur = await creerCompte("export-lecteur");
    etranger = await creerCompte("export-etranger");
    administrateur = await creerCompte("export-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "La Saison des pluies");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { error: fiche } = await porteur.client
      .from("projects")
      .update({ logline: "Un pitch.", synopsis: "Un synopsis." })
      .eq("id", projet.id);
    assert.ifError(fiche);

    const { error: documents } = await porteur.client.from("project_documents").insert([
      {
        project_id: projet.id,
        type: "note_intention",
        title: "Note finale",
        content: "Le texte de la note.",
        status: "finalise",
        created_by: porteur.id,
      },
      {
        project_id: projet.id,
        type: "note_intention",
        title: "Note en cours",
        content: "Un brouillon.",
        status: "brouillon",
        created_by: porteur.id,
      },
    ]);
    assert.ifError(documents);

    const { error: budget } = await porteur.client
      .from("project_budgets")
      .insert({ project_id: projet.id, currency: "XAF" });
    assert.ifError(budget);
    const { error: ligne } = await porteur.client.from("budget_lines").insert({
      project_id: projet.id,
      category: "developpement",
      label: "Écriture",
      quantity: 1,
      unit_cost: 2_500_000,
      created_by: porteur.id,
    });
    assert.ifError(ligne);

    tache = await engager(porteur, projet.id, "pdf_export", "export-cle-1", DEMANDE);
    await deposerExport(tache.id);
    const { data, error } = await porteur.client
      .from("project_exports")
      .select("id")
      .eq("job_id", tache.id)
      .single();
    assert.ifError(error);
    exportDepose = data.id;
  });

  it("un export compte une unité PDF, et la tâche aboutit sans appel à un fournisseur", async () => {
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, action, reservation_id")
      .eq("id", tache.id)
      .single();
    assert.deepEqual([travail.action, travail.state], ["pdf_export", "succeeded"]);

    const { data: reservation } = await porteur.client
      .from("reservations")
      .select("unit, quantity")
      .eq("id", travail.reservation_id)
      .single();
    assert.deepEqual(reservation, { unit: "pdf", quantity: 1 });

    // Un export n'est pas un appel d'IA : aucune dépense fournisseur.
    const { data: couts } = await administrateur.client
      .from("provider_charges")
      .select("attempt_id")
      .eq("job_id", tache.id);
    assert.equal(couts.length, 0);
  });

  it("porteur, éditeur et administrateur lisent l'export et son fichier", async () => {
    for (const compte of [porteur, editeur, administrateur]) {
      const { data, error } = await compte.client
        .from("project_exports")
        .select("id, pages, size_bytes, params, file")
        .eq("id", exportDepose)
        .single();
      assert.ifError(error);
      assert.equal(data.pages, 1);
      assert.equal(data.size_bytes, 9);
      assert.deepEqual(data.params, {
        sections: ["budget", "synthese"],
        documents: ["note_intention"],
      });
      // PostgREST rend un bytea en hexadécimal : « %PDF- ».
      assert.match(data.file, /^\\x255044462d/);
    }
  });

  it("un lecteur du projet ne lit pas l'export : il peut contenir le budget", async () => {
    const { data } = await lecteur.client.from("project_exports").select("id, file");
    assert.equal(data.length, 0);

    // Le lecteur lit pourtant le projet et ses documents.
    const { data: documents } = await lecteur.client
      .from("project_documents")
      .select("id")
      .eq("project_id", projet.id);
    assert.equal(documents.length, 2);
  });

  it("un compte étranger au projet ne lit aucun export", async () => {
    const { data } = await etranger.client.from("project_exports").select("id");
    assert.equal(data.length, 0);
  });

  it("personne n'écrit un export par l'API, pas même le porteur ni l'administration", async () => {
    for (const compte of [porteur, administrateur]) {
      const { error: ajout } = await compte.client.from("project_exports").insert({
        job_id: tache.id,
        studio_id: crypto.randomUUID(),
        project_id: projet.id,
        created_by: compte.id,
        params: DEMANDE,
        content_fingerprint: "a".repeat(64),
        file: "\\x255044462d312e330a",
        pages: 1,
      });
      assert.ok(ajout, "l'ajout direct doit être refusé");

      const { data: modifies } = await compte.client
        .from("project_exports")
        .update({ pages: 99 })
        .eq("id", exportDepose)
        .select("id");
      assert.equal(modifies?.length ?? 0, 0);

      const { data: supprimes } = await compte.client
        .from("project_exports")
        .delete()
        .eq("id", exportDepose)
        .select("id");
      assert.equal(supprimes?.length ?? 0, 0);
    }

    const { data: intact } = await porteur.client
      .from("project_exports")
      .select("pages")
      .eq("id", exportDepose)
      .single();
    assert.equal(intact.pages, 1);
  });

  it("un compte n'appelle aucune des fonctions du worker", async () => {
    const essai = crypto.randomUUID();
    const appels = [
      ["contexte_export", { p_attempt_id: essai }],
      [
        "livrer_export",
        {
          p_attempt_id: essai,
          p_file: "\\x255044462d312e330a",
          p_pages: 1,
          p_fingerprint: "a".repeat(64),
        },
      ],
      ["purger_exports_expires", {}],
    ];
    for (const compte of [porteur, administrateur]) {
      for (const [fonction, parametres] of appels) {
        const { error } = await compte.client.rpc(fonction, parametres);
        assert.ok(error, `${fonction} doit être refusée`);
      }
    }
  });

  it("le contenu d'un dossier suit les droits de l'appelant", async () => {
    const demande = { sections: ["budget"], documents: ["note_intention"] };

    const { data: pourPorteur, error } = await porteur.client.rpc("contenu_dossier", {
      p_project_id: projet.id,
      p_params: demande,
    });
    assert.ifError(error);
    assert.equal(pourPorteur.budget.lignes.length, 1);
    assert.deepEqual(
      pourPorteur.documents.map((document) => document.titre),
      ["Note finale"],
      "seul le document finalisé entre dans le dossier",
    );

    // Le lecteur lit les documents, pas le budget : la fonction ne lui en
    // donne pas davantage.
    const { data: pourLecteur } = await lecteur.client.rpc("contenu_dossier", {
      p_project_id: projet.id,
      p_params: demande,
    });
    assert.equal(pourLecteur.budget, null);
    assert.equal(pourLecteur.documents.length, 1);

    const { data: pourEtranger } = await etranger.client.rpc("contenu_dossier", {
      p_project_id: projet.id,
      p_params: demande,
    });
    assert.equal(pourEtranger, null);
  });

  it("un export identique est retrouvé ; il ne l'est plus quand le contenu change", async () => {
    // Même demande, cases cochées dans un autre ordre.
    const memeDemande = { documents: ["note_intention"], sections: ["budget", "synthese"] };
    const retrouver = async (compte, demande = memeDemande) => {
      const { data, error } = await compte.client.rpc("export_disponible", {
        p_project_id: projet.id,
        p_params: demande,
      });
      assert.ifError(error);
      return data;
    };

    assert.equal(await retrouver(porteur), exportDepose);
    assert.equal(await retrouver(editeur), exportDepose);
    assert.equal(await retrouver(lecteur), null, "un lecteur ne retrouve rien");
    assert.equal(await retrouver(etranger), null);
    assert.equal(await retrouver(porteur, { sections: ["synthese"] }), null);

    const { error } = await porteur.client
      .from("projects")
      .update({ synopsis: "Un synopsis réécrit." })
      .eq("id", projet.id);
    assert.ifError(error);
    assert.equal(await retrouver(porteur), null, "le contenu a changé");
  });

  it("une demande sans section connue est refusée par la base", async () => {
    for (const demande of [{ sections: ["storyboard"] }, { sections: [], documents: [] }, {}]) {
      const { error } = await porteur.client.rpc("export_disponible", {
        p_project_id: projet.id,
        p_params: demande,
      });
      assert.equal(error?.code, "22023");
    }
  });

  it("un lecteur ne demande pas d'export", async () => {
    const { error } = await lecteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "pdf_export",
      p_params: DEMANDE,
    });
    assert.equal(error?.code, "42501");
  });
});
