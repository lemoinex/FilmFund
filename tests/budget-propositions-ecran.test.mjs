/**
 * Lignes de budget proposées (lot J3b-2) : ce que l'écran propose, compte et
 * annonce, et ce que ses actions serveur vérifient.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les actions serveur et la page sont lues comme
 * du texte : leur parcours complet se vérifie dans le navigateur, et les
 * droits eux-mêmes par les tests de la base (lot J3b-1).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bilanLignes,
  estActionIa,
  estActionStructuree,
  LIVRABLES_IA,
  LIVRABLES_STRUCTURES,
  messageLot,
  nombreLignes,
} from "../src/lib/propositions.ts";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Espaces insécables ramenées à des espaces ordinaires, pour des attendus lisibles. */
const net = (texte) => texte.replace(/[  ]/g, " ");

const ligne = (state, quantity = 1, unit_cost = 100, position = 1) => ({
  id: `00000000-0000-0000-0000-00000000000${position}`,
  position,
  category: "materiel",
  label: "Caméra",
  quantity,
  unit_cost,
  state,
});

describe("Lignes proposées : catalogue", () => {
  it("ne propose que le budget et le planning, tenus à part des textes", () => {
    assert.deepEqual(Object.keys(LIVRABLES_STRUCTURES), ["budget_plan", "schedule_plan"]);
    assert.equal(LIVRABLES_STRUCTURES.budget_plan.page, "budget");
    assert.equal(LIVRABLES_STRUCTURES.schedule_plan.page, "planning");
    assert.ok(!("schedule_plan" in LIVRABLES_IA));
    assert.equal(estActionStructuree("schedule_plan"), true);
    // Le planning annonce qu'il ne propose aucune date, et que ses durées
    // sont des estimations.
    assert.match(LIVRABLES_STRUCTURES.schedule_plan.description, /aucune date/);
    assert.match(LIVRABLES_STRUCTURES.schedule_plan.description, /fournisseur d'IA/);
    assert.match(LIVRABLES_STRUCTURES.schedule_plan.avertissement, /estimées/);
    // Un livrable structuré n'est pas un texte, et inversement.
    assert.ok(!("budget_plan" in LIVRABLES_IA));
    assert.equal(estActionIa("budget_plan"), false);
    assert.equal(estActionStructuree("budget_plan"), true);
    assert.equal(estActionStructuree("logline"), false);
    // Un nom de propriété héritée n'est pas une action.
    assert.equal(estActionStructuree("toString"), false);
    assert.equal(estActionStructuree(undefined), false);
  });

  it("dit que les montants sont des estimations, et que le dossier part chez le fournisseur", () => {
    const { avertissement, description } = LIVRABLES_STRUCTURES.budget_plan;
    assert.match(avertissement, /Estimations/);
    assert.match(avertissement, /sans grille tarifaire/);
    assert.match(avertissement, /vérifiez chaque montant/);
    assert.match(description, /fournisseur d'IA/);
  });
});

describe("Lignes proposées : bilan", () => {
  it("compte ce qui attend, ce qui est entré au budget et ce qui est écarté", () => {
    assert.deepEqual(
      bilanLignes([
        ligne("proposed", 12, 85000, 1),
        ligne("proposed", 2, 0.5, 2),
        ligne("accepted", 3, 1000, 3),
        ligne("dismissed", 1, 999, 4),
      ]),
      { enAttente: 2, acceptees: 1, ecartees: 1, totalEnAttenteCentimes: 102_000_100 },
    );
  });

  it("additionne en centimes entiers, sans dérive d'arrondi", () => {
    // 0,1 + 0,2 en flottants ne font pas 0,3 ; en centimes, si.
    const bilan = bilanLignes([ligne("proposed", 1, 0.1, 1), ligne("proposed", 1, 0.2, 2)]);
    assert.equal(bilan.totalEnAttenteCentimes, 30);
  });

  it("rend un bilan nul pour une proposition sans ligne", () => {
    assert.deepEqual(bilanLignes([]), {
      enAttente: 0,
      acceptees: 0,
      ecartees: 0,
      totalEnAttenteCentimes: 0,
    });
  });

  it("accorde les lignes", () => {
    assert.equal(nombreLignes(0), "0 ligne");
    assert.equal(nombreLignes(1), "1 ligne");
    assert.equal(net(nombreLignes(1500)), "1 500 lignes");
  });
});

describe("Lignes proposées : « tout accepter »", () => {
  it("annonce le succès, accordé", () => {
    assert.equal(messageLot(1, 1), "1 ligne ajoutée au budget.");
    assert.equal(messageLot(12, 12), "12 lignes ajoutées au budget.");
  });

  it("dit combien sont passées quand une ligne est refusée en chemin", () => {
    // L'opération n'est pas atomique : ce qui est entré au budget y reste.
    assert.equal(
      messageLot(5, 12),
      "5 lignes sur 12 ajoutées au budget ; les autres attendent toujours votre décision.",
    );
    assert.equal(
      messageLot(1, 3),
      "1 ligne sur 3 ajoutée au budget ; les autres attendent toujours votre décision.",
    );
  });

  it("ne parle pas de succès quand rien n'est passé", () => {
    assert.match(messageLot(0, 4), /^Aucune ligne/);
  });
});

describe("Lignes proposées : actions serveur", () => {
  const source = sansCommentaires(lire("src/app/(app)/projets/[id]/budget/actions-ia.ts"));
  const NOMS = [
    "demanderDevisBudget",
    "lancerPropositionBudget",
    "annulerPropositionBudget",
    "accepterLigneProposee",
    "ecarterLigneProposee",
    "accepterLignesRestantes",
    "ecarterLignesRestantes",
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
    const devis = corps("demanderDevisBudget");
    assert.match(devis, /p_action: ACTION/);
    assert.match(devis, /p_params: \{\}/);
    assert.match(source, /const ACTION = "budget_plan";/);
    assert.doesNotMatch(source, /modele|model|profil/i);
  });

  it("une ligne corrigée passe par les lectures du budget avant la base", () => {
    const accepter = corps("accepterLigneProposee");
    for (const controle of ["estPosteValide", "LIBELLE_MAX", "lireQuantite", "lireMontant"]) {
      assert.ok(accepter.includes(controle), controle);
    }
    // La base décide : l'action ne fait qu'appeler sa fonction.
    assert.match(accepter, /rpc\("accepter_ligne_budget"/);
  });

  it("« tout accepter » ne lit que les lignes en attente de la proposition, sous la RLS", () => {
    const lot = corps("accepterLignesRestantes");
    assert.match(lot, /\.eq\("suggestion_id", propositionId\)/);
    assert.match(lot, /\.eq\("project_id", projetId\)/);
    assert.match(lot, /\.eq\("state", "proposed"\)/);
    assert.match(lot, /messageLot\(acceptees, lignes\.length\)/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|cle_fournisseur/i);
  });
});

describe("Lignes proposées : page du budget", () => {
  const page = sansCommentaires(lire("src/app/(app)/projets/[id]/budget/page.tsx"));
  const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/budget/lignes-proposees.tsx"));

  it("la page porte l'encart, et ne lit l'assistant que si le budget est ouvert", () => {
    assert.match(page, /<LignesProposees/);
    assert.match(page, /budget \? await lireAssistant\(supabase, projet\.id\) : null/);
    assert.match(page, /\.eq\("action", "budget_plan"\)/);
    // Les lignes sont lues bornées, comme la base les borne au dépôt.
    assert.match(page, /\.limit\(40\)/);
    assert.equal(LIVRABLES_STRUCTURES.budget_plan.lignesMax, 40);
  });

  it("la page reste fermée à qui ne gère pas le budget", () => {
    assert.match(page, /if \(!projet \|\| !autorise\) \{\s*notFound\(\);/);
    // L'assistant n'est lu qu'après ce refus.
    assert.ok(page.indexOf("notFound();") < page.indexOf("await lireAssistant("));
  });

  it("l'encart affiche l'avertissement dès que des lignes sont montrées", () => {
    assert.match(encart, /\{LIVRABLE\.avertissement\}/);
    assert.match(encart, /"use client"/);
  });

  it("« tout accepter » demande une confirmation avant d'écrire au budget", () => {
    const debut = encart.indexOf("accepterLignesRestantes(projetId");
    assert.ok(debut >= 0);
    // L'appel n'existe que dans la branche confirmée.
    const avant = encart.slice(0, debut);
    assert.ok(avant.lastIndexOf("{confirmation ? (") > avant.lastIndexOf("Tout accepter"));
    assert.match(encart, /setConfirmation\(true\)/);
  });
});
