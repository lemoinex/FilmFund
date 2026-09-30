/**
 * Planning.
 *
 * Même frontière que les documents et le storyboard : toute l'équipe lit,
 * seuls le porteur, les éditeurs et les administrateurs écrivent. S'y ajoute
 * la cohérence des dates, que la base garantit.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function creerEtape(compte, projetId, champs = {}) {
  return compte.client
    .from("project_milestones")
    .insert({
      project_id: projetId,
      title: "Dépôt au fonds d'aide",
      phase: "developpement",
      due_on: "2026-11-30",
      created_by: compte.id,
      ...champs,
    })
    .select("id, status")
    .single();
}

async function lireEtapes(compte, projetId) {
  const { data } = await compte.client
    .from("project_milestones")
    .select("id")
    .eq("project_id", projetId);
  return data ?? [];
}

describe("Planning", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let etapeId;

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

    const { data, error } = await creerEtape(porteur, projet.id);
    assert.equal(error, null, error?.message);
    etapeId = data.id;
  });

  it("une étape naît « à faire »", async () => {
    const { data } = await porteur.client
      .from("project_milestones")
      .select("status")
      .eq("id", etapeId)
      .single();
    assert.equal(data.status, "a_faire");
  });

  it("un lecteur de l'équipe lit le planning", async () => {
    assert.equal((await lireEtapes(lecteur, projet.id)).length, 1);
  });

  it("un lecteur n'ajoute, ne modifie ni ne supprime", async () => {
    const { error } = await creerEtape(lecteur, projet.id, { title: "Glissée" });
    assert.ok(error, "l'ajout par un lecteur doit être refusé");

    const { data: modifiees } = await lecteur.client
      .from("project_milestones")
      .update({ status: "termine" })
      .eq("id", etapeId)
      .select("id");
    assert.equal(modifiees.length, 0);

    const { data: supprimees } = await lecteur.client
      .from("project_milestones")
      .delete()
      .eq("id", etapeId)
      .select("id");
    assert.equal(supprimees.length, 0);
  });

  it("un inconnu ne voit ni ne touche le planning", async () => {
    assert.equal((await lireEtapes(tiers, projet.id)).length, 0);

    const { error } = await creerEtape(tiers, projet.id);
    assert.ok(error);

    const { data } = await tiers.client
      .from("project_milestones")
      .update({ title: "Piratée" })
      .eq("id", etapeId)
      .select("id");
    assert.equal(data.length, 0);
  });

  it("un éditeur crée, fait avancer et supprime", async () => {
    const { data, error } = await creerEtape(editeur, projet.id, {
      title: "Repérages",
      phase: "preproduction",
      starts_on: "2027-01-10",
      due_on: "2027-01-24",
    });
    assert.equal(error, null, error?.message);

    const { data: modifiee } = await editeur.client
      .from("project_milestones")
      .update({ status: "en_cours" })
      .eq("id", data.id)
      .select("status")
      .single();
    assert.equal(modifiee.status, "en_cours");

    const { data: supprimee } = await editeur.client
      .from("project_milestones")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprimee.length, 1);
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await lireEtapes(administrateur, projet.id)).length, 1);

    const { data } = await administrateur.client
      .from("project_milestones")
      .update({ status: "termine" })
      .eq("id", etapeId)
      .select("status");
    assert.deepEqual(data, [{ status: "termine" }]);
  });

  it("une étape ne change ni de projet ni d'auteur", async () => {
    const autre = await creerProjet(porteur, "Autre projet");

    const { error: deplacement } = await porteur.client
      .from("project_milestones")
      .update({ project_id: autre.id })
      .eq("id", etapeId);
    assert.ok(deplacement, "project_id ne doit pas être modifiable");

    const { error: auteur } = await porteur.client
      .from("project_milestones")
      .update({ created_by: editeur.id })
      .eq("id", etapeId);
    assert.ok(auteur, "created_by ne doit pas être modifiable");
  });

  it("l'échéance ne précède pas le début", async () => {
    const { error } = await creerEtape(porteur, projet.id, {
      starts_on: "2027-03-01",
      due_on: "2027-02-01",
    });
    assert.ok(error, "une échéance antérieure au début doit être refusée");

    // Une date seule, ou aucune, reste permise.
    const { error: sansDebut } = await creerEtape(porteur, projet.id, {
      title: "Sans début",
      starts_on: null,
    });
    assert.equal(sansDebut, null, sansDebut?.message);
  });

  it("la base refuse un titre vide ou un statut inconnu", async () => {
    const { error: titre } = await creerEtape(porteur, projet.id, { title: "  " });
    assert.ok(titre);

    const { error: statut } = await creerEtape(porteur, projet.id, { status: "abandonne" });
    assert.ok(statut);
  });

  it("le planning disparaît avec le projet", async () => {
    const ephemere = await creerProjet(porteur, "Éphémère");
    const { data } = await creerEtape(porteur, ephemere.id);

    await porteur.client.from("projects").delete().eq("id", ephemere.id);

    const { data: restantes } = await administrateur.client
      .from("project_milestones")
      .select("id")
      .eq("id", data.id);
    assert.equal(restantes.length, 0);
  });
});
