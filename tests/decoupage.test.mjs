/**
 * Découpage technique : les plans d'une scène du storyboard.
 *
 * Même frontière que le storyboard — toute l'équipe lit, seuls le porteur,
 * les éditeurs et les administrateurs écrivent —, plus deux choses propres
 * aux plans : un plan porte le projet de sa scène et aucun autre, et son
 * déplacement passe par une fonction qui ne donne aucun droit de plus.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function creerScene(compte, projetId, position) {
  const { data, error } = await compte.client
    .from("storyboard_scenes")
    .insert({
      project_id: projetId,
      position,
      title: `Scène ${position}`,
      created_by: compte.id,
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

function creerPlan(compte, projetId, sceneId, position, champs = {}) {
  return compte.client
    .from("scene_shots")
    .insert({
      project_id: projetId,
      scene_id: sceneId,
      position,
      shot: "plan_moyen",
      description: `Plan ${position}`,
      created_by: compte.id,
      ...champs,
    })
    .select("id")
    .single();
}

async function ordre(compte, sceneId) {
  const { data } = await compte.client
    .from("scene_shots")
    .select("description")
    .eq("scene_id", sceneId)
    .order("position");
  return (data ?? []).map((plan) => plan.description);
}

describe("Découpage technique", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let scene;
  let autreScene;
  const plans = [];

  before(async () => {
    porteur = await creerCompte("decoupage-porteur");
    editeur = await creerCompte("decoupage-editeur");
    lecteur = await creerCompte("decoupage-lecteur");
    tiers = await creerCompte("decoupage-tiers");
    administrateur = await creerCompte("decoupage-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Gardiens du fleuve");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    scene = await creerScene(porteur, projet.id, 1);
    autreScene = await creerScene(porteur, projet.id, 2);

    for (const position of [1, 2, 3]) {
      const { data, error } = await creerPlan(porteur, projet.id, scene, position);
      assert.equal(error, null, error?.message);
      plans.push(data.id);
    }
  });

  it("un lecteur de l'équipe lit le découpage", async () => {
    assert.deepEqual(await ordre(lecteur, scene), ["Plan 1", "Plan 2", "Plan 3"]);
  });

  it("un lecteur n'ajoute, ne modifie ni ne supprime", async () => {
    const { error } = await creerPlan(lecteur, projet.id, scene, 10);
    assert.ok(error, "l'ajout par un lecteur doit être refusé");

    const { data: modifies } = await lecteur.client
      .from("scene_shots")
      .update({ description: "Réécrit" })
      .eq("id", plans[0])
      .select("id");
    assert.equal(modifies.length, 0);

    const { data: supprimes } = await lecteur.client
      .from("scene_shots")
      .delete()
      .eq("id", plans[0])
      .select("id");
    assert.equal(supprimes.length, 0);
  });

  it("un lecteur ne réordonne pas, même par la fonction de déplacement", async () => {
    const { error } = await lecteur.client.rpc("deplacer_plan", {
      p_plan_id: plans[1],
      p_vers_le_haut: true,
    });
    assert.ok(error, "la fonction ne doit pas contourner la RLS");
    assert.deepEqual(await ordre(porteur, scene), ["Plan 1", "Plan 2", "Plan 3"]);
  });

  it("un inconnu ne voit, ne crée ni ne déplace", async () => {
    assert.deepEqual(await ordre(tiers, scene), []);

    const { error: creation } = await creerPlan(tiers, projet.id, scene, 11);
    assert.ok(creation);

    const { error: deplacement } = await tiers.client.rpc("deplacer_plan", {
      p_plan_id: plans[1],
      p_vers_le_haut: true,
    });
    assert.ok(deplacement, "un plan invisible est introuvable");
  });

  it("un inconnu ne glisse pas un plan dans la scène d'un autre en nommant son propre projet", async () => {
    const sien = await creerProjet(tiers, "Projet du tiers");

    const { error } = await creerPlan(tiers, sien.id, scene, 12);
    assert.ok(error, "la scène n'appartient pas à ce projet");
    assert.equal(error.code, "23503");
    assert.equal((await ordre(porteur, scene)).length, 3);
  });

  it("un éditeur réordonne : le plan échange sa place avec son voisin, dans sa scène seulement", async () => {
    const { data: ailleurs } = await creerPlan(editeur, projet.id, autreScene, 1, {
      description: "Ailleurs",
    });

    const { error } = await editeur.client.rpc("deplacer_plan", {
      p_plan_id: plans[2],
      p_vers_le_haut: true,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(await ordre(editeur, scene), ["Plan 1", "Plan 3", "Plan 2"]);

    await editeur.client.rpc("deplacer_plan", { p_plan_id: plans[2], p_vers_le_haut: false });
    assert.deepEqual(await ordre(editeur, scene), ["Plan 1", "Plan 2", "Plan 3"]);

    // Seul dans sa scène : il n'échange pas sa place avec un plan d'une autre.
    await editeur.client.rpc("deplacer_plan", { p_plan_id: ailleurs.id, p_vers_le_haut: false });
    assert.deepEqual(await ordre(editeur, autreScene), ["Ailleurs"]);
    assert.deepEqual(await ordre(editeur, scene), ["Plan 1", "Plan 2", "Plan 3"]);
  });

  it("deux plans d'une scène ne partagent pas un rang ; deux scènes ont chacune leur premier plan", async () => {
    const { error } = await creerPlan(porteur, projet.id, scene, 2, { description: "Doublon" });
    assert.ok(error, "un rang déjà pris doit être refusé");
    assert.equal(error.code, "23505");
  });

  it("un éditeur crée, modifie et supprime", async () => {
    const { data, error } = await creerPlan(editeur, projet.id, scene, 4, {
      shot: "gros_plan",
      focal_mm: 85,
      angle: "contre_plongee",
      movement: "travelling",
      duration_seconds: 6,
    });
    assert.equal(error, null, error?.message);

    const { data: modifie } = await editeur.client
      .from("scene_shots")
      .update({ focal_mm: 50, description: "Le visage d'Awa, à contre-jour." })
      .eq("id", data.id)
      .select("focal_mm, description")
      .single();
    assert.deepEqual(modifie, { focal_mm: 50, description: "Le visage d'Awa, à contre-jour." });

    const { data: supprime } = await editeur.client
      .from("scene_shots")
      .delete()
      .eq("id", data.id)
      .select("id");
    assert.equal(supprime.length, 1);
  });

  it("un administrateur hors équipe lit et modifie", async () => {
    assert.equal((await ordre(administrateur, scene)).length, 3);

    const { data } = await administrateur.client
      .from("scene_shots")
      .update({ shot: "insert" })
      .eq("id", plans[0])
      .select("shot");
    assert.deepEqual(data, [{ shot: "insert" }]);
  });

  it("un plan ne change ni de projet, ni de scène, ni d'auteur", async () => {
    for (const champ of [
      { project_id: projet.id },
      { scene_id: autreScene },
      { created_by: editeur.id },
    ]) {
      const { error } = await porteur.client.from("scene_shots").update(champ).eq("id", plans[0]);
      assert.ok(error, `ne doit pas être modifiable : ${Object.keys(champ)[0]}`);
      assert.equal(error.code, "42501");
    }
  });

  it("la base refuse les valeurs incohérentes", async () => {
    for (const [invalide, position] of [
      [{ shot: "plan_imaginaire" }, 20],
      [{ angle: "de_biais" }, 21],
      [{ movement: "drone" }, 22],
      [{ focal_mm: 0 }, 23],
      [{ focal_mm: 2001 }, 24],
      [{ duration_seconds: 0 }, 25],
      [{ duration_seconds: 3601 }, 26],
      [{ description: "a".repeat(501) }, 27],
    ]) {
      const { error } = await creerPlan(porteur, projet.id, scene, position, invalide);
      assert.ok(error, `doit être refusé : ${JSON.stringify(invalide).slice(0, 60)}`);
    }

    for (const position of [0, 1001]) {
      const { error } = await creerPlan(porteur, projet.id, scene, position);
      assert.ok(error, `rang refusé : ${position}`);
    }
  });

  it("les plans partent avec leur scène, et la scène garde son cadrage principal", async () => {
    const { data: avant } = await porteur.client
      .from("storyboard_scenes")
      .update({ shot: "plan_large" })
      .eq("id", scene)
      .select("shot")
      .single();
    assert.equal(avant.shot, "plan_large", "le cadrage de la scène reste le sien");

    await porteur.client.from("storyboard_scenes").delete().eq("id", scene);

    const { data: restants } = await porteur.client
      .from("scene_shots")
      .select("id")
      .eq("project_id", projet.id);
    assert.equal(restants.length, 1, "seul le plan de l'autre scène demeure");
  });
});
