/**
 * Rôles des fournisseurs d'IA : qui fait quoi, vérifié sur le code exécuté.
 *
 * Trois fournisseurs, trois rôles. Anthropic écrit, analyse et synthétise ;
 * OpenAI dessine les vignettes du storyboard ; Perplexity collecte les
 * sources d'une recherche et ne rédige rien. Ce test tient la matrice : un
 * profil nouveau s'y inscrit, ou le test tombe.
 *
 * Il lit les profils et la passerelle ; il n'appelle aucun fournisseur. Il
 * prouve une affectation, pas qu'un fournisseur répond.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { FOURNISSEURS } from "../src/lib/integrations-ia.ts";
import * as profils from "../worker/src/ia/profils.ts";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const lire = (chemin) => readFileSync(RACINE + chemin, "utf8");
const PASSERELLE = lire("worker/src/ia/passerelle.ts");

/** Tout profil versionné exporté, où qu'il soit rangé : son identifiant finit par « @n ». */
function profilsExportes() {
  const trouves = new Map();
  const voir = (valeur) => {
    if (!valeur || typeof valeur !== "object") return;
    if (typeof valeur.id === "string" && /@[0-9]+$/.test(valeur.id)) {
      trouves.set(valeur.id, valeur);
      return;
    }
    Object.values(valeur).forEach(voir);
  };
  Object.values(profils).forEach(voir);
  return [...trouves.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const PROFILS = profilsExportes();
const parId = (id) => PROFILS.find((profil) => profil.id === id);

/** Le seul modèle de texte en service, et le seul modèle d'image. */
const MODELE_TEXTE = "claude-opus-5-5";
const MODELE_IMAGE = "gpt-image-2.5-flare";

/** La matrice des rôles : chaque profil, à sa place. */
const ECRITURE_ET_ANALYSE = [
  "arc.analyse@1",
  "arc.personnages@1",
  "field.budget@1",
  "field.planning@1",
  "frame.decoupage@1",
  "gear.materiel@1",
  "script.bible@1",
  "script.episodes@1",
  "script.scenario@1",
  "script.traitement@1",
  "voice.dialogues@1",
  "weaver.logline@1",
  "weaver.note_intention@1",
  "weaver.note_realisation@1",
  "weaver.pitch_developpe@1",
  "weaver.pitch_oral@1",
  "weaver.retouche_ameliorer@1",
  "weaver.retouche_corriger@1",
  "weaver.retouche_developper@1",
  "weaver.retouche_raccourcir@1",
  "weaver.synopsis_court@1",
  "weaver.synopsis_detaille@1",
  "weaver.synopsis_standard@1",
];
const RECHERCHE = ["griot.contexte@1", "match.veille@1", "scout.recherche@1"];
const IMAGE = ["board.vignette@1"];

describe("Rôles des fournisseurs : la matrice", () => {
  it("tout profil exporté est inscrit à la matrice, et un seul rôle chacun", () => {
    assert.deepEqual(
      PROFILS.map((profil) => profil.id),
      [...ECRITURE_ET_ANALYSE, ...RECHERCHE, ...IMAGE].sort(),
    );
  });

  it("logline, synopsis, notes, dialogues, analyse, découpage : Anthropic", () => {
    for (const id of ECRITURE_ET_ANALYSE) {
      const profil = parId(id);
      assert.equal(profil.fournisseur, "anthropic", id);
      assert.equal(profil.modele, MODELE_TEXTE, id);
      // Aucune collecte : ces profils n'appellent qu'un fournisseur.
      assert.equal(profil.collecte, undefined, id);
    }
    // Les livrables que le script de mise à jour nomme un à un.
    for (const id of [
      "weaver.logline@1",
      "weaver.synopsis_standard@1",
      "weaver.note_intention@1",
      "voice.dialogues@1",
      "arc.analyse@1",
      "frame.decoupage@1",
    ]) {
      assert.equal(parId(id)?.fournisseur, "anthropic", id);
    }
  });

  it("recherche : Perplexity collecte, Anthropic synthétise", () => {
    for (const id of RECHERCHE) {
      const profil = parId(id);
      assert.equal(profil.collecte?.fournisseur, "perplexity", id);
      assert.equal(profil.fournisseur, "anthropic", id);
      assert.equal(profil.modele, MODELE_TEXTE, id);
      // Le modèle ne lit que des sources numérotées, et n'écrit aucune adresse.
      assert.match(profil.systeme, /numérotées/, id);
      assert.match(profil.systeme, /N'écris aucune adresse web/, id);
    }
  });

  it("storyboard : OpenAI dessine, et ne fait que cela", () => {
    assert.deepEqual(
      PROFILS.filter((profil) => profil.fournisseur === "openai").map((profil) => profil.id),
      IMAGE,
    );
    assert.equal(parId("board.vignette@1").modele, MODELE_IMAGE);
  });

  it("aucun fournisseur ne sort de son rôle", () => {
    for (const profil of PROFILS) {
      // Perplexity ne rédige jamais : il n'est le fournisseur d'aucun profil.
      assert.notEqual(profil.fournisseur, "perplexity", profil.id);
      // Un modèle d'OpenAI n'écrit aucun texte ; un modèle d'Anthropic ne dessine pas.
      assert.equal(profil.modele.startsWith("gpt-"), profil.fournisseur === "openai", profil.id);
      assert.equal(
        profil.modele.startsWith("claude-"),
        profil.fournisseur === "anthropic",
        profil.id,
      );
    }
    assert.deepEqual([...new Set(PROFILS.map((profil) => profil.fournisseur))].sort(), [
      "anthropic",
      "openai",
    ]);
  });

  it("l'effort distingue l'écriture courante de l'analyse exigeante", () => {
    // Un seul modèle de texte : la configuration avancée, c'est l'effort.
    const effort = (id) => parId(id).effort;
    assert.equal(effort("weaver.retouche_corriger@1"), "low");
    for (const id of ["weaver.logline@1", "weaver.synopsis_court@1", "weaver.pitch_oral@1"]) {
      assert.equal(effort(id), "medium", id);
    }
    for (const id of ["arc.analyse@1", "script.scenario@1", "frame.decoupage@1"]) {
      assert.equal(effort(id), "high", id);
    }
    for (const id of [...ECRITURE_ET_ANALYSE, ...RECHERCHE]) {
      assert.ok(["low", "medium", "high"].includes(effort(id)), id);
    }
  });
});

describe("Rôles des fournisseurs : la passerelle", () => {
  it("deux adresses fixes hors du SDK d'Anthropic, et aucune autre", () => {
    const adresses = [...PASSERELLE.matchAll(/https:\/\/[a-zA-Z0-9./_-]+/g)].map((m) => m[0]);
    assert.deepEqual(adresses.sort(), [
      "https://api.openai.com/v1/images/generations",
      "https://api.perplexity.ai/search",
    ]);
  });

  it("OpenAI n'est appelé que pour produire une image ; Perplexity, que pour chercher", () => {
    // Ni rédaction, ni retouche d'image, ni réponse rédigée par le moteur.
    for (const interdit of [
      "/chat/completions",
      "/v1/responses",
      "/images/edits",
      "/embeddings",
      "/audio/",
      "sonar",
    ]) {
      assert.ok(!PASSERELLE.includes(interdit), interdit);
    }
  });

  it("un fournisseur par appel : aucune bascule de l'un vers l'autre", () => {
    // Le seul repli est celui qu'Anthropic applique de son côté, dans le même
    // appel, vers un autre de ses modèles.
    assert.equal(PASSERELLE.split("fallbacks").length - 1, 1);
    assert.ok(PASSERELLE.includes('fallbacks: "default"'));
    assert.ok(PASSERELLE.includes("maxRetries: 0"));
    // Les deux requêtes écrites à la main ne suivent aucune redirection.
    assert.equal(PASSERELLE.split('redirect: "error"').length - 1, 2);
    // Trois fabriques, une par fournisseur, et rien qui en choisisse une à la place d'une autre.
    const fabriques = [
      ...PASSERELLE.matchAll(/export function (creerFournisseur[A-Za-z]+)\(/g),
    ].map((m) => m[1]);
    assert.deepEqual(fabriques, [
      "creerFournisseurAnthropic",
      "creerFournisseurImagesOpenAI",
      "creerFournisseurRecherchePerplexity",
    ]);
  });

  it("le repli d'Anthropic reste chez Anthropic, et le modèle servi est gardé", () => {
    const source = lire("worker/src/ia/profils.ts");
    const tarifs = source.slice(source.indexOf("const TARIFS"), source.indexOf("export function"));
    const modeles = [...tarifs.matchAll(/^ {2}"([a-z0-9.-]+)": \{/gm)].map((m) => m[1]);
    assert.deepEqual(modeles, [MODELE_TEXTE, "claude-opus-5", "claude-opus-4-8", MODELE_IMAGE]);
    assert.ok(PASSERELLE.includes("modeleServi: reponse.model"));
    assert.ok(PASSERELLE.includes("repli:"));
  });

  it("aucun nom de modèle ni adresse de fournisseur hors des profils et de la passerelle", () => {
    const hors = [
      "worker/src/agents/weaver.ts",
      "worker/src/agents/script.ts",
      "worker/src/agents/voice.ts",
      "worker/src/agents/arc.ts",
      "worker/src/agents/field.ts",
      "worker/src/agents/frame.ts",
      "worker/src/agents/gear.ts",
      "worker/src/agents/board.ts",
      "worker/src/agents/scout.ts",
    ];
    for (const fichier of hors) {
      const source = lire(fichier);
      assert.doesNotMatch(source, /"(claude|gpt|sonar)-[a-z0-9.-]+"/, fichier);
      assert.doesNotMatch(source, /api\.(openai|anthropic|perplexity)/, fichier);
    }
  });
});

describe("Rôles des fournisseurs : ce que l'écran en dit", () => {
  const usage = (code) => FOURNISSEURS.find((fournisseur) => fournisseur.code === code).usage;

  it("trois fournisseurs, tous employés", () => {
    assert.deepEqual(
      FOURNISSEURS.map(({ code, employe }) => [code, employe]),
      [
        ["anthropic", true],
        ["openai", true],
        ["perplexity", true],
      ],
    );
  });

  it("le libellé de chacun dit son rôle d'aujourd'hui, et pas celui d'un autre", () => {
    assert.match(usage("anthropic"), /Écriture et analyse/);
    assert.match(usage("anthropic"), /synthèse des recherches/);
    // L'ancien libellé ne parlait que du pitch.
    assert.doesNotMatch(usage("anthropic"), /proposition de pitch/);
    assert.doesNotMatch(usage("anthropic"), /storyboard|vignette/i);

    assert.match(usage("openai"), /Storyboard/);
    assert.doesNotMatch(usage("openai"), /synopsis|pitch|recherche/i);

    assert.match(usage("perplexity"), /collecte des sources/);
    assert.match(usage("perplexity"), /clé d'Anthropic/);
    assert.doesNotMatch(usage("perplexity"), /rédige|vérifi/i);
  });

  it("la base n'admet que ces trois fournisseurs", () => {
    const migration = lire("supabase/migrations/20261006180000_scout_recherche.sql");
    assert.ok(
      migration.includes("check (provider in ('anthropic', 'openai', 'perplexity'))"),
      "clés des fournisseurs",
    );
    assert.ok(
      migration.includes("check (provider in ('perplexity'))"),
      "le registre des recherches ne connaît que Perplexity",
    );
  });
});
