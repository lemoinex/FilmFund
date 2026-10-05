/**
 * FIELD (lot J3b-1) : la proposition de lignes de budget, de la tâche
 * réclamée à la ligne entrée au budget, contre la base locale et sous le
 * rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur — ni que le schéma de sortie y est
 * accepté : cela se vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContexteBudget,
  executeursField,
  lireLignesBudget,
} from "../worker/src/agents/field.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { PROFIL_BUDGET, PROFILS_FIELD } from "../worker/src/ia/profils.ts";
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

/** Réponse d'un fournisseur factice : le texte donné, facturé 2 000 jetons en entrée et 900 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 2000, jetonsSortie: 900 }],
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

const LIGNES = [
  { category: "materiel", label: "Location caméra (jours)", quantity: 12, unit_cost: 85000 },
  {
    category: "transport_regie",
    label: "Repas de l'équipe (jours)",
    quantity: 12,
    unit_cost: 40000,
  },
];
const enJson = (lignes) => JSON.stringify({ lines: lignes });

describe("FIELD : lecture de la réponse", () => {
  it("rend les lignes, libellés resserrés et nombres arrondis au centime", () => {
    assert.deepEqual(
      lireLignesBudget(
        enJson([
          {
            category: "droits",
            label: "  Musique\n originale ",
            quantity: 1.005,
            unit_cost: 99.999,
          },
        ]),
        40,
      ),
      [{ category: "droits", label: "Musique originale", quantity: 1.01, unit_cost: 100 }],
    );
  });

  it("refuse tout ce que la base refuserait, sans rien garder d'une réponse à moitié valide", () => {
    const valide = LIGNES[0];
    for (const [quoi, texte] of [
      ["du texte", "Voici le budget."],
      ["une liste vide", enJson([])],
      ["aucune liste", JSON.stringify({ lignes: [valide] })],
      ["trop de lignes", enJson(Array.from({ length: 41 }, () => valide))],
      ["une catégorie inconnue", enJson([valide, { ...valide, category: "catering" }])],
      ["un libellé vide", enJson([{ ...valide, label: "   " }])],
      ["un libellé trop long", enJson([{ ...valide, label: "x".repeat(201) }])],
      ["une quantité nulle", enJson([{ ...valide, quantity: 0 }])],
      ["un coût négatif", enJson([{ ...valide, unit_cost: -1 }])],
      ["un nombre en texte", enJson([{ ...valide, unit_cost: "85000" }])],
      ["un coût démesuré", enJson([{ ...valide, unit_cost: 1e12 }])],
      ["une ligne qui n'en est pas une", enJson([valide, null])],
    ]) {
      assert.equal(lireLignesBudget(texte, 40), null, quoi);
    }
  });

  it("le message porte la devise et les lignes déjà saisies, puis l'objectif en dernier", () => {
    const message = composerContexteBudget(
      {
        action: "budget_plan",
        projet: {
          titre: "Le Fleuve immobile",
          format: "long_metrage",
          etape: "ecriture",
          genre: null,
          pays: ["CM"],
          langues: null,
          duree: 90,
        },
        contexte: {
          pitch: "Un passeur.",
          synopsis_court: null,
          synopsis: null,
          theme: null,
          enjeux: null,
        },
        vision: { artistique: null, objectifs: null, public: null },
        personnages: 3,
        budget: {
          devise: "XAF",
          lignes: [{ categorie: "droits", libelle: "Option", quantite: 1, cout_unitaire: 500000 }],
        },
        planning: [],
      },
      PROFIL_BUDGET.objectif,
    );
    assert.ok(message.includes("Devise : XAF"), message);
    assert.ok(message.includes("- droits | Option | quantité 1 | coût unitaire 500000"), message);
    assert.ok(message.includes("Nombre de personnages : 3"), message);
    assert.ok(message.includes("Genre : (non renseigné)"), message);
    assert.ok(message.endsWith("Propose les lignes de budget de ce projet."), message);
  });
});

describe("FIELD : proposition de budget", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-field", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-field-test",
    executeurs: executeursField(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function preparer(prefixe) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const { error } = await porteur.client
      .from("project_budgets")
      .insert({ project_id: projet.id, currency: "XAF" });
    assert.ifError(error);
    return { porteur, projet };
  }

  async function lancer(porteur, projet, cle) {
    const tache = await engager(porteur, projet.id, "budget_plan", cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const lignesProposees = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_budget_lines")
      .select("id, position, category, label, quantity, unit_cost, state, budget_line_id")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  it("sans budget ouvert, aucun devis : la devise manquerait", async () => {
    const porteur = await creerCompte("field-sans-budget");
    const projet = await creerProjet(porteur, "Sans budget");
    const { error } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "budget_plan",
      p_params: {},
    });
    assert.equal(error?.code, "55000");
  });

  it("du devis aux lignes : dépôt, cloisonnement, acceptation ligne par ligne", async () => {
    const { porteur, projet } = await preparer("field-chemin");
    const lecteur = await creerCompte("field-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("field-etranger");

    const { error: saisie } = await porteur.client.from("budget_lines").insert({
      project_id: projet.id,
      category: "droits",
      label: "Option sur le roman",
      quantity: 1,
      unit_cost: 500000,
      created_by: porteur.id,
    });
    assert.ifError(saisie);

    const tache = await lancer(porteur, projet, "field-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(LIGNES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil de FIELD, son schéma, et ce qu'il lit du budget.
    assert.equal(demandes[0].profil.id, PROFIL_BUDGET.id);
    assert.ok(demandes[0].profil.schema, "le schéma part avec la demande");
    assert.match(demandes[0].message, /Devise : XAF/);
    assert.match(demandes[0].message, /Option sur le roman/);
    for (const interdit of [porteur.id, porteur.email, projet.id, tache.id]) {
      assert.ok(!demandes[0].message.includes(interdit), interdit);
    }

    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, reservation_id")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "succeeded");
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .single();
    assert.deepEqual(reglement, { consumed: 6, released: 0 });

    // La proposition parente : un texte écrit par la base, sans montant.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile, action")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.action, "budget_plan");
    assert.equal(proposition.profile, PROFIL_BUDGET.id);
    assert.equal(proposition.content, "2 lignes de budget proposées par l'assistant.");
    assert.equal(proposition.state, "proposed");

    const proposees = await lignesProposees(porteur, projet.id);
    assert.deepEqual(
      proposees.map((l) => [l.position, l.category, l.label, l.quantity, l.unit_cost, l.state]),
      [
        [1, "materiel", "Location caméra (jours)", 12, 85000, "proposed"],
        [2, "transport_regie", "Repas de l'équipe (jours)", 12, 40000, "proposed"],
      ],
    );

    // Rien n'entre au budget tant que l'équipe n'a pas décidé.
    const budget = async () => {
      const { data } = await porteur.client
        .from("budget_lines")
        .select("category, label, quantity, unit_cost")
        .eq("project_id", projet.id)
        .order("created_at");
      return data;
    };
    assert.equal((await budget()).length, 1);

    // Le lecteur lit la proposition, comme toute l'équipe — pas ses lignes :
    // le budget ne lui est pas ouvert. L'étranger ne lit rien.
    const { data: vueLecteur } = await lecteur.client
      .from("ai_suggestions")
      .select("content")
      .eq("id", proposition.id);
    assert.deepEqual(vueLecteur, [{ content: "2 lignes de budget proposées par l'assistant." }]);
    assert.deepEqual(await lignesProposees(lecteur, projet.id), []);
    assert.deepEqual(await lignesProposees(etranger, projet.id), []);
    assert.equal((await lignesProposees(administrateur, projet.id)).length, 2);

    // Ni l'un ni l'autre ne décide ; et personne n'écrit directement.
    for (const compte of [lecteur, etranger]) {
      for (const fonction of ["accepter_ligne_budget", "ecarter_ligne_budget"]) {
        const { error } = await compte.client.rpc(fonction, { p_line_id: proposees[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
    }
    const { error: ecriture } = await porteur.client
      .from("ai_suggestion_budget_lines")
      .update({ unit_cost: 1 })
      .eq("id", proposees[0].id);
    assert.ok(ecriture, "une ligne proposée ne s'écrit pas directement");
    assert.equal((await budget()).length, 1);

    // Accepter en corrigeant le coût : la ligne entre au budget, corrigée ;
    // ce que l'agent avait proposé reste inscrit sur la ligne proposée.
    const { data: acceptee, error: refus } = await porteur.client.rpc("accepter_ligne_budget", {
      p_line_id: proposees[0].id,
      p_unit_cost: 70000,
    });
    assert.ifError(refus);
    assert.equal(acceptee.state, "accepted");
    assert.equal(acceptee.unit_cost, 85000);
    assert.deepEqual((await budget())[1], {
      category: "materiel",
      label: "Location caméra (jours)",
      quantity: 12,
      unit_cost: 70000,
    });

    // Accepter deux fois ne crée pas deux lignes.
    const { error: encore } = await porteur.client.rpc("accepter_ligne_budget", {
      p_line_id: proposees[0].id,
    });
    assert.ifError(encore);
    assert.equal((await budget()).length, 2);

    // Tant qu'une ligne attend, la proposition reste ouverte.
    const etat = async () =>
      (
        await porteur.client
          .from("ai_suggestions")
          .select("state")
          .eq("id", proposition.id)
          .single()
      ).data.state;
    assert.equal(await etat(), "proposed");

    const { data: ecartee, error: refusEcart } = await porteur.client.rpc("ecarter_ligne_budget", {
      p_line_id: proposees[1].id,
    });
    assert.ifError(refusEcart);
    assert.equal(ecartee.state, "dismissed");
    assert.equal((await budget()).length, 2);

    // Plus rien n'attend : la proposition est close, appliquée puisqu'une
    // ligne au moins est entrée au budget.
    assert.equal(await etat(), "accepted");
    const { error: tardif } = await porteur.client.rpc("accepter_ligne_budget", {
      p_line_id: proposees[1].id,
    });
    assert.equal(tardif?.code, "PR001");
  });

  it("écarter la proposition entière écarte les lignes qui restaient", async () => {
    const { porteur, projet } = await preparer("field-ecart");
    const tache = await lancer(porteur, projet, "field-ecart-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(LIGNES)));
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

    const proposees = await lignesProposees(porteur, projet.id);
    assert.deepEqual(
      proposees.map((l) => l.state),
      ["dismissed", "dismissed"],
    );
    const { error: tardif } = await porteur.client.rpc("accepter_ligne_budget", {
      p_line_id: proposees[0].id,
    });
    assert.equal(tardif?.code, "PR001");

    // Une proposition de budget ne s'applique pas d'un bloc, comme un texte.
    const { error: bloc } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ok(bloc, "accepter_proposition ne sait pas appliquer un budget");
  });

  it("une réponse hors bornes échoue : rien n'est déposé, les unités sont rendues", async () => {
    const { porteur, projet } = await preparer("field-invalide");
    const tache = await lancer(porteur, projet, "field-invalide-cle");
    const invalide = reponseFactice(enJson([{ ...LIGNES[0], category: "catering" }]));
    const { fournisseur } = fournisseurFactice(invalide, invalide);

    // Deux échecs connus : la tâche échoue, sans troisième essai.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, attempts, reason, reservation_id")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "failed");
    assert.equal(travail.attempts, 2);
    assert.match(travail.reason, /n'est pas une liste de lignes exploitable/);

    assert.deepEqual(await lignesProposees(porteur, projet.id), []);
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .single();
    assert.deepEqual([reglement.consumed, reglement.released], [0, 6]);
  });

  it("sait exécuter le budget et le planning, et eux seuls", () => {
    const { fournisseur } = fournisseurFactice(reponseFactice("x"));
    assert.deepEqual(Object.keys(executeursField(base, fournisseur)), Object.keys(PROFILS_FIELD));
    assert.deepEqual(Object.keys(PROFILS_FIELD), ["budget_plan", "schedule_plan"]);
  });
});
