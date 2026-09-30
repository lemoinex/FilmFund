/**
 * Images de projet.
 *
 * Les fichiers passent par l'API de stockage réelle : ce sont ses politiques
 * qui sont éprouvées, et non une simulation. Toute l'équipe lit ; porteur,
 * éditeurs et administrateurs envoient ; personne n'écrit hors des deux
 * dossiers prévus, ni dans le dossier d'un autre projet.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

const COMPARTIMENT = "project-images";

// Plus petite image PNG valide : un pixel transparent.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function envoyer(compte, chemin, { contenu = PIXEL, type = "image/png" } = {}) {
  return compte.client.storage
    .from(COMPARTIMENT)
    .upload(chemin, contenu, { contentType: type, upsert: false });
}

function lienSigne(compte, chemin) {
  return compte.client.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60);
}

describe("Images", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let administrateur;
  let projet;
  let autreProjet;
  let couverture;

  before(async () => {
    porteur = await creerCompte("porteur");
    editeur = await creerCompte("editeur");
    lecteur = await creerCompte("lecteur");
    tiers = await creerCompte("tiers");
    administrateur = await creerCompte("admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Gardiens du fleuve");
    autreProjet = await creerProjet(tiers, "Le film d'un autre");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    couverture = `${projet.id}/couverture/${crypto.randomUUID()}.png`;
    const { error } = await envoyer(porteur, couverture);
    assert.equal(error, null, error?.message);
  });

  it("toute l'équipe obtient un lien signé, lecteurs compris", async () => {
    for (const compte of [porteur, editeur, lecteur, administrateur]) {
      const { data, error } = await lienSigne(compte, couverture);
      assert.equal(error, null, error?.message);
      assert.ok(data.signedUrl);
    }
  });

  it("le lien signé délivre bien l'image", async () => {
    const { data } = await lienSigne(lecteur, couverture);
    const reponse = await fetch(data.signedUrl);
    assert.equal(reponse.status, 200);
    assert.deepEqual(Buffer.from(await reponse.arrayBuffer()), PIXEL);
  });

  it("un inconnu n'obtient pas de lien", async () => {
    const { error } = await lienSigne(tiers, couverture);
    assert.ok(error, "aucun lien pour qui n'a pas accès au projet");
  });

  it("un lecteur n'envoie ni ne supprime", async () => {
    const { error } = await envoyer(lecteur, `${projet.id}/scenes/${crypto.randomUUID()}.png`);
    assert.ok(error, "l'envoi par un lecteur doit être refusé");

    const { data } = await lecteur.client.storage.from(COMPARTIMENT).remove([couverture]);
    assert.equal(data.length, 0, "la suppression ne doit toucher aucun fichier");
    assert.ok((await lienSigne(porteur, couverture)).data, "le fichier doit toujours exister");
  });

  it("un éditeur et un administrateur envoient dans les dossiers prévus", async () => {
    const { error: parEditeur } = await envoyer(
      editeur,
      `${projet.id}/scenes/${crypto.randomUUID()}.png`,
    );
    assert.equal(parEditeur, null, parEditeur?.message);

    const { error: parAdmin } = await envoyer(
      administrateur,
      `${projet.id}/scenes/${crypto.randomUUID()}.png`,
    );
    assert.equal(parAdmin, null, parAdmin?.message);
  });

  it("personne n'écrit dans le dossier d'un autre projet", async () => {
    const { error } = await envoyer(porteur, `${autreProjet.id}/couverture/intrus.png`);
    assert.ok(error, "le porteur d'un projet n'écrit pas chez un autre");
  });

  it("aucun envoi hors des deux dossiers prévus", async () => {
    for (const chemin of [
      `${projet.id}/ailleurs/fichier.png`,
      `${projet.id}/couverture.png`,
      `${projet.id}/scenes/sous/dossier.png`,
      `pas-un-projet/couverture/fichier.png`,
    ]) {
      const { error } = await envoyer(porteur, chemin);
      assert.ok(error, `doit être refusé : ${chemin}`);
    }
  });

  it("seules les images sont acceptées, et 5 Mo au plus", async () => {
    const { error: texte } = await envoyer(porteur, `${projet.id}/scenes/note.txt`, {
      contenu: Buffer.from("pas une image"),
      type: "text/plain",
    });
    assert.ok(texte, "un fichier texte doit être refusé");

    const { error: lourd } = await envoyer(porteur, `${projet.id}/scenes/lourde.png`, {
      contenu: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    assert.ok(lourd, "une image de plus de 5 Mo doit être refusée");
  });

  it("un projet n'affiche comme couverture que sa propre image", async () => {
    const { error: propre } = await porteur.client
      .from("projects")
      .update({ cover_path: couverture })
      .eq("id", projet.id);
    assert.equal(propre, null, propre?.message);

    // Afficher l'image d'un autre projet délivrerait son lien signé à des
    // personnes qui n'y ont pas accès.
    const { error: etrangere } = await tiers.client
      .from("projects")
      .update({ cover_path: couverture })
      .eq("id", autreProjet.id);
    assert.ok(etrangere, "le chemin d'un autre projet doit être refusé");

    const { error: dossier } = await porteur.client
      .from("projects")
      .update({ cover_path: `${projet.id}/scenes/quelconque.png` })
      .eq("id", projet.id);
    assert.ok(dossier, "une couverture vient du dossier couverture");
  });

  it("une scène n'affiche que les images de son projet", async () => {
    const { data: scene } = await porteur.client
      .from("storyboard_scenes")
      .insert({ project_id: projet.id, position: 1, title: "Scène", created_by: porteur.id })
      .select("id")
      .single();

    const { error: propre } = await editeur.client
      .from("storyboard_scenes")
      .update({ image_path: `${projet.id}/scenes/planche.png` })
      .eq("id", scene.id);
    assert.equal(propre, null, propre?.message);

    const { error: etrangere } = await editeur.client
      .from("storyboard_scenes")
      .update({ image_path: `${autreProjet.id}/scenes/planche.png` })
      .eq("id", scene.id);
    assert.ok(etrangere, "le chemin d'un autre projet doit être refusé");
  });
});
