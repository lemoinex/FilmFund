/**
 * Propositions de l'assistant (lot I1) : ce que l'écran en affiche, et ce
 * que chaque compte peut en faire par l'API.
 *
 * AUCUN FOURNISSEUR N'EST APPELÉ : les propositions sont déposées par
 * `deposerProposition`, avec un texte donné par le test. L'agent qui les
 * rédige a sa propre suite (worker-weaver.test.mjs).
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  enNombre,
  ERREURS_BASE,
  estActionIa,
  etapeProposition,
  LIVRABLES_IA,
  messageErreur,
  ORDRE_LIVRABLES,
  PITCH_MAX,
  unitesTexte,
} from "../src/lib/propositions.ts";
import {
  creerCompte,
  creerProjet,
  definirPlafondIa,
  deposerProposition,
  engager,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

describe("Propositions : étapes de l'écran", () => {
  const tache = (state) => ({ id: "t", state });
  const proposition = (state) => ({ id: "p", content: "Un pitch proposé.", state });

  it("sans tâche, ou après une annulation, une demande peut être faite", () => {
    assert.deepEqual(etapeProposition(null, null), { etape: "repos" });
    assert.deepEqual(etapeProposition(tache("cancelled"), null), { etape: "repos" });
  });

  it("suit la tâche : en attente (annulable), en cours, à rapprocher, en échec", () => {
    assert.deepEqual(etapeProposition(tache("queued"), null), {
      etape: "en_attente",
      tacheId: "t",
    });
    assert.deepEqual(etapeProposition(tache("running"), null), { etape: "en_cours" });
    assert.deepEqual(etapeProposition(tache("awaiting_reconciliation"), null), {
      etape: "a_rapprocher",
    });
    assert.deepEqual(etapeProposition(tache("failed"), null), { etape: "echec" });
  });

  it("n'affiche une proposition que tant qu'elle attend une décision", () => {
    assert.deepEqual(etapeProposition(tache("succeeded"), proposition("proposed")), {
      etape: "proposition",
      propositionId: "p",
      texte: "Un pitch proposé.",
    });
    assert.deepEqual(etapeProposition(tache("succeeded"), proposition("accepted")), {
      etape: "repos",
    });
    assert.deepEqual(etapeProposition(tache("succeeded"), proposition("dismissed")), {
      etape: "repos",
    });
    assert.deepEqual(etapeProposition(tache("succeeded"), null), { etape: "repos" });
  });

  it("ramène un état inconnu au repos plutôt qu'à une attente sans fin", () => {
    assert.deepEqual(etapeProposition(tache("etat_futur"), proposition("proposed")), {
      etape: "repos",
    });
  });

  it("traduit chaque erreur connue de la base, sans jamais montrer son code", () => {
    const generique = messageErreur(undefined);
    for (const code of Object.values(ERREURS_BASE)) {
      const message = messageErreur(code);
      assert.notEqual(message, generique, `le code ${code} a son propre message`);
      assert.ok(!message.includes(code), `le message ne montre pas le code ${code}`);
    }
    assert.equal(messageErreur("XX000"), generique);
    assert.ok(!messageErreur("XX000").includes("XX000"));
  });

  it("accorde les unités et reprend la limite de la colonne", () => {
    assert.equal(unitesTexte(1), "1 unité texte");
    assert.equal(unitesTexte(3), "3 unités texte");
    // Le séparateur de milliers français est une espace insécable étroite.
    assert.equal(enNombre(1500).replace(/\s/u, " "), "1 500");
    assert.equal(PITCH_MAX, 500);
  });
});

describe("Propositions : catalogue des livrables", () => {
  it("porte les cinq livrables de WEAVER, dans l'ordre d'affichage", () => {
    assert.deepEqual(ORDRE_LIVRABLES, [
      "logline",
      "synopsis_standard",
      "synopsis_short",
      "synopsis_detailed",
      "intention_note",
    ]);
  });

  it("n'admet qu'une action du catalogue : rien de ce que le navigateur envoie d'autre", () => {
    for (const action of ORDRE_LIVRABLES) {
      assert.ok(estActionIa(action), action);
    }
    for (const refus of [
      "image",
      "pdf_export",
      "treatment",
      "LOGLINE",
      "",
      " logline",
      null,
      undefined,
      42,
      { action: "logline" },
    ]) {
      assert.equal(estActionIa(refus), false, String(refus));
    }
  });

  it("dit pour chaque livrable ce que l'écran doit afficher", () => {
    for (const action of ORDRE_LIVRABLES) {
      const livrable = LIVRABLES_IA[action];
      assert.ok(livrable.titre.length > 0, action);
      assert.ok(livrable.bouton.startsWith("Proposer"), action);
      assert.ok(livrable.remplace.length > 0, action);
      // La description dit que le contexte part chez le fournisseur : rien
      // n'est transmis en silence.
      assert.match(livrable.description, /fournisseur d'IA/, action);
      assert.ok(livrable.longueurMax >= 500, action);
      assert.ok(livrable.lignes >= 4, action);
      assert.ok(["projet", "fiche", "documents"].includes(livrable.page), action);
    }
  });

  it("range chaque livrable là où le texte qu'il écrit se lit", () => {
    assert.deepEqual(
      Object.fromEntries(ORDRE_LIVRABLES.map((action) => [action, LIVRABLES_IA[action].page])),
      {
        logline: "projet",
        synopsis_standard: "projet",
        synopsis_short: "fiche",
        synopsis_detailed: "documents",
        intention_note: "documents",
      },
    );
  });
});

describe("Propositions : cloisonnement", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let aAppliquer;
  let aEcarter;

  async function propositionDe(tache) {
    const { data, error } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .single();
    assert.ifError(error);
    return data.id;
  }

  async function pitch() {
    const { data } = await porteur.client
      .from("projects")
      .select("logline")
      .eq("id", projet.id)
      .single();
    return data.logline;
  }

  before(async () => {
    porteur = await creerCompte("prop-porteur");
    editeur = await creerCompte("prop-editeur");
    lecteur = await creerCompte("prop-lecteur");
    etranger = await creerCompte("prop-etranger");
    administrateur = await creerCompte("prop-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Le Fleuve et la Nuit");
    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Le pitch de l'auteur." })
      .eq("id", projet.id);
    assert.ifError(error);
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    // Le registre local garde les provisions des exécutions précédentes.
    await definirPlafondIa(1_000_000);

    const premiere = await engager(porteur, projet.id, "logline", "prop-cle-1");
    await deposerProposition(premiere.id, "Une proposition à appliquer.");
    const seconde = await engager(porteur, projet.id, "logline", "prop-cle-2");
    await deposerProposition(seconde.id, "Une proposition à écarter.");
    aAppliquer = await propositionDe(premiere);
    aEcarter = await propositionDe(seconde);
  });

  after(async () => {
    await definirPlafondIa(5);
  });

  it("l'équipe lit les propositions du projet ; un compte étranger, aucune", async () => {
    for (const compte of [porteur, editeur, lecteur]) {
      const { data } = await compte.client
        .from("ai_suggestions")
        .select("id")
        .eq("project_id", projet.id);
      assert.equal(data.length, 2);
    }
    const { data } = await etranger.client.from("ai_suggestions").select("id");
    assert.equal(data.length, 0);
  });

  it("personne n'écrit une proposition par l'API, pas même le porteur", async () => {
    const { error: ajout } = await porteur.client.from("ai_suggestions").insert({
      job_id: crypto.randomUUID(),
      studio_id: crypto.randomUUID(),
      project_id: projet.id,
      action: "logline",
      content: "Écrite à la main.",
      profile: "weaver.logline@1",
      model: "claude-opus-5-5",
      created_by: porteur.id,
    });
    assert.ok(ajout, "l'ajout direct doit être refusé");

    // Une décision complète, telle que les contraintes de la table
    // l'accepteraient : seul le droit d'écrire doit la refuser.
    const { data: modifiees } = await porteur.client
      .from("ai_suggestions")
      .update({
        state: "dismissed",
        decided_by: porteur.id,
        decided_at: new Date().toISOString(),
      })
      .eq("id", aEcarter)
      .select("id");
    assert.equal(modifiees?.length ?? 0, 0);

    const { data: intacte } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", aEcarter)
      .single();
    assert.equal(intacte.state, "proposed");

    const { data: supprimees } = await porteur.client
      .from("ai_suggestions")
      .delete()
      .eq("id", aAppliquer)
      .select("id");
    assert.equal(supprimees?.length ?? 0, 0);
  });

  it("les coûts fournisseurs et le plafond ne se lisent que par l'administration", async () => {
    for (const table of ["provider_charges", "provider_charge_settlements", "ai_settings"]) {
      const { data: prive } = await porteur.client.from(table).select("*");
      assert.equal(prive?.length ?? 0, 0, `${table} est fermé au porteur`);
    }

    const { data: couts } = await administrateur.client
      .from("provider_charges")
      .select("attempt_id, profile")
      .eq("project_id", projet.id);
    assert.equal(couts.length, 2);

    const { data: plafond } = await administrateur.client
      .from("ai_settings")
      .select("monthly_budget_usd");
    assert.equal(plafond.length, 1);
  });

  it("un compte ordinaire ne modifie pas le plafond", async () => {
    const { data } = await porteur.client
      .from("ai_settings")
      .update({ monthly_budget_usd: 999 })
      .eq("id", true)
      .select("id");
    assert.equal(data?.length ?? 0, 0);

    const { data: plafond } = await administrateur.client
      .from("ai_settings")
      .select("monthly_budget_usd")
      .single();
    assert.equal(Number(plafond.monthly_budget_usd), 1_000_000);
  });

  it("un compte n'appelle aucune des fonctions du worker", async () => {
    const essai = crypto.randomUUID();
    const appels = [
      ["contexte_travail", { p_attempt_id: essai }],
      [
        "provisionner_cout",
        {
          p_attempt_id: essai,
          p_provider: "anthropic",
          p_model: "claude-opus-5-5",
          p_profile: "weaver.logline@1",
          p_input_tokens: 1,
          p_output_tokens: 1,
          p_usd: 0.01,
        },
      ],
      [
        "confirmer_cout",
        {
          p_attempt_id: essai,
          p_model: "claude-opus-5-5",
          p_input_tokens: 1,
          p_output_tokens: 1,
          p_usd: 0.01,
          p_fallback: false,
        },
      ],
      ["livrer_proposition", { p_attempt_id: essai, p_content: "Écrite par un compte." }],
    ];
    for (const [fonction, parametres] of appels) {
      for (const compte of [porteur, administrateur]) {
        const { error } = await compte.client.rpc(fonction, parametres);
        assert.equal(error?.code, "42501", `${fonction} doit être refusée, pas absente`);
      }
    }
  });

  it("ni le lecteur, ni l'étranger, ni un administrateur hors de l'équipe n'appliquent", async () => {
    for (const compte of [lecteur, etranger, administrateur]) {
      const { error } = await compte.client.rpc("accepter_proposition", {
        p_suggestion_id: aAppliquer,
        p_content: "Un pitch imposé.",
      });
      assert.equal(error?.code, ERREURS_BASE.refus);
    }
    assert.equal(await pitch(), "Le pitch de l'auteur.");
  });

  it("ni le lecteur ni l'étranger n'écartent", async () => {
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("ecarter_proposition", {
        p_suggestion_id: aEcarter,
      });
      assert.equal(error?.code, ERREURS_BASE.refus);
    }
  });

  it("l'éditeur applique la proposition telle quelle ; le pitch remplacé est conservé", async () => {
    const { data, error } = await editeur.client.rpc("accepter_proposition", {
      p_suggestion_id: aAppliquer,
    });
    assert.ifError(error);
    assert.deepEqual(
      [data.state, data.final_content, data.replaced_content, data.decided_by],
      ["accepted", "Une proposition à appliquer.", "Le pitch de l'auteur.", editeur.id],
    );
    assert.equal(await pitch(), "Une proposition à appliquer.");
  });

  it("un administrateur hors de l'équipe écarte, et le journal le retient", async () => {
    const { data, error } = await administrateur.client.rpc("ecarter_proposition", {
      p_suggestion_id: aEcarter,
    });
    assert.ifError(error);
    assert.equal(data.state, "dismissed");
    assert.equal(await pitch(), "Une proposition à appliquer.", "écarter n'écrit rien");

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("actor_id, details")
      .eq("action", "intervention_contenu")
      .eq("project_id", projet.id);
    const entrees = journal.filter((e) => e.details.table === "ai_suggestions");
    assert.equal(entrees.length, 1);
    assert.equal(entrees[0].actor_id, administrateur.id);
  });

  it("une proposition déjà traitée ne se rejoue pas", async () => {
    const { error: ecart } = await porteur.client.rpc("ecarter_proposition", {
      p_suggestion_id: aAppliquer,
    });
    assert.equal(ecart?.code, ERREURS_BASE.propositionDejaTraitee);

    const { error: application } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: aEcarter,
    });
    assert.equal(application?.code, ERREURS_BASE.propositionDejaTraitee);
    assert.equal(await pitch(), "Une proposition à appliquer.");
  });

  it("au-delà de dix devis en une minute, le suivant est refusé", async () => {
    const projetEtranger = await creerProjet(etranger, "Un projet pressé");
    const demander = () =>
      etranger.client.rpc("creer_devis", {
        p_project_id: projetEtranger.id,
        p_action: "logline",
        p_params: {},
      });

    for (let i = 0; i < 10; i += 1) {
      const { error } = await demander();
      assert.ifError(error);
    }
    const { error } = await demander();
    assert.equal(error?.code, ERREURS_BASE.debit);

    // La limite est par compte : celui d'à côté n'est pas ralenti.
    const { error: voisin } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "logline",
      p_params: {},
    });
    assert.ifError(voisin);
  });
});
