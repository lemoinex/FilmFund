/**
 * Plans proposés par FRAME (lot J3c-2b) : ce que l'écran compte et annonce,
 * et ce que ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page et
 * l'encart sont lus comme du texte : leur parcours complet se vérifie dans le
 * navigateur, et les droits eux-mêmes par les tests de la base et du worker
 * (lot J3c-2a).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bilanPlans,
  estActionIa,
  estActionStructuree,
  LIVRABLE_DECOUPAGE,
  messageLotPlans,
  nombrePlans,
} from "../src/lib/propositions.ts";
import { PROFIL_DECOUPAGE, PROFILS_FRAME } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/storyboard";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const plan = (state, position = 1) => ({
  id: `00000000-0000-0000-0000-00000000000${position}`,
  position,
  shot: "plan_large",
  focal_mm: 24,
  angle: "normal",
  movement: "fixe",
  description: "La berge.",
  duration_seconds: 8,
  state,
});

describe("Plans proposés : catalogue, bilan et accords", () => {
  it("l'écran propose exactement ce que FRAME sait produire, à la même borne", () => {
    assert.deepEqual(Object.keys(PROFILS_FRAME), [LIVRABLE_DECOUPAGE.action]);
    assert.equal(LIVRABLE_DECOUPAGE.lignesMax, PROFIL_DECOUPAGE.lignesMax);
    // Tenu à part des textes et des livrables de FIELD : il vise une scène.
    assert.equal(estActionIa(LIVRABLE_DECOUPAGE.action), false);
    assert.equal(estActionStructuree(LIVRABLE_DECOUPAGE.action), false);
  });

  it("dit d'où part l'assistant, à qui le dossier est transmis, et ce que valent ses chiffres", () => {
    assert.match(LIVRABLE_DECOUPAGE.description, /scénario enregistré/);
    assert.match(LIVRABLE_DECOUPAGE.description, /concept du projet/);
    assert.match(LIVRABLE_DECOUPAGE.description, /fournisseur d'IA/);
    assert.match(LIVRABLE_DECOUPAGE.sansScenario, /pas de scénario enregistré/);
    assert.match(LIVRABLE_DECOUPAGE.avertissement, /ordres de grandeur/);
  });

  it("compte ce qui attend, ce qui est entré dans le découpage et ce qui est écarté", () => {
    assert.deepEqual(
      bilanPlans([
        plan("proposed", 1),
        plan("proposed", 2),
        plan("accepted", 3),
        plan("dismissed", 4),
      ]),
      { enAttente: 2, acceptes: 1, ecartes: 1 },
    );
    assert.deepEqual(bilanPlans([]), { enAttente: 0, acceptes: 0, ecartes: 0 });
  });

  it("accorde les plans", () => {
    assert.equal(nombrePlans(1), "1 plan");
    assert.equal(nombrePlans(12), "12 plans");
  });
});

describe("Plans proposés : « tout accepter »", () => {
  it("annonce le succès, accordé", () => {
    assert.equal(messageLotPlans(1, 1), "1 plan ajouté au découpage.");
    assert.equal(messageLotPlans(6, 6), "6 plans ajoutés au découpage.");
  });

  it("dit combien sont passés quand un plan est refusé en chemin", () => {
    assert.equal(
      messageLotPlans(1, 6),
      "1 plan sur 6 ajouté au découpage ; les autres attendent toujours votre décision.",
    );
    assert.equal(
      messageLotPlans(4, 6),
      "4 plans sur 6 ajoutés au découpage ; les autres attendent toujours votre décision.",
    );
  });

  it("ne parle pas de succès quand rien n'est passé", () => {
    assert.match(messageLotPlans(0, 6), /^Aucun plan n'a pu être ajouté/);
  });
});

describe("Plans proposés : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-ia.ts`));
  const fonctions = source.split("\nexport async function ").slice(1);
  const corps = (nom) => {
    const fonction = fonctions.find((f) => f.startsWith(`${nom}(`));
    assert.ok(fonction, `${nom} introuvable`);
    return fonction;
  };

  it("les sept actions attendues, et rien d'autre", () => {
    assert.deepEqual(
      fonctions.map((f) => f.slice(0, f.indexOf("("))),
      [
        "demanderDevisDecoupage",
        "lancerPropositionDecoupage",
        "annulerPropositionDecoupage",
        "accepterPlanPropose",
        "ecarterPlanPropose",
        "accepterPlansRestants",
        "ecarterPlansRestants",
      ],
    );
  });

  it("chaque action valide ses identifiants et exige une session avant d'appeler la base", () => {
    for (const fonction of fonctions) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const controle = fonction.indexOf("UUID.test(");
      // Chaque identifiant reçu du navigateur est contrôlé, pas seulement le premier.
      const signature = fonction.slice(0, fonction.indexOf("): Promise<"));
      const identifiants = [...signature.matchAll(/(\w+): string/g)].map((m) => m[1]);
      assert.ok(identifiants.length >= 2, `${nom} : lecture de la signature`);
      for (const identifiant of identifiants) {
        assert.ok(fonction.includes(`UUID.test(${identifiant})`), `${nom} : ${identifiant}`);
      }
      const garde = fonction.indexOf("await session()");
      const appel = fonction.search(/\.rpc\(/);
      assert.ok(controle > 0, `${nom} : identifiants non contrôlés`);
      assert.ok(garde > controle, `${nom} : la session suit le contrôle`);
      assert.ok(appel > garde, `${nom} : la base n'est appelée qu'après la garde`);
    }
    assert.match(source, /const garde = await exigerAcces\(supabase\);/);
  });

  it("le navigateur désigne une scène ; il ne choisit ni l'action, ni le modèle, ni le reste du devis", () => {
    const devis = corps("demanderDevisDecoupage");
    assert.match(devis, /p_action: ACTION,\s+p_params: \{ scene: sceneId \},/);
    assert.match(source, /const ACTION = LIVRABLE_DECOUPAGE\.action;/);
    assert.doesNotMatch(source, /modele|profil|jetons|claude-/i);
    // La clé d'idempotence est celle du navigateur, contrôlée comme un identifiant.
    assert.match(corps("lancerPropositionDecoupage"), /!UUID\.test\(cle\)/);
  });

  it("un plan corrigé passe par les lectures d'un plan saisi avant la base", () => {
    const acceptation = corps("accepterPlanPropose");
    for (const controle of [
      "estCadrage(cadrage)",
      "estAngle(angle)",
      "estMouvement(mouvement)",
      'lireEntier(String(saisie.focale ?? ""), FOCALE_MM)',
      'lireEntier(String(saisie.duree ?? ""), DUREE_PLAN_SECONDES)',
      "description.length > DESCRIPTION_PLAN_MAX",
    ]) {
      assert.ok(acceptation.includes(controle), controle);
    }
    // Sans correction, aucun champ n'est envoyé : la base retient la proposition.
    assert.match(acceptation, /\.\.\.\(corrige \? \{ p_corrige: corrige \} : \{\}\),/);
    // Une description proposée tient sur une ligne : corrigée, elle le reste.
    assert.match(acceptation, /\.replace\(\/\\s\+\/g, " "\)/);
  });

  it("une scène pleine refuse un plan de plus, à l'unité comme en lot", () => {
    assert.match(
      corps("accepterPlanPropose"),
      /if \(libres !== null && libres < 1\) \{\s+return SCENE_PLEINE;/,
    );
    assert.match(
      corps("accepterPlansRestants"),
      /if \(libres !== null && libres < plans\.length\) \{\s+return SCENE_PLEINE;/,
    );
    assert.match(source, /PLANS_PAR_SCENE_MAX - \(count \?\? 0\)/);
  });

  it("« tout accepter » ne lit que les plans en attente de la proposition, sous la RLS, et borne sa lecture", () => {
    const lot = corps("accepterPlansRestants");
    assert.match(
      lot,
      /\.eq\("project_id", projetId\)\s+\.eq\("suggestion_id", propositionId\)\s+\.eq\("state", "proposed"\)/,
    );
    assert.match(lot, /\.limit\(LIVRABLE_DECOUPAGE\.lignesMax\)/);
    assert.match(lot, /messageLotPlans\(acceptes, plans\.length\)/);
    assert.match(corps("ecarterPlansRestants"), /rpc\("ecarter_proposition"/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé, ni n'écrit sans passer par une fonction", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|SECRET|service_role/i);
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
  });
});

describe("Plans proposés : page du storyboard", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const encart = lire(`${DOSSIER}/plans-proposes.tsx`);
  const volet = sansCommentaires(lire(`${DOSSIER}/plans.tsx`));

  it("la page porte une seule boucle de rafraîchissement, active tant qu'un découpage se prépare", () => {
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    assert.match(page, /<RafraichissementPropositions actif=\{enPreparation\} \/>/);
    assert.match(page, /etape\.etape === "en_attente" \|\| etape\.etape === "en_cours"/);
  });

  it("les lectures de l'assistant sont bornées, et filtrées par projet et par action", () => {
    assert.match(
      page,
      /\.eq\("action", LIVRABLE_DECOUPAGE\.action\)\s+\.order\("created_at", \{ ascending: false \}\)\s+\.limit\(TACHES_LUES\)/,
    );
    assert.match(page, /\.limit\(scenes\.size \* LIVRABLE_DECOUPAGE\.lignesMax\)/);
    assert.equal(page.match(/\.eq\("project_id", projetId\)/g)?.length, 3);
  });

  it("un lecteur lit les plans proposés sans suivre la demande ni en décider", () => {
    // La tâche n'est lue que pour qui écrit le storyboard.
    assert.match(
      page,
      /if \(peutDecider\) \{\s+const \{ data: taches \} = await supabase\s+\.from\("jobs"\)/,
    );
    assert.match(page, /\.eq\("state", "proposed"\)/);
    assert.match(
      page,
      /const montrerAssistant = peutEditer \|\| assistant\.etape\.etape === "proposition";/,
    );
    assert.match(page, /peutDecider=\{peutEditer\}/);
    assert.match(
      encart,
      /Seuls le porteur et les éditeurs du projet décident des plans proposés\./,
    );
    // Demander, annuler, décider : chaque bouton dépend de peutDecider.
    assert.match(encart, /\{peutDecider && auRepos && !demande \? \(/);
    assert.match(encart, /\{peutDecider && bilan\.enAttente > 0 \? \(/);
  });

  it("le volet s'ouvre de lui-même quand l'assistant a quelque chose à montrer", () => {
    assert.match(
      page,
      /ouvert=\{decoupageOuvert \|\| planDeLaScene \|\| \(montrerAssistant && assistantActif\)\}/,
    );
    assert.match(volet, /if \(!plans\.length && !peutEditer && !assistant\) \{\s+return null;/);
    assert.match(volet, /\{assistant\}/);
  });

  it("l'encart affiche l'avertissement dès que des plans sont montrés, et dit quand le scénario manque", () => {
    assert.match(encart, /\{LIVRABLE_DECOUPAGE\.avertissement\}/);
    assert.match(encart, /scenarioPresent \? null : ` \$\{LIVRABLE_DECOUPAGE\.sansScenario\}`/);
    assert.match(encart, /Rien n&apos;entre dans le découpage sans accord, plan par\s+plan\./);
  });

  it("« tout accepter » demande une confirmation", () => {
    assert.match(encart, /`Ajouter \$\{nombrePlans\(bilan\.enAttente\)\} au découpage`/);
    assert.match(encart, /setConfirmation\(true\)/);
  });

  it("aucune borne n'est écrite en dur dans l'encart", () => {
    assert.match(encart, /maxLength=\{DESCRIPTION_PLAN_MAX\}/);
    assert.match(encart, /maxLength=\{String\(FOCALE_MM\.max\)\.length\}/);
    assert.match(encart, /maxLength=\{String\(DUREE_PLAN_SECONDES\.max\)\.length\}/);
    assert.doesNotMatch(encart, /maxLength=\{\d+\}/);
  });
});
