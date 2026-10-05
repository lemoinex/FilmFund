/**
 * FIELD (lot J3b-3a) : la proposition de jalons de planning, de la tâche
 * réclamée au jalon entré au planning, contre la base locale et sous le rôle
 * du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les jalons qu'il
 * propose : cela se vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContextePlanning,
  executeursField,
  lireJalons,
} from "../worker/src/agents/field.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { PROFIL_PLANNING } from "../worker/src/ia/profils.ts";
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

const JALONS = [
  { title: "Repérages au village", phase: "preproduction", duration_days: 5 },
  { title: "Tournage", phase: "production", duration_days: 10 },
  { title: "Montage image", phase: "postproduction", duration_days: 30 },
];
const enJson = (jalons) => JSON.stringify({ lines: jalons });

describe("FIELD : lecture des jalons", () => {
  it("rend les jalons, titres resserrés", () => {
    assert.deepEqual(
      lireJalons(
        enJson([{ title: "  Casting\n principal ", phase: "preproduction", duration_days: 8 }]),
        30,
      ),
      [{ title: "Casting principal", phase: "preproduction", duration_days: 8 }],
    );
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    const valide = JALONS[0];
    for (const [quoi, texte] of [
      ["du texte", "Voici le planning."],
      ["une liste vide", enJson([])],
      ["aucune liste", JSON.stringify({ jalons: [valide] })],
      ["trop de jalons", enJson(Array.from({ length: 31 }, () => valide))],
      ["une phase inconnue", enJson([valide, { ...valide, phase: "diffusion" }])],
      ["la phase « terminé »", enJson([{ ...valide, phase: "termine" }])],
      ["un titre vide", enJson([{ ...valide, title: "   " }])],
      ["un titre trop long", enJson([{ ...valide, title: "x".repeat(201) }])],
      ["une durée nulle", enJson([{ ...valide, duration_days: 0 }])],
      ["une durée décimale", enJson([{ ...valide, duration_days: 2.5 }])],
      ["une durée démesurée", enJson([{ ...valide, duration_days: 731 }])],
      ["une durée en texte", enJson([{ ...valide, duration_days: "5" }])],
      ["un jalon qui n'en est pas un", enJson([valide, null])],
    ]) {
      assert.equal(lireJalons(texte, 30), null, quoi);
    }
  });

  it("le message porte le planning déjà saisi, jamais le budget, et l'objectif en dernier", () => {
    const message = composerContextePlanning(
      {
        action: "schedule_plan",
        projet: {
          titre: "Le Fleuve immobile",
          format: "court_metrage",
          etape: "ecriture",
          genre: null,
          pays: ["CM"],
          langues: null,
          duree: 20,
        },
        contexte: {
          pitch: "Un passeur.",
          synopsis_court: null,
          synopsis: null,
          theme: null,
          enjeux: null,
        },
        vision: { artistique: null, objectifs: null, public: null },
        personnages: 2,
        planning: [
          {
            titre: "Écriture du scénario",
            phase: "ecriture",
            statut: "en_cours",
            debut: "2026-11-01",
            echeance: null,
          },
        ],
      },
      PROFIL_PLANNING.objectif,
    );
    assert.ok(
      message.includes(
        "- Écriture du scénario (ecriture, en cours) : du 2026-11-01 au (non renseigné)",
      ),
      message,
    );
    assert.ok(message.includes("Nombre de personnages : 2"), message);
    assert.doesNotMatch(message, /budget|Devise/i);
    assert.ok(message.endsWith("Propose les jalons du planning de ce projet."), message);
  });
});

describe("FIELD : proposition de planning", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-planning", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-planning-test",
    executeurs: executeursField(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function lancer(porteur, projet, cle) {
    const tache = await engager(porteur, projet.id, "schedule_plan", cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const jalonsProposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_milestones")
      .select("id, position, title, phase, duration_days, state, milestone_id")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const planning = async (compte, projetId) => {
    const { data } = await compte.client
      .from("project_milestones")
      .select("id, title, phase, starts_on, due_on, notes")
      .eq("project_id", projetId)
      .order("created_at");
    return data ?? [];
  };

  it("du devis aux jalons : dépôt, lecture par l'équipe, acceptation jalon par jalon", async () => {
    const porteur = await creerCompte("planning-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const lecteur = await creerCompte("planning-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("planning-etranger");

    const { error: saisie } = await porteur.client
      .from("project_milestones")
      .insert({ project_id: projet.id, title: "Écriture du scénario", phase: "ecriture" });
    assert.ifError(saisie);

    // Trois unités, sans budget ouvert : le planning n'en dépend pas.
    const { data: devis, error: refusDevis } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "schedule_plan",
      p_params: {},
    });
    assert.ifError(refusDevis);
    assert.equal(devis[0].quantity, 3);

    const tache = await lancer(porteur, projet, "planning-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(JALONS)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil du planning, son schéma, et le planning déjà saisi.
    assert.equal(demandes[0].profil.id, PROFIL_PLANNING.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /- Écriture du scénario \(ecriture, a faire\)/);
    assert.doesNotMatch(demandes[0].message, /Devise/);

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "3 jalons de planning proposés par l'assistant.");
    assert.equal(proposition.profile, PROFIL_PLANNING.id);
    assert.equal(proposition.state, "proposed");

    // Le planning se lit de toute l'équipe : ses propositions aussi. Pas d'un étranger.
    const proposes = await jalonsProposes(porteur, projet.id);
    assert.deepEqual(
      proposes.map(({ title, phase, duration_days, state }) => ({
        title,
        phase,
        duration_days,
        state,
      })),
      JALONS.map((jalon) => ({ ...jalon, state: "proposed" })),
    );
    assert.equal((await jalonsProposes(lecteur, projet.id)).length, 3);
    assert.equal((await jalonsProposes(etranger, projet.id)).length, 0);

    // Rien n'entre au planning tant que rien n'est accepté.
    assert.equal((await planning(porteur, projet.id)).length, 1);

    // Décider reste à qui écrit le planning : ni lecteur, ni étranger.
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_jalon_propose", {
        p_line_id: proposes[0].id,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_jalon_propose", {
        p_line_id: proposes[0].id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_milestones")
      .update({ state: "accepted" })
      .eq("id", proposes[0].id);
    assert.ok(direct, "une mise à jour directe doit être refusée");

    // Une échéance avant le début, une phase qui n'en est pas une : refusées.
    const { error: dates } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[0].id,
      p_starts_on: "2027-02-10",
      p_due_on: "2027-02-01",
    });
    assert.equal(dates?.code, "22023");
    const { error: phase } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[0].id,
      p_phase: "termine",
    });
    assert.equal(phase?.code, "22023");

    // Premier jalon : accepté tel quel, daté par l'équipe.
    const { data: date, error: e1 } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[0].id,
      p_starts_on: "2027-02-01",
      p_due_on: "2027-02-05",
    });
    assert.ifError(e1);
    assert.equal(date.state, "accepted");

    // Deuxième : corrigé, sans date. La durée estimée est gardée dans les notes.
    const { error: e2 } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[1].id,
      p_title: "Tournage au village",
    });
    assert.ifError(e2);

    // Accepter deux fois ne crée pas deux jalons.
    const { error: e1bis } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[0].id,
    });
    assert.ifError(e1bis);

    // Troisième : écarté. Plus rien n'attend : la proposition se clôt, appliquée.
    const { error: e3 } = await porteur.client.rpc("ecarter_jalon_propose", {
      p_line_id: proposes[2].id,
    });
    assert.ifError(e3);
    const { error: tard } = await porteur.client.rpc("accepter_jalon_propose", {
      p_line_id: proposes[2].id,
    });
    assert.equal(tard?.code, "PR001");

    assert.deepEqual(
      (await planning(porteur, projet.id)).map(({ title, phase, starts_on, due_on, notes }) => ({
        title,
        phase,
        starts_on,
        due_on,
        notes,
      })),
      [
        {
          title: "Écriture du scénario",
          phase: "ecriture",
          starts_on: null,
          due_on: null,
          notes: "",
        },
        {
          title: "Repérages au village",
          phase: "preproduction",
          starts_on: "2027-02-01",
          due_on: "2027-02-05",
          notes: "",
        },
        {
          title: "Tournage au village",
          phase: "production",
          starts_on: null,
          due_on: null,
          notes: "Durée estimée par l'assistant : 10 jours.",
        },
      ],
    );

    // Ce que l'agent avait proposé reste inscrit, à l'identique.
    const apres = await jalonsProposes(porteur, projet.id);
    assert.deepEqual(
      apres.map(({ title, state }) => [title, state]),
      [
        ["Repérages au village", "accepted"],
        ["Tournage", "accepted"],
        ["Montage image", "dismissed"],
      ],
    );
    assert.ok(apres[0].milestone_id && apres[1].milestone_id);
    assert.equal(apres[2].milestone_id, null);

    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Supprimer ensuite un jalon du planning ne défait pas la décision.
    const { error: suppression } = await porteur.client
      .from("project_milestones")
      .delete()
      .eq("id", apres[0].milestone_id);
    assert.ifError(suppression);
    const detache = (await jalonsProposes(porteur, projet.id))[0];
    assert.equal(detache.state, "accepted");
    assert.equal(detache.milestone_id, null);
  });

  it("écarter la proposition d'un bloc écarte les jalons restants", async () => {
    const porteur = await creerCompte("planning-bloc");
    const projet = await creerProjet(porteur, "D'un bloc");
    const tache = await lancer(porteur, projet, "planning-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(JALONS)));
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
      (await jalonsProposes(porteur, projet.id)).map((jalon) => jalon.state),
      ["dismissed", "dismissed", "dismissed"],
    );
    assert.equal((await planning(porteur, projet.id)).length, 0);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("planning-hors-bornes");
    const projet = await creerProjet(porteur, "Hors bornes");
    const tache = await lancer(porteur, projet, "planning-hors-bornes-cle");
    const invalide = enJson([JALONS[0], { ...JALONS[1], duration_days: 5000 }]);
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
    assert.match(finale.reason, /liste de jalons exploitable/);
    assert.equal((await jalonsProposes(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_planning('00000000-0000-0000-0000-000000000000', '[]'::jsonb);",
    );
    assert.notEqual(resultat.code, 0);
  });
});
