/**
 * VOICE (lot J2b-1) : les dialogues d'une scène, du passage désigné au
 * passage remplacé, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les répliques qu'il
 * écrit : cela se vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { composerContexteDialogue, executeursVoice } from "../worker/src/agents/voice.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { PROFIL_DIALOGUES, PROFILS_IA, PROFILS_VOICE } from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";

/** Réponse d'un fournisseur factice : le texte donné, facturé 1 800 jetons en entrée et 700 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1800, jetonsSortie: 700 }],
  };
}

/** Fournisseur factice : rejoue les réponses données, dans l'ordre, et note ce qu'on lui demande. */
function fournisseurFactice(...reponses) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    return reponses[Math.min(demandes.length, reponses.length) - 1];
  };
  return { fournisseur, demandes };
}

/**
 * Paramètres d'une demande pour un passage du contenu, comme le serveur les
 * calculera : positions en caractères — et non en unités UTF-16 —, empreinte
 * du passage tel qu'il est écrit.
 */
function designer(documentId, contenu, passage) {
  const position = contenu.indexOf(passage);
  assert.ok(position >= 0, "le passage doit figurer dans le contenu");
  return {
    scenes: 1,
    document: documentId,
    debut: [...contenu.slice(0, position)].length,
    longueur: [...passage].length,
    empreinte: createHash("md5").update(passage, "utf8").digest("hex"),
  };
}

const AVANT = "EXT. VILLAGE — JOUR\n\nMaya descend du car. Une chèvre 🐐 traverse la piste.";
const SCENE =
  "INT. MAISON — NUIT\n\nMaya pousse la porte.\n\nMAYA\nIl y a quelqu'un ici ?\n\nLA MÈRE\nTu es revenue.";
const APRES = "EXT. COUR — AUBE\n\nLe coq chante.";
const SCENARIO = `${AVANT}\n\n${SCENE}\n\n${APRES}`;
const REECRITE =
  "INT. MAISON — NUIT\n\nMaya pousse la porte.\n\nMAYA\nQuelqu'un ?\n\nLA MÈRE\nTe voilà.";

