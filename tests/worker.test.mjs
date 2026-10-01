/**
 * Worker (lot H2) : sa vraie boucle, contre la base locale, connecté sous le
 * rôle `filmfund_worker` comme en production.
 *
 * Les exécuteurs de ce fichier sont FACTICES : ils n'appellent aucun
 * fournisseur. Ils éprouvent la boucle — réclamation, soumission, bail,
 * conclusion, échec, issue inconnue, arrêt —, pas un agent. En production,
 * le registre des exécuteurs est vide jusqu'au lot I.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { marquerSoumise, reclamer, recupererExpires } from "../worker/src/base.ts";
import { demarrerWorker, traiterUnTravail } from "../worker/src/boucle.ts";
import { EchecConnu, EXECUTEURS } from "../worker/src/executeurs.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  engager,
  executerSqlLocal as sql,
  ouvrirBaseDuWorker,
} from "./helpers.mjs";

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Worker", () => {
  let base;
  let journal;

  before(async () => {
    base = await ouvrirBaseDuWorker();
  });

  after(async () => {
    await base.end();
  });

  function options(executeurs, autres = {}) {
    journal = [];
    return {
      base,
      nom: "worker-de-test",
      executeurs,
      journal: (evenement) => journal.push(evenement),
      battementMs: 50,
      ...autres,
    };
  }

  const evenements = () => journal.map((e) => e.evenement);

  /** Un porteur, son projet, et des tâches qui sont les seules en attente. */
  async function preparer(prefixe, actions = ["logline"]) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, `Projet ${prefixe}`);
    const taches = [];
    for (const [i, action] of actions.entries()) {
      taches.push(await engager(porteur, projet.id, action, `${prefixe}-${i}`));
    }
    const nettoyage = await sql(annulerLesAutresTaches(taches.map((t) => t.id)));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return { porteur, taches };
  }

  async function etat(porteur, tacheId) {
    const { data: tache } = await porteur.client
      .from("jobs")
      .select("state, attempts, reason, worker, lease_until, reservation_id")
      .eq("id", tacheId)
      .single();
    const { data: essais } = await porteur.client
      .from("job_attempts")
      .select("number, state")
      .eq("job_id", tacheId)
      .order("number");
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", tache.reservation_id)
      .maybeSingle();
    return { ...tache, essais: essais.map((e) => e.state), reglement };
  }

  async function expirerLeBail(tacheId) {
    const r = await sql(`
      update public.jobs set lease_until = now() - interval '1 minute' where id = '${tacheId}';
    `);
    assert.equal(r.code, 0, r.erreurs);
  }

  /**
   * Un autre acteur récupère la tâche, bail expiré. En une transaction :
   * sinon le battement du worker, qui prolonge le bail toutes les 50 ms dans
   * ces tests, le rétablirait entre l'expiration et la récupération.
   */
  async function faireRecuperer(tacheId) {
    const r = await sql(`
      begin;
      update public.jobs set lease_until = now() - interval '1 minute' where id = '${tacheId}';
      select public.recuperer_travaux_expires();
      commit;
    `);
    assert.equal(r.code, 0, r.erreurs);
  }

  it("se connecte sous son rôle, sans accès direct aux tables", async () => {
    const { rows } = await base.query("select current_user as role");
    assert.equal(rows[0].role, "filmfund_worker");

    await assert.rejects(base.query("select id from public.jobs limit 1"), { code: "42501" });
    await assert.rejects(base.query("select public.regler_reservation(gen_random_uuid(), 0)"), {
      code: "42501",
    });
  });

  it("en production, aucun exécuteur : aucune tâche n'est prise, elle attend", async () => {
    assert.deepEqual(Object.keys(EXECUTEURS), []);

    const { porteur, taches } = await preparer("worker-vide");
    assert.equal(await traiterUnTravail(options(EXECUTEURS)), false);
    assert.equal((await etat(porteur, taches[0].id)).state, "queued");
  });

  it("ne prend que les actions qu'il sait exécuter", async () => {
    const { porteur, taches } = await preparer("worker-savoir", ["treatment"]);
    let appels = 0;
    const factice = { logline: async () => ({ consomme: (appels += 1) }) };

    assert.equal(await traiterUnTravail(options(factice)), false);
    assert.equal(appels, 0);
    assert.equal((await etat(porteur, taches[0].id)).state, "queued");
  });

  it("succès : soumet avant d'exécuter, conclut et règle", async () => {
    const { porteur, taches } = await preparer("worker-succes", ["treatment"]);
    let recu;
    let etatPendant;
    const factice = {
      treatment: async (travail) => {
        recu = travail;
        etatPendant = await etat(porteur, taches[0].id);
        return { consomme: 5 };
      },
    };

    assert.equal(await traiterUnTravail(options(factice)), true);

    assert.equal(recu.jobId, taches[0].id);
    assert.equal(recu.action, "treatment");
    assert.deepEqual(
      [etatPendant.state, etatPendant.essais],
      ["running", ["submitted"]],
      "l'essai est marqué soumis avant que l'exécuteur ne soit appelé",
    );

    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual(
      [fin.state, fin.essais, fin.worker],
      ["succeeded", ["completed"], "worker-de-test"],
    );
    assert.deepEqual(fin.reglement, { consumed: 5, released: 3 });
    assert.deepEqual(evenements(), ["tache_reclamee", "tache_reussie"]);
  });

  it("le journal ne contient ni paramètres ni contenu : des repères seulement", async () => {
    const { taches } = await preparer("worker-journal");
    await traiterUnTravail(options({ logline: async () => ({}) }));

    for (const evenement of journal) {
      const cles = Object.keys(evenement).sort();
      assert.ok(
        cles.every((c) =>
          ["action", "dureeMs", "essai", "evenement", "niveau", "tache"].includes(c),
        ),
        `clés inattendues : ${cles}`,
      );
      assert.equal(evenement.tache, taches[0].id);
    }
  });

  it("échec connu : une reprise, qui peut réussir", async () => {
    const { porteur, taches } = await preparer("worker-reprise");
    const factice = {
      logline: async (travail) => {
        if (travail.attemptNumber === 1) {
          throw new EchecConnu("Refus du fournisseur factice");
        }
        return {};
      },
    };

    assert.equal(await traiterUnTravail(options(factice)), true);
    const apresEchec = await etat(porteur, taches[0].id);
    assert.deepEqual([apresEchec.state, apresEchec.essais], ["queued", ["failed"]]);
    assert.equal(apresEchec.reglement, null, "rien n'est réglé avant la fin");

    assert.equal(await traiterUnTravail(options(factice)), true);
    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual([fin.state, fin.essais], ["succeeded", ["failed", "completed"]]);
    assert.deepEqual(fin.reglement, { consumed: 1, released: 0 });
  });

  it("deux échecs connus : la tâche échoue, la réservation est rendue, sans troisième essai", async () => {
    const { porteur, taches } = await preparer("worker-echec");
    let appels = 0;
    const factice = {
      logline: async () => {
        appels += 1;
        throw new EchecConnu("Refus du fournisseur factice");
      },
    };

    assert.equal(await traiterUnTravail(options(factice)), true);
    assert.equal(await traiterUnTravail(options(factice)), true);
    assert.equal(await traiterUnTravail(options(factice)), false);

    assert.equal(appels, 2);
    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual(
      [fin.state, fin.essais, fin.reason],
      ["failed", ["failed", "failed"], "Refus du fournisseur factice"],
    );
    assert.deepEqual(fin.reglement, { consumed: 0, released: 1 });
  });

  it("issue inconnue : rien n'est conclu ni relancé, la tâche passe à rapprocher", async () => {
    const { porteur, taches } = await preparer("worker-inconnue");
    let appels = 0;
    const factice = {
      logline: async () => {
        appels += 1;
        throw new Error("Délai dépassé (factice)");
      },
    };

    assert.equal(await traiterUnTravail(options(factice)), true);
    const apres = await etat(porteur, taches[0].id);
    assert.deepEqual(
      [apres.state, apres.essais, apres.reglement],
      ["running", ["submitted"], null],
      "une coupure n'est pas un échec : l'essai reste soumis",
    );
    assert.deepEqual(evenements(), ["tache_reclamee", "issue_inconnue"]);

    await expirerLeBail(taches[0].id);
    assert.ok((await recupererExpires(base)) >= 1);

    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual([fin.state, fin.essais], ["awaiting_reconciliation", ["unknown"]]);

    assert.equal(await traiterUnTravail(options(factice)), false, "aucune relance à l'aveugle");
    assert.equal(appels, 1);
  });

  it("bail perdu entre la réclamation et l'envoi : l'exécuteur n'est jamais appelé", async () => {
    // Trois fois : la récupération croise ici la prolongation du bail, et
    // leur interblocage — corrigé au lot H2 — ne se produisait pas à chaque
    // exécution. Il se signalait par un événement « prolongation_impossible ».
    for (const passage of [1, 2, 3]) {
      const { porteur, taches } = await preparer(`worker-devance-${passage}`);
      let appels = 0;
      const factice = { logline: async () => ({ consomme: (appels += 1) }) };
      // La tâche est récupérée par un autre acteur juste avant la soumission.
      const baseDevancee = {
        end: () => base.end(),
        query: async (texte, parametres) => {
          if (texte.includes("marquer_tentative_soumise")) {
            await faireRecuperer(taches[0].id);
          }
          return base.query(texte, parametres);
        },
      };

      assert.equal(await traiterUnTravail({ ...options(factice), base: baseDevancee }), true);

      assert.equal(appels, 0, "rien ne doit partir chez le fournisseur");
      assert.deepEqual(evenements(), ["tache_reclamee", "bail_perdu_avant_envoi"]);
      const fin = await etat(porteur, taches[0].id);
      assert.deepEqual([fin.state, fin.essais], ["queued", ["failed"]]);
    }
  });

  it("bail perdu avant l'envoi : la soumission est refusée, rien ne part", async () => {
    const { porteur, taches } = await preparer("worker-retard");
    const travail = await reclamer(base, "worker-en-retard", ["logline"]);
    assert.equal(travail.jobId, taches[0].id);

    await expirerLeBail(taches[0].id);
    await recupererExpires(base);

    assert.equal(await marquerSoumise(base, travail.attemptId), false);
    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual([fin.state, fin.essais], ["queued", ["failed"]]);
  });

  it("prolonge son bail pendant le travail", async () => {
    const { porteur, taches } = await preparer("worker-bail");
    const baux = [];
    const factice = {
      logline: async () => {
        baux.push((await etat(porteur, taches[0].id)).lease_until);
        await pause(300);
        baux.push((await etat(porteur, taches[0].id)).lease_until);
        return {};
      },
    };

    await traiterUnTravail(options(factice));
    assert.ok(new Date(baux[1]) > new Date(baux[0]), `bail non prolongé : ${baux}`);
  });

  it("bail perdu pendant le travail : l'exécuteur est interrompu", async () => {
    const { porteur, taches } = await preparer("worker-perte");
    let demarre;
    const debut = new Promise((r) => (demarre = r));
    let interrompu = false;
    const factice = {
      logline: (travail, signal) =>
        new Promise((_resoudre, rejeter) => {
          demarre();
          const garde = setTimeout(() => rejeter(new Error("jamais interrompu")), 5000);
          signal.addEventListener("abort", () => {
            clearTimeout(garde);
            interrompu = true;
            rejeter(new Error("Interrompu : bail perdu"));
          });
        }),
    };

    const traitement = traiterUnTravail(options(factice));
    await debut;
    await faireRecuperer(taches[0].id);

    assert.equal(await traitement, true);
    assert.equal(interrompu, true);
    const fin = await etat(porteur, taches[0].id);
    assert.deepEqual([fin.state, fin.essais], ["awaiting_reconciliation", ["unknown"]]);
  });

  it("deux workers en parallèle : chaque tâche est exécutée une fois, par un seul", async () => {
    const { porteur, taches } = await preparer("worker-parallele", ["logline", "logline"]);
    const executees = [];
    const factice = {
      logline: async (travail) => {
        executees.push(travail.jobId);
        await pause(200);
        return {};
      },
    };

    const [a, b] = await Promise.all([
      traiterUnTravail({ ...options(factice), nom: "worker-1" }),
      traiterUnTravail({ ...options(factice), nom: "worker-2" }),
    ]);

    assert.deepEqual([a, b], [true, true]);
    assert.deepEqual([...executees].sort(), taches.map((t) => t.id).sort());
    for (const tache of taches) {
      const fin = await etat(porteur, tache.id);
      assert.deepEqual([fin.state, fin.essais], ["succeeded", ["completed"]]);
    }
  });

  it("arrêt demandé : la tâche en cours est menée à son terme, puis la boucle rend la main", async () => {
    const { porteur, taches } = await preparer("worker-arret");
    const arret = new AbortController();
    const factice = {
      logline: async () => {
        arret.abort();
        await pause(200);
        return {};
      },
    };

    await demarrerWorker(options(factice, { attenteMs: 20 }), arret.signal);

    assert.equal((await etat(porteur, taches[0].id)).state, "succeeded");
    assert.equal(evenements().at(-1), "worker_arrete");
  });

  it("base injoignable : la boucle patiente et reprend, sans s'arrêter", async () => {
    const arret = new AbortController();
    let pannes = 2;
    const baseCapricieuse = {
      end: () => base.end(),
      query: (...args) => {
        if (pannes > 0) {
          pannes -= 1;
          return Promise.reject(new Error("Connexion refusée (factice)"));
        }
        arret.abort();
        return base.query(...args);
      },
    };

    await demarrerWorker({ ...options({}, { attenteMs: 5 }), base: baseCapricieuse }, arret.signal);

    assert.deepEqual(evenements(), ["boucle_en_echec", "boucle_en_echec", "worker_arrete"]);
  });
});
