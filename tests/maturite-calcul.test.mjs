/**
 * Score de maturité (lot S1) : le calcul, à partir de faits et de
 * pondérations.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les faits réels et les droits ont leur propre
 * suite.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  calculerMaturite,
  CRITERES,
  lireFaits,
  lirePonderations,
  ORDRE_CRITERES,
} from "../src/lib/maturite.ts";

/** Pondérations par défaut, celles de la première version en base. */
const POIDS = {
  concept: 20,
  narrative: 15,
  characters: 15,
  artistic_vision: 15,
  feasibility: 10,
  budget: 10,
  financing: 5,
  market: 5,
  dossier: 5,
};

/** Un projet où rien n'est renseigné. */
function vide() {
  return {
    pitch: false,
    synopsis_court: false,
    theme: false,
    genre: false,
    synopsis: false,
    vision: false,
    duree: false,
    pays: false,
    langues: false,
    public: false,
    objectifs: false,
    budget_ouvert: false,
    personnages: 0,
    personnages_principaux: 0,
    personnages_decrits: 0,
    recits: 0,
    recits_finalises: 0,
    notes_intention: 0,
    notes_intention_finalisees: 0,
    documents_finalises: 0,
    presentations: 0,
    etapes_datees: 0,
    lignes_budget: 0,
    postes_budget: 0,
    candidatures: 0,
    candidatures_chiffrees: 0,
  };
}

/** Un projet où tout ce que le score attend est présent. */
function complet() {
  return {
    pitch: true,
    synopsis_court: true,
    theme: true,
    genre: true,
    synopsis: true,
    vision: true,
    duree: true,
    pays: true,
    langues: true,
    public: true,
    objectifs: true,
    budget_ouvert: true,
    personnages: 3,
    personnages_principaux: 1,
    personnages_decrits: 3,
    recits: 1,
    recits_finalises: 1,
    notes_intention: 1,
    notes_intention_finalisees: 1,
    documents_finalises: 2,
    presentations: 1,
    etapes_datees: 4,
    lignes_budget: 12,
    postes_budget: 5,
    candidatures: 2,
    candidatures_chiffrees: 1,
  };
}

const points = (maturite) =>
  Object.fromEntries(maturite.criteres.map((critere) => [critere.code, critere.points]));

const critere = (maturite, code) => maturite.criteres.find((c) => c.code === code);

describe("Maturité : critères", () => {
  it("présente neuf critères, chacun nommé, dans l'ordre du cahier des charges", () => {
    assert.deepEqual(ORDRE_CRITERES, [
      "concept",
      "narrative",
      "characters",
      "artistic_vision",
      "feasibility",
      "budget",
      "financing",
      "market",
      "dossier",
    ]);
    assert.deepEqual(Object.values(CRITERES), [
      "Concept",
      "Narration",
      "Personnages",
      "Vision artistique",
      "Faisabilité",
      "Budget",
      "Plan de financement",
      "Potentiel marché",
      "Dossier",
    ]);
  });
});

