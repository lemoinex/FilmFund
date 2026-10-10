/**
 * FRAME (lot SE5) : le découpage de la scène d'un épisode, de la tâche
 * réclamée au message envoyé, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent tient
 * compte de l'épisode qu'il reçoit : cela se vérifie en recette, dans le
 * budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { composerContexteDecoupage, executeursFrame } from "../worker/src/agents/frame.ts";
import { lireContexteDecoupage } from "../worker/src/base.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { PROFIL_DECOUPAGE } from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  ouvrirBaseDuWorker,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";
const PLANS = JSON.stringify({
  lines: [{ shot: "plan_large", angle: "normal", movement: "fixe", description: "La berge." }],
});

const bloc = (message, nom) =>
  new RegExp(`<${nom}>([\\s\\S]*)</${nom}>`).exec(message)?.[1] ?? null;
const balises = (message) => [...message.matchAll(/^<([a-z_]+)>$/gm)].map((m) => m[1]);

const CONTEXTE = {
  action: "shot_list",
  projet: {
    titre: "Les Marées de Kribi",
    format: "serie",
    etape: "ecriture",
    genre: null,
    pays: [],
    langues: "",
    duree: 26,
  },
  contexte: {
    pitch: "Une pêcheuse défie le fleuve.",
    synopsis_court: "",
    synopsis: "",
    theme: "",
    enjeux: "",
  },
  vision: { artistique: "", objectifs: "", public: "" },
  scene: {
    titre: "Le départ",
    decor: "ext",
    lieu: "Berge",
    moment: "aube",
    cadrage: null,
    description: "",
  },
  avant: [],
  plans: [],
  scenario: "EXT. BERGE — AUBE\nAwa pousse sa pirogue.",
};

describe("FRAME : le message de la scène d'un épisode", () => {
  it("l'épisode est annoncé avant son scénario, avec ce qu'il borne", () => {
    const message = composerContexteDecoupage(
      {
        ...CONTEXTE,
        episode: { numero: 2, titre: "La dette", resume: "La mareyeuse réclame son dû." },
      },
      PROFIL_DECOUPAGE.objectif,
    );
    assert.deepEqual(balises(message), [
      "projet",
      "contexte",
      "vision",
      "episode",
      "scenario",
      "scenes_precedentes",
      "scene_a_decouper",
    ]);
    const episode = bloc(message, "episode");
    assert.match(episode, /^\nÉpisode 2 : La dette\nRésumé : La mareyeuse réclame son dû\.\n/);
    assert.match(episode, /sont ceux de cet épisode, et de lui seul\.\n$/);
    assert.match(bloc(message, "scenario"), /Awa pousse sa pirogue\./);
    assert.ok(message.endsWith(PROFIL_DECOUPAGE.objectif));
  });

  it("un épisode sans scénario : le message le dit, sans laisser croire que le projet n'en a aucun", () => {
    const message = composerContexteDecoupage(
      { ...CONTEXTE, scenario: " ", episode: { numero: 3, titre: "La crue", resume: "" } },
      PROFIL_DECOUPAGE.objectif,
    );
    assert.equal(
      bloc(message, "scenario"),
      "\n(cet épisode n'a pas encore de scénario enregistré)\n",
    );
    assert.doesNotMatch(message, /\(aucun scénario enregistré\)/);
  });

  it("sans épisode, le message garde exactement sa forme", () => {
    for (const autres of [{}, { episode: null }, { episode: undefined }]) {
      const message = composerContexteDecoupage(
        { ...CONTEXTE, ...autres },
        PROFIL_DECOUPAGE.objectif,
      );
      assert.deepEqual(balises(message), [
        "projet",
        "contexte",
        "vision",
        "scenario",
        "scenes_precedentes",
        "scene_a_decouper",
      ]);
      assert.doesNotMatch(message, /pisode/);
    }
    const sans = composerContexteDecoupage(
      { ...CONTEXTE, scenario: "" },
      PROFIL_DECOUPAGE.objectif,
    );
    assert.equal(bloc(sans, "scenario"), "\n(aucun scénario enregistré)\n");
    // Le profil ne change pas : le contexte dit de lui-même de quel épisode il s'agit.
    assert.equal(PROFIL_DECOUPAGE.id, "frame.decoupage@1");
  });
});

describe("FRAME : la scène d'un épisode, contre la base", () => {
  let base;

  before(async () => {
    base = await ouvrirBaseDuWorker();
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

  async function creerScenario(porteur, projetId, title, content, episode_id = null) {
    const { error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projetId, type: "scenario", title, content, episode_id });
    assert.ifError(error);
  }

  const creerScene = (porteur, projetId, position, title, episode_id = null) =>
    porteur.client
      .from("storyboard_scenes")
      .insert({
        project_id: projetId,
        position,
        title,
        setting: "ext",
        location: "Berge",
        time_of_day: "aube",
        created_by: porteur.id,
        episode_id,
      })
      .select("id")
      .single();

  /** Engage le découpage d'une scène et le fait traiter ; rend le contexte remis et le message envoyé. */
  async function decouper(porteur, projet, sceneId, cle) {
    const tache = await engager(porteur, projet.id, "shot_list", cle, { scene: sceneId });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    const demandes = [];
    // FOURNISSEUR FACTICE : un plan, écrit par le test.
    const fournisseur = async (demande) => {
      demandes.push(demande);
      return {
        texte: PLANS,
        arret: "fin",
        modeleServi: OPUS,
        repli: false,
        usages: [{ modele: OPUS, jetonsEntree: 1500, jetonsSortie: 600 }],
      };
    };
    let remis;
    const frame = executeursFrame(base, fournisseur).shot_list;
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "worker-frame-episode-test",
        executeurs: {
          shot_list: async (travail, signal) => {
            remis = await lireContexteDecoupage(base, travail.attemptId);
            return frame(travail, signal);
          },
        },
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );
    return { remis, message: demandes[0]?.message ?? "" };
  }

  it("la scène d'un épisode lit son scénario, et ses seules scènes précédentes", async () => {
    const porteur = await creerCompte("frame-episode");
    const projet = await creerSerie(porteur, "Les Marées de Kribi");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet", "Awa perd son filet.");
    const second = await saisirEpisode(
      porteur,
      projet.id,
      2,
      "La dette",
      "La mareyeuse réclame son dû.",
    );
    await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 1",
      "EXT. BERGE — AUBE\nAwa tire sa pirogue.",
      premier,
    );
    await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 2",
      "INT. MARCHÉ — JOUR\nLa mareyeuse compte.",
      second,
    );
    // Le plus récemment modifié de tous : celui que FRAME lisait avant le lot.
    await creerScenario(porteur, projet.id, "Scénario général", "EXT. ROUTE — NUIT\nUn car passe.");

    const { data: s1 } = await creerScene(porteur, projet.id, 1, "Ouverture du premier", premier);
    await creerScene(porteur, projet.id, 2, "Scène du second", second);
    await creerScene(porteur, projet.id, 3, "Scène sans épisode");
    const { data: s4, error } = await creerScene(
      porteur,
      projet.id,
      4,
      "Suite du premier",
      premier,
    );
    assert.ifError(error);

    const { remis, message } = await decouper(porteur, projet, s4.id, "frame-episode-1");
    assert.deepEqual(remis.episode, {
      numero: 1,
      titre: "Le filet",
      resume: "Awa perd son filet.",
    });
    assert.match(remis.scenario, /Awa tire sa pirogue\./);
    assert.deepEqual(
      remis.avant.map((scene) => scene.titre),
      ["Ouverture du premier"],
    );

    assert.match(bloc(message, "episode"), /Épisode 1 : Le filet\nRésumé : Awa perd son filet\./);
    assert.match(bloc(message, "scenario"), /Awa tire sa pirogue\./);
    assert.doesNotMatch(message, /La mareyeuse compte\.|Un car passe\./);
    assert.match(bloc(message, "scenes_precedentes"), /Ouverture du premier/);
    assert.doesNotMatch(bloc(message, "scenes_precedentes"), /Scène du second|Scène sans épisode/);
    assert.ok(s1.id);
  });

  it("un épisode sans scénario : FRAME n'en reçoit aucun, pas celui d'un autre", async () => {
    const porteur = await creerCompte("frame-episode-sans-scenario");
    const projet = await creerSerie(porteur, "La Crue");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");
    const troisieme = await saisirEpisode(porteur, projet.id, 3, "La crue", "Le fleuve monte.");
    await creerScenario(porteur, projet.id, "Scénario — épisode 1", "EXT. BERGE — AUBE", premier);
    await creerScenario(porteur, projet.id, "Scénario général", "EXT. ROUTE — NUIT");
    const { data: scene, error } = await creerScene(
      porteur,
      projet.id,
      1,
      "La montée des eaux",
      troisieme,
    );
    assert.ifError(error);

    const { remis, message } = await decouper(porteur, projet, scene.id, "frame-episode-sans-1");
    assert.equal(remis.scenario, "");
    assert.equal(remis.episode.numero, 3);
    assert.equal(
      bloc(message, "scenario"),
      "\n(cet épisode n'a pas encore de scénario enregistré)\n",
    );
    assert.doesNotMatch(message, /EXT\. BERGE|EXT\. ROUTE/);
  });

  it("une scène sans épisode ne lit que le scénario sans épisode", async () => {
    const porteur = await creerCompte("frame-sans-episode");
    const projet = await creerSerie(porteur, "Sans épisode");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");
    await creerScenario(porteur, projet.id, "Scénario général", "EXT. ROUTE — NUIT\nUn car passe.");
    // Modifié en dernier : sans le lot, c'est lui que FRAME aurait lu.
    await creerScenario(
      porteur,
      projet.id,
      "Scénario — épisode 1",
      "EXT. BERGE — AUBE\nAwa tire sa pirogue.",
      premier,
    );
    await creerScene(porteur, projet.id, 1, "Scène de l'épisode", premier);
    const { data: scene, error } = await creerScene(porteur, projet.id, 2, "Sur la route");
    assert.ifError(error);

    const { remis, message } = await decouper(porteur, projet, scene.id, "frame-sans-episode-1");
    assert.equal("episode" in remis, false);
    assert.match(remis.scenario, /Un car passe\./);
    assert.doesNotMatch(message, /Awa tire sa pirogue\.|<episode>/);
    // Sans épisode, les scènes précédentes sont celles du storyboard, comme avant.
    assert.deepEqual(
      remis.avant.map((s) => s.titre),
      ["Scène de l'épisode"],
    );
  });

  it("un film : le contexte garde exactement ses clés, et son scénario", async () => {
    const porteur = await creerCompte("frame-film");
    const projet = await creerProjet(porteur, "Un film");
    await creerScenario(porteur, projet.id, "Scénario", "EXT. FLEUVE — JOUR\nLe bac accoste.");
    await creerScene(porteur, projet.id, 1, "La veille");
    const { data: scene, error } = await creerScene(porteur, projet.id, 2, "Le départ");
    assert.ifError(error);

    const { remis, message } = await decouper(porteur, projet, scene.id, "frame-film-1");
    assert.deepEqual(Object.keys(remis).sort(), [
      "action",
      "avant",
      "contexte",
      "plans",
      "projet",
      "scenario",
      "scene",
      "vision",
    ]);
    assert.match(remis.scenario, /Le bac accoste\./);
    assert.deepEqual(
      remis.avant.map((s) => s.titre),
      ["La veille"],
    );
    assert.doesNotMatch(message, /pisode/);
  });

  it("épisode retiré : la scène reste, sans épisode, et relit le scénario sans épisode", async () => {
    const porteur = await creerCompte("frame-episode-retire");
    const projet = await creerSerie(porteur, "Épisode retiré");
    const premier = await saisirEpisode(porteur, projet.id, 1, "Le filet");
    await creerScenario(porteur, projet.id, "Scénario général", "EXT. ROUTE — NUIT\nUn car passe.");
    const { data: scene, error } = await creerScene(porteur, projet.id, 1, "Sur la berge", premier);
    assert.ifError(error);

    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("id", premier);
    assert.ifError(retrait);
    const { data: apres } = await porteur.client
      .from("storyboard_scenes")
      .select("title, episode_id")
      .eq("id", scene.id)
      .single();
    assert.deepEqual(apres, { title: "Sur la berge", episode_id: null });

    const { remis } = await decouper(porteur, projet, scene.id, "frame-episode-retire-1");
    assert.equal("episode" in remis, false);
    assert.match(remis.scenario, /Un car passe\./);
  });
});
