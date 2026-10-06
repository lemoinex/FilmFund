/**
 * FRAME (lot J3c-2a) : le découpage proposé d'une scène, de la tâche réclamée
 * au plan entré dans le découpage, contre la base locale et sous le rôle du
 * worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les plans qu'il
 * propose, ni ce que coûte un scénario entier en entrée : cela se vérifie en
 * recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContexteDecoupage,
  executeursFrame,
  lirePlans,
} from "../worker/src/agents/frame.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  PROFIL_DECOUPAGE,
  PROFILS_FIELD,
  PROFILS_FRAME,
  PROFILS_IA,
} from "../worker/src/ia/profils.ts";
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

/** Réponse d'un fournisseur factice : le texte donné, facturé 1 500 jetons en entrée et 600 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1500, jetonsSortie: 600 }],
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

const PLANS = [
  {
    shot: "plan_large",
    focal_mm: 24,
    angle: "normal",
    movement: "fixe",
    description: "La berge au petit matin, les pirogues alignées.",
    duration_seconds: 8,
  },
  {
    shot: "gros_plan",
    angle: "contre_plongee",
    movement: "travelling",
    description: "Le visage d'Awa, tourné vers le fleuve.",
  },
  {
    shot: "insert",
    focal_mm: null,
    angle: "plongee",
    movement: "fixe",
    description: "",
    duration_seconds: null,
  },
];

const enJson = (lines) => JSON.stringify({ lines });

const CONTEXTE = {
  action: "shot_list",
  projet: {
    titre: "Le Fleuve immobile",
    format: "long_metrage",
    etape: "ecriture",
    genre: "drame",
    pays: ["CM"],
    langues: "Français",
    duree: 90,
  },
  contexte: {
    pitch: "Une pêcheuse défie le fleuve.",
    synopsis_court: "",
    synopsis: "",
    theme: "",
    enjeux: "",
  },
  vision: { artistique: "Caméra patiente, lumière naturelle.", objectifs: "", public: "" },
  scene: {
    titre: "Le départ",
    decor: "ext",
    lieu: "Berge",
    moment: "aube",
    cadrage: "plan_large",
    description: "Awa pousse sa pirogue à l'eau.",
  },
  avant: [{ titre: "La veille", decor: "int", lieu: "Case", moment: "nuit" }],
  plans: [
    {
      cadrage: "plan_moyen",
      focale: 35,
      angle: "normal",
      mouvement: "fixe",
      description: "Awa range ses filets.",
      duree: 5,
    },
  ],
  scenario: "EXT. BERGE — AUBE\nAwa pousse sa pirogue.\n\nBUDGET SECRET : ne figure pas ici.",
};

describe("FRAME : lecture des plans", () => {
  it("rend les plans ; focale et durée absentes ou nulles restent nulles", () => {
    const plans = lirePlans(enJson(PLANS), 20);
    assert.equal(plans.length, 3);
    assert.deepEqual(plans[0], PLANS[0]);
    assert.deepEqual(plans[1], { ...PLANS[1], focal_mm: null, duration_seconds: null });
    assert.deepEqual(plans[2], PLANS[2]);
  });

  it("replie une description sur une seule ligne", () => {
    const [plan] = lirePlans(
      enJson([{ ...PLANS[0], description: "  La berge,\n  au matin. " }]),
      20,
    );
    assert.equal(plan.description, "La berge, au matin.");
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    for (const [raison, texte] of [
      ["pas du JSON", "Voici les plans : …"],
      ["pas de liste", JSON.stringify({ lines: "aucune" })],
      ["liste vide", enJson([])],
      ["trop de plans", enJson(Array.from({ length: 21 }, () => PLANS[0]))],
      ["cadrage inconnu", enJson([PLANS[0], { ...PLANS[1], shot: "plan_drone" }])],
      ["angle inconnu", enJson([{ ...PLANS[0], angle: "de_biais" }])],
      ["mouvement inconnu", enJson([{ ...PLANS[0], movement: "drone" }])],
      ["focale nulle", enJson([{ ...PLANS[0], focal_mm: 0 }])],
      ["focale décimale", enJson([{ ...PLANS[0], focal_mm: 35.5 }])],
      ["focale en texte", enJson([{ ...PLANS[0], focal_mm: "35" }])],
      ["focale trop longue", enJson([{ ...PLANS[0], focal_mm: 2001 }])],
      ["durée trop longue", enJson([{ ...PLANS[0], duration_seconds: 3601 }])],
      ["description absente", enJson([{ ...PLANS[0], description: undefined }])],
      ["description trop longue", enJson([{ ...PLANS[0], description: "a".repeat(501) }])],
      ["plan qui n'est pas un objet", enJson([PLANS[0], "un plan"])],
    ]) {
      assert.equal(lirePlans(texte, 20), null, raison);
    }
  });

  it("le message porte le scénario et le concept, la scène après eux, l'objectif en dernier", () => {
    const message = composerContexteDecoupage(CONTEXTE, PROFIL_DECOUPAGE.objectif);

    assert.match(message, /<scenario>\nEXT\. BERGE — AUBE\nAwa pousse sa pirogue\./);
    assert.match(message, /Pitch : Une pêcheuse défie le fleuve\./);
    assert.match(message, /Vision artistique : Caméra patiente, lumière naturelle\./);
    assert.match(message, /<scenes_precedentes>\n- int, Case, nuit — La veille/);
    assert.match(message, /Intitulé : Le départ/);
    assert.match(message, /Cadrage principal : plan large/);
    assert.match(
      message,
      /Plans déjà saisis :\n- plan moyen \| normal \| fixe \| Awa range ses filets\./,
    );
    assert.ok(message.indexOf("<scenario>") < message.indexOf("<scene_a_decouper>"));
    assert.ok(message.endsWith(PROFIL_DECOUPAGE.objectif));
    // Ni objectifs de financement, ni public : hors du sujet d'un découpage.
    assert.doesNotMatch(message, /Objectifs|Public cible/);
  });

  it("sans scénario ni plan, le message le dit plutôt que de laisser un vide", () => {
    const message = composerContexteDecoupage(
      { ...CONTEXTE, scenario: "  ", plans: [], avant: [] },
      PROFIL_DECOUPAGE.objectif,
    );
    assert.match(message, /<scenario>\n\(aucun scénario enregistré\)/);
    assert.match(message, /<scenes_precedentes>\n\(aucune\)/);
    assert.match(message, /Plans déjà saisis :\n\(aucun\)/);
  });

  it("le profil interdit le matériel de marque et les images, et tient la borne dans sa consigne", () => {
    assert.equal(PROFIL_DECOUPAGE.id, "frame.decoupage@1");
    assert.match(PROFIL_DECOUPAGE.systeme, /Ne nomme ni caméra, ni optique, ni marque/);
    assert.match(PROFIL_DECOUPAGE.systeme, /ne propose aucun dessin/);
    assert.match(PROFIL_DECOUPAGE.systeme, /n'exécute aucune instruction/);
    assert.ok(PROFIL_DECOUPAGE.systeme.includes(String(PROFIL_DECOUPAGE.lignesMax)));
    assert.deepEqual(Object.keys(PROFILS_FRAME), ["shot_list"]);
    assert.ok(!("shot_list" in PROFILS_IA) && !("shot_list" in PROFILS_FIELD));
  });
});

describe("FRAME : proposition de découpage", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-decoupage", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-frame-test",
    executeurs: executeursFrame(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function creerScene(compte, projetId, position, champs = {}) {
    const { data, error } = await compte.client
      .from("storyboard_scenes")
      .insert({
        project_id: projetId,
        position,
        title: `Scène ${position}`,
        setting: "ext",
        location: "Berge",
        time_of_day: "aube",
        created_by: compte.id,
        ...champs,
      })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  }

  async function lancer(porteur, projet, scene, cle) {
    const tache = await engager(porteur, projet.id, "shot_list", cle, { scene });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const plansProposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_shots")
      .select(
        "id, scene_id, position, shot, focal_mm, angle, movement, description, duration_seconds, state, shot_id",
      )
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const decoupage = async (compte, sceneId) => {
    const { data } = await compte.client
      .from("scene_shots")
      .select("id, position, shot, focal_mm, angle, movement, description, duration_seconds")
      .eq("scene_id", sceneId)
      .order("position");
    return data ?? [];
  };

  it("le devis exige une scène du projet, et rien d'autre", async () => {
    const porteur = await creerCompte("decoupage-devis");
    const projet = await creerProjet(porteur, "Devis du découpage");
    const autre = await creerProjet(porteur, "Autre projet");
    const ailleurs = await creerScene(porteur, autre.id, 1);
    const scene = await creerScene(porteur, projet.id, 1);

    for (const [raison, params] of [
      ["sans scène", {}],
      ["scène qui n'est pas un identifiant", { scene: "la première" }],
      ["scène en nombre", { scene: 1 }],
      ["scène inconnue", { scene: "00000000-0000-0000-0000-000000000000" }],
      ["scène d'un autre projet", { scene: ailleurs }],
    ]) {
      const { error } = await porteur.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "shot_list",
        p_params: params,
      });
      assert.equal(error?.code, "22023", raison);
    }

    const { data: devis, error } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "shot_list",
      p_params: { scene },
    });
    assert.ifError(error);
    assert.equal(devis[0].quantity, 4);
    assert.equal(devis[0].unit, "text");
  });

  it("du devis aux plans : dépôt, lecture par l'équipe, acceptation plan par plan", async () => {
    const porteur = await creerCompte("decoupage-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const editeur = await creerCompte("decoupage-chemin-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    const lecteur = await creerCompte("decoupage-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("decoupage-chemin-etranger");

    await creerScene(porteur, projet.id, 1, { title: "La veille" });
    const scene = await creerScene(porteur, projet.id, 2, {
      title: "Le départ",
      shot: "plan_large",
      description: "Awa pousse sa pirogue à l'eau.",
    });
    await creerScene(porteur, projet.id, 3, { title: "Le retour" });

    // Un plan déjà saisi, un budget et un scénario : seul le budget ne part pas.
    const { error: saisi } = await porteur.client.from("scene_shots").insert({
      project_id: projet.id,
      scene_id: scene,
      position: 1,
      shot: "plan_moyen",
      description: "Awa range ses filets.",
      created_by: porteur.id,
    });
    assert.ifError(saisi);
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    await porteur.client.from("project_documents").insert([
      {
        project_id: projet.id,
        type: "scenario",
        title: "Scénario",
        content: "EXT. BERGE — AUBE\nAwa pousse sa pirogue à l'eau, sans un mot.",
        created_by: porteur.id,
      },
      {
        project_id: projet.id,
        type: "lettre",
        title: "Lettre au fonds",
        content: "LETTRE CONFIDENTIELLE",
        created_by: porteur.id,
      },
    ]);

    const tache = await lancer(porteur, projet, scene, "decoupage-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil du découpage, son schéma, le scénario et la scène — elle seule.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_DECOUPAGE.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /Awa pousse sa pirogue à l'eau, sans un mot\./);
    assert.match(demandes[0].message, /Intitulé : Le départ/);
    assert.match(demandes[0].message, /<scenes_precedentes>\n- ext, Berge, aube — La veille/);
    assert.match(demandes[0].message, /- plan moyen \| normal \| fixe \| Awa range ses filets\./);
    assert.doesNotMatch(demandes[0].message, /Le retour/);
    assert.doesNotMatch(demandes[0].message, /XAF|Devise|LETTRE CONFIDENTIELLE/);

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "3 plans proposés par l'assistant pour une scène.");
    assert.equal(proposition.profile, PROFIL_DECOUPAGE.id);
    assert.equal(proposition.state, "proposed");

    // Le storyboard se lit de toute l'équipe : ses propositions aussi. Pas d'un étranger.
    const proposes = await plansProposes(porteur, projet.id);
    assert.deepEqual(
      proposes.map(({ scene_id, shot, focal_mm, angle, movement, state }) => ({
        scene_id,
        shot,
        focal_mm,
        angle,
        movement,
        state,
      })),
      PLANS.map((plan) => ({
        scene_id: scene,
        shot: plan.shot,
        focal_mm: plan.focal_mm ?? null,
        angle: plan.angle,
        movement: plan.movement,
        state: "proposed",
      })),
    );
    assert.equal((await plansProposes(lecteur, projet.id)).length, 3);
    assert.equal((await plansProposes(etranger, projet.id)).length, 0);

    // Rien n'entre dans le découpage tant que rien n'est accepté.
    assert.equal((await decoupage(porteur, scene)).length, 1);

    // Décider reste à qui écrit le storyboard : ni lecteur, ni étranger.
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_plan_propose", {
        p_line_id: proposes[0].id,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_plan_propose", {
        p_line_id: proposes[0].id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_shots")
      .update({ state: "accepted" })
      .eq("id", proposes[0].id);
    assert.ok(direct, "une mise à jour directe doit être refusée");

    // Une correction hors bornes, ou incomplète : refusée, rien n'entre.
    for (const corrige of [
      { ...PLANS[0], shot: "plan_drone" },
      { ...PLANS[0], focal_mm: 0 },
      { ...PLANS[0], duration_seconds: 2.5 },
      { ...PLANS[0], description: "a".repeat(501) },
      { shot: "gros_plan" },
      "un plan",
    ]) {
      const { error } = await porteur.client.rpc("accepter_plan_propose", {
        p_line_id: proposes[0].id,
        p_corrige: corrige,
      });
      assert.equal(error?.code, "22023", JSON.stringify(corrige).slice(0, 50));
    }
    assert.equal((await decoupage(porteur, scene)).length, 1);

    // Premier plan : accepté tel quel, par l'éditeur. Il prend la suite du plan saisi.
    const { data: accepte, error: e1 } = await editeur.client.rpc("accepter_plan_propose", {
      p_line_id: proposes[0].id,
    });
    assert.ifError(e1);
    assert.equal(accepte.state, "accepted");

    // Deuxième : corrigé. Une focale et une durée nulles se disent par null.
    const { error: e2 } = await porteur.client.rpc("accepter_plan_propose", {
      p_line_id: proposes[1].id,
      p_corrige: {
        shot: "plan_rapproche",
        focal_mm: 50,
        angle: "normal",
        movement: "epaule",
        description: "Awa, de profil.",
        duration_seconds: null,
      },
    });
    assert.ifError(e2);

    // Accepter deux fois ne crée pas deux plans.
    const { error: e1bis } = await porteur.client.rpc("accepter_plan_propose", {
      p_line_id: proposes[0].id,
    });
    assert.ifError(e1bis);

    // La proposition reste ouverte tant qu'un plan attend.
    const { data: ouverte } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(ouverte.state, "proposed");

    // Troisième : écarté. Un plan écarté ne s'accepte plus.
    const { error: e3 } = await porteur.client.rpc("ecarter_plan_propose", {
      p_line_id: proposes[2].id,
    });
    assert.ifError(e3);
    const { error: tard } = await porteur.client.rpc("accepter_plan_propose", {
      p_line_id: proposes[2].id,
    });
    assert.equal(tard?.code, "PR001");

    // Le découpage : le plan saisi, puis les deux acceptés, à la suite.
    assert.deepEqual(
      (await decoupage(lecteur, scene)).map((plan) =>
        Object.fromEntries(Object.entries(plan).filter(([cle]) => cle !== "id")),
      ),
      [
        {
          position: 1,
          shot: "plan_moyen",
          focal_mm: null,
          angle: "normal",
          movement: "fixe",
          description: "Awa range ses filets.",
          duration_seconds: null,
        },
        {
          position: 2,
          shot: "plan_large",
          focal_mm: 24,
          angle: "normal",
          movement: "fixe",
          description: "La berge au petit matin, les pirogues alignées.",
          duration_seconds: 8,
        },
        {
          position: 3,
          shot: "plan_rapproche",
          focal_mm: 50,
          angle: "normal",
          movement: "epaule",
          description: "Awa, de profil.",
          duration_seconds: null,
        },
      ],
    );

    // Ce que l'agent a proposé n'a pas changé, même pour le plan corrigé.
    const apres = await plansProposes(porteur, projet.id);
    assert.deepEqual(
      apres.map((plan) => plan.state),
      ["accepted", "accepted", "dismissed"],
    );
    assert.equal(apres[1].shot, "gros_plan");
    assert.ok(apres[0].shot_id && apres[1].shot_id);
    assert.equal(apres[2].shot_id, null);

    // Plus rien n'attend : la proposition est close, appliquée.
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Le cadrage principal de la scène n'a pas été touché.
    const { data: intacte } = await porteur.client
      .from("storyboard_scenes")
      .select("shot, description")
      .eq("id", scene)
      .single();
    assert.deepEqual(intacte, {
      shot: "plan_large",
      description: "Awa pousse sa pirogue à l'eau.",
    });

    // Supprimer un plan accepté détache la proposition, sans la rouvrir.
    await porteur.client.from("scene_shots").delete().eq("id", apres[0].shot_id);
    const detache = (await plansProposes(porteur, projet.id))[0];
    assert.equal(detache.state, "accepted");
    assert.equal(detache.shot_id, null);

    // La tâche a réussi au premier essai.
    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, attempts")
      .eq("id", tache.id)
      .single();
    assert.deepEqual(finale, { state: "succeeded", attempts: 1 });
  });

  it("un administrateur hors équipe accepte un plan, et le journal le retient", async () => {
    const porteur = await creerCompte("decoupage-admin-porteur");
    const projet = await creerProjet(porteur, "Vu par l'administration");
    const scene = await creerScene(porteur, projet.id, 1);
    await lancer(porteur, projet, scene, "decoupage-admin-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const proposes = await plansProposes(administrateur, projet.id);
    assert.equal(proposes.length, 3);
    const { error } = await administrateur.client.rpc("accepter_plan_propose", {
      p_line_id: proposes[0].id,
    });
    assert.ifError(error);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", projet.id)
      .eq("action", "intervention_contenu");
    assert.ok(
      journal.some((e) => e.details.table === "scene_shots" && e.details.operation === "insert"),
      "l'ajout du plan par l'administrateur doit être journalisé",
    );
  });

  it("écarter la proposition d'un bloc écarte les plans restants", async () => {
    const porteur = await creerCompte("decoupage-bloc");
    const projet = await creerProjet(porteur, "D'un bloc");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "decoupage-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .single();
    const { error } = await porteur.client.rpc("ecarter_proposition", {
      p_suggestion_id: proposition.id,
    });
    assert.ifError(error);

    assert.deepEqual(
      (await plansProposes(porteur, projet.id)).map((plan) => plan.state),
      ["dismissed", "dismissed", "dismissed"],
    );
    assert.equal((await decoupage(porteur, scene)).length, 0);
  });

  it("une scène supprimée avant l'appel : la tâche échoue, rien n'est envoyé", async () => {
    const porteur = await creerCompte("decoupage-scene-partie");
    const projet = await creerProjet(porteur, "Scène partie");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "decoupage-scene-partie-cle");
    await porteur.client.from("storyboard_scenes").delete().eq("id", scene);

    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    assert.equal(demandes.length, 0, "aucun appel pour une scène qui n'existe plus");
    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.notEqual(finale.state, "succeeded");
    assert.equal((await plansProposes(porteur, projet.id)).length, 0);
  });

  it("ce que l'agent a proposé ne change pas ; en mode privé, seul un administrateur décide", async () => {
    const porteur = await creerCompte("decoupage-garde-fous");
    const projet = await creerProjet(porteur, "Garde-fous");
    const scene = await creerScene(porteur, projet.id, 1);
    await lancer(porteur, projet, scene, "decoupage-garde-fous-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const proposes = await plansProposes(porteur, projet.id);

    // Même l'exploitant, en SQL direct, ne réécrit ni ne supprime un plan proposé.
    for (const requete of [
      `update public.ai_suggestion_shots set description = 'Réécrit' where id = '${proposes[0].id}';`,
      `update public.ai_suggestion_shots set focal_mm = 35 where id = '${proposes[0].id}';`,
      `update public.ai_suggestion_shots set scene_id = gen_random_uuid() where id = '${proposes[0].id}';`,
      `delete from public.ai_suggestion_shots where id = '${proposes[0].id}';`,
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete);
      assert.match(resultat.erreurs, /ne change pas|ne se supprime pas/, requete);
    }
    assert.equal((await plansProposes(porteur, projet.id))[0].description, PLANS[0].description);

    const modePrive = (actif) =>
      sql(`update public.app_settings set private_admin_only = ${actif} where id;`);
    try {
      assert.equal((await modePrive(true)).code, 0);

      // Le porteur ne lit ni ne décide plus ; l'administrateur, si.
      assert.equal((await plansProposes(porteur, projet.id)).length, 0);
      for (const fonction of ["accepter_plan_propose", "ecarter_plan_propose"]) {
        const { error } = await porteur.client.rpc(fonction, { p_line_id: proposes[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
      assert.equal((await plansProposes(administrateur, projet.id)).length, 3);
      const { error } = await administrateur.client.rpc("accepter_plan_propose", {
        p_line_id: proposes[0].id,
      });
      assert.ifError(error);
    } finally {
      assert.equal((await modePrive(false)).code, 0);
    }

    assert.equal((await decoupage(porteur, scene)).length, 1);
  });

  it("les plans proposés partent avec leur scène", async () => {
    const porteur = await creerCompte("decoupage-cascade");
    const projet = await creerProjet(porteur, "Cascade");
    const scene = await creerScene(porteur, projet.id, 1);
    await lancer(porteur, projet, scene, "decoupage-cascade-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PLANS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal((await plansProposes(porteur, projet.id)).length, 3);

    const { error } = await porteur.client.from("storyboard_scenes").delete().eq("id", scene);
    assert.ifError(error);
    assert.equal((await plansProposes(porteur, projet.id)).length, 0);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("decoupage-hors-bornes");
    const projet = await creerProjet(porteur, "Hors bornes");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "decoupage-hors-bornes-cle");
    const invalide = enJson([PLANS[0], { ...PLANS[1], focal_mm: 5000 }]);
    const { fournisseur } = fournisseurFactice(reponseFactice(invalide));

    // Deux essais au plus : la même réponse invalide fait échouer la tâche.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    assert.equal(finale.state, "failed");
    assert.match(finale.reason, /liste de plans exploitable/);
    assert.equal((await plansProposes(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_decoupage('00000000-0000-0000-0000-000000000000', '[]'::jsonb);",
    );
    assert.notEqual(resultat.code, 0);
  });

  it("FRAME expose exactement les actions de ses profils", () => {
    const { fournisseur } = fournisseurFactice();
    assert.deepEqual(Object.keys(executeursFrame(base, fournisseur)), Object.keys(PROFILS_FRAME));
  });
});
