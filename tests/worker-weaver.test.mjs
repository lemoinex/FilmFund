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

import { composerFiche, executeursWeaver, lireLogline } from "../worker/src/agents/weaver.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { EchecConnu } from "../worker/src/executeurs.ts";
import { creerFournisseurAnthropic } from "../worker/src/ia/passerelle.ts";
import { coutMicroDollars, enDollars, PROFIL_LOGLINE } from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
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

  it("ne sait exécuter que la logline", () => {
    const { fournisseur } = fournisseurFactice(reponseFactice("x"));
    assert.deepEqual(Object.keys(executeursWeaver(base, fournisseur)), ["logline"]);
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
    for (const table of ["provider_charges", "ai_suggestions", "ai_settings", "projects"]) {
      await assert.rejects(base.query(`select 1 from public.${table} limit 1`), { code: "42501" });
    }
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
        return true;
      });
      assert.equal(recues.length, 1, "le SDK ne doit pas relancer de lui-même");
    }
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
