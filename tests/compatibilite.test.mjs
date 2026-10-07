/**
 * Compatibilité d'une opportunité avec un projet (lot L5b) : les règles, le
 * décompte, le classement, et ce que la page du projet lit et annonce.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. La page est lue comme du texte. Les
 * projets et les opportunités d'ici sont FICTIFS.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  calculerCompatibilite,
  classerParCompatibilite,
  CRITERES_COMPATIBILITE,
  decompteEnClair,
  ETATS_CRITERE,
  LIMITES_COMPATIBILITE,
  raisonCritere,
  RESERVE_PAYS,
} from "../src/lib/compatibilite.ts";
import { ongletsDuProjet } from "../src/lib/onglets-projet.ts";

const PAGE = "src/app/(app)/projets/[id]/opportunites/page.tsx";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PROJET = { format: "documentaire", genre: "societe", countries: ["CM", "GA"] };
const opportunite = (surcharge = {}) => ({ formats: [], genres: [], countries: [], ...surcharge });
const etats = (compatibilite) =>
  Object.fromEntries(compatibilite.criteres.map((critere) => [critere.code, critere.etat]));

describe("Compatibilité : les règles", () => {
  it("trois critères, dans l'ordre de l'écran", () => {
    assert.deepEqual(Object.keys(CRITERES_COMPATIBILITE), ["format", "pays", "genre"]);
    assert.deepEqual(
      calculerCompatibilite(PROJET, opportunite()).criteres.map((critere) => critere.code),
      ["format", "pays", "genre"],
    );
  });

  it("une opportunité qui ne précise rien n'est ni remplie ni contredite", () => {
    // Un tableau vide veut dire « la source ne le dit pas », pas « tous ».
    const resultat = calculerCompatibilite(PROJET, opportunite());
    assert.deepEqual(etats(resultat), {
      format: "non_precise",
      pays: "non_precise",
      genre: "non_precise",
    });
    assert.deepEqual(
      [resultat.remplis, resultat.nonRemplis, resultat.evalues, resultat.nonEvalues],
      [0, 0, 0, 3],
    );
  });

  it("tout concorde : trois critères remplis", () => {
    const resultat = calculerCompatibilite(
      PROJET,
      opportunite({
        formats: ["long_metrage", "documentaire"],
        countries: ["SN", "GA"],
        genres: ["societe"],
      }),
    );
    assert.deepEqual(etats(resultat), { format: "rempli", pays: "rempli", genre: "rempli" });
    assert.deepEqual([resultat.remplis, resultat.evalues, resultat.nonEvalues], [3, 3, 0]);
  });

  it("un seul pays de production commun suffit, et il est nommé", () => {
    const [, pays] = calculerCompatibilite(
      PROJET,
      opportunite({ countries: ["GA", "SN"] }),
    ).criteres;
    assert.equal(pays.etat, "rempli");
    assert.deepEqual(pays.communs, ["GA"]);
  });

  it("ce que l'opportunité demande et que le projet n'est pas : non rempli", () => {
    const resultat = calculerCompatibilite(
      PROJET,
      opportunite({ formats: ["long_metrage"], countries: ["SN"], genres: ["drame"] }),
    );
    assert.deepEqual(etats(resultat), {
      format: "non_rempli",
      pays: "non_rempli",
      genre: "non_rempli",
    });
    assert.deepEqual([resultat.remplis, resultat.nonRemplis, resultat.evalues], [0, 3, 3]);
  });

  it("un projet sans genre ni pays : non renseigné, jamais non rempli", () => {
    const resultat = calculerCompatibilite(
      { format: "documentaire", genre: null, countries: [] },
      opportunite({ formats: ["documentaire"], countries: ["CM"], genres: ["drame"] }),
    );
    assert.deepEqual(etats(resultat), {
      format: "rempli",
      pays: "non_renseigne",
      genre: "non_renseigne",
    });
    assert.deepEqual([resultat.remplis, resultat.nonRemplis, resultat.nonEvalues], [1, 0, 2]);
  });

  it("si l'opportunité ne précise rien, peu importe ce que le projet ne dit pas", () => {
    const resultat = calculerCompatibilite(
      { format: "documentaire", genre: null, countries: [] },
      opportunite(),
    );
    assert.equal(etats(resultat).genre, "non_precise");
  });

  it("le décompte se tient : remplis + non remplis + non évalués = trois", () => {
    for (const cas of [
      opportunite(),
      opportunite({ formats: ["serie"] }),
      opportunite({ formats: ["documentaire"], countries: ["SN"] }),
      opportunite({ formats: ["documentaire"], countries: ["CM"], genres: ["societe"] }),
    ]) {
      const { remplis, nonRemplis, evalues, nonEvalues } = calculerCompatibilite(PROJET, cas);
      assert.equal(evalues, remplis + nonRemplis);
      assert.equal(evalues + nonEvalues, 3);
    }
  });

  it("ne modifie ni le projet ni l'opportunité", () => {
    const cas = opportunite({ countries: ["CM"] });
    const resultat = calculerCompatibilite(PROJET, cas);
    resultat.criteres[1].admis.push("XX");
    assert.deepEqual(cas.countries, ["CM"]);
    assert.deepEqual(PROJET.countries, ["CM", "GA"]);
  });
});

describe("Compatibilité : ce que l'écran en dit", () => {
  const phrase = (cas) => decompteEnClair(calculerCompatibilite(PROJET, cas));

  it("un décompte, avec son incertitude, sans pourcentage", () => {
    assert.equal(phrase(opportunite()), "Aucun critère n'a pu être évalué.");
    assert.equal(
      phrase(opportunite({ formats: ["documentaire"] })),
      "1 critère rempli sur 1 évalué ; 2 critères non évalués.",
    );
    assert.equal(
      phrase(opportunite({ formats: ["documentaire"], countries: ["SN"] })),
      "1 critère rempli sur 2 évalués ; 1 critère non évalué.",
    );
    assert.equal(
      phrase(opportunite({ formats: ["serie"], countries: ["SN"] })),
      "0 critère rempli sur 2 évalués ; 1 critère non évalué.",
    );
    assert.equal(
      phrase(opportunite({ formats: ["documentaire"], countries: ["CM"], genres: ["societe"] })),
      "3 critères remplis sur 3 évalués.",
    );
  });

  it("chaque état a son libellé et sa raison", () => {
    const nommer = (code) => `«${code}»`;
    const [format, pays, genre] = calculerCompatibilite(
      { format: "documentaire", genre: null, countries: ["CM"] },
      opportunite({ formats: ["documentaire"], countries: ["SN", "CI"], genres: ["drame"] }),
    ).criteres;
    assert.equal(
      raisonCritere(format, nommer),
      "Demandé : «documentaire». Votre projet : «documentaire».",
    );
    assert.equal(raisonCritere(pays, nommer), "Demandé : «SN», «CI». Votre projet : «CM».");
    assert.match(
      raisonCritere(genre, nommer),
      /^Demandé : «drame»\. Votre projet ne le dit pas encore/,
    );
    const [sansPrecision] = calculerCompatibilite(PROJET, opportunite()).criteres;
    assert.match(raisonCritere(sansPrecision, nommer), /Information non fournie\.$/);
    assert.deepEqual(Object.keys(ETATS_CRITERE).sort(), [
      "non_precise",
      "non_rempli",
      "non_renseigne",
      "rempli",
    ]);
  });

  it("dit ce que le calcul ne regarde pas, et qu'il ne garantit rien", () => {
    for (const mot of ["durée", "stade", "thématique", "langue", "exigences"]) {
      assert.ok(LIMITES_COMPATIBILITE.includes(mot), mot);
    }
    assert.match(LIMITES_COMPATIBILITE, /pas une garantie d'éligibilité/);
    assert.match(LIMITES_COMPATIBILITE, /seule la source fait foi/);
    assert.match(RESERVE_PAYS, /nationalité ou la résidence/);
  });
});

describe("Compatibilité : le classement", () => {
  const ligne = (nom, cas) => ({ nom, compatibilite: calculerCompatibilite(PROJET, cas) });
  const noms = (lignes) => classerParCompatibilite(lignes).map((l) => l.nom);

  it("ce que rien ne contredit d'abord, puis le plus de critères remplis", () => {
    const lignes = [
      ligne("contredite", opportunite({ formats: ["documentaire"], countries: ["SN"] })),
      ligne("inconnue", opportunite()),
      ligne("un rempli", opportunite({ formats: ["documentaire"] })),
      ligne(
        "trois remplis",
        opportunite({ formats: ["documentaire"], countries: ["CM"], genres: ["societe"] }),
      ),
    ];
    assert.deepEqual(noms(lignes), ["trois remplis", "un rempli", "inconnue", "contredite"]);
  });

  it("à égalité, l'ordre reçu est gardé : la liste arrive triée par date limite", () => {
    const lignes = [
      ligne("b", opportunite()),
      ligne("a", opportunite()),
      ligne("c", opportunite()),
    ];
    assert.deepEqual(noms(lignes), ["b", "a", "c"]);
    assert.deepEqual(
      lignes.map((l) => l.nom),
      ["b", "a", "c"],
    );
  });
});

describe("Compatibilité : la page du projet", () => {
  const page = sansCommentaires(lire(PAGE));

  it("l'onglet « Opportunités » est proposé à toute l'équipe, budget ou non", () => {
    for (const budget of [true, false]) {
      const onglet = ongletsDuProjet("p1", { budget }).find((o) => o.cle === "opportunites");
      assert.deepEqual(onglet, {
        cle: "opportunites",
        libelle: "Opportunités",
        href: "/projets/p1/opportunites",
      });
    }
  });

  it("le projet se lit sous la RLS, et un projet illisible répond 404", () => {
    assert.match(page, /\.from\("projects"\)[\s\S]*?\.eq\("id", id\)\s*\.maybeSingle\(\)/);
    assert.match(page, /if \(!projet\) \{\s*notFound\(\)/);
    assert.ok(page.indexOf("notFound()") < page.indexOf('.from("funding_opportunities")'));
  });

  it("la comparaison ne lit ni budget ni financement", () => {
    assert.doesNotMatch(page, /budget_lines|project_budgets|project_fundings|amount_/);
    assert.match(page, /\.select\("id, title, format, genre, countries"\)/);
  });

  it("le catalogue comparé est celui des équipes : jamais une démonstration", () => {
    assert.match(page, /\.in\("status", STATUTS_VISIBLES\)/);
    assert.match(page, /\.limit\(LIMITE_CATALOGUE\)/);
  });

  it("une opportunité expirée n'est pas comparée, et la page le dit", () => {
    assert.match(page, /echeanceDe\(opportunite, aujourdhui\) !== "passee"/);
    assert.match(page, /expirée n'est pas comparée|expirées ne sont pas comparées/);
  });

  it("la page dit les limites du décompte et la réserve sur les pays", () => {
    assert.match(page, /\{LIMITES_COMPATIBILITE\}/);
    assert.match(page, /RESERVE_PAYS/);
    assert.match(page, /decompteEnClair\(compatibilite\)/);
  });

  it("aucun pourcentage, aucune note, aucun appel à un modèle", () => {
    assert.doesNotMatch(page, /%|\/ 100|score|creer_devis|ai_suggestions|jobs/i);
  });

  it("rien n'est écrit : la page ne fait que lire", () => {
    assert.doesNotMatch(page, /\.(insert|update|upsert|delete)\(/);
    assert.doesNotMatch(page, /"use server"|"use client"/);
  });
});
