/**
 * Dialogues d'une scène (lot J2b-2) : ce que l'écran retrouve dans le
 * scénario, ce que ses actions serveur vérifient, et ce que la base accepte
 * de ce que le serveur calcule.
 *
 * Importe directement le module TypeScript (types retirés par Node). Les
 * actions serveur, la page et l'encart sont lus comme du texte : leur
 * parcours complet se vérifie dans le navigateur. La localisation du passage,
 * elle, est éprouvée contre la base locale : une position ou une empreinte
 * calculée autrement que la base la refuserait à chaque demande.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ERREURS_BASE,
  estActionIa,
  extrairePassage,
  LIVRABLE_DIALOGUE,
  LIVRABLES_IA,
  localiserPassage,
  messageErreur,
} from "../src/lib/propositions.ts";
import { PROFIL_DIALOGUES, PROFILS_VOICE } from "../worker/src/ia/profils.ts";
import { creerCompte, creerProjet } from "./helpers.mjs";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const AVANT = "EXT. VILLAGE — JOUR\n\nMaya descend du car. Une chèvre 🐐 traverse la piste.";
const SCENE = "INT. MAISON — NUIT\n\nMAYA\nIl y a quelqu'un ici ?\n\nLA MÈRE\nTu es revenue.";
const APRES = "EXT. COUR — AUBE\n\nLe coq chante.";
const SCENARIO = `${AVANT}\n\n${SCENE}\n\n${APRES}`;

describe("Dialogues : localisation du passage", () => {
  it("retrouve la scène, positions en caractères — un emoji vaut un caractère", () => {
    const localise = localiserPassage(SCENARIO, SCENE);
    assert.equal(localise.passage, SCENE);
    assert.equal(localise.longueur, [...SCENE].length);
    // En unités UTF-16, l'emoji compterait double et décalerait tout d'un cran.
    assert.equal(localise.debut, [...`${AVANT}\n\n`].length);
    assert.equal(localise.debut, `${AVANT}\n\n`.length - 1);
    assert.equal(extrairePassage(SCENARIO, localise.debut, localise.longueur), SCENE);
  });

  it("ignore les blancs autour de la sélection", () => {
    assert.equal(localiserPassage(SCENARIO, `\n\n  ${SCENE}\n\n`).passage, SCENE);
  });

  it("retrouve la scène dans un contenu aux fins de ligne « \\r\\n »", () => {
    const windows = SCENARIO.replaceAll("\n", "\r\n");
    const localise = localiserPassage(windows, SCENE);
    assert.equal(localise.passage, SCENE.replaceAll("\n", "\r\n"));
    assert.equal(extrairePassage(windows, localise.debut, localise.longueur), localise.passage);
  });

  it("retrouve une scène à cheval sur deux sortes de fins de ligne", () => {
    // Le début enregistré par l'éditeur, en « \r\n » ; la suite ajoutée par un
    // agent, en « \n ». La jonction tombe au milieu de la scène.
    const coupe = SCENARIO.indexOf("LA MÈRE");
    const meles = SCENARIO.slice(0, coupe).replaceAll("\n", "\r\n") + SCENARIO.slice(coupe);
    assert.ok(meles.includes("\r\n") && /[^\r]\n/.test(meles), "le contenu mêle les deux");

    const localise = localiserPassage(meles, SCENE);
    assert.equal(localise.erreur, undefined);
    // Le passage rendu est celui du contenu tel qu'il est écrit, pas la sélection.
    assert.equal(localise.passage.replaceAll("\r\n", "\n"), SCENE);
    assert.ok(localise.passage.includes("\r\n") && /[^\r]\n/.test(localise.passage));
    assert.equal(extrairePassage(meles, localise.debut, localise.longueur), localise.passage);
    assert.equal(localise.longueur, [...localise.passage].length);
  });

  it("n'emporte pas le « \\r » de la fin de ligne qui suit le passage", () => {
    const windows = SCENARIO.replaceAll("\n", "\r\n");
    const localise = localiserPassage(windows, SCENE);
    assert.ok(!localise.passage.endsWith("\r"));
    assert.ok(!localise.passage.startsWith("\n"));
    // Le dernier passage du document, sans rien après lui.
    const dernier = localiserPassage(windows, APRES);
    assert.equal(dernier.passage, APRES.replaceAll("\n", "\r\n"));
    assert.equal(extrairePassage(windows, dernier.debut, dernier.longueur), dernier.passage);
  });

  it("une sélection qui ne diffère d'un autre passage que par ses fins de ligne reste ambiguë", () => {
    const double = `${SCENE.replaceAll("\n", "\r\n")}\n\n${SCENE}`;
    assert.match(localiserPassage(double, SCENE).erreur, /plusieurs fois/);
  });

  it("refuse une sélection vide, absente, ambiguë ou trop longue, en disant pourquoi", () => {
    for (const vide of ["", "   \n ", null, undefined, 42]) {
      assert.match(localiserPassage(SCENARIO, vide).erreur, /Sélectionnez d'abord/);
    }
    assert.match(
      localiserPassage(SCENARIO, "Une scène qui n'existe pas.").erreur,
      /enregistrez le document/,
    );
    assert.match(localiserPassage(`${SCENE}\n\n${SCENE}`, SCENE).erreur, /plusieurs fois/);
    const long = "a".repeat(6001);
    assert.match(localiserPassage(`début ${long} fin`, long).erreur, /trop long/);
    assert.equal(
      localiserPassage(`début ${"a".repeat(6000)} fin`, "a".repeat(6000)).longueur,
      6000,
    );
  });

  it("ne rend rien pour une position qui n'en est pas une", () => {
    for (const [debut, longueur] of [
      [-1, 5],
      [0, 0],
      [1.5, 5],
      [Number.NaN, 5],
      [0, Number.NaN],
    ]) {
      assert.equal(extrairePassage(SCENARIO, debut, longueur), "");
    }
    assert.equal(extrairePassage(SCENARIO, 100_000, 5), "");
  });
});

describe("Dialogues : ce que le serveur calcule, la base l'accepte", () => {
  const empreinte = (texte) => createHash("md5").update(texte, "utf8").digest("hex");

  for (const [nom, contenu] of [
    ["fins de ligne « \\n », emoji et accents", SCENARIO],
    ["fins de ligne « \\r\\n »", SCENARIO.replaceAll("\n", "\r\n")],
    [
      "fins de ligne mêlées, la jonction au milieu de la scène",
      SCENARIO.slice(0, SCENARIO.indexOf("LA MÈRE")).replaceAll("\n", "\r\n") +
        SCENARIO.slice(SCENARIO.indexOf("LA MÈRE")),
    ],
  ]) {
    it(`devis accordé pour un passage localisé : ${nom}`, async () => {
      const porteur = await creerCompte("dialogues-ecran");
      const projet = await creerProjet(porteur, "La Maison des lianes");
      const { data: scenario, error } = await porteur.client
        .from("project_documents")
        .insert({ project_id: projet.id, type: "scenario", title: "Scénario", content: contenu })
        .select("id")
        .single();
      assert.ifError(error);

      // Ce que fait l'action serveur, à l'identique : localiser, puis sceller.
      const localise = localiserPassage(contenu, SCENE);
      const { data, error: refus } = await porteur.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: LIVRABLE_DIALOGUE.action,
        p_params: {
          scenes: 1,
          document: scenario.id,
          debut: localise.debut,
          longueur: localise.longueur,
          empreinte: empreinte(localise.passage),
        },
      });
      assert.ifError(refus);
      assert.equal(data[0].quantity, 1);
    });
  }
});

describe("Dialogues : catalogue et messages", () => {
  it("le livrable est celui du worker, borné comme lui, et tenu à part des encarts de texte", () => {
    assert.deepEqual(Object.keys(PROFILS_VOICE), [LIVRABLE_DIALOGUE.action]);
    assert.equal(LIVRABLE_DIALOGUE.longueurMax, PROFIL_DIALOGUES.longueurMax);
    assert.ok(!(LIVRABLE_DIALOGUE.action in LIVRABLES_IA));
    assert.equal(estActionIa(LIVRABLE_DIALOGUE.action), false);
    // La description dit que le contexte part chez le fournisseur, et ce que
    // l'assistant ne touche pas.
    assert.match(LIVRABLE_DIALOGUE.description, /fournisseur d'IA/);
    assert.match(LIVRABLE_DIALOGUE.description, /ni aux intitulés ni aux didascalies/);

    // Le passage admis à l'écran est celui que la base admet au devis.
    const migration = lire("supabase/migrations/20261005190000_voice_dialogues.sql");
    assert.match(
      migration,
      new RegExp(`v_longueur not between 1 and ${LIVRABLE_DIALOGUE.passageMax}`),
    );
  });

  it("un scénario changé à cet endroit a son propre message, sans le code", () => {
    assert.equal(ERREURS_BASE.passageChange, "PR002");
    const message = messageErreur("PR002");
    assert.match(message, /a changé à cet endroit/);
    assert.ok(!message.includes("PR002"));
  });
});

describe("Dialogues : actions serveur", () => {
  const source = sansCommentaires(
    lire("src/app/(app)/projets/[id]/documents/[documentId]/actions-ia.ts"),
  );
  const NOMS = [
    "demanderDevisDialogue",
    "lancerDialogue",
    "annulerDialogue",
    "appliquerDialogue",
    "ecarterDialogue",
  ];
  const corps = (nom) => {
    const debut = source.indexOf(`export async function ${nom}`);
    assert.ok(debut >= 0, nom);
    const suite = source.indexOf("\nexport ", debut + 1);
    return source.slice(debut, suite === -1 ? undefined : suite);
  };

  it("chaque action valide ses identifiants et exige une session", () => {
    // Les deux dernières sont celles des retouches (lot RT2), éprouvées par
    // leur propre suite ; les trois autres leur servent aussi.
    assert.deepEqual(
      [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]),
      [...NOMS, "demanderDevisRetouche", "appliquerRetouche"],
    );
    for (const nom of NOMS) {
      assert.match(corps(nom), /UUID\.test\(projetId\)/, `${nom} valide le projet`);
      assert.match(corps(nom), /UUID\.test\(documentId\)/, `${nom} valide le document`);
      assert.match(corps(nom), /await session\(\)/, `${nom} exige une session`);
    }
  });

  it("le navigateur n'envoie que le texte : position et empreinte sont calculées ici", () => {
    const devis = corps("demanderDevisDialogue");
    // Le document est relu en base, sous la RLS, et doit être un scénario.
    assert.match(devis, /\.from\("project_documents"\)/);
    assert.match(devis, /\.eq\("project_id", projetId\)/);
    assert.match(devis, /document\.type !== "scenario"/);
    assert.match(devis, /localiserPassage\(document\.content, selection\)/);
    assert.match(devis, /debut: localise\.debut,\s*longueur: localise\.longueur,/);
    assert.match(devis, /createHash\("md5"\)\.update\(localise\.passage, "utf8"\)/);
    // Une scène par demande, et l'action n'est pas choisie par le navigateur.
    assert.match(devis, /scenes: 1,/);
    assert.match(devis, /p_action: ACTION,/);
    assert.match(source, /const ACTION = LIVRABLE_DIALOGUE\.action;/);
    assert.doesNotMatch(source, /modele|model|profil/i);
  });

  it("la scène appliquée est bornée avant la base, qui décide du remplacement", () => {
    const appliquer = corps("appliquerDialogue");
    assert.match(appliquer, /contenu\.length > LIVRABLE_DIALOGUE\.longueurMax/);
    assert.match(appliquer, /rpc\("accepter_proposition"/);
    assert.doesNotMatch(appliquer, /\.from\("project_documents"\)/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|cle_fournisseur/i);
  });
});

describe("Dialogues : page et encart", () => {
  const page = sansCommentaires(lire("src/app/(app)/projets/[id]/documents/[documentId]/page.tsx"));
  const encart = sansCommentaires(
    lire("src/app/(app)/projets/[id]/documents/[documentId]/dialogues.tsx"),
  );

  it("l'encart n'est rendu que sur un scénario, à qui peut l'écrire", () => {
    assert.match(page, /peutEditer && document\.type === "scenario"\s*\? await lireDialogues\(/);
    assert.match(page, /\{dialogues \? \(/);
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    // La demande suivie est celle de ce document, lue bornée.
    assert.match(page, /\.eq\("params->>document", documentId\)/);
    assert.match(page, /\.limit\(1\)/);
  });

  it("l'encart refuse d'agir sur un document non enregistré", () => {
    // Au devis comme à l'acceptation : sinon l'éditeur, qui garde son texte,
    // écraserait la scène remplacée à l'enregistrement suivant.
    assert.equal(encart.match(/if \(editeurModifie\(\)\) \{/g)?.length, 2);
    assert.match(encart, /normaliser\(champ\.value\) !== normaliser\(contenuEnregistre\)/);
    const appliquer = encart.slice(encart.indexOf("function appliquer("));
    assert.ok(
      appliquer.indexOf("editeurModifie()") < appliquer.indexOf("appliquerDialogue("),
      "le contrôle précède l'acceptation",
    );
  });

  it("la page est rechargée après une acceptation, pour que l'éditeur reparte du texte à jour", () => {
    assert.match(encart, /appliquerDialogue\([^)]*\),\s*\(\) => window\.location\.reload\(\),/);
    assert.equal(encart.match(/window\.location\.reload\(\)/g)?.length, 1);
  });

  it("seul le texte sélectionné part vers le serveur", () => {
    assert.match(encart, /champ\.value\.slice\(champ\.selectionStart, champ\.selectionEnd\)/);
    assert.match(encart, /demanderDevisDialogue\(projetId, documentId, selection\)/);
    assert.doesNotMatch(encart, /empreinte|md5/i);
  });

  it("aucune longueur n'est écrite en dur dans l'encart", () => {
    assert.match(encart, /maxLength=\{livrable\.longueurMax\}/);
    assert.match(encart, /rows=\{livrable\.lignes\}/);
    assert.doesNotMatch(encart, /6000|6_000|12000|12_000/);
  });
});
