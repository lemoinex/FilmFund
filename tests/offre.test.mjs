/**
 * Offre publique : composition des cartes et mise en mots des quotas.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { composerOffre, montantMensuel, quotasEnMots, uniteTexteEnMots } from "../src/lib/offre.ts";

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
        "2 exports par mois (PDF, Word ou ZIP)",
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
        "150 exports par mois (PDF, Word ou ZIP)",
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

const BAREME = {
  logline: 1,
  synopsis_short: 1,
  synopsis_standard: 2,
  synopsis_detailed: 3,
  intention_note: 3,
  direction_note: 3,
  pitch_extended: 2,
  pitch_oral: 2,
  dramatic_analysis: 4,
  character_list: 3,
  episode_list: 3,
  budget_plan: 6,
  schedule_plan: 3,
  shot_list: 4,
  gear_list: 5,
  research: 3,
  cultural_context: 3,
  treatment: 8,
  bible: 10,
  screenplay_per_sequence: 2,
  dialogue_per_scene: 1,
  text_edit_per_passage: 1,
};

describe("Barème des unités texte", () => {
  it("met en mots le barème de mise en service", () => {
    assert.equal(
      uniteTexteEnMots(BAREME),
      "1 pour une logline, de 1 à 3 pour un synopsis, 3 pour une note d'intention, 3 pour une note de réalisation, 2 pour un pitch développé ou oral, 4 pour une analyse dramaturgique, 3 pour une liste de personnages, 3 pour une liste d'épisodes, 6 pour un budget prévisionnel, 3 pour un planning prévisionnel, 4 pour le découpage d'une scène, 5 pour une liste de matériel, 3 pour une recherche documentaire, 3 pour un contexte historique et culturel, 8 pour un traitement, 10 pour une bible, 2 par séquence de scénario, 1 par scène de dialogues et 1 par retouche d'un passage",
    );
  });

  it("suit une nouvelle version : fourchette des synopsis, un seul nombre s'ils coûtent autant", () => {
    assert.match(
      uniteTexteEnMots({ ...BAREME, synopsis_short: 2, synopsis_detailed: 5, treatment: 9 }),
      /de 2 à 5 pour un synopsis, .*9 pour un traitement/,
    );
    assert.match(
      uniteTexteEnMots({
        ...BAREME,
        synopsis_short: 2,
        synopsis_standard: 2,
        synopsis_detailed: 2,
      }),
      /, 2 pour un synopsis,/,
    );
    assert.match(lisible(uniteTexteEnMots({ ...BAREME, bible: 1500 })), /1 500 pour une bible/);
  });
});
