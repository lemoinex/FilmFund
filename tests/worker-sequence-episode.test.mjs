/**
 * SCRIPT (lot SE3b) : la séquence d'un épisode, de la demande au scénario de
 * cet épisode, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni qu'il tient compte de l'épisode et
 * de la saison qu'il reçoit : cela se vérifie en recette, dans le budget
 * autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { executeursScript } from "../worker/src/agents/script.ts";
import { composerContexte } from "../worker/src/agents/weaver.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { PROFIL_SCENARIO } from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";

/** Réponse d'un fournisseur factice : le texte donné, facturé 1 200 jetons en entrée et 350 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1200, jetonsSortie: 350 }],
  };
}

/** Fournisseur factice : rend la réponse donnée, et note ce qu'on lui demande. */
function fournisseurFactice(reponse) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    return reponse;
  };
  return { fournisseur, demandes };
}

const bloc = (message, nom) =>
  new RegExp(`<${nom}>([\\s\\S]*)</${nom}>`).exec(message)?.[1] ?? null;

const SEQUENCE = {
  action: "screenplay",
  projet: { titre: "Les Marées de Kribi", format: "serie", etape: "ecriture" },
  contexte: {},
  personnages: [],
  vision: {},
  documents: [],
  sequence: "Awa retrouve son filet.",
  scenario: { longueur: 24, fin: "EXT. BERGE — AUBE" },
};

describe("SCRIPT : le message d'une séquence d'épisode", () => {
  it("la saison, puis l'épisode, avant son scénario", () => {
    const message = composerContexte(
      {
        ...SEQUENCE,
        episode: { numero: 2, titre: "La dette", resume: "La mareyeuse réclame son dû." },
        saison: [
          { numero: 1, titre: "Le filet", resume: "Awa perd son filet." },
          { numero: 2, titre: "La dette", resume: "  " },
        ],
      },
      "Écris cette séquence du scénario.",
    );
    assert.equal(
      bloc(message, "saison"),
      "\n- Épisode 1 : Le filet\n  Awa perd son filet.\n- Épisode 2 : La dette\n",
    );
    const episode = bloc(message, "episode_a_ecrire");
    assert.match(episode, /^\nÉpisode 2 : La dette\n/);
    assert.match(episode, /La mareyeuse réclame son dû\./);
    assert.match(episode, /celui de cet épisode, et de lui seul\.\n$/);
    assert.ok(
      message.indexOf("<saison>") < message.indexOf("<episode_a_ecrire>") &&
        message.indexOf("<episode_a_ecrire>") < message.indexOf("<scenario_deja_ecrit>") &&
        message.indexOf("<scenario_deja_ecrit>") < message.indexOf("<sequence_a_ecrire>"),
      "ordre des blocs",
    );
    assert.match(message, /Écris cette séquence du scénario\.$/);
  });

  it("sans épisode, le message d'une séquence ne change pas", () => {
    for (const autres of [{}, { episode: null, saison: null }]) {
      const message = composerContexte(
        { ...SEQUENCE, ...autres },
        "Écris cette séquence du scénario.",
      );
      assert.doesNotMatch(message, /<saison>|<episode_a_ecrire>/);
      assert.match(message, /<scenario_deja_ecrit>/);
    }
  });

  it("un autre livrable ne reçoit ni saison ni épisode, même si le contexte en portait", () => {
    const message = composerContexte(
      {
        ...SEQUENCE,
        action: "treatment",
        sequence: undefined,
        scenario: undefined,
        episode: { numero: 1, titre: "Le filet", resume: "" },
        saison: [{ numero: 1, titre: "Le filet", resume: "" }],
      },
      "Écris le traitement de ce projet.",
    );
    assert.doesNotMatch(message, /<saison>|<episode_a_ecrire>|Le filet/);
  });
});

