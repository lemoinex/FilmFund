/**
 * Statistiques d'usage (lot Z3) : ce que l'écran de l'administration range et
 * nomme, et ce que la base laisse lire depuis l'API.
 *
 * AUCUN APPEL À UN FOURNISSEUR. La page est lue comme du texte ; son rendu
 * complet se vérifie dans le navigateur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { ACTIONS_EXPORT } from "../src/lib/exports.ts";
import {
  croiser,
  enNombre,
  ETATS_DEMANDE,
  ETATS_PROPOSITION,
  libelle,
  LIBELLES_ACTION,
  LIBELLES_CONTENU,
  lireComptages,
  nombreDe,
  PRINCIPE_STATISTIQUES,
  totalDe,
} from "../src/lib/statistiques.ts";
import * as profils from "../worker/src/ia/profils.ts";
import { clientAnonyme, creerCompte, creerProjet, promouvoirAdministrateur } from "./helpers.mjs";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const lisible = (texte) => texte.replace(/[  ]/g, " ");

const BRUT = [
  { domaine: "comptes", cle: "total", detail: null, nombre: 12 },
  { domaine: "projets_par_format", cle: "documentaire", detail: null, nombre: 3 },
  { domaine: "projets_par_format", cle: "serie", detail: null, nombre: 5 },
  { domaine: "projets_par_format", cle: "animation", detail: null, nombre: 3 },
  { domaine: "documents", cle: "synopsis", detail: "finalise", nombre: 2 },
  { domaine: "documents", cle: "synopsis", detail: "brouillon", nombre: "4" },
  { domaine: "documents", cle: "bible", detail: "brouillon", nombre: 1 },
];

describe("Statistiques : lecture et rangement", () => {
  it("ramène les lignes de la base à des comptages, en nombres", () => {
    const comptages = lireComptages(BRUT);
    assert.equal(comptages.length, 7);
    assert.deepEqual(comptages[5], {
      domaine: "documents",
      cle: "synopsis",
      detail: "brouillon",
      nombre: 4,
    });
  });

  it("écarte ce qui n'est pas un comptage lisible, sans rien deviner", () => {
    assert.deepEqual(lireComptages(null), []);
    assert.deepEqual(lireComptages({ domaine: "comptes" }), []);
    assert.deepEqual(
      lireComptages([
        { domaine: "comptes", cle: "total", nombre: -1 },
        { domaine: "comptes", cle: "total", nombre: 1.5 },
        { domaine: "comptes", cle: "total", nombre: "beaucoup" },
        { domaine: 3, cle: "total", nombre: 1 },
        { domaine: "comptes", cle: null, nombre: 1 },
        { domaine: "comptes", nombre: 1 },
        null,
      ]),
      [],
    );
  });

  it("donne un nombre, zéro si la base n'en dit rien, et le total d'un domaine", () => {
    const comptages = lireComptages(BRUT);
    assert.equal(nombreDe(comptages, "comptes", "total"), 12);
    assert.equal(nombreDe(comptages, "comptes", "suspendus"), 0);
    assert.equal(nombreDe(comptages, "documents", "synopsis"), 6);
    assert.equal(totalDe(comptages, "projets_par_format"), 11);
    assert.equal(totalDe(comptages, "documents"), 7);
    assert.equal(totalDe(comptages, "inconnu"), 0);
  });

  it("range un domaine du plus nombreux au moins nombreux, à égalité par ordre alphabétique", () => {
    const comptages = lireComptages(BRUT);
    assert.deepEqual(
      croiser(comptages, "projets_par_format").map((l) => [l.cle, l.total]),
      [
        ["serie", 5],
        ["animation", 3],
        ["documentaire", 3],
      ],
    );
    assert.deepEqual(croiser(comptages, "documents"), [
      { cle: "synopsis", total: 6, details: { finalise: 2, brouillon: 4 } },
      { cle: "bible", total: 1, details: { brouillon: 1 } },
    ]);
    assert.deepEqual(croiser(comptages, "inconnu"), []);
  });

  it("nomme un code connu, et laisse visible un code inconnu", () => {
    assert.equal(libelle(LIBELLES_ACTION, "character_list"), "Personnages");
    assert.equal(libelle(LIBELLES_ACTION, "action_future"), "action_future");
    // Un code qui porte le nom d'une propriété d'objet ne trompe pas la table.
    assert.equal(libelle(LIBELLES_ACTION, "constructor"), "constructor");
    assert.equal(lisible(enNombre(16247)), "16 247");
  });

  it("chaque action que le worker sait exécuter a son nom à l'écran", () => {
    const groupes = Object.entries(profils).filter(([nom]) => nom.startsWith("PROFILS_"));
    assert.ok(groupes.length >= 10, "lecture des profils du worker");
    const actions = new Set([
      ...groupes.flatMap(([, groupe]) => Object.keys(groupe)),
      ...ACTIONS_EXPORT,
    ]);
    assert.ok(actions.size >= 25, "lecture des actions");
    for (const action of actions) {
      assert.ok(Object.hasOwn(LIBELLES_ACTION, action), action);
    }
    // Et l'écran ne nomme aucune action que personne n'exécute.
    assert.deepEqual([...actions].sort(), Object.keys(LIBELLES_ACTION).sort());
  });

  it("les états nommés sont ceux de la base", () => {
    const taches = lire("supabase/migrations/20261001061231_taches.sql");
    const admis = /travail_etat_connu check \(\s*state in \(([^)]+)\)/.exec(taches)?.[1] ?? "";
    const enBase = [...admis.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.ok(enBase.length >= 5, "lecture de la migration des tâches");
    assert.deepEqual(Object.keys(ETATS_DEMANDE).sort(), [...enBase].sort());
    assert.deepEqual(Object.keys(ETATS_PROPOSITION).sort(), ["accepted", "dismissed", "proposed"]);
  });

  it("le principe dit ce qui n'est pas montré, et la limite de l'anonymat", () => {
    assert.match(PRINCIPE_STATISTIQUES, /ni nom, ni titre, ni contenu, ni montant/);
    assert.match(PRINCIPE_STATISTIQUES, /calculés à chaque lecture sur les données réelles/);
    assert.match(PRINCIPE_STATISTIQUES, /un comptage peut désigner quelqu'un/);
  });
});

describe("Statistiques : lecture depuis l'API", () => {
  let administrateur;
  let porteuse;

  before(async () => {
    administrateur = await creerCompte("stats-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    porteuse = await creerCompte("stats-porteuse");
    await creerProjet(porteuse, "TITRE CONFIDENTIEL DES STATISTIQUES");
  });

  it("un administrateur lit des comptages, et rien d'autre", async () => {
    const { data, error } = await administrateur.client.rpc("statistiques_usage");
    assert.ifError(error);
    assert.ok(data.length > 0);
    for (const ligne of data) {
      assert.deepEqual(Object.keys(ligne).sort(), ["cle", "detail", "domaine", "nombre"]);
    }
    const comptages = lireComptages(data);
    assert.equal(comptages.length, data.length, "toutes les lignes de la base sont lisibles");

    // Les domaines que l'écran affiche, et eux seuls.
    assert.deepEqual(
      [...new Set(comptages.map((c) => c.domaine))].sort(),
      [
        "comptes",
        "contenus",
        "demandes_30j",
        "documents",
        "exports",
        "opportunites",
        "projets_par_etape",
        "projets_par_format",
        "propositions",
        "studios_par_plan",
      ].filter((domaine) => comptages.some((c) => c.domaine === domaine)),
    );
    assert.ok(nombreDe(comptages, "comptes", "total") >= 2);
    assert.ok(nombreDe(comptages, "comptes", "administrateurs") >= 1);
    assert.equal(
      totalDe(comptages, "projets_par_format"),
      totalDe(comptages, "projets_par_etape"),
      "les projets comptés par format et par étape sont les mêmes",
    );
    assert.deepEqual(
      croiser(comptages, "contenus")
        .map((l) => l.cle)
        .sort(),
      Object.keys(LIBELLES_CONTENU).sort(),
    );
    // Aucun titre, aucun nom, aucune adresse.
    assert.doesNotMatch(JSON.stringify(data), /CONFIDENTIEL|exemple\.test|stats-/i);
  });

  it("une porteuse est refusée, même pour ses propres projets ; un visiteur aussi", async () => {
    const { data, error } = await porteuse.client.rpc("statistiques_usage");
    assert.equal(error?.code, "42501");
    assert.equal(data, null);

    const visiteur = await clientAnonyme().rpc("statistiques_usage");
    assert.ok(visiteur.error, "un visiteur doit être refusé");
    assert.equal(visiteur.data, null);
  });
});

describe("Statistiques : page et navigation", () => {
  const page = lire("src/app/(app)/administration/statistiques/page.tsx");
  const navigation = lire("src/app/(app)/navigation.tsx");

  it("la page ne lit rien avant le contrôle de l'administrateur", () => {
    const controle = page.indexOf("notFound();");
    assert.ok(controle > 0);
    assert.ok(page.indexOf('rpc("statistiques_usage")') > controle);
    assert.match(page, /if \(!user\) \{\s+redirect\("\/connexion"\);/);
  });

  it("la page ne fait qu'une lecture agrégée : ni table, ni rôle de service, ni écriture", () => {
    assert.doesNotMatch(page, /\.from\(|service_role|SERVICE_ROLE|createAdminClient/);
    assert.doesNotMatch(page, /"use client"|"use server"|\.(insert|update|delete)\(/);
    assert.deepEqual(
      [...page.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      ["is_admin", "statistiques_usage"],
    );
  });

  it("la page dit son principe, et n'affiche aucun taux ni pourcentage", () => {
    assert.match(page, /\{PRINCIPE_STATISTIQUES\}/);
    assert.doesNotMatch(page, /%|pourcent|taux|moyenne/i);
    assert.match(page, /est dite\s+acceptée dès qu&apos;une de ses lignes l&apos;a été/);
    assert.match(page, /Un export expire au bout de trente jours/);
    assert.match(page, /Demandes des trente derniers jours/);
  });

  it("chaque domaine de la base a sa place à l'écran", () => {
    const migration = lire("supabase/migrations/20261008050000_statistiques_usage.sql");
    const domaines = [
      ...new Set([...migration.matchAll(/select '(\w+)'(?:::text)?, /g)].map((m) => m[1])),
    ];
    assert.ok(domaines.length >= 10, "lecture de la migration");
    for (const domaine of domaines) {
      assert.ok(page.includes(`"${domaine}"`), domaine);
    }
  });

  it("les tableaux sont de vrais tableaux, et un état inconnu ne fait disparaître aucun nombre", () => {
    assert.ok(page.split("<caption").length - 1 >= 2);
    assert.match(page, /<th scope="row"/);
    assert.match(page, /<th key=\{etat\} scope="col"/);
    assert.match(page, /className="overflow-x-auto"/);
    assert.match(page, /const colonnes = \[\.\.\.connus, \.\.\.inconnus\];/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  });

  it("la rubrique figure dans la navigation de l'administration, et là seulement", () => {
    const debut = navigation.indexOf("const RUBRIQUES_ADMINISTRATION");
    const administration = navigation.slice(debut, navigation.indexOf("\n];", debut));
    assert.match(
      administration,
      /libelle: "Statistiques", icone: \w+, href: "\/administration\/statistiques"/,
    );
    assert.equal(navigation.split("/administration/statistiques").length - 1, 1);
    assert.doesNotMatch(navigation, /RUBRIQUES(_ADMINISTRATION)?\.(push|unshift|splice)\(/);
  });
});
