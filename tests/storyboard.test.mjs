/**
 * Storyboard.
 *
 * Même frontière que les documents — toute l'équipe lit, seuls le porteur,
 * les éditeurs et les administrateurs écrivent —, plus l'ordre des scènes :
 * le déplacement passe par une fonction, qui ne doit donner aucun droit que
 * l'appelant n'a pas déjà.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function creerScene(compte, projetId, position, champs = {}) {
  return compte.client
    .from("storyboard_scenes")
    .insert({
      project_id: projetId,
      position,
      title: `Scène ${position}`,
      location: "Berges du Niger",
      created_by: compte.id,
      ...champs,
    })
    .select("id")
    .single();
}

async function ordre(compte, projetId) {
  const { data } = await compte.client
    .from("storyboard_scenes")
    .select("title")
    .eq("project_id", projetId)
    .order("position");
  return (data ?? []).map((s) => s.title);
}

describe("Storyboard", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  const scenes = [];

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

    for (const position of [1, 2, 3]) {
      const { data, error } = await creerScene(porteur, projet.id, position);
      assert.equal(error, null, error?.message);
      scenes.push(data.id);
    }
  });

  it("un lecteur de l'équipe lit le storyboard", async () => {
    assert.deepEqual(await ordre(lecteur, projet.id), ["Scène 1", "Scène 2", "Scène 3"]);
  });

  it("un lecteur n'ajoute, ne modifie ni ne supprime", async () => {
    const { error } = await creerScene(lecteur, projet.id, 10);
    assert.ok(error, "l'ajout par un lecteur doit être refusé");

    const { data: modifiees } = await lecteur.client
      .from("storyboard_scenes")
      .update({ title: "Réécrite" })
      .eq("id", scenes[0])
      .select("id");
    assert.equal(modifiees.length, 0);

    const { data: supprimees } = await lecteur.client
      .from("storyboard_scenes")
      .delete()
      .eq("id", scenes[0])
      .select("id");
    assert.equal(supprimees.length, 0);
  });

  it("un lecteur ne réordonne pas, même par la fonction de déplacement", async () => {
    const { error } = await lecteur.client.rpc("deplacer_scene", {
      p_scene_id: scenes[1],
      p_vers_le_haut: true,
    });
    assert.ok(error, "la fonction ne doit pas contourner la RLS");
    assert.deepEqual(await ordre(porteur, projet.id), ["Scène 1", "Scène 2", "Scène 3"]);
  });

  it("un inconnu ne voit, ne crée ni ne déplace", async () => {
    assert.deepEqual(await ordre(tiers, projet.id), []);

    const { error: creation } = await creerScene(tiers, projet.id, 11);
    assert.ok(creation);

    const { error: deplacement } = await tiers.client.rpc("deplacer_scene", {
      p_scene_id: scenes[1],
      p_vers_le_haut: true,
    });
    assert.ok(deplacement, "une scène invisible est introuvable");
  });

  it("un éditeur réordonne : la scène échange sa place avec sa voisine", async () => {
    const { error } = await editeur.client.rpc("deplacer_scene", {
      p_scene_id: scenes[2],
      p_vers_le_haut: true,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(await ordre(editeur, projet.id), ["Scène 1", "Scène 3", "Scène 2"]);

    // Remise en ordre, vers le bas cette fois.
    await editeur.client.rpc("deplacer_scene", { p_scene_id: scenes[2], p_vers_le_haut: false });
    assert.deepEqual(await ordre(editeur, projet.id), ["Scène 1", "Scène 2", "Scène 3"]);
  });

  it("déplacer la première scène vers le haut ne change rien", async () => {
    const { error } = await porteur.client.rpc("deplacer_scene", {
      p_scene_id: scenes[0],
      p_vers_le_haut: true,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(await ordre(porteur, projet.id), ["Scène 1", "Scène 2", "Scène 3"]);
  });

  it("deux scènes ne partagent pas un rang", async () => {
    const { error } = await creerScene(porteur, projet.id, 2, { title: "Doublon" });
    assert.ok(error, "une position déjà prise doit être refusée");
  });

  it("un éditeur crée, modifie et supprime", async () => {
    const { data, error } = await creerScene(editeur, projet.id, 4, {
      setting: "ext",
      time_of_day: "nuit",
      shot: "plan_large",
    });
    assert.equal(error, null, error?.message);

    const { data: modifiee } = await editeur.client
      .from("storyboard_scenes")
      .update({ description: "La pirogue s'éloigne dans le noir." })
      .eq("id", data.id)
      .select("description")
      .single();
    assert.equal(modifiee.description, "La pirogue s'éloigne dans le noir.");

    const { data: supprimee } = await editeur.client
      .from("storyboard_scenes")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprimee.length, 1);
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await ordre(administrateur, projet.id)).length, 3);

    const { data } = await administrateur.client
      .from("storyboard_scenes")
      .update({ shot: "gros_plan" })
      .eq("id", scenes[0])
      .select("shot");
    assert.deepEqual(data, [{ shot: "gros_plan" }]);
  });

  it("une scène ne change ni de projet ni d'auteur", async () => {
    const autre = await creerProjet(porteur, "Autre projet");

    const { error: deplacement } = await porteur.client
      .from("storyboard_scenes")
      .update({ project_id: autre.id })
      .eq("id", scenes[0]);
    assert.ok(deplacement, "project_id ne doit pas être modifiable");

    const { error: auteur } = await porteur.client
      .from("storyboard_scenes")
      .update({ created_by: editeur.id })
      .eq("id", scenes[0]);
    assert.ok(auteur, "created_by ne doit pas être modifiable");
  });

  it("la base refuse les valeurs incohérentes", async () => {
    for (const [invalide, position] of [
      [{ title: "  " }, 20],
      [{ setting: "dehors" }, 21],
      [{ shot: "plan_imaginaire" }, 22],
    ]) {
      const { error } = await creerScene(porteur, projet.id, position, invalide);
      assert.ok(error, `doit être refusé : ${JSON.stringify(invalide)}`);
    }

    const { error } = await creerScene(porteur, projet.id, 0);
    assert.ok(error, "une position nulle doit être refusée");
  });

  it("le storyboard disparaît avec le projet", async () => {
    const ephemere = await creerProjet(porteur, "Éphémère");
    const { data } = await creerScene(porteur, ephemere.id, 1);

    await porteur.client.from("projects").delete().eq("id", ephemere.id);

    const { data: restantes } = await administrateur.client
      .from("storyboard_scenes")
      .select("id")
      .eq("id", data.id);
    assert.equal(restantes.length, 0);
  });
});
