/**
 * Liste blanche du mode privé, côté application.
 *
 * Importe directement le module TypeScript : Node retire les annotations de
 * type à la volée (Node 22.18 et suivants).
 */
import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";

import { accesAutorise, estEmailAdminAutorise, modePriveActif } from "../src/lib/acces-prive.ts";

const ENVIRONNEMENT = { ...process.env };

function configurer({ mode, liste }) {
  if (mode === undefined) delete process.env.PRIVATE_ADMIN_ONLY_MODE;
  else process.env.PRIVATE_ADMIN_ONLY_MODE = mode;

  if (liste === undefined) delete process.env.ALLOWED_ADMIN_EMAILS;
  else process.env.ALLOWED_ADMIN_EMAILS = liste;
}

describe("Liste blanche du mode privé", () => {
  afterEach(() => {
    process.env = { ...ENVIRONNEMENT };
  });

  it("mode levé : tout compte connecté entre, comme avant", () => {
    configurer({ mode: undefined, liste: "a@exemple.test" });
    assert.equal(modePriveActif(), false);
    assert.equal(accesAutorise("inconnu@exemple.test"), true);

    configurer({ mode: "false", liste: "a@exemple.test" });
    assert.equal(accesAutorise("inconnu@exemple.test"), true);
  });

  it("mode actif : seules les adresses de la liste entrent", () => {
    configurer({ mode: "true", liste: "a@exemple.test,b@exemple.test" });
    assert.equal(accesAutorise("a@exemple.test"), true);
    assert.equal(accesAutorise("b@exemple.test"), true);
    assert.equal(accesAutorise("c@exemple.test"), false);
  });

  it("la comparaison ignore la casse et les espaces", () => {
    configurer({ mode: "true", liste: " A@Exemple.test , b@exemple.test " });
    assert.equal(estEmailAdminAutorise("a@exemple.test"), true);
    assert.equal(estEmailAdminAutorise("  B@EXEMPLE.TEST "), true);
  });

  it("aucune adresse ne passe sans adresse", () => {
    configurer({ mode: "true", liste: "a@exemple.test" });
    assert.equal(accesAutorise(null), false);
    assert.equal(accesAutorise(undefined), false);
    assert.equal(accesAutorise(""), false);
  });

  it("une liste vide ou absente ferme l'application plutôt que de l'ouvrir", () => {
    configurer({ mode: "true", liste: undefined });
    assert.equal(accesAutorise("a@exemple.test"), false);

    configurer({ mode: "true", liste: " , ," });
    assert.equal(accesAutorise("a@exemple.test"), false);
  });

  it("une adresse qui en contient une autre n'est pas confondue avec elle", () => {
    configurer({ mode: "true", liste: "a@exemple.test" });
    assert.equal(accesAutorise("xa@exemple.test"), false);
    assert.equal(accesAutorise("a@exemple.test.attaquant.test"), false);
  });

  it("la valeur du drapeau est lue sans tolérance ambiguë", () => {
    configurer({ mode: "TRUE", liste: "a@exemple.test" });
    assert.equal(modePriveActif(), true);

    for (const valeur of ["1", "yes", "vrai", ""]) {
      configurer({ mode: valeur, liste: "a@exemple.test" });
      assert.equal(modePriveActif(), false, `« ${valeur} » ne doit pas activer le mode`);
    }
  });
});
