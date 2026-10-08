/**
 * Coûts de l'IA (lot Z1) : ce que l'écran de l'administration regroupe et met
 * en mots, et ce que la base laisse lire depuis l'API.
 *
 * AUCUN APPEL À UN FOURNISSEUR : l'écran additionne des registres. La page est
 * lue comme du texte ; son rendu complet se vérifie dans le navigateur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  agentDe,
  enDollars,
  enNombre,
  lireLignes,
  moisCourant,
  moisEnClair,
  nombreAppels,
  regrouper,
  reserves,
  volumeDe,
} from "../src/lib/couts-ia.ts";
import * as profils from "../worker/src/ia/profils.ts";
import {
  clientAnonyme,
  creerCompte,
  executerSqlLocal as sql,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
// L'espace des milliers et celle qui précède le symbole sont insécables.
const lisible = (texte) => texte.replace(/[  ]/g, " ");

/** Ligne telle que la base la rend : des nombres parfois écrits en texte. */
const brute = (surcharge = {}) => ({
  mois: "2026-10-01",
  fournisseur: "anthropic",
  profil: "weaver.logline@1",
  modele: "claude-opus-5-5",
  appels: 2,
  non_soldes: 0,
  a_rapprocher: 0,
  sans_cout: 0,
  replis: 0,
  jetons_entree: 1500,
  jetons_sortie: 600,
  requetes: 0,
  compte: "0.018000",
  dont_reserve: "0",
  ...surcharge,
});

describe("Coûts de l'IA : lecture et regroupement", () => {
  it("ramène les lignes de la base à des nombres, en micro-dollars entiers", () => {
    const [ligne] = lireLignes([brute({ compte: "0.198524", dont_reserve: 0.1, modele: null })]);
    assert.deepEqual(ligne, {
      mois: "2026-10-01",
      fournisseur: "anthropic",
      profil: "weaver.logline@1",
      modele: null,
      appels: 2,
      nonSoldes: 0,
      aRapprocher: 0,
      sansCout: 0,
      replis: 0,
      jetonsEntree: 1500,
      jetonsSortie: 600,
      requetes: 0,
      compte: 198_524,
      dontReserve: 100_000,
    });
  });

  it("écarte ce qui n'est pas une ligne lisible, sans rien deviner", () => {
    assert.deepEqual(lireLignes(null), []);
    assert.deepEqual(lireLignes("couts"), []);
    assert.deepEqual(
      lireLignes([
        brute({ mois: "octobre" }),
        brute({ mois: "2026-10-15" }),
        brute({ profil: 12 }),
        brute({ fournisseur: null }),
        null,
      ]),
      [],
    );
    assert.equal(lireLignes([brute({ appels: "abc" })])[0].appels, 0);
  });

  it("nomme l'agent d'après le préfixe du profil, et rien d'autre", () => {
    assert.equal(agentDe("weaver.logline@1"), "WEAVER");
    assert.equal(agentDe("arc.personnages@1"), "ARC");
    assert.equal(agentDe("board.vignette@1"), "BOARD");
    assert.equal(agentDe("essai.z1@1"), "Autre");
    assert.equal(agentDe(""), "Autre");
  });

  it("chaque profil du worker a un agent connu de l'écran", () => {
    const groupes = Object.entries(profils).filter(([nom]) => nom.startsWith("PROFILS_"));
    assert.ok(groupes.length >= 10, "lecture des profils du worker");
    const agents = new Set();
    for (const [, groupe] of groupes) {
      for (const profil of Object.values(groupe)) {
        assert.notEqual(agentDe(profil.id), "Autre", profil.id);
        agents.add(agentDe(profil.id));
      }
    }
    // Les onze agents de la V1 ont tous au moins un profil.
    assert.equal(agents.size, 11);
  });

  it("regroupe par mois puis par agent, du plus récent et du plus coûteux", () => {
    const mois = regrouper(
      lireLignes([
        brute({ compte: "0.10" }),
        brute({ profil: "weaver.pitch_oral@1", compte: "0.30", appels: 1 }),
        brute({ profil: "arc.personnages@1", compte: "0.50", appels: 4, non_soldes: 1 }),
        brute({ mois: "2026-09-01", profil: "scout.recherche@1", modele: null, compte: "0.02" }),
        brute({ mois: "2026-11-01", profil: "board.vignette@1", compte: "0.60" }),
      ]),
    );

    assert.deepEqual(
      mois.map((m) => m.mois),
      ["2026-11-01", "2026-10-01", "2026-09-01"],
    );
    const octobre = mois[1];
    assert.deepEqual(
      octobre.agents.map((a) => [a.agent, a.compte, a.appels]),
      [
        ["ARC", 500_000, 4],
        ["WEAVER", 400_000, 3],
      ],
    );
    assert.deepEqual(
      octobre.agents[1].lignes.map((l) => l.profil),
      ["weaver.pitch_oral@1", "weaver.logline@1"],
    );
    assert.equal(octobre.compte, 900_000);
    assert.equal(octobre.appels, 7);
    assert.equal(octobre.nonSoldes, 1);
  });

  it("additionne en entiers : aucun centime de trop", () => {
    const [mois] = regrouper(
      lireLignes([
        brute({ compte: "0.1" }),
        brute({ profil: "weaver.pitch_oral@1", compte: "0.2" }),
      ]),
    );
    assert.equal(mois.compte, 300_000);
    assert.equal(lisible(enDollars(mois.compte)), "0,30 $");
    // 1,005 × 1 000 000 vaut 1 004 999,9999999999 en flottant : sans arrondi
    // à la lecture, un micro-dollar manquerait à chaque ligne de ce genre.
    assert.equal(lireLignes([brute({ compte: "1.005" })])[0].compte, 1_005_000);
    assert.ok(Number.isInteger(lireLignes([brute({ dont_reserve: 1.005 })])[0].dontReserve));
  });
});

