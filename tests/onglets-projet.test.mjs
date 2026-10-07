/**
 * Rubriques d'un projet : la liste que partagent la page du projet et le
 * tableau de bord.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Ce que chaque page laisse ouvrir se vérifie dans
 * leurs propres suites ; ici, ce que la liste propose.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { ongletsDuProjet } from "../src/lib/onglets-projet.ts";

const PROJET = "11111111-2222-3333-4444-555555555555";
const libelles = (onglets) => onglets.map((onglet) => onglet.libelle);

describe("Rubriques d'un projet", () => {
  it("propose toutes les rubriques, dans l'ordre, à qui gère le budget", () => {
    const onglets = ongletsDuProjet(PROJET, { budget: true });

    assert.deepEqual(libelles(onglets), [
      "Synthèse",
      "Fiche",
      "Documents",
      "Recherche",
      "Storyboard",
      "Matériel",
      "Planning",
      "Opportunités",
      "Budget",
      "Financements",
      "Dossier",
      "Équipe",
    ]);
    assert.deepEqual(
      onglets.map((onglet) => onglet.href),
      [
        `/projets/${PROJET}`,
        `/projets/${PROJET}/fiche`,
        `/projets/${PROJET}/documents`,
        `/projets/${PROJET}/recherche`,
        `/projets/${PROJET}/storyboard`,
        `/projets/${PROJET}/materiel`,
        `/projets/${PROJET}/planning`,
        `/projets/${PROJET}/opportunites`,
        `/projets/${PROJET}/budget`,
        `/projets/${PROJET}/financements`,
        `/projets/${PROJET}/dossier`,
        `/projets/${PROJET}#equipe`,
      ],
    );
  });

  it("ne propose ni le budget, ni les financements, ni le dossier à un lecteur", () => {
    assert.deepEqual(libelles(ongletsDuProjet(PROJET, { budget: false })), [
      "Synthèse",
      "Fiche",
      "Documents",
      "Recherche",
      "Storyboard",
      "Matériel",
      "Planning",
      "Opportunités",
      "Équipe",
    ]);
  });

  it("garde des clés uniques : une seule rubrique est courante à la fois", () => {
    const cles = ongletsDuProjet(PROJET, { budget: true }).map((onglet) => onglet.cle);
    assert.equal(new Set(cles).size, cles.length);
    assert.equal(cles[0], "projet");
  });

  it("sur le tableau de bord, la synthèse mène au tableau de bord ; le reste ne change pas", () => {
    const page = ongletsDuProjet(PROJET, { budget: true });
    const tableauDeBord = ongletsDuProjet(PROJET, { budget: true, synthese: "/tableau-de-bord" });

    assert.deepEqual(tableauDeBord[0], {
      cle: "projet",
      libelle: "Synthèse",
      href: "/tableau-de-bord",
    });
    assert.deepEqual(tableauDeBord.slice(1), page.slice(1));
  });
});
