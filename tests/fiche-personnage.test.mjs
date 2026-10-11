/**
 * Fiche détaillée d'un personnage (lot PF1) : ce que l'écran valide, ce que
 * la base borne, et ce qu'un agent lit.
 *
 * L'invariant du lot : un personnage sans fiche détaillée s'écrit pour un
 * agent exactement comme avant. La base l'éprouve de son côté
 * (supabase/tests/fiche_personnage.test.sql) ; ce test l'éprouve du côté du
 * worker, et tient les deux listes de champs égales.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AVERTISSEMENT_PERSONNE_REELLE,
  CHAMPS_FICHE_PERSONNAGE,
  fichePersonnageRemplie,
  normaliserFichePersonnage,
} from "../src/lib/fiche.ts";
import { ecrirePersonnage } from "../worker/src/agents/personnage.ts";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const lire = (chemin) => readFileSync(RACINE + chemin, "utf8");
const MIGRATION = lire("supabase/migrations/20261011180000_fiche_personnage.sql");
const SAUT = String.fromCharCode(10);
const TABULATION = String.fromCharCode(9);

const CLES = CHAMPS_FICHE_PERSONNAGE.map(({ cle }) => cle);
const VIDE = Object.fromEntries(CLES.map((cle) => [cle, ""]));

/** Ce que la base remet au worker : le nom de chaque champ, côté agent. */
const CLES_AGENT = [
  "age",
  "occupation",
  "apparence",
  "objectif",
  "obstacle",
  "arc",
  "traits",
  "liens",
];

describe("Fiche détaillée : ce que l'écran valide", () => {
  it("huit champs, dans l'ordre décidé", () => {
    assert.deepEqual(CLES, [
      "age",
      "occupation",
      "appearance",
      "goal",
      "obstacle",
      "arc",
      "traits",
      "relations",
    ]);
    assert.deepEqual(
      CHAMPS_FICHE_PERSONNAGE.map(({ libelle }) => libelle),
      ["Âge", "Occupation", "Apparence physique", "Objectif", "Obstacle", "Arc", "Traits", "Liens"],
    );
  });

  it("l'écran borne chaque champ comme la base", () => {
    for (const { cle, max, ligne } of CHAMPS_FICHE_PERSONNAGE) {
      assert.ok(MIGRATION.includes(`char_length(${cle}) <= ${max}`), cle);
      // Une ligne : la base y refuse tout caractère de contrôle.
      assert.equal(MIGRATION.includes(`${cle} !~ '[[:cntrl:]]'`), ligne, cle);
    }
  });

  it("un champ absent ou vide vaut vide : toute la fiche est facultative", () => {
    assert.deepEqual(normaliserFichePersonnage({}), { fiche: VIDE });
    assert.deepEqual(normaliserFichePersonnage({ age: "   ", arc: SAUT + SAUT }), { fiche: VIDE });
  });

  it("les espaces de bord tombent ; une ligne se replie, un texte garde ses retours", () => {
    const lu = normaliserFichePersonnage({
      age: "  la   quarantaine ",
      occupation: "Pêcheuse," + SAUT + "veuve",
      arc: " Elle part." + String.fromCharCode(13) + SAUT + "Elle revient. ",
    });
    assert.equal(lu.fiche.age, "la quarantaine");
    assert.equal(lu.fiche.occupation, "Pêcheuse, veuve");
    assert.equal(lu.fiche.arc, "Elle part." + SAUT + "Elle revient.");
  });

  it("chaque champ tient jusqu'à sa borne, et pas un caractère de plus", () => {
    for (const { cle, libelle, max } of CHAMPS_FICHE_PERSONNAGE) {
      assert.equal(normaliserFichePersonnage({ [cle]: "a".repeat(max) }).fiche[cle].length, max);
      assert.equal(
        normaliserFichePersonnage({ [cle]: "a".repeat(max + 1) }).erreur,
        `${libelle} ne peut pas dépasser ${max} caractères.`,
      );
    }
  });

  it("refuse ce qui n'est pas du texte, et les caractères de contrôle", () => {
    assert.match(normaliserFichePersonnage({ age: 40 }).erreur, /^Âge/);
    assert.match(normaliserFichePersonnage({ traits: ["calme"] }).erreur, /^Traits/);
    assert.match(
      normaliserFichePersonnage({ arc: "avant" + TABULATION + "après" }).erreur,
      /caractères non autorisés/,
    );
    assert.match(
      normaliserFichePersonnage({ goal: "but" + String.fromCharCode(0) }).erreur,
      /caractères non autorisés/,
    );
  });

  it("à la lecture, seuls les champs remplis se montrent, dans l'ordre", () => {
    assert.deepEqual(fichePersonnageRemplie(VIDE), []);
    assert.deepEqual(fichePersonnageRemplie({}), []);
    assert.deepEqual(
      fichePersonnageRemplie({ ...VIDE, traits: "Têtue.", age: "17 ans", arc: "   " }),
      [
        { cle: "age", libelle: "Âge", valeur: "17 ans" },
        { cle: "traits", libelle: "Traits", valeur: "Têtue." },
      ],
    );
  });
});

