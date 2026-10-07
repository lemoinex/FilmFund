/**
 * Écran de la suspension (lot V2b) : ce que l'administration saisit, ce que
 * l'écran annonce, ce que ses actions laissent passer, et où un compte
 * suspendu est renvoyé.
 *
 * Modules purs et lecture du code : ni base, ni serveur. Ce que la base refuse
 * réellement à un compte suspendu est éprouvé par
 * tests/suspension-comptes.test.mjs.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ANNONCE_RETABLISSEMENT,
  ANNONCE_SUSPENSION,
  CODE_COMPTE_SUSPENDU,
  lireMotif,
  MESSAGE_COMPTE_SUSPENDU,
  MOTIF_SUSPENSION,
  obstacleALaSuspension,
  obstacleAuChangementDeRole,
} from "../src/lib/comptes.ts";

const DOSSIER = "src/app/(app)/administration/utilisateurs";
const MIGRATION = "supabase/migrations/20261007180000_suspension_comptes.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** Corps d'une fonction exportée du fichier d'actions. */
function corps(source, nom) {
  const debut = source.indexOf(`export async function ${nom}(`);
  assert.ok(debut >= 0, nom);
  const suite = source.indexOf("\nexport ", debut + 1);
  return source.slice(debut, suite < 0 ? undefined : suite);
}

describe("Suspension : ce que l'écran lit et annonce", () => {
  it("le motif tient sur une ligne, dans les bornes de la base", () => {
    assert.equal(lireMotif("  Comptes   multiples\n ouverts  "), "Comptes multiples ouverts");
    assert.equal(lireMotif("a".repeat(10)), "a".repeat(10));
    assert.equal(lireMotif("a".repeat(500)), "a".repeat(500));
    for (const refuse of [
      "court",
      "a".repeat(9),
      "a".repeat(501),
      "   ",
      "",
      null,
      undefined,
      42,
    ]) {
      assert.equal(lireMotif(refuse), null, String(refuse).slice(0, 20));
    }
    assert.equal(lireMotif("Motif avec \u0007 une sonnerie"), null);

    assert.match(
      lire(MIGRATION),
      new RegExp(
        `char_length\\(reason\\) between ${MOTIF_SUSPENSION.min} and ${MOTIF_SUSPENSION.max}\\b`,
      ),
    );
  });

  it("le code et le message d'un compte suspendu sont ceux de la base, sans le motif", () => {
    // Lu dans le contrôle lui-même : la migration lève d'autres codes ailleurs.
    const controle = /create function public\.controle_avant_requete\(\)[\s\S]*?\$\$;/.exec(
      lire(MIGRATION),
    )[0];
    assert.equal(/using errcode = '([^']+)'/.exec(controle)[1], CODE_COMPTE_SUSPENDU);
    assert.match(MESSAGE_COMPTE_SUSPENDU, /suspendu/);
    assert.match(MESSAGE_COMPTE_SUSPENDU, /conservés/);
  });

  it("l'écran dit pourquoi un compte ne se suspend pas, avant que la base le refuse", () => {
    assert.equal(obstacleALaSuspension({ soiMeme: false, administrateur: false }), null);
    assert.match(obstacleALaSuspension({ soiMeme: true, administrateur: true }), /propre compte/);
    assert.match(
      obstacleALaSuspension({ soiMeme: false, administrateur: true }),
      /retirez d'abord son rôle/,
    );
  });

  it("un compte suspendu ne se voit pas proposer le rôle d'administrateur", () => {
    assert.match(
      obstacleAuChangementDeRole({ soiMeme: false, modePrive: false, suspendu: true }),
      /rétablissez-le/,
    );
    assert.equal(obstacleAuChangementDeRole({ soiMeme: false, modePrive: false }), null);
    // Le mode privé gèle tout : c'est lui qui est dit d'abord.
    assert.match(
      obstacleAuChangementDeRole({ soiMeme: false, modePrive: true, suspendu: true }),
      /mode privé/i,
    );
  });

  it("l'annonce dit ce que la suspension retire, et ce qu'elle ne retire pas", () => {
    for (const mention of [
      /ni projet, ni document, ni fichier/,
      /tâches en attente/,
      /se connecter/,
    ]) {
      assert.match(ANNONCE_SUSPENSION, mention);
    }
    assert.match(ANNONCE_SUSPENSION, /sans le motif/);
    assert.match(ANNONCE_SUSPENSION, /conservées/);
    assert.match(ANNONCE_RETABLISSEMENT, /retrouvera aussitôt/);
  });
});