describe("Coûts de l'IA : mise en mots", () => {
  it("écrit les montants à deux décimales, sans jamais dire zéro d'un coût non nul", () => {
    assert.equal(lisible(enDollars(198_524)), "0,20 $");
    assert.equal(lisible(enDollars(4_719_414)), "4,72 $");
    assert.equal(lisible(enDollars(0)), "0,00 $");
    assert.equal(lisible(enDollars(1)), "moins de 0,01 $");
    assert.equal(lisible(enDollars(4_999)), "moins de 0,01 $");
    assert.equal(lisible(enDollars(5_000)), "0,01 $");
    assert.equal(lisible(enDollars(1_234_567_000)), "1 234,57 $");
  });

  it("dit le mois en clair, en UTC, et la clé du mois courant", () => {
    assert.equal(moisEnClair("2026-10-01"), "octobre 2026");
    assert.equal(moisEnClair("2027-01-01"), "janvier 2027");
    assert.equal(moisCourant(new Date("2026-10-08T12:00:00Z")), "2026-10-01");
    assert.equal(moisCourant(new Date("2026-10-31T23:59:59Z")), "2026-10-01");
    assert.equal(moisCourant(new Date("2026-11-01T00:00:00Z")), "2026-11-01");
  });

  it("accorde les appels, et donne le volume dans l'unité du fournisseur", () => {
    assert.equal(nombreAppels(1), "1 appel");
    assert.equal(lisible(nombreAppels(1500)), "1 500 appels");
    assert.equal(lisible(enNombre(11981)), "11 981");
    const [texte, recherche, unique] = lireLignes([
      brute({ jetons_entree: 11981, jetons_sortie: 7530 }),
      brute({ modele: null, requetes: 3 }),
      brute({ modele: null, requetes: 1 }),
    ]);
    assert.equal(lisible(volumeDe(texte)), "11 981 jetons lus, 7 530 écrits");
    assert.equal(volumeDe(recherche), "3 requêtes");
    assert.equal(volumeDe(unique), "1 requête");
  });

  it("dit ce qui empêche de lire un montant comme acquis, et se tait sinon", () => {
    const nul = { appels: 5, nonSoldes: 0, aRapprocher: 0, sansCout: 0, replis: 0 };
    assert.deepEqual(reserves({ ...nul, compte: 1, dontReserve: 0 }), []);
    assert.deepEqual(
      reserves({
        appels: 9,
        nonSoldes: 2,
        aRapprocher: 1,
        sansCout: 3,
        replis: 1,
        compte: 1,
        dontReserve: 1,
      }),
      [
        "2 appels sans issue connue, comptés à leur réserve",
        "1 appel au tarif inconnu, à rapprocher de la facture",
        "1 appel servi par un modèle de repli",
        "3 appels refusés par le fournisseur, sans coût",
      ],
    );
    assert.deepEqual(reserves({ ...nul, nonSoldes: 1, compte: 1, dontReserve: 1 }), [
      "1 appel sans issue connue, compté à sa réserve",
    ]);
  });
});