describe("Maturité : calcul", () => {
  it("un projet complet vaut 100, sans rien à améliorer", () => {
    const maturite = calculerMaturite(complet(), POIDS);
    assert.equal(maturite.total, 100);
    assert.deepEqual(points(maturite), POIDS);
    assert.deepEqual(
      maturite.criteres.flatMap((c) => c.manques),
      [],
    );
  });

  it("un projet vide vaut 0, et dit tout ce qui manque", () => {
    const maturite = calculerMaturite(vide(), POIDS);
    assert.equal(maturite.total, 0);
    assert.equal(maturite.criteres.flatMap((c) => c.manques).length, 26);
    assert.deepEqual(critere(maturite, "concept").manques, [
      "Rédiger le pitch",
      "Rédiger le synopsis court",
      "Indiquer le thème",
      "Choisir un genre",
    ]);
  });

  it("chaque critère rapporte la part de ses éléments présents", () => {
    const maturite = calculerMaturite(
      {
        ...vide(),
        // Concept : 3 éléments sur 4.
        pitch: true,
        synopsis_court: true,
        genre: true,
        // Narration : 1 sur 3.
        synopsis: true,
        // Personnages : 2 sur 3 — un personnage n'est pas décrit.
        personnages: 2,
        personnages_principaux: 1,
        personnages_decrits: 1,
        // Vision : 2 sur 3 — la note existe, sans être finalisée.
        vision: true,
        notes_intention: 1,
        // Faisabilité : 3 sur 4.
        duree: true,
        pays: true,
        langues: true,
        // Budget : 2 sur 3 — un seul poste.
        budget_ouvert: true,
        lignes_budget: 4,
        postes_budget: 1,
        // Financement : 1 sur 2.
        candidatures: 1,
        // Marché : 1 sur 2.
        public: true,
      },
      POIDS,
    );

    assert.deepEqual(points(maturite), {
      concept: 15,
      narrative: 5,
      characters: 10,
      artistic_vision: 10,
      // 7,5 arrondi.
      feasibility: 8,
      budget: 7,
      // 2,5 arrondi.
      financing: 3,
      market: 3,
      dossier: 0,
    });
    assert.equal(maturite.total, 61);
    assert.deepEqual(critere(maturite, "characters").manques, ["Décrire chaque personnage"]);
    assert.deepEqual(critere(maturite, "budget").manques, ["Couvrir plusieurs postes du budget"]);
    assert.deepEqual(critere(maturite, "artistic_vision").manques, [
      "Finaliser la note d'intention",
    ]);
  });

  it("ne compte les descriptions que si chaque personnage en a une", () => {
    const manques = (faits) =>
      critere(calculerMaturite({ ...vide(), ...faits }, POIDS), "characters").manques;

    assert.ok(manques({ personnages: 0 }).includes("Décrire chaque personnage"));
    assert.ok(
      manques({ personnages: 3, personnages_decrits: 2 }).includes("Décrire chaque personnage"),
    );
    assert.ok(
      !manques({ personnages: 3, personnages_decrits: 3 }).includes("Décrire chaque personnage"),
    );
  });

  it("suit les pondérations de la version en vigueur", () => {
    const autres = { ...POIDS, concept: 40, narrative: 5, characters: 5 };
    const maturite = calculerMaturite({ ...vide(), pitch: true, synopsis_court: true }, autres);
    // Concept : 2 éléments sur 4, sur 40 points.
    assert.equal(critere(maturite, "concept").points, 20);
    assert.equal(critere(maturite, "concept").maximum, 40);
    assert.equal(calculerMaturite(complet(), autres).total, 100);
  });

  it("n'évalue pas un critère de poids nul : il ne rapporte ni ne réclame rien", () => {
    const sansBudget = { ...POIDS, budget: 0, concept: 30 };
    const maturite = calculerMaturite(vide(), sansBudget);
    assert.equal(critere(maturite, "budget"), undefined);
    assert.equal(maturite.criteres.length, 8);
    assert.equal(calculerMaturite(complet(), sansBudget).total, 100);
  });
});

describe("Maturité : lecture des faits", () => {
  it("accepte les faits tels que la base les rend, sans rien y ajouter", () => {
    assert.deepEqual(lireFaits({ ...complet(), intrus: "ignoré" }), complet());
  });

  it("refuse des faits incomplets ou mal formés : aucun score plutôt qu'un score faux", () => {
    const sans = (cle) => {
      const faits = complet();
      delete faits[cle];
      return faits;
    };
    assert.equal(lireFaits(null), null);
    assert.equal(lireFaits("faits"), null);
    assert.equal(lireFaits([]), null);
    assert.equal(lireFaits(sans("pitch")), null);
    assert.equal(lireFaits(sans("candidatures")), null);
    assert.equal(lireFaits({ ...complet(), pitch: "oui" }), null);
    assert.equal(lireFaits({ ...complet(), personnages: -1 }), null);
    assert.equal(lireFaits({ ...complet(), personnages: 1.5 }), null);
    assert.equal(lireFaits({ ...complet(), personnages: "3" }), null);
  });
});

describe("Maturité : lecture des pondérations", () => {
  it("lit une version dont le total est 100", () => {
    assert.deepEqual(lirePonderations({ version_number: 3, ...POIDS, published_by: null }), {
      version: 3,
      poids: POIDS,
    });
  });

  it("refuse une version incomplète, négative ou dont le total n'est pas 100", () => {
    const sansDossier = { version_number: 1, ...POIDS };
    delete sansDossier.dossier;

    assert.equal(lirePonderations(null), null);
    assert.equal(lirePonderations({ ...POIDS }), null);
    assert.equal(lirePonderations({ version_number: 0, ...POIDS }), null);
    assert.equal(lirePonderations(sansDossier), null);
    assert.equal(lirePonderations({ version_number: 1, ...POIDS, concept: 25 }), null);
    assert.equal(
      lirePonderations({ version_number: 1, ...POIDS, concept: -5, narrative: 40 }),
      null,
    );
  });
});
