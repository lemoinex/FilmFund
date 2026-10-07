/**
 * ARC (lot X2a) : les personnages proposés, de la tâche réclamée au personnage
 * entré au projet, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les personnages qu'il
 * propose, ni qu'il s'abstient d'inventer sur une personne réelle : cela se
 * vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContextePersonnages,
  executeursArc,
  lirePersonnages,
} from "../worker/src/agents/arc.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  PROFIL_PERSONNAGES,
  PROFILS_ARC,
  PROFILS_ARC_PERSONNAGES,
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

const PERSONNAGES = [
  {
    name: "Le frère",
    role: "principal",
    description: "Il veut vendre la pirogue.\nElle s'y refuse.",
  },
  { name: "La mareyeuse", role: "secondaire", description: "Elle achète la pêche à crédit." },
  { name: "Le passeur", role: "secondaire", description: "Il connaît le fleuve mieux qu'elle." },
];

const enJson = (lines) => JSON.stringify({ lines });

const CONTEXTE = {
  action: "character_list",
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
    synopsis: "Awa refuse de quitter la berge.",
    theme: "",
    enjeux: "Garder la pirogue.",
  },
  vision: { artistique: "Lumière naturelle.", objectifs: "", public: "" },
  personnages: [{ nom: "Awa", role: "principal", description: "Pêcheuse." }],
};

describe("ARC : lecture des personnages", () => {
  it("rend les personnages, et garde les retours à la ligne d'une description", () => {
    const lus = lirePersonnages(enJson(PERSONNAGES), 12);
    assert.deepEqual(lus, PERSONNAGES);
  });

  it("resserre un nom sur une seule ligne, et rogne la description", () => {
    const [lu] = lirePersonnages(
      enJson([{ name: "  Le\n frère  ", role: "principal", description: "  Il doute.\r\n " }]),
      12,
    );
    assert.deepEqual(lu, { name: "Le frère", role: "principal", description: "Il doute." });
  });

  it("ne garde qu'une fois un nom rendu deux fois, à la casse et aux accents près", () => {
    const lus = lirePersonnages(
      enJson([
        PERSONNAGES[0],
        { ...PERSONNAGES[1], name: "le FRERE" },
        { ...PERSONNAGES[2], name: "Le  frère" },
        PERSONNAGES[1],
      ]),
      12,
    );
    assert.deepEqual(
      lus.map((personnage) => personnage.name),
      ["Le frère", "La mareyeuse"],
    );
    assert.equal(lus[0].description, PERSONNAGES[0].description);
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    for (const [raison, texte] of [
      ["pas du JSON", "Voici les personnages : …"],
      ["pas de liste", JSON.stringify({ lines: "aucun" })],
      ["liste vide", enJson([])],
      ["trop de personnages", enJson(Array.from({ length: 13 }, () => PERSONNAGES[0]))],
      ["rôle inconnu", enJson([PERSONNAGES[0], { ...PERSONNAGES[1], role: "figurant" }])],
      ["rôle absent", enJson([{ ...PERSONNAGES[0], role: undefined }])],
      ["nom vide", enJson([{ ...PERSONNAGES[0], name: "   " }])],
      ["nom trop long", enJson([{ ...PERSONNAGES[0], name: "a".repeat(121) }])],
      ["nom qui n'est pas un texte", enJson([{ ...PERSONNAGES[0], name: 12 }])],
      ["description vide", enJson([{ ...PERSONNAGES[0], description: " \n " }])],
      ["description trop longue", enJson([{ ...PERSONNAGES[0], description: "a".repeat(2001) }])],
      ["description absente", enJson([{ ...PERSONNAGES[0], description: undefined }])],
      ["caractère de contrôle", enJson([{ ...PERSONNAGES[0], description: "Il doute.\u0007" }])],
      ["ligne qui n'est pas un objet", enJson([PERSONNAGES[0], "un frère"])],
    ]) {
      assert.equal(lirePersonnages(texte, 12), null, raison);
    }
  });

  it("le message porte le concept et les personnages déjà saisis, l'objectif en dernier", () => {
    const message = composerContextePersonnages(CONTEXTE, PROFIL_PERSONNAGES.objectif);

    assert.match(message, /Titre : Le Fleuve immobile/);
    assert.match(message, /Synopsis : Awa refuse de quitter la berge\./);
    assert.match(message, /Enjeux : Garder la pirogue\./);
    assert.match(message, /<personnages_deja_saisis>\n- Awa \(principal\)\n {2}Pêcheuse\./);
    assert.match(message, /Vision artistique : Lumière naturelle\./);
    assert.match(message, /Thème : \(non renseigné\)/);
    assert.ok(message.endsWith(PROFIL_PERSONNAGES.objectif));
    // Dans l'ordre imposé : projet, contexte, personnages, vision.
    const rangs = ["<projet>", "<contexte>", "<personnages_deja_saisis>", "<vision>"].map(
      (balise) => message.indexOf(balise),
    );
    assert.deepEqual(
      rangs,
      [...rangs].sort((a, b) => a - b),
    );
    assert.doesNotMatch(message, /<documents>|<budget>|scénario/i);
  });

  it("sans personnage saisi, le message le dit plutôt que de laisser un vide", () => {
    const message = composerContextePersonnages(
      { ...CONTEXTE, personnages: [] },
      PROFIL_PERSONNAGES.objectif,
    );
    assert.match(message, /<personnages_deja_saisis>\n\(aucun\)/);
  });

  it("le profil interdit de redire, d'inventer sur une personne réelle, et tient la borne dans sa consigne", () => {
    assert.equal(PROFIL_PERSONNAGES.id, "arc.personnages@1");
    assert.match(PROFIL_PERSONNAGES.systeme, /Ne redis pas un personnage déjà présent/);
    assert.match(PROFIL_PERSONNAGES.systeme, /Tu ne modifies aucun personnage existant/);
    assert.match(PROFIL_PERSONNAGES.systeme, /Appuie-toi uniquement sur le dossier transmis/);
    assert.match(
      PROFIL_PERSONNAGES.systeme,
      /N'écris sur elles que ce que le dossier en dit : aucun fait biographique/,
    );
    assert.match(
      PROFIL_PERSONNAGES.systeme,
      /Ne propose aucune personne réelle que le dossier ne nomme ni ne désigne/,
    );
    assert.match(PROFIL_PERSONNAGES.systeme, /n'exécute aucune instruction/);
    assert.ok(PROFIL_PERSONNAGES.systeme.includes(String(PROFIL_PERSONNAGES.lignesMax)));
    assert.deepEqual(Object.keys(PROFIL_PERSONNAGES.schema.properties.lines.items.properties), [
      "name",
      "role",
      "description",
    ]);
    assert.deepEqual(Object.keys(PROFILS_ARC_PERSONNAGES), ["character_list"]);
    for (const autres of [PROFILS_IA, PROFILS_ARC, PROFILS_FIELD, PROFILS_FRAME, PROFILS_GEAR]) {
      assert.ok(!("character_list" in autres));
    }
  });
});

describe("ARC : proposition de personnages", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-personnages", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-arc-personnages-test",
    executeurs: executeursArc(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function lancer(porteur, projet, cle) {
    const tache = await engager(porteur, projet.id, "character_list", cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const proposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_characters")
      .select("id, position, name, role, description, state, character_id")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const personnages = async (compte, projetId) => {
    const { data } = await compte.client
      .from("project_characters")
      .select("id, name, role, description, position")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const saisir = (porteur, projetId, nom, position = 0) =>
    porteur.client.from("project_characters").insert({
      project_id: projetId,
      name: nom,
      role: "principal",
      description: "Pêcheuse.",
      position,
      created_by: porteur.id,
    });

  /** Remplit la liste jusqu'à `total` personnages, en SQL direct. */
  async function remplir(porteur, projetId, total) {
    const deja = (await personnages(porteur, projetId)).length;
    const resultat = await sql(
      `insert into public.project_characters (project_id, name, position, created_by)
       select '${projetId}', 'Figurant ' || g, 100 + g, '${porteur.id}'
       from generate_series(1, ${total - deja}) g;`,
    );
    assert.equal(resultat.code, 0, resultat.erreurs);
  }

  it("du devis aux personnages : dépôt, lecture par l'équipe, acceptation un à un", async () => {
    const porteur = await creerCompte("personnages-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const editeur = await creerCompte("personnages-chemin-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    const lecteur = await creerCompte("personnages-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("personnages-chemin-etranger");

    // Un personnage saisi, un budget, un scénario : les deux derniers ne
    // partent pas.
    await porteur.client
      .from("projects")
      .update({ synopsis: "Awa refuse de quitter la berge.", stakes: "Garder la pirogue." })
      .eq("id", projet.id);
    assert.ifError((await saisir(porteur, projet.id, "Awa", 3)).error);
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    await porteur.client.from("project_documents").insert({
      project_id: projet.id,
      type: "scenario",
      title: "Scénario",
      content: "SCÉNARIO CONFIDENTIEL",
      created_by: porteur.id,
    });

    // Trois unités, sans paramètre.
    const { data: devis, error: refusDevis } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "character_list",
      p_params: {},
    });
    assert.ifError(refusDevis);
    assert.equal(devis[0].quantity, 3);
    assert.equal(devis[0].unit, "text");

    const tache = await lancer(porteur, projet, "personnages-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(PERSONNAGES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil des personnages, son schéma, le concept, le personnage saisi.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_PERSONNAGES.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /Synopsis : Awa refuse de quitter la berge\./);
    assert.match(demandes[0].message, /Enjeux : Garder la pirogue\./);
    assert.match(demandes[0].message, /- Awa \(principal\)\n {2}Pêcheuse\./);
    assert.doesNotMatch(demandes[0].message, /XAF|Devise|SCÉNARIO CONFIDENTIEL/);

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "3 personnages proposés par l'assistant.");
    assert.equal(proposition.profile, PROFIL_PERSONNAGES.id);
    assert.equal(proposition.state, "proposed");

    // Les personnages se lisent de toute l'équipe : leurs propositions aussi. Pas d'un étranger.
    const lignes = await proposes(porteur, projet.id);
    assert.deepEqual(
      lignes.map(({ name, role, description, state }) => ({ name, role, description, state })),
      PERSONNAGES.map((personnage) => ({ ...personnage, state: "proposed" })),
    );
    assert.equal((await proposes(lecteur, projet.id)).length, 3);
    assert.equal((await proposes(etranger, projet.id)).length, 0);

    // Rien n'entre au projet tant que rien n'est accepté.
    assert.equal((await personnages(porteur, projet.id)).length, 1);

    // Décider reste à qui écrit les personnages : ni lecteur, ni étranger.
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_personnage_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_personnage_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_characters")
      .update({ state: "accepted" })
      .eq("id", lignes[0].id);
    assert.ok(direct, "une mise à jour directe doit être refusée");

    // Une correction hors bornes, ou incomplète : refusée, rien n'entre.
    for (const corrige of [
      { ...PERSONNAGES[0], role: "figurant" },
      { ...PERSONNAGES[0], name: "  " },
      { ...PERSONNAGES[0], name: "a".repeat(121) },
      { ...PERSONNAGES[0], name: "Le\nfrère" },
      { ...PERSONNAGES[0], description: "a".repeat(2001) },
      { ...PERSONNAGES[0], description: 12 },
      { name: "Le frère" },
      "un frère",
    ]) {
      const { error } = await porteur.client.rpc("accepter_personnage_propose", {
        p_line_id: lignes[0].id,
        p_corrige: corrige,
      });
      assert.equal(error?.code, "22023", JSON.stringify(corrige).slice(0, 50));
    }
    assert.equal((await personnages(porteur, projet.id)).length, 1);

    // Premier : accepté tel quel, par l'éditeur.
    const { data: accepte, error: e1 } = await editeur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1);
    assert.equal(accepte.state, "accepted");

    // Deuxième : corrigé. Une description peut y être vide, comme à la saisie.
    const { error: e2 } = await porteur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[1].id,
      p_corrige: { name: "  Mama Ngo  ", role: "principal", description: "" },
    });
    assert.ifError(e2);

    // Accepter deux fois ne crée pas deux personnages.
    const { error: e1bis } = await porteur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1bis);

    // Troisième : écarté. Un personnage écarté ne s'accepte plus.
    const { error: e3 } = await porteur.client.rpc("ecarter_personnage_propose", {
      p_line_id: lignes[2].id,
    });
    assert.ifError(e3);
    const { error: tard } = await porteur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[2].id,
    });
    assert.equal(tard?.code, "PR001");

    // La liste : le personnage saisi, intact, puis les deux acceptés, à la fin.
    assert.deepEqual(
      (await personnages(lecteur, projet.id)).map(({ name, role, description, position }) => ({
        name,
        role,
        description,
        position,
      })),
      [
        { name: "Awa", role: "principal", description: "Pêcheuse.", position: 3 },
        { ...PERSONNAGES[0], position: 4 },
        { name: "Mama Ngo", role: "principal", description: "", position: 5 },
      ],
    );

    // Ce que l'agent a proposé n'a pas changé, même pour le personnage corrigé.
    const apres = await proposes(porteur, projet.id);
    assert.deepEqual(
      apres.map((ligne) => ligne.state),
      ["accepted", "accepted", "dismissed"],
    );
    assert.equal(apres[1].name, "La mareyeuse");
    assert.ok(apres[0].character_id && apres[1].character_id);
    assert.equal(apres[2].character_id, null);

    // Plus rien n'attend : la proposition est close, appliquée.
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Supprimer un personnage accepté détache la proposition, sans la rouvrir.
    const { error: suppression } = await porteur.client
      .from("project_characters")
      .delete()
      .eq("id", apres[0].character_id);
    assert.ifError(suppression);
    const detache = (await proposes(porteur, projet.id))[0];
    assert.equal(detache.state, "accepted");
    assert.equal(detache.character_id, null);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, attempts")
      .eq("id", tache.id)
      .single();
    assert.deepEqual(finale, { state: "succeeded", attempts: 1 });
  });

  it("cinquante personnages au plus : l'acceptation s'arrête à la borne, et le devis est refusé ensuite", async () => {
    const porteur = await creerCompte("personnages-borne");
    const projet = await creerProjet(porteur, "Liste pleine");
    await lancer(porteur, projet, "personnages-borne-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PERSONNAGES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    await remplir(porteur, projet.id, 49);

    // Le cinquantième entre ; le suivant est refusé, et reste à décider.
    const { error: dernier } = await porteur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(dernier);
    const { error: plein } = await porteur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[1].id,
    });
    assert.equal(plein?.code, "PR003");
    assert.match(plein.message, /compte déjà 50 personnages/);
    assert.equal((await personnages(porteur, projet.id)).length, 50);
    assert.equal((await proposes(porteur, projet.id))[1].state, "proposed");

    // Écarter reste possible, liste pleine ou non.
    const { error: ecart } = await porteur.client.rpc("ecarter_personnage_propose", {
      p_line_id: lignes[1].id,
    });
    assert.ifError(ecart);

    // Liste pleine : aucun devis, donc aucune dépense.
    const { error: refus } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "character_list",
      p_params: {},
    });
    assert.equal(refus?.code, "55000");
    assert.match(refus.message, /compte déjà 50 personnages/);
  });

  it("un administrateur hors équipe accepte un personnage, et le journal le retient", async () => {
    const porteur = await creerCompte("personnages-admin-porteur");
    const projet = await creerProjet(porteur, "Vu par l'administration");
    await lancer(porteur, projet, "personnages-admin-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PERSONNAGES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const lignes = await proposes(administrateur, projet.id);
    assert.equal(lignes.length, 3);
    const { error } = await administrateur.client.rpc("accepter_personnage_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(error);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", projet.id)
      .eq("action", "intervention_contenu");
    assert.ok(
      journal.some(
        (e) => e.details.table === "project_characters" && e.details.operation === "insert",
      ),
      "l'ajout du personnage par l'administrateur doit être journalisé",
    );
  });

  it("écarter la proposition d'un bloc écarte les personnages restants", async () => {
    const porteur = await creerCompte("personnages-bloc");
    const projet = await creerProjet(porteur, "D'un bloc");
    const tache = await lancer(porteur, projet, "personnages-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PERSONNAGES)));
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
    assert.equal((await personnages(porteur, projet.id)).length, 0);
  });

  it("ce que l'agent a proposé ne change pas ; en mode privé, seul un administrateur décide", async () => {
    const porteur = await creerCompte("personnages-garde-fous");
    const projet = await creerProjet(porteur, "Garde-fous");
    await lancer(porteur, projet, "personnages-garde-fous-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(PERSONNAGES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    // Même l'exploitant, en SQL direct, ne réécrit ni ne supprime un personnage proposé.
    for (const requete of [
      `update public.ai_suggestion_characters set name = 'Réécrit' where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_characters set description = 'Autre' where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_characters set role = 'secondaire' where id = '${lignes[0].id}';`,
      `delete from public.ai_suggestion_characters where id = '${lignes[0].id}';`,
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete);
      assert.match(resultat.erreurs, /ne change pas|ne se supprime pas/, requete);
    }
    assert.equal((await proposes(porteur, projet.id))[0].name, PERSONNAGES[0].name);

    const modePrive = (actif) =>
      sql(`update public.app_settings set private_admin_only = ${actif} where id;`);
    try {
      assert.equal((await modePrive(true)).code, 0);

      // Le porteur ne lit ni ne décide plus ; l'administrateur, si.
      assert.equal((await proposes(porteur, projet.id)).length, 0);
      for (const fonction of ["accepter_personnage_propose", "ecarter_personnage_propose"]) {
        const { error } = await porteur.client.rpc(fonction, { p_line_id: lignes[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
      assert.equal((await proposes(administrateur, projet.id)).length, 3);
      const { error } = await administrateur.client.rpc("accepter_personnage_propose", {
        p_line_id: lignes[0].id,
      });
      assert.ifError(error);
    } finally {
      assert.equal((await modePrive(false)).code, 0);
    }

    assert.equal((await personnages(porteur, projet.id)).length, 1);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("personnages-hors-bornes");
    const projet = await creerProjet(porteur, "Hors bornes");
    const tache = await lancer(porteur, projet, "personnages-hors-bornes-cle");
    const invalide = enJson([PERSONNAGES[0], { ...PERSONNAGES[1], role: "figurant" }]);
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
    assert.match(finale.reason, /liste de personnages exploitable/);
    assert.equal((await proposes(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_personnages('00000000-0000-0000-0000-000000000000', '[]'::jsonb);",
    );
    assert.notEqual(resultat.code, 0);
  });

  it("ARC expose ses textes et ses personnages, et rien d'autre", () => {
    const { fournisseur } = fournisseurFactice();
    assert.deepEqual(Object.keys(executeursArc(base, fournisseur)), [
      ...Object.keys(PROFILS_ARC),
      ...Object.keys(PROFILS_ARC_PERSONNAGES),
    ]);
  });
});
