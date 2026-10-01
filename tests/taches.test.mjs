/**
 * Tâches persistantes (lot H1), par l'API réelle et par deux vraies
 * sessions PostgreSQL jouant deux workers.
 *
 * Le worker n'a pas encore de connexion (lot H2) : ses sessions passent par
 * le conteneur de la base locale et prennent son rôle, `filmfund_worker`,
 * qui n'a aucun droit sur les tables et n'exécute que ses fonctions.
 *
 * Les autres suites laissent des tâches en attente, que le worker prendrait
 * en premier : les tests de réclamation les écartent d'abord.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  creerCompte,
  creerProjet,
  executerSqlLocal as session,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const REFUS = "42501";
const DEJA_PRISE = "TR002";

/** Devis accepté : renvoie la tâche née de la réservation. */
async function engager(compte, projetId, action, cle) {
  const { data: devis, error } = await compte.client.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: action,
    p_params: {},
  });
  assert.ifError(error);
  const { data: reservation, error: refus } = await compte.client.rpc("accepter_devis", {
    p_quote_id: devis[0].quote_id,
    p_idempotency_key: cle,
  });
  assert.ifError(refus);
  const { data: tache } = await compte.client
    .from("jobs")
    .select("id, state, action")
    .eq("reservation_id", reservation.id)
    .single();
  return tache;
}

/** Réclamation par un worker, sous son rôle, qui garde son verrou `attente` secondes. */
function reclamationEnSession(worker, attente) {
  return `
    begin;
    set local role filmfund_worker;
    select 'pris:' || job_id from public.reclamer_travail('${worker}');
    select pg_sleep(${attente});
    commit;
  `;
}

/**
 * Les tâches laissées en attente par les autres suites passeraient avant
 * celles du test : elles sont annulées et leurs réservations rendues, comme
 * le ferait leur porteur.
 */
