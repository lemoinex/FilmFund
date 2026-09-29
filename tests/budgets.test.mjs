/**
 * Budgets.
 *
 * Le budget d'un projet s'ouvre au porteur, aux éditeurs et aux
 * administrateurs. Les lecteurs de l'équipe n'y ont pas accès : c'est la
 * frontière la plus facile à rater, puisqu'ils voient tout le reste du projet.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function ouvrirBudget(compte, projetId, devise = "XOF") {
  return compte.client.from("project_budgets").insert({ project_id: projetId, currency: devise });
}

async function ajouterLigne(compte, projetId, ligne = {}) {
  return compte.client
    .from("budget_lines")
    .insert({
      project_id: projetId,
      category: "materiel",
      label: "Location caméra",
      quantity: 12,
      unit_cost: 85000,
      created_by: compte.id,
      ...ligne,
    })
    .select("id, total")
    .single();
}

async function lireLignes(compte, projetId) {
  const { data } = await compte.client
    .from("budget_lines")
    .select("id, label")
    .eq("project_id", projetId);
  return data ?? [];
}

describe("Budgets", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let ligneId;

  before(async () => {
    porteur = await creerCompte("porteur");
    editeur = await creerCompte("editeur");
    lecteur = await creerCompte("lecteur");
    tiers = await creerCompte("tiers");
    administrateur = await creerCompte("admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Le Marché de Treichville");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { error } = await ouvrirBudget(porteur, projet.id);
    assert.equal(error, null, error?.message);

    const { data, error: erreurLigne } = await ajouterLigne(porteur, projet.id);
    assert.equal(erreurLigne, null, erreurLigne?.message);
    ligneId = data.id;
  });

  it("le total est calculé par la base", async () => {
    const { data } = await porteur.client
      .from("budget_lines")
      .select("total")
      .eq("id", ligneId)
      .single();
    assert.equal(Number(data.total), 12 * 85000);
  });

  it("le total ne peut pas être écrit à la main", async () => {
    const { error } = await ajouterLigne(porteur, projet.id, { total: 1 });
    assert.ok(error, "une colonne calculée doit refuser toute valeur fournie");
  });

  it("un lecteur de l'équipe ne voit pas le budget", async () => {
    // Il lit le projet — c'est ce qui rend l'erreur facile.
    const { data: projetLu } = await lecteur.client
      .from("projects")
      .select("id")
      .eq("id", projet.id)
      .maybeSingle();
    assert.ok(projetLu, "le lecteur doit bien lire le projet");

    assert.equal((await lireLignes(lecteur, projet.id)).length, 0);

    const { data: budget } = await lecteur.client
      .from("project_budgets")
      .select("currency")
      .eq("project_id", projet.id);
    assert.equal(budget.length, 0);
  });

  it("un lecteur n'ajoute ni ne modifie de ligne", async () => {
    const { error } = await ajouterLigne(lecteur, projet.id, { label: "Glissée" });
    assert.ok(error, "l'ajout par un lecteur doit être refusé");

    const { data } = await lecteur.client
      .from("budget_lines")
      .update({ unit_cost: 1 })
      .eq("id", ligneId)
      .select("id");
    assert.equal(data.length, 0);
  });

  it("un inconnu ne voit ni ne touche le budget", async () => {
    assert.equal((await lireLignes(tiers, projet.id)).length, 0);

    const { error } = await ajouterLigne(tiers, projet.id);
    assert.ok(error);

    const { data } = await tiers.client
      .from("budget_lines")
      .delete()
      .eq("id", ligneId)
      .select("id");
    assert.equal(data.length, 0);
  });

  it("un inconnu n'ouvre pas le budget d'un projet qui n'en a pas", async () => {
    const autre = await creerProjet(porteur, "Sans budget");
    const { error } = await ouvrirBudget(tiers, autre.id);
    assert.ok(error, "seuls les ayants droit ouvrent un budget");
  });

  it("un éditeur gère les lignes", async () => {
    const { data, error } = await ajouterLigne(editeur, projet.id, {
      category: "interpretation",
      label: "Cachet rôle principal",
      quantity: 1,
      unit_cost: 1500000,
    });
    assert.equal(error, null, error?.message);

    const { data: modifiee } = await editeur.client
      .from("budget_lines")
      .update({ actual_amount: 1400000 })
      .eq("id", data.id)
      .select("actual_amount")
      .single();
    assert.equal(Number(modifiee.actual_amount), 1400000);

    const { data: supprimee } = await editeur.client
      .from("budget_lines")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprimee.length, 1);
  });

  it("un administrateur lit et modifie le budget de n'importe quel projet", async () => {
    assert.ok((await lireLignes(administrateur, projet.id)).length > 0);

    const { data } = await administrateur.client
      .from("budget_lines")
      .update({ label: "Location caméra et optiques" })
      .eq("id", ligneId)
      .select("label");
    assert.deepEqual(data, [{ label: "Location caméra et optiques" }]);
  });

  it("personne n'attribue sa saisie à quelqu'un d'autre", async () => {
    const { error } = await ajouterLigne(editeur, projet.id, { created_by: porteur.id });
    assert.ok(error, "created_by doit être l'auteur réel");
  });

  it("une ligne ne se déplace pas vers un autre projet", async () => {
    const autre = await creerProjet(porteur, "Autre budget");
    await ouvrirBudget(porteur, autre.id);

    const { error } = await porteur.client
      .from("budget_lines")
      .update({ project_id: autre.id })
      .eq("id", ligneId);
    assert.ok(error, "project_id ne doit pas être modifiable");
  });

  it("la base refuse les montants incohérents", async () => {
    for (const invalide of [
      { unit_cost: -1 },
      { quantity: 0 },
      { actual_amount: -500 },
      { label: "   " },
    ]) {
      const { error } = await ajouterLigne(porteur, projet.id, invalide);
      assert.ok(error, `doit être refusé : ${JSON.stringify(invalide)}`);
    }
  });

  it("la devise suit le format ISO 4217", async () => {
    const autre = await creerProjet(porteur, "Devise");
    const { error } = await ouvrirBudget(porteur, autre.id, "francs");
    assert.ok(error, "une devise hors format doit être refusée");
  });

  it("le budget disparaît avec le projet", async () => {
    const ephemere = await creerProjet(porteur, "Éphémère");
    await ouvrirBudget(porteur, ephemere.id);
    const { data: ligne } = await ajouterLigne(porteur, ephemere.id);

    await porteur.client.from("projects").delete().eq("id", ephemere.id);

    const { data } = await administrateur.client
      .from("budget_lines")
      .select("id")
      .eq("id", ligne.id);
    assert.equal(data.length, 0);
  });
});
