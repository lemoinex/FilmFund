/**
 * Jalons de planning proposés (lot J3b-3b) : ce que l'écran compte, calcule
 * et annonce, et ce que ses actions serveur vérifient.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les actions serveur, la page et l'encart sont
 * lus comme du texte : leur parcours complet se vérifie dans le navigateur,
 * et les droits eux-mêmes par les tests de la base (lot J3b-3a).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bilanJalons,
  dureeEnJours,
  echeanceProposee,
  LIVRABLES_STRUCTURES,
  messageLotJalons,
  nombreJalons,
} from "../src/lib/propositions.ts";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const jalon = (state, position = 1) => ({
  id: `00000000-0000-0000-0000-00000000000${position}`,
  position,
  title: "Tournage",
  phase: "production",
  duration_days: 10,
  state,
});

describe("Jalons proposés : bilan et accords", () => {
  it("compte ce qui attend, ce qui est entré au planning et ce qui est écarté", () => {
    assert.deepEqual(
      bilanJalons([
        jalon("proposed", 1),
        jalon("proposed", 2),
        jalon("accepted", 3),
        jalon("dismissed", 4),
      ]),
      { enAttente: 2, acceptes: 1, ecartes: 1 },
    );
    assert.deepEqual(bilanJalons([]), { enAttente: 0, acceptes: 0, ecartes: 0 });
  });

  it("accorde les jalons et les jours", () => {
    assert.equal(nombreJalons(1), "1 jalon");
    assert.equal(nombreJalons(12), "12 jalons");
    assert.equal(dureeEnJours(1), "1 jour");
    assert.equal(dureeEnJours(30), "30 jours");
  });
});

describe("Jalons proposés : échéance proposée", () => {
  it("compte le premier jour : un jalon d'un jour finit le jour où il commence", () => {
    assert.equal(echeanceProposee("2027-02-01", 1), "2027-02-01");
    assert.equal(echeanceProposee("2027-02-01", 5), "2027-02-05");
  });

  it("passe les fins de mois et d'année, années bissextiles comprises", () => {
    assert.equal(echeanceProposee("2027-01-28", 10), "2027-02-06");
    assert.equal(echeanceProposee("2027-12-25", 10), "2028-01-03");
    assert.equal(echeanceProposee("2028-02-28", 2), "2028-02-29");
    assert.equal(echeanceProposee("2027-02-28", 2), "2027-03-01");
    assert.equal(echeanceProposee("2027-01-01", 730), "2028-12-30");
  });

  it("ne propose rien pour un début qui n'est pas une date, ni pour une durée qui n'en est pas une", () => {
    for (const debut of ["", "2027-02-30", "2027-13-01", "01/02/2027", "2027-2-1", "demain"]) {
      assert.equal(echeanceProposee(debut, 5), null, debut);
    }
    for (const duree of [0, -3, 2.5, Number.NaN]) {
      assert.equal(echeanceProposee("2027-02-01", duree), null, String(duree));
    }
  });
});

describe("Jalons proposés : « tout accepter »", () => {
  it("annonce le succès, accordé, et dit que les jalons entrent sans date", () => {
    assert.equal(messageLotJalons(1, 1), "1 jalon ajouté au planning, sans date.");
    assert.equal(messageLotJalons(12, 12), "12 jalons ajoutés au planning, sans date.");
  });

  it("dit combien sont passés quand un jalon est refusé en chemin", () => {
    assert.equal(
      messageLotJalons(3, 12),
      "3 jalons sur 12 ajoutés au planning ; les autres attendent toujours votre décision.",
    );
    assert.equal(
      messageLotJalons(1, 5),
      "1 jalon sur 5 ajouté au planning ; les autres attendent toujours votre décision.",
    );
  });

  it("ne parle pas de succès quand rien n'est passé", () => {
    assert.equal(
      messageLotJalons(0, 4),
      "Aucun jalon n'a pu être ajouté. Réessayez dans un instant.",
    );
  });
});

describe("Jalons proposés : actions serveur", () => {
  const source = sansCommentaires(lire("src/app/(app)/projets/[id]/planning/actions-ia.ts"));
  const NOMS = [
    "demanderDevisPlanning",
    "lancerPropositionPlanning",
    "annulerPropositionPlanning",
    "accepterJalonPropose",
    "ecarterJalonPropose",
    "accepterJalonsRestants",
    "ecarterJalonsRestants",
  ];
  const corps = (nom) => {
    const debut = source.indexOf(`export async function ${nom}`);
    assert.ok(debut >= 0, nom);
    const suite = source.indexOf("\nexport ", debut + 1);
    return source.slice(debut, suite === -1 ? undefined : suite);
  };

  it("chaque action valide ses identifiants et exige une session", () => {
    assert.deepEqual(
      [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]),
      NOMS,
    );
    for (const nom of NOMS) {
      assert.match(corps(nom), /UUID\.test\(projetId\)/, `${nom} valide le projet`);
      assert.match(corps(nom), /await session\(\)/, `${nom} exige une session`);
    }
  });

  it("le navigateur ne choisit ni l'action, ni le modèle, ni les paramètres du devis", () => {
    const devis = corps("demanderDevisPlanning");
    assert.match(devis, /p_action: ACTION/);
    assert.match(devis, /p_params: \{\}/);
    assert.match(source, /const ACTION = "schedule_plan";/);
    assert.doesNotMatch(source, /modele|model|profil/i);
  });

  it("un jalon corrigé ou daté passe par les lectures du planning avant la base", () => {
    const accepter = corps("accepterJalonPropose");
    for (const controle of ["TITRE_ETAPE_MAX", "estPhase", "lireDate"]) {
      assert.ok(accepter.includes(controle), controle);
    }
    // Une échéance avant le début est refusée ici, puis de nouveau par la base.
    assert.match(accepter, /debut && echeance && echeance < debut/);
    // La base décide : l'action ne fait qu'appeler sa fonction.
    assert.match(accepter, /rpc\("accepter_jalon_propose"/);
    // La validation précède l'ouverture de la session, donc tout appel à la base.
    assert.ok(accepter.indexOf("estPhase(phase)") < accepter.indexOf("await session()"));
  });

  it("« tout accepter » ne lit que les jalons en attente de la proposition, sous la RLS", () => {
    const lot = corps("accepterJalonsRestants");
    assert.match(lot, /\.from\("ai_suggestion_milestones"\)/);
    assert.match(lot, /\.eq\("suggestion_id", propositionId\)/);
    assert.match(lot, /\.eq\("project_id", projetId\)/);
    assert.match(lot, /\.eq\("state", "proposed"\)/);
    assert.match(lot, /messageLotJalons\(acceptes, jalons\.length\)/);
    // Sans date : aucune n'est inventée pour un lot.
    assert.match(lot, /rpc\("accepter_jalon_propose", \{ p_line_id: jalon\.id \}\)/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|cle_fournisseur/i);
  });
});

describe("Jalons proposés : page du planning", () => {
  const page = sansCommentaires(lire("src/app/(app)/projets/[id]/planning/page.tsx"));
  const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/planning/jalons-proposes.tsx"));

  it("la page porte l'encart et une seule boucle de rafraîchissement", () => {
    assert.match(page, /<JalonsProposes/);
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    assert.match(page, /\.eq\("action", "schedule_plan"\)/);
    // Les jalons sont lus bornés, comme la base les borne au dépôt.
    assert.match(page, /\.limit\(LIVRABLES_STRUCTURES\.schedule_plan\.lignesMax\)/);
    assert.equal(LIVRABLES_STRUCTURES.schedule_plan.lignesMax, 30);
  });

  it("un lecteur lit les jalons proposés sans suivre la demande ni en décider", () => {
    // Le droit de décider est celui d'écrire le planning, lu en base.
    assert.match(page, /const peutDecider = peutEditer === true;/);
    assert.match(page, /peutDecider=\{peutDecider\}/);
    // Qui ne décide pas ne lit pas les tâches : seulement la proposition.
    assert.match(
      page,
      /if \(peutDecider\) \{\s*const \{ data: tache \} = await supabase\s*\.from\("jobs"\)/,
    );
    assert.match(
      page,
      /const montrerAssistant = peutDecider \|\| assistant\.etape\.etape === "proposition";/,
    );
    // Dans l'encart, demander, annuler et décider sont réservés à qui décide.
    assert.match(encart, /\{peutDecider && auRepos && !demande \? \(/);
    assert.match(encart, /jalon\.id === enSaisie && peutDecider \?/);
    assert.match(encart, /\{peutDecider && bilan\.enAttente > 0 \? \(/);
  });

  it("l'encart affiche l'avertissement dès que des jalons sont montrés", () => {
    assert.match(encart, /\{LIVRABLE\.avertissement\}/);
    assert.match(encart, /"use client"/);
    assert.match(encart, /LIVRABLES_STRUCTURES\.schedule_plan/);
  });

  it("l'échéance est proposée d'après la durée, tant que l'équipe ne l'a pas changée", () => {
    assert.match(encart, /echeanceProposee\(debut, jalon\.duration_days\)/);
    assert.match(encart, /echeanceLibre\s*\?\s*actuelle\.echeance/);
    assert.match(encart, /setEcheanceLibre\(true\)/);
    // Les dates restent facultatives : aucun champ de date n'est obligatoire.
    assert.doesNotMatch(encart, /type="date"\s+required/);
  });

  it("« tout accepter » demande une confirmation, et dit que les jalons entrent sans date", () => {
    assert.match(encart, /setConfirmation\(true\)/);
    assert.match(encart, /au planning, sans date/);
    // Le lot n'est lancé que depuis la confirmation.
    assert.equal(encart.match(/accepterJalonsRestants\(/g)?.length, 1);
    assert.ok(encart.indexOf("{confirmation ? (") < encart.indexOf("accepterJalonsRestants("));
  });

  it("aucune longueur n'est écrite en dur dans l'encart", () => {
    assert.match(encart, /maxLength=\{TITRE_ETAPE_MAX\}/);
    assert.doesNotMatch(encart, /maxLength=\{\d+\}/);
  });
});
