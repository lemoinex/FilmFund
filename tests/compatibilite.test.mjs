/**
 * Compatibilité d'une opportunité avec un projet (lots L5b et OP2) : les règles, le
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

const PROJET = {
  format: "documentaire",
  genre: "societe",
  countries: ["CM", "GA"],
  duration_minutes: 75,
  stage: "developpement",
};
const opportunite = (surcharge = {}) => ({
  formats: [],
  genres: [],
  countries: [],
  stages: [],
  duration_min_minutes: null,
  duration_max_minutes: null,
  ...surcharge,
});
/** Tout ce qu'une opportunité peut demander, et que PROJET remplit. */
const TOUT_REMPLI = {
  formats: ["documentaire"],
  countries: ["CM"],
  genres: ["societe"],
  duration_min_minutes: 52,
  duration_max_minutes: 90,
  stages: ["developpement"],
};
const etats = (compatibilite) =>
  Object.fromEntries(compatibilite.criteres.map((critere) => [critere.code, critere.etat]));

describe("Compatibilité : les règles", () => {
  it("cinq critères, dans l'ordre de l'écran", () => {
    const ordre = ["format", "pays", "genre", "duree", "stade"];
    assert.deepEqual(Object.keys(CRITERES_COMPATIBILITE), ordre);
    assert.deepEqual(
      calculerCompatibilite(PROJET, opportunite()).criteres.map((critere) => critere.code),
      ordre,
    );
  });

  it("une opportunité qui ne précise rien n'est ni remplie ni contredite", () => {
    // Un tableau vide veut dire « la source ne le dit pas », pas « tous ».
    const resultat = calculerCompatibilite(PROJET, opportunite());
    assert.deepEqual(etats(resultat), {
      format: "non_precise",
      pays: "non_precise",
      genre: "non_precise",
      duree: "non_precise",
      stade: "non_precise",
    });
    assert.deepEqual(
      [resultat.remplis, resultat.nonRemplis, resultat.evalues, resultat.nonEvalues],
      [0, 0, 0, 5],
    );
  });

  it("tout concorde : cinq critères remplis", () => {
    const resultat = calculerCompatibilite(
      PROJET,
      opportunite({
        ...TOUT_REMPLI,
        formats: ["long_metrage", "documentaire"],
        countries: ["SN", "GA"],
        stages: ["ecriture", "developpement"],
      }),
    );
    assert.deepEqual(etats(resultat), {
      format: "rempli",
      pays: "rempli",
      genre: "rempli",
      duree: "rempli",
      stade: "rempli",
    });
    assert.deepEqual([resultat.remplis, resultat.evalues, resultat.nonEvalues], [5, 5, 0]);
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
      opportunite({
        formats: ["long_metrage"],
        countries: ["SN"],
        genres: ["drame"],
        duration_max_minutes: 30,
        stages: ["production", "postproduction"],
      }),
    );
    assert.deepEqual(etats(resultat), {
      format: "non_rempli",
      pays: "non_rempli",
      genre: "non_rempli",
      duree: "non_rempli",
      stade: "non_rempli",
    });
    assert.deepEqual([resultat.remplis, resultat.nonRemplis, resultat.evalues], [0, 5, 5]);
  });

  it("un projet sans genre, ni pays, ni durée : non renseigné, jamais non rempli", () => {
    const resultat = calculerCompatibilite(
      { ...PROJET, genre: null, countries: [], duration_minutes: null },
      opportunite({ ...TOUT_REMPLI, genres: ["drame"] }),
    );
    assert.deepEqual(etats(resultat), {
      format: "rempli",
      pays: "non_renseigne",
      genre: "non_renseigne",
      duree: "non_renseigne",
      stade: "rempli",
    });
    assert.deepEqual([resultat.remplis, resultat.nonRemplis, resultat.nonEvalues], [2, 0, 3]);
  });

  it("si l'opportunité ne précise rien, peu importe ce que le projet ne dit pas", () => {
    const resultat = calculerCompatibilite(
      { ...PROJET, genre: null, countries: [], duration_minutes: null },
      opportunite(),
    );
    assert.equal(etats(resultat).genre, "non_precise");
    assert.equal(etats(resultat).duree, "non_precise");
  });

  it("la durée se compare à une fourchette, bornes comprises", () => {
    const duree = (minutes, min, max) =>
      calculerCompatibilite(
        { ...PROJET, duration_minutes: minutes },
        opportunite({ duration_min_minutes: min, duration_max_minutes: max }),
      ).criteres[3];
    for (const [minutes, min, max, attendu] of [
      [52, 52, 90, "rempli"],
      [90, 52, 90, "rempli"],
      [51, 52, 90, "non_rempli"],
      [91, 52, 90, "non_rempli"],
      // Une seule borne dite : l'autre côté reste ouvert.
      [300, 52, null, "rempli"],
      [51, 52, null, "non_rempli"],
      [1, null, 30, "rempli"],
      [31, null, 30, "non_rempli"],
      [75, null, null, "non_precise"],
      [null, 52, 90, "non_renseigne"],
      [null, null, null, "non_precise"],
    ]) {
      assert.equal(duree(minutes, min, max).etat, attendu, `${minutes} dans [${min}, ${max}]`);
    }
    // La fourchette n'est portée que si la source en dit une.
    assert.deepEqual(duree(75, 52, 90).fourchette, { min: 52, max: 90 });
    assert.deepEqual(duree(75, 52, 90).communs, ["75"]);
    assert.equal(duree(75, null, null).fourchette, undefined);
    assert.deepEqual(duree(95, 52, 90).communs, []);
  });

  it("le stade comparé est l'étape du projet : un seul stade admis suffit", () => {
    const stade = (stages) => calculerCompatibilite(PROJET, opportunite({ stages })).criteres[4];
    assert.equal(stade(["idee", "developpement"]).etat, "rempli");
    assert.deepEqual(stade(["idee", "developpement"]).communs, ["developpement"]);
    assert.equal(stade(["production"]).etat, "non_rempli");
    assert.equal(stade([]).etat, "non_precise");
  });

  it("le décompte se tient : remplis + non remplis + non évalués = cinq", () => {
    for (const cas of [
      opportunite(),
      opportunite({ formats: ["serie"] }),
      opportunite({ formats: ["documentaire"], countries: ["SN"] }),
      opportunite({ formats: ["documentaire"], countries: ["CM"], genres: ["societe"] }),
      opportunite({ duration_min_minutes: 100, stages: ["developpement"] }),
      opportunite(TOUT_REMPLI),
    ]) {
      const { remplis, nonRemplis, evalues, nonEvalues } = calculerCompatibilite(PROJET, cas);
      assert.equal(evalues, remplis + nonRemplis);
      assert.equal(evalues + nonEvalues, 5);
    }
  });

  it("ne modifie ni le projet ni l'opportunité", () => {
    const cas = opportunite({ countries: ["CM"] });
    const resultat = calculerCompatibilite(PROJET, cas);
    resultat.criteres[1].admis.push("XX");
    assert.deepEqual(cas.countries, ["CM"]);
    assert.deepEqual(PROJET.countries, ["CM", "GA"]);
    const stades = ["developpement"];
    calculerCompatibilite(PROJET, opportunite({ stages: stades })).criteres[4].admis.push("idee");
    assert.deepEqual(stades, ["developpement"]);
  });
});

