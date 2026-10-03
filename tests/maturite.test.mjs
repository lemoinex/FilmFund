/**
 * Score de maturité (lots S1 et S2) : les faits d'un projet selon qui les
 * demande, seul ou en lot, et les pondérations versionnées, contre la base
 * locale.
 *
 * Le calcul lui-même a sa propre suite, sans base. Ici se vérifie ce que la
 * RLS laisse lire : le score tient compte du budget et des financements, que
 * les lecteurs d'une équipe ne lisent pas.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  calculerMaturite,
  LIMITE_SCORES_LISTE,
  lireFaits,
  lirePonderations,
} from "../src/lib/maturite.ts";
import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const COLONNES =
  "version_number, concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier";

/** Faits attendus du projet d'essai, pour qui lit tout. */
const FAITS = {
  pitch: true,
  synopsis_court: true,
  theme: false,
  genre: true,
  synopsis: false,
  vision: true,
  duree: true,
  pays: true,
  langues: false,
  public: true,
  objectifs: false,
  budget_ouvert: true,
  personnages: 2,
  personnages_principaux: 1,
  personnages_decrits: 1,
  recits: 1,
  recits_finalises: 0,
  notes_intention: 1,
  notes_intention_finalisees: 1,
  documents_finalises: 1,
  presentations: 1,
  etapes_datees: 1,
  lignes_budget: 2,
  postes_budget: 2,
  candidatures: 2,
  candidatures_chiffrees: 1,
};

const faitsPour = async (compte, projetId) => {
  const { data, error } = await compte.client.rpc("faits_maturite", { p_project_id: projetId });
  assert.ifError(error);
  return data;
};

const derniereVersion = async (compte) => {
  const { data, error } = await compte.client
    .from("readiness_weight_versions")
    .select(COLONNES)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  assert.ifError(error);
  return data;
};

