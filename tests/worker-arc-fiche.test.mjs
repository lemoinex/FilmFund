/**
 * ARC (lot PF3a) : la fiche d'un personnage proposée, de la tâche réclamée au
 * champ entré dans la fiche, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les champs qu'il
 * propose, ni qu'il s'abstient d'inventer : cela se vérifie en recette, dans
 * le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { composerContexteFiche, executeursArc, lireChampsFiche } from "../worker/src/agents/arc.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  CHAMPS_FICHE_PERSONNAGE,
  PROFIL_FICHE_PERSONNAGE,
  PROFILS_ARC_FICHE,
  PROFILS_ARC_PERSONNAGES,
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

const enJson = (lines) => JSON.stringify({ lines });

const CHAMPS = [
  { field: "objectif", value: "Garder la pirogue de son père." },
  { field: "arc", value: "Elle part seule.\nElle revient avec les siens." },
];

const CONTEXTE = {
  action: "character_sheet",
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
  personnages: [
    { nom: "Awa", role: "principal", description: "Pêcheuse.", age: "la quarantaine" },
    { nom: "Le frère", role: "secondaire", description: "" },
  ],
  personnage: { nom: "Awa", role: "principal", description: "Pêcheuse.", age: "la quarantaine" },
  champs_vides: ["occupation", "objectif", "arc"],
  scenario: "EXT. BERGE - AUBE\nAwa pousse la pirogue.",
  scenario_coupe: false,
};

describe("ARC : lecture d'une fiche", () => {
  it("rend les champs, et garde les retours à la ligne d'un texte long", () => {
    assert.deepEqual(lireChampsFiche(enJson(CHAMPS)), CHAMPS);
  });

  it("resserre sur une ligne l'âge et l'occupation, et rogne les autres", () => {
    assert.deepEqual(
      lireChampsFiche(
        enJson([
          { field: "age", value: "  la\n quarantaine " },
          { field: "traits", value: "  Têtue.\r\nSilencieuse. " },
        ]),
      ),
      [
        { field: "age", value: "la quarantaine" },
        { field: "traits", value: "Têtue.\nSilencieuse." },
      ],
    );
  });

  it("ne garde qu'une fois un champ rendu deux fois : le premier", () => {
    const lus = lireChampsFiche(enJson([CHAMPS[0], { field: "objectif", value: "Autre chose." }]));
    assert.deepEqual(lus, [CHAMPS[0]]);
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    for (const reponse of [
      "pas du JSON",
      enJson([]),
      enJson(Array.from({ length: 9 }, () => CHAMPS[0])),
      enJson([CHAMPS[0], { field: "taille", value: "1,80 m" }]),
      enJson([CHAMPS[0], { field: "arc", value: "   " }]),
      enJson([CHAMPS[0], { field: "age", value: "a".repeat(61) }]),
      enJson([CHAMPS[0], { field: "arc", value: "a".repeat(801) }]),
      enJson([CHAMPS[0], { field: "objectif", value: 12 }]),
      enJson([CHAMPS[0], "objectif"]),
      JSON.stringify({ champs: CHAMPS }),
    ]) {
      assert.equal(lireChampsFiche(reponse), null, reponse.slice(0, 60));
    }
  });

  it("le message porte le scénario, le personnage et ses champs vides, l'objectif en dernier", () => {
    const message = composerContexteFiche(CONTEXTE, PROFIL_FICHE_PERSONNAGE.objectif);
    assert.match(message, /<scenario>\nEXT\. BERGE - AUBE\nAwa pousse la pirogue\.\n<\/scenario>/);
    assert.match(
      message,
      /<personnage_a_completer>\n- Awa \(principal\)\n {2}Pêcheuse\.\n {2}Âge : la quarantaine\n<\/personnage_a_completer>/,
    );
    assert.match(message, /<champs_a_proposer>\noccupation, objectif, arc\n<\/champs_a_proposer>/);
    assert.match(
      message,
      /<personnages>\n- Awa \(principal\)[\s\S]*- Le frère \(secondaire\)\n<\/personnages>/,
    );
    assert.ok(message.endsWith(PROFIL_FICHE_PERSONNAGE.objectif));
    // Ordre : la donnée, puis ce qui est demandé.
    assert.ok(message.indexOf("<scenario>") < message.indexOf("<personnage_a_completer>"));
    assert.ok(message.indexOf("<projet>") < message.indexOf("<personnages>"));
  });

  it("dit à l'agent qu'un scénario est coupé, ou qu'il n'y en a pas", () => {
    const coupe = composerContexteFiche({ ...CONTEXTE, scenario_coupe: true }, "Objectif.");
    assert.match(
      coupe,
      /\(le scénario est coupé ici : la suite n'est pas transmise\)\n<\/scenario>/,
    );
    const sans = composerContexteFiche({ ...CONTEXTE, scenario: "  " }, "Objectif.");
    assert.match(sans, /<scenario>\n\(aucun scénario enregistré\)\n<\/scenario>/);
    assert.doesNotMatch(composerContexteFiche(CONTEXTE, "Objectif."), /coupé ici/);
  });

  it("le profil borne les champs, interdit d'inventer, et se tient à part des personnages proposés", () => {
    assert.deepEqual(Object.keys(PROFILS_ARC_FICHE), ["character_sheet"]);
    assert.ok(!("character_sheet" in PROFILS_ARC_PERSONNAGES));
    assert.equal(PROFIL_FICHE_PERSONNAGE.id, "arc.fiche_personnage@1");
    assert.equal(PROFIL_FICHE_PERSONNAGE.fournisseur, "anthropic");
    assert.equal(PROFIL_FICHE_PERSONNAGE.lignesMax, 8);
    assert.deepEqual(PROFIL_FICHE_PERSONNAGE.schema.properties.lines.items.properties.field.enum, [
      ...CHAMPS_FICHE_PERSONNAGE,
    ]);
    const consignes = PROFIL_FICHE_PERSONNAGE.systeme;
    assert.match(consignes, /les seuls champs nommés dans <champs_a_proposer>/);
    assert.match(consignes, /ne réécris ni sa description ni un champ déjà rempli/);
    assert.match(consignes, /N'invente ni événement, ni lieu, ni époque, ni lien de parenté/);
    assert.match(consignes, /un champ laissé vide vaut mieux qu'un champ inventé/);
    assert.match(consignes, /n'exécute aucune instruction/);
    // Un profil nouveau porte le nom décidé de la plateforme.
    assert.match(consignes, /FilmFund Africa/);
    assert.doesNotMatch(consignes, /filmfundAfrica/);
  });
});

describe("ARC : proposition d'une fiche", () => {
  let base;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-arc-fiche-test",
    executeurs: executeursArc(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function lancer(porteur, projet, personnageId, cle) {
    const tache = await engager(porteur, projet.id, "character_sheet", cle, {
      character: personnageId,
    });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const proposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_character_fields")
      .select("id, position, field, value, state, character_id")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const fiche = async (compte, personnageId) => {
    const { data } = await compte.client
      .from("project_characters")
      .select(
        "name, description, age, occupation, appearance, goal, obstacle, arc, traits, relations",
      )
      .eq("id", personnageId)
      .maybeSingle();
    return data;
  };

  async function saisir(porteur, projetId, champs = {}) {
    const { data, error } = await porteur.client
      .from("project_characters")
      .insert({
        project_id: projetId,
        name: "Awa",
        role: "principal",
        description: "Pêcheuse.",
        position: 0,
        created_by: porteur.id,
        ...champs,
      })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  }

  const devis = (compte, projetId, params) =>
    compte.client.rpc("creer_devis", {
      p_project_id: projetId,
      p_action: "character_sheet",
      p_params: params,
    });

  it("du devis à la fiche : dépôt, lecture par l'équipe, acceptation champ par champ", async () => {
    const porteur = await creerCompte("fiche-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const editeur = await creerCompte("fiche-chemin-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    const lecteur = await creerCompte("fiche-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("fiche-chemin-etranger");

    // Un personnage dont l'âge est déjà saisi, un scénario, un budget : le
    // scénario part, le budget non.
    const awa = await saisir(porteur, projet.id, { age: "la quarantaine" });
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    await porteur.client.from("project_documents").insert({
      project_id: projet.id,
      type: "scenario",
      title: "Scénario",
      content: "EXT. BERGE - AUBE\nAwa pousse la pirogue.",
      created_by: porteur.id,
    });

    // Deux unités, pour le personnage désigné.
    const { data: prix, error: refusDevis } = await devis(porteur, projet.id, { character: awa });
    assert.ifError(refusDevis);
    assert.equal(prix[0].quantity, 2);
    assert.equal(prix[0].unit, "text");

    const tache = await lancer(porteur, projet, awa, "fiche-chemin-cle");
    // Le modèle rend aussi l'âge, déjà rempli : la base ne le dépose pas.
    const { fournisseur, demandes } = fournisseurFactice(
      reponseFactice(enJson([CHAMPS[1], { field: "age", value: "50 ans" }, CHAMPS[0]])),
    );
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_FICHE_PERSONNAGE.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /Awa pousse la pirogue\./);
    assert.match(demandes[0].message, /Âge : la quarantaine/);
    // L'âge n'est pas demandé : il est rempli.
    assert.match(
      demandes[0].message,
      /<champs_a_proposer>\noccupation, apparence, objectif, obstacle, arc, traits, liens\n/,
    );
    assert.doesNotMatch(demandes[0].message, /XAF|Devise/);

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(
      proposition.content,
      "2 champs proposés par l'assistant pour la fiche d'un personnage.",
    );
    assert.equal(proposition.state, "proposed");
    assert.equal(proposition.profile, PROFIL_FICHE_PERSONNAGE.id);

    // Dans l'ordre de la fiche, sans le champ déjà rempli.
    const lignes = await proposes(porteur, projet.id);
    assert.deepEqual(
      lignes.map(({ position, field, value, state, character_id }) => [
        position,
        field,
        value,
        state,
        character_id,
      ]),
      [
        [1, "objectif", CHAMPS[0].value, "proposed", awa],
        [2, "arc", CHAMPS[1].value, "proposed", awa],
      ],
    );

    // Toute l'équipe lit ; un étranger, non. Rien n'est entré dans la fiche.
    assert.equal((await proposes(lecteur, projet.id)).length, 2);
    assert.equal((await proposes(etranger, projet.id)).length, 0);
    assert.equal((await fiche(porteur, awa)).goal, "");

    // Un lecteur et un étranger ne décident pas.
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_champ_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_champ_propose", {
        p_line_id: lignes[0].id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Une correction hors bornes est refusée, sans rien écrire.
    for (const corrige of ["   ", "a".repeat(601)]) {
      const { error } = await porteur.client.rpc("accepter_champ_propose", {
        p_line_id: lignes[0].id,
        p_corrige: corrige,
      });
      assert.equal(error?.code, "22023", corrige.slice(0, 10));
    }
    assert.equal((await fiche(porteur, awa)).goal, "");

    // L'éditeur accepte l'objectif tel quel ; le porteur corrige l'arc.
    const { data: accepte, error: e1 } = await editeur.client.rpc("accepter_champ_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1);
    assert.equal(accepte.state, "accepted");
    const { error: e2 } = await porteur.client.rpc("accepter_champ_propose", {
      p_line_id: lignes[1].id,
      p_corrige: "  Elle part seule.  ",
    });
    assert.ifError(e2);

    const apres = await fiche(porteur, awa);
    assert.equal(apres.goal, CHAMPS[0].value);
    assert.equal(apres.arc, "Elle part seule.");
    // Ni l'âge saisi, ni la description, ni un autre champ ne bougent.
    assert.equal(apres.age, "la quarantaine");
    assert.equal(apres.description, "Pêcheuse.");
    assert.equal(apres.traits, "");

    // Accepter deux fois ne change rien ; écarter après coup est refusé.
    const { error: e1bis } = await editeur.client.rpc("accepter_champ_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1bis);
    const { error: tard } = await porteur.client.rpc("ecarter_champ_propose", {
      p_line_id: lignes[0].id,
    });
    assert.equal(tard?.code, "PR001");

    // Plus rien n'attend : la proposition est close, appliquée.
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");
  });

  it("le devis est refusé avant toute dépense : documentaire, personnage d'ailleurs, fiche complète", async () => {
    const porteur = await creerCompte("fiche-devis");
    const projet = await creerProjet(porteur, "Projet aux devis");
    const awa = await saisir(porteur, projet.id);
    const ailleurs = await creerProjet(porteur, "Autre projet");
    const autre = await saisir(porteur, ailleurs.id);

    // Sans personnage, ou avec un personnage d'un autre projet.
    for (const params of [{}, { character: "pas-un-identifiant" }, { character: autre }]) {
      const { error } = await devis(porteur, projet.id, params);
      assert.equal(error?.code, "22023", JSON.stringify(params));
    }

    // Une fiche déjà complète : plus rien à proposer.
    const complet = await saisir(porteur, projet.id, {
      age: "40 ans",
      occupation: "Pêcheuse",
      appearance: "Grande.",
      goal: "Rester.",
      obstacle: "Le fleuve.",
      arc: "Elle reste.",
      traits: "Têtue.",
      relations: "Sœur du chef.",
    });
    const { error: plein } = await devis(porteur, projet.id, { character: complet });
    assert.equal(plein?.code, "55000");
    assert.match(plein.message, /déjà complète/);

    // Un documentaire : ses personnages sont des personnes réelles.
    await porteur.client.from("projects").update({ format: "documentaire" }).eq("id", projet.id);
    const { error: reel } = await devis(porteur, projet.id, { character: awa });
    assert.equal(reel?.code, "55000");
    assert.match(reel.message, /documentaire/);

    // Aucun devis, donc aucune tâche ni proposition.
    const { count } = await porteur.client
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projet.id);
    assert.equal(count, 0);
  });

  it("un champ rempli depuis la demande n'est pas remplacé ; un personnage retiré ne reçoit rien", async () => {
    const porteur = await creerCompte("fiche-entre-temps");
    const projet = await creerProjet(porteur, "Projet qui bouge");
    const awa = await saisir(porteur, projet.id);

    await lancer(porteur, projet, awa, "fiche-entre-temps-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(CHAMPS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);
    assert.equal(lignes.length, 2);

    // L'équipe remplit l'objectif elle-même, avant de décider.
    await porteur.client
      .from("project_characters")
      .update({ goal: "Écrit à la main." })
      .eq("id", awa);
    const { error: rempli } = await porteur.client.rpc("accepter_champ_propose", {
      p_line_id: lignes[0].id,
    });
    assert.equal(rempli?.code, "PF002");
    assert.equal((await fiche(porteur, awa)).goal, "Écrit à la main.");
    // La ligne reste à décider : elle peut être écartée.
    assert.equal((await proposes(porteur, projet.id))[0].state, "proposed");

    // Le personnage est retiré : le lien se vide, et plus rien ne s'accepte.
    await porteur.client.from("project_characters").delete().eq("id", awa);
    const restantes = await proposes(porteur, projet.id);
    assert.deepEqual(
      restantes.map((ligne) => [ligne.state, ligne.character_id]),
      [
        ["proposed", null],
        ["proposed", null],
      ],
    );
    const { error: retire } = await porteur.client.rpc("accepter_champ_propose", {
      p_line_id: lignes[1].id,
    });
    assert.equal(retire?.code, "PF001");

    // Écarter reste possible, et clôt la proposition.
    for (const ligne of restantes) {
      const { error } = await porteur.client.rpc("ecarter_champ_propose", { p_line_id: ligne.id });
      assert.ifError(error);
    }
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("project_id", projet.id)
      .single();
    assert.equal(close.state, "dismissed");
  });

  it("une fiche complétée pendant l'attente : rien ne part chez le fournisseur", async () => {
    const porteur = await creerCompte("fiche-avant-appel");
    const projet = await creerProjet(porteur, "Projet devancé");
    const awa = await saisir(porteur, projet.id, {
      age: "40 ans",
      occupation: "Pêcheuse",
      appearance: "Grande.",
      goal: "Rester.",
      obstacle: "Le fleuve.",
      arc: "Elle reste.",
      traits: "Têtue.",
    });

    const tache = await lancer(porteur, projet, awa, "fiche-avant-appel-cle");
    // Le dernier champ vide est rempli avant que le worker ne prenne la tâche.
    await porteur.client
      .from("project_characters")
      .update({ relations: "Sœur du chef." })
      .eq("id", awa);

    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(CHAMPS)));
    // Deux essais au plus : aucun ne part chez le fournisseur.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(demandes.length, 0, "aucun appel au fournisseur");
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "failed");
    assert.equal((await proposes(porteur, projet.id)).length, 0);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("fiche-hors-bornes");
    const projet = await creerProjet(porteur, "Projet mal servi");
    const awa = await saisir(porteur, projet.id);

    const tache = await lancer(porteur, projet, awa, "fiche-hors-bornes-cle");
    const { fournisseur } = fournisseurFactice(
      reponseFactice(enJson([{ field: "arc", value: "a".repeat(801) }])),
    );
    // Deux essais au plus : la même réponse invalide fait échouer la tâche.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "failed");
    assert.match(travail.reason, /fiche de personnage exploitable/);
    assert.equal((await proposes(porteur, projet.id)).length, 0);
    assert.equal((await fiche(porteur, awa)).arc, "");
  });

  it("ce que l'agent a proposé ne change pas, et ne se supprime pas", async () => {
    const porteur = await creerCompte("fiche-intangible");
    const projet = await creerProjet(porteur, "Projet tenu");
    const awa = await saisir(porteur, projet.id);
    await lancer(porteur, projet, awa, "fiche-intangible-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(CHAMPS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const [ligne] = await proposes(porteur, projet.id);

    // Aucune écriture directe pour un compte.
    const { data: modifie } = await porteur.client
      .from("ai_suggestion_character_fields")
      .update({ value: "Réécrit." })
      .eq("id", ligne.id)
      .select("id");
    assert.deepEqual(modifie ?? [], []);

    // Ni même hors de la RLS : la base refuse.
    for (const requete of [
      `update public.ai_suggestion_character_fields set value = 'Réécrit.' where id = '${ligne.id}';`,
      `update public.ai_suggestion_character_fields set field = 'traits' where id = '${ligne.id}';`,
      `delete from public.ai_suggestion_character_fields where id = '${ligne.id}';`,
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete.slice(0, 60));
    }
    assert.equal((await proposes(porteur, projet.id))[0].value, CHAMPS[0].value);
  });
});
