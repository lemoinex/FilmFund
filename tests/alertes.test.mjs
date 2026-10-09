/**
 * Alertes internes (lot W1) : ce qui déclenche une alerte, dans quel ordre
 * elles se lisent, et ce que leur lecture ne doit jamais rapatrier.
 *
 * Modules purs et lecture du code : ni base, ni serveur. Qui lit quelle
 * candidature est la règle des financements, éprouvée par
 * tests/financements.test.mjs ; les alertes ne lisent qu'à travers elle.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ALERTES_PRESENTEES,
  calculerAlertes,
  delaiEnClair,
  grouperParProjet,
  joursEntre,
  LIMITES_ALERTES,
  NATURES_ALERTE,
  nombreEnClair,
  PRINCIPE_ALERTES,
  REGLES_ALERTE,
  SEUILS_ALERTES,
} from "../src/lib/alertes.ts";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const JOUR = "2026-10-07";
const P1 = "projet-1";
const P2 = "projet-2";
const titres = new Map([
  [P1, "Mami Wata"],
  [P2, "Une maison hantée"],
]);
const vide = { titres, etapes: [], candidatures: [], pieces: [], opportunites: [] };
const etape = (due_on, surcharge = {}) => ({
  project_id: P1,
  title: `Étape du ${due_on}`,
  due_on,
  status: "a_faire",
  ...surcharge,
});
const candidature = (id, deadline, surcharge = {}) => ({
  id,
  project_id: P1,
  funder: "Fonds fictif",
  program: null,
  deadline,
  status: "a_preparer",
  ...surcharge,
});
const natures = (alertes) => alertes.map((alerte) => alerte.nature);

describe("Alertes : les dates", () => {
  it("compte les jours sans se tromper d'un mois ni d'une année", () => {
    assert.equal(joursEntre("2026-10-07", "2026-10-07"), 0);
    assert.equal(joursEntre("2026-10-07", "2026-10-08"), 1);
    assert.equal(joursEntre("2026-10-07", "2026-10-06"), -1);
    assert.equal(joursEntre("2026-10-31", "2026-11-01"), 1);
    assert.equal(joursEntre("2026-12-31", "2027-01-01"), 1);
    assert.equal(joursEntre("2028-02-28", "2028-03-01"), 2);
  });

  it("dit un délai comme on le dit", () => {
    assert.equal(delaiEnClair(0), "aujourd'hui");
    assert.equal(delaiEnClair(1), "demain");
    assert.equal(delaiEnClair(5), "dans 5 jours");
    assert.equal(nombreEnClair(1), "1 alerte");
    assert.equal(nombreEnClair(4), "4 alertes");
  });
});

describe("Alertes : les étapes du planning", () => {
  it("en retard dès le lendemain de l'échéance, et pas le jour même", () => {
    const alertes = calculerAlertes(
      { ...vide, etapes: [etape("2026-10-06"), etape("2026-10-07"), etape("2026-09-07")] },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.jour, a.detail]),
      [
        ["etape_en_retard", "2026-09-07", "en retard depuis 30 jours"],
        ["etape_en_retard", "2026-10-06", "en retard depuis hier"],
        ["etape_proche", "2026-10-07", "aujourd'hui"],
      ],
    );
  });

  it("à venir jusqu'au septième jour compris, plus au huitième", () => {
    const alertes = calculerAlertes(
      { ...vide, etapes: [etape("2026-10-14"), etape("2026-10-15"), etape("2026-10-08")] },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.jour, a.detail]),
      [
        ["etape_proche", "2026-10-08", "demain"],
        ["etape_proche", "2026-10-14", "dans 7 jours"],
      ],
    );
    assert.equal(SEUILS_ALERTES.etapeProche, 7);
  });

  it("une étape terminée, sans date ou à la date illisible n'alerte pas", () => {
    const alertes = calculerAlertes(
      {
        ...vide,
        etapes: [
          etape("2026-10-01", { status: "termine" }),
          etape(null),
          etape("bientôt"),
          etape("2026-10-01", { status: "en_cours" }),
        ],
      },
      JOUR,
    );
    assert.deepEqual(natures(alertes), ["etape_en_retard"]);
    assert.equal(alertes[0].href, `/projets/${P1}/planning`);
    assert.equal(alertes[0].projet, "Mami Wata");
  });
});

describe("Alertes : les candidatures", () => {
  it("sans pièce jointe, le dossier est incomplet jusqu'au trentième jour compris", () => {
    const alertes = calculerAlertes(
      {
        ...vide,
        candidatures: [
          candidature("a", "2026-11-06"),
          candidature("b", "2026-11-07"),
          candidature("c", "2026-10-07", { program: "Aide à l'écriture" }),
        ],
      },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.titre, a.detail]),
      [
        [
          "dossier_incomplet",
          "Fonds fictif — Aide à l'écriture",
          "aucune pièce jointe · date limite aujourd'hui",
        ],
        ["dossier_incomplet", "Fonds fictif", "aucune pièce jointe · date limite dans 30 jours"],
      ],
    );
    assert.equal(SEUILS_ALERTES.dossierIncomplet, 30);
  });

  it("une pièce qui n'est pas finalisée laisse le dossier incomplet", () => {
    const alertes = calculerAlertes(
      {
        ...vide,
        candidatures: [candidature("a", "2026-10-20"), candidature("b", "2026-10-21")],
        pieces: [
          { funding_id: "a", statut: "finalise" },
          { funding_id: "a", statut: "brouillon" },
          { funding_id: "b", statut: "en_relecture" },
          { funding_id: "b", statut: "illisible" },
        ],
      },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.detail]),
      [
        ["dossier_incomplet", "1 pièce non finalisée · date limite dans 13 jours"],
        ["dossier_incomplet", "2 pièces non finalisées · date limite dans 14 jours"],
      ],
    );
  });

  it("pièces finalisées : à déposer jusqu'au quatorzième jour compris, plus au quinzième", () => {
    const pieces = ["a", "b", "c"].map((funding_id) => ({ funding_id, statut: "finalise" }));
    const alertes = calculerAlertes(
      {
        ...vide,
        candidatures: [
          candidature("a", "2026-10-21"),
          candidature("b", "2026-10-22"),
          candidature("c", "2026-10-07"),
        ],
        pieces,
      },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.jour, a.detail]),
      [
        ["candidature_proche", "2026-10-07", "pièces finalisées · date limite aujourd'hui"],
        ["candidature_proche", "2026-10-21", "pièces finalisées · date limite dans 14 jours"],
      ],
    );
    assert.equal(SEUILS_ALERTES.candidatureProche, 14);
  });

  it("une candidature ne donne jamais deux alertes", () => {
    const alertes = calculerAlertes(
      { ...vide, candidatures: [candidature("a", "2026-10-10")] },
      JOUR,
    );
    assert.deepEqual(natures(alertes), ["dossier_incomplet"]);
  });

  it("déposée, passée, sans date : aucune alerte, et jamais un montant", () => {
    const alertes = calculerAlertes(
      {
        ...vide,
        candidatures: [
          candidature("a", "2026-10-10", { status: "deposee" }),
          candidature("b", "2026-10-06"),
          candidature("c", null),
          candidature("d", "2026-10-10", { status: "acceptee" }),
        ],
      },
      JOUR,
    );
    assert.deepEqual(alertes, []);

    const texte = JSON.stringify(
      calculerAlertes(
        { ...vide, candidatures: [candidature("a", "2026-10-10", { amount_requested: 5000000 })] },
        JOUR,
      ),
    );
    assert.doesNotMatch(texte, /5000000|amount/);
  });
});

describe("Alertes : les opportunités à étudier", () => {
  const opportunite = (deadline, projetId = P1) => ({
    id: "opp-1",
    projetId,
    name: "Appel fictif",
    organization: "Organisme fictif",
    deadline,
  });

  it("bientôt close jusqu'au quatorzième jour compris ; ni passée, ni sans date", () => {
    const alertes = calculerAlertes(
      {
        ...vide,
        opportunites: [
          opportunite("2026-10-21"),
          opportunite("2026-10-22"),
          opportunite("2026-10-06"),
          opportunite(null),
        ],
      },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.detail, a.href]),
      [
        [
          "opportunite_proche",
          "Organisme fictif · date limite dans 14 jours",
          "/opportunites/opp-1",
        ],
      ],
    );
    assert.equal(SEUILS_ALERTES.opportuniteProche, 14);
  });

  it("la même opportunité alerte chaque projet pour lequel elle est à étudier", () => {
    const alertes = calculerAlertes(
      { ...vide, opportunites: [opportunite("2026-10-10", P1), opportunite("2026-10-10", P2)] },
      JOUR,
    );
    assert.deepEqual(
      alertes.map((a) => a.projet),
      ["Mami Wata", "Une maison hantée"],
    );
  });
});

describe("Alertes : les nouvelles opportunités", () => {
  const nouvelle = (verifieeLe, surcharge = {}) => ({
    id: "opp-2",
    projetId: P1,
    name: "Fonds fictif",
    organization: "Organisme fictif",
    deadline: null,
    verifieeLe,
    ...surcharge,
  });
  const de = (...opportunites) => calculerAlertes({ ...vide, opportunites }, JOUR);

  it("nouvelle du jour de sa vérification au quatorzième jour compris", () => {
    assert.equal(SEUILS_ALERTES.opportuniteNouvelle, 14);
    assert.deepEqual(
      de(nouvelle(JOUR)).map((a) => [a.nature, a.jour, a.detail, a.href]),
      [
        [
          "opportunite_nouvelle",
          JOUR,
          "Organisme fictif · vérifiée aujourd'hui",
          "/opportunites/opp-2",
        ],
      ],
    );
    assert.equal(de(nouvelle("2026-10-06"))[0].detail, "Organisme fictif · vérifiée hier");
    assert.equal(
      de(nouvelle("2026-09-23"))[0].detail,
      "Organisme fictif · vérifiée il y a 14 jours",
    );
    // Le quinzième jour, elle n'est plus nouvelle : rien ne la retient.
    assert.deepEqual(de(nouvelle("2026-09-22")), []);
  });

  it("jamais nouvelle sans date de vérification connue, ni à une date illisible ou à venir", () => {
    for (const verifieeLe of [null, undefined, "", "hier", "2026-10-07T12:00:00Z", "2026-10-08"]) {
      assert.deepEqual(de(nouvelle(verifieeLe)), [], String(verifieeLe));
    }
    // Une opportunité vérifiée avant le lot W2 n'a pas de date : elle se tait.
    const ancienne = nouvelle(JOUR);
    delete ancienne.verifieeLe;
    assert.deepEqual(de(ancienne), []);
  });

  it("dit sa date limite quand elle en a une, et se tait si elle est passée", () => {
    assert.equal(
      de(nouvelle("2026-10-05", { deadline: "2026-12-01" }))[0].detail,
      "Organisme fictif · vérifiée il y a 2 jours · date limite dans 55 jours",
    );
    assert.deepEqual(de(nouvelle("2026-10-05", { deadline: "2026-10-06" })), []);
    assert.deepEqual(de(nouvelle("2026-10-05", { deadline: "bientôt" })), []);
  });

  it("une seule alerte par opportunité et par projet : « bientôt close » l'emporte", () => {
    const alertes = de(nouvelle("2026-10-05", { deadline: "2026-10-15" }));
    assert.deepEqual(natures(alertes), ["opportunite_proche"]);
    // Au-delà du délai de clôture, elle redevient simplement nouvelle.
    assert.deepEqual(natures(de(nouvelle("2026-10-05", { deadline: "2026-10-22" }))), [
      "opportunite_nouvelle",
    ]);
  });

  it("alerte chaque projet pour lequel elle est à étudier, la plus ancienne d'abord", () => {
    const alertes = de(
      nouvelle("2026-10-06", { projetId: P2 }),
      nouvelle("2026-10-01"),
      nouvelle("2026-10-03", { id: "opp-3", name: "Autre fonds" }),
    );
    assert.deepEqual(
      alertes.map((a) => [a.projet, a.titre, a.jour]),
      [
        ["Mami Wata", "Fonds fictif", "2026-10-01"],
        ["Mami Wata", "Autre fonds", "2026-10-03"],
        ["Une maison hantée", "Fonds fictif", "2026-10-06"],
      ],
    );
  });
});

describe("Alertes : l'ordre et le regroupement", () => {
  const tout = {
    titres,
    etapes: [etape("2026-10-09"), etape("2026-10-01", { project_id: P2 })],
    candidatures: [candidature("a", "2026-10-12"), candidature("b", "2026-10-08")],
    pieces: [{ funding_id: "b", statut: "finalise" }],
    opportunites: [
      { id: "o", projetId: P2, name: "Appel", organization: "Organisme", deadline: "2026-10-08" },
      {
        id: "n",
        projetId: P1,
        name: "Fonds récent",
        organization: "Organisme",
        deadline: null,
        verifieeLe: "2026-10-05",
      },
    ],
  };

  it("la plus pressante d'abord : par nature, puis par date", () => {
    assert.deepEqual(natures(calculerAlertes(tout, JOUR)), Object.keys(NATURES_ALERTE));
    assert.deepEqual(Object.keys(NATURES_ALERTE), [
      "etape_en_retard",
      "dossier_incomplet",
      "candidature_proche",
      "opportunite_proche",
      "etape_proche",
      "opportunite_nouvelle",
    ]);
  });

  it("regroupe par projet, dans l'ordre où chacun apparaît", () => {
    const groupes = grouperParProjet(calculerAlertes(tout, JOUR));
    assert.deepEqual(
      groupes.map((g) => [g.projet, natures(g.alertes)]),
      [
        ["Une maison hantée", ["etape_en_retard", "opportunite_proche"]],
        [
          "Mami Wata",
          ["dossier_incomplet", "candidature_proche", "etape_proche", "opportunite_nouvelle"],
        ],
      ],
    );
  });

  it("sans donnée, aucune alerte", () => {
    assert.deepEqual(calculerAlertes(vide, JOUR), []);
    assert.deepEqual(grouperParProjet([]), []);
  });
});

describe("Alertes : ce que l'écran dit", () => {
  it("chaque nature a son libellé et sa règle, qui cite son propre seuil", () => {
    assert.deepEqual(Object.keys(REGLES_ALERTE), Object.keys(NATURES_ALERTE));
    assert.match(REGLES_ALERTE.etape_proche, new RegExp(`${SEUILS_ALERTES.etapeProche} jours`));
    assert.match(
      REGLES_ALERTE.dossier_incomplet,
      new RegExp(`${SEUILS_ALERTES.dossierIncomplet} jours`),
    );
    assert.match(
      REGLES_ALERTE.candidature_proche,
      new RegExp(`${SEUILS_ALERTES.candidatureProche} jours`),
    );
    assert.match(
      REGLES_ALERTE.opportunite_proche,
      new RegExp(`${SEUILS_ALERTES.opportuniteProche} jours`),
    );
    assert.match(
      REGLES_ALERTE.opportunite_nouvelle,
      new RegExp(`vérifiée depuis ${SEUILS_ALERTES.opportuniteNouvelle} jours au plus`),
    );
    // Rien n'est stocké : la règle dit pourquoi l'alerte s'éteint d'elle-même.
    assert.match(REGLES_ALERTE.opportunite_nouvelle, /n'est pas marquée comme lue/);
  });

  it("le principe dit que rien n'est stocké, et que les délais sont un choix", () => {
    assert.match(PRINCIPE_ALERTES, /Rien n'est enregistré/);
    assert.match(PRINCIPE_ALERTES, /disparaît quand sa cause disparaît/);
    assert.match(PRINCIPE_ALERTES, /pas une norme/);
    // Aucun mot qui promettrait une éligibilité.
    for (const texte of [
      PRINCIPE_ALERTES,
      ...Object.values(REGLES_ALERTE),
      ...Object.values(NATURES_ALERTE),
    ]) {
      assert.doesNotMatch(texte, /compatible|éligible|%/i, texte);
    }
  });
});

describe("Alertes : ce que la lecture rapatrie", () => {
  const lecture = sansCommentaires(lire("src/app/(app)/alertes/lecture.ts"));

  it("une candidature se lit sans son montant, et seulement « à préparer »", () => {
    const colonnes = /from\("project_fundings"\)\s*\.select\("([^"]+)"\)/.exec(lecture)[1];
    assert.equal(colonnes, "id, project_id, funder, program, deadline, status");
    assert.doesNotMatch(lecture, /amount|currency|notes/);
    assert.match(lecture, /\.eq\("status", "a_preparer"\)/);
  });

  it("le catalogue ne rend jamais une démonstration, même à un administrateur", () => {
    assert.match(
      lecture,
      /from\("funding_opportunities"\)[\s\S]*?\.in\("status", STATUTS_VISIBLES\)/,
    );
    assert.match(lecture, /echeanceDe\(opportunite, jour\) !== "passee"/);
    // La règle « à étudier » est celle du lot L5b, pas une seconde.
    assert.match(lecture, /estAEtudier\(calculerCompatibilite\(fiche, opportunite\)\)/);
    // Elle lit, des deux côtés, ce que ses cinq critères comparent (lot OP2).
    assert.match(lecture, /\.select\("id, format, genre, countries, duration_minutes, stage"\)/);
    assert.equal(
      lecture.match(/genres, stages, duration_min_minutes, duration_max_minutes, deadline/g).length,
      2,
    );
  });

  it("chaque lecture est bornée, et la borne se dit", () => {
    assert.equal(lecture.match(/\.limit\(LIMITES_ALERTES\.lignes\)/g).length, 2);
    assert.match(lecture, /\.limit\(LIMITE_CATALOGUE\)/);
    assert.match(lecture, /borneAtteinte:/);
    assert.ok(LIMITES_ALERTES.projets <= 100 && LIMITES_ALERTES.lignes <= 100);
    // Les délais lus sont ceux des règles : rien n'est rapatrié au-delà.
    for (const seuil of ["etapeProche", "dossierIncomplet", "opportuniteProche"]) {
      assert.match(lecture, new RegExp(`jourApres\\(jour, SEUILS_ALERTES\\.${seuil}\\)`), seuil);
    }
  });

  it("les nouvelles opportunités : vérifiées seulement, dans le délai, bornées, sans doublon", () => {
    const requetes = lecture.split('.from("funding_opportunities")').slice(1);
    assert.equal(requetes.length, 2);
    const recentes = requetes[1];
    // « Vérifiée » seulement : ni expirée, ni démonstration, ni en attente.
    assert.match(
      recentes,
      /^\s*\.select\(\s*"[^"]*verified_at",?\s*\)\s*\.eq\("status", "verifie"\)/,
    );
    assert.match(
      recentes,
      /\.gte\("verified_at", `\$\{jourApres\(jour, -SEUILS_ALERTES\.opportuniteNouvelle\)\}T00:00:00Z`\)/,
    );
    assert.equal(lecture.match(/\.limit\(LIMITE_CATALOGUE\)/g).length, 2);
    assert.match(lecture, /\(recentes \?\? \[\]\)\.length >= LIMITE_CATALOGUE/);
    // Les deux lectures fusionnent par identifiant, avant la règle « à étudier ».
    assert.match(
      lecture,
      /new Map\(\s*\[\.\.\.\(catalogue \?\? \[\]\), \.\.\.\(recentes \?\? \[\]\)\]\.map\(\(opportunite\) => \[opportunite\.id, opportunite\]\),?\s*\)/,
    );
    // Et c'est bien la fusion qui est filtrée, pas les deux listes bout à bout.
    assert.match(lecture, /const ouvertes = \[\.\.\.lignes\.values\(\)\]\.filter\(/);
    assert.equal(lecture.match(/\.\.\.\(recentes \?\? \[\]\)/g).length, 1);
    assert.match(lecture, /verifieeLe: opportunite\.verified_at\?\.slice\(0, 10\) \?\? null,/);
    // Ni l'auteur ni la source ne sont lus pour une alerte.
    assert.doesNotMatch(lecture, /created_by|updated_by|source_url|source_excerpt/);
  });

  it("une pièce illisible ne compte pas comme finalisée, et rien ne passe par un accès privilégié", () => {
    assert.match(lecture, /statut: document\?\.status \?\? "illisible"/);
    assert.doesNotMatch(lecture, /SECRET|service_role|rpc\(/);
  });
});

describe("Alertes : les écrans", () => {
  it("l'état vide dit tout ce qui aurait pu alerter, la nouveauté comprise", () => {
    const page = lire("src/app/(app)/alertes/page.tsx");
    const vide = /"(Aucune alerte : aucune [^"]+)"/.exec(page)?.[1];
    assert.ok(vide, "phrase de l'état vide introuvable");
    // Une mention par famille de natures : l'oublier laisserait croire
    // qu'elle n'est pas calculée.
    const mentions = {
      etape_en_retard: /étape en retard/,
      etape_proche: /ni à venir/,
      dossier_incomplet: /candidature à déposer/,
      candidature_proche: /candidature à déposer/,
      opportunite_proche: /opportunité à étudier bientôt close/,
      opportunite_nouvelle: /nouvellement vérifiée/,
    };
    assert.deepEqual(Object.keys(mentions).sort(), Object.keys(NATURES_ALERTE).sort());
    for (const [nature, mention] of Object.entries(mentions)) {
      assert.match(vide, mention, nature);
    }
  });

  it("la rubrique ne lit que les projets portés ou partagés, jamais ceux de l'administration", () => {
    const page = sansCommentaires(lire("src/app/(app)/alertes/page.tsx"));
    assert.match(
      page,
      /chargerMesProjets\(supabase, user\.id, \{\s*limite: LIMITES_ALERTES\.projets,\s*\}\)/,
    );
    assert.doesNotMatch(page, /inclureAutres/);
    assert.match(page, /\{PRINCIPE_ALERTES\}/);
    assert.match(page, /\{REGLES_ALERTE\[nature\]\}/);
    assert.match(page, /if \(!user\) \{\s*redirect\("\/connexion"\);/);
  });

  it("le tableau de bord montre un aperçu, et se tait quand il n'y a rien", () => {
    const bloc = sansCommentaires(lire("src/app/(app)/tableau-de-bord/alertes.tsx"));
    assert.match(bloc, /if \(!alertes\.length\) \{\s*return null;/);
    assert.match(bloc, /alertes\.slice\(0, ALERTES_PRESENTEES\)/);
    assert.match(bloc, /href="\/alertes"/);
    assert.equal(ALERTES_PRESENTEES, 3);

    const tableau = sansCommentaires(lire("src/app/(app)/tableau-de-bord/page.tsx"));
    // Les mêmes projets que les chiffres : pas une seconde idée de « mes projets ».
    assert.match(tableau, /chargerAlertes\(supabase, tous\)/);
    assert.match(tableau, /<AlertesATraiter alertes=\{lecture\.alertes\} \/>/);
  });

  it("la rubrique est gardée par le middleware et proposée à tous les comptes", () => {
    const garde = lire("src/lib/supabase/middleware.ts");
    assert.match(/const ROUTES_PROTEGEES = \[([^\]]*)\]/.exec(garde)[1], /"\/alertes"/);
    const navigation = lire("src/app/(app)/navigation.tsx");
    const communes = navigation.slice(
      navigation.indexOf("const RUBRIQUES: Rubrique[]"),
      navigation.indexOf("const RUBRIQUES_ADMINISTRATION"),
    );
    assert.match(communes, /href: "\/alertes"/);
  });

  it("rien n'est stocké : ni table, ni migration, ni compteur dans la coque", () => {
    const migrations = lire("supabase/migrations/20261007180000_suspension_comptes.sql");
    assert.doesNotMatch(migrations, /alert/i);
    assert.doesNotMatch(lire("src/lib/supabase/database.types.ts"), /\balert(e)?s?: \{/i);
    // La coque ne se recalcule pas à chaque navigation : un compteur y serait périmé.
    assert.doesNotMatch(lire("src/app/(app)/layout.tsx"), /alerte/i);
    assert.equal(
      existsSync(new URL("../src/app/(app)/alertes/actions.ts", import.meta.url)),
      false,
    );
  });
});