describe("Score de maturité : faits d'un projet", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;

  before(async () => {
    porteur = await creerCompte("maturite-porteur");
    editeur = await creerCompte("maturite-editeur");
    lecteur = await creerCompte("maturite-lecteur");
    etranger = await creerCompte("maturite-etranger");
    administrateur = await creerCompte("maturite-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Le Projet mesuré");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const ok = ({ error }, quoi) => assert.ifError(error, quoi);
    const duProjet = { project_id: projet.id, created_by: porteur.id };

    ok(
      await porteur.client
        .from("projects")
        .update({
          logline: "Un pitch.",
          short_synopsis: "Un synopsis court.",
          genre: "drame",
          artistic_vision: "Une vision.",
          duration_minutes: 90,
          countries: ["CM"],
          audience: "Un public.",
        })
        .eq("id", projet.id),
      "fiche",
    );
    ok(
      await porteur.client.from("project_characters").insert([
        { ...duProjet, name: "Awa", role: "principal", description: "Décrite.", position: 1 },
        { ...duProjet, name: "Bello", role: "secondaire", description: "", position: 2 },
      ]),
      "personnages",
    );
    ok(
      await porteur.client.from("project_documents").insert([
        { ...duProjet, type: "note_intention", title: "Note", content: "…", status: "finalise" },
        { ...duProjet, type: "traitement", title: "Traitement", content: "…", status: "brouillon" },
        { ...duProjet, type: "lettre", title: "Lettre", content: "…", status: "brouillon" },
      ]),
      "documents",
    );
    ok(
      await porteur.client.from("project_milestones").insert([
        { ...duProjet, title: "Dépôt", due_on: "2027-03-12" },
        { ...duProjet, title: "Sans date" },
      ]),
      "planning",
    );
    ok(
      await porteur.client
        .from("project_budgets")
        .insert({ project_id: projet.id, currency: "XAF" }),
      "budget",
    );
    ok(
      await porteur.client.from("budget_lines").insert([
        { ...duProjet, category: "developpement", label: "Écriture", quantity: 1, unit_cost: 1000 },
        { ...duProjet, category: "postproduction", label: "Montage", quantity: 1, unit_cost: 2000 },
      ]),
      "lignes de budget",
    );
    ok(
      await porteur.client.from("project_fundings").insert([
        { ...duProjet, funder: "Fonds A", currency: "EUR", amount_requested: 25000 },
        { ...duProjet, funder: "Fonds B", currency: "EUR", amount_requested: null },
      ]),
      "financements",
    );
  });

  it("le porteur obtient les faits de son projet : des compteurs et des oui/non, aucun contenu", async () => {
    const faits = await faitsPour(porteur, projet.id);
    assert.deepEqual(faits, FAITS);
    assert.ok(
      Object.values(faits).every((v) => typeof v === "boolean" || typeof v === "number"),
      "ni texte, ni montant, ni identité",
    );
    assert.deepEqual(lireFaits(faits), FAITS, "l'application lit ces faits tels quels");
  });

  it("un éditeur obtient les mêmes faits, et la règle du budget le dit autorisé", async () => {
    assert.deepEqual(await faitsPour(editeur, projet.id), FAITS);
    const { data } = await editeur.client.rpc("peut_gerer_budget", { p_project_id: projet.id });
    assert.equal(data, true);
  });

  it("un lecteur n'y apprend rien du budget ni des financements, et le score ne lui est pas dû", async () => {
    assert.deepEqual(await faitsPour(lecteur, projet.id), {
      ...FAITS,
      budget_ouvert: false,
      lignes_budget: 0,
      postes_budget: 0,
      candidatures: 0,
      candidatures_chiffrees: 0,
    });
    // C'est cette règle que l'écran applique avant d'afficher le score.
    const { data } = await lecteur.client.rpc("peut_gerer_budget", { p_project_id: projet.id });
    assert.equal(data, false);
  });

  it("un compte étranger n'obtient rien, pas plus que pour un projet inexistant", async () => {
    assert.equal(await faitsPour(etranger, projet.id), null);
    assert.equal(await faitsPour(etranger, crypto.randomUUID()), null);
  });

  it("un visiteur n'appelle pas la fonction", async () => {
    const { data, error } = await clientAnonyme().rpc("faits_maturite", {
      p_project_id: projet.id,
    });
    assert.ok(error, "l'appel doit être refusé");
    assert.equal(data, null);
  });

  it("un administrateur hors de l'équipe obtient tous les faits", async () => {
    assert.deepEqual(await faitsPour(administrateur, projet.id), FAITS);
  });

  it("le score se calcule sur ces faits et sur la version en vigueur", async () => {
    const version = lirePonderations(await derniereVersion(porteur));
    assert.ok(version, "une version lisible, de total 100");

    const maturite = calculerMaturite(
      lireFaits(await faitsPour(porteur, projet.id)),
      version.poids,
    );
    // Indépendant des poids : ce qui manque au projet d'essai.
    assert.deepEqual(
      maturite.criteres.flatMap((c) => c.manques),
      [
        "Indiquer le thème",
        "Rédiger le synopsis",
        "Finaliser le traitement ou le scénario",
        "Décrire chaque personnage",
        "Indiquer les langues",
        "Indiquer les objectifs du projet",
      ],
    );
    // Avec les pondérations de mise en service, que les suites ne changent pas.
    assert.equal(maturite.total, 76);
  });

  it("les faits suivent le projet : rien n'est mis de côté", async () => {
    const { error } = await porteur.client
      .from("projects")
      .update({ theme: "La transmission" })
      .eq("id", projet.id);
    assert.ifError(error);
    assert.equal((await faitsPour(porteur, projet.id)).theme, true);

    const { error: retour } = await porteur.client
      .from("projects")
      .update({ theme: "" })
      .eq("id", projet.id);
    assert.ifError(retour);
    assert.equal((await faitsPour(porteur, projet.id)).theme, false);
  });

  // Lot S2 : les listes de projets lisent les faits de plusieurs projets en
  // une fois. La base n'y rend que ceux dont l'appelant gère le budget.
  describe("en lot, pour les listes", () => {
    let projetVoisin;

    const enLot = async (compte, ids) => {
      const { data, error } = await compte.client.rpc("faits_maturite_projets", {
        p_project_ids: ids,
      });
      assert.ifError(error);
      return data;
    };

    before(async () => {
      // Au plan Gratuit, un studio n'a qu'un projet : le second est celui
      // d'un autre compte, étranger à l'équipe du premier.
      projetVoisin = await creerProjet(etranger, "Le Projet voisin");
    });

    it("le porteur et l'éditeur n'obtiennent que les projets dont ils gèrent le budget", async () => {
      const demandes = [projet.id, projetVoisin.id, crypto.randomUUID()];
      assert.deepEqual(await enLot(porteur, demandes), [{ project_id: projet.id, faits: FAITS }]);
      assert.deepEqual(await enLot(editeur, demandes), [{ project_id: projet.id, faits: FAITS }]);
    });

    it("un lecteur n'obtient aucune ligne pour le projet qu'il lit : sa carte reste sans score", async () => {
      assert.deepEqual(await enLot(lecteur, [projet.id, projetVoisin.id]), []);
    });

    it("un compte étranger n'obtient que son propre projet", async () => {
      const lignes = await enLot(etranger, [projet.id, projetVoisin.id]);
      assert.deepEqual(
        lignes.map((ligne) => ligne.project_id),
        [projetVoisin.id],
      );
      assert.ok(lireFaits(lignes[0].faits), "des faits lisibles par l'application");
    });

    it("un administrateur hors des équipes obtient tous les projets demandés", async () => {
      const lignes = await enLot(administrateur, [projet.id, projetVoisin.id]);
      assert.deepEqual(
        lignes.map((ligne) => ligne.project_id).sort(),
        [projet.id, projetVoisin.id].sort(),
      );
      assert.deepEqual(lignes.find((ligne) => ligne.project_id === projet.id).faits, FAITS);
    });

    it("un visiteur n'appelle pas la fonction", async () => {
      const { data, error } = await clientAnonyme().rpc("faits_maturite_projets", {
        p_project_ids: [projet.id],
      });
      assert.ok(error, "l'appel doit être refusé");
      assert.equal(data, null);
    });

    it("cent projets au plus par lecture, comme le plafond de l'application", async () => {
      const identifiants = (nombre) => Array.from({ length: nombre }, () => crypto.randomUUID());

      assert.equal(LIMITE_SCORES_LISTE, 100);
      assert.deepEqual(await enLot(porteur, [...identifiants(99), projet.id]), [
        { project_id: projet.id, faits: FAITS },
      ]);
      assert.deepEqual(await enLot(porteur, []), []);

      const { data, error } = await porteur.client.rpc("faits_maturite_projets", {
        p_project_ids: [...identifiants(100), projet.id],
      });
      assert.equal(error?.code, "22023", "au-delà de cent, la lecture est refusée");
      assert.equal(data, null);
    });

    it("le score d'une liste est celui de la page du projet", async () => {
      const version = lirePonderations(await derniereVersion(porteur));
      const [ligne] = await enLot(porteur, [projet.id]);
      assert.equal(calculerMaturite(lireFaits(ligne.faits), version.poids).total, 76);
    });
  });
});

