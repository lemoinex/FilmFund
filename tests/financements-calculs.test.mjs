/**
 * Plan de financement.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { calculerPlanFinancement, joursAvant } from "../src/lib/financements-calculs.ts";

const budget = { totalCentimes: 10_000_000_00, devise: "XOF" }; // 10 millions de F CFA

describe("Plan de financement", () => {
  it("seules les candidatures acceptées comptent comme acquises", () => {
    const plan = calculerPlanFinancement(
      [
        { status: "acceptee", currency: "XOF", amount_requested: 5000000, amount_granted: 3000000 },
        { status: "deposee", currency: "XOF", amount_requested: 2000000, amount_granted: null },
        { status: "a_preparer", currency: "XOF", amount_requested: 1000000, amount_granted: null },
        { status: "refusee", currency: "XOF", amount_requested: 4000000, amount_granted: null },
      ],
      budget,
    );
    assert.equal(plan.acquis, 3000000_00, "le montant accordé, pas le montant demandé");
    assert.equal(plan.enAttente, 2000000_00, "seules les candidatures déposées sont en attente");
    assert.equal(plan.resteAFinancer, 7000000_00);
    assert.equal(plan.couverture, 30);
  });

  it("les montants d'une autre devise ne sont pas additionnés, mais signalés", () => {
    const plan = calculerPlanFinancement(
      [
        { status: "acceptee", currency: "EUR", amount_requested: null, amount_granted: 40000 },
        { status: "deposee", currency: "USD", amount_requested: 20000, amount_granted: null },
        { status: "refusee", currency: "EUR", amount_requested: 10000, amount_granted: null },
      ],
      budget,
    );
    assert.equal(plan.acquis, 0);
    assert.equal(plan.enAttente, 0);
    assert.equal(plan.autresDevises, 2, "une candidature refusée ne compte pas");
  });

  it("une candidature acceptée sans montant est signalée, pas inventée", () => {
    const plan = calculerPlanFinancement(
      [{ status: "acceptee", currency: "XOF", amount_requested: 1000000, amount_granted: null }],
      budget,
    );
    assert.equal(plan.acquis, 0, "le montant demandé n'est pas un montant obtenu");
    assert.equal(plan.accepteesSansMontant, 1);
  });

  it("sans budget, ni couverture ni reste à financer", () => {
    const plan = calculerPlanFinancement(
      [{ status: "acceptee", currency: "XOF", amount_requested: null, amount_granted: 1000 }],
      null,
    );
    assert.equal(plan.couverture, null);
    assert.equal(plan.resteAFinancer, null);
    assert.equal(plan.acquis, 0, "sans devise de référence, rien ne s'additionne");
  });

  it("un financement supérieur au budget plafonne la couverture à 100 %", () => {
    const plan = calculerPlanFinancement(
      [{ status: "acceptee", currency: "XOF", amount_requested: null, amount_granted: 12000000 }],
      budget,
    );
    assert.equal(plan.couverture, 100);
    assert.equal(plan.resteAFinancer, 0);
  });

  it("les montants décimaux s'additionnent sans dérive", () => {
    const plan = calculerPlanFinancement(
      [
        { status: "acceptee", currency: "EUR", amount_requested: null, amount_granted: "0.10" },
        { status: "acceptee", currency: "EUR", amount_requested: null, amount_granted: "0.20" },
      ],
      { totalCentimes: 100, devise: "EUR" },
    );
    assert.equal(plan.acquis, 30);
  });

  it("les jours avant une date limite se comptent en jours entiers", () => {
    assert.equal(joursAvant("2026-11-30", "2026-11-01"), 29);
    assert.equal(joursAvant("2026-11-01", "2026-11-01"), 0);
    assert.equal(joursAvant("2026-10-31", "2026-11-01"), -1);
    // Passage à l'heure d'hiver fin octobre : sans risque en UTC.
    assert.equal(joursAvant("2026-10-26", "2026-10-24"), 2);
  });
});