describe("Fiche détaillée : ce qu'un agent lit", () => {
  const AWA = { nom: "Awa", role: "principal", description: " Pêcheuse. " };

  it("sans fiche détaillée, un personnage s'écrit exactement comme avant", () => {
    // La forme d'avant le lot, recopiée telle quelle.
    const avant = (personnage) =>
      [
        `- ${personnage.nom} (${personnage.role.replaceAll("_", " ")})`,
        personnage.description.trim() ? `  ${personnage.description.trim()}` : null,
      ]
        .filter(Boolean)
        .join(SAUT);

    for (const personnage of [
      AWA,
      { nom: "Le chef", role: "secondaire", description: "" },
      { nom: "La mère", role: "role_inconnu", description: "   " },
    ]) {
      assert.equal(ecrirePersonnage(personnage), avant(personnage));
    }
    assert.equal(ecrirePersonnage(AWA), "- Awa (principal)" + SAUT + "  Pêcheuse.");
  });

  it("avec une fiche, les champs remplis suivent la description, dans l'ordre", () => {
    const ecrit = ecrirePersonnage({
      ...AWA,
      liens: "Sœur du chef.",
      age: " la quarantaine ",
      objectif: "Retrouver sa fille.",
      traits: "   ",
    });
    assert.deepEqual(ecrit.split(SAUT), [
      "- Awa (principal)",
      "  Pêcheuse.",
      "  Âge : la quarantaine",
      "  Objectif : Retrouver sa fille.",
      "  Liens : Sœur du chef.",
    ]);
  });

  it("le worker lit les champs que la base lui remet, et aucun autre", () => {
    const source = lire("worker/src/agents/personnage.ts");
    for (const cle of CLES_AGENT) {
      assert.ok(MIGRATION.includes(`'${cle}', nullif(btrim(`), `base : ${cle}`);
      assert.ok(source.includes(`["${cle}", "`), `worker : ${cle}`);
    }
    // Une paire par ligne de la liste : aucune clé de plus que celles de la base.
    assert.equal(source.split('  ["').length - 1, CLES_AGENT.length);
    assert.equal(MIGRATION.split("nullif(btrim(p_personnage.").length - 1, CLES_AGENT.length);
  });

  it("les quatre agents écrivent un personnage par la même fonction", () => {
    for (const agent of ["weaver", "script", "voice", "arc"]) {
      const source = lire(`worker/src/agents/${agent}.ts`);
      assert.ok(source.includes('import { ecrirePersonnage } from "./personnage.ts";'), agent);
      assert.equal(source.split("ecrirePersonnage(personnage)").length - 1, 1, agent);
      // Plus aucune écriture propre : elle divergerait de la fiche.
      assert.ok(!source.includes("personnage.description"), agent);
    }
  });
});

describe("Fiche détaillée : la migration et l'écran", () => {
  it("la migration ouvre les huit colonnes à la modification, et rien d'autre", () => {
    const accorde = MIGRATION.slice(MIGRATION.indexOf("grant update (") + "grant update (".length);
    assert.deepEqual(accorde.slice(0, accorde.indexOf(")")).split(", "), CLES);
    assert.equal(MIGRATION.split("grant ").length - 1, 1);
    assert.ok(!MIGRATION.includes("create policy"));
    assert.ok(
      MIGRATION.includes(
        "revoke all on function public.personnage_pour_agent(public.project_characters)",
      ),
    );
  });

  it("la migration ne réécrit que la ligne des personnages, dans quatre fonctions", () => {
    for (const fonction of [
      "contexte_redaction",
      "contexte_dialogue",
      "contexte_personnages",
      "contexte_episodes",
    ]) {
      assert.ok(MIGRATION.includes(`('${fonction}', '`), fonction);
    }
    // Elle s'arrête si la ligne n'est pas là une fois, plutôt que de passer outre.
    assert.ok(MIGRATION.includes("raise exception 'La ligne des personnages est introuvable"));
  });

  it("les deux écrans lisent les huit colonnes ; le formulaire les envoie toutes", () => {
    const colonnes = CLES.join(", ");
    for (const page of [
      "src/app/(app)/projets/[id]/assistant/[etape]/page.tsx",
      "src/app/(app)/projets/[id]/fiche/page.tsx",
    ]) {
      assert.ok(lire(page).includes(`description, ${colonnes}`), page);
      assert.ok(lire(page).includes("<FicheDetaillee personnage={personnage} />"), page);
    }
    const formulaire = lire("src/app/(app)/projets/[id]/assistant/personnages.tsx");
    assert.ok(formulaire.includes("CHAMPS_FICHE_PERSONNAGE.map("));
    assert.ok(formulaire.includes("name={cle}"));
    const actions = lire("src/app/(app)/projets/[id]/assistant/actions.ts");
    assert.ok(actions.includes("normaliserFichePersonnage("));
  });

  it("un documentaire dit que la fiche décrit une personne réelle, transmise à l'assistant", () => {
    assert.match(AVERTISSEMENT_PERSONNE_REELLE, /personne réelle/);
    assert.match(AVERTISSEMENT_PERSONNE_REELLE, /transmis à l'assistant/);
    const formulaire = lire("src/app/(app)/projets/[id]/assistant/personnages.tsx");
    assert.ok(formulaire.includes("{documentaire ? ("));
    assert.ok(formulaire.includes("{AVERTISSEMENT_PERSONNE_REELLE}"));
    const page = lire("src/app/(app)/projets/[id]/assistant/[etape]/page.tsx");
    assert.ok(page.includes('documentaire={projet.format === "documentaire"}'));
  });

  it("la fiche s'affiche comme du texte, et reste hors des exports", () => {
    const composant = lire("src/components/ui/fiche-personnage.tsx");
    assert.ok(!composant.includes("dangerouslySetInnerHTML"));
    assert.ok(!composant.includes('"use client"'));
    // Les exports sont un autre lot : le dossier garde sa forme.
    for (const fichier of ["worker/src/exports/dossier.ts", "worker/src/exports/pdf.ts"]) {
      assert.ok(!lire(fichier).includes("apparence"), fichier);
    }
  });
});