describe("SCRIPT : la séquence d'un épisode, contre la base", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-sequence-episode", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  async function creerSerie(porteur, titre) {
    const projet = await creerProjet(porteur, titre);
    const { error } = await porteur.client
      .from("projects")
      .update({ format: "serie" })
      .eq("id", projet.id);
    assert.ifError(error);
    return projet;
  }

  async function saisirEpisode(porteur, projetId, number, title, summary = "") {
    const { data, error } = await porteur.client
      .from("project_episodes")
      .insert({ project_id: projetId, number, title, summary, created_by: porteur.id })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  }

  async function creerScenario(porteur, projetId, title, content, autres = {}) {
    const { data, error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projetId, type: "scenario", title, content, ...autres })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  }

  const scenarios = async (compte, projetId) => {
    const { data } = await compte.client
      .from("project_documents")
      .select("id, title, content, status, episode_id")
      .eq("project_id", projetId)
      .eq("type", "scenario")
      .order("created_at")
      .order("id");
    return data ?? [];
  };

  /** Engage une demande de séquence ; `episode` absent, la demande n'en désigne aucun. */
  async function demander(porteur, projetId, cle, episode) {
    const tache = await engager(porteur, projetId, "screenplay", cle, {
      sequences: 1,
      sequence: "La suite, sur la berge.",
      ...(episode ? { episode } : {}),
    });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  /** Fait traiter la tâche en attente par SCRIPT, avec un fournisseur factice. */
  async function traiter(reponse) {
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(reponse));
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "worker-sequence-episode-test",
        executeurs: executeursScript(base, fournisseur),
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );
    return demandes;
  }

  const propositionDe = async (compte, tacheId) =>
    (
      await compte.client
        .from("ai_suggestions")
        .select("id, content, state")
        .eq("job_id", tacheId)
        .maybeSingle()
    ).data;

  const accepter = (compte, propositionId) =>
    compte.client.rpc("accepter_proposition", { p_suggestion_id: propositionId, p_content: null });

  it("la séquence part avec son épisode, sa saison et son scénario — pas ceux des autres", async () => {
    const porteur = await creerCompte("sequence-episode-contexte");
    const projet = await creerSerie(porteur, "Les Marées de Kribi");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet", "Awa perd son filet.");
    const second = await saisirEpisode(
      porteur,
      projet.id,
      2,
      "La dette",
      `La mareyeuse réclame son dû. ${"x".repeat(400)}`,
    );
    const duPremier = await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 1",
      "EXT. BERGE — AUBE\n\nAwa tire sa pirogue.",
      { episode_id: premier },
    );
    // Finalisé : sans le lot, il partirait en entier parmi les documents.
    const duSecond = await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 2",
      "INT. MARCHÉ — JOUR\n\nLa mareyeuse compte ses billets.",
      { episode_id: second, status: "finalise" },
    );
    // Le plus récemment modifié de tous : c'est lui que la base visait avant le lot.
    const general = await creerScenario(
      porteur,
      projet.id,
      "Scénario",
      "EXT. ROUTE — NUIT\n\nUn car passe.",
      { status: "finalise" },
    );

    // Écrit en majuscules : la base retrouve l'épisode quelle que soit la casse.
    const tache = await demander(porteur, projet.id, "sequence-episode-1", premier.toUpperCase());
    const sequence = "EXT. BERGE — JOUR\n\nAwa retrouve son filet.";
    const [demande] = await traiter(sequence);

    assert.equal(demande.profil.id, PROFIL_SCENARIO.id);
    const { message } = demande;
    assert.match(bloc(message, "saison"), /- Épisode 1 : Le filet\n {2}Awa perd son filet\./);
    // Le résumé d'un épisode de la saison est coupé à 300 caractères.
    assert.match(bloc(message, "saison"), /- Épisode 2 : La dette\n {2}La mareyeuse réclame/);
    assert.equal(
      /x+/.exec(bloc(message, "saison"))[0].length,
      300 - "La mareyeuse réclame son dû. ".length,
    );
    assert.match(
      bloc(message, "episode_a_ecrire"),
      /Épisode 1 : Le filet\n[\s\S]*Awa perd son filet\./,
    );
    assert.match(bloc(message, "scenario_deja_ecrit"), /Awa tire sa pirogue\./);
    assert.doesNotMatch(message, /La mareyeuse compte ses billets\./);
    // Un scénario sans épisode, finalisé, reste un document du dossier.
    assert.match(bloc(message, "documents"), /Un car passe\./);
    assert.doesNotMatch(bloc(message, "scenario_deja_ecrit"), /Un car passe\./);

    const proposition = await propositionDe(porteur, tache.id);
    const { data: appliquee, error } = await accepter(porteur, proposition.id);
    assert.ifError(error);
    assert.equal(appliquee.replaced_content, "");

    const apres = await scenarios(porteur, projet.id);
    assert.deepEqual(
      apres.map((document) => [document.id, document.content]),
      [
        [duPremier, `EXT. BERGE — AUBE\n\nAwa tire sa pirogue.\n\n${sequence}`],
        [duSecond, "INT. MARCHÉ — JOUR\n\nLa mareyeuse compte ses billets."],
        [general, "EXT. ROUTE — NUIT\n\nUn car passe."],
      ],
    );
    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number")
      .eq("document_id", duPremier);
    assert.equal(versions.length, 2);
  });

  it("un épisode sans scénario : l'acceptation crée le sien, en brouillon, rattaché", async () => {
    const porteur = await creerCompte("sequence-episode-ouverture");
    const projet = await creerSerie(porteur, "La Crue");
    await saisirEpisode(porteur, projet.id, 1, "Le filet");
    const troisieme = await saisirEpisode(porteur, projet.id, 3, "La crue", "Le fleuve monte.");
    const general = await creerScenario(porteur, projet.id, "Scénario", "EXT. ROUTE — NUIT");

    const tache = await demander(porteur, projet.id, "sequence-episode-ouverture-1", troisieme);
    const [demande] = await traiter("EXT. FLEUVE — JOUR\n\nL'eau monte.");
    assert.match(
      bloc(demande.message, "scenario_deja_ecrit"),
      /\(rien encore : cette séquence ouvre le scénario\)/,
    );
    assert.doesNotMatch(bloc(demande.message, "scenario_deja_ecrit"), /EXT\. ROUTE/);

    const proposition = await propositionDe(porteur, tache.id);
    assert.ifError((await accepter(porteur, proposition.id)).error);

    const apres = await scenarios(porteur, projet.id);
    assert.deepEqual(
      apres.map(({ title, content, status, episode_id }) => ({
        title,
        content,
        status,
        episode_id,
      })),
      [
        { title: "Scénario", content: "EXT. ROUTE — NUIT", status: "brouillon", episode_id: null },
        {
          title: "Scénario — épisode 3",
          content: "EXT. FLEUVE — JOUR\n\nL'eau monte.",
          status: "brouillon",
          episode_id: troisieme,
        },
      ],
    );
    assert.equal(apres[0].id, general);
  });

  it("sans épisode, la séquence ne vise jamais le scénario d'un épisode", async () => {
    const porteur = await creerCompte("sequence-sans-episode");
    const projet = await creerSerie(porteur, "Sans épisode");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");
    // Seul scénario du projet, et donc le plus récemment modifié.
    const duPremier = await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 1",
      "EXT. BERGE — AUBE\n\nAwa tire sa pirogue.",
      { episode_id: premier },
    );

    const tache = await demander(porteur, projet.id, "sequence-sans-episode-1");
    const [demande] = await traiter("EXT. ROUTE — AUBE\n\nUn car approche.");
    assert.doesNotMatch(demande.message, /<saison>|<episode_a_ecrire>/);
    assert.match(
      bloc(demande.message, "scenario_deja_ecrit"),
      /\(rien encore : cette séquence ouvre le scénario\)/,
    );

    const proposition = await propositionDe(porteur, tache.id);
    assert.ifError((await accepter(porteur, proposition.id)).error);

    const apres = await scenarios(porteur, projet.id);
    assert.deepEqual(
      apres.map(({ title, content, episode_id }) => ({ title, content, episode_id })),
      [
        {
          title: "Scénario — épisode 1",
          content: "EXT. BERGE — AUBE\n\nAwa tire sa pirogue.",
          episode_id: premier,
        },
        { title: "Scénario", content: "EXT. ROUTE — AUBE\n\nUn car approche.", episode_id: null },
      ],
    );
    assert.equal(apres[0].id, duPremier);

    // Une seconde séquence sans épisode complète ce scénario-là, pas l'autre.
    const suivante = await demander(porteur, projet.id, "sequence-sans-episode-2");
    const [seconde] = await traiter("INT. CAR — AUBE\n\nAwa dort.");
    assert.match(bloc(seconde.message, "scenario_deja_ecrit"), /Un car approche\./);
    assert.ifError((await accepter(porteur, (await propositionDe(porteur, suivante.id)).id)).error);
    const enfin = await scenarios(porteur, projet.id);
    assert.equal(enfin.length, 2);
    assert.equal(enfin[0].content, "EXT. BERGE — AUBE\n\nAwa tire sa pirogue.");
    assert.equal(
      enfin[1].content,
      "EXT. ROUTE — AUBE\n\nUn car approche.\n\nINT. CAR — AUBE\n\nAwa dort.",
    );
  });

  it("épisode retiré après la proposition : l'acceptation est refusée, rien n'est écrit", async () => {
    const porteur = await creerCompte("sequence-episode-retire");
    const projet = await creerSerie(porteur, "Épisode retiré");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");
    const duPremier = await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 1",
      "EXT. BERGE",
      {
        episode_id: premier,
      },
    );

    const tache = await demander(porteur, projet.id, "sequence-episode-retire-1", premier);
    await traiter("EXT. BERGE — JOUR\n\nAwa attend.");
    const proposition = await propositionDe(porteur, tache.id);

    // Retirer l'épisode détache son scénario, qui devient un scénario sans épisode.
    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("id", premier);
    assert.ifError(retrait);

    const { error } = await accepter(porteur, proposition.id);
    assert.equal(error?.code, "SE004");

    const apres = await scenarios(porteur, projet.id);
    assert.deepEqual(
      apres.map((document) => [document.id, document.content, document.episode_id]),
      [[duPremier, "EXT. BERGE", null]],
    );
    // La proposition attend toujours : elle peut être écartée, ou reportée à la main.
    assert.equal((await propositionDe(porteur, tache.id)).state, "proposed");
  });

  it("épisode retiré avant l'appel : rien ne part chez le fournisseur", async () => {
    const porteur = await creerCompte("sequence-episode-retire-avant");
    const projet = await creerSerie(porteur, "Retiré avant l'appel");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");

    const tache = await demander(porteur, projet.id, "sequence-episode-retire-avant-1", premier);
    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("id", premier);
    assert.ifError(retrait);

    const demandes = await traiter("EXT. BERGE — JOUR");
    assert.equal(demandes.length, 0);
    assert.equal(await propositionDe(porteur, tache.id), null);
    // Un échec connu, sans appel : l'essai est conclu, et la tâche suit le sort
    // de tout échec — elle n'est jamais réussie.
    const { data: etat } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.ok(["queued", "failed"].includes(etat.state), etat.state);
    assert.deepEqual(await scenarios(porteur, projet.id), []);
  });

  it("le devis refuse un épisode qui n'est pas de ce projet, avant toute réservation", async () => {
    const porteur = await creerCompte("sequence-episode-devis");
    const projet = await creerSerie(porteur, "Devis");
    const ailleurs = await creerSerie(porteur, "Autre série");
    const etranger = await saisirEpisode(porteur, ailleurs.id, 1, "Ailleurs");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");

    const devis = (episode) =>
      porteur.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "screenplay",
        p_params: { sequences: 1, sequence: "La suite.", episode },
      });

    for (const refuse of [
      etranger,
      "00000000-0000-0000-0000-00000000dead",
      "le-premier",
      "",
      1,
      null,
      [premier],
      { id: premier },
    ]) {
      const { error } = await devis(refuse);
      assert.equal(error?.code, "22023", JSON.stringify(refuse));
      assert.match(error.message, /Désignez un épisode de ce projet\./);
    }
    const { count } = await porteur.client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projet.id);
    assert.equal(count, 0);

    assert.ifError((await devis(premier)).error);
  });
});
