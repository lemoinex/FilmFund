/**
 * Photo de profil (lot Q2), éprouvée par l'API de stockage réelle.
 *
 * Une photo n'est lisible que de son titulaire et des administrateurs.
 * Personne n'écrit hors de son dossier, ni sous un nom de son choix ; un
 * profil ne désigne jamais la photo d'un autre compte.
 *
 * Le contrôle des octets réels se fait dans l'action serveur, que ces tests
 * n'appellent pas : sa règle est éprouvée par la suite du module pur, et son
 * branchement par le test d'architecture.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientAnonyme,
  clientDeService,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const COMPARTIMENT = "profile-photos";

// Plus petite image PNG valide : un pixel transparent.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const nouveauChemin = (compte, extension = "png") =>
  `${compte.id}/${crypto.randomUUID()}.${extension}`;

function envoyer(compte, chemin, { contenu = PIXEL, type = "image/png" } = {}) {
  return compte.client.storage
    .from(COMPARTIMENT)
    .upload(chemin, contenu, { contentType: type, upsert: false });
}

function lienSigne(client, chemin) {
  return client.storage.from(COMPARTIMENT).createSignedUrl(chemin, 60);
}

async function definirModePrive(actif) {
  const { error } = await clientDeService()
    .from("app_settings")
    .update({ private_admin_only: actif })
    .eq("id", true);
  assert.equal(error, null, error?.message);
}

describe("Photo de profil", () => {
  let alice;
  let bob;
  let administratrice;
  let photoAlice;

  before(async () => {
    alice = await creerCompte("photo-alice", "Alice Diop");
    bob = await creerCompte("photo-bob", "Bob Traoré");
    administratrice = await creerCompte("photo-admin", "Administratrice");
    await promouvoirAdministrateur(administratrice.id);

    photoAlice = nouveauChemin(alice);
    const { error } = await envoyer(alice, photoAlice);
    assert.equal(error, null, error?.message);
  });

  after(async () => {
    await definirModePrive(false);
  });

  it("le compartiment est privé, borné à 2 Mo et aux trois formats d'image", async () => {
    const { data, error } = await clientDeService().storage.getBucket(COMPARTIMENT);
    assert.equal(error, null, error?.message);
    assert.equal(data.public, false);
    assert.equal(Number(data.file_size_limit), 2 * 1024 * 1024);
    assert.deepEqual([...data.allowed_mime_types].sort(), [
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("le titulaire envoie sa photo, la lit et la rattache à son profil", async () => {
    const { data: lien, error } = await lienSigne(alice.client, photoAlice);
    assert.equal(error, null, error?.message);
    assert.ok(lien?.signedUrl);

    const { data, error: rattachement } = await alice.client
      .from("profiles")
      .update({ avatar_path: photoAlice })
      .eq("id", alice.id)
      .select("avatar_path")
      .single();
    assert.equal(rattachement, null, rattachement?.message);
    assert.equal(data.avatar_path, photoAlice);
  });

  it("personne n'écrit dans le dossier d'un autre compte, ni hors de la forme prévue", async () => {
    const refus = [
      [bob, nouveauChemin(alice)],
      [alice, `${alice.id}/sous-dossier/${crypto.randomUUID()}.png`],
      [alice, `${alice.id}/photo.png`],
      [alice, `${alice.id}/${crypto.randomUUID()}.html`],
      [alice, `${crypto.randomUUID()}.png`],
    ];
    for (const [compte, chemin] of refus) {
      const { error } = await envoyer(compte, chemin);
      assert.ok(error, `envoi accepté : ${chemin}`);
    }

    const { data } = await clientDeService().storage.from(COMPARTIMENT).list(alice.id);
    assert.deepEqual(
      (data ?? []).map((f) => `${alice.id}/${f.name}`),
      [photoAlice],
      "seule la photo d'Alice doit être dans son dossier",
    );
  });

  it("le compartiment refuse un fichier trop lourd ou d'un autre type", async () => {
    const lourd = await envoyer(alice, nouveauChemin(alice), {
      contenu: Buffer.alloc(2 * 1024 * 1024 + 1, 0),
    });
    assert.ok(lourd.error, "un fichier de plus de 2 Mo doit être refusé");

    const html = await envoyer(alice, nouveauChemin(alice), {
      contenu: Buffer.from("<html><script>alert(1)</script></html>"),
      type: "text/html",
    });
    assert.ok(html.error, "un type hors liste doit être refusé");
  });

  it("aucun autre compte, ni visiteur, ne lit la photo", async () => {
    for (const client of [bob.client, clientAnonyme()]) {
      const { data } = await lienSigne(client, photoAlice);
      assert.ok(!data?.signedUrl, "aucun lien signé ne doit être délivré");
      const { data: fichier } = await client.storage.from(COMPARTIMENT).download(photoAlice);
      assert.equal(fichier, null);
    }

    const { data: liste } = await bob.client.storage.from(COMPARTIMENT).list(alice.id);
    assert.deepEqual(liste ?? [], []);
  });

  it("n'arrive pas aux coéquipiers", async () => {
    const projet = await creerProjet(alice, "Les Eaux de Kribi");
    await faireEntrer(alice, projet.id, bob, "editor");

    const { data } = await lienSigne(bob.client, photoAlice);
    assert.ok(!data?.signedUrl);
    const { data: profil } = await bob.client
      .from("profiles")
      .select("avatar_path")
      .eq("id", alice.id);
    assert.deepEqual(profil, []);
  });

  it("aucun autre compte ne supprime la photo", async () => {
    await bob.client.storage.from(COMPARTIMENT).remove([photoAlice]);

    const { data } = await lienSigne(alice.client, photoAlice);
    assert.ok(data?.signedUrl, "la photo d'Alice doit toujours exister");
  });

  it("un profil ne désigne jamais la photo d'un autre compte", async () => {
    const refus = [
      photoAlice,
      `${bob.id}/sous-dossier/${crypto.randomUUID()}.png`,
      `${bob.id}/photo.png`,
      `${bob.id}/${crypto.randomUUID()}.html`,
    ];
    for (const chemin of refus) {
      const { error } = await bob.client
        .from("profiles")
        .update({ avatar_path: chemin })
        .eq("id", bob.id);
      assert.equal(error?.code, "23514", chemin);
    }
  });

  it("un administrateur lit la photo, et sa correction du profil est journalisée sans valeur", async () => {
    const { data: lien } = await lienSigne(administratrice.client, photoAlice);
    assert.ok(lien?.signedUrl);

    const { error } = await administratrice.client
      .from("profiles")
      .update({ avatar_path: null })
      .eq("id", alice.id);
    assert.equal(error, null, error?.message);

    const { data: journal } = await administratrice.client
      .from("admin_audit_log")
      .select("*")
      .eq("action", "modification_profil")
      .eq("details->>compte", alice.id);
    assert.equal(journal.length, 1);
    assert.deepEqual(journal[0].details.champs, ["avatar_path"]);
    assert.ok(!JSON.stringify(journal).includes(photoAlice));

    // Remise en place pour la suite.
    await alice.client.from("profiles").update({ avatar_path: photoAlice }).eq("id", alice.id);
  });

  it("le titulaire supprime sa propre photo", async () => {
    const autre = nouveauChemin(alice, "webp");
    const { error } = await envoyer(alice, autre, { type: "image/webp" });
    assert.equal(error, null, error?.message);

    const { data } = await alice.client.storage.from(COMPARTIMENT).remove([autre]);
    assert.equal(data?.length, 1);
  });

  it("suit le mode privé : fermé au titulaire, ouvert aux administrateurs", async () => {
    await definirModePrive(true);
    try {
      const { data: lien } = await lienSigne(alice.client, photoAlice);
      assert.ok(!lien?.signedUrl, "en mode privé, un membre ne lit plus sa photo");

      const envoi = await envoyer(alice, nouveauChemin(alice));
      assert.ok(envoi.error, "en mode privé, un membre n'envoie plus de photo");

      const { data: lienAdmin } = await lienSigne(administratrice.client, photoAlice);
      assert.ok(lienAdmin?.signedUrl, "un administrateur lit toujours la photo");
    } finally {
      await definirModePrive(false);
    }
  });
});
