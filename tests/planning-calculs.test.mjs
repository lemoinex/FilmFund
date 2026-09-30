/**
 * Calculs du planning : dates, retards, avancement.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  calculerAvancement,
  comparerEtapes,
  estEnRetard,
  formaterJour,
  formaterPeriode,
  lireDate,
} from "../src/lib/planning-calculs.ts";

describe("Calculs du planning", () => {
  it("lireDate n'accepte que des jours qui existent", () => {
    assert.equal(lireDate("2026-11-30"), "2026-11-30");
    assert.equal(lireDate("2028-02-29"), "2028-02-29", "2028 est bissextile");
    assert.equal(lireDate("2027-02-29"), null, "2027 ne l'est pas");
    assert.equal(lireDate("2026-02-31"), null);
    assert.equal(lireDate("2026-13-01"), null);
    assert.equal(lireDate("30/11/2026"), null);
    assert.equal(lireDate(""), null);
  });

  it("un jour s'affiche tel qu'il a été saisi, quel que soit le fuseau", () => {
    // Formaté en heure locale, le 1er janvier à minuit UTC deviendrait le
    // 31 décembre à l'ouest de Greenwich.
    assert.equal(formaterJour("2027-01-01"), "1 janvier 2027");
  });

  it("la période se lit selon les dates renseignées", () => {
    assert.equal(formaterPeriode("2027-01-10", "2027-01-24"), "du 10 janv. au 24 janvier 2027");
    assert.equal(formaterPeriode(null, "2026-11-30"), "échéance le 30 novembre 2026");
    assert.equal(formaterPeriode("2027-03-01", null), "à partir du 1 mars 2027");
    assert.equal(formaterPeriode("2027-03-01", "2027-03-01"), "le 1 mars 2027");
    assert.equal(formaterPeriode(null, null), "sans date");
  });

  it("une étape est en retard si son échéance est passée et qu'elle n'est pas terminée", () => {
    const jour = "2026-10-15";
    assert.equal(estEnRetard({ status: "a_faire", due_on: "2026-10-14" }, jour), true);
    assert.equal(estEnRetard({ status: "en_cours", due_on: "2026-10-14" }, jour), true);
    assert.equal(estEnRetard({ status: "termine", due_on: "2026-10-14" }, jour), false);
    assert.equal(
      estEnRetard({ status: "a_faire", due_on: "2026-10-15" }, jour),
      false,
      "le jour même n'est pas un retard",
    );
    assert.equal(estEnRetard({ status: "a_faire", due_on: null }, jour), false);
  });

  it("l'avancement est la part des étapes terminées, et n'existe pas sans étape", () => {
    assert.equal(calculerAvancement([]), null);
    assert.deepEqual(
      calculerAvancement([
        { status: "termine" },
        { status: "termine" },
        { status: "en_cours" },
        { status: "a_faire" },
        { status: "a_faire" },
        { status: "a_faire" },
        { status: "a_faire" },
        { status: "a_faire" },
      ]),
      { terminees: 2, total: 8, pourcent: 25 },
    );
    assert.equal(
      calculerAvancement([{ status: "termine" }, { status: "a_faire" }, { status: "a_faire" }])
        .pourcent,
      33,
    );
  });

  it("les étapes se rangent par échéance, les étapes sans date en dernier", () => {
    const etapes = [
      { titre: "sans date", due_on: null, starts_on: null },
      { titre: "décembre", due_on: "2026-12-01", starts_on: null },
      { titre: "début seul", due_on: null, starts_on: "2026-11-01" },
      { titre: "octobre", due_on: "2026-10-01", starts_on: null },
    ];
    assert.deepEqual(
      [...etapes].sort(comparerEtapes).map((e) => e.titre),
      ["octobre", "début seul", "décembre", "sans date"],
    );
  });
});
