/**
 * Contrôles côté application des images : chemin et fichier.
 *
 * La base et le stockage refusent de toute façon un mauvais chemin ou un
 * mauvais fichier ; ces contrôles-ci évitent d'envoyer pour rien et donnent
 * un message clair. Ils ne doivent donc jamais être plus permissifs.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { estCheminDe, verifierFichier } from "../src/lib/images.ts";

const PROJET = "11111111-2222-3333-4444-555555555555";

describe("Chemins et fichiers d'images", () => {
  it("un chemin appartient au projet et au dossier attendus", () => {
    assert.equal(estCheminDe(`${PROJET}/couverture/a.png`, PROJET, "couverture"), true);
    assert.equal(estCheminDe(`${PROJET}/scenes/a.png`, PROJET, "couverture"), false);
    assert.equal(
      estCheminDe(`99999999-2222-3333-4444-555555555555/couverture/a.png`, PROJET, "couverture"),
      false,
    );
  });

  it("aucun sous-dossier ni fichier vide", () => {
    assert.equal(estCheminDe(`${PROJET}/couverture/`, PROJET, "couverture"), false);
    assert.equal(estCheminDe(`${PROJET}/couverture/x/a.png`, PROJET, "couverture"), false);
    assert.equal(estCheminDe(`${PROJET}/couverture/../scenes/a.png`, PROJET, "couverture"), false);
  });

  it("un préfixe de projet ne suffit pas", () => {
    // « 1111…5555-extra » commence comme l'identifiant du projet.
    assert.equal(estCheminDe(`${PROJET}-extra/couverture/a.png`, PROJET, "couverture"), false);
  });

  it("seules les images de 5 Mo au plus passent", () => {
    assert.equal(verifierFichier({ type: "image/png", size: 1000 }), null);
    assert.equal(verifierFichier({ type: "image/webp", size: 5 * 1024 * 1024 }), null);
    assert.ok(verifierFichier({ type: "image/png", size: 5 * 1024 * 1024 + 1 }));
    assert.ok(verifierFichier({ type: "image/gif", size: 1000 }));
    assert.ok(verifierFichier({ type: "application/pdf", size: 1000 }));
  });
});
