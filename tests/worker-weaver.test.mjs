/**
 * WEAVER (lot I1) : la logline, de la tâche réclamée à la proposition
 * déposée, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici. Deux doublures, désignées comme telles :
 *   - un FOURNISSEUR FACTICE, pour éprouver l'agent : coûts, plafond, refus,
 *     coupure, sortie invalide ;
 *   - un SERVEUR LOCAL FACTICE, pour éprouver la passerelle avec le vrai SDK
 *     d'Anthropic : ce qu'elle envoie, et comment elle classe les erreurs.
 * Ni l'un ni l'autre ne prouve que l'agent fonctionne avec le vrai
 * fournisseur : cela se vérifie en recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import { executeursArc } from "../worker/src/agents/arc.ts";
import { executeursScript } from "../worker/src/agents/script.ts";
import {
  composerContexte,
  composerFiche,
  executeursWeaver,
  lireLogline,
  lireTexte,
} from "../worker/src/agents/weaver.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { EchecConnu } from "../worker/src/executeurs.ts";
import { creerFournisseurAnthropic } from "../worker/src/ia/passerelle.ts";
import {
  coutMicroDollars,
  enDollars,
  PROFIL_ANALYSE,
  PROFIL_LOGLINE,
  PROFIL_SCENARIO,
  PROFIL_SYNOPSIS_STANDARD,
  PROFIL_TRAITEMENT,
  PROFILS_ARC,
  PROFILS_FIELD,
  PROFILS_IA,
  PROFILS_SCRIPT,
  PROFILS_WEAVER,
} from "../worker/src/ia/profils.ts";
import { registreDesAgents } from "../worker/src/registre.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirCleFactice,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";

/** Réponse d'un fournisseur factice : une logline, facturée 1 200 jetons en entrée et 350 en sortie. */
function reponseFactice(texte, autres = {}) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1200, jetonsSortie: 350 }],
    ...autres,
  };
}

/** Fournisseur factice : rejoue les réponses données, dans l'ordre, et note ce qu'on lui demande. */
function fournisseurFactice(...reponses) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    const reponse = reponses[Math.min(demandes.length, reponses.length) - 1];
    if (reponse instanceof Error) {
      throw reponse;
    }
    return reponse;
  };
  return { fournisseur, demandes };
}

