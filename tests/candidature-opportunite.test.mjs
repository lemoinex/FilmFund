/**
 * Candidature préparée depuis une opportunité du catalogue (lot U1) : ce qui
 * se reprend, ce qui ne se reprend pas, et ce que les pages lisent.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les pages et le formulaire sont lus comme du
 * texte. Les opportunités d'ici sont FICTIVES.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { preremplirCandidature } from "../src/lib/financements-calculs.ts";

const FINANCEMENTS = "src/app/(app)/projets/[id]/financements";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const AUJOURDHUI = "2026-10-07";
const DEVISES = ["XAF", "XOF", "EUR", "USD"];
const opportunite = (surcharge = {}) => ({
  name: "Aide fictive au développement",
  organization: "Organisme fictif",
  category: "fonds",
  currency: "EUR",
  deadline: "2026-12-31",
  source_url: "https://exemple.org/appel",
  collected_on: "2026-10-01",
  ...surcharge,
});
const reprise = (surcharge) => preremplirCandidature(opportunite(surcharge), DEVISES, AUJOURDHUI);

describe("Candidature depuis une opportunité : ce qui se reprend", () => {
  it("l'organisme, le nom, la date limite, la devise et la source", () => {
    assert.deepEqual(reprise(), {
      funder: "Organisme fictif",
      program: "Aide fictive au développement",
      kind: null,
      currency: "EUR",
      deadline: "2026-12-31",
      notes:
        "Reprise du catalogue des opportunités. Source : https://exemple.org/appel, lue le 1 octobre 2026.",
    });
  });

  it("aucun montant : celui d'une opportunité est celui de l'aide, pas ce que le projet demande", () => {
    const valeurs = preremplirCandidature(
      { ...opportunite(), budget_min: 5000, budget_max: 30000 },
      DEVISES,
      AUJOURDHUI,
    );
    assert.deepEqual(Object.keys(valeurs).sort(), [
      "currency",
      "deadline",
      "funder",
      "kind",
      "notes",
      "program",
    ]);
    assert.doesNotMatch(JSON.stringify(valeurs), /5000|30000/);
  });

  it("le type n'est repris que s'il a un équivalent exact ; sinon il reste à choisir", () => {
    assert.equal(reprise({ category: "residence" }).kind, "residence");
    assert.equal(reprise({ category: "coproduction" }).kind, "coproduction");
    for (const category of [
      "fonds",
      "subvention",
      "bourse",
      "festival",
      "laboratoire",
      "atelier",
      "forum_pitch",
      "toString",
    ]) {
      assert.equal(reprise({ category }).kind, null, category);
    }
  });

  it("une devise que le budget ne connaît pas n'est pas reprise", () => {
    assert.equal(reprise({ currency: "CHF" }).currency, null);
    assert.equal(reprise({ currency: null }).currency, null);
    assert.equal(reprise({ currency: "XAF" }).currency, "XAF");
  });

  it("une date limite passée n'est pas reprise ; celle du jour l'est", () => {
    assert.equal(reprise({ deadline: "2026-10-06" }).deadline, null);
    assert.equal(reprise({ deadline: "2026-10-07" }).deadline, "2026-10-07");
    assert.equal(reprise({ deadline: null }).deadline, null);
  });

  it("sans source, la note le reste : aucune adresse n'est inventée", () => {
    assert.equal(
      reprise({ source_url: null, collected_on: null }).notes,
      "Reprise du catalogue des opportunités.",
    );
    assert.equal(
      reprise({ collected_on: null }).notes,
      "Reprise du catalogue des opportunités. Source : https://exemple.org/appel.",
    );
  });

  it("les valeurs tiennent dans les bornes du formulaire", () => {
    const valeurs = reprise({
      name: `  ${"n".repeat(300)}  `,
      organization: "o".repeat(300),
      source_url: `https://exemple.org/${"a".repeat(1990)}`,
    });
    assert.equal(valeurs.funder.length, 200);
    assert.equal(valeurs.program.length, 200);
    assert.ok(valeurs.notes.length <= 2000);
  });
});

describe("Candidature depuis une opportunité : la page des financements", () => {
  const page = sansCommentaires(lire(`${FINANCEMENTS}/page.tsx`));
  const lecture =
    /\.from\("funding_opportunities"\)[\s\S]*?\.maybeSingle\(\)/.exec(page)?.[0] ?? "";

  it("l'opportunité se lit après le contrôle des droits sur le projet", () => {
    assert.ok(lecture, "lecture de l'opportunité introuvable");
    const refus = page.indexOf("if (!projet || !autorise) {");
    assert.ok(refus > -1 && refus < page.indexOf('.from("funding_opportunities")'));
  });

  it("avec le filtre des écrans des équipes : jamais une démonstration", () => {
    assert.match(lecture, /\.eq\("id", opportuniteId\)/);
    assert.match(lecture, /\.in\("status", STATUTS_VISIBLES\)/);
  });

  it("un identifiant mal formé n'atteint pas la base, et une opportunité expirée ne préremplit rien", () => {
    assert.match(page, /typeof opportuniteId === "string" && UUID\.test\(opportuniteId\)/);
    assert.match(
      page,
      /echeanceDe\(opportuniteLue, jourCourant\) !== "passee" \? opportuniteLue : null/,
    );
  });

  it("la page n'écrit rien : seule l'action du formulaire crée la candidature", () => {
    assert.doesNotMatch(page, /\.(insert|update|upsert)\(/);
    assert.match(page, /preremplirCandidature\(reprise, Object\.keys\(DEVISES\), jourCourant\)/);
  });

  it("l'encart dit d'où viennent les valeurs, et que rien n'est enregistré", () => {
    assert.match(page, /du catalogue des opportunités/);
    assert.match(page, /vérifiez sur la source avant d&apos;enregistrer/);
    assert.match(
      page,
      /Rien\s+n&apos;est enregistré tant que vous n&apos;avez pas ajouté la candidature/,
    );
    assert.match(page, /Le montant demandé reste à\s+saisir/);
    assert.match(page, /montantEnClair\(reprise\)/);
  });
});

describe("Candidature depuis une opportunité : le formulaire et le bouton", () => {
  const formulaire = sansCommentaires(lire(`${FINANCEMENTS}/formulaire.tsx`));
  const actions = sansCommentaires(lire(`${FINANCEMENTS}/actions.ts`));
  const onglet = sansCommentaires(lire("src/app/(app)/projets/[id]/opportunites/page.tsx"));

  it("une candidature existante garde ses valeurs : le préremplissage ne les recouvre jamais", () => {
    for (const champ of ["funder", "program", "deadline", "notes"]) {
      assert.match(
        formulaire,
        new RegExp(`candidature\\?\\.${champ} \\?\\? prerempli\\?\\.${champ}`),
      );
    }
    assert.match(
      formulaire,
      /candidature\?\.currency \?\? prerempli\?\.currency \?\? deviseParDefaut/,
    );
  });

  it("le montant demandé n'est jamais prérempli", () => {
    assert.doesNotMatch(formulaire, /prerempli\?\.amount|prerempli\.amount/);
  });

  it("un type sans équivalent se choisit : le champ devient obligatoire, sans valeur par défaut", () => {
    assert.match(
      formulaire,
      /const typeAChoisir = !candidature && prerempli !== undefined && prerempli\.kind === null;/,
    );
    assert.match(formulaire, /required=\{typeAChoisir\}/);
  });

  it("l'action serveur n'a pas changé de contrat : elle ne lit rien de l'opportunité", () => {
    assert.doesNotMatch(actions, /opportunite|funding_opportunities/);
    assert.match(actions, /validerCandidature\(formData\)/);
  });

  it("le bouton n'est proposé qu'à qui gère le budget, et mène au formulaire", () => {
    assert.match(
      onglet,
      /\{budget === true \? \(\s*<Link\s+href=\{`\/projets\/\$\{id\}\/financements\?opportunite=\$\{opportunite\.id\}#ajout-candidature`\}/,
    );
    assert.match(onglet, /Préparer une candidature/);
  });

  it("l'onglet ne lit toujours ni budget ni financement", () => {
    assert.doesNotMatch(onglet, /budget_lines|project_budgets|project_fundings|amount_/);
  });
});
