/**
 * Matériel et réglages électriques d'un projet.
 *
 * Même frontière que le storyboard : toute l'équipe lit, seuls le porteur,
 * les éditeurs et les administrateurs écrivent. Les réglages vivent dans leur
 * propre table, une ligne par projet au plus.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

function creerEquipement(compte, projetId, champs = {}) {
  return compte.client
    .from("project_gear")
    .insert({
      project_id: projetId,
      category: "lumiere",
      label: "Projecteur LED",
      created_by: compte.id,
      ...champs,
    })
    .select("id, quantity, unit_power_watts, simultaneous")
    .single();
}

async function designations(compte, projetId) {
  const { data } = await compte.client
    .from("project_gear")
    .select("label")
    .eq("project_id", projetId)
    .order("created_at");
  return (data ?? []).map((equipement) => equipement.label);
}

function reglagesDe(compte, projetId) {
  return compte.client
    .from("project_power_settings")
    .select("voltage_volts, generator_margin_percent")
    .eq("project_id", projetId)
    .maybeSingle();
}

describe("Matériel", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let equipement;

  before(async () => {
    porteur = await creerCompte("materiel-porteur");
    editeur = await creerCompte("materiel-editeur");
    lecteur = await creerCompte("materiel-lecteur");
    tiers = await creerCompte("materiel-tiers");
    administrateur = await creerCompte("materiel-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Gardiens du fleuve");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { data, error } = await creerEquipement(porteur, projet.id, {
      quantity: 2,
      unit_power_watts: 650,
    });
    assert.equal(error, null, error?.message);
    equipement = data.id;
  });

  it("un équipement naît en un exemplaire, sans puissance, compté dans la charge simultanée", async () => {
    const { data, error } = await creerEquipement(porteur, projet.id, {
      category: "son",
      label: "Perche",
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(
      { quantity: data.quantity, puissance: data.unit_power_watts, simultane: data.simultaneous },
      { quantity: 1, puissance: null, simultane: true },
    );
  });

  it("un lecteur de l'équipe lit le matériel, sans rien y écrire", async () => {
    assert.deepEqual(await designations(lecteur, projet.id), ["Projecteur LED", "Perche"]);

    const { error } = await creerEquipement(lecteur, projet.id);
    assert.ok(error, "l'ajout par un lecteur doit être refusé");

    const { data: modifies } = await lecteur.client
      .from("project_gear")
      .update({ quantity: 9 })
      .eq("id", equipement)
      .select("id");
    assert.equal(modifies.length, 0);

    const { data: supprimes } = await lecteur.client
      .from("project_gear")
      .delete()
      .eq("id", equipement)
      .select("id");
    assert.equal(supprimes.length, 0);
  });

  it("un inconnu ne voit ni ne crée", async () => {
    assert.deepEqual(await designations(tiers, projet.id), []);
    const { error } = await creerEquipement(tiers, projet.id);
    assert.ok(error);
  });

  it("un éditeur crée, modifie et supprime", async () => {
    const { data, error } = await creerEquipement(editeur, projet.id, {
      category: "energie",
      label: "Groupe électrogène",
      simultaneous: false,
    });
    assert.equal(error, null, error?.message);

    const { data: modifie } = await editeur.client
      .from("project_gear")
      .update({ category: "regie", label: "Bouilloire", unit_power_watts: 2000 })
      .eq("id", data.id)
      .select("category, label, unit_power_watts")
      .single();
    assert.deepEqual(modifie, { category: "regie", label: "Bouilloire", unit_power_watts: 2000 });

    const { data: supprime } = await editeur.client
      .from("project_gear")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprime.length, 1);
  });

  it("un éditeur ne crée pas d'équipement au nom d'un autre auteur", async () => {
    const { error } = await creerEquipement(editeur, projet.id, { created_by: porteur.id });
    assert.ok(error);
    assert.equal(error.code, "42501");
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await designations(administrateur, projet.id)).length, 2);

    const { data } = await administrateur.client
      .from("project_gear")
      .update({ quantity: 3 })
      .eq("id", equipement)
      .select("quantity");
    assert.deepEqual(data, [{ quantity: 3 }]);
  });

  it("un équipement ne change ni de projet ni d'auteur", async () => {
    const autre = await creerProjet(porteur, "Autre projet");

    for (const champ of [{ project_id: autre.id }, { created_by: editeur.id }]) {
      const { error } = await porteur.client
        .from("project_gear")
        .update(champ)
        .eq("id", equipement);
      assert.ok(error, `ne doit pas être modifiable : ${Object.keys(champ)[0]}`);
      assert.equal(error.code, "42501");
    }
  });

  it("la base refuse les valeurs incohérentes", async () => {
    for (const invalide of [
      { category: "drones" },
      { label: "   " },
      { label: "a".repeat(201) },
      { label: "Deux\nlignes" },
      { quantity: 0 },
      { quantity: 1001 },
      { unit_power_watts: -1 },
      { unit_power_watts: 1000001 },
    ]) {
      const { error } = await creerEquipement(porteur, projet.id, invalide);
      assert.ok(error, `doit être refusé : ${JSON.stringify(invalide).slice(0, 60)}`);
    }
  });

  describe("Réglages électriques", () => {
    it("un projet n'a pas de réglages tant que personne n'en a enregistré", async () => {
      const { data, error } = await reglagesDe(porteur, projet.id);
      assert.equal(error, null, error?.message);
      assert.equal(data, null);
    });

    it("un lecteur et un inconnu n'en créent pas", async () => {
      for (const compte of [lecteur, tiers]) {
        const { error } = await compte.client
          .from("project_power_settings")
          .insert({ project_id: projet.id });
        assert.ok(error);
        assert.equal(error.code, "42501");
      }
    });

    it("un éditeur les crée : 230 V et 30 % par défaut, une seule ligne par projet", async () => {
      const { error } = await editeur.client
        .from("project_power_settings")
        .insert({ project_id: projet.id });
      assert.equal(error, null, error?.message);

      const { data } = await reglagesDe(lecteur, projet.id);
      assert.deepEqual(data, { voltage_volts: 230, generator_margin_percent: 30 });

      const { error: doublon } = await porteur.client
        .from("project_power_settings")
        .insert({ project_id: projet.id });
      assert.equal(doublon?.code, "23505");
    });

    it("le porteur les modifie ; un lecteur, non ; un inconnu ne les voit pas", async () => {
      const { data } = await porteur.client
        .from("project_power_settings")
        .update({ voltage_volts: 220, generator_margin_percent: 25 })
        .eq("project_id", projet.id)
        .select("voltage_volts, generator_margin_percent");
      assert.deepEqual(data, [{ voltage_volts: 220, generator_margin_percent: 25 }]);

      const { data: parLecteur } = await lecteur.client
        .from("project_power_settings")
        .update({ voltage_volts: 110 })
        .eq("project_id", projet.id)
        .select("project_id");
      assert.equal(parLecteur.length, 0);

      assert.equal((await reglagesDe(tiers, projet.id)).data, null);
      assert.equal((await reglagesDe(administrateur, projet.id)).data.voltage_volts, 220);
    });

    it("des réglages ne changent pas de projet, et restent dans leurs bornes", async () => {
      const autre = await creerProjet(porteur, "Projet sans réglages");
      const { error: deplacement } = await porteur.client
        .from("project_power_settings")
        .update({ project_id: autre.id })
        .eq("project_id", projet.id);
      assert.equal(deplacement?.code, "42501");

      for (const invalide of [
        { voltage_volts: 99 },
        { voltage_volts: 251 },
        { generator_margin_percent: -1 },
        { generator_margin_percent: 101 },
      ]) {
        const { error } = await porteur.client
          .from("project_power_settings")
          .update(invalide)
          .eq("project_id", projet.id);
        assert.equal(error?.code, "23514", JSON.stringify(invalide));
      }
    });
  });
});
