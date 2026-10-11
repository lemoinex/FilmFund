/**
 * Fiche d'un personnage proposée par ARC (lot PF3b) : ce que l'écran annonce,
 * et ce que ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page, sa
 * lecture et l'encart sont lus comme du texte : leur parcours complet se
 * vérifie dans le navigateur, et les droits eux-mêmes par les tests de la
 * base et du worker (lot PF3a).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CHAMPS_FICHE_PERSONNAGE } from "../src/lib/fiche.ts";
import {
  estActionIa,
  estActionStructuree,
  LIVRABLE_FICHE_PERSONNAGE,
  LIVRABLE_PERSONNAGES,
} from "../src/lib/propositions.ts";
import {
  CHAMPS_FICHE_PERSONNAGE as CHAMPS_DE_L_AGENT,
  PROFILS_ARC_FICHE,
} from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/assistant";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

const actions = aPlat(lire(`${DOSSIER}/actions-fiche.ts`));
const encart = aPlat(lire(`${DOSSIER}/fiche-proposee.tsx`));
const lecture = aPlat(lire(`${DOSSIER}/lecture-fiches.ts`));
const page = aPlat(lire(`${DOSSIER}/[etape]/page.tsx`));

describe("Fiche proposée : catalogue", () => {
  it("l'écran propose exactement ce qu'ARC sait proposer, champ pour champ", () => {
    assert.deepEqual(Object.keys(PROFILS_ARC_FICHE), [LIVRABLE_FICHE_PERSONNAGE.action]);
    assert.equal(LIVRABLE_FICHE_PERSONNAGE.lignesMax, CHAMPS_DE_L_AGENT.length);
    assert.equal(LIVRABLE_FICHE_PERSONNAGE.lignesMax, CHAMPS_FICHE_PERSONNAGE.length);
    // Tenu à part des textes, des livrables structurés et des personnages à ajouter.
    assert.equal(estActionIa(LIVRABLE_FICHE_PERSONNAGE.action), false);
    assert.equal(estActionStructuree(LIVRABLE_FICHE_PERSONNAGE.action), false);
    assert.notEqual(LIVRABLE_FICHE_PERSONNAGE.action, LIVRABLE_PERSONNAGES.action);
  });

  it("chaque nom de champ de l'agent a son libellé et ses bornes, ceux de la fiche saisie", () => {
    const paires = [...encart.matchAll(/(\w+): CHAMPS_FICHE_PERSONNAGE\[(\d)\],/g)].map((m) => [
      m[1],
      Number(m[2]),
    ]);
    assert.deepEqual(
      paires,
      CHAMPS_DE_L_AGENT.map((nom, rang) => [nom, rang]),
    );
    // Les colonnes de la fiche, dans l'ordre où l'agent nomme ses champs.
    assert.deepEqual(
      CHAMPS_FICHE_PERSONNAGE.map(({ cle }) => cle),
      ["age", "occupation", "appearance", "goal", "obstacle", "arc", "traits", "relations"],
    );
  });

  it("dit ce qui part chez le fournisseur, scénario compris, et ce que valent ses propositions", () => {
    const { description, avertissement, refusDocumentaire } = LIVRABLE_FICHE_PERSONNAGE;
    assert.match(description, /champs encore vides/);
    assert.match(description, /tous les personnages avec leurs fiches/);
    assert.match(description, /le scénario enregistré/);
    assert.match(description, /fournisseur d'IA/);
    assert.match(description, /Il ne modifie aucun champ déjà rempli/);
    assert.match(avertissement, /relisez chaque champ/);
    assert.match(avertissement, /n'est pas un fait/);
    assert.match(refusDocumentaire, /documentaire : ses personnages sont des personnes réelles/);
    // Aucun agent n'est nommé : l'équipe voit un assistant.
    for (const texte of Object.values(LIVRABLE_FICHE_PERSONNAGE)) {
      assert.doesNotMatch(String(texte), /\bARC\b/);
    }
  });
});

describe("Fiche proposée : actions serveur", () => {
  it("les cinq actions attendues, et rien d'autre", () => {
    assert.ok(lire(`${DOSSIER}/actions-fiche.ts`).startsWith('"use server";'));
    assert.deepEqual(
      [...actions.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]),
      [
        "demanderDevisFiche",
        "lancerPropositionFiche",
        "annulerPropositionFiche",
        "accepterChampPropose",
        "ecarterChampPropose",
      ],
    );
    // Un fichier d'actions n'exporte que des fonctions asynchrones.
    assert.doesNotMatch(actions, /export (const|function|type) /);
  });

  it("chaque action contrôle chacun de ses identifiants et exige une session avant d'appeler la base", () => {
    const corps = actions.split("export async function ").slice(1);
    assert.equal(corps.length, 5);
    for (const action of corps) {
      const nom = action.slice(0, action.indexOf("("));
      const controle = action.indexOf("UUID.test(");
      const session = action.indexOf("await session()");
      const appel = action.indexOf(".rpc(");
      assert.ok(controle > 0 && controle < session && session < appel, nom);
      assert.match(action, /if \("erreur" in acces\) \{ return acces; \}/, nom);
    }
    assert.match(actions, /!UUID\.test\(projetId\) \|\| !UUID\.test\(personnageId\)/);
    assert.match(
      actions,
      /!UUID\.test\(projetId\) \|\| !UUID\.test\(devisId\) \|\| !UUID\.test\(cle\)/,
    );
    assert.match(actions, /const garde = await exigerAcces\(supabase\);/);
  });

  it("le navigateur ne choisit ni l'action, ni le modèle, ni les champs : il désigne un personnage", () => {
    assert.match(actions, /const ACTION = LIVRABLE_FICHE_PERSONNAGE\.action;/);
    assert.match(
      actions,
      /rpc\("creer_devis", \{ p_project_id: projetId, p_action: ACTION, p_params: \{ character: personnageId \}, \}\)/,
    );
    assert.equal(actions.split("p_params").length - 1, 1);
    assert.doesNotMatch(actions, /model|profil|effort|max_tokens|p_fields|fields:/i);
    // Le champ accepté est désigné par sa ligne : le navigateur ne nomme pas de colonne.
    assert.match(actions, /rpc\("accepter_champ_propose", \{ p_line_id: champId,/);
    assert.match(actions, /\.\.\.\(corrige === undefined \? \{\} : \{ p_corrige: corrige \}\)/);
  });

  it("aucune action n'écrit une table ni n'appelle un fournisseur : tout passe par la base", () => {
    assert.deepEqual(
      [...actions.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      [
        "creer_devis",
        "accepter_devis",
        "annuler_travail",
        "accepter_champ_propose",
        "ecarter_champ_propose",
      ],
    );
    assert.doesNotMatch(actions, /\.from\(|\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(actions, /anthropic|openai|perplexity|API_KEY|cle_fournisseur|fetch\(/i);
    assert.doesNotMatch(actions, /service_role|SERVICE_ROLE/);
  });

  it("une correction est bornée avant la base, qui garde le dernier mot champ par champ", () => {
    assert.match(
      actions,
      /const CORRECTION_MAX = Math\.max\(\.\.\.CHAMPS_FICHE_PERSONNAGE\.map\(\(\{ max \}\) => max\)\);/,
    );
    const accepter = actions.slice(actions.indexOf("export async function accepterChampPropose("));
    const borne = accepter.indexOf(
      'corrige !== undefined && (typeof corrige !== "string" || corrige.length > CORRECTION_MAX)',
    );
    assert.ok(borne > 0 && borne < accepter.indexOf(".rpc("));
  });

  it("les refus de la base sont dits en clair, sans promettre un remplacement", () => {
    assert.match(actions, /code === "PF001"/);
    assert.match(actions, /Ce personnage a été retiré du projet/);
    assert.match(actions, /code === "PF002"/);
    assert.match(actions, /rien n'a été remplacé/);
    assert.match(actions, /return LIVRABLE_FICHE_PERSONNAGE\.refusDocumentaire;/);
    assert.match(actions, /déjà complète : il ne reste aucun champ à proposer/);
    // Le message de la base n'est jamais renvoyé tel quel au navigateur.
    assert.doesNotMatch(actions, /erreur: error\??\.message/);
  });

  it("chaque décision rafraîchit l'étape, la fiche et ce qui attend", () => {
    for (const chemin of ["/assistant/personnages", "/fiche", "/assistant-ia"]) {
      assert.ok(actions.includes(`revalidatePath(\`/projets/\${projetId}${chemin}\`);`), chemin);
    }
    assert.equal(actions.split("revalider(projetId);").length - 1, 4);
  });
});

describe("Fiche proposée : page, lecture et encart", () => {
  it("la page ne monte l'encart que sous un personnage, derrière le contrôle d'accès", () => {
    const garde = page.indexOf('if (!projet || (acces !== "owner" && acces !== "editor"))');
    assert.ok(garde > 0 && garde < page.indexOf("<Personnages"));
    assert.equal(page.split("<FicheProposee").length - 1, 1);
    assert.match(
      page,
      /\{!documentaire && aUneDemande\(personnage, fiches\.get\(personnage\.id\)\) \? \( <FicheProposee/,
    );
    // Pas d'encart sous un personnage en cours de modification.
    assert.ok(page.indexOf("<FormulairePersonnage") < page.indexOf("<FicheProposee"));
    assert.match(page, /personnageId=\{personnage\.id\}/);
  });

  it("un documentaire n'a ni encart ni lecture : la page dit pourquoi", () => {
    assert.match(page, /documentaire=\{projet\.format === "documentaire"\}/);
    assert.match(
      page,
      /const fiches = documentaire \? new Map<string, FicheVue>\(\) : await lireFiches\(supabase, projetId\);/,
    );
    assert.match(
      page,
      /\{documentaire && personnages\.length \? \( <p [^>]*> \{LIVRABLE_FICHE_PERSONNAGE\.refusDocumentaire\} <\/p>/,
    );
  });

  it("l'encart se montre s'il reste un champ vide, ou si une demande n'est pas au repos", () => {
    assert.match(
      page,
      /const vide = fichePersonnageRemplie\(personnage\)\.length < CHAMPS_FICHE_PERSONNAGE\.length;/,
    );
    assert.match(
      page,
      /return vide \|\| \(fiche !== undefined && fiche\.etape\.etape !== "repos"\);/,
    );
  });

  it("la lecture ne prend des tâches que l'état et le personnage, bornée, tenue au projet", () => {
    assert.match(lecture, /\.select\("id, state, personnage:params->>character"\)/);
    assert.doesNotMatch(lecture, /"[^"]*\bparams\b(?!->>)[^"]*"/);
    assert.match(lecture, /\.eq\("action", LIVRABLE_FICHE_PERSONNAGE\.action\)/);
    assert.match(
      lecture,
      /\.order\("created_at", \{ ascending: false \}\) \.limit\(DEMANDES_LUES_MAX\);/,
    );
    assert.match(lecture, /const DEMANDES_LUES_MAX = 100;/);
    assert.match(lecture, /\.limit\(ouvertes\.length \* LIVRABLE_FICHE_PERSONNAGE\.lignesMax\)/);
    assert.deepEqual(
      [...lecture.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]),
      ["jobs", "ai_suggestions", "ai_suggestion_character_fields"],
    );
    assert.equal(lecture.split('.eq("project_id", projetId)').length - 1, 2);
    assert.doesNotMatch(lecture, /\.(insert|update|delete|upsert|rpc)\(/);
  });

  it("chaque personnage suit sa dernière demande, et ne lit que les champs de sa proposition", () => {
    assert.match(
      lecture,
      /typeof tache\.personnage === "string" && !dernieres\.has\(tache\.personnage\)/,
    );
    assert.match(lecture, /etape: etapeProposition\(tache, proposition\)/);
    assert.match(lecture, /champ\.suggestion_id === proposition\?\.id/);
    // Les champs ne sont lus que pour une proposition encore ouverte.
    assert.match(lecture, /proposition\.state === "proposed"/);
  });

  it("l'encart est client, et n'affiche le texte venu du modèle que comme du texte", () => {
    assert.ok(lire(`${DOSSIER}/fiche-proposee.tsx`).startsWith('"use client";'));
    assert.doesNotMatch(encart, /dangerouslySetInnerHTML|innerHTML/);
    assert.match(encart, /\{champ\.value\}/);
    assert.doesNotMatch(encart, /supabase|createClient/);
    // Un champ inconnu de l'écran reste lisible, par son nom.
    assert.match(encart, /const libelle = regle\?\.libelle \?\? champ\.field;/);
  });

  it("rien ne part sans description, devis affiché ni confirmation", () => {
    const description = encart.indexOf("{LIVRABLE_FICHE_PERSONNAGE.description}");
    const bouton = encart.indexOf('{enCours ? "Un instant…" : LIVRABLE_FICHE_PERSONNAGE.bouton}');
    assert.ok(description > 0 && description < bouton);
    // Le devis d'abord ; la réservation seulement au second clic.
    assert.match(encart, /await demanderDevisFiche\(projetId, personnageId\)/);
    assert.match(encart, /setDemande\(\{ devis: resultat\.devis, cle: crypto\.randomUUID\(\) \}\)/);
    assert.match(encart, /Cette proposition compte \{unitesTexte\(demande\.devis\.quantite\)\}/);
    assert.match(encart, /lancerPropositionFiche\(projetId, demande\.devis\.id, demande\.cle\)/);
    assert.ok(encart.indexOf("Cette proposition compte") < encart.indexOf("Confirmer la demande"));
    assert.match(encart, /Renoncer/);
    // Aucun prix en dur : il vient du devis.
    assert.doesNotMatch(encart, /\b\d+ unités? texte/);
  });

  it("l'encart dit chaque état de la demande, jamais par la seule couleur", () => {
    assert.match(encart, /La dernière demande n&apos;a pas abouti/);
    assert.match(encart, /la fiche attend d&apos;être préparée/);
    assert.match(encart, /Annuler la demande/);
    assert.match(encart, /Fiche en cours de préparation…/);
    assert.match(encart, /Son issue est en cours de vérification/);
    assert.ok(encart.split('role="status"').length - 1 >= 5);
  });

  it("chaque champ se décide seul : accepter, corriger dans ses bornes, écarter", () => {
    assert.match(
      encart,
      /const aDecider = champs\.filter\(\(champ\) => champ\.state === "proposed"\);/,
    );
    assert.match(encart, /\{LIVRABLE_FICHE_PERSONNAGE\.avertissement\}/);
    assert.match(
      encart,
      /accepterChampPropose\( projetId, champ\.id, enSaisie === champ\.id \? corrige : undefined, \)/,
    );
    assert.match(encart, /ecarterChampPropose\(projetId, champ\.id\)/);
    assert.match(encart, /maxLength=\{regle\.max\}/);
    assert.match(encart, /maxLength=\{regle\?\.max\}/);
    // Un champ d'une ligne se corrige sur une ligne.
    assert.match(encart, /\{regle\?\.ligne \? \( <input/);
    // Aucun « tout accepter » : une fiche se relit champ par champ.
    assert.doesNotMatch(encart, /[Tt]out accepter/);
  });

  it("chaque bouton nomme son champ et son personnage pour un lecteur d'écran", () => {
    assert.match(encart, /aria-label=\{`\$\{LIVRABLE_FICHE_PERSONNAGE\.titre\} : \$\{nom\}`\}/);
    assert.match(encart, /<span className="sr-only"> pour \{nom\}<\/span>/);
    assert.equal(encart.split(": {libelle} de {nom} </span>").length - 1, 3);
    assert.match(encart, /<label htmlFor=\{id\} className="sr-only">/);
    assert.equal(encart.split("id={id}").length - 1, 2);
  });
});
