/**
 * Versions des documents.
 *
 * Chaque changement de titre ou de texte crée une version, que personne ne
 * modifie ni ne supprime. Restaurer une version en crée une nouvelle :
 * l'historique ne se réécrit pas. Les droits sont ceux des documents —
 * toute l'équipe lit, seuls le porteur, les éditeurs et les administrateurs
 * restaurent.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

async function creerDocument(compte, projetId, contenu = "") {
  const { data, error } = await compte.client
    .from("project_documents")
    .insert({
      project_id: projetId,
      type: "note_intention",
      title: "Note d'intention",
      content: contenu,
      created_by: compte.id,
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

async function enregistrer(compte, documentId, champs) {
  const { data, error } = await compte.client
    .from("project_documents")
    .update(champs)
    .eq("id", documentId)
    .select("id");
  assert.equal(error, null, error?.message);
  assert.equal(data.length, 1, "l'enregistrement doit toucher le document");
}

async function versions(compte, documentId) {
  const { data, error } = await compte.client
    .from("project_document_versions")
    .select("id, version_number, title, content, restored_from, created_by")
    .eq("document_id", documentId)
    .order("version_number");
  assert.equal(error, null, error?.message);
  return data;
}

async function lireDocument(compte, documentId) {
  const { data } = await compte.client
    .from("project_documents")
    .select("title, content")
    .eq("id", documentId)
    .single();
  return data;
}

function restaurer(compte, versionId) {
  return compte.client.rpc("restaurer_version_document", { p_version_id: versionId });
}

describe("Versions de documents", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;

  before(async () => {
    porteur = await creerCompte("porteur");
    editeur = await creerCompte("editeur");
    lecteur = await creerCompte("lecteur");
    tiers = await creerCompte("tiers");
    administrateur = await creerCompte("admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Gardiens du fleuve");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
  });

  describe("Création des versions", () => {
    it("un document créé vide n'a aucune version", async () => {
      const document = await creerDocument(porteur, projet.id);
      assert.deepEqual(await versions(porteur, document), []);
    });

    it("un document créé avec un texte en a une première, à son auteur", async () => {
      const document = await creerDocument(porteur, projet.id, "Un souvenir d'enfance.");
      const liste = await versions(porteur, document);

      assert.equal(liste.length, 1);
      assert.equal(liste[0].version_number, 1);
      assert.equal(liste[0].content, "Un souvenir d'enfance.");
      assert.equal(liste[0].created_by, porteur.id);
    });

    it("chaque changement de titre ou de texte crée une version, sans toucher aux précédentes", async () => {
      const document = await creerDocument(porteur, projet.id);

      await enregistrer(porteur, document, { content: "Premier jet." });
      await enregistrer(editeur, document, { content: "Second jet." });
      await enregistrer(editeur, document, { title: "Note d'intention — version longue" });

      const liste = await versions(porteur, document);
      assert.deepEqual(
        liste.map(({ version_number, title, content, created_by }) => ({
          version_number,
          title,
          content,
          created_by,
        })),
        [
          {
            version_number: 1,
            title: "Note d'intention",
            content: "Premier jet.",
            created_by: porteur.id,
          },
          {
            version_number: 2,
            title: "Note d'intention",
            content: "Second jet.",
            created_by: editeur.id,
          },
          {
            version_number: 3,
            title: "Note d'intention — version longue",
            content: "Second jet.",
            created_by: editeur.id,
          },
        ],
      );
    });

    it("changer le statut ou le type, ou enregistrer sans rien changer, ne crée pas de version", async () => {
      const document = await creerDocument(porteur, projet.id, "Texte stable.");

      await enregistrer(porteur, document, { status: "en_relecture" });
      await enregistrer(porteur, document, { type: "traitement" });
      await enregistrer(porteur, document, { title: "Note d'intention", content: "Texte stable." });

      assert.equal((await versions(porteur, document)).length, 1);
    });
  });

  describe("Lecture", () => {
    let document;

    before(async () => {
      document = await creerDocument(porteur, projet.id, "À lire par l'équipe.");
    });

    it("toute l'équipe lit les versions, lecteurs compris", async () => {
      for (const compte of [porteur, editeur, lecteur]) {
        assert.equal((await versions(compte, document)).length, 1);
      }
    });

    it("un compte hors équipe n'en lit aucune", async () => {
      assert.equal((await versions(tiers, document)).length, 0);
    });

    it("un administrateur hors équipe les lit", async () => {
      assert.equal((await versions(administrateur, document)).length, 1);
    });
  });

  describe("Ajout seul", () => {
    it("personne n'écrit, ne modifie ni ne supprime une version par l'API", async () => {
      const document = await creerDocument(porteur, projet.id, "Version à protéger.");
      const [version] = await versions(porteur, document);

      for (const compte of [porteur, administrateur]) {
        const { error: ajout } = await compte.client.from("project_document_versions").insert({
          document_id: document,
          project_id: projet.id,
          version_number: 2,
          title: "Fausse version",
          content: "Texte glissé dans l'historique.",
        });
        assert.ok(ajout, "l'ajout direct doit être refusé");

        const { error: modification } = await compte.client
          .from("project_document_versions")
          .update({ content: "Texte réécrit." })
          .eq("id", version.id);
        assert.ok(modification, "la modification doit être refusée");

        const { error: suppression } = await compte.client
          .from("project_document_versions")
          .delete()
          .eq("id", version.id);
        assert.ok(suppression, "la suppression doit être refusée");
      }

      const liste = await versions(porteur, document);
      assert.equal(liste.length, 1);
      assert.equal(liste[0].content, "Version à protéger.");
    });
  });

  describe("Restauration", () => {
    it("restaure le titre et le texte, dans une nouvelle version, sans réécrire l'historique", async () => {
      const document = await creerDocument(porteur, projet.id, "Version A.");
      await enregistrer(porteur, document, { title: "Titre B", content: "Version B." });
      const [premiere] = await versions(porteur, document);

      const { error } = await restaurer(editeur, premiere.id);
      assert.equal(error, null, error?.message);

      assert.deepEqual(await lireDocument(porteur, document), {
        title: "Note d'intention",
        content: "Version A.",
      });

      const liste = await versions(porteur, document);
      assert.equal(liste.length, 3);
      assert.equal(liste[0].content, "Version A.");
      assert.equal(liste[1].content, "Version B.");
      assert.equal(liste[2].content, "Version A.");
      assert.equal(liste[2].restored_from, 1);
      assert.equal(liste[2].created_by, editeur.id);
    });

    it("le marquage de restauration ne déborde pas sur l'enregistrement suivant", async () => {
      const document = await creerDocument(porteur, projet.id, "Version A.");
      await enregistrer(porteur, document, { content: "Version B." });
      const [premiere] = await versions(porteur, document);

      await restaurer(porteur, premiere.id);
      await enregistrer(porteur, document, { content: "Version C." });

      const liste = await versions(porteur, document);
      assert.equal(liste.length, 4);
      assert.equal(liste[2].restored_from, 1);
      assert.equal(liste[3].restored_from, null);
    });

    it("un lecteur de l'équipe voit les versions mais n'en restaure aucune", async () => {
      const document = await creerDocument(porteur, projet.id, "Version A.");
      await enregistrer(porteur, document, { content: "Version B." });
      const [premiere] = await versions(lecteur, document);

      const { error } = await restaurer(lecteur, premiere.id);
      assert.equal(error?.code, "42501");

      assert.equal((await lireDocument(porteur, document)).content, "Version B.");
      assert.equal((await versions(porteur, document)).length, 2);
    });

    it("ni un compte hors équipe ni un visiteur ne restaurent", async () => {
      const document = await creerDocument(porteur, projet.id, "Version A.");
      await enregistrer(porteur, document, { content: "Version B." });
      const [premiere] = await versions(porteur, document);

      const { error: horsEquipe } = await restaurer(tiers, premiere.id);
      assert.equal(horsEquipe?.code, "P0002", "la version doit lui rester invisible");

      const { error: visiteur } = await clientAnonyme().rpc("restaurer_version_document", {
        p_version_id: premiere.id,
      });
      assert.ok(visiteur, "un visiteur ne doit pas pouvoir appeler la restauration");

      assert.equal((await lireDocument(porteur, document)).content, "Version B.");
      assert.equal((await versions(porteur, document)).length, 2);
    });

    it("un administrateur hors équipe restaure, et son intervention est journalisée", async () => {
      const projetSurveille = await creerProjet(porteur, "Projet où l'administration restaure");
      const document = await creerDocument(porteur, projetSurveille.id, "Version A.");
      await enregistrer(porteur, document, { content: "Version B." });
      const [premiere] = await versions(porteur, document);

      const { error } = await restaurer(administrateur, premiere.id);
      assert.equal(error, null, error?.message);

      const liste = await versions(porteur, document);
      assert.equal(liste.length, 3);
      assert.equal(liste[2].created_by, administrateur.id);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("details")
        .eq("project_id", projetSurveille.id)
        .eq("action", "intervention_contenu");
      assert.deepEqual(
        journal.map((entree) => entree.details.table),
        ["project_documents"],
        "la restauration passe par le document, et c'est lui qui est journalisé",
      );
    });
  });

  describe("Suppression", () => {
    it("supprimer un document emporte ses versions, restaurations comprises", async () => {
      const document = await creerDocument(porteur, projet.id, "Version A.");
      await enregistrer(porteur, document, { content: "Version B." });
      const [premiere] = await versions(porteur, document);
      await restaurer(porteur, premiere.id);
      assert.equal((await versions(porteur, document)).length, 3);

      const { data, error } = await porteur.client
        .from("project_documents")
        .delete()
        .eq("id", document)
        .select("id");
      assert.equal(error, null, error?.message);
      assert.equal(data.length, 1);

      assert.equal((await versions(administrateur, document)).length, 0);
    });
  });
});
