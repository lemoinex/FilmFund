/**
 * L'Assistant IA d'un projet (lot AS1) : le catalogue de ce que l'assistant
 * sait faire, son accord avec les livrables et le barème, et ce que lisent la
 * page du projet, la rubrique du menu et le lien de la Synthèse.
 *
 * Le catalogue est un module pur ; les pages sont lues comme du texte. Aucune
 * base, aucun fournisseur.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  BESOINS_ASSISTANT,
  besoinsDuProjet,
  decompteDemandes,
  destinationAssistant,
  pageAssistant,
} from "../src/lib/assistant-ia.ts";
import {
  LIVRABLE_CONTEXTE,
  LIVRABLE_DECOUPAGE,
  LIVRABLE_DIALOGUE,
  LIVRABLE_EPISODES,
  LIVRABLE_MATERIEL,
  LIVRABLE_PERSONNAGES,
  LIVRABLE_RECHERCHE,
  LIVRABLE_VIGNETTE,
  LIVRABLES_IA,
  LIVRABLES_RETOUCHE,
  LIVRABLES_STRUCTURES,
} from "../src/lib/propositions.ts";

const PROJET = "src/app/(app)/projets/[id]";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const existe = (chemin) => existsSync(new URL(`../${chemin}`, import.meta.url));
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

const DEMANDES = BESOINS_ASSISTANT.flatMap((besoin) => besoin.demandes);
const parAction = new Map(DEMANDES.map((demande) => [demande.action, demande]));
const PROJET_ID = "00000000-0000-0000-0000-0000000000a1";

describe("Assistant IA : le catalogue couvre ce que l'assistant sait faire", () => {
  it("chaque action d'un livrable y figure une fois, et rien d'autre", () => {
    const attendues = [
      ...Object.keys(LIVRABLES_IA),
      ...Object.keys(LIVRABLES_STRUCTURES),
      ...Object.keys(LIVRABLES_RETOUCHE),
      LIVRABLE_DECOUPAGE.action,
      LIVRABLE_MATERIEL.action,
      LIVRABLE_PERSONNAGES.action,
      LIVRABLE_EPISODES.action,
      LIVRABLE_RECHERCHE.action,
      LIVRABLE_CONTEXTE.action,
      LIVRABLE_VIGNETTE.action,
      LIVRABLE_DIALOGUE.action,
    ];
    assert.deepEqual(DEMANDES.map((demande) => demande.action).sort(), [...attendues].sort());
    assert.equal(parAction.size, DEMANDES.length, "aucune action en double");
    assert.equal(DEMANDES.length, 26);
  });

  it("toute constante de livrable du catalogue des propositions est connue de ce test", () => {
    // Un livrable ajouté sous un nouveau nom ferait tomber ce test : il faut
    // alors l'inscrire ici, et dans le catalogue de l'assistant.
    const noms = [...lire("src/lib/propositions.ts").matchAll(/^export const (LIVRABLES?_\w+) =/gm)]
      .map((m) => m[1])
      .sort();
    assert.deepEqual(noms, [
      "LIVRABLES_IA",
      "LIVRABLES_RETOUCHE",
      "LIVRABLES_STRUCTURES",
      "LIVRABLE_CONTEXTE",
      "LIVRABLE_DECOUPAGE",
      "LIVRABLE_DIALOGUE",
      "LIVRABLE_EPISODES",
      "LIVRABLE_MATERIEL",
      "LIVRABLE_PERSONNAGES",
      "LIVRABLE_RECHERCHE",
      "LIVRABLE_VIGNETTE",
    ]);
  });

  it("chaque prix du barème publié est celui d'une demande, et l'image a son quota", () => {
    const type = /export type BaremePublie = \{([\s\S]*?)\n\};/.exec(lire("src/lib/offre.ts"))[1];
    const colonnes = [...type.matchAll(/^\s+(\w+): number;/gm)].map((m) => m[1]).sort();
    assert.equal(colonnes.length, 22);
    const tarifs = [...new Set(DEMANDES.map((demande) => demande.tarif))].sort();
    assert.deepEqual(tarifs, [...colonnes, "image"].sort());
    assert.deepEqual(
      DEMANDES.filter((demande) => demande.tarif === "image").map((demande) => demande.action),
      [LIVRABLE_VIGNETTE.action],
    );
    // Les quatre retouches n'ont qu'un prix ; chaque autre demande a le sien.
    assert.deepEqual(
      DEMANDES.filter((demande) => demande.tarif === "text_edit_per_passage")
        .map((demande) => demande.action)
        .sort(),
      Object.keys(LIVRABLES_RETOUCHE).sort(),
    );
    assert.equal(parAction.get("screenplay").tarif, "screenplay_per_sequence");
    assert.equal(parAction.get("dialogue").tarif, "dialogue_per_scene");
    for (const demande of DEMANDES) {
      if (colonnes.includes(demande.action)) {
        assert.equal(demande.tarif, demande.action, demande.action);
      }
    }
  });

  it("aucun agent n'est nommé : l'équipe voit un assistant, pas onze", () => {
    const AGENTS = /\b(WEAVER|SCRIPT|VOICE|SCOUT|GRIOT|ARC|FRAME|GEAR|BOARD|FIELD|MATCH)\b/;
    for (const besoin of BESOINS_ASSISTANT) {
      for (const texte of [besoin.titre, besoin.aide]) {
        assert.doesNotMatch(texte, AGENTS);
      }
      for (const { libelle, effet, lieu } of besoin.demandes) {
        for (const texte of [libelle, effet, lieu]) {
          assert.doesNotMatch(texte, AGENTS, texte);
        }
      }
    }
    for (const page of [`${PROJET}/assistant-ia/page.tsx`, "src/app/(app)/assistant-ia/page.tsx"]) {
      assert.doesNotMatch(aPlat(lire(page)), AGENTS, page);
    }
  });

  it("rien n'y est promis que la plateforme ne tient pas", () => {
    const textes = BESOINS_ASSISTANT.flatMap((besoin) => [
      besoin.titre,
      besoin.aide,
      ...besoin.demandes.flatMap(({ libelle, effet, lieu }) => [libelle, effet, lieu]),
    ]).join(" ");
    // « Vérifiée » ne se dit que pour le nier : aucune source ne l'est.
    assert.doesNotMatch(textes, /illimité|gratuit|sources? vérifiées?|validée?s?/i);
    assert.match(textes, /aucune source n'est vérifiée par la plateforme/);
    assert.doesNotMatch(textes, /abonnement|paiement|facture|remboursement/i);
    // Les réserves que chaque écran tient déjà sont redites ici.
    assert.match(parAction.get("budget_plan").effet, /sans grille tarifaire/);
    assert.match(parAction.get("schedule_plan").effet, /jamais de date/);
    assert.match(parAction.get("gear_list").effet, /sans marque ni prix/);
    assert.match(parAction.get("pitch_oral").effet, /estimation/);
    assert.match(parAction.get("text_shorten").effet, /sans garantir/);
    assert.match(parAction.get("research").effet, /seule votre question part/);
    assert.match(parAction.get("storyboard_image").effet, /encre noire/);
  });
});

describe("Assistant IA : chaque demande mène à son écran", () => {
  it("un livrable de texte mène à l'encart de sa rubrique", () => {
    const base = { projet: "", fiche: "/fiche", documents: "/documents" };
    for (const [action, livrable] of Object.entries(LIVRABLES_IA)) {
      assert.equal(parAction.get(action).chemin, `${base[livrable.page]}#assistant-${action}`);
    }
    for (const [action, livrable] of Object.entries(LIVRABLES_STRUCTURES)) {
      assert.equal(parAction.get(action).chemin, `/${livrable.page}#assistant-${livrable.page}`);
    }
    // L'ancre est celle que l'encart commun pose.
    assert.match(lire(`${PROJET}/proposition.tsx`), /<h2 id=\{`assistant-\$\{action\}`\}/);
  });

  it("les autres mènent à l'écran qui porte leur encart, ancre comprise", () => {
    const attendus = {
      character_list: [
        "/assistant/personnages#assistant-personnages",
        "assistant/personnages-proposes.tsx",
      ],
      episode_list: ["/episodes#assistant-episodes", "episodes/episodes-proposes.tsx"],
      gear_list: ["/materiel#assistant-materiel", "materiel/lignes-proposees.tsx"],
      budget_plan: ["/budget#assistant-budget", "budget/lignes-proposees.tsx"],
      schedule_plan: ["/planning#assistant-planning", "planning/jalons-proposes.tsx"],
      research: ["/recherche#demande-recherche", "recherche/recherche.tsx"],
      cultural_context: ["/recherche#demande-recherche", "recherche/recherche.tsx"],
    };
    for (const [action, [chemin, fichier]] of Object.entries(attendus)) {
      assert.equal(parAction.get(action).chemin, chemin, action);
      const ancre = chemin.split("#")[1];
      assert.match(lire(`${PROJET}/${fichier}`), new RegExp(`<h2 id="${ancre}"`), action);
    }
    for (const action of ["shot_list", "storyboard_image"]) {
      assert.equal(parAction.get(action).chemin, "/storyboard", action);
    }
    // Ce qui part d'un passage sélectionné n'a pas d'adresse fixe : la liste
    // des documents, et la consigne d'en ouvrir un.
    for (const action of ["dialogue", ...Object.keys(LIVRABLES_RETOUCHE)]) {
      assert.equal(parAction.get(action).chemin, "/documents", action);
      assert.match(parAction.get(action).lieu, /ouvrez-le, puis sélectionnez le passage/, action);
    }
  });

  it("chaque destination est une page qui existe", () => {
    for (const demande of DEMANDES) {
      const [route] = demande.chemin.split("#");
      const dossier = route === "/assistant/personnages" ? "/assistant/[etape]" : route;
      assert.ok(existe(`${PROJET}${dossier}/page.tsx`), `${demande.action} → ${route}`);
      assert.equal(
        destinationAssistant(PROJET_ID, demande),
        `/projets/${PROJET_ID}${demande.chemin}`,
      );
    }
    assert.equal(pageAssistant(PROJET_ID), `/projets/${PROJET_ID}/assistant-ia`);
  });
});

describe("Assistant IA : ce qu'un projet montre", () => {
  const actions = (besoins) => besoins.flatMap((b) => b.demandes.map((d) => d.action));

  it("une série dont on gère le budget voit tout", () => {
    const besoins = besoinsDuProjet({ serie: true, budget: true });
    assert.equal(actions(besoins).length, 26);
    assert.equal(decompteDemandes(besoins), "26 demandes");
    assert.deepEqual(
      besoins.map((besoin) => besoin.cle),
      ["presenter", "recit", "reprendre", "documenter", "tournage", "chiffrer"],
    );
  });

  it("un film ne voit pas les épisodes ; sans le budget, « Chiffrer » disparaît", () => {
    const film = besoinsDuProjet({ serie: false, budget: true });
    assert.ok(!actions(film).includes("episode_list"));
    assert.ok(actions(film).includes("budget_plan"));
    assert.equal(actions(film).length, 25);

    const lecteur = besoinsDuProjet({ serie: true, budget: false });
    assert.ok(!actions(lecteur).includes("budget_plan"));
    assert.ok(!lecteur.some((besoin) => besoin.cle === "chiffrer"));
    assert.equal(decompteDemandes(besoinsDuProjet({ serie: false, budget: false })), "24 demandes");
  });

  it("seules ces deux demandes sont réservées, et le catalogue n'est pas modifié par le tri", () => {
    assert.deepEqual(
      DEMANDES.filter((demande) => demande.reserve).map(({ action, reserve }) => [action, reserve]),
      [
        ["episode_list", "serie"],
        ["budget_plan", "budget"],
      ],
    );
    besoinsDuProjet({ serie: false, budget: false });
    assert.equal(BESOINS_ASSISTANT.flatMap((besoin) => besoin.demandes).length, 26);
    assert.equal(decompteDemandes([{ demandes: [DEMANDES[0]] }]), "1 demande");
  });
});

describe("Assistant IA : la page du projet", () => {
  const brut = lire(`${PROJET}/assistant-ia/page.tsx`);
  const page = aPlat(brut);

  it("elle répond comme une page absente pour un projet illisible", () => {
    assert.match(page, /if \(!UUID\.test\(id\)\) \{ notFound\(\); \}/);
    assert.match(page, /if \(!projet\) \{ notFound\(\); \}/);
    assert.ok(page.indexOf("if (!projet)") < page.indexOf("besoinsDuProjet({"));
    // Aucun loading.tsx : il ferait répondre 200 à une page absente.
    assert.ok(!existe(`${PROJET}/assistant-ia/loading.tsx`));
  });

  it("les droits viennent des fonctions de la base, jamais du navigateur", () => {
    assert.match(page, /supabase\.rpc\("acces_au_projet", \{ p_project_id: id \}\)/);
    assert.match(page, /supabase\.rpc\("is_admin"\)/);
    assert.match(page, /supabase\.rpc\("peut_gerer_budget", \{ p_project_id: id \}\)/);
    // La règle de peut_engager_unites, que les comptes n'appellent pas.
    assert.match(
      page,
      /const peutDemander = acces === "owner" \|\| acces === "editor" \|\| estAdmin === true;/,
    );
    assert.match(page, /const acces = lireAcces\(accesBrut\);/);
    assert.doesNotMatch(page, /rpc\("peut_engager_unites"/);
    assert.match(page, /const gereBudget = budget === true;/);
    assert.match(
      page,
      /besoinsDuProjet\(\{ serie: estSerie\(projet\.format\), budget: gereBudget \}\)/,
    );
    assert.doesNotMatch(page, /searchParams|"use client"/);
  });

  it("elle ne lance rien : ni action, ni devis, ni écriture, ni fournisseur", () => {
    assert.doesNotMatch(page, /creer_devis|accepter_devis|actions-ia|"use server"|<form|<button/);
    assert.doesNotMatch(page, /\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(page, /anthropic|openai|perplexity|API_KEY|cle_fournisseur/i);
    // Deux tables lues, et rien d'autre : le projet et le barème publié.
    assert.deepEqual(
      [...page.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]),
      ["projects", "text_unit_rate_versions"],
    );
    assert.deepEqual(
      [...page.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      ["acces_au_projet", "is_admin", "peut_gerer_budget"],
    );
  });

  it("un lecteur lit la liste sans lien, et la page lui dit pourquoi", () => {
    assert.match(page, /\{peutDemander \? \( <Link href=\{destinationAssistant\(id, demande\)\}/);
    assert.equal(page.split("destinationAssistant(").length - 1, 1);
    assert.match(page, /\{peutDemander \? null : \( <p /);
    assert.match(page, /seuls son porteur et ses éditeurs demandent/);
  });

  it("les prix viennent du barème publié, lu borné, jamais d'une valeur en dur", () => {
    const colonnes = /const COLONNES_BAREME =\s*"([^"]+)";/.exec(brut)[1];
    const vitrine = /\.select\(\s*"(version_number, logline[^"]+)",?\s*\)/.exec(
      lire("src/lib/offre.ts"),
    )[1];
    assert.equal(colonnes, vitrine);
    assert.match(page, /\.order\("version_number", \{ ascending: false \}\) \.limit\(1\)/);
    assert.match(
      page,
      /bareme \? `\$\{unitesTexte\(bareme\[tarif\]\)\}\$\{PAR\[tarif\] \?\? ""\}`/,
    );
    assert.match(page, /`\$\{unitesImage\(1\)\}, sur le quota d'images`/);
    assert.match(page, /le devis affiché avant chaque demande fait foi/);
    assert.match(page, /"Prix indisponible"/);
    assert.doesNotMatch(page, /\b\d+ unités? texte/);
  });

  it("elle redit les principes : la main à l'équipe, les calculs à la plateforme", () => {
    assert.match(page, /Cette page ne lance rien/);
    assert.match(page, /Rien n&apos;est remplacé sans votre accord/);
    assert.match(page, /L&apos;assistant n&apos;en rend aucun/);
    assert.match(page, /ce qui est transmis au fournisseur d&apos;IA/);
    assert.match(page, /<OngletsProjet projetId=\{id\} actif="projet" budget=\{gereBudget\} \/>/);
  });
});

describe("Assistant IA : la rubrique du menu et le lien de la Synthèse", () => {
  const rubrique = aPlat(lire("src/app/(app)/assistant-ia/page.tsx"));
  const navigation = lire("src/app/(app)/navigation.tsx");

  it("la rubrique mène à la page de chaque projet, sans rien lire d'autre", () => {
    assert.match(rubrique, /if \(!user\) \{ redirect\("\/connexion"\); \}/);
    assert.match(rubrique, /await chargerMesProjets\(supabase, user\.id\);/);
    assert.match(rubrique, /href=\{pageAssistant\(projet\.id\)\}/);
    assert.doesNotMatch(rubrique, /\.from\(|\.rpc\(|inclureAutres|"use client"/);
    assert.match(rubrique, /Créez d&apos;abord un projet/);
  });

  it("le menu la propose, et n'annonce plus de rubrique sans page", () => {
    assert.match(
      navigation,
      /\{ libelle: "Assistant IA", icone: SparkIcon, href: "\/assistant-ia" \},/,
    );
    const communes = navigation.slice(
      navigation.indexOf("const RUBRIQUES: Rubrique[]"),
      navigation.indexOf("const RUBRIQUES_ADMINISTRATION"),
    );
    assert.equal(communes.split("libelle:").length, communes.split("href:").length);
    assert.equal(navigation.split('"/assistant-ia"').length - 1, 1);
  });

  it("la route est protégée par la garde de session", () => {
    const garde = lire("src/lib/supabase/middleware.ts");
    assert.match(/const ROUTES_PROTEGEES = \[([^\]]*)\]/.exec(garde)[1], /"\/assistant-ia"/);
  });

  it("la Synthèse y mène, pour toute l'équipe", () => {
    const synthese = aPlat(lire(`${PROJET}/page.tsx`));
    assert.match(synthese, /href=\{pageAssistant\(projet\.id\)\}/);
    const lien = synthese.indexOf("pageAssistant(projet.id)");
    // Hors de toute condition de droit : un lecteur le voit aussi.
    assert.ok(lien > synthese.indexOf("<MaturiteDuDossier"));
    assert.ok(lien < synthese.indexOf("{peutEditer ? ( <FormulaireEdition"));
  });
});
