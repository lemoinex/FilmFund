/**
 * Valeurs d'un plan : lecture du formulaire d'administration et mise en forme.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { formaterValeurPlan, lireValeursPlan } from "../src/lib/plans.ts";

const VALIDES = {
  max_projects: "10",
  max_members: "1",
  storage_mb: "2 048",
  text_units_per_month: "300",
  images_per_month: "200",
  pdf_exports_per_month: "30",
  price_xaf_per_month: "20 000",
};

function formulaire(valeurs) {
  return (cle) => valeurs[cle];
}

describe("Valeurs d'un plan", () => {
  it("lit des entiers, espaces de groupement compris", () => {
    assert.deepEqual(lireValeursPlan(formulaire(VALIDES)), {
      valeurs: {
        max_projects: 10,
        max_members: 1,
        storage_mb: 2048,
        text_units_per_month: 300,
        images_per_month: 200,
        pdf_exports_per_month: 30,
        price_xaf_per_month: 20000,
      },
    });
  });

  it("refuse les décimales, les signes et les champs vides", () => {
    for (const valeur of ["12,5", "12.5", "-1", "", "abc", "1e3"]) {
      const resultat = lireValeursPlan(formulaire({ ...VALIDES, max_projects: valeur }));
      assert.ok("erreur" in resultat, `« ${valeur} » doit être refusé`);
      assert.match(resultat.erreur, /^Projets :/);
    }
  });

  it("exige au moins un membre : le propriétaire du studio en est un", () => {
    const resultat = lireValeursPlan(formulaire({ ...VALIDES, max_members: "0" }));
    assert.ok("erreur" in resultat);
    assert.match(resultat.erreur, /^Membres du studio :/);
  });

  it("refuse une valeur au-delà de sa borne", () => {
    const resultat = lireValeursPlan(formulaire({ ...VALIDES, price_xaf_per_month: "1000000000" }));
    assert.ok("erreur" in resultat);
    assert.match(resultat.erreur, /^Prix mensuel \(XAF\) :/);
  });

  it("met en forme prix et stockage", () => {
    // Le français groupe les milliers par une espace fine insécable.
    const lu = (cle, valeur) => formaterValeurPlan(cle, valeur).replace(/\s/g, " ");
    assert.equal(lu("price_xaf_per_month", 20000), "20 000 XAF");
    assert.equal(lu("storage_mb", 100), "100 Mo");
    assert.equal(lu("storage_mb", 2048), "2 Go");
    assert.equal(lu("storage_mb", 1536), "1,5 Go");
  });
});
