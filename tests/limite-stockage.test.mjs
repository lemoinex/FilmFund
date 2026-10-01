/**
 * Limite de stockage, par la vraie API.
 *
 * Remplir 100 Mo par de vrais envois serait long : un fichier fictif de
 * taille choisie est inscrit comme le ferait l'exploitant, sans contenu.
 * Les envois, eux, passent par l'API réelle — c'est elle qui inscrit la
 * taille reçue, et qui doit échouer quand la limite est atteinte.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { changerPlan, creerCompte, creerProjet, executerSqlLocal } from "./helpers.mjs";

const COMPARTIMENT = "project-images";
const LIMITE_DU_PLAN = "53400";

// Plus petite image PNG valide : un pixel transparent.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

function envoyer(compte, chemin) {
  return compte.client.storage
    .from(COMPARTIMENT)
    .upload(chemin, PIXEL, { contentType: "image/png", upsert: false });
}

async function inscrireFichierFictif(compte, chemin, octets) {
  const { code, erreurs } = await executerSqlLocal(
    `insert into storage.objects (bucket_id, name, owner_id, metadata)
     values ('${COMPARTIMENT}', '${chemin}', '${compte.id}', '{"size": ${octets}, "mimetype": "image/png"}');`,
  );
  assert.equal(code, 0, erreurs);
}

async function fichiers(compte, dossier) {
  const { data } = await compte.client.storage.from(COMPARTIMENT).list(dossier);
  return (data ?? []).map((f) => f.name).sort();
}

describe("Limite de stockage", () => {
  it("un envoi qui dépasserait la limite est refusé et rien n'est stocké ; la place libérée sert de nouveau", async () => {
    const compte = await creerCompte("stockage", "Stockage", { plan: "gratuit" });
    const projet = await creerProjet(compte, "Projet presque plein");
    const remplissage = `${projet.id}/scenes/remplissage.png`;

    // Plan Gratuit : 100 Mo, soit 104 857 600 octets. Il en reste 10, moins
    // que l'image envoyée (un pixel PNG, environ 70 octets).
    await inscrireFichierFictif(compte, remplissage, 104_857_590);

    const { error } = await envoyer(compte, `${projet.id}/scenes/de-trop.png`);
    assert.match(error?.message ?? "", new RegExp(LIMITE_DU_PLAN));
    assert.deepEqual(await fichiers(compte, `${projet.id}/scenes`), ["remplissage.png"]);

    const { error: retrait } = await compte.client.storage.from(COMPARTIMENT).remove([remplissage]);
    assert.equal(retrait, null, retrait?.message);

    const { error: apres } = await envoyer(compte, `${projet.id}/scenes/de-trop.png`);
    assert.equal(apres, null, apres?.message);
  });

  it("deux envois simultanés ne se partagent pas les derniers octets", async () => {
    const compte = await creerCompte("stockage-course", "Course", { plan: "gratuit" });
    const projet = await creerProjet(compte, "Projet disputé");

    // Deux inscriptions de 60 Mo, comme l'API les ferait : chacune tient
    // seule dans les 100 Mo du plan, pas les deux. La première garde son
    // verrou deux secondes ; la seconde arrive pendant ce temps.
    const inscription = (nom, attente) => `
      begin;
      insert into storage.objects (bucket_id, name, owner_id, metadata)
      values ('${COMPARTIMENT}', '${projet.id}/scenes/${nom}', '${compte.id}', '{"size": ${60 * 1048576}}');
      select pg_sleep(${attente});
      commit;
    `;
    const premiere = executerSqlLocal(inscription("premiere.png", 2));
    await new Promise((r) => setTimeout(r, 500));
    const seconde = executerSqlLocal(inscription("seconde.png", 0));
    const [a, b] = await Promise.all([premiere, seconde]);

    assert.equal(a.code, 0, `la première inscription doit aboutir : ${a.erreurs}`);
    assert.notEqual(b.code, 0, "la seconde doit être refusée");
    assert.match(b.erreurs, /ne permet pas de stocker davantage/);
    assert.deepEqual(await fichiers(compte, `${projet.id}/scenes`), ["premiere.png"]);
  });

  it("au-delà de la limite, après un passage à un plan inférieur, l'existant reste consultable et supprimable", async () => {
    const compte = await creerCompte("stockage-reduit", "Stockage réduit", { plan: "studio" });
    const projet = await creerProjet(compte, "Projet au-delà");
    const image = `${projet.id}/couverture/image.png`;
    const { error: envoi } = await envoyer(compte, image);
    assert.equal(envoi, null, envoi?.message);
    await inscrireFichierFictif(compte, `${projet.id}/scenes/lourd.png`, 150 * 1048576);

    // 150 Mo occupés, plan ramené à 100 Mo.
    await changerPlan(compte.id, "gratuit");

    const { data: lien, error: erreurLien } = await compte.client.storage
      .from(COMPARTIMENT)
      .createSignedUrl(image, 60);
    assert.equal(erreurLien, null, erreurLien?.message);
    const reponse = await fetch(lien.signedUrl);
    assert.equal(reponse.status, 200);

    const { error: refus } = await envoyer(compte, `${projet.id}/scenes/nouvelle.png`);
    assert.match(refus?.message ?? "", new RegExp(LIMITE_DU_PLAN));

    const { error: suppression } = await compte.client.storage.from(COMPARTIMENT).remove([image]);
    assert.equal(suppression, null, suppression?.message);
  });
});
