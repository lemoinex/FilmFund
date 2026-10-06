/**
 * Intégrations IA : les clés des fournisseurs, vues depuis l'API.
 *
 * AUCUNE CLÉ RÉELLE : les valeurs ci-dessous sont factices et n'ouvrent rien.
 * Ce qui est éprouvé ici, c'est qu'aucun chemin de l'API ne rend une clé, et
 * que seule l'administration en pose ou en retire.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  cleValide,
  CLE_MAX,
  CLE_MIN,
  CODES_FOURNISSEURS,
  estFournisseurConnu,
  FOURNISSEURS,
  messageErreur,
} from "../src/lib/integrations-ia.ts";
import {
  clientAnonyme,
  creerCompte,
  executerSqlLocal,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const FACTICE = "sk-ant-factice-integrations-aaaaaaaa";
const FACTICE_BIS = "sk-ant-factice-integrations-bbbbbbbb";

describe("Intégrations IA : module d'affichage", () => {
  it("ne propose que des fournisseurs connus de la base", () => {
    assert.deepEqual(CODES_FOURNISSEURS, ["anthropic", "openai", "perplexity"]);
    for (const code of CODES_FOURNISSEURS) {
      assert.ok(estFournisseurConnu(code));
    }
    assert.ok(!estFournisseurConnu("mistral"));
  });

  it("dit lesquels sont réellement employés, sans laisser croire au reste", () => {
    const employes = FOURNISSEURS.filter((f) => f.employe).map((f) => f.code);
    // Les trois ont un agent : BOARD appelle OpenAI depuis le lot K1, SCOUT
    // Perplexity depuis le lot L1.
    assert.deepEqual(employes, ["anthropic", "openai", "perplexity"]);
    const openai = FOURNISSEURS.find((f) => f.code === "openai");
    assert.match(openai.usage, /storyboard/i);
    assert.doesNotMatch(openai.usage, /aucun agent/i);
    // Perplexity ne suffit pas seul : l'écran le dit plutôt que de laisser
    // croire au contraire. La recherche a son écran depuis le lot L2.
    const perplexity = FOURNISSEURS.find((f) => f.code === "perplexity");
    assert.match(perplexity.usage, /clé d'Anthropic/);
    assert.doesNotMatch(perplexity.usage, /Aucun écran/);
  });

  it("applique les mêmes bornes que la base", () => {
    assert.ok(cleValide("x".repeat(CLE_MIN)));
    assert.ok(cleValide("x".repeat(CLE_MAX)));
    assert.ok(!cleValide("x".repeat(CLE_MIN - 1)));
    assert.ok(!cleValide("x".repeat(CLE_MAX + 1)));
    assert.ok(!cleValide(`${"x".repeat(CLE_MIN)} ${"y".repeat(CLE_MIN)}`));
    assert.ok(!cleValide(`${"x".repeat(CLE_MIN)}\n`));
  });

  it("traduit les erreurs de la base sans jamais montrer leur code", () => {
    for (const code of ["42501", "22023", "IN001"]) {
      const message = messageErreur(code);
      assert.ok(!message.includes(code));
      assert.notEqual(message, messageErreur(undefined));
    }
    // Un code inattendu passe par le message générique : lui non plus ne doit
    // rien laisser filtrer de la mécanique.
    assert.ok(!messageErreur("XX000").includes("XX000"));
    assert.equal(messageErreur("XX000"), messageErreur(undefined));
  });
});

describe("Intégrations IA : cloisonnement", () => {
  let administrateur;
  let membre;

  /** Lit l'état depuis la base, comme le ferait l'exploitant. */
  async function etatBrut() {
    const { code, sortie, erreurs } = await executerSqlLocal(
      "select coalesce(string_agg(provider, ',' order by provider), '') from public.ai_provider_keys;",
    );
    assert.equal(code, 0, erreurs);
    return sortie.trim();
  }

  before(async () => {
    administrateur = await creerCompte("integ-admin");
    membre = await creerCompte("integ-membre");
    await promouvoirAdministrateur(administrateur.id);
  });

  after(async () => {
    // Les suites suivantes retrouvent une base sans intégration configurée.
    await executerSqlLocal(
      "delete from vault.secrets where id in (select secret_id from public.ai_provider_keys); delete from public.ai_provider_keys;",
    );
  });

  it("un visiteur et un membre n'enregistrent aucune clé", async () => {
    const { error: anonyme } = await clientAnonyme().rpc("definir_cle_fournisseur", {
      p_provider: "anthropic",
      p_cle: FACTICE,
    });
    assert.ok(anonyme, "le visiteur doit être refusé");

    const { error: ordinaire } = await membre.client.rpc("definir_cle_fournisseur", {
      p_provider: "anthropic",
      p_cle: FACTICE,
    });
    assert.equal(ordinaire?.code, "42501");

    assert.equal(await etatBrut(), "");
  });

  it("personne n'appelle la fonction qui déchiffre", async () => {
    for (const compte of [membre, administrateur]) {
      const { error } = await compte.client.rpc("cle_fournisseur", { p_provider: "anthropic" });
      assert.equal(error?.code, "42501", "la fonction doit être refusée, pas absente");
    }
  });

  it("un administrateur enregistre une clé, que rien ne renvoie ensuite", async () => {
    const { data, error } = await administrateur.client.rpc("definir_cle_fournisseur", {
      p_provider: "anthropic",
      p_cle: FACTICE,
    });
    assert.ifError(error);
    assert.equal(data.provider, "anthropic");
    assert.equal(data.configured_by, administrateur.id);
    // Ce que la fonction renvoie ne contient pas la clé, même tronquée.
    assert.ok(!JSON.stringify(data).includes("factice"));

    const { data: etat } = await administrateur.client.from("ai_provider_keys").select("*");
    assert.equal(etat.length, 1);
    assert.ok(!JSON.stringify(etat).includes("factice"));
  });

  it("un membre ne lit même pas l'état des intégrations", async () => {
    const { data } = await membre.client.from("ai_provider_keys").select("*");
    assert.equal(data?.length ?? 0, 0);

    const { data: anonymes } = await clientAnonyme().from("ai_provider_keys").select("*");
    assert.equal(anonymes?.length ?? 0, 0);
  });

  it("personne n'écrit l'état à la main : le coffre resterait désaccordé", async () => {
    const { error: ajout } = await administrateur.client
      .from("ai_provider_keys")
      .insert({ provider: "openai", secret_id: crypto.randomUUID() });
    assert.ok(ajout, "l'ajout direct doit être refusé");

    const { data: modifies } = await administrateur.client
      .from("ai_provider_keys")
      .update({ provider: "openai" })
      .eq("provider", "anthropic")
      .select("provider");
    assert.equal(modifies?.length ?? 0, 0);

    const { data: supprimes } = await administrateur.client
      .from("ai_provider_keys")
      .delete()
      .eq("provider", "anthropic")
      .select("provider");
    assert.equal(supprimes?.length ?? 0, 0);

    assert.equal(await etatBrut(), "anthropic");
  });

  it("une clé invalide est refusée par la base, pas seulement par l'écran", async () => {
    for (const cle of ["trop-courte", `${FACTICE} et du texte`, "x".repeat(CLE_MAX + 1)]) {
      const { error } = await administrateur.client.rpc("definir_cle_fournisseur", {
        p_provider: "anthropic",
        p_cle: cle,
      });
      assert.equal(error?.code, "22023", `« ${cle.slice(0, 20)}… » doit être refusée`);
    }
    const { error } = await administrateur.client.rpc("definir_cle_fournisseur", {
      p_provider: "mistral",
      p_cle: FACTICE,
    });
    assert.equal(error?.code, "22023");
  });

  it("le remplacement garde une seule ligne et une seule entrée au coffre", async () => {
    const { error } = await administrateur.client.rpc("definir_cle_fournisseur", {
      p_provider: "anthropic",
      p_cle: FACTICE_BIS,
    });
    assert.ifError(error);

    const { sortie } = await executerSqlLocal(
      "select (select count(*) from public.ai_provider_keys) || '/' || (select count(*) from vault.secrets where name = 'ia_anthropic');",
    );
    assert.equal(sortie.trim(), "1/1");
  });

  it("le journal retient chaque changement, jamais la valeur", async () => {
    // Filtré sur l'auteur : les autres suites laissent leurs propres entrées
    // dans la base locale.
    const { data } = await administrateur.client
      .from("admin_audit_log")
      .select("details")
      .eq("action", "cle_fournisseur")
      .eq("actor_id", administrateur.id)
      .order("id");
    assert.deepEqual(
      data.map((entree) => entree.details.operation),
      ["ajout", "remplacement"],
    );
    assert.ok(!JSON.stringify(data).includes("factice"));
  });

  it("un membre ne retire aucune clé ; un administrateur, si", async () => {
    const { error: refuse } = await membre.client.rpc("retirer_cle_fournisseur", {
      p_provider: "anthropic",
    });
    assert.equal(refuse?.code, "42501");
    assert.equal(await etatBrut(), "anthropic");

    const { error } = await administrateur.client.rpc("retirer_cle_fournisseur", {
      p_provider: "anthropic",
    });
    assert.ifError(error);
    assert.equal(await etatBrut(), "");

    const { sortie } = await executerSqlLocal(
      "select count(*) from vault.secrets where name = 'ia_anthropic';",
    );
    assert.equal(sortie.trim(), "0");
  });

  it("retirer une clé absente est signalé, pas silencieux", async () => {
    const { error } = await administrateur.client.rpc("retirer_cle_fournisseur", {
      p_provider: "anthropic",
    });
    assert.equal(error?.code, "IN001");
  });
});