describe("Coûts de l'IA : lecture depuis l'API", () => {
  let administrateur;
  let membre;

  before(async () => {
    administrateur = await creerCompte("couts-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    membre = await creerCompte("couts-membre");
  });

  it("un administrateur lit les coûts, et la somme du mois est celle du plafond", async () => {
    const { data, error } = await administrateur.client.rpc("couts_ia_par_mois");
    assert.ifError(error);
    assert.ok(Array.isArray(data));
    if (data.length) {
      assert.deepEqual(Object.keys(data[0]).sort(), [
        "a_rapprocher",
        "appels",
        "compte",
        "dont_reserve",
        "fournisseur",
        "jetons_entree",
        "jetons_sortie",
        "modele",
        "mois",
        "non_soldes",
        "profil",
        "replis",
        "requetes",
        "sans_cout",
      ]);
    }

    // Les deux écrans de l'administration disent le même total.
    const lignes = lireLignes(data);
    assert.equal(lignes.length, data.length, "toutes les lignes de la base sont lisibles");
    const courant = regrouper(lignes).find((m) => m.mois === moisCourant(new Date()));
    const { data: plafond } = await administrateur.client.rpc("depense_ia_administration");
    assert.equal(courant?.compte ?? 0, Math.round(Number(plafond[0].depense) * 1_000_000));

    const reference = await sql("select public.depense_ia_du_mois();");
    assert.equal(
      courant?.compte ?? 0,
      Math.round(Number(reference.sortie.trim().split(/\s+/).at(-1)) * 1_000_000),
    );
  });

  it("un compte ordinaire ne lit aucun coût, un visiteur n'exécute rien", async () => {
    const { data, error } = await membre.client.rpc("couts_ia_par_mois");
    assert.ifError(error);
    assert.deepEqual(data, []);

    const visiteur = await clientAnonyme().rpc("couts_ia_par_mois");
    assert.ok(visiteur.error, "un visiteur doit être refusé");
    assert.equal(visiteur.data, null);
  });
});

describe("Coûts de l'IA : page et navigation", () => {
  const page = lire("src/app/(app)/administration/couts/page.tsx");
  const navigation = lire("src/app/(app)/navigation.tsx");

  it("la page ne lit rien avant le contrôle de l'administrateur", () => {
    const controle = page.indexOf("notFound();");
    assert.ok(controle > 0);
    for (const lecture of ['rpc("couts_ia_par_mois")', 'rpc("depense_ia_administration")']) {
      assert.ok(page.indexOf(lecture) > controle, lecture);
    }
    assert.match(page, /if \(!user\) \{\s+redirect\("\/connexion"\);/);
  });

  it("la page ne lit que deux agrégats : ni table, ni rôle de service, ni écriture", () => {
    assert.doesNotMatch(page, /\.from\(|service_role|SERVICE_ROLE|createAdminClient/);
    assert.doesNotMatch(page, /"use client"|"use server"|\.(insert|update|delete)\(/);
    assert.deepEqual(
      [...page.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      ["is_admin", "couts_ia_par_mois", "depense_ia_administration"],
    );
    assert.doesNotMatch(page, /studio_id|project_id|job_id|created_by/);
  });

  it("la page dit d'où viennent les montants, et ce qu'elle ne montre pas", () => {
    assert.match(page, /seule la facture du fournisseur fait foi\./);
    assert.match(page, /les tarifs relevés à la main dans les profils/);
    assert.match(page, /Aucun détail par studio ni par projet n&apos;est montré ici\./);
    assert.match(page, /Mois civil, compté en UTC, comme le plafond\./);
    assert.match(page, /Onze mois au plus avant celui-ci\./);
  });

  it("le mois courant se lit face au plafond, avec le chemin pour le changer", () => {
    assert.match(
      page,
      /bilanPlafond\(Number\(plafond\[0\]\.depense\), Number\(plafond\[0\]\.plafond\)\)/,
    );
    assert.match(page, /href="\/administration\/integrations"/);
    assert.match(page, /Aucun appel à un fournisseur ce mois-ci\./);
    assert.match(page, /Aucun appel enregistré avant ce mois\./);
  });

  it("les tableaux sont de vrais tableaux : légende, en-têtes, défilement horizontal", () => {
    assert.match(page, /<caption/);
    assert.equal(page.split('<th scope="col"').length - 1, 5);
    assert.match(page, /<th scope="row"/);
    assert.match(page, /className="overflow-x-auto"/);
    // Ce qui vient de la base s'affiche comme du texte.
    assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
    assert.match(page, /\{ligne\.profil\}/);
  });

  it("la rubrique figure dans la navigation de l'administration, et là seulement", () => {
    // La liste elle-même, jusqu'à son crochet fermant : rien de ce qui la suit.
    const debut = navigation.indexOf("const RUBRIQUES_ADMINISTRATION");
    const administration = navigation.slice(debut, navigation.indexOf("\n];", debut));
    assert.ok(debut > 0 && administration.length > 0);
    // Aucune rubrique n'est ajoutée ailleurs que dans les deux listes.
    assert.doesNotMatch(navigation, /RUBRIQUES(_ADMINISTRATION)?\.(push|unshift|splice)\(/);
    assert.match(
      administration,
      /libelle: "Coûts de l'IA", icone: \w+, href: "\/administration\/couts"/,
    );
    assert.equal(navigation.split("/administration/couts").length - 1, 1);
  });
});
