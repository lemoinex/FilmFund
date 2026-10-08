/**
 * Plafond mensuel des dépenses d'IA (lot Y1) : ce que l'écran de
 * l'administration lit, compte et admet, et ce que la base laisse lire et
 * écrire, vu depuis l'API.
 *
 * AUCUN APPEL À UN FOURNISSEUR : il s'agit d'un réglage et d'une somme. Les
 * actions serveur, la page et le formulaire sont lus comme du texte ; leur
 * parcours complet se vérifie dans le navigateur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import {
  bilanPlafond,
  enDollars,
  lirePlafond,
  messagePlafondChange,
  PLAFOND_USD,
  remiseAZero,
  RESTE_BAS_USD,
} from "../src/lib/plafond-ia.ts";
import {
  clientAnonyme,
  creerCompte,
  definirPlafondIa,
  executerSqlLocal as sql,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const DOSSIER = "src/app/(app)/administration/integrations";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
// L'espace des milliers et celle qui précède le symbole sont insécables.
const lisible = (texte) => texte.replace(/[  ]/g, " ");

describe("Plafond d'IA : lecture de la saisie", () => {
  it("lit un montant en dollars, à la virgule ou au point, deux décimales au plus", () => {
    assert.deepEqual(lirePlafond("10"), { plafond: 10 });
    assert.deepEqual(lirePlafond(" 12,50 "), { plafond: 12.5 });
    assert.deepEqual(lirePlafond("12.5"), { plafond: 12.5 });
    assert.deepEqual(lirePlafond("0"), { plafond: 0 });
    assert.deepEqual(lirePlafond("0,01"), { plafond: 0.01 });
    assert.deepEqual(lirePlafond(String(PLAFOND_USD.max)), { plafond: PLAFOND_USD.max });
  });

  it("refuse tout le reste, sans rien deviner", () => {
    for (const saisie of [
      "",
      "   ",
      "dix",
      "-5",
      "+5",
      "1e3",
      "12,505",
      "12,",
      ",5",
      "1 000",
      "10 $",
      "0x10",
      "10;drop",
      "Infinity",
      "NaN",
      null,
      undefined,
      10,
      { plafond: 10 },
    ]) {
      const lu = lirePlafond(saisie);
      assert.ok("erreur" in lu, JSON.stringify(saisie));
      assert.match(lu.erreur, /montant en dollars/, JSON.stringify(saisie));
    }
  });

  it("tient la borne de l'écran : cinquante dollars, pas un centime de plus", () => {
    assert.deepEqual(PLAFOND_USD, { min: 0, max: 50 });
    for (const saisie of ["50,01", "51", "100", "9999"]) {
      const lu = lirePlafond(saisie);
      assert.ok("erreur" in lu, saisie);
      assert.match(lu.erreur, /de 0 à 50 dollars depuis cet écran/, saisie);
    }
    assert.deepEqual(lirePlafond("50,00"), { plafond: 50 });
  });
});

describe("Plafond d'IA : bilan du mois", () => {
  it("compte en centimes, et arrondit la dépense au centime supérieur", () => {
    assert.deepEqual(bilanPlafond(4.719414, 5), {
      depense: 4.72,
      plafond: 5,
      reste: 0.28,
      atteint: false,
      bas: true,
    });
    // Un micro-dollar entamé compte pour un centime : l'écran ne montre pas
    // un reste que le worker n'a déjà plus.
    assert.equal(bilanPlafond(4.990001, 5).reste, 0);
    assert.equal(bilanPlafond(0.1 + 0.2, 1).depense, 0.3);
    assert.equal(bilanPlafond(0.1 + 0.2, 1).reste, 0.7);
  });

  it("dit le plafond atteint dès qu'il ne reste rien, sans reste négatif", () => {
    assert.deepEqual(bilanPlafond(5, 5), {
      depense: 5,
      plafond: 5,
      reste: 0,
      atteint: true,
      bas: false,
    });
    const depasse = bilanPlafond(7.3, 5);
    assert.equal(depasse.reste, 0);
    assert.equal(depasse.atteint, true);
    assert.equal(bilanPlafond(0, 0).atteint, true);
  });

  it("prévient quand le reste est faible, et pas avant", () => {
    assert.equal(RESTE_BAS_USD, 1);
    assert.equal(bilanPlafond(4.01, 5).bas, true);
    assert.equal(bilanPlafond(4, 5).bas, false);
    assert.equal(bilanPlafond(0, 50).bas, false);
    assert.equal(bilanPlafond(0, 0.5).bas, true);
  });

  it("écrit les montants à la française, toujours avec deux décimales", () => {
    assert.equal(lisible(enDollars(4.72)), "4,72 $");
    assert.equal(lisible(enDollars(5)), "5,00 $");
    assert.equal(lisible(enDollars(0)), "0,00 $");
  });

  it("donne le jour de la remise à zéro, en UTC, année suivante comprise", () => {
    assert.equal(remiseAZero(new Date("2026-10-08T12:00:00Z")), "1er novembre");
    assert.equal(remiseAZero(new Date("2026-12-31T23:59:59Z")), "1er janvier");
    // 31 octobre, 23h30 à Douala : déjà novembre en UTC ? Non — c'est l'UTC qui compte.
    assert.equal(remiseAZero(new Date("2026-10-31T23:30:00Z")), "1er novembre");
    assert.equal(remiseAZero(new Date("2026-11-01T00:00:00Z")), "1er décembre");
  });

  it("dit après un changement ce qu'il reste, ou que tout sera refusé", () => {
    assert.equal(
      lisible(messagePlafondChange(10, 4.719414)),
      "Plafond mensuel fixé à 10,00 $. Il reste 5,28 $ pour ce mois.",
    );
    assert.match(
      lisible(messagePlafondChange(4, 4.719414)),
      /^Plafond mensuel fixé à 4,00 \$\. Il ne dépasse pas la dépense du mois : toute nouvelle demande sera refusée/,
    );
  });
});

describe("Plafond d'IA : lecture et écriture, vues de l'API", () => {
  let administrateur;
  let membre;

  before(async () => {
    administrateur = await creerCompte("plafond-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    membre = await creerCompte("plafond-membre");
    await definirPlafondIa(5);
  });

  after(async () => {
    await definirPlafondIa(5);
  });

  it("un administrateur lit la dépense du mois et le plafond, telles que le worker les compte", async () => {
    const { data, error } = await administrateur.client.rpc("depense_ia_administration");
    assert.ifError(error);
    assert.equal(data.length, 1);
    assert.deepEqual(Object.keys(data[0]).sort(), ["depense", "plafond"]);
    assert.equal(Number(data[0].plafond), 5);

    const reference = await sql("select public.depense_ia_du_mois();");
    assert.equal(reference.code, 0, reference.erreurs);
    assert.equal(Number(data[0].depense), Number(reference.sortie.trim().split(/\s+/).at(-1)));
  });

  it("ni un compte ordinaire ni un visiteur ne lisent la dépense", async () => {
    const { data, error } = await membre.client.rpc("depense_ia_administration");
    assert.equal(error?.code, "42501");
    assert.equal(data, null);

    const visiteur = await clientAnonyme().rpc("depense_ia_administration");
    assert.ok(visiteur.error, "un visiteur doit être refusé");
    assert.equal(visiteur.data, null);

    // La fonction du worker reste fermée aux comptes, administrateurs compris.
    const directe = await administrateur.client.rpc("depense_ia_du_mois");
    assert.ok(directe.error, "depense_ia_du_mois reste fermée");
  });

  it("un compte ordinaire ne change pas le plafond : aucune ligne n'est touchée", async () => {
    const { data, error } = await membre.client
      .from("ai_settings")
      .update({ monthly_budget_usd: 49 })
      .eq("id", true)
      .select("monthly_budget_usd");
    assert.ok(error || data.length === 0, "l'écriture doit être sans effet");

    const { data: lu } = await administrateur.client.rpc("depense_ia_administration");
    assert.equal(Number(lu[0].plafond), 5);
  });

  it("un administrateur le change par la voie de l'écran, et le journal le retient", async () => {
    const { data, error } = await administrateur.client
      .from("ai_settings")
      .update({ monthly_budget_usd: 12.5 })
      .eq("id", true)
      .select("monthly_budget_usd");
    assert.ifError(error);
    assert.equal(data.length, 1);
    assert.equal(Number(data[0].monthly_budget_usd), 12.5);

    const { data: lu } = await administrateur.client.rpc("depense_ia_administration");
    assert.equal(Number(lu[0].plafond), 12.5);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("actor_id, details")
      .eq("action", "plafond_ia")
      .order("created_at", { ascending: false })
      .limit(1);
    assert.equal(journal[0].actor_id, administrateur.id);
    assert.deepEqual(journal[0].details, { ancien: 5, nouveau: 12.5 });
  });

  it("la base refuse un plafond négatif, quoi qu'envoie le navigateur", async () => {
    const { error } = await administrateur.client
      .from("ai_settings")
      .update({ monthly_budget_usd: -1 })
      .eq("id", true);
    assert.equal(error?.code, "23514");
  });
});

describe("Plafond d'IA : action serveur, page et formulaire", () => {
  const actions = sansCommentaires(lire(`${DOSSIER}/actions.ts`));
  const action = actions.slice(actions.indexOf("export async function definirPlafond("));
  const page = lire(`${DOSSIER}/page.tsx`);
  const formulaire = lire(`${DOSSIER}/formulaire-plafond.tsx`);

  it("l'action relit le montant, exige un administrateur, puis écrit sous la RLS", () => {
    const lecture = action.indexOf('lirePlafond(formData.get("plafond"))');
    const garde = action.indexOf("await exigerAdministrateur()");
    const ecriture = action.indexOf('.from("ai_settings")');
    assert.ok(lecture > 0 && garde > lecture && ecriture > garde);
    assert.match(action, /if \("erreur" in lu\) \{\s+return lu;/);
    assert.match(action, /\.update\(\{ monthly_budget_usd: lu\.plafond \}\)/);
    // Une mise à jour que la RLS écarte ne lève rien : l'action compte les lignes.
    assert.match(action, /\.select\("monthly_budget_usd"\);/);
    assert.match(action, /if \(error \|\| data\?\.length !== 1\)/);
    assert.match(action, /revalider\(\);/);
  });

  it("l'action n'emploie ni rôle de service, ni autre table, ni valeur venue d'ailleurs", () => {
    assert.doesNotMatch(actions, /service_role|SERVICE_ROLE|createAdminClient|SECRET/);
    assert.deepEqual(
      [...action.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]),
      ["ai_settings"],
    );
    assert.deepEqual(
      [...action.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      ["depense_ia_administration"],
    );
    assert.equal(action.split("formData.get(").length - 1, 1);
  });

  it("la page ne montre le plafond qu'après le contrôle de l'administrateur", () => {
    const controle = page.indexOf("notFound();");
    const lecture = page.indexOf('supabase.rpc("depense_ia_administration")');
    assert.ok(controle > 0 && lecture > controle);
    assert.match(
      page,
      /bilanPlafond\(Number\(mois\[0\]\.depense\), Number\(mois\[0\]\.plafond\)\)/,
    );
    // Sans lecture, ni zéro trompeur ni formulaire.
    assert.match(page, /La dépense du mois n&apos;a pas pu être lue\./);
    assert.equal(page.split("<FormulairePlafond").length - 1, 1);
    assert.ok(page.indexOf("<FormulairePlafond") < page.indexOf(") : (\n          <p role"));
  });

  it("la page dit ce que le plafond borne, comment le mois se compte, et prévient quand il reste peu", () => {
    assert.match(page, /Tous fournisseurs confondus\./);
    assert.match(page, /le worker réserve le coût du pire cas/);
    assert.match(page, /le crédit de chaque compte, chez son fournisseur, se\s+gère à part/);
    assert.match(page, /Mois civil, compté en UTC/);
    assert.match(page, /\{remiseAZero\(new Date\(\)\)\}/);
    assert.match(page, /Plafond atteint : toute nouvelle demande est refusée/);
    assert.match(page, /Reste faible :/);
    // La section du plafond précède les clés.
    assert.ok(page.indexOf('id="plafond-mensuel"') < page.indexOf("FOURNISSEURS.map("));
  });

  it("le formulaire est client, nomme son champ, dit sa borne et prévient d'un plafond trop bas", () => {
    assert.ok(formulaire.startsWith('"use client";'));
    assert.match(formulaire, /<label htmlFor="plafond-ia"/);
    assert.match(formulaire, /id="plafond-ia"\s+name="plafond"/);
    assert.match(formulaire, /inputMode="decimal"/);
    assert.match(formulaire, /aria-describedby="plafond-ia-aide"/);
    assert.match(formulaire, /De \{PLAFOND_USD\.min\} à \{PLAFOND_USD\.max\} dollars/);
    assert.match(formulaire, /un garde-fou de cet écran, pas une limite du fournisseur/);
    assert.match(formulaire, /bilanPlafond\(depense, lu\.plafond\)\.atteint/);
    assert.match(formulaire, /toute nouvelle\s+demande serait refusée/);
    assert.doesNotMatch(formulaire, /supabase|createClient|dangerouslySetInnerHTML/);
  });
});