describe("WEAVER : logline", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-weaver", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  function options(fournisseur) {
    return {
      base,
      nom: "worker-weaver-test",
      executeurs: executeursWeaver(base, fournisseur),
      journal: () => {},
      battementMs: 50,
    };
  }

  async function preparer(prefixe, fiche = {}) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, `Les Eaux de ${prefixe}`);
    const { error } = await porteur.client
      .from("projects")
      .update({
        logline: fiche.logline ?? "Un ancien pitch.",
        synopsis: fiche.synopsis ?? "Une pêcheuse de Kribi défend sa plage contre un port.",
      })
      .eq("id", projet.id);
    assert.ifError(error);
    const tache = await engager(porteur, projet.id, "logline", `${prefixe}-cle`);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return { porteur, projet, tache };
  }

  /** Dépense du mois telle que la base la compte, provisions comprises. */
  async function depenseDuMois() {
    const { sortie, code, erreurs } = await sql("select public.depense_ia_du_mois();");
    assert.equal(code, 0, erreurs);
    return sortie.trim();
  }

  async function etat(porteur, tache) {
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, attempts, reason, reservation_id")
      .eq("id", tache.id)
      .single();
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile, model")
      .eq("job_id", tache.id)
      .maybeSingle();
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .maybeSingle();
    // Les coûts ne sont lisibles que par l'administration.
    const { data: couts } = await administrateur.client
      .from("provider_charges")
      .select("attempt_id, provider, model, profile, estimated_usd, created_at")
      .eq("job_id", tache.id)
      .order("created_at");
    const { data: confirmes } = await administrateur.client
      .from("provider_charge_settlements")
      .select("attempt_id, model, input_tokens, output_tokens, usd, fallback")
      .in("attempt_id", couts.length ? couts.map((c) => c.attempt_id) : [crypto.randomUUID()]);
    return { travail, proposition, reglement, couts, confirmes };
  }

  it("sait exécuter les cinq livrables de WEAVER, et eux seuls", () => {
    const { fournisseur } = fournisseurFactice(reponseFactice("x"));
    assert.deepEqual(Object.keys(executeursWeaver(base, fournisseur)), Object.keys(PROFILS_WEAVER));
    assert.deepEqual(Object.keys(PROFILS_WEAVER), [
      "logline",
      "synopsis_short",
      "synopsis_standard",
      "synopsis_detailed",
      "intention_note",
    ]);
  });

  it("succès : proposition déposée, coût confirmé, unité consommée, pitch intact", async () => {
    const { porteur, projet, tache } = await preparer("weaver-succes");
    const { fournisseur, demandes } = fournisseurFactice(
      reponseFactice("« Une pêcheuse affronte le chantier\nqui engloutit sa plage. »\n"),
    );

    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const fin = await etat(porteur, tache);

    assert.equal(fin.travail.state, "succeeded");
    assert.deepEqual(fin.reglement, { consumed: 1, released: 0 });
    assert.deepEqual(
      [
        fin.proposition.state,
        fin.proposition.content,
        fin.proposition.profile,
        fin.proposition.model,
      ],
      [
        "proposed",
        "Une pêcheuse affronte le chantier qui engloutit sa plage.",
        "weaver.logline@1",
        OPUS,
      ],
    );

    // 1 200 jetons à 4 $ le million, 350 à 20 $ : 0,0118 $, au micro-dollar près.
    assert.equal(fin.couts.length, 1);
    assert.deepEqual(
      [fin.couts[0].provider, fin.couts[0].model, fin.couts[0].profile],
      ["anthropic", OPUS, "weaver.logline@1"],
    );
    assert.deepEqual(fin.confirmes, [
      {
        attempt_id: fin.couts[0].attempt_id,
        model: OPUS,
        input_tokens: 1200,
        output_tokens: 350,
        usd: 0.0118,
        fallback: false,
      },
    ]);
    assert.ok(
      Number(fin.couts[0].estimated_usd) > 0.0118,
      "la provision couvre le pire, au-delà du coût réel",
    );

    // Rien n'est écrit dans le projet : la proposition attend une décision.
    const { data: inchange } = await porteur.client
      .from("projects")
      .select("logline")
      .eq("id", projet.id)
      .single();
    assert.equal(inchange.logline, "Un ancien pitch.");

    // Seule la fiche du projet part chez le fournisseur.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_LOGLINE.id);
    assert.equal(
      demandes[0].message,
      composerFiche({
        titre: projet.title,
        format: "long_metrage",
        etape: "idee",
        logline: "Un ancien pitch.",
        synopsis: "Une pêcheuse de Kribi défend sa plage contre un port.",
      }),
    );
    for (const interdit of [porteur.id, porteur.email, projet.id, tache.id]) {
      assert.ok(!demandes[0].message.includes(interdit), `ne doit pas transmettre ${interdit}`);
    }
  });

  it("le porteur applique la proposition, modifiée ; l'ancien pitch est conservé", async () => {
    const { porteur, projet, tache } = await preparer("weaver-application");
    const { fournisseur } = fournisseurFactice(reponseFactice("Une proposition de l'assistant."));
    await traiterUnTravail(options(fournisseur));
    const { proposition } = await etat(porteur, tache);

    const { data, error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: "  La proposition, retouchée par l'auteur.  ",
    });
    assert.ifError(error);
    assert.deepEqual(
      [data.state, data.content, data.final_content, data.replaced_content],
      [
        "accepted",
        "Une proposition de l'assistant.",
        "La proposition, retouchée par l'auteur.",
        "Un ancien pitch.",
      ],
    );

    const { data: applique } = await porteur.client
      .from("projects")
      .select("logline")
      .eq("id", projet.id)
      .single();
    assert.equal(applique.logline, "La proposition, retouchée par l'auteur.");
  });

  it("refus du fournisseur, deux fois : échec, unité rendue, dépenses toujours visibles", async () => {
    const { porteur, tache } = await preparer("weaver-refus");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice("", { arret: "refus" }));

    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal((await etat(porteur, tache)).travail.state, "queued", "une reprise");
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), false, "pas de troisième essai");

    const fin = await etat(porteur, tache);
    assert.equal(demandes.length, 2);
    assert.deepEqual(
      [fin.travail.state, fin.travail.reason],
      ["failed", "Le fournisseur a décliné cette demande."],
    );
    assert.deepEqual(fin.reglement, { consumed: 0, released: 1 });
    assert.equal(fin.proposition, null);
    assert.deepEqual(
      fin.confirmes.map((c) => c.usd),
      [0.0118, 0.0118],
      "les deux appels ont été facturés : la restitution des unités ne les efface pas",
    );
  });

  it("erreur du fournisseur puis succès : une seule reprise suffit", async () => {
    const { porteur, tache } = await preparer("weaver-reprise");
    const { fournisseur } = fournisseurFactice(
      new EchecConnu("Le fournisseur a répondu par une erreur (429)."),
      reponseFactice("Une logline obtenue au second essai."),
    );

    await traiterUnTravail(options(fournisseur));
    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.deepEqual([fin.travail.state, fin.travail.attempts], ["succeeded", 2]);
    assert.equal(fin.couts.length, 2, "chaque essai provisionne");
    assert.equal(fin.confirmes.length, 1, "seul l'appel abouti est confirmé");
  });

  it("requête refusée : le coût est soldé à zéro, le plafond n'est pas entamé", async () => {
    const { porteur, tache } = await preparer("weaver-refusee");
    const { fournisseur } = fournisseurFactice(
      new EchecConnu("Le fournisseur a répondu par une erreur (400).", {
        detail: "betas: Unexpected value(s)",
        sansFrais: true,
      }),
    );

    const avant = await depenseDuMois();
    await traiterUnTravail(options(fournisseur));
    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.equal(fin.travail.state, "failed");
    assert.deepEqual(fin.reglement, { consumed: 0, released: 1 });
    assert.equal(fin.couts.length, 2, "chaque essai provisionne");
    assert.deepEqual(
      fin.confirmes.map((c) => c.usd),
      [0, 0],
      "une requête refusée n'est pas facturée",
    );
    assert.equal(
      await depenseDuMois(),
      avant,
      "la dépense du mois ne bouge pas : rien n'a été dépensé",
    );
  });

  it("le motif du fournisseur atteint le journal du worker, jamais la base", async () => {
    const { porteur, tache } = await preparer("weaver-motif");
    const { fournisseur } = fournisseurFactice(
      new EchecConnu("Le fournisseur a répondu par une erreur (400).", {
        detail: "betas: Unexpected value(s) `server-side-fallback-2026-07-01`",
        sansFrais: true,
      }),
    );
    const evenements = [];

    await traiterUnTravail({
      ...options(fournisseur),
      journal: (evenement) => evenements.push(evenement),
    });

    const echec = evenements.find((e) => e.evenement === "essai_echoue");
    assert.ok(echec, "l'échec doit être journalisé");
    assert.match(echec.detail, /betas/);
    assert.ok(!echec.message.includes("betas"), "le message reste général");

    // Second essai : la tâche échoue pour de bon et inscrit son motif.
    await traiterUnTravail(options(fournisseur));
    const fin = await etat(porteur, tache);
    assert.equal(fin.travail.state, "failed");
    // En base, l'équipe du projet ne lit que le motif général.
    assert.equal(fin.travail.reason, "Le fournisseur a répondu par une erreur (400).");
  });

  it("coupure pendant l'appel : rien n'est conclu, la provision reste au registre", async () => {
    const { porteur, tache } = await preparer("weaver-coupure");
    const { fournisseur, demandes } = fournisseurFactice(new Error("Connexion coupée (factice)"));

    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const fin = await etat(porteur, tache);
    assert.equal(demandes.length, 1);
    assert.equal(fin.travail.state, "running", "ni échec ni reprise : l'issue est inconnue");
    assert.equal(fin.proposition, null);
    assert.equal(fin.reglement, null);
    assert.deepEqual([fin.couts.length, fin.confirmes.length], [1, 0]);
  });

  it("sortie qui n'est pas une logline : échec connu, coût confirmé", async () => {
    const { porteur, tache } = await preparer("weaver-invalide");
    const { fournisseur } = fournisseurFactice(reponseFactice("x".repeat(501)));

    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.equal(fin.travail.state, "queued");
    assert.equal(fin.proposition, null);
    assert.equal(fin.confirmes.length, 1);
  });

  it("réponse tronquée : échec connu, jamais une proposition", async () => {
    const { porteur, tache } = await preparer("weaver-tronquee");
    const { fournisseur } = fournisseurFactice(
      reponseFactice("Une logline coupée en plein", { arret: "tronque" }),
    );

    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.equal(fin.travail.state, "queued");
    assert.equal(fin.proposition, null);
  });

  it("plafond mensuel atteint : rien n'est envoyé, l'unité est rendue", async () => {
    const { porteur, tache } = await preparer("weaver-plafond");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice("Jamais demandée."));

    await definirPlafondIa(0);
    try {
      await traiterUnTravail(options(fournisseur));
      await traiterUnTravail(options(fournisseur));
    } finally {
      await definirPlafondIa(1_000_000);
    }

    const fin = await etat(porteur, tache);
    assert.equal(demandes.length, 0, "aucun appel au fournisseur");
    assert.deepEqual(
      [fin.travail.state, fin.travail.reason],
      ["failed", "Plafond mensuel des dépenses d'IA atteint."],
    );
    assert.deepEqual(fin.reglement, { consumed: 0, released: 1 });
    assert.equal(fin.couts.length, 0);
  });

  it("repli sur un autre modèle : le coût suit les modèles réellement utilisés", async () => {
    const { porteur, tache } = await preparer("weaver-repli");
    const { fournisseur } = fournisseurFactice(
      reponseFactice("Une logline servie par le modèle de repli.", {
        modeleServi: "claude-opus-4-8",
        repli: true,
        usages: [
          { modele: OPUS, jetonsEntree: 1200, jetonsSortie: 0 },
          { modele: "claude-opus-4-8", jetonsEntree: 1200, jetonsSortie: 300 },
        ],
      }),
    );

    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.equal(fin.proposition.model, "claude-opus-4-8");
    // 1 200 × 4 + 1 200 × 5 + 300 × 25 = 18 300 micro-dollars.
    assert.deepEqual(
      [fin.confirmes[0].model, fin.confirmes[0].fallback, fin.confirmes[0].usd],
      ["claude-opus-4-8", true, 0.0183],
    );
    assert.deepEqual([fin.confirmes[0].input_tokens, fin.confirmes[0].output_tokens], [2400, 300]);
  });

  it("modèle sans tarif connu : le montant reste à rapprocher, il n'est pas inventé", async () => {
    const { porteur, tache } = await preparer("weaver-tarif");
    const { fournisseur } = fournisseurFactice(
      reponseFactice("Une logline d'un modèle inattendu.", {
        modeleServi: "modele-inconnu",
        usages: [{ modele: "modele-inconnu", jetonsEntree: 10, jetonsSortie: 10 }],
      }),
    );

    await traiterUnTravail(options(fournisseur));

    const fin = await etat(porteur, tache);
    assert.equal(fin.travail.state, "succeeded");
    assert.equal(fin.confirmes[0].usd, null);
  });

  it("le worker ne lit ni les coûts ni les propositions : il passe par ses fonctions", async () => {
    for (const table of [
      "provider_charges",
      "ai_suggestions",
      "ai_settings",
      "ai_provider_keys",
      "projects",
    ]) {
      await assert.rejects(base.query(`select 1 from public.${table} limit 1`), { code: "42501" });
    }
  });
});

