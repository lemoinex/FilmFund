/**
 * Écran des retouches (lot RT2) : la localisation du passage dans un document
 * de tout type, ce que le serveur calcule et que la base accepte, puis les
 * actions serveur, la page et l'encart.
 *
 * Les actions serveur, la page et l'encart sont lus comme du texte : leur
 * comportement dans un navigateur — sélection, clics — ne se vérifie pas ici.
 * AUCUN APPEL À UN FOURNISSEUR : une proposition est déposée comme le ferait
 * le worker.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import {
  ERREURS_BASE,
  extrairePassage,
  LIVRABLES_RETOUCHE,
  localiserPassage,
  messageErreur,
  messageErreurRetouche,
  MOTS_PASSAGE_DOCUMENT,
  PASSAGE_CHANGE_DOCUMENT,
  RETOUCHE,
} from "../src/lib/propositions.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
} from "./helpers.mjs";

const DOSSIER = "src/app/(app)/projets/[id]/documents/[documentId]";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ACTIONS = ["text_improve", "text_shorten", "text_expand", "text_correct"];

const AVANT = "# Pourquoi ce film\n\nJe suis née au bord du fleuve 🌊.";
const PASSAGE = "Ce film, je le porte depuis la **crue** de 1978.";
const APRES = "- la crue\n- le départ";
const NOTE = `${AVANT}\n\n${PASSAGE}\n\n${APRES}`;
const localiser = (contenu, selection) =>
  localiserPassage(contenu, selection, RETOUCHE.passageMax, MOTS_PASSAGE_DOCUMENT);

describe("Retouches, écran : localisation du passage", () => {
  it("retrouve le passage dans un document qui n'est pas un scénario, emoji compris", () => {
    const localise = localiser(NOTE, PASSAGE);
    assert.equal(localise.passage, PASSAGE);
    assert.equal(localise.debut, [...AVANT].length + 2);
    assert.equal(localise.longueur, [...PASSAGE].length);
    assert.equal(extrairePassage(NOTE, localise.debut, localise.longueur), PASSAGE);
  });

  it("garde les marqueurs de mise en forme du passage : ils font partie du texte", () => {
    const localise = localiser(NOTE, "- la crue\n- le départ");
    assert.equal(localise.passage, "- la crue\n- le départ");
  });

  it("refuse une sélection vide, absente, ambiguë ou trop longue, avec les mots d'un document", () => {
    assert.deepEqual(localiser(NOTE, "   "), { erreur: MOTS_PASSAGE_DOCUMENT.vide });
    assert.deepEqual(localiser(NOTE, 12), { erreur: MOTS_PASSAGE_DOCUMENT.vide });
    assert.deepEqual(localiser(NOTE, "Un texte absent."), { erreur: MOTS_PASSAGE_DOCUMENT.absent });
    assert.deepEqual(localiser(NOTE, "crue"), { erreur: MOTS_PASSAGE_DOCUMENT.double });
    // Un passage de 6 001 caractères, bien présent et unique dans son document.
    const tropLong = localiser(`x${"a".repeat(6001)}y`, "a".repeat(6001));
    assert.match(tropLong.erreur, /^Ce passage est trop long : 6\s000 caractères au plus\.$/u);
    assert.ok(!("erreur" in localiser(`${"a".repeat(6000)}b`, "a".repeat(6000))));
  });

  it("ne parle ni de scénario ni de scène ; les dialogues gardent leurs mots", () => {
    for (const message of [
      MOTS_PASSAGE_DOCUMENT.vide,
      MOTS_PASSAGE_DOCUMENT.absent,
      MOTS_PASSAGE_DOCUMENT.double,
      MOTS_PASSAGE_DOCUMENT.long("6 000"),
      PASSAGE_CHANGE_DOCUMENT,
    ]) {
      assert.doesNotMatch(message, /scénario|scène/i, message);
    }
    assert.match(localiserPassage(NOTE, "  ").erreur, /scène dans le texte du scénario/);
    assert.match(localiserPassage(NOTE, "absent").erreur, /scénario enregistré/);
  });

  it("un document changé à cet endroit a son propre message, les autres erreurs gardent le leur", () => {
    assert.equal(messageErreurRetouche(ERREURS_BASE.passageChange), PASSAGE_CHANGE_DOCUMENT);
    assert.match(messageErreur(ERREURS_BASE.passageChange), /scénario/);
    for (const code of [ERREURS_BASE.quota, ERREURS_BASE.refus, ERREURS_BASE.invalide, undefined]) {
      assert.equal(messageErreurRetouche(code), messageErreur(code));
    }
    assert.doesNotMatch(PASSAGE_CHANGE_DOCUMENT, /PR002/);
  });
});

/**
 * Fait déposer une proposition pour une retouche en attente, comme le ferait
 * le worker : réclamation, envoi, provision, coût confirmé, livraison. AUCUN
 * FOURNISSEUR N'EST APPELÉ : le texte est donné par le test.
 */
