/**
 * Écran de la veille des opportunités (lot L6b) : ce que l'administration
 * saisit, ce que l'écran annonce, et ce que ses actions laissent passer.
 *
 * Modules purs et lecture du code : ni base, ni serveur, ni fournisseur. Le
 * parcours réel d'une veille, de la demande au catalogue, est éprouvé par
 * tests/worker-match.test.mjs.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CATEGORIES_OPPORTUNITE,
  cleOpportunite,
  ERREURS_VEILLE,
  etapeVeille,
  lireCorrection,
  lireQuestionVeille,
  LIVRABLE_VEILLE,
  LONGUEURS_OPPORTUNITE,
  messageVeille,
} from "../src/lib/opportunites.ts";
import { PROFIL_VEILLE, PROFILS_MATCH } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/administration/opportunites";
const MIGRATION = "supabase/migrations/20261007120000_match_veille.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("Veille : ce que l'écran lit et annonce", () => {
  it("la recherche tient sur une ligne, dans les bornes de la base", () => {
    assert.equal(
      lireQuestionVeille("  Fonds pour le\n documentaire   en Afrique centrale "),
      "Fonds pour le documentaire en Afrique centrale",
    );
    assert.equal(lireQuestionVeille("a".repeat(10)), "a".repeat(10));
    assert.equal(lireQuestionVeille("a".repeat(500)), "a".repeat(500));
    for (const refusee of ["Fonds ?", "a".repeat(501), "   ", "", null, undefined, 42, ["Fonds"]]) {
      assert.equal(lireQuestionVeille(refusee), null, String(refusee).slice(0, 20));
    }
    assert.equal(lireQuestionVeille("Fonds\u0007 pour le documentaire"), null);

    // Les bornes de l'écran sont celles de la base.
    const demande = lire(MIGRATION);
    assert.match(
      demande,
      new RegExp(
        `char_length\\(v_question\\) not between ${LIVRABLE_VEILLE.questionMin} and ${LIVRABLE_VEILLE.questionMax}`,
      ),
    );
  });

  it("l'écran et l'agent parlent de la même action, avec les mêmes bornes", () => {
    assert.deepEqual(Object.keys(PROFILS_MATCH), [LIVRABLE_VEILLE.action]);
    assert.equal(LIVRABLE_VEILLE.opportunitesMax, PROFIL_VEILLE.opportunitesMax);
  });

  it("dit ce qui part, ce que cela coûte, et que rien n'est vérifié", () => {
    assert.match(LIVRABLE_VEILLE.transmission, /Votre recherche, et elle seule, est transmise/);
    assert.match(LIVRABLE_VEILLE.transmission, /appel payant, compté dans la dépense d'IA du mois/);
    assert.match(LIVRABLE_VEILLE.transmission, /n'entame le quota d'aucun studio/);
    assert.match(LIVRABLE_VEILLE.avertissement, /Rien de ce qui suit n'est vérifié/);
    assert.match(
      LIVRABLE_VEILLE.avertissement,
      /qu'un extrait de chaque page, pas la page entière/,
    );
    assert.match(LIVRABLE_VEILLE.avertissement, /Ouvrez la page avant d'accepter/);
    assert.match(LIVRABLE_VEILLE.avertissement, /entre au catalogue « non vérifiée »/);
    assert.match(LIVRABLE_VEILLE.limites, /ni montant, ni date limite, ni pays, ni critère/);
    // Aucune promesse : ni garantie, ni exhaustivité, ni prix inventé.
    for (const texte of Object.values(LIVRABLE_VEILLE).filter((v) => typeof v === "string")) {
      assert.doesNotMatch(texte, /garanti|certifi|officiel|exhausti|toutes les opportunités|\$|€/i);
    }
  });

  it("à l'acceptation, le nom, l'organisme et la catégorie sont relus ; l'organisme ne se devine pas", () => {
    assert.deepEqual(lireCorrection("  Fonds   fictif ", " Organisme\tfictif ", "fonds"), {
      name: "Fonds fictif",
      organization: "Organisme fictif",
      category: "fonds",
    });
    for (const [raison, nom, organisme, categorie, message] of [
      ["sans nom", "  ", "Organisme", "fonds", /nom de l'opportunité/],
      ["nom trop long", "a".repeat(201), "Organisme", "fonds", /nom de l'opportunité/],
      ["sans organisme", "Fonds", "", "fonds", /Indiquez l'organisme.*ne se déduit pas du site/],
      ["organisme trop long", "Fonds", "a".repeat(201), "fonds", /Indiquez l'organisme/],
      ["catégorie inconnue", "Fonds", "Organisme", "loterie", /catégorie/],
      ["catégorie héritée", "Fonds", "Organisme", "toString", /catégorie/],
      ["catégorie absente", "Fonds", "Organisme", undefined, /catégorie/],
      ["nom qui n'est pas un texte", 12, "Organisme", "fonds", /nom de l'opportunité/],
    ]) {
      const lecture = lireCorrection(nom, organisme, categorie);
      assert.ok("erreur" in lecture, raison);
      assert.match(lecture.erreur, message, raison);
    }
    assert.equal(LONGUEURS_OPPORTUNITE.name, 200);
    for (const code of Object.keys(CATEGORIES_OPPORTUNITE)) {
      assert.ok(!("erreur" in lireCorrection("Fonds", "Organisme", code)), code);
    }
  });

  it("chaque refus de la base a son message, sans code ni détail technique", () => {
    const messages = Object.values(ERREURS_VEILLE).map((code) => messageVeille(code));
    assert.equal(new Set(messages).size, messages.length, "un message par refus");
    const generique = messageVeille("XX000");
    assert.equal(messageVeille(undefined), generique);
    for (const message of [...messages, generique]) {
      assert.doesNotMatch(message, /\b[0-9A-Z]{5}\b|undefined|null|SQL|jobs|rpc/);
    }
    assert.ok(!messages.includes(generique));
    assert.match(messageVeille(ERREURS_VEILLE.doublon), /déjà au catalogue/);
    assert.match(messageVeille(ERREURS_VEILLE.clesAbsentes), /Intégrations IA/);
    assert.match(messageVeille(ERREURS_VEILLE.dejaEnCours), /déjà en cours/);
    // Les codes de l'écran sont ceux que la base lève.
    const migration = lire(MIGRATION);
    for (const code of ["VE001", "VE002", "55000", "23505", "PR001", "42501", "22023"]) {
      assert.match(migration, new RegExp(`errcode = '${code}'`), code);
      assert.ok(Object.values(ERREURS_VEILLE).includes(code), code);
    }
  });

  it("l'étape affichée suit la dernière veille, sans attente sans fin", () => {
    const tache = (state, reason = null) => ({ id: "t", state, reason });
    assert.deepEqual(etapeVeille(null, null), { etape: "repos" });
    assert.deepEqual(etapeVeille(tache("queued"), null), { etape: "en_attente", tacheId: "t" });
    assert.deepEqual(etapeVeille(tache("running"), null), { etape: "en_cours" });
    assert.deepEqual(etapeVeille(tache("awaiting_reconciliation"), null), {
      etape: "a_rapprocher",
    });
    assert.deepEqual(etapeVeille(tache("failed", "Plafond atteint."), null), {
      etape: "echec",
      motif: "Plafond atteint.",
    });
    // Réussie sans rien relever : la phrase de la base est montrée.
    assert.deepEqual(
      etapeVeille(tache("succeeded"), { content: "Veille : rien.", state: "dismissed", lignes: 0 }),
      { etape: "sans_resultat", texte: "Veille : rien." },
    );
    // Réussie avec des opportunités, décidées ou non : elles se lisent plus bas.
    for (const state of ["proposed", "accepted", "dismissed"]) {
      assert.deepEqual(etapeVeille(tache("succeeded"), { content: "Veille.", state, lignes: 2 }), {
        etape: "repos",
      });
    }
    assert.deepEqual(etapeVeille(tache("succeeded"), null), { etape: "repos" });
    assert.deepEqual(etapeVeille(tache("cancelled"), null), { etape: "repos" });
    assert.deepEqual(etapeVeille(tache("etat_inconnu"), null), { etape: "repos" });
  });

  it("reconnaît une opportunité déjà au catalogue comme la base : casse et espaces autour mis à part", () => {
    assert.equal(
      cleOpportunite("  FONDS Fictif ", "organisme FICTIF"),
      cleOpportunite("Fonds fictif", " Organisme fictif "),
    );
    assert.notEqual(cleOpportunite("Fonds fictif", "A"), cleOpportunite("Fonds fictif", "B"));
    // Le nom et l'organisme ne se confondent pas en se collant.
    assert.notEqual(cleOpportunite("ab", "c"), cleOpportunite("a", "bc"));
  });
});

describe("Veille : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-veille.ts`));
  const ACTIONS = [
    "preparerVeille",
    "lancerVeille",
    "annulerVeille",
    "accepterOpportunite",
    "ecarterOpportunite",
  ];

  it("chaque action vérifie la session puis le rôle avant d'appeler la base", () => {
    assert.match(source, /^"use server";/);
    const exports = [...source.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual(exports, ACTIONS);
    for (const nomAction of ACTIONS) {
      const debut = source.indexOf(`export async function ${nomAction}(`);
      const corps = source.slice(debut, source.indexOf("\n}\n", debut));
      const garde = corps.indexOf("await administration()");
      assert.ok(garde >= 0, `${nomAction} : passe par la garde commune`);
      const appel = corps.indexOf(".rpc(");
      assert.ok(appel < 0 || appel > garde, `${nomAction} : la garde précède la base`);
    }
    assert.match(
      source,
      /const garde = await exigerAcces\(supabase\);\s+if \("erreur" in garde\) \{\s+return garde;\s+\}\s+const \{ data: estAdministrateur \} = await supabase\.rpc\("is_admin"\);\s+if \(!estAdministrateur\) \{/,
    );
  });

  it("le navigateur ne choisit ni fournisseur, ni modèle, ni provenance, ni statut", () => {
    // Les seules fonctions de la base appelées, et leurs seuls paramètres.
    assert.deepEqual([...source.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]).sort(), [
      "accepter_opportunite_proposee",
      "annuler_travail",
      "demander_veille",
      "ecarter_opportunite_proposee",
      "is_admin",
    ]);
    assert.match(source, /rpc\("demander_veille", \{ p_question: question \}\)/);
    assert.match(
      source,
      /rpc\("accepter_opportunite_proposee", \{\s+p_line_id: ligneId,\s+p_name: correction\.name,\s+p_organization: correction\.organization,\s+p_category: correction\.category,\s+\}\)/,
    );
    // La question et la correction sont relues ici avant de partir.
    assert.match(source, /const question = lireQuestionVeille\(saisie\);/);
    assert.match(
      source,
      /const correction = lireCorrection\(saisie\?\.nom, saisie\?\.organisme, saisie\?\.categorie\);/,
    );
    for (const identifiant of ["tacheId", "ligneId"]) {
      assert.match(
        source,
        new RegExp(`if \\(!UUID\\.test\\(${identifiant}\\)\\) \\{`),
        identifiant,
      );
    }
    // Aucune écriture directe, aucun appel sortant, aucun secret.
    assert.doesNotMatch(source, /\.from\(|\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(source, /fetch\(|process\.env|service_role|perplexity|anthropic/i);
    assert.doesNotMatch(source, /verifie|source_url|collected|status|model|provider/);
    assert.match(source, /revalidatePath\("\/administration\/journal"\)/);
    // Le message d'une erreur vient du catalogue, pas du texte de la base.
    assert.doesNotMatch(source, /error\.message/);
  });
});

describe("Veille : page et composants", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const veille = sansCommentaires(lire(`${DOSSIER}/veille.tsx`));

  it("la veille ne se lit qu'après le contrôle du rôle, et sa lecture est bornée", () => {
    assert.ok(page.indexOf("notFound();") < page.indexOf('.from("jobs")'));
    assert.ok(page.indexOf("notFound();") < page.indexOf('.from("ai_suggestion_opportunities")'));
    assert.match(page, /\.eq\("action", LIVRABLE_VEILLE\.action\)/);
    assert.match(
      page,
      /\.eq\("state", "proposed"\)\s+\.order\("created_at", \{ ascending: false \}\)\s+\.order\("position"\)\s+\.limit\(LIMITE_PROPOSEES\)/,
    );
    assert.match(page, /const LIMITE_PROPOSEES = 2 \* LIVRABLE_VEILLE\.opportunitesMax;/);
    assert.match(
      page,
      /<RafraichissementPropositions\s+actif=\{etape\.etape === "en_attente" \|\| etape\.etape === "en_cours"\}/,
    );
  });

  it("chaque opportunité proposée est montrée comme non vérifiée, avec sa page et son extrait", () => {
    assert.match(page, /\{LIVRABLE_VEILLE\.avertissement\}/);
    assert.match(page, /Proposée par la veille — non vérifiée/);
    assert.match(page, /Résumé de l&apos;extrait/);
    assert.match(page, /Lire l&apos;extrait collecté/);
    assert.match(page, /collectée le \$\{enJour\(proposee\.collected_at\)\}/);
    assert.match(page, /", page sans date"/);
    // La page s'ouvre à part, sans transmettre celle d'origine.
    assert.ok(
      (page.match(/target="_blank"\s+rel="noopener noreferrer nofollow"/g) ?? []).length >= 2,
    );
    // Ce qui vient du web est affiché comme du texte.
    for (const fichier of [page, veille]) {
      assert.doesNotMatch(fichier, /dangerouslySetInnerHTML/);
      assert.doesNotMatch(fichier, /garanti|certifi|officiel/i);
    }
    // Le doublon est signalé d'après le catalogue lu, comme la base le reconnaît.
    assert.match(
      page,
      /dejaAuCatalogue=\{auCatalogue\.has\(\s+cleOpportunite\(proposee\.name, proposee\.organization\),\s+\)\}/,
    );
  });

  it("la demande remontre la recherche avant de l'envoyer, et dit ce qui part", () => {
    assert.match(lire(`${DOSSIER}/veille.tsx`), /^"use client";/);
    assert.ok((veille.match(/\{LIVRABLE_VEILLE\.transmission\}/g) ?? []).length >= 2);
    assert.match(veille, /\{LIVRABLE_VEILLE\.limites\}/);
    assert.match(veille, /La recherche qui sera transmise/);
    // Rien ne part au premier bouton : il relit ; le second envoie ce qui a été relu.
    assert.match(veille, /const resultat = await preparerVeille\(saisie\);/);
    assert.match(veille, /\(\) => lancerVeille\(question\),/);
    assert.equal(veille.match(/lancerVeille\(/g)?.length, 1);
    assert.match(veille, /maxLength=\{LIVRABLE_VEILLE\.questionMax\}/);
    assert.match(veille, /Annuler la demande/);
    // Chaque champ a son étiquette, et chaque état son annonce.
    for (const champ of ["nom", "organisme", "categorie"]) {
      assert.match(veille, new RegExp(`htmlFor=\\{\`\\$\\{p\\}-${champ}\`\\}`), champ);
    }
    assert.ok((veille.match(/role="status"/g) ?? []).length >= 5);
  });

  it("accepter dit ce que cela engage, et l'organisme manquant se saisit", () => {
    assert.match(veille, /"Accepter, non vérifiée"/);
    assert.match(veille, /executer\(\(\) => accepterOpportunite\(ligneId, saisie\)\)/);
    assert.match(veille, /executer\(\(\) => ecarterOpportunite\(ligneId\)\)/);
    assert.match(veille, /ne le déduisez\s+pas du site/);
    assert.match(veille, /elle ne peut pas y entrer\s+une seconde fois/);
    assert.match(veille, /maxLength=\{LONGUEURS_OPPORTUNITE\.organization\}/);
    assert.doesNotMatch(veille, /maxLength=\{\d{2,}\}/);
    // Le composant ne connaît ni la page, ni l'extrait, ni le statut : il ne peut pas les envoyer.
    const decision = veille.slice(veille.indexOf("export function DecisionOpportunite"));
    assert.doesNotMatch(decision, /source_url|source_excerpt|collected|statut|status:|verifie"/);
  });
});
