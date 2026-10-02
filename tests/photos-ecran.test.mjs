/**
 * Photo de profil (lot Q2) : chemins, limites et octets réels.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Le cloisonnement du stockage a sa propre suite.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  DELAI_ORPHELINE_MS,
  estCheminPhotoDe,
  extensionDesOctets,
  extensionDuChemin,
  initiales,
  photosOrphelines,
  TAILLE_PHOTO_MAX,
  TYPES_PHOTO,
  verifierFichierPhoto,
} from "../src/lib/photos.ts";

const COMPTE = "0b6a3f0e-5c1d-4e8a-9f2b-7d4c1e0a9b3c";
const AUTRE = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
const NOM = "4f1c2b3a-9d8e-4f7a-8b6c-5d4e3f2a1b0c";

const octets = (...valeurs) => new Uint8Array(valeurs);

describe("Photo : chemin", () => {
  it("admet une photo du dossier du compte, sous un nom tiré au hasard", () => {
    for (const extension of ["jpg", "png", "webp"]) {
      assert.equal(estCheminPhotoDe(`${COMPTE}/${NOM}.${extension}`, COMPTE), true, extension);
    }
  });

  it("refuse le dossier d'un autre compte, un sous-dossier ou un nom choisi", () => {
    for (const chemin of [
      `${AUTRE}/${NOM}.png`,
      `${COMPTE}/scenes/${NOM}.png`,
      `${COMPTE}/photo.png`,
      `${COMPTE}/${NOM}.html`,
      `${COMPTE}/${NOM}.png/`,
      `${COMPTE}/../${AUTRE}/${NOM}.png`,
      `${COMPTE}/${NOM.toUpperCase()}.png`,
      ` ${COMPTE}/${NOM}.png`,
      "",
    ]) {
      assert.equal(estCheminPhotoDe(chemin, COMPTE), false, chemin);
    }
    assert.equal(estCheminPhotoDe(null, COMPTE), false);
    assert.equal(estCheminPhotoDe(3, COMPTE), false);
    // Un identifiant de compte mal formé ne doit pas ouvrir une expression
    // régulière arbitraire.
    assert.equal(estCheminPhotoDe(`x/${NOM}.png`, ".*"), false);
  });

  it("lit l'extension d'un chemin", () => {
    assert.equal(extensionDuChemin(`${COMPTE}/${NOM}.webp`), "webp");
  });
});

describe("Photo : fichier choisi", () => {
  it("accepte JPEG, PNG et WebP jusqu'à 2 Mo", () => {
    assert.deepEqual(Object.keys(TYPES_PHOTO), ["image/jpeg", "image/png", "image/webp"]);
    assert.equal(TAILLE_PHOTO_MAX, 2 * 1024 * 1024);
    assert.equal(verifierFichierPhoto({ type: "image/png", size: TAILLE_PHOTO_MAX }), null);
  });

  it("refuse un autre format, ou un fichier trop lourd", () => {
    assert.match(verifierFichierPhoto({ type: "image/gif", size: 10 }), /JPEG, PNG ou WebP/);
    assert.match(verifierFichierPhoto({ type: "text/html", size: 10 }), /JPEG, PNG ou WebP/);
    assert.match(verifierFichierPhoto({ type: "image/png", size: TAILLE_PHOTO_MAX + 1 }), /2 Mo/);
  });
});

describe("Photo : octets réels", () => {
  it("reconnaît JPEG, PNG et WebP à leurs premiers octets", () => {
    assert.equal(extensionDesOctets(octets(0xff, 0xd8, 0xff, 0xe0, 0, 0x10)), "jpg");
    assert.equal(
      extensionDesOctets(octets(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)),
      "png",
    );
    assert.equal(
      extensionDesOctets(
        octets(0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50),
      ),
      "webp",
    );
  });

  it("refuse ce qui n'en est pas : HTML, GIF, RIFF d'un autre format, fichier vide", () => {
    const texte = (chaine) => new TextEncoder().encode(chaine);
    assert.equal(extensionDesOctets(texte("<html><script>")), null);
    assert.equal(extensionDesOctets(texte("GIF89a")), null);
    assert.equal(extensionDesOctets(texte("RIFF$\u0000\u0000\u0000WAVEfmt ")), null);
    assert.equal(extensionDesOctets(octets()), null);
    // Une signature tronquée n'est pas une signature.
    assert.equal(extensionDesOctets(octets(0x89, 0x50, 0x4e, 0x47)), null);
  });
});

describe("Photo : fichiers orphelins", () => {
  const maintenant = Date.parse("2026-10-03T12:00:00Z");
  const il_y_a = (ms) => new Date(maintenant - ms).toISOString();

  it("supprime tout sauf la photo en place, au-delà d'une heure", () => {
    const fichiers = [
      { name: "a.png", created_at: il_y_a(DELAI_ORPHELINE_MS + 1000) },
      { name: "b.png", created_at: il_y_a(DELAI_ORPHELINE_MS + 1000) },
      { name: "c.png", created_at: il_y_a(5 * 60 * 1000) },
      { name: "d.png", created_at: null },
    ];
    assert.deepEqual(photosOrphelines(COMPTE, fichiers, `${COMPTE}/b.png`, maintenant), [
      `${COMPTE}/a.png`,
    ]);
    assert.deepEqual(photosOrphelines(COMPTE, fichiers, null, maintenant), [
      `${COMPTE}/a.png`,
      `${COMPTE}/b.png`,
    ]);
  });
});

describe("Photo : initiales", () => {
  it("prend la première lettre du premier et du dernier mot", () => {
    assert.equal(initiales("Mireille Ébodé"), "MÉ");
    assert.equal(initiales("awa marie diop"), "AD");
    assert.equal(initiales("  Ɛyɔ  "), "Ɛ");
    assert.equal(initiales(""), "?");
  });
});
