/**
 * Financements.
 *
 * Mêmes droits que le budget : porteur, éditeurs et administrateurs ; pas
 * les lecteurs, qui voient pourtant le reste du projet. S'y ajoute la
 * frontière entre projets : une candidature ne rattache que les documents
 * de son propre projet, même quand son auteur a accès aux deux.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function creerCandidature(compte, projetId, champs = {}) {
  return compte.client
    .from("project_fundings")
    .insert({
      project_id: projetId,
      funder: "Fonds d'aide régional",
      program: "Aide à l'écriture",
      currency: "XOF",
      amount_requested: 5000000,
      deadline: "2026-11-30",
      created_by: compte.id,
      ...champs,
    })
    .select("id")
    .single();
}

async function creerDocument(compte, projetId, titre) {
  const { data, error } = await compte.client
    .from("project_documents")
    .insert({ project_id: projetId, type: "note_intention", title: titre, created_by: compte.id })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function lireCandidatures(compte, projetId) {
  const { data } = await compte.client
    .from("project_fundings")
    .select("id")
    .eq("project_id", projetId);
  return data ?? [];
}

describe("Financements", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let autreProjet;
  let candidatureId;
  let noteId;
  let noteAutreProjet;

  before(async () => {
    porteur = await creerCompte("porteur");
    editeur = await creerCompte("editeur");
    lecteur = await creerCompte("lecteur");
    tiers = await creerCompte("tiers");
    administrateur = await creerCompte("admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Gardiens du fleuve");
    autreProjet = await creerProjet(porteur, "Un autre film");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { data, error } = await creerCandidature(porteur, projet.id);
    assert.equal(error, null, error?.message);
    candidatureId = data.id;

    noteId = await creerDocument(porteur, projet.id, "Note d'intention");
    noteAutreProjet = await creerDocument(porteur, autreProjet.id, "Note d'un autre film");
  });

  it("une candidature naît « à préparer »", async () => {
    const { data } = await porteur.client
      .from("project_fundings")
      .select("status")
      .eq("id", candidatureId)
      .single();
    assert.equal(data.status, "a_preparer");
  });

  it("un lecteur de l'équipe ne voit pas les financements", async () => {
    // Il lit le projet et ses documents — c'est ce qui rend l'erreur facile.
    const { data: documents } = await lecteur.client
      .from("project_documents")
      .select("id")
      .eq("project_id", projet.id);
    assert.equal(documents.length, 1, "le lecteur doit bien lire les documents");

    assert.equal((await lireCandidatures(lecteur, projet.id)).length, 0);

    const { error } = await creerCandidature(lecteur, projet.id);
    assert.ok(error, "la création par un lecteur doit être refusée");
  });

  it("un inconnu ne voit ni ne touche les financements", async () => {
    assert.equal((await lireCandidatures(tiers, projet.id)).length, 0);

    const { error } = await creerCandidature(tiers, projet.id);
    assert.ok(error);

    const { data } = await tiers.client
      .from("project_fundings")
      .update({ status: "acceptee" })
      .eq("id", candidatureId)
      .select("id");
    assert.equal(data.length, 0);
  });

  it("un éditeur crée, fait avancer et supprime", async () => {
    const { data, error } = await creerCandidature(editeur, projet.id, {
      funder: "Coproducteur",
      kind: "coproduction",
      currency: "EUR",
    });
    assert.equal(error, null, error?.message);

    const { data: modifiee } = await editeur.client
      .from("project_fundings")
      .update({ status: "acceptee", amount_granted: 40000 })
      .eq("id", data.id)
      .select("status, amount_granted")
      .single();
    assert.equal(modifiee.status, "acceptee");
    assert.equal(Number(modifiee.amount_granted), 40000);

    const { data: supprimee } = await editeur.client
      .from("project_fundings")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprimee.length, 1);
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await lireCandidatures(administrateur, projet.id)).length, 1);

    const { data } = await administrateur.client
      .from("project_fundings")
      .update({ status: "deposee" })
      .eq("id", candidatureId)
      .select("status");
    assert.deepEqual(data, [{ status: "deposee" }]);
  });

  it("les pièces du dossier se rattachent et se remplacent d'un coup", async () => {
    const { error } = await porteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [noteId],
    });
    assert.equal(error, null, error?.message);

    const { data: pieces } = await porteur.client
      .from("funding_documents")
      .select("document_id")
      .eq("funding_id", candidatureId);
    assert.deepEqual(
      pieces.map((p) => p.document_id),
      [noteId],
    );

    await porteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [],
    });
    const { data: vides } = await porteur.client
      .from("funding_documents")
      .select("document_id")
      .eq("funding_id", candidatureId);
    assert.equal(vides.length, 0);
  });

  it("une candidature ne rattache pas le document d'un autre projet", async () => {
    // Le porteur a accès aux deux projets : seule la base l'arrête.
    const { error } = await porteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [noteAutreProjet],
    });
    assert.ok(error, "un document d'un autre projet doit être refusé");

    const { error: direct } = await porteur.client.from("funding_documents").insert({
      project_id: projet.id,
      funding_id: candidatureId,
      document_id: noteAutreProjet,
    });
    assert.ok(direct, "l'insertion directe doit l'être aussi");
  });

  it("le remplacement des pièces est tout ou rien", async () => {
    await porteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [noteId],
    });

    // Un document valide et un document étranger : l'échec doit laisser
    // le dossier tel qu'il était, et non à moitié vidé.
    await porteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [noteId, noteAutreProjet],
    });

    const { data } = await porteur.client
      .from("funding_documents")
      .select("document_id")
      .eq("funding_id", candidatureId);
    assert.deepEqual(
      data.map((p) => p.document_id),
      [noteId],
    );
  });

  it("un lecteur ne touche pas aux pièces, même par la fonction", async () => {
    const { error } = await lecteur.client.rpc("definir_pieces_candidature", {
      p_funding_id: candidatureId,
      p_document_ids: [],
    });
    assert.ok(error, "la candidature doit lui rester introuvable");

    const { data } = await porteur.client
      .from("funding_documents")
      .select("document_id")
      .eq("funding_id", candidatureId);
    assert.equal(data.length, 1, "les pièces doivent être intactes");
  });

  it("une candidature ne change ni de projet ni d'auteur", async () => {
    const { error: deplacement } = await porteur.client
      .from("project_fundings")
      .update({ project_id: autreProjet.id })
      .eq("id", candidatureId);
    assert.ok(deplacement, "project_id ne doit pas être modifiable");

    const { error: auteur } = await porteur.client
      .from("project_fundings")
      .update({ created_by: editeur.id })
      .eq("id", candidatureId);
    assert.ok(auteur, "created_by ne doit pas être modifiable");
  });

  it("la base refuse les valeurs incohérentes", async () => {
    for (const invalide of [
      { funder: "  " },
      { currency: "francs" },
      { amount_requested: -1 },
      { amount_granted: -1 },
      { kind: "loterie" },
    ]) {
      const { error } = await creerCandidature(porteur, projet.id, invalide);
      assert.ok(error, `doit être refusé : ${JSON.stringify(invalide)}`);
    }
  });

  it("candidatures et pièces disparaissent avec le projet", async () => {
    const ephemere = await creerProjet(porteur, "Éphémère");
    const { data } = await creerCandidature(porteur, ephemere.id);

    await porteur.client.from("projects").delete().eq("id", ephemere.id);

    const { data: restantes } = await administrateur.client
      .from("project_fundings")
      .select("id")
      .eq("id", data.id);
    assert.equal(restantes.length, 0);
  });
});