async function deposerRetouche(tacheId, texte) {
  assert.match(tacheId, /^[0-9a-f-]{36}$/);
  assert.ok(!texte.includes("$texte$"));
  const { code, erreurs } = await sql(`
    do $$
    declare
      v_travail uuid;
      v_essai uuid;
    begin
      select r.job_id, r.attempt_id into v_travail, v_essai
      from public.reclamer_travail('worker-de-test', array['text_shorten']) r;
      if v_travail is distinct from '${tacheId}' then
        raise exception 'Tâche réclamée inattendue : %', v_travail;
      end if;
      perform public.marquer_tentative_soumise(v_essai);
      perform public.provisionner_cout(
        v_essai, 'anthropic', 'claude-opus-5-5', 'weaver.retouche_raccourcir@1', 10, 10, 0.0001
      );
      perform public.confirmer_cout(v_essai, 'claude-opus-5-5', 10, 10, 0.0001, false);
      perform public.livrer_proposition(v_essai, $texte$${texte}$texte$);
    end $$;
  `);
  assert.equal(code, 0, erreurs);
}

describe("Retouches, écran : ce que le serveur calcule, la base l'accepte", () => {
  let porteur;
  let projet;
  let document;

  /** Les paramètres que l'action serveur envoie au devis, à partir d'une sélection. */
  const parametres = (contenu, selection) => {
    const localise = localiser(contenu, selection);
    assert.ok(!("erreur" in localise), localise.erreur);
    return {
      document: document.id,
      debut: localise.debut,
      longueur: localise.longueur,
      empreinte: createHash("md5").update(localise.passage, "utf8").digest("hex"),
    };
  };

  before(async () => {
    // Le dépôt provisionne un coût factice : le plafond local ne doit pas le refuser.
    await definirPlafondIa(1_000_000);
    porteur = await creerCompte("retouche-ecran-porteur");
    projet = await creerProjet(porteur, "Le Fleuve");
    const { data, error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "note_intention", title: "Note", content: NOTE })
      .select("id")
      .single();
    assert.ifError(error);
    document = data;
  });

  after(async () => {
    await definirPlafondIa(5);
  });

  it("la base admet, pour chaque retouche, le passage que le serveur localise", async () => {
    for (const action of ACTIONS) {
      const { data, error } = await porteur.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: action,
        // Une sélection entourée de blancs, comme un double-clic en laisse.
        p_params: parametres(NOTE, `  ${PASSAGE}\n`),
      });
      assert.ifError(error);
      assert.equal(data[0].quantity, 1, action);
    }
  });

  it("la page retrouve la dernière retouche du document, et le passage qu'elle remplacerait", async () => {
    const tache = await engager(
      porteur,
      projet.id,
      "text_shorten",
      "retouche-ecran-cle",
      parametres(NOTE, PASSAGE),
    );
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    await deposerRetouche(tache.id, "Je porte ce film depuis la **crue** de 1978.");

    // La lecture de la page, telle qu'elle l'écrit.
    const { data: lue, error } = await porteur.client
      .from("jobs")
      .select("id, state, params, action")
      .eq("project_id", projet.id)
      .in("action", Object.keys(LIVRABLES_RETOUCHE))
      .eq("params->>document", document.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    assert.ifError(error);
    assert.equal(lue.id, tache.id);
    assert.equal(lue.action, "text_shorten");
    assert.equal(lue.state, "succeeded");
    assert.equal(
      extrairePassage(NOTE, Number(lue.params.debut), Number(lue.params.longueur)),
      PASSAGE,
    );

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.state, "proposed");

    // Appliquée comme le fait l'action : le passage, et lui seul.
    const { error: refus } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: proposition.content,
    });
    assert.ifError(refus);
    const { data: apres } = await porteur.client
      .from("project_documents")
      .select("content")
      .eq("id", document.id)
      .single();
    assert.equal(
      apres.content,
      `${AVANT}\n\nJe porte ce film depuis la **crue** de 1978.\n\n${APRES}`,
    );
  });
});

