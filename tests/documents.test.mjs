/**
 * Documents de projet.
 *
 * Toute l'équipe lit, lecteurs compris ; seuls le porteur, les éditeurs et
 * les administrateurs écrivent. La frontière à surveiller passe donc entre
 * lire et écrire, au sein même de l'équipe.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function creerDocument(compte, projetId, champs = {}) {
  return compte.client
    .from("project_documents")
    .insert({
      project_id: projetId,
      type: "note_intention",
      title: "Note d'intention",
      content: "Ce film naît d'un souvenir d'enfance.",
      created_by: compte.id,
      ...champs,
    })
    .select("id, status")
    .single();
}

async function lireDocuments(compte, projetId) {
  const { data } = await compte.client
    .from("project_documents")
    .select("id, title")
    .eq("project_id", projetId);
  return data ?? [];
}

describe("Documents", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let documentId;

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

    const { data, error } = await creerDocument(porteur, projet.id);
    assert.equal(error, null, error?.message);
    documentId = data.id;
  });

  it("un document naît au statut brouillon", async () => {
    const { data } = await porteur.client
      .from("project_documents")
      .select("status")
      .eq("id", documentId)
      .single();
    assert.equal(data.status, "brouillon");
  });

  it("un lecteur de l'équipe lit les documents", async () => {
    assert.equal((await lireDocuments(lecteur, projet.id)).length, 1);
  });

  it("un lecteur n'écrit, ne modifie ni ne supprime", async () => {
    const { error } = await creerDocument(lecteur, projet.id, { title: "Glissé" });
    assert.ok(error, "la création par un lecteur doit être refusée");

    const { data: modifies } = await lecteur.client
      .from("project_documents")
      .update({ content: "Réécrit" })
      .eq("id", documentId)
      .select("id");
    assert.equal(modifies.length, 0);

    const { data: supprimes } = await lecteur.client
      .from("project_documents")
      .delete()
      .eq("id", documentId)
      .select("id");
    assert.equal(supprimes.length, 0);
  });

  it("un inconnu ne voit ni ne touche les documents", async () => {
    assert.equal((await lireDocuments(tiers, projet.id)).length, 0);

    const { error } = await creerDocument(tiers, projet.id);
    assert.ok(error);

    const { data } = await tiers.client
      .from("project_documents")
      .update({ title: "Piraté" })
      .eq("id", documentId)
      .select("id");
    assert.equal(data.length, 0);
  });

  it("un éditeur crée, modifie et supprime", async () => {
    const { data, error } = await creerDocument(editeur, projet.id, {
      type: "traitement",
      title: "Traitement",
    });
    assert.equal(error, null, error?.message);

    const { data: modifie } = await editeur.client
      .from("project_documents")
      .update({ status: "en_relecture", content: "Première version." })
      .eq("id", data.id)
      .select("status")
      .single();
    assert.equal(modifie.status, "en_relecture");

    const { data: supprime } = await editeur.client
      .from("project_documents")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprime.length, 1);
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await lireDocuments(administrateur, projet.id)).length, 1);

    const { data } = await administrateur.client
      .from("project_documents")
      .update({ status: "finalise" })
      .eq("id", documentId)
      .select("status");
    assert.deepEqual(data, [{ status: "finalise" }]);
  });

  it("un document ne change ni de projet ni d'auteur", async () => {
    const autre = await creerProjet(porteur, "Autre projet");

    const { error: deplacement } = await porteur.client
      .from("project_documents")
      .update({ project_id: autre.id })
      .eq("id", documentId);
    assert.ok(deplacement, "project_id ne doit pas être modifiable");

    const { error: auteur } = await porteur.client
      .from("project_documents")
      .update({ created_by: editeur.id })
      .eq("id", documentId);
    assert.ok(auteur, "created_by ne doit pas être modifiable");
  });

  it("personne n'attribue sa création à quelqu'un d'autre", async () => {
    const { error } = await creerDocument(editeur, projet.id, { created_by: porteur.id });
    assert.ok(error);
  });

  it("la base refuse un titre vide ou un type inconnu", async () => {
    const { error: titre } = await creerDocument(porteur, projet.id, { title: "   " });
    assert.ok(titre, "un titre vide doit être refusé");

    const { error: type } = await creerDocument(porteur, projet.id, { type: "roman" });
    assert.ok(type, "un type inconnu doit être refusé");
  });

  it("les documents disparaissent avec le projet", async () => {
    const ephemere = await creerProjet(porteur, "Éphémère");
    const { data } = await creerDocument(porteur, ephemere.id);

    await porteur.client.from("projects").delete().eq("id", ephemere.id);

    const { data: restants } = await administrateur.client
      .from("project_documents")
      .select("id")
      .eq("id", data.id);
    assert.equal(restants.length, 0);
  });
});