describe("Registre des agents : la clé vient du coffre", () => {
  let base;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    await definirCleFactice("anthropic", null);
  });

  after(async () => {
    await definirCleFactice("anthropic", null);
    await base.end();
  });

  /** Fournisseur factice qui retient la clé qu'on lui a confiée. */
  function registreObserve() {
    const evenements = [];
    const clesRecues = [];
    const agents = registreDesAgents({
      base,
      journal: (evenement) => evenements.push(evenement),
      creerFournisseur: (cle) => {
        clesRecues.push(cle);
        return async () => reponseFactice("Jamais appelée.");
      },
    });
    return { agents, evenements, clesRecues };
  }

  it("sans clé, aucun exécuteur : rien n'est pris, rien n'est simulé", async () => {
    const { agents, evenements } = registreObserve();
    await agents.relire();
    assert.deepEqual(Object.keys(agents.lire()), []);
    // Rien n'a changé : le démarrage dit déjà « actions: [] », inutile de
    // répéter l'absence à chaque relecture.
    assert.deepEqual(evenements, []);
  });

  it("une clé posée met l'agent en service, sans redémarrage", async () => {
    const { agents, evenements, clesRecues } = registreObserve();
    await agents.relire();
    assert.deepEqual(Object.keys(agents.lire()), []);

    await definirCleFactice("anthropic", "sk-ant-factice-registre-aaaaaaaa");
    await agents.relire();

    assert.deepEqual(
      Object.keys(agents.lire()).sort(),
      [...Object.keys(PROFILS_IA), ...Object.keys(PROFILS_FIELD)].sort(),
    );
    assert.deepEqual(clesRecues, ["sk-ant-factice-registre-aaaaaaaa"]);
    assert.deepEqual(
      evenements.map((e) => e.evenement),
      ["cle_fournisseur_chargee"],
    );
    // Le journal dit la présence de la clé, jamais sa valeur.
    assert.ok(!JSON.stringify(evenements).includes("factice"));
  });

  it("une clé inchangée ne reconstruit rien ; une clé remplacée, si", async () => {
    await definirCleFactice("anthropic", "sk-ant-factice-registre-aaaaaaaa");
    const { agents, evenements, clesRecues } = registreObserve();
    await agents.relire();
    await agents.relire();
    assert.equal(clesRecues.length, 1, "la même clé ne refait pas un fournisseur");

    await definirCleFactice("anthropic", "sk-ant-factice-registre-bbbbbbbb");
    await agents.relire();
    assert.deepEqual(clesRecues, [
      "sk-ant-factice-registre-aaaaaaaa",
      "sk-ant-factice-registre-bbbbbbbb",
    ]);
    assert.equal(evenements.length, 2, "un événement par changement, pas par relecture");
  });

  it("une clé retirée sort l'agent du service", async () => {
    await definirCleFactice("anthropic", "sk-ant-factice-registre-aaaaaaaa");
    const { agents, evenements } = registreObserve();
    await agents.relire();
    assert.deepEqual(
      Object.keys(agents.lire()).sort(),
      [...Object.keys(PROFILS_IA), ...Object.keys(PROFILS_FIELD)].sort(),
    );

    await definirCleFactice("anthropic", null);
    await agents.relire();

    assert.deepEqual(Object.keys(agents.lire()), []);
    assert.equal(evenements.at(-1).evenement, "cle_fournisseur_retiree");
  });

  it("la boucle relit le registre à chaque tour : une tâche attend, puis part", async () => {
    // Sans cette relecture, une clé posée pendant que le worker tourne
    // n'aurait aucun effet avant son redémarrage.
    const porteur = await creerCompte("registre-boucle");
    const projet = await creerProjet(porteur, "Le Registre");
    const tache = await engager(porteur, projet.id, "logline", "registre-boucle-cle");
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    let registre = {};
    const options = {
      base,
      nom: "worker-registre-test",
      executeurs: () => registre,
      journal: () => {},
    };

    assert.equal(await traiterUnTravail(options), false, "sans exécuteur, rien n'est réclamé");
    const { data: enAttente } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.equal(enAttente.state, "queued", "la tâche attend, elle n'est pas perdue");

    registre = { logline: async () => ({}) };
    assert.equal(await traiterUnTravail(options), true, "le registre relu, la tâche part");
    const { data: traitee } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.equal(traitee.state, "succeeded");
  });
});