function annulerLesAutres(gardees) {
  const liste = gardees.map((id) => `'${id}'`).join(", ");
  return `
    select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par un test de réclamation'))
    from public.jobs j
    where j.state = 'queued' and j.id not in (${liste});
  `;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const prises = (sortie) => [...sortie.matchAll(/pris:([0-9a-f-]{36})/g)].map((m) => m[1]);

describe("Tâches persistantes", () => {
  let administrateur;

  before(async () => {
    administrateur = await creerCompte("admin-taches", "Administration");
    await promouvoirAdministrateur(administrateur.id);
  });

  it("une tâche naît avec chaque réservation, visible de l'équipe seulement", async () => {
    const porteur = await creerCompte("taches-porteur");
    const lecteur = await creerCompte("taches-lecteur");
    const etranger = await creerCompte("taches-etranger");
    const projet = await creerProjet(porteur, "Projet des tâches");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const tache = await engager(porteur, projet.id, "logline", "naissance");
    assert.deepEqual([tache.state, tache.action], ["queued", "logline"]);

    const { data: vuParLecteur } = await lecteur.client.from("jobs").select("id");
    assert.deepEqual(vuParLecteur, [{ id: tache.id }]);

    const { data: vuParEtranger } = await etranger.client.from("jobs").select("id");
    assert.deepEqual(vuParEtranger, []);
    const { data: essais } = await etranger.client.from("job_attempts").select("id");
    assert.deepEqual(essais, []);
  });

  it("le navigateur n'écrit pas de tâche et n'appelle pas les fonctions du worker", async () => {
    const porteur = await creerCompte("taches-ecriture");
    const projet = await creerProjet(porteur, "Projet sans raccourci");
    const tache = await engager(porteur, projet.id, "logline", "ecriture");

    const { error: modification } = await porteur.client
      .from("jobs")
      .update({ state: "succeeded" })
      .eq("id", tache.id)
      .select("id");
    assert.ok(modification, "la modification d'une tâche doit être refusée");

    for (const [fonction, args] of [
      ["reclamer_travail", { p_worker: "navigateur" }],
      ["recuperer_travaux_expires", {}],
      ["rapprocher_travail", { p_job_id: tache.id, p_success: true }],
    ]) {
      const { error } = await porteur.client.rpc(fonction, args);
      assert.ok(error, `${fonction} doit être refusée au navigateur`);
    }
  });

  it("le porteur et un éditeur annulent une tâche en attente ; un lecteur non", async () => {
    const porteur = await creerCompte("taches-annulation");
    const editeur = await creerCompte("taches-annulation-editeur");
    const lecteur = await creerCompte("taches-annulation-lecteur");
    const projet = await creerProjet(porteur, "Projet annulé");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const premiere = await engager(porteur, projet.id, "logline", "annulation-1");
    const seconde = await engager(porteur, projet.id, "logline", "annulation-2");

    const { error: parLecteur } = await lecteur.client.rpc("annuler_travail", {
      p_job_id: premiere.id,
    });
    assert.equal(parLecteur?.code, REFUS);

    const { data: parPorteur, error } = await porteur.client.rpc("annuler_travail", {
      p_job_id: premiere.id,
    });
    assert.ifError(error);
    assert.equal(parPorteur.state, "cancelled");

    const { data: parEditeur, error: refusEditeur } = await editeur.client.rpc("annuler_travail", {
      p_job_id: seconde.id,
    });
    assert.ifError(refusEditeur);
    assert.equal(parEditeur.state, "cancelled");

    const { data: reglements } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released");
    assert.deepEqual(reglements, [
      { consumed: 0, released: 1 },
      { consumed: 0, released: 1 },
    ]);
  });

  it("un administrateur annule la tâche d'un projet dont il n'est pas, et c'est journalisé", async () => {
    const porteur = await creerCompte("taches-admin");
    const projet = await creerProjet(porteur, "Projet surveillé");
    const tache = await engager(porteur, projet.id, "logline", "admin");

    const { data, error } = await administrateur.client.rpc("annuler_travail", {
      p_job_id: tache.id,
    });
    assert.ifError(error);
    assert.equal(data.state, "cancelled");

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", projet.id)
      .eq("actor_id", administrateur.id)
      .eq("details->>table", "jobs");
    assert.deepEqual(journal, [
      {
        action: "intervention_contenu",
        details: { table: "jobs", operation: "update", ligne: tache.id },
      },
    ]);
  });

  it("deux workers simultanés : chacun sa tâche, sans attendre l'autre", async () => {
    const porteur = await creerCompte("taches-course");
    const projet = await creerProjet(porteur, "Projet disputé");
    const a = await engager(porteur, projet.id, "logline", "course-a");
    const b = await engager(porteur, projet.id, "logline", "course-b");

    const nettoyage = await session(annulerLesAutres([a.id, b.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    const debut = Date.now();
    const premier = session(reclamationEnSession("worker-1", 2)).then((r) => ({
      ...r,
      fin: Date.now() - debut,
    }));
    await pause(500);
    const second = session(reclamationEnSession("worker-2", 0)).then((r) => ({
      ...r,
      fin: Date.now() - debut,
    }));
    const [s1, s2] = await Promise.all([premier, second]);

    assert.equal(s1.code, 0, s1.erreurs);
    assert.equal(s2.code, 0, s2.erreurs);
    const [p1] = prises(s1.sortie);
    const [p2] = prises(s2.sortie);
    assert.ok(p1 && p2, "chaque worker doit obtenir une tâche");
    assert.notEqual(p1, p2, "deux workers ne prennent jamais la même tâche");
    assert.deepEqual([p1, p2].sort(), [a.id, b.id].sort());
    // Le premier garde son verrou deux secondes : un second worker qui
    // attendrait finirait après lui, pas une demi-seconde avant.
    assert.ok(
      s2.fin + 500 < s1.fin,
      `le second worker saute la tâche verrouillée au lieu d'attendre (${s2.fin} ms contre ${s1.fin} ms)`,
    );

    const { data: essais } = await porteur.client.from("job_attempts").select("number");
    assert.deepEqual(essais, [{ number: 1 }, { number: 1 }]);
  });

  it("une tâche en cours ne s'annule plus", async () => {
    const porteur = await creerCompte("taches-en-cours");
    const projet = await creerProjet(porteur, "Projet en cours");
    const tache = await engager(porteur, projet.id, "logline", "en-cours");

    const prise = await session(`
      ${annulerLesAutres([tache.id])}
      set role filmfund_worker;
      select 'pris:' || job_id from public.reclamer_travail('worker-annulation');
    `);
    assert.equal(prise.code, 0, prise.erreurs);
    assert.deepEqual(prises(prise.sortie), [tache.id]);

    const { error } = await porteur.client.rpc("annuler_travail", { p_job_id: tache.id });
    assert.equal(error?.code, DEJA_PRISE);
  });
});