describe("Retouches, écran : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-ia.ts`));
  const corps = (nom) => {
    const debut = source.indexOf(`export async function ${nom}`);
    assert.ok(debut >= 0, nom);
    const suite = source.indexOf("\nexport ", debut + 1);
    return source.slice(debut, suite === -1 ? undefined : suite);
  };

  it("chaque action valide ses identifiants, n'admet qu'une retouche du catalogue, et exige une session", () => {
    for (const nom of ["demanderDevisRetouche", "appliquerRetouche"]) {
      const action = corps(nom);
      assert.match(action, /UUID\.test\(projetId\)/, nom);
      assert.match(action, /UUID\.test\(documentId\)/, nom);
      assert.match(action, /typeof action !== "string" \|\|\s*!estRetouche\(action\)/, nom);
      assert.match(action, /await session\(\)/, nom);
      // Le contrôle de l'action précède tout accès à la base.
      assert.ok(action.indexOf("estRetouche(action)") < action.indexOf("await session()"), nom);
    }
  });

  it("le navigateur n'envoie que le texte et le nom de la retouche : le reste est calculé ici", () => {
    const devis = corps("demanderDevisRetouche");
    assert.match(devis, /\.from\("project_documents"\)/);
    assert.match(devis, /\.eq\("project_id", projetId\)/);
    assert.match(
      devis,
      /localiserPassage\(\s*document\.content,\s*selection,\s*RETOUCHE\.passageMax,\s*MOTS_PASSAGE_DOCUMENT,?\s*\)/,
    );
    assert.match(devis, /debut: localise\.debut,\s*longueur: localise\.longueur,/);
    assert.match(devis, /createHash\("md5"\)\.update\(localise\.passage, "utf8"\)/);
    assert.match(devis, /p_action: action,/);
    // Tout type de document : aucune condition sur le type.
    assert.doesNotMatch(devis, /document\.type/);
    assert.doesNotMatch(devis, /scenes:/);
  });

  it("le passage appliqué est borné avant la base, qui décide du remplacement", () => {
    const appliquer = corps("appliquerRetouche");
    assert.match(appliquer, /const max = LIVRABLES_RETOUCHE\[action\]\.longueurMax;/);
    assert.match(appliquer, /contenu\.length > max/);
    assert.match(appliquer, /rpc\("accepter_proposition"/);
    assert.match(appliquer, /messageErreurRetouche\(error\.code\)/);
    assert.doesNotMatch(appliquer, /\.from\("project_documents"\)/);
  });

  it("aucune action ne choisit un modèle, n'appelle un fournisseur ni ne lit une clé", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|cle_fournisseur|modele|model|profil/i);
  });
});

