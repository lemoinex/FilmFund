/**
 * Mise en mots du journal d'administration.
 *
 * Importe directement le module TypeScript (types retirés par Node).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { auteurDe, descriptionDe } from "../src/lib/journal-administration.ts";

const annuaire = {
  comptes: new Map([
    ["a", "Awa"],
    ["b", "Bakary"],
    ["e", "Élodie"],
  ]),
  projets: new Map([["p", "Le Fleuve"]]),
};

function entree(action, details, autres = {}) {
  return {
    id: 1,
    created_at: "2026-09-30T00:00:00Z",
    actor_id: "a",
    action,
    project_id: null,
    details,
    ...autres,
  };
}

describe("Libellés du journal d'administration", () => {
  it("attribue l'action sans auteur à l'exploitant", () => {
    assert.equal(
      auteurDe(entree("mode_prive", {}, { actor_id: null }), annuaire),
      "L'exploitant (hors application)",
    );
    assert.equal(auteurDe(entree("mode_prive", {}), annuaire), "Awa");
    assert.equal(
      auteurDe(entree("mode_prive", {}, { actor_id: "z" }), annuaire),
      "un compte supprimé",
    );
  });

  it("décrit un changement de rôle", () => {
    assert.equal(
      descriptionDe(
        entree("changement_role", { compte: "b", ancien_role: "member", nouveau_role: "admin" }),
        annuaire,
      ),
      "a changé le rôle de Bakary : membre → administrateur",
    );
  });

  it("élide « de » devant une voyelle, accentuée ou non", () => {
    const role = { ancien_role: "member", nouveau_role: "admin" };
    assert.equal(
      descriptionDe(entree("changement_role", { compte: "a", ...role }), annuaire),
      "a changé le rôle d'Awa : membre → administrateur",
    );
    assert.equal(
      descriptionDe(
        entree("modification_profil", { compte: "e", champs: ["display_name"] }),
        annuaire,
      ),
      "a modifié le profil d'Élodie (nom affiché)",
    );
    assert.equal(
      descriptionDe(entree("changement_role", { compte: "z", ...role }), annuaire),
      "a changé le rôle d'un compte supprimé : membre → administrateur",
    );
  });

  it("décrit une modification de profil par ses champs", () => {
    assert.equal(
      descriptionDe(
        entree("modification_profil", { compte: "b", champs: ["display_name"] }),
        annuaire,
      ),
      "a modifié le profil de Bakary (nom affiché)",
    );
  });

  it("décrit les deux sens de la bascule du mode privé", () => {
    assert.equal(
      descriptionDe(entree("mode_prive", { actif: true }), annuaire),
      "a activé le mode privé",
    );
    assert.equal(
      descriptionDe(entree("mode_prive", { actif: false }), annuaire),
      "a désactivé le mode privé",
    );
  });

  it("nomme un projet supprimé par le titre retenu dans le journal", () => {
    assert.equal(
      descriptionDe(
        entree("suppression_projet", { titre: "Le Fleuve" }, { project_id: "x" }),
        annuaire,
      ),
      "a supprimé le projet « Le Fleuve »",
    );
  });

  it("décrit une intervention dans le contenu, même d'un projet disparu", () => {
    const details = { table: "project_milestones", operation: "insert" };
    assert.equal(
      descriptionDe(entree("intervention_contenu", details, { project_id: "p" }), annuaire),
      "a fait un ajout dans le planning du projet « Le Fleuve »",
    );
    assert.equal(
      descriptionDe(entree("intervention_contenu", details, { project_id: "x" }), annuaire),
      "a fait un ajout dans le planning d'un projet supprimé depuis",
    );
  });

  it("décrit une intervention dans un studio, avec le compte concerné", () => {
    assert.equal(
      descriptionDe(
        entree("intervention_studio", {
          table: "studio_members",
          operation: "insert",
          studio: "s",
          compte: "b",
        }),
        annuaire,
      ),
      "a fait un ajout dans les membres d'un studio (compte : Bakary)",
    );
    assert.equal(
      descriptionDe(
        entree("intervention_studio", { table: "studios", operation: "update", studio: "s" }),
        annuaire,
      ),
      "a fait une modification dans un studio",
    );
  });

  it("résiste à des détails absents ou mal formés", () => {
    assert.equal(
      descriptionDe(entree("changement_role", null), annuaire),
      "a changé le rôle d'un compte inconnu : inconnu → inconnu",
    );
    assert.equal(
      descriptionDe(entree("action_future", {}), annuaire),
      "a effectué une action non répertoriée",
    );
  });
});