describe("Suspension : ce que les actions laissent passer", () => {
  const actions = sansCommentaires(lire(`${DOSSIER}/actions.ts`));

  it("suspendre revérifie la session et le rôle, valide, puis n'écrit que le compte et le motif", () => {
    const suspendre = corps(actions, "suspendreCompte");
    const etapes = [
      "exigerAcces(supabase)",
      'rpc("is_admin")',
      "estIdentifiantDeCompte(compteId)",
      'lireMotif(formData.get("motif"))',
      'rpc("comptes_administration"',
      "obstacleALaSuspension(",
      '.from("account_suspensions")',
    ].map((etape) => suspendre.indexOf(etape));
    assert.ok(
      etapes.every((position) => position >= 0),
      etapes.join(","),
    );
    assert.deepEqual(
      etapes,
      [...etapes].sort((a, b) => a - b),
    );
    // Ni l'auteur ni la date ne partent de l'application.
    assert.match(suspendre, /\.insert\(\{ user_id: compteId, reason: motif \}\)/);
    assert.deepEqual(
      [...suspendre.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]),
      ["compte", "motif"],
    );
    assert.match(suspendre, /error\.code === "23505"/);
  });

  it("rétablir revérifie la session et le rôle, et relit la ligne retirée", () => {
    const retablir = corps(actions, "retablirCompte");
    const etapes = [
      "exigerAcces(supabase)",
      'rpc("is_admin")',
      "estIdentifiantDeCompte(compteId)",
      ".delete()",
    ].map((etape) => retablir.indexOf(etape));
    assert.ok(etapes.every((position) => position >= 0));
    assert.deepEqual(
      etapes,
      [...etapes].sort((a, b) => a - b),
    );
    // Sans cette relecture, rétablir un compte qui ne l'est pas réussirait.
    assert.match(retablir, /\.eq\("user_id", compteId\)\s*\.select\("user_id"\)/);
    assert.match(retablir, /if \(!data\?\.length\) \{/);
    assert.deepEqual(
      [...retablir.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]),
      ["compte"],
    );
  });

  it("aucune action ne passe par un accès privilégié, ni ne réécrit un motif", () => {
    assert.doesNotMatch(actions, /SECRET|service_role|auth\.admin/);
    assert.doesNotMatch(actions, /account_suspensions"\)\s*\.update\(/);
  });

  it("les deux formulaires n'envoient qu'au second clic", () => {
    const formulaire = sansCommentaires(lire(`${DOSSIER}/formulaire-suspension.tsx`));
    // Deux envois, chacun derrière sa confirmation.
    assert.equal(formulaire.match(/startTransition\(/g).length, 2);
    assert.equal(formulaire.match(/onClick=\{envoyer\}/g).length, 2);
    // Le formulaire du motif n'envoie rien : il ouvre la confirmation.
    assert.match(
      formulaire,
      /function demander\([^)]*\) \{\s*evenement\.preventDefault\(\);\s*setOuvert\(true\);/,
    );
    assert.doesNotMatch(formulaire, /<form[^>]*action=/);
    assert.match(formulaire, /\{ANNONCE_SUSPENSION\}/);
    assert.match(formulaire, /\{ANNONCE_RETABLISSEMENT\}/);
    assert.match(formulaire, /minLength=\{MOTIF_SUSPENSION\.min\}/);
    assert.match(formulaire, /maxLength=\{MOTIF_SUSPENSION\.max\}/);
  });
});

describe("Suspension : ce que les pages montrent, et à qui", () => {
  it("la fiche montre l'état, ou l'obstacle, ou le formulaire — jamais deux à la fois", () => {
    const fiche = sansCommentaires(lire(`${DOSSIER}/[compteId]/page.tsx`));
    assert.match(
      fiche,
      /\{suspension \? \([\s\S]*<FormulaireRetablissement[\s\S]*\) : obstacleSuspension \? \([\s\S]*\) : \(\s*<FormulaireSuspension/,
    );
    assert.match(fiche, /select\("reason, suspended_by, suspended_at"\)/);
    // Le rôle d'administrateur n'est pas proposé à un compte suspendu.
    assert.match(fiche, /suspendu: !!suspension && compte\.role !== "admin",/);
  });

  it("la liste ne lit des suspensions que celles des comptes de la page", () => {
    const liste = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
    assert.match(
      liste,
      /\.from\("account_suspensions"\)\s*\.select\("user_id"\)\s*\.in\(\s*"user_id",/,
    );
    assert.match(liste, /suspendus\.has\(compte\.id\)/);
  });

  it("la page du compte suspendu ne lit rien en base, et ne montre pas le motif", () => {
    const page = sansCommentaires(lire("src/app/(auth)/compte-suspendu/page.tsx"));
    assert.doesNotMatch(page, /\.from\(|\.rpc\(/);
    assert.doesNotMatch(page, /reason|motif/i);
    assert.match(page, /\{MESSAGE_COMPTE_SUSPENDU\}/);
    assert.match(page, /action="\/auth\/deconnexion"/);
    // Hors de la coque de l'application : celle-ci lit le profil, ce qui échouerait.
    assert.equal(existsSync(new URL("../src/app/(app)/compte-suspendu", import.meta.url)), false);
  });

  it("le middleware renvoie un compte suspendu avant toute page protégée", () => {
    const garde = sansCommentaires(lire("src/lib/supabase/middleware.ts"));
    const suspension = garde.indexOf('rpc("compte_suspendu")');
    assert.ok(suspension >= 0);
    // Après le mode privé, avant l'administration : aucun des deux n'est affaibli.
    assert.ok(garde.indexOf("!accesAutorise(user.email)") < suspension);
    assert.ok(suspension < garde.indexOf('rpc("is_admin")'));
    // Seul le code de la suspension renvoie : une panne passagère laisse passer.
    assert.match(garde, /if \(error\?\.code === CODE_COMPTE_SUSPENDU\) \{/);
    assert.match(garde, /new NextResponse\(MESSAGE_COMPTE_SUSPENDU, \{\s*status: 403,/);
    assert.match(garde, /url\.pathname = ROUTE_COMPTE_SUSPENDU;/);
    // La page d'explication n'est pas une route protégée : pas de boucle.
    const protegees = /const ROUTES_PROTEGEES = \[([\s\S]*?)\];/.exec(garde)[1];
    assert.doesNotMatch(protegees, /compte-suspendu/);
  });
});