describe("Compatibilité : ce que l'écran en dit", () => {
  const phrase = (cas) => decompteEnClair(calculerCompatibilite(PROJET, cas));

  it("un décompte, avec son incertitude, sans pourcentage", () => {
    assert.equal(phrase(opportunite()), "Aucun critère n'a pu être évalué.");
    assert.equal(
      phrase(opportunite({ formats: ["documentaire"] })),
      "1 critère rempli sur 1 évalué ; 4 critères non évalués.",
    );
    assert.equal(
      phrase(opportunite({ formats: ["documentaire"], countries: ["SN"] })),
      "1 critère rempli sur 2 évalués ; 3 critères non évalués.",
    );
    assert.equal(
      phrase(opportunite({ formats: ["serie"], countries: ["SN"] })),
      "0 critère rempli sur 2 évalués ; 3 critères non évalués.",
    );
    assert.equal(
      phrase(opportunite({ ...TOUT_REMPLI, stages: [] })),
      "4 critères remplis sur 4 évalués ; 1 critère non évalué.",
    );
    assert.equal(phrase(opportunite(TOUT_REMPLI)), "5 critères remplis sur 5 évalués.");
  });

  it("chaque état a son libellé et sa raison", () => {
    const nommer = (code) => `«${code}»`;
    const [format, pays, genre] = calculerCompatibilite(
      { ...PROJET, genre: null, countries: ["CM"] },
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

  it("la durée se dit en minutes, la fourchette comme la source la donne", () => {
    const nommer = (code) => `«${code}»`;
    const raison = (minutes, min, max) =>
      raisonCritere(
        calculerCompatibilite(
          { ...PROJET, duration_minutes: minutes },
          opportunite({ duration_min_minutes: min, duration_max_minutes: max }),
        ).criteres[3],
        nommer,
      );
    assert.equal(raison(75, 52, 90), "Demandé : de 52 à 90 minutes. Votre projet : 75 minutes.");
    assert.equal(raison(95, 52, 90), "Demandé : de 52 à 90 minutes. Votre projet : 95 minutes.");
    assert.equal(raison(75, 52, null), "Demandé : au moins 52 minutes. Votre projet : 75 minutes.");
    assert.equal(raison(1, null, 30), "Demandé : au plus 30 minutes. Votre projet : 1 minute.");
    assert.equal(raison(26, 26, 26), "Demandé : 26 minutes. Votre projet : 26 minutes.");
    assert.equal(raison(1, 1, 1), "Demandé : 1 minute. Votre projet : 1 minute.");
    assert.match(
      raison(null, 52, 90),
      /^Demandé : de 52 à 90 minutes\. Votre projet ne le dit pas/,
    );
    assert.match(raison(75, null, null), /Information non fournie\.$/);
    // Le stade, lui, se nomme comme un code.
    const [, , , , stade] = calculerCompatibilite(
      PROJET,
      opportunite({ stages: ["production"] }),
    ).criteres;
    assert.equal(
      raisonCritere(stade, nommer),
      "Demandé : «production». Votre projet : «developpement».",
    );
  });

  it("dit ce que le calcul regarde, ce qu'il ne regarde pas, et qu'il ne garantit rien", () => {
    const [compare, ignore] = LIMITES_COMPATIBILITE.split("Il ne juge");
    for (const mot of ["type de projet", "pays", "genre", "durée", "stade d'avancement"]) {
      assert.ok(compare.includes(mot), mot);
    }
    for (const mot of ["thématique", "langue", "exigences"]) {
      assert.ok(ignore.includes(mot), mot);
    }
    assert.match(compare, /cinq choses/);
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
      // Quatre critères remplis, mais le stade est contredit : après l'inconnue.
      ligne("stade contredit", opportunite({ ...TOUT_REMPLI, stages: ["production"] })),
    ];
    assert.deepEqual(noms(lignes), [
      "trois remplis",
      "un rempli",
      "inconnue",
      "stade contredit",
      "contredite",
    ]);
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
    assert.match(
      page,
      /\.select\("id, title, format, genre, countries, duration_minutes, stage"\)/,
    );
    // Les langues du projet sont un texte libre : elles ne se comparent pas.
    assert.doesNotMatch(page, /languages/);
  });

  it("le catalogue comparé est celui des équipes : jamais une démonstration", () => {
    assert.match(page, /\.in\("status", STATUTS_VISIBLES\)/);
    assert.match(page, /\.limit\(LIMITE_CATALOGUE\)/);
  });

  it("une opportunité expirée n'est pas comparée, et la page le dit", () => {
    assert.match(page, /echeanceDe\(opportunite, aujourdhui\) !== "passee"/);
    assert.match(page, /expirée n'est pas comparée|expirées ne sont pas comparées/);
  });

  it("la page lit du catalogue ce que les cinq critères comparent", () => {
    const colonnes = /from\("funding_opportunities"\)\s*\.select\(\s*"([^"]+)"/.exec(page)[1];
    for (const colonne of [
      "formats",
      "countries",
      "genres",
      "stages",
      "duration_min_minutes",
      "duration_max_minutes",
    ]) {
      assert.ok(colonnes.split(", ").includes(colonne), colonne);
    }
  });

  it("chaque critère a de quoi se nommer, et la fiche dit ce qui lui manque", () => {
    for (const code of Object.keys(CRITERES_COMPATIBILITE)) {
      assert.match(page, new RegExp(`^\\s+${code}: \\(code\\) =>`, "m"), code);
    }
    assert.match(page, /projet\.duration_minutes === null \? "sa durée" : null/);
    assert.match(page, /stade: \(code\) => \(ETAPES as Record<string, string>\)\[code\] \?\? code/);
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
