/**
 * Images orphelines.
 *
 * Par l'API, les fichiers sont datés de leur envoi : on ne peut pas les
 * vieillir d'une heure. Ce fichier éprouve donc ce que voit l'application —
 * un envoi récent n'est jamais proposé au nettoyage, rattaché ou non — et
 * qui peut interroger la fonction. Le délai lui-même et le tri entre
 * fichiers rattachés et abandonnés sont éprouvés en SQL, sur des fichiers
 * antidatés (supabase/tests/images_orphelines.test.sql).
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

const COMPARTIMENT = "project-images";

// Plus petite image PNG valide : un pixel transparent.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function envoyer(compte, chemin) {
  const { error } = await compte.client.storage
    .from(COMPARTIMENT)
    .upload(chemin, PIXEL, { contentType: "image/png", upsert: false });
  assert.equal(error, null, error?.message);
}

function orphelines(client, projetId) {
  return client.rpc("images_orphelines", { p_project_id: projetId });
}

describe("Images orphelines", () => {
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

    // Une couverture rattachée, et une planche envoyée puis abandonnée.
    const couverture = `${projet.id}/couverture/${crypto.randomUUID()}.png`;
    await envoyer(porteur, couverture);
    const { error } = await porteur.client
      .from("projects")
      .update({ cover_path: couverture })
      .eq("id", projet.id);
    assert.equal(error, null, error?.message);

    await envoyer(editeur, `${projet.id}/scenes/${crypto.randomUUID()}.png`);
  });

  it("un envoi récent n'est jamais proposé au nettoyage, rattaché ou non", async () => {
    for (const compte of [porteur, editeur, administrateur]) {
      const { data, error } = await orphelines(compte.client, projet.id);
      assert.equal(error, null, error?.message);
      assert.deepEqual(data, []);
    }
  });

  it("un lecteur de l'équipe, qui ne peut rien supprimer, n'y a pas accès", async () => {
    const { error } = await orphelines(lecteur.client, projet.id);
    assert.equal(error?.code, "42501");
  });

  it("un compte hors équipe n'y a pas accès", async () => {
    const { error } = await orphelines(tiers.client, projet.id);
    assert.equal(error?.code, "42501");
  });

  it("un visiteur n'y a pas accès", async () => {
    const { error } = await orphelines(clientAnonyme(), projet.id);
    assert.ok(error, "l'appel doit être refusé");
  });
});