describe("WEAVER : textes et montants", () => {
  it("remet une réponse en logline, ou la refuse", () => {
    assert.equal(lireLogline('  "Une phrase."  '), "Une phrase.");
    assert.equal(lireLogline("« Une\nphrase   sur deux lignes. »"), "Une phrase sur deux lignes.");
    assert.equal(lireLogline("   "), null);
    assert.equal(lireLogline("x".repeat(500)).length, 500);
    assert.equal(lireLogline("x".repeat(501)), null);
  });

  it("compte en micro-dollars entiers et écrit le montant exactement", () => {
    assert.equal(
      coutMicroDollars([{ modele: OPUS, jetonsEntree: 1200, jetonsSortie: 350 }]),
      11_800,
    );
    assert.equal(enDollars(11_800), "0.011800");
    assert.equal(enDollars(1_234_567), "1.234567");
    assert.equal(enDollars(0), "0.000000");
    assert.equal(coutMicroDollars([{ modele: "inconnu", jetonsEntree: 1, jetonsSortie: 1 }]), null);
  });
});

describe("Passerelle Anthropic, contre un serveur local factice", () => {
  let serveur;
  let fournisseur;
  let repondre;
  const recues = [];
  const ancienneAdresse = process.env.ANTHROPIC_BASE_URL;

  const message = (autres = {}) => ({
    id: "msg_factice",
    type: "message",
    role: "assistant",
    model: OPUS,
    content: [{ type: "text", text: "Une logline du serveur factice." }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 900, output_tokens: 200 },
    ...autres,
  });

  before(async () => {
    serveur = createServer((requete, reponse) => {
      let corps = "";
      requete.on("data", (morceau) => (corps += morceau));
      requete.on("end", () => {
        recues.push({ url: requete.url, entetes: requete.headers, corps: JSON.parse(corps) });
        repondre(requete, reponse);
      });
    });
    await new Promise((pret) => serveur.listen(0, "127.0.0.1", pret));
    // Le SDK lit cette variable à la création du client : aucun appel ne
    // sort de la machine. La clé est factice.
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${serveur.address().port}`;
    fournisseur = creerFournisseurAnthropic("cle-factice-locale");
  });

  after(async () => {
    if (ancienneAdresse === undefined) {
      delete process.env.ANTHROPIC_BASE_URL;
    } else {
      process.env.ANTHROPIC_BASE_URL = ancienneAdresse;
    }
    await new Promise((ferme) => serveur.close(ferme));
  });

  const json = (statut, corps) => (_requete, reponse) => {
    reponse.writeHead(statut, { "content-type": "application/json" });
    reponse.end(JSON.stringify(corps));
  };
  const demande = { profil: PROFIL_LOGLINE, message: "<fiche>\nTitre : Essai\n</fiche>" };
  const appeler = () => fournisseur(demande, new AbortController().signal);

  it("envoie le profil, et rien que le navigateur aurait pu choisir", async () => {
    recues.length = 0;
    repondre = json(200, message());

    const reponse = await appeler();

    assert.deepEqual(reponse, {
      texte: "Une logline du serveur factice.",
      arret: "fin",
      modeleServi: OPUS,
      repli: false,
      usages: [{ modele: OPUS, jetonsEntree: 900, jetonsSortie: 200 }],
    });

    assert.equal(recues.length, 1);
    const { entetes, corps } = recues[0];
    assert.equal(entetes["x-api-key"], "cle-factice-locale");
    assert.match(entetes["anthropic-beta"], /server-side-fallback-2026-07-01/);
    assert.deepEqual(corps, {
      model: OPUS,
      max_tokens: 8000,
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: PROFIL_LOGLINE.systeme,
      messages: [{ role: "user", content: demande.message }],
    });
  });

  it("erreur 429 ou 529 : échec connu, sans réessai automatique", async () => {
    for (const statut of [429, 529]) {
      recues.length = 0;
      repondre = json(statut, {
        type: "error",
        error: { type: "rate_limit_error", message: "Texte du fournisseur, à ne pas recopier." },
      });

      await assert.rejects(appeler(), (erreur) => {
        assert.ok(erreur instanceof EchecConnu, `statut ${statut} : échec connu attendu`);
        assert.equal(erreur.message, `Le fournisseur a répondu par une erreur (${statut}).`);
        // Le fournisseur a pu commencer à travailler : la provision reste.
        assert.equal(erreur.sansFrais, false, `statut ${statut} : frais possibles`);
        return true;
      });
      assert.equal(recues.length, 1, "le SDK ne doit pas relancer de lui-même");
    }
  });

  it("requête refusée (400) : rien n'est facturé, et le motif part au journal", async () => {
    recues.length = 0;
    const motif = "betas: Unexpected value(s) `server-side-fallback-2026-07-01`";
    repondre = json(400, {
      type: "error",
      error: { type: "invalid_request_error", message: motif },
    });

    await assert.rejects(appeler(), (erreur) => {
      assert.ok(erreur instanceof EchecConnu);
      assert.equal(erreur.message, "Le fournisseur a répondu par une erreur (400).");
      assert.equal(erreur.sansFrais, true, "une requête refusée n'est pas facturée");
      // Le message reste général — l'équipe du projet le lit en base — mais
      // le détail doit permettre à l'exploitant de comprendre.
      assert.ok(!erreur.message.includes("betas"));
      assert.ok(erreur.detail.includes("betas"));
      assert.ok(erreur.detail.length <= 300);
      return true;
    });
    assert.equal(recues.length, 1);
  });

  it("le détail est tronqué : un fournisseur bavard ne noie pas le journal", async () => {
    recues.length = 0;
    repondre = json(400, {
      type: "error",
      error: { type: "invalid_request_error", message: "x".repeat(5000) },
    });

    await assert.rejects(appeler(), (erreur) => {
      assert.equal(erreur.detail.length, 300);
      return true;
    });
  });

  it("coupure de la connexion : issue inconnue, sans réessai automatique", async () => {
    recues.length = 0;
    repondre = (requete) => requete.socket.destroy();

    await assert.rejects(appeler(), (erreur) => {
      assert.ok(!(erreur instanceof EchecConnu), "une coupure n'est pas un échec connu");
      return true;
    });
    assert.equal(recues.length, 1, "une coupure ne doit jamais être relancée à l'aveugle");
  });

  it("refus de sécurité et réponse tronquée sont signalés, pas pris pour un texte", async () => {
    repondre = json(200, message({ stop_reason: "refusal", content: [] }));
    assert.deepEqual([(await appeler()).arret, (await appeler()).texte], ["refus", ""]);

    repondre = json(200, message({ stop_reason: "max_tokens" }));
    assert.equal((await appeler()).arret, "tronque");
  });

  it("repli : chaque tentative est comptée avec son modèle", async () => {
    repondre = json(
      200,
      message({
        model: "claude-opus-4-8",
        usage: {
          input_tokens: 900,
          output_tokens: 180,
          iterations: [
            {
              type: "message",
              model: OPUS,
              input_tokens: 900,
              output_tokens: 0,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              cache_creation: null,
            },
            {
              type: "fallback_message",
              model: "claude-opus-4-8",
              input_tokens: 900,
              output_tokens: 180,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
              cache_creation: null,
            },
          ],
        },
      }),
    );

    const reponse = await appeler();
    assert.deepEqual(
      [reponse.modeleServi, reponse.repli, reponse.usages],
      [
        "claude-opus-4-8",
        true,
        [
          { modele: OPUS, jetonsEntree: 900, jetonsSortie: 0 },
          { modele: "claude-opus-4-8", jetonsEntree: 900, jetonsSortie: 180 },
        ],
      ],
    );
  });
});

/*
 * WEAVER (lot I2a) : les quatre livrables rédigés. Le chemin est celui de la
 * logline — devis, réservation, tâche, provision, appel, coût, proposition —,
 * et seuls le contexte envoyé et la lecture de la réponse changent. Toujours
 * aucun appel payant : le fournisseur est factice.
 */
describe("WEAVER : synopsis et note d'intention", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-redaction", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  function options(fournisseur) {
    return {
      base,
      nom: "worker-redaction-test",
      executeurs: executeursWeaver(base, fournisseur),
      journal: () => {},
      battementMs: 50,
    };
  }

  /** Un projet à la fiche remplie, deux personnages, un document finalisé et un brouillon. */
  async function preparer(prefixe, action) {
    const porteur = await creerCompte(prefixe);
    const projet = await creerProjet(porteur, `Les Eaux de ${prefixe}`);
    const { error } = await porteur.client
      .from("projects")
      .update({
        format: "long_metrage",
        stage: "ecriture",
        logline: "Une pêcheuse défend sa plage.",
        synopsis: "Le synopsis d'origine.",
        genre: "drame",
        countries: ["CM", "SN"],
        languages: "Batanga, français",
        duration_minutes: 95,
        short_synopsis: "Le synopsis court d'origine.",
        theme: "La transmission",
        stakes: "Perdre la plage, c'est perdre le village.",
        artistic_vision: "Caméra à l'épaule, lumière naturelle.",
        goals: "Trouver un coproducteur.",
        audience: "Festivals et salles.",
      })
      .eq("id", projet.id);
    assert.ifError(error);

    const { error: refusPersonnages } = await porteur.client.from("project_characters").insert([
      {
        project_id: projet.id,
        name: "Ɛyɔ",
        role: "principal",
        description: "Pêcheuse, quarante ans.",
        position: 0,
      },
      {
        project_id: projet.id,
        name: "Le promoteur",
        role: "secondaire",
        description: "",
        position: 1,
      },
    ]);
    assert.ifError(refusPersonnages);

    const { error: refusDocuments } = await porteur.client.from("project_documents").insert([
      {
        project_id: projet.id,
        type: "note_intention",
        title: "Note d'intention",
        content: "La note d'origine.",
        status: "finalise",
      },
      {
        project_id: projet.id,
        type: "traitement",
        title: "Traitement",
        content: "Un brouillon.",
        status: "brouillon",
      },
    ]);
    assert.ifError(refusDocuments);

    const tache = await engager(porteur, projet.id, action, `${prefixe}-cle`);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return { porteur, projet, tache };
  }

  it("un synopsis : contexte complet envoyé, proposition déposée, projet intact", async () => {
    const { porteur, projet, tache } = await preparer("redaction-succes", "synopsis_standard");
    const { fournisseur, demandes } = fournisseurFactice(
      reponseFactice("Premier paragraphe.\r\n\r\n\r\nSecond paragraphe.  \n"),
    );

    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "succeeded");

    // Fins de ligne normalisées, lignes vides en trop resserrées.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("content, profile, state")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "Premier paragraphe.\n\nSecond paragraphe.");
    assert.equal(proposition.profile, PROFIL_SYNOPSIS_STANDARD.id);
    assert.equal(proposition.state, "proposed");

    // Rien n'est appliqué sans décision : le synopsis du projet n'a pas bougé.
    const { data: inchange } = await porteur.client
      .from("projects")
      .select("synopsis")
      .eq("id", projet.id)
      .single();
    assert.equal(inchange.synopsis, "Le synopsis d'origine.");

    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_SYNOPSIS_STANDARD.id);

    // Les blocs du contexte, dans l'ordre imposé, et l'objectif en dernier.
    const message = demandes[0].message;
    const rangs = ["<projet>", "<contexte>", "<personnages>", "<vision>", "<documents>"].map(
      (balise) => message.indexOf(balise),
    );
    assert.ok(
      rangs.every((rang, index) => rang >= 0 && (index === 0 || rang > rangs[index - 1])),
      message,
    );
    assert.ok(message.trimEnd().endsWith(PROFIL_SYNOPSIS_STANDARD.objectif), message);

    // La fiche, les personnages et le document finalisé y sont ; le brouillon non.
    for (const attendu of [
      "Les Eaux de redaction-succes",
      "CM, SN",
      "Ɛyɔ (principal)",
      "Pêcheuse, quarante ans.",
      "Caméra à l'épaule, lumière naturelle.",
      "La note d'origine.",
    ]) {
      assert.ok(message.includes(attendu), attendu);
    }
    assert.ok(!message.includes("Un brouillon."), "un brouillon ne part pas chez le fournisseur");

    // Rien qui désigne un compte ne part chez le fournisseur.
    for (const interdit of [porteur.id, porteur.email, projet.id, tache.id]) {
      assert.ok(!message.includes(interdit), interdit);
    }
  });

  it("une réponse trop longue pour l'action échoue, et l'unité est rendue", async () => {
    const { porteur, tache } = await preparer("redaction-trop-long", "synopsis_short");
    const { fournisseur } = fournisseurFactice(
      reponseFactice("x".repeat(1501)),
      reponseFactice("y".repeat(1501)),
    );

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
    assert.match(travail.reason, /n'est pas un texte exploitable/);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .maybeSingle();
    assert.equal(proposition, null);

    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .single();
    assert.deepEqual([reglement.consumed, reglement.released], [0, 1]);
  });

  it("remet une réponse en texte de plusieurs paragraphes, ou la refuse", () => {
    assert.equal(lireTexte("  Un seul.  ", 100), "Un seul.");
    assert.equal(lireTexte("Un.\r\n\r\nDeux.", 100), "Un.\n\nDeux.");
    assert.equal(lireTexte("Un.\n\n\n\nDeux.", 100), "Un.\n\nDeux.");
    assert.equal(lireTexte("Ligne.   \nSuite.", 100), "Ligne.\nSuite.");
    assert.equal(lireTexte("   ", 100), null);
    assert.equal(lireTexte("x".repeat(100), 100).length, 100);
    assert.equal(lireTexte("x".repeat(101), 100), null);
    assert.equal(lireTexte("Un texte\u0001troué.", 100), null);
  });

  it("dit les champs absents plutôt que de les taire", () => {
    const message = composerContexte(
      {
        action: "synopsis_short",
        projet: {
          titre: "Sans fiche",
          format: "court_metrage",
          etape: "idee",
          genre: null,
          pays: null,
          langues: null,
          duree: null,
        },
        contexte: {
          pitch: null,
          synopsis_court: null,
          synopsis: null,
          theme: null,
          enjeux: null,
        },
        personnages: [],
        vision: { artistique: null, objectifs: null, public: null },
        documents: [],
      },
      "Écris le synopsis court de ce projet.",
    );
    assert.ok(message.includes("Genre : (non renseigné)"), message);
    assert.ok(message.includes("Format : court metrage"), message);
    assert.ok(message.includes("<personnages>\n(non renseigné)\n</personnages>"), message);
    assert.ok(message.endsWith("Écris le synopsis court de ce projet."), message);
  });
});

/*
 * SCRIPT (lot J1) : le traitement et la bible, de la tâche réclamée au
 * document écrit. L'agent n'a pas de mécanique propre — il reprend la
 * fabrique de WEAVER —, mais le chemin complet est éprouvé une fois : le
 * registre le sert, la base accepte son dépôt, et le texte atterrit dans un
 * document versionné.
 */
describe("SCRIPT : traitement et bible", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-script", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  it("le traitement : proposition déposée, document créé et versionné", async () => {
    const porteur = await creerCompte("script-traitement");
    const projet = await creerProjet(porteur, "La Saison sèche");
    const { error } = await porteur.client
      .from("projects")
      .update({ synopsis: "Un village attend la pluie." })
      .eq("id", projet.id);
    assert.ifError(error);

    const tache = await engager(porteur, projet.id, "treatment", "script-traitement-cle");
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    const { fournisseur, demandes } = fournisseurFactice(
      reponseFactice("Séquence une.\n\nSéquence deux."),
    );
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "worker-script-test",
        executeurs: executeursScript(base, fournisseur),
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );

    // Le profil de SCRIPT, pas celui de WEAVER.
    assert.equal(demandes[0].profil.id, PROFIL_TRAITEMENT.id);
    assert.match(demandes[0].message, /Écris le traitement de ce projet\.$/);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "Séquence une.\n\nSéquence deux.");
    assert.equal(proposition.profile, PROFIL_TRAITEMENT.id);

    // Aucun document tant que la proposition n'est pas appliquée.
    const { data: avant } = await porteur.client
      .from("project_documents")
      .select("id")
      .eq("project_id", projet.id);
    assert.deepEqual(avant, []);

    const { error: refus } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ifError(refus);

    const { data: document } = await porteur.client
      .from("project_documents")
      .select("id, type, title, status, content")
      .eq("project_id", projet.id)
      .single();
    assert.equal(document.type, "traitement");
    assert.equal(document.title, "Traitement");
    assert.equal(document.status, "brouillon");
    assert.equal(document.content, "Séquence une.\n\nSéquence deux.");

    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number, content")
      .eq("document_id", document.id);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].content, "Séquence une.\n\nSéquence deux.");
  });

  /** Mène une demande de séquence jusqu'à sa proposition, avec un fournisseur factice. */
  async function proposerSequence(porteur, projetId, cle, description, reponse) {
    const tache = await engager(porteur, projetId, "screenplay", cle, {
      sequences: 1,
      sequence: description,
    });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(reponse));
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "worker-script-test",
        executeurs: executeursScript(base, fournisseur),
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    return { demandes, proposition };
  }

  it("une séquence : description et fin du scénario envoyées, texte ajouté au document", async () => {
    const porteur = await creerCompte("script-sequence");
    const projet = await creerProjet(porteur, "La Maison des lianes");
    const debut = "EXT. VILLAGE — JOUR\n\nMaya descend du car.";
    const { data: scenario, error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "scenario", title: "Scénario", content: debut })
      .select("id")
      .single();
    assert.ifError(error);

    const sequence = "INT. MAISON — NUIT\n\nMaya pousse la porte.\n\nMAYA\nIl y a quelqu'un ?";
    const { demandes, proposition } = await proposerSequence(
      porteur,
      projet.id,
      "script-sequence-cle",
      "Maya entre dans la maison, de nuit.",
      sequence,
    );

    // Le profil de la séquence, sa description, et la fin de ce qui est écrit
    // — brouillon compris : on n'enchaîne pas sur un texte qu'on n'a pas lu.
    assert.equal(demandes[0].profil.id, PROFIL_SCENARIO.id);
    assert.match(demandes[0].message, /<sequence_a_ecrire>\nMaya entre dans la maison, de nuit\./);
    assert.match(demandes[0].message, /<scenario_deja_ecrit>[\s\S]*Maya descend du car\./);
    assert.match(demandes[0].message, /Écris cette séquence du scénario\.$/);
    assert.equal(proposition.content, sequence);
    assert.equal(proposition.profile, PROFIL_SCENARIO.id);

    // Rien n'est écrit tant que la proposition n'est pas appliquée.
    const lire = async () =>
      (
        await porteur.client
          .from("project_documents")
          .select("content")
          .eq("id", scenario.id)
          .single()
      ).data.content;
    assert.equal(await lire(), debut);

    const { data: appliquee, error: refus } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ifError(refus);

    // Ajoutée à la fin : ce qui précède reste en tête, à l'identique.
    assert.equal(await lire(), `${debut}\n\n${sequence}`);
    // Rien n'a été remplacé, et le document garde une version de plus.
    assert.equal(appliquee.replaced_content, "");
    assert.equal(appliquee.final_content, sequence);
    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number, content")
      .eq("document_id", scenario.id)
      .order("version_number");
    assert.deepEqual(
      versions.map((version) => version.content),
      [debut, `${debut}\n\n${sequence}`],
    );
  });

  it("sans scénario, la séquence l'ouvre : document créé en brouillon", async () => {
    const porteur = await creerCompte("script-ouverture");
    const projet = await creerProjet(porteur, "Premier plan");
    const { demandes, proposition } = await proposerSequence(
      porteur,
      projet.id,
      "script-ouverture-cle",
      "Ouverture : la route, à l'aube.",
      "EXT. ROUTE — AUBE\n\nUn car approche.",
    );
    assert.match(demandes[0].message, /\(rien encore : cette séquence ouvre le scénario\)/);

    const { data: appliquee, error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ifError(error);
    assert.equal(appliquee.replaced_content, null);

    const { data: document } = await porteur.client
      .from("project_documents")
      .select("type, title, status, content")
      .eq("project_id", projet.id)
      .single();
    assert.deepEqual(document, {
      type: "scenario",
      title: "Scénario",
      status: "brouillon",
      content: "EXT. ROUTE — AUBE\n\nUn car approche.",
    });
  });

  it("un scénario plein refuse la séquence, et reste intact", async () => {
    const porteur = await creerCompte("script-plein");
    const projet = await creerProjet(porteur, "Trop long");
    const plein = "a".repeat(199_990);
    const { data: scenario, error } = await porteur.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "scenario", title: "Scénario", content: plein })
      .select("id")
      .single();
    assert.ifError(error);

    const { proposition } = await proposerSequence(
      porteur,
      projet.id,
      "script-plein-cle",
      "Une séquence de trop.",
      "INT. SALLE — JOUR\n\nPlus de place.",
    );
    const { error: refus } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.equal(refus?.code, "22023");

    const { data: apres } = await porteur.client
      .from("project_documents")
      .select("content")
      .eq("id", scenario.id)
      .single();
    assert.equal(apres.content.length, plein.length);
    // La proposition attend toujours : elle peut être écartée, ou appliquée
    // une fois le document allégé.
    const { data: etat } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(etat.state, "proposed");
  });

  it("le traitement ne reçoit ni description ni fin de scénario : son message ne change pas", () => {
    const message = composerContexte(
      {
        action: "treatment",
        projet: { titre: "T", format: "court_metrage", etape: "idee" },
        contexte: {},
        personnages: [],
        vision: {},
        documents: [],
      },
      "Écris le traitement de ce projet.",
    );
    assert.doesNotMatch(message, /sequence_a_ecrire|scenario_deja_ecrit/);
  });

  it("le registre sert les deux agents dès qu'une clé est posée", async () => {
    const { fournisseur } = fournisseurFactice(reponseFactice("x"));
    assert.deepEqual(Object.keys(executeursScript(base, fournisseur)), Object.keys(PROFILS_SCRIPT));
    assert.deepEqual(Object.keys(PROFILS_SCRIPT), ["treatment", "bible", "screenplay"]);
  });
});

/*
 * ARC (lot J3a) : l'analyse dramaturgique, de la tâche réclamée au document
 * écrit. Même fabrique que WEAVER et SCRIPT ; ce qui lui est propre est
 * éprouvé ici : son profil, son document, et le fait qu'il ne réécrit rien
 * du projet qu'il lit.
 */
describe("ARC : analyse dramaturgique", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-arc", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  it("l'analyse : proposition déposée, document créé et versionné, projet intact", async () => {
    const porteur = await creerCompte("arc-analyse");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Un passeur sans rive.", synopsis: "Un passeur refuse de débarquer." })
      .eq("id", projet.id);
    assert.ifError(error);

    const tache = await engager(porteur, projet.id, "dramatic_analysis", "arc-analyse-cle");
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);

    const { fournisseur, demandes } = fournisseurFactice(
      reponseFactice("Structure.\n\nArcs.\n\nCe qui manque."),
    );
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "worker-arc-test",
        executeurs: executeursArc(base, fournisseur),
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );

    // Le profil d'ARC, et le synopsis qu'il doit lire.
    assert.equal(demandes[0].profil.id, PROFIL_ANALYSE.id);
    assert.match(demandes[0].message, /Un passeur refuse de débarquer\./);
    assert.match(demandes[0].message, /Analyse la dramaturgie de ce projet\.$/);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "Structure.\n\nArcs.\n\nCe qui manque.");
    assert.equal(proposition.profile, PROFIL_ANALYSE.id);

    // Quatre unités, comme au barème : rien n'est rendu sur une tâche réussie.
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
    assert.deepEqual(reglement, { consumed: 4, released: 0 });

    const { error: refus } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.ifError(refus);

    const { data: document } = await porteur.client
      .from("project_documents")
      .select("id, type, title, status, content")
      .eq("project_id", projet.id)
      .single();
    assert.equal(document.type, "analyse");
    assert.equal(document.title, "Analyse dramaturgique");
    assert.equal(document.status, "brouillon");
    assert.equal(document.content, "Structure.\n\nArcs.\n\nCe qui manque.");

    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number, content")
      .eq("document_id", document.id);
    assert.equal(versions.length, 1);

    // ARC lit : le projet garde son pitch et son synopsis.
    const { data: apres } = await porteur.client
      .from("projects")
      .select("logline, synopsis")
      .eq("id", projet.id)
      .single();
    assert.deepEqual(apres, {
      logline: "Un passeur sans rive.",
      synopsis: "Un passeur refuse de débarquer.",
    });
  });

  it("sait exécuter l'analyse, et elle seule", () => {
    const { fournisseur } = fournisseurFactice(reponseFactice("x"));
    assert.deepEqual(Object.keys(executeursArc(base, fournisseur)), Object.keys(PROFILS_ARC));
    assert.deepEqual(Object.keys(PROFILS_ARC), ["dramatic_analysis"]);
  });
});
