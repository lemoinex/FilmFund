/**
 * Besoin électrique, lecture des nombres saisis et résumé d'un découpage.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les calculs sont ceux de la plateforme :
 * aucun modèle n'y prend part, et ces tests en sont la seule preuve.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  DUREE_PLAN_SECONDES,
  FOCALE_MM,
  formaterDureePlan,
  resumeDecoupage,
} from "../src/lib/decoupage.ts";
import {
  besoinElectrique,
  formaterIntensite,
  formaterPuissance,
  lireEntier,
  puissanceLigne,
} from "../src/lib/materiel-calculs.ts";
import { REGLAGES_PAR_DEFAUT } from "../src/lib/materiel.ts";

const equipement = (quantity, unit_power_watts, simultaneous = true) => ({
  quantity,
  unit_power_watts,
  simultaneous,
});

// Espaces insécables de la mise en forme française ramenées à des espaces.
const net = (texte) => texte.replace(/[  ]/g, " ");

describe("Besoin électrique", () => {
  it("additionne quantités × puissances, divise par la tension, ajoute la marge", () => {
    const besoin = besoinElectrique(
      [equipement(2, 650), equipement(1, 1000), equipement(4, 0)],
      REGLAGES_PAR_DEFAUT,
    );

    assert.equal(besoin.simultanee, 2300);
    assert.equal(besoin.installee, 2300);
    assert.equal(besoin.intensite, 10);
    assert.equal(besoin.groupe, 2990);
    assert.equal(besoin.sansPuissance, 0);
  });

  it("laisse hors de la charge simultanée ce qui ne tourne pas avec le reste", () => {
    const besoin = besoinElectrique(
      [equipement(1, 2000), equipement(3, 500, false)],
      REGLAGES_PAR_DEFAUT,
    );

    assert.equal(besoin.simultanee, 2000);
    assert.equal(besoin.installee, 3500);
    assert.equal(besoin.groupe, 2600);
  });

  it("ne compte pas une puissance non renseignée, et le dit", () => {
    const besoin = besoinElectrique(
      [equipement(1, 800), equipement(5, null), equipement(1, null, false)],
      REGLAGES_PAR_DEFAUT,
    );

    assert.equal(besoin.simultanee, 800);
    assert.equal(besoin.sansPuissance, 2);
    assert.equal(puissanceLigne(equipement(5, null)), null);
    assert.equal(puissanceLigne(equipement(5, 0)), 0);
  });

  it("suit la tension et la marge du projet", () => {
    const liste = [equipement(1, 2200)];

    assert.equal(besoinElectrique(liste, { tension: 110, marge: 30 }).intensite, 20);
    assert.equal(besoinElectrique(liste, { tension: 220, marge: 0 }).groupe, 2200);
    assert.equal(besoinElectrique(liste, { tension: 220, marge: 100 }).groupe, 4400);
  });

  it("une liste vide ne demande rien, sans division par zéro", () => {
    assert.deepEqual(besoinElectrique([], REGLAGES_PAR_DEFAUT), {
      installee: 0,
      simultanee: 0,
      intensite: 0,
      groupe: 0,
      sansPuissance: 0,
    });
    assert.equal(besoinElectrique([equipement(1, 100)], { tension: 0, marge: 30 }).intensite, 0);
  });

  it("par défaut, 230 V et 30 % : le choix du cahier des charges", () => {
    assert.deepEqual({ ...REGLAGES_PAR_DEFAUT }, { tension: 230, marge: 30 });
  });

  it("écrit les watts sous le kilowatt, les kilowatts au-delà", () => {
    assert.equal(net(formaterPuissance(0)), "0 W");
    assert.equal(net(formaterPuissance(650)), "650 W");
    assert.equal(net(formaterPuissance(1000)), "1 kW");
    assert.equal(net(formaterPuissance(2990)), "3 kW");
    assert.equal(net(formaterPuissance(2600)), "2,6 kW");
    assert.equal(net(formaterIntensite(11.304)), "11,3 A");
  });
});

describe("Nombres saisis", () => {
  it("un champ vide n'est pas une valeur", () => {
    assert.equal(lireEntier("", FOCALE_MM), null);
    assert.equal(lireEntier("   ", FOCALE_MM), null);
  });

  it("lit un entier dans ses bornes", () => {
    assert.equal(lireEntier(" 35 ", FOCALE_MM), 35);
    assert.equal(lireEntier(String(FOCALE_MM.max), FOCALE_MM), FOCALE_MM.max);
    assert.equal(lireEntier("0", { min: 0, max: 10 }), 0);
  });

  it("refuse ce qui n'est pas un entier écrit en chiffres, sans arrondir", () => {
    for (const saisie of ["12,5", "12.5", "1e3", "-4", "+4", "0x10", "douze", "3 5", "٣"]) {
      assert.equal(lireEntier(saisie, { min: 0, max: 100000 }), "invalide", saisie);
    }
  });

  it("refuse un entier hors bornes", () => {
    assert.equal(lireEntier("0", FOCALE_MM), "invalide");
    assert.equal(lireEntier(String(FOCALE_MM.max + 1), FOCALE_MM), "invalide");
    assert.equal(lireEntier("99999999999999999999", DUREE_PLAN_SECONDES), "invalide");
  });
});

describe("Résumé d'un découpage", () => {
  it("compte les plans et additionne leurs durées", () => {
    assert.equal(resumeDecoupage([]), "aucun plan");
    assert.equal(resumeDecoupage([{ duration_seconds: 8 }]), "1 plan · 8 s");
    assert.equal(
      resumeDecoupage([{ duration_seconds: 40 }, { duration_seconds: 25 }]),
      "2 plans · 1 min 05 s",
    );
  });

  it("tait la durée dès qu'un plan n'a pas la sienne : un total partiel tromperait", () => {
    assert.equal(
      resumeDecoupage([{ duration_seconds: 40 }, { duration_seconds: null }]),
      "2 plans",
    );
  });

  it("écrit une durée en secondes, puis en minutes", () => {
    assert.equal(formaterDureePlan(59), "59 s");
    assert.equal(formaterDureePlan(60), "1 min");
    assert.equal(formaterDureePlan(3600), "60 min");
  });
});