describe("VOICE : message et profil", () => {
  it("le message porte la scène et ce qui la précède, puis l'objectif en dernier", () => {
    const message = composerContexteDialogue(
      {
        action: "dialogue",
        projet: {
          titre: "La Maison des lianes",
          format: "long_metrage",
          etape: "ecriture",
          genre: null,
          pays: ["CM"],
          langues: "français",
          duree: 90,
        },
        contexte: { pitch: "Maya revient.", synopsis_court: null, theme: null, enjeux: null },
        personnages: [{ nom: "Maya", role: "protagoniste", description: "Trente ans, taiseuse." }],
        scene: SCENE,
        avant: AVANT,
      },
      PROFIL_DIALOGUES.objectif,
    );
    assert.match(message, /<scene>\nINT\. MAISON — NUIT[\s\S]*Tu es revenue\.\n<\/scene>/);
    assert.match(message, /<ce_qui_precede>\nEXT\. VILLAGE — JOUR/);
    assert.match(message, /- Maya \(protagoniste\)\n {2}Trente ans, taiseuse\./);
    assert.ok(message.endsWith("Réécris les répliques de cette scène."), message);
  });

  it("le profil est versionné, borné comme la base, et tenu à part des encarts de texte", () => {
    assert.equal(PROFIL_DIALOGUES.id, "voice.dialogues@1");
    assert.deepEqual(Object.keys(PROFILS_VOICE), ["dialogue"]);
    assert.ok(!("dialogue" in PROFILS_IA));
    assert.equal(PROFIL_DIALOGUES.longueurMax, 12_000);
    assert.ok(PROFIL_DIALOGUES.systeme.includes("12000"));
    // Les répliques seules : intitulés et didascalies ne changent pas.
    assert.match(PROFIL_DIALOGUES.systeme, /Garde à l'identique/);
  });
});

describe("VOICE : dialogues d'une scène", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-voice", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-voice-test",
    executeurs: executeursVoice(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function preparer(prefixe, contenu = SCENARIO) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, "La Maison des lianes");
    const { data: scenario, error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "scenario", title: "Scénario", content: contenu })
      .select("id")
      .single();
    assert.ifError(error);
    return { porteur, projet, scenario };
  }

  const devis = (compte, projetId, params) =>
    compte.client.rpc("creer_devis", {
      p_project_id: projetId,
      p_action: "dialogue",
      p_params: params,
    });

  async function lancer(porteur, projet, cle, params) {
    const tache = await engager(porteur, projet.id, "dialogue", cle, params);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const contenuDe = async (compte, documentId) =>
    (await compte.client.from("project_documents").select("content").eq("id", documentId).single())
      .data.content;

  it("le devis n'admet qu'une scène, et que le passage désigné", async () => {
    const { porteur, projet, scenario } = await preparer("voice-devis");
    const juste = designer(scenario.id, SCENARIO, SCENE);

    const { data, error } = await devis(porteur, projet.id, juste);
    assert.ifError(error);
    assert.equal(data[0].quantity, 1);

    // Un document d'un autre type, dans le même projet.
    const { data: note } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "note_intention", title: "Note", content: SCENARIO })
      .select("id")
      .single();
    // Le scénario d'un autre projet du même porteur.
    const autre = await creerProjet(porteur, "Un autre film");
    const { data: ailleurs } = await porteur.client
      .from("project_documents")
      .insert({ project_id: autre.id, type: "scenario", title: "Scénario", content: SCENARIO })
      .select("id")
      .single();

    for (const [quoi, params] of [
      ["deux scènes", { ...juste, scenes: 2 }],
      ["aucun passage", { scenes: 1 }],
      ["une empreinte fausse", { ...juste, empreinte: "0".repeat(32) }],
      ["une empreinte mal écrite", { ...juste, empreinte: "ABC" }],
      ["un début décalé", { ...juste, debut: juste.debut + 1 }],
      ["une longueur décalée", { ...juste, longueur: juste.longueur - 1 }],
      ["un début négatif", { ...juste, debut: -1 }],
      ["une longueur décimale", { ...juste, longueur: 12.5 }],
      ["un passage hors du texte", { ...juste, debut: 100_000 }],
      ["un passage trop long", { ...juste, longueur: 6001 }],
      ["un document qui n'est pas un scénario", { ...juste, document: note.id }],
      ["le scénario d'un autre projet", { ...juste, document: ailleurs.id }],
      ["un identifiant mal écrit", { ...juste, document: "scenario" }],
    ]) {
      const { error: refus } = await devis(porteur, projet.id, params);
      assert.equal(refus?.code, "22023", quoi);
    }
  });

  it("du passage désigné au passage remplacé : le reste du scénario ne bouge pas", async () => {
    const { porteur, projet, scenario } = await preparer("voice-chemin");
    const lecteur = await creerCompte("voice-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const tache = await lancer(
      porteur,
      projet,
      "voice-chemin-cle",
      designer(scenario.id, SCENARIO, SCENE),
    );
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(REECRITE));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil de VOICE ; la scène relue par la base, et ce qui la précède —
    // positions en caractères, emoji compris.
    assert.equal(demandes[0].profil.id, PROFIL_DIALOGUES.id);
    assert.ok(demandes[0].message.includes(`<scene>\n${SCENE}\n</scene>`), demandes[0].message);
    assert.match(demandes[0].message, /<ce_qui_precede>\nEXT\. VILLAGE — JOUR[\s\S]*🐐 traverse/);
    assert.doesNotMatch(demandes[0].message, /Le coq chante/);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, REECRITE);
    assert.equal(proposition.profile, PROFIL_DIALOGUES.id);

    // Rien n'est écrit tant que la proposition n'est pas appliquée.
    assert.equal(await contenuDe(porteur, scenario.id), SCENARIO);

    // Appliquer reste au porteur et aux éditeurs.
    const { error: refus } = await lecteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.equal(refus?.code, "42501");

    const { data: appliquee, error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ifError(error);

    // Le passage, et lui seul : ce qui précède et ce qui suit restent à l'identique.
    assert.equal(await contenuDe(porteur, scenario.id), `${AVANT}\n\n${REECRITE}\n\n${APRES}`);
    assert.equal(appliquee.replaced_content, SCENE);
    assert.equal(appliquee.final_content, REECRITE);

    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number, content")
      .eq("document_id", scenario.id)
      .order("version_number");
    assert.deepEqual(
      versions.map((version) => version.content),
      [SCENARIO, `${AVANT}\n\n${REECRITE}\n\n${APRES}`],
    );
  });

  it("scénario modifié à cet endroit avant l'acceptation : rien n'est remplacé", async () => {
    const { porteur, projet, scenario } = await preparer("voice-change");
    const tache = await lancer(
      porteur,
      projet,
      "voice-change-cle",
      designer(scenario.id, SCENARIO, SCENE),
    );
    const { fournisseur } = fournisseurFactice(reponseFactice(REECRITE));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .single();

    // L'équipe retouche la scène entre-temps : une ligne de plus en tête
    // décale tout le texte.
    const retouche = `Carton : dix ans plus tôt.\n\n${SCENARIO}`;
    const { error: ecriture } = await porteur.client
      .from("project_documents")
      .update({ content: retouche })
      .eq("id", scenario.id);
    assert.ifError(ecriture);

    const { error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.equal(error?.code, "PR002");
    assert.equal(await contenuDe(porteur, scenario.id), retouche);

    // La proposition reste lisible, et peut encore être écartée.
    const { data: etat } = await porteur.client
      .from("ai_suggestions")
      .select("state, content")
      .eq("id", proposition.id)
      .single();
    assert.deepEqual(etat, { state: "proposed", content: REECRITE });
  });

  it("scénario modifié avant l'appel : rien ne part chez le fournisseur", async () => {
    const { porteur, projet, scenario } = await preparer("voice-avant-appel");
    const tache = await lancer(
      porteur,
      projet,
      "voice-avant-appel-cle",
      designer(scenario.id, SCENARIO, SCENE),
    );
    const { error: ecriture } = await porteur.client
      .from("project_documents")
      .update({ content: SCENARIO.replace("Tu es revenue.", "Te revoilà.") })
      .eq("id", scenario.id);
    assert.ifError(ecriture);

    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(REECRITE));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    assert.equal(demandes.length, 0, "aucun appel ne doit partir");
    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.equal(finale.state, "failed");
  });

  it("une scène réécrite trop longue pour la base n'est pas déposée", async () => {
    const { porteur, projet, scenario } = await preparer("voice-trop-long");
    const tache = await lancer(
      porteur,
      projet,
      "voice-trop-long-cle",
      designer(scenario.id, SCENARIO, SCENE),
    );
    const { fournisseur } = fournisseurFactice(reponseFactice("a".repeat(12_001)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: propositions } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id);
    assert.deepEqual(propositions, []);
  });

  it("le contexte et le passage ne s'appellent pas depuis l'API", async () => {
    const porteur = await creerCompte("voice-api");
    const { error: contexte } = await porteur.client.rpc("contexte_dialogue", {
      p_attempt_id: "00000000-0000-0000-0000-000000000000",
    });
    assert.ok(contexte, "contexte_dialogue doit être fermée aux comptes");
    const { error: passage } = await porteur.client.rpc("passage_du_scenario", {
      p_project_id: "00000000-0000-0000-0000-000000000000",
      p_params: {},
    });
    assert.ok(passage, "passage_du_scenario doit être fermée aux comptes");
  });
});