describe("Retouches, écran : page et encart", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const encart = sansCommentaires(lire(`${DOSSIER}/retouches.tsx`));

  it("l'encart est rendu sur tout document, à qui peut l'écrire", () => {
    assert.match(page, /const retouche = peutEditer\s*\? await lireRetouche\(/);
    assert.match(page, /\{retouche \? \(\s*<Retouches/);
    assert.match(page, /\.in\("action", Object\.keys\(LIVRABLES_RETOUCHE\)\)/);
    // Une seule lecture, bornée, pour ce document.
    const lecture = page.slice(page.indexOf("async function lireRetouche"));
    assert.match(lecture, /\.eq\("params->>document", documentId\)/);
    assert.match(lecture, /\.limit\(1\)/);
    assert.match(lecture, /estRetouche\(tache\.action\)/);
    // Un texte qui n'a plus l'empreinte de la demande n'est pas montré en regard.
    assert.match(
      lecture,
      /createHash\("md5"\)\.update\(passage, "utf8"\)\.digest\("hex"\) === parametres\.empreinte/,
    );
    assert.match(lecture, /passage: intact \? passage : ""/);
  });

  it("un seul rafraîchissement sert les deux encarts", () => {
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    assert.match(page, /\[dialogues\?\.etape\.etape, retouche\?\.etape\.etape\]\.some\(/);
  });

  it("l'encart dit ce qui part chez le fournisseur avant tout envoi", () => {
    assert.match(encart, /\{RETOUCHE\.description\}/);
    assert.ok(encart.indexOf("{RETOUCHE.description}") < encart.indexOf("ACTIONS.map("));
    assert.match(RETOUCHE.description, /transmis pour cela à notre fournisseur d'IA/);
  });

  it("l'encart propose les retouches du catalogue, chacune avec son effet", () => {
    assert.match(
      encart,
      /const ACTIONS = Object\.keys\(LIVRABLES_RETOUCHE\) as ActionRetouche\[\];/,
    );
    assert.match(encart, /\{LIVRABLES_RETOUCHE\[action\]\.bouton\}/);
    assert.match(encart, /\{LIVRABLES_RETOUCHE\[action\]\.effet\}/);
    assert.match(encart, /onClick=\{\(\) => obtenirDevis\(action\)\}/);
    for (const action of ACTIONS) {
      assert.ok(LIVRABLES_RETOUCHE[action].bouton.length > 0);
      assert.ok(LIVRABLES_RETOUCHE[action].effet.length > 0);
    }
  });

  it("rien ne part sans devis affiché ni confirmation", () => {
    assert.match(encart, /Cette retouche compte \{unitesTexte\(demande\.devis\.quantite\)\}/);
    assert.match(encart, /Confirmer la demande/);
    assert.match(encart, /Renoncer/);
    // Le lancement n'est appelé que depuis le bouton de confirmation.
    assert.equal(encart.match(/lancerDialogue\(/g)?.length, 1);
  });

  it("l'encart refuse d'agir sur un document non enregistré, au devis comme à l'acceptation", () => {
    assert.equal(
      encart.match(/if \(editeurModifie\(\)\) \{\s*setErreur\(NON_ENREGISTRE\);/g)?.length,
      2,
    );
    assert.match(encart, /normaliser\(champ\.value\) !== normaliser\(contenuEnregistre\)/);
  });

  it("seuls le texte sélectionné et le nom de la retouche partent vers le serveur", () => {
    assert.match(encart, /demanderDevisRetouche\(projetId, documentId, action, selection\)/);
    assert.match(encart, /champ\.value\.slice\(champ\.selectionStart, champ\.selectionEnd\)/);
    assert.doesNotMatch(encart, /empreinte|md5|debut:/);
  });

  it("la proposition se lit en regard du passage, avec les deux longueurs et leur écart", () => {
    assert.match(encart, /Passage actuel/);
    assert.match(encart, /\{enNombre\(\[\.\.\.passageActuel\]\.length\)\} caractères/);
    assert.match(
      encart,
      /comparerLongueurs\(\[\.\.\.passageActuel\]\.length, \[\.\.\.texte\]\.length\)/,
    );
    assert.match(encart, /Le passage proposé est plus \$\{ecart < 0 \? "court" : "long"\}/);
    assert.match(encart, /Le passage désigné ne se retrouve plus à cet endroit du document\./);
  });

  it("la page est rechargée après une acceptation, pour que l'éditeur reparte du texte à jour", () => {
    assert.match(
      encart,
      /appliquerRetouche\(projetId, documentId, propositionId, action, texte\),\s*\(\) => window\.location\.reload\(\)/,
    );
  });

  it("aucune longueur n'est écrite en dur dans l'encart", () => {
    assert.doesNotMatch(encart, /\b(6000|6_000|12000|12_000)\b/);
    assert.match(encart, /maxLength=\{LIVRABLES_RETOUCHE\[actionEnCours\]\.longueurMax\}/);
    assert.match(encart, /enNombre\(RETOUCHE\.passageMax\)/);
  });

  it("l'encart ne promet rien que la base ne tienne", () => {
    assert.match(
      encart,
      /Si le\s+document a changé à cet endroit depuis la demande, le remplacement est refusé\./,
    );
    assert.doesNotMatch(encart, /garanti|toujours plus court/i);
  });
});