describe("Score de maturité : pondérations", () => {
  let membre;
  let administrateur;

  before(async () => {
    membre = await creerCompte("ponderations-membre");
    administrateur = await creerCompte("ponderations-admin");
    await promouvoirAdministrateur(administrateur.id);
  });

  /** Valeurs en vigueur, sans le numéro : publier les mêmes ne change rien aux autres suites. */
  const poidsEnVigueur = async () => {
    const version = await derniereVersion(administrateur);
    delete version.version_number;
    return version;
  };

  it("tout compte connecté lit la version en vigueur, de total 100 ; un visiteur, non", async () => {
    assert.ok(lirePonderations(await derniereVersion(membre)));

    const { data, error } = await clientAnonyme()
      .from("readiness_weight_versions")
      .select("version_number");
    assert.ok(error, "la lecture par un visiteur doit être refusée");
    assert.equal(data, null);
  });

  it("un compte ordinaire ne publie pas", async () => {
    const avant = await derniereVersion(membre);
    const { error } = await membre.client
      .from("readiness_weight_versions")
      .insert(await poidsEnVigueur());
    assert.ok(error, "la publication doit être refusée");
    assert.equal((await derniereVersion(membre)).version_number, avant.version_number);
  });

  it("un administrateur publie une version : numérotée par la base, signée, journalisée", async () => {
    const avant = await derniereVersion(administrateur);
    const poids = await poidsEnVigueur();

    const { data: publiee, error } = await administrateur.client
      .from("readiness_weight_versions")
      .insert(poids)
      .select("version_number, published_by, published_at")
      .single();
    assert.ifError(error);
    assert.equal(publiee.version_number, avant.version_number + 1);
    assert.equal(publiee.published_by, administrateur.id);
    assert.ok(Date.now() - new Date(publiee.published_at) < 60_000);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("details")
      .eq("action", "publication_ponderations")
      .eq("actor_id", administrateur.id);
    assert.deepEqual(journal, [{ details: { version: publiee.version_number } }]);
  });

  it("ni le numéro, ni l'auteur, ni la date ne se fournissent", async () => {
    const poids = await poidsEnVigueur();
    for (const fourni of [
      { version_number: 999 },
      { published_by: membre.id },
      { published_at: "2020-01-01T00:00:00Z" },
    ]) {
      const { error } = await administrateur.client
        .from("readiness_weight_versions")
        .insert({ ...poids, ...fourni });
      assert.ok(error, `refus attendu : ${Object.keys(fourni)[0]}`);
    }
  });

  it("le total doit faire 100, sans poids négatif", async () => {
    const poids = await poidsEnVigueur();
    const avant = await derniereVersion(administrateur);

    const { error: tropPeu } = await administrateur.client
      .from("readiness_weight_versions")
      .insert({ ...poids, concept: poids.concept - 1 });
    assert.equal(tropPeu?.code, "23514", "un total de 99 est refusé");

    const { error: negatif } = await administrateur.client
      .from("readiness_weight_versions")
      .insert({ ...poids, dossier: -5, concept: poids.concept + poids.dossier + 5 });
    assert.equal(negatif?.code, "23514", "un poids négatif est refusé, même si le total fait 100");

    assert.equal((await derniereVersion(administrateur)).version_number, avant.version_number);
  });

  it("une version publiée ne se modifie ni ne se supprime, même par un administrateur", async () => {
    const avant = await derniereVersion(administrateur);

    const { error: modification } = await administrateur.client
      .from("readiness_weight_versions")
      .update({ concept: 0 })
      .eq("version_number", avant.version_number);
    assert.ok(modification, "la modification doit être refusée");

    const { error: suppression } = await administrateur.client
      .from("readiness_weight_versions")
      .delete()
      .eq("version_number", avant.version_number);
    assert.ok(suppression, "la suppression doit être refusée");

    assert.deepEqual(await derniereVersion(administrateur), avant);
  });
});
