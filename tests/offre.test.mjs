/**
 * Offre publique : composition des cartes et mise en mots des quotas.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { composerOffre, montantMensuel, quotasEnMots } from "../src/lib/offre.ts";

function version(plan_code, version_number, valeurs = {}) {
  return {
    plan_code,
    version_number,
    max_projects: 10,
    max_members: 1,
    storage_mb: 2048,
    text_units_per_month: 300,
    images_per_month: 200,
    pdf_exports_per_month: 30,
    price_xaf_per_month: 20000,
    ...valeurs,
  };
}

const PLANS = [
  { code: "studio", name: "Studio", position: 3 },
  { code: "gratuit", name: "Gratuit", position: 1 },
  { code: "pro", name: "Pro", position: 2 },
];

// Le français groupe les milliers par une espace fine insécable.
const lisible = (texte) => texte.replace(/\s/g, " ");

describe("Offre publique", () => {
  it("présente la dernière version publiée de chaque plan, dans l'ordre d'affichage", () => {
    const cartes = composerOffre(PLANS, [
      version("pro", 1, { price_xaf_per_month: 20000 }),
      version("pro", 3, { price_xaf_per_month: 22000 }),
      version("pro", 2, { price_xaf_per_month: 21000 }),
      version("gratuit", 1, { price_xaf_per_month: 0 }),
      version("studio", 1, { price_xaf_per_month: 100000 }),
    ]);

    assert.deepEqual(
      cartes.map((c) => [c.code, c.version.version_number]),
      [
        ["gratuit", 1],
        ["pro", 3],
        ["studio", 1],
      ],
    );
    assert.equal(cartes.find((c) => c.code === "pro").positionnement.recommande, true);
  });

  it("n'invente rien : un plan sans version ou sans positionnement n'est pas présenté", () => {
    const cartes = composerOffre(
      [...PLANS, { code: "essai", name: "Essai", position: 4 }],
      [version("gratuit", 1), version("essai", 1)],
    );
    assert.deepEqual(
      cartes.map((c) => c.code),
      ["gratuit"],
    );
  });

  it("met les quotas en mots, accords compris", () => {
    const stockage = (mo) => (mo >= 1024 ? `${mo / 1024} Go` : `${mo} Mo`);

    assert.deepEqual(
      quotasEnMots(
        version("gratuit", 1, {
          max_projects: 1,
          max_members: 1,
          storage_mb: 100,
          text_units_per_month: 20,
          images_per_month: 10,
          pdf_exports_per_month: 2,
        }),
        stockage,
      ),
      [
        "1 projet actif",
        "1 membre",
        "100 Mo de stockage d'images",
        "20 unités texte par mois",
        "10 images générées par mois",
        "2 exports PDF par mois",
      ],
    );

    assert.deepEqual(
      quotasEnMots(
        version("studio", 1, {
          max_projects: 50,
          max_members: 10,
          storage_mb: 20480,
          text_units_per_month: 1500,
          images_per_month: 1000,
          pdf_exports_per_month: 150,
        }),
        stockage,
      ).map(lisible),
      [
        "50 projets actifs",
        "Jusqu'à 10 membres",
        "20 Go de stockage d'images",
        "1 500 unités texte par mois",
        "1 000 images générées par mois",
        "150 exports PDF par mois",
      ],
    );
  });

  it("formate le montant mensuel", () => {
    assert.equal(
      lisible(montantMensuel(version("pro", 1, { price_xaf_per_month: 20000 }))),
      "20 000",
    );
    assert.equal(montantMensuel(version("gratuit", 1, { price_xaf_per_month: 0 })), "0");
  });
});
