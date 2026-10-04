/**
 * Redirection après connexion ou confirmation : la destination reste sur le
 * site, quelle que soit la valeur glissée dans le lien.
 *
 * Chaque valeur refusée est d'abord résolue comme le ferait un navigateur :
 * le test établit qu'elle quitterait bien le site, puis qu'elle est écartée.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { destinationInterne } from "../src/lib/destination-interne.ts";

const SITE = "https://app.exemple.test";
const DEFAUT = "/tableau-de-bord";

describe("Destination interne d'une redirection", () => {
  it("garde un chemin du site, avec ses paramètres", () => {
    for (const chemin of ["/projets", "/projets/abc/documents?onglet=1", "/profil#photo"]) {
      assert.equal(destinationInterne(chemin, DEFAUT), chemin);
      assert.equal(new URL(chemin, SITE).origin, SITE);
    }
  });

  it("écarte toute valeur qu'un navigateur résoudrait hors du site", () => {
    const externes = [
      "//exemple-tiers.test",
      "/\\exemple-tiers.test",
      "/\\/exemple-tiers.test",
      "/\t/exemple-tiers.test",
      "/\n/exemple-tiers.test",
      "/\r/exemple-tiers.test",
    ];
    for (const valeur of externes) {
      assert.notEqual(new URL(valeur, SITE).origin, SITE, JSON.stringify(valeur));
      assert.equal(destinationInterne(valeur, DEFAUT), DEFAUT, JSON.stringify(valeur));
    }
  });

  it("écarte une adresse absolue, une valeur vide ou qui n'est pas un texte", () => {
    for (const valeur of ["https://exemple-tiers.test", "javascript:alert(1)", "projets", ""]) {
      assert.equal(destinationInterne(valeur, DEFAUT), DEFAUT);
    }
    assert.equal(destinationInterne(null, DEFAUT), DEFAUT);
    assert.equal(destinationInterne(undefined, DEFAUT), DEFAUT);
    assert.equal(destinationInterne({}, DEFAUT), DEFAUT);
  });
});
