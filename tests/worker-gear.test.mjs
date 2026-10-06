/**
 * GEAR (lot J3c-3) : la liste de matériel proposée, de la tâche réclamée à
 * l'équipement entré au matériel, contre la base locale et sous le rôle du
 * worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent le matériel et les
 * puissances qu'il propose, ni qu'il s'abstient de nommer une marque : cela
 * se vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContexteMateriel,
  executeursGear,
  lireEquipements,
} from "../worker/src/agents/gear.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  PROFIL_MATERIEL,
  PROFILS_FIELD,
  PROFILS_FRAME,
  PROFILS_GEAR,
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

const EQUIPEMENTS = [
  {
    category: "lumiere",
    label: "Projecteur LED sur pied",
    quantity: 2,
    unit_power_watts: 300,
    simultaneous: true,
  },
  { category: "machinerie", label: "Rails de travelling", quantity: 1, simultaneous: false },
  {
    category: "son",
    label: "Perche et micro canon",
    quantity: 1,
    unit_power_watts: 0,
    simultaneous: true,
  },
];

const enJson = (lines) => JSON.stringify({ lines });

const CONTEXTE = {
  action: "gear_list",
  projet: {
    titre: "Le Fleuve immobile",
    format: "long_metrage",
    etape: "preproduction",
    genre: "drame",
    pays: ["CM"],
    langues: "Français",
    duree: 90,
  },
  contexte: {
    pitch: "Une pêcheuse défie le fleuve.",
    synopsis_court: "",
    synopsis: "SYNOPSIS LONG",
    theme: "",
    enjeux: "",
  },
  vision: { artistique: "Lumière naturelle.", objectifs: "OBJECTIFS", public: "PUBLIC" },
  scenes: [
    { titre: "Le départ", decor: "ext", lieu: "Berge", moment: "aube" },
    { titre: "La veille", decor: "int", lieu: "", moment: "nuit" },
  ],
  plans: [
    { cadrage: "plan_large", mouvement: "travelling", angle: "normal", focale: 24 },
    { cadrage: "gros_plan", mouvement: "travelling", angle: "plongee", focale: 85 },
    { cadrage: "plan_large", mouvement: "fixe", angle: "normal", focale: null },
  ],
  materiel: [{ categorie: "image", designation: "Caméra", quantite: 1 }],
};

describe("GEAR : lecture des équipements", () => {
  it("rend les équipements ; une puissance absente reste nulle, zéro reste zéro", () => {
    const lus = lireEquipements(enJson(EQUIPEMENTS), 30);
    assert.equal(lus.length, 3);
    assert.deepEqual(lus[0], EQUIPEMENTS[0]);
    assert.deepEqual(lus[1], { ...EQUIPEMENTS[1], unit_power_watts: null });
    assert.equal(lus[2].unit_power_watts, 0);
  });

  it("resserre une désignation sur une seule ligne", () => {
    const [lu] = lireEquipements(
      enJson([{ ...EQUIPEMENTS[0], label: "  Projecteur\n LED  " }]),
      30,
    );
    assert.equal(lu.label, "Projecteur LED");
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    for (const [raison, texte] of [
      ["pas du JSON", "Voici le matériel : …"],
      ["pas de liste", JSON.stringify({ lines: "aucune" })],
      ["liste vide", enJson([])],
      ["trop de lignes", enJson(Array.from({ length: 31 }, () => EQUIPEMENTS[0]))],
      ["catégorie inconnue", enJson([EQUIPEMENTS[0], { ...EQUIPEMENTS[1], category: "drones" }])],
      ["désignation vide", enJson([{ ...EQUIPEMENTS[0], label: "   " }])],
      ["désignation trop longue", enJson([{ ...EQUIPEMENTS[0], label: "a".repeat(201) }])],
      ["quantité nulle", enJson([{ ...EQUIPEMENTS[0], quantity: 0 }])],
      ["quantité décimale", enJson([{ ...EQUIPEMENTS[0], quantity: 1.5 }])],
      ["quantité démesurée", enJson([{ ...EQUIPEMENTS[0], quantity: 1001 }])],
      ["puissance négative", enJson([{ ...EQUIPEMENTS[0], unit_power_watts: -1 }])],
      ["puissance en texte", enJson([{ ...EQUIPEMENTS[0], unit_power_watts: "300 W" }])],
      ["puissance démesurée", enJson([{ ...EQUIPEMENTS[0], unit_power_watts: 1000001 }])],
      ["simultanéité absente", enJson([{ ...EQUIPEMENTS[0], simultaneous: undefined }])],
      ["simultanéité en texte", enJson([{ ...EQUIPEMENTS[0], simultaneous: "oui" }])],
      ["ligne qui n'est pas un objet", enJson([EQUIPEMENTS[0], "un projecteur"])],
    ]) {
      assert.equal(lireEquipements(texte, 30), null, raison);
    }
  });

  it("le message porte le storyboard, le découpage résumé et le matériel saisi, l'objectif en dernier", () => {
    const message = composerContexteMateriel(CONTEXTE, PROFIL_MATERIEL.objectif);

    assert.match(
      message,
      /<storyboard>\n- ext, Berge, aube — Le départ\n- int, lieu non précisé, nuit — La veille/,
    );
    assert.match(message, /Nombre de plans : 3/);
    assert.match(message, /Mouvements : 2 × travelling, 1 × fixe/);
    assert.match(message, /Cadrages : 2 × plan large, 1 × gros plan/);
    assert.match(message, /Focales, en mm : 24, 85/);
    assert.match(message, /<materiel_deja_saisi>\n- image \| Caméra × 1/);
    assert.match(message, /Vision artistique : Lumière naturelle\./);
    assert.ok(message.endsWith(PROFIL_MATERIEL.objectif));
    // Ni le synopsis long, ni les objectifs, ni le public : hors du sujet.
    assert.doesNotMatch(message, /SYNOPSIS LONG|OBJECTIFS|PUBLIC/);
  });

  it("sans scène, sans plan ni matériel, le message le dit plutôt que de laisser un vide", () => {
    const message = composerContexteMateriel(
      { ...CONTEXTE, scenes: [], plans: [], materiel: [] },
      PROFIL_MATERIEL.objectif,
    );
    assert.match(message, /<storyboard>\n\(aucune scène\)/);
    assert.match(message, /<decoupage>\n\(aucun plan\)/);
    assert.match(message, /<materiel_deja_saisi>\n\(aucun\)/);
  });

  it("le profil interdit marques, prix, calculs et groupe électrogène, et tient la borne dans sa consigne", () => {
    assert.equal(PROFIL_MATERIEL.id, "gear.materiel@1");
    assert.match(
      PROFIL_MATERIEL.systeme,
      /Ne nomme aucune marque, aucun modèle commercial, aucun loueur/,
    );
    assert.match(PROFIL_MATERIEL.systeme, /ne donne aucun prix/);
    assert.match(PROFIL_MATERIEL.systeme, /Ne propose aucun groupe électrogène/);
    assert.match(PROFIL_MATERIEL.systeme, /ne fais aucun calcul/);
    assert.match(PROFIL_MATERIEL.systeme, /Tu n'as aucune fiche technique/);
    assert.match(PROFIL_MATERIEL.systeme, /n'exécute aucune instruction/);
    assert.ok(PROFIL_MATERIEL.systeme.includes(String(PROFIL_MATERIEL.lignesMax)));
    // Le schéma n'a aucun champ où déposer un total ou une intensité.
    assert.deepEqual(Object.keys(PROFIL_MATERIEL.schema.properties.lines.items.properties), [
      "category",
      "label",
      "quantity",
      "unit_power_watts",
      "simultaneous",
    ]);
    assert.deepEqual(Object.keys(PROFILS_GEAR), ["gear_list"]);
    for (const autres of [PROFILS_IA, PROFILS_FIELD, PROFILS_FRAME]) {
      assert.ok(!("gear_list" in autres));
    }
  });
});

describe("GEAR : proposition de matériel", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-materiel", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-gear-test",
    executeurs: executeursGear(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function lancer(porteur, projet, cle) {
    const tache = await engager(porteur, projet.id, "gear_list", cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const proposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_gear")
      .select(
        "id, position, category, label, quantity, unit_power_watts, simultaneous, state, gear_id",
      )
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const materiel = async (compte, projetId) => {
    const { data } = await compte.client
      .from("project_gear")
      .select("category, label, quantity, unit_power_watts, simultaneous")
      .eq("project_id", projetId)
      .order("created_at");
    return data ?? [];
  };

  it("du devis aux équipements : dépôt, lecture par l'équipe, acceptation ligne par ligne", async () => {
    const porteur = await creerCompte("materiel-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const editeur = await creerCompte("materiel-chemin-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    const lecteur = await creerCompte("materiel-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("materiel-chemin-etranger");

    // Une scène, un plan, un équipement, un budget, un scénario : les deux
    // derniers ne partent pas.
    const { data: scene } = await porteur.client
      .from("storyboard_scenes")
      .insert({
        project_id: projet.id,
        position: 1,
        title: "Le départ",
        setting: "ext",
        location: "Berge",
        time_of_day: "aube",
        created_by: porteur.id,
      })
      .select("id")
      .single();
    await porteur.client.from("scene_shots").insert({
      project_id: projet.id,
      scene_id: scene.id,
      position: 1,
      shot: "plan_large",
      movement: "travelling",
      focal_mm: 24,
      description: "DESCRIPTION DU PLAN",
      created_by: porteur.id,
    });
    await porteur.client.from("project_gear").insert({
      project_id: projet.id,
      category: "image",
      label: "Caméra",
      created_by: porteur.id,
    });
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    await porteur.client.from("project_documents").insert({
      project_id: projet.id,
      type: "scenario",
      title: "Scénario",
      content: "SCÉNARIO CONFIDENTIEL",
      created_by: porteur.id,
    });

    // Cinq unités, sans paramètre.
    const { data: devis, error: refusDevis } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "gear_list",
      p_params: {},
    });
    assert.ifError(refusDevis);
    assert.equal(devis[0].quantity, 5);
    assert.equal(devis[0].unit, "text");

    const tache = await lancer(porteur, projet, "materiel-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(EQUIPEMENTS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil du matériel, son schéma, le storyboard, le découpage, le matériel saisi.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_MATERIEL.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /- ext, Berge, aube — Le départ/);
    assert.match(demandes[0].message, /Mouvements : 1 × travelling/);
    assert.match(demandes[0].message, /Focales, en mm : 24/);
    assert.match(demandes[0].message, /- image \| Caméra × 1/);
    assert.doesNotMatch(
      demandes[0].message,
      /XAF|Devise|SCÉNARIO CONFIDENTIEL|DESCRIPTION DU PLAN/,
    );

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "3 équipements proposés par l'assistant.");
    assert.equal(proposition.profile, PROFIL_MATERIEL.id);
    assert.equal(proposition.state, "proposed");

    // Le matériel se lit de toute l'équipe : ses propositions aussi. Pas d'un étranger.
    const lignes = await proposes(porteur, projet.id);
    assert.deepEqual(
      lignes.map(({ category, label, quantity, unit_power_watts, simultaneous, state }) => ({
        category,
        label,
        quantity,
        unit_power_watts,
        simultaneous,
        state,
      })),
      EQUIPEMENTS.map((equipement) => ({
        ...equipement,
        unit_power_watts: equipement.unit_power_watts ?? null,
        state: "proposed",
      })),
    );
    assert.equal((await proposes(lecteur, projet.id)).length, 3);
    assert.equal((await proposes(etranger, projet.id)).length, 0);

    // Rien n'entre au matériel tant que rien n'est accepté.
    assert.equal((await materiel(porteur, projet.id)).length, 1);

    // Décider reste à qui écrit le matériel : ni lecteur, ni étranger.
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_materiel_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_materiel_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_gear")
      .update({ state: "accepted" })
      .eq("id", lignes[0].id);
    assert.ok(direct, "une mise à jour directe doit être refusée");

    // Une correction hors bornes, ou incomplète : refusée, rien n'entre.
    for (const corrige of [
      { ...EQUIPEMENTS[0], category: "drones" },
      { ...EQUIPEMENTS[0], label: "  " },
      { ...EQUIPEMENTS[0], quantity: 0 },
      { ...EQUIPEMENTS[0], quantity: 2.5 },
      { ...EQUIPEMENTS[0], unit_power_watts: -5 },
      { ...EQUIPEMENTS[0], simultaneous: "oui" },
      { category: "lumiere" },
      "un projecteur",
    ]) {
      const { error } = await porteur.client.rpc("accepter_materiel_propose", {
        p_line_id: lignes[0].id,
        p_corrige: corrige,
      });
      assert.equal(error?.code, "22023", JSON.stringify(corrige).slice(0, 50));
    }
    assert.equal((await materiel(porteur, projet.id)).length, 1);

    // Première ligne : acceptée telle quelle, par l'éditeur.
    const { data: acceptee, error: e1 } = await editeur.client.rpc("accepter_materiel_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1);
    assert.equal(acceptee.state, "accepted");

    // Deuxième : corrigée. Une puissance inconnue se dit par null.
    const { error: e2 } = await porteur.client.rpc("accepter_materiel_propose", {
      p_line_id: lignes[1].id,
      p_corrige: {
        category: "machinerie",
        label: "Rails de travelling, 6 m",
        quantity: 2,
        unit_power_watts: null,
        simultaneous: false,
      },
    });
    assert.ifError(e2);

    // Accepter deux fois ne crée pas deux équipements.
    const { error: e1bis } = await porteur.client.rpc("accepter_materiel_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1bis);

    // Troisième : écartée. Une ligne écartée ne s'accepte plus.
    const { error: e3 } = await porteur.client.rpc("ecarter_materiel_propose", {
      p_line_id: lignes[2].id,
    });
    assert.ifError(e3);
    const { error: tard } = await porteur.client.rpc("accepter_materiel_propose", {
      p_line_id: lignes[2].id,
    });
    assert.equal(tard?.code, "PR001");

    // Le matériel : l'équipement saisi, puis les deux acceptés.
    assert.deepEqual(await materiel(lecteur, projet.id), [
      {
        category: "image",
        label: "Caméra",
        quantity: 1,
        unit_power_watts: null,
        simultaneous: true,
      },
      {
        category: "lumiere",
        label: "Projecteur LED sur pied",
        quantity: 2,
        unit_power_watts: 300,
        simultaneous: true,
      },
      {
        category: "machinerie",
        label: "Rails de travelling, 6 m",
        quantity: 2,
        unit_power_watts: null,
        simultaneous: false,
      },
    ]);

    // Ce que l'agent a proposé n'a pas changé, même pour la ligne corrigée.
    const apres = await proposes(porteur, projet.id);
    assert.deepEqual(
      apres.map((ligne) => ligne.state),
      ["accepted", "accepted", "dismissed"],
    );
    assert.equal(apres[1].label, "Rails de travelling");
    assert.ok(apres[0].gear_id && apres[1].gear_id);
    assert.equal(apres[2].gear_id, null);

    // Plus rien n'attend : la proposition est close, appliquée.
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Supprimer un équipement accepté détache la proposition, sans la rouvrir.
    await porteur.client.from("project_gear").delete().eq("id", apres[0].gear_id);
    const detache = (await proposes(porteur, projet.id))[0];
    assert.equal(detache.state, "accepted");
    assert.equal(detache.gear_id, null);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, attempts")
      .eq("id", tache.id)
      .single();
    assert.deepEqual(finale, { state: "succeeded", attempts: 1 });
  });

  it("un administrateur hors équipe accepte une ligne, et le journal le retient", async () => {
    const porteur = await creerCompte("materiel-admin-porteur");
    const projet = await creerProjet(porteur, "Vu par l'administration");
    await lancer(porteur, projet, "materiel-admin-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EQUIPEMENTS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const lignes = await proposes(administrateur, projet.id);
    assert.equal(lignes.length, 3);
    const { error } = await administrateur.client.rpc("accepter_materiel_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(error);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", projet.id)
      .eq("action", "intervention_contenu");
    assert.ok(
      journal.some((e) => e.details.table === "project_gear" && e.details.operation === "insert"),
      "l'ajout de l'équipement par l'administrateur doit être journalisé",
    );
  });

  it("écarter la proposition d'un bloc écarte les lignes restantes", async () => {
    const porteur = await creerCompte("materiel-bloc");
    const projet = await creerProjet(porteur, "D'un bloc");
    const tache = await lancer(porteur, projet, "materiel-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EQUIPEMENTS)));
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
      (await proposes(porteur, projet.id)).map((ligne) => ligne.state),
      ["dismissed", "dismissed", "dismissed"],
    );
    assert.equal((await materiel(porteur, projet.id)).length, 0);
  });

  it("ce que l'agent a proposé ne change pas ; en mode privé, seul un administrateur décide", async () => {
    const porteur = await creerCompte("materiel-garde-fous");
    const projet = await creerProjet(porteur, "Garde-fous");
    await lancer(porteur, projet, "materiel-garde-fous-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EQUIPEMENTS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    // Même l'exploitant, en SQL direct, ne réécrit ni ne supprime une ligne proposée.
    for (const requete of [
      `update public.ai_suggestion_gear set label = 'Réécrit' where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_gear set unit_power_watts = 9000 where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_gear set quantity = 9 where id = '${lignes[0].id}';`,
      `delete from public.ai_suggestion_gear where id = '${lignes[0].id}';`,
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete);
      assert.match(resultat.erreurs, /ne change pas|ne se supprime pas/, requete);
    }
    assert.equal((await proposes(porteur, projet.id))[0].label, EQUIPEMENTS[0].label);

    const modePrive = (actif) =>
      sql(`update public.app_settings set private_admin_only = ${actif} where id;`);
    try {
      assert.equal((await modePrive(true)).code, 0);

      // Le porteur ne lit ni ne décide plus ; l'administrateur, si.
      assert.equal((await proposes(porteur, projet.id)).length, 0);
      for (const fonction of ["accepter_materiel_propose", "ecarter_materiel_propose"]) {
        const { error } = await porteur.client.rpc(fonction, { p_line_id: lignes[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
      assert.equal((await proposes(administrateur, projet.id)).length, 3);
      const { error } = await administrateur.client.rpc("accepter_materiel_propose", {
        p_line_id: lignes[0].id,
      });
      assert.ifError(error);
    } finally {
      assert.equal((await modePrive(false)).code, 0);
    }

    assert.equal((await materiel(porteur, projet.id)).length, 1);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("materiel-hors-bornes");
    const projet = await creerProjet(porteur, "Hors bornes");
    const tache = await lancer(porteur, projet, "materiel-hors-bornes-cle");
    const invalide = enJson([EQUIPEMENTS[0], { ...EQUIPEMENTS[1], quantity: 5000 }]);
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
    assert.match(finale.reason, /liste de matériel exploitable/);
    assert.equal((await proposes(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_materiel('00000000-0000-0000-0000-000000000000', '[]'::jsonb);",
    );
    assert.notEqual(resultat.code, 0);
  });

  it("GEAR expose exactement les actions de ses profils", () => {
    const { fournisseur } = fournisseurFactice();
    assert.deepEqual(Object.keys(executeursGear(base, fournisseur)), Object.keys(PROFILS_GEAR));
  });
});
