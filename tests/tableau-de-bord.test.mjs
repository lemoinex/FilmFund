/**
 * Tableau de bord (lot T1) : les chiffres, les opportunités à étudier et les
 * prochaines échéances — ce que le module calcule, et ce que la page lit.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. La page et ses composants sont lus
 * comme du texte. Les échéances d'ici sont FICTIVES.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { calculerCompatibilite, estAEtudier, REGLE_A_ETUDIER } from "../src/lib/compatibilite.ts";
import { LIMITE_SCORES_LISTE } from "../src/lib/maturite.ts";
import {
  compterDansHorizon,
  ECHEANCES_PRESENTEES,
  echeancesAVenir,
  HORIZON_ECHEANCES_JOURS,
  jourApres,
  LIMITE_PROJETS_COMPTES,
  NATURES_ECHEANCE,
  nombreBorne,
  OPPORTUNITES_PRESENTEES,
  PROJETS_PRESENTES,
} from "../src/lib/tableau-de-bord.ts";

const DOSSIER = "src/app/(app)/tableau-de-bord";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const AUJOURDHUI = "2026-10-07";
const echeance = (titre, jour, nature = "etape") => ({
  nature,
  jour,
  titre,
  contexte: "Projet fictif",
  href: "/projets/p/planning",
});
const titres = (liste) => liste.map((e) => e.titre);

describe("Tableau de bord : la règle « à étudier »", () => {
  const PROJET = {
    format: "documentaire",
    genre: "societe",
    countries: ["CM"],
    duration_minutes: 75,
    stage: "developpement",
  };
  const juge = (opportunite) =>
    estAEtudier(
      calculerCompatibilite(PROJET, {
        formats: [],
        genres: [],
        countries: [],
        stages: [],
        duration_min_minutes: null,
        duration_max_minutes: null,
        ...opportunite,
      }),
    );

  it("au moins un critère rempli, aucun contredit", () => {
    assert.equal(juge({ formats: ["documentaire"] }), true);
    assert.equal(juge({ formats: ["documentaire"], countries: ["CM"], genres: ["societe"] }), true);
    // La durée et le stade désignent une opportunité comme les trois autres (lot OP2).
    assert.equal(juge({ stages: ["developpement"] }), true);
    assert.equal(juge({ duration_min_minutes: 52, duration_max_minutes: 90 }), true);
  });

  it("une opportunité qui ne précise rien n'est pas « à étudier » : rien ne la désigne", () => {
    assert.equal(juge({}), false);
  });

  it("un seul critère contredit suffit à l'écarter, même si deux sont remplis", () => {
    assert.equal(
      juge({ formats: ["documentaire"], genres: ["societe"], countries: ["SN"] }),
      false,
    );
    // Un stade ou une durée que le projet contredit l'écarte tout autant.
    assert.equal(
      juge({ formats: ["documentaire"], genres: ["societe"], stages: ["production"] }),
      false,
    );
    assert.equal(juge({ formats: ["documentaire"], duration_max_minutes: 30 }), false);
  });

  it("le tableau de bord lit du projet et du catalogue ce que les cinq critères comparent", () => {
    const page = lire(`${DOSSIER}/page.tsx`);
    assert.match(page, /\.select\("format, genre, countries, duration_minutes, stage"\)/);
    assert.match(page, /genres, stages, duration_min_minutes, duration_max_minutes,/);
  });

  it("la règle est dite, et ne promet rien", () => {
    for (const critere of ["type de projet", "pays", "genre", "durée", "stade d'avancement"]) {
      assert.ok(REGLE_A_ETUDIER.includes(critere), critere);
    }
    assert.match(REGLE_A_ETUDIER, /au moins un critère rempli/);
    assert.match(REGLE_A_ETUDIER, /aucun contredit/);
    assert.match(REGLE_A_ETUDIER, /pas une garantie d'éligibilité/);
  });
});

describe("Tableau de bord : les échéances", () => {
  it("le jour d'après se calcule en UTC, d'un mois et d'une année à l'autre", () => {
    assert.equal(jourApres("2026-10-07", 30), "2026-11-06");
    assert.equal(jourApres("2026-12-15", 30), "2027-01-14");
    assert.equal(jourApres("2028-02-28", 1), "2028-02-29");
    assert.equal(jourApres("2026-10-07", 0), "2026-10-07");
  });

  it("ne garde que l'à venir, aujourd'hui compris, la plus proche d'abord", () => {
    const liste = [
      echeance("dans dix jours", "2026-10-17"),
      echeance("hier", "2026-10-06"),
      echeance("aujourd'hui", "2026-10-07"),
      echeance("demain", "2026-10-08"),
    ];
    assert.deepEqual(titres(echeancesAVenir(liste, AUJOURDHUI)), [
      "aujourd'hui",
      "demain",
      "dans dix jours",
    ]);
    assert.equal(liste.length, 4);
  });

  it("le même jour : étape, puis candidature, puis opportunité ; l'ordre reçu ensuite", () => {
    const liste = [
      echeance("opportunité", "2026-10-20", "opportunite"),
      echeance("candidature", "2026-10-20", "candidature"),
      echeance("étape b", "2026-10-20", "etape"),
      echeance("étape a", "2026-10-20", "etape"),
    ];
    assert.deepEqual(titres(echeancesAVenir(liste, AUJOURDHUI)), [
      "étape b",
      "étape a",
      "candidature",
      "opportunité",
    ]);
    assert.deepEqual(Object.keys(NATURES_ECHEANCE), ["etape", "candidature", "opportunite"]);
  });

  it("écarte une date mal formée plutôt que de la classer", () => {
    assert.deepEqual(
      titres(echeancesAVenir([echeance("x", "bientôt"), echeance("y", "2026-10-09")], AUJOURDHUI)),
      ["y"],
    );
  });

  it("compte dans les trente jours, le trentième compris, le trente et unième non", () => {
    const liste = [
      echeance("aujourd'hui", "2026-10-07"),
      echeance("trentième jour", "2026-11-06"),
      echeance("trente et unième", "2026-11-07"),
      echeance("passée", "2026-10-01"),
    ];
    assert.equal(HORIZON_ECHEANCES_JOURS, 30);
    assert.equal(compterDansHorizon(liste, AUJOURDHUI), 2);
    assert.equal(compterDansHorizon([], AUJOURDHUI), 0);
  });
});

describe("Tableau de bord : les bornes", () => {
  it("un nombre arrivé à sa borne ne se donne pas pour exact", () => {
    assert.equal(nombreBorne(0, 100), "0");
    assert.equal(nombreBorne(99, 100), "99");
    assert.equal(nombreBorne(100, 100), "100 et plus");
  });

  it("les projets comptés suivent le plafond des listes du score de maturité", () => {
    assert.equal(LIMITE_PROJETS_COMPTES, LIMITE_SCORES_LISTE);
    assert.ok(PROJETS_PRESENTES <= LIMITE_PROJETS_COMPTES);
    assert.equal(OPPORTUNITES_PRESENTEES, 3);
    assert.equal(ECHEANCES_PRESENTEES, 5);
  });
});

describe("Tableau de bord : ce que la page lit", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const accueil = page.slice(
    page.indexOf("async function chargerAccueil"),
    page.indexOf("async function ProjetEnCours"),
  );

  it("la lecture du lot tient dans une fonction, après le contrôle de la session", () => {
    assert.ok(accueil.length > 0, "chargerAccueil introuvable");
    assert.ok(page.indexOf('redirect("/connexion")') < page.indexOf("chargerAccueil(supabase"));
  });

  it("aucun accès privilégié, aucune écriture, aucun appel à un modèle", () => {
    assert.doesNotMatch(page, /service_role|createAdmin|SECRET/);
    assert.doesNotMatch(accueil, /\.(insert|update|upsert|delete|rpc)\(/);
    assert.doesNotMatch(accueil, /creer_devis|ai_suggestions|\bjobs\b/);
  });

  it("les projets sont comptés sur l'ensemble, bornés, et cinq sont présentés", () => {
    assert.match(
      page,
      /chargerMesProjets\(supabase, user\.id, \{ limite: LIMITE_PROJETS_COMPTES \}\)/,
    );
    assert.match(page, /tous\.slice\(0, PROJETS_PRESENTES\)/);
    assert.match(page, /nombreBorne\(tous\.length, LIMITE_PROJETS_COMPTES\)/);
  });

  it("les documents sont comptés sans être rapatriés, dans mes projets seulement", () => {
    assert.match(
      accueil,
      /\.from\("project_documents"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.in\("project_id", ids\)/,
    );
  });

  it("les candidatures se lisent sous la RLS, sans montant, et seulement celles à préparer", () => {
    const lecture = /\.from\("project_fundings"\)[\s\S]*?\.limit\(LIMITE_LECTURE_ECHEANCES\)/.exec(
      accueil,
    )?.[0];
    assert.ok(lecture, "lecture des candidatures introuvable");
    assert.match(lecture, /\.select\("project_id, funder, program, deadline"\)/);
    assert.doesNotMatch(lecture, /amount/);
    assert.match(lecture, /\.in\("project_id", ids\)/);
    assert.match(lecture, /\.eq\("status", "a_preparer"\)/);
    assert.match(lecture, /\.gte\("deadline", jour\)/);
  });

  it("les étapes terminées ou passées ne sont pas des échéances", () => {
    const lecture =
      /\.from\("project_milestones"\)[\s\S]*?\.limit\(LIMITE_LECTURE_ECHEANCES\)/.exec(
        accueil,
      )?.[0];
    assert.ok(lecture, "lecture des étapes introuvable");
    assert.match(lecture, /\.neq\("status", "termine"\)/);
    assert.match(lecture, /\.gte\("due_on", jour\)/);
  });

  it("le catalogue est celui des équipes : jamais une démonstration, et borné", () => {
    assert.match(accueil, /\.in\("status", STATUTS_VISIBLES\)/);
    assert.match(accueil, /\.limit\(LIMITE_CATALOGUE\)/);
    assert.match(accueil, /echeanceDe\(opportunite, jour\) !== "passee"/);
  });

  it("le calcul est celui de l'onglet du projet, pas un second", () => {
    assert.match(accueil, /calculerCompatibilite\(fiche, opportunite\)/);
    assert.match(accueil, /classerParCompatibilite\(/);
    assert.match(
      accueil,
      /\.filter\(\(opportunite\) => estAEtudier\(opportunite\.compatibilite\)\)/,
    );
    assert.doesNotMatch(page, /nonRemplis|remplis >/);
  });

  it("le chiffre et la liste comptent la même chose", () => {
    assert.match(accueil, /nombreAEtudier: aEtudier\.length/);
    assert.match(accueil, /aEtudier: aEtudier\.slice\(0, OPPORTUNITES_PRESENTEES\)/);
    assert.match(accueil, /dansHorizon: compterDansHorizon\(echeances, jour\)/);
    assert.match(accueil, /echeances: echeances\.slice\(0, ECHEANCES_PRESENTEES\)/);
  });

  it("le bloc du score de maturité reste réservé à qui lit le budget", () => {
    assert.match(page, /\{budgetAutorise \? <ScoreMaturite projetId=\{projet\.id\} \/> : null\}/);
  });
});

describe("Tableau de bord : ce que les blocs annoncent", () => {
  const chiffres = sansCommentaires(lire(`${DOSSIER}/chiffres.tsx`));
  const opportunites = sansCommentaires(lire(`${DOSSIER}/opportunites.tsx`));
  const echeances = sansCommentaires(lire(`${DOSSIER}/echeances.tsx`));
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));

  it("chaque chiffre dit ce qu'il compte", () => {
    assert.match(chiffres, /\{chiffre\.precision\}/);
    for (const libelle of ["Projets", "Documents", "Opportunités à étudier", "Échéances"]) {
      assert.match(page, new RegExp(`titre: "${libelle}"`));
    }
    assert.match(page, /brouillons compris/);
    assert.doesNotMatch(page, /Documents générés|Opportunités compatibles/);
  });

  it("les opportunités : la règle affichée, un décompte, aucun pourcentage", () => {
    assert.match(opportunites, /\{REGLE_A_ETUDIER\}/);
    assert.match(opportunites, /decompteEnClair\(opportunite\.compatibilite\)/);
    assert.doesNotMatch(opportunites, /%|\/ 100|score|recommand|compatibles/i);
  });

  it("un catalogue vide ne se dit pas comme une absence de résultat, et n'invente rien", () => {
    assert.match(opportunites, /catalogueVide/);
    assert.match(opportunites, /aucune opportunité fictive/);
    assert.match(opportunites, /Information non fournie\./);
  });

  it("chaque échéance nomme sa nature et mène à sa page", () => {
    assert.match(echeances, /NATURES_ECHEANCE\[echeance\.nature\]/);
    assert.match(echeances, /href=\{echeance\.href\}/);
    assert.match(echeances, /Aucune échéance à venir/);
  });

  it("les trois blocs sont des composants serveur, sans script", () => {
    for (const source of [chiffres, opportunites, echeances]) {
      assert.doesNotMatch(source, /"use client"|dangerouslySetInnerHTML/);
    }
  });
});
