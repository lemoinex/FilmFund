/**
 * Catalogue des opportunités (lot L4), contre la base locale : ce qu'un
 * administrateur, un compte ordinaire et un visiteur lisent et écrivent
 * réellement, et ce que le journal en retient.
 *
 * Aucune opportunité réelle ici : les lignes sont FICTIVES, créées et
 * retirées par le test. Aucun appel à un fournisseur.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientAnonyme,
  clientDeService,
  creerCompte,
  executerSqlLocal as sql,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const SUFFIXE = `${Date.now()}`;
const nom = (libelle) => `${libelle} ${SUFFIXE}`;

/** Une opportunité fictive, vérifiée et sourcée, que le test peut décliner. */
const fiche = (libelle, surcharge = {}) => ({
  name: nom(libelle),
  organization: "Organisme fictif",
  category: "fonds",
  description: "Opportunité fictive, créée par un test.",
  countries: ["CM", "GA"],
  formats: ["long_metrage"],
  genres: ["drame"],
  budget_min: 5000000,
  budget_max: 20000000,
  currency: "XAF",
  deadline: "2099-12-31",
  source_url: "https://exemple.org/appel",
  collected_on: "2026-10-01",
  source_excerpt: "Extrait fictif de la source.",
  status: "verifie",
  ...surcharge,
});

describe("Catalogue des opportunités", () => {
  let administrateur;
  let compte;
  const creees = [];

  async function ajouter(libelle, surcharge) {
    const { data, error } = await administrateur.client
      .from("funding_opportunities")
      .insert(fiche(libelle, surcharge))
      .select("id, status, created_by, updated_by")
      .single();
    assert.equal(error, null, error?.message);
    creees.push(data.id);
    return data;
  }

  const lues = async (client) => {
    const { data, error } = await client
      .from("funding_opportunities")
      .select("id, name, status")
      .like("name", `% ${SUFFIXE}`);
    return { noms: (data ?? []).map((o) => o.name.replace(` ${SUFFIXE}`, "")).sort(), error };
  };

  before(async () => {
    administrateur = await creerCompte("opportunites-admin", "Administratrice");
    compte = await creerCompte("opportunites-compte", "Compte ordinaire");
    await promouvoirAdministrateur(administrateur.id);
  });

  after(async () => {
    await sql("update public.app_settings set private_admin_only = false where id;");
    if (creees.length) {
      await clientDeService().from("funding_opportunities").delete().in("id", creees);
    }
  });

  it("l'administration ajoute ; la base fixe l'auteur, sans le laisser fournir", async () => {
    const creee = await ajouter("Vérifiée");
    assert.equal(creee.status, "verifie");
    assert.equal(creee.created_by, administrateur.id);
    assert.equal(creee.updated_by, administrateur.id);

    // Ni l'auteur ni les dates d'écriture ne se fournissent, même par l'administration.
    const { error } = await administrateur.client
      .from("funding_opportunities")
      .insert({ ...fiche("Auteur forgé"), created_by: compte.id });
    assert.ok(error, "un auteur fourni doit être refusé");
    const { error: date } = await administrateur.client
      .from("funding_opportunities")
      .insert({ ...fiche("Date forgée"), created_at: "2020-01-01T00:00:00Z" });
    assert.ok(date, "une date d'écriture fournie doit être refusée");
  });

  it("un compte ne lit que le vérifié et l'expiré : jamais une démonstration", async () => {
    await ajouter("Expirée", { status: "expire" });
    await ajouter("Non vérifiée", {
      status: "non_verifie",
      source_url: null,
      collected_on: null,
      source_excerpt: "",
    });
    await ajouter("Introuvable", { status: "introuvable" });
    await ajouter("Démonstration", { status: "demo" });

    assert.deepEqual((await lues(administrateur.client)).noms, [
      "Démonstration",
      "Expirée",
      "Introuvable",
      "Non vérifiée",
      "Vérifiée",
    ]);
    assert.deepEqual((await lues(compte.client)).noms, ["Expirée", "Vérifiée"]);

    // Un visiteur ne lit rien : le catalogue n'est pas sur la vitrine.
    const visiteur = await lues(clientAnonyme());
    assert.deepEqual(visiteur.noms, []);
    assert.ok(visiteur.error, "un visiteur n'a aucun droit sur la table");
  });

  it("un compte n'ajoute, ne modifie ni ne retire rien", async () => {
    const { error: ajout } = await compte.client
      .from("funding_opportunities")
      .insert(fiche("Ajout d'un compte"));
    assert.equal(ajout?.code, "42501");

    const { data: visible } = await compte.client
      .from("funding_opportunities")
      .select("id")
      .eq("name", nom("Vérifiée"))
      .single();

    // Un champ anodin, qui laisserait la ligne visible : si la modification
    // passait, elle se verrait. Relue par l'administration, elle n'a pas bougé.
    const { data: modifiees } = await compte.client
      .from("funding_opportunities")
      .update({ description: "Modifiée par un compte." })
      .eq("id", visible.id)
      .select("id");
    assert.deepEqual(modifiees ?? [], [], "aucune ligne modifiée par un compte");
    await compte.client
      .from("funding_opportunities")
      .update({ status: "expire" })
      .eq("id", visible.id);
    const { data: intacte } = await administrateur.client
      .from("funding_opportunities")
      .select("description, status")
      .eq("id", visible.id)
      .single();
    assert.deepEqual(intacte, {
      description: "Opportunité fictive, créée par un test.",
      status: "verifie",
    });

    const { data: retirees } = await compte.client
      .from("funding_opportunities")
      .delete()
      .eq("id", visible.id)
      .select("id");
    assert.deepEqual(retirees ?? [], [], "aucune ligne retirée par un compte");

    assert.deepEqual((await lues(compte.client)).noms, ["Expirée", "Vérifiée"]);
  });

  it("« vérifiée » exige la source, la date de collecte et l'extrait, par l'API comme en SQL", async () => {
    for (const [raison, surcharge] of [
      ["sans source", { source_url: null }],
      ["sans date de collecte", { collected_on: null }],
      ["sans extrait", { source_excerpt: "  " }],
    ]) {
      const { error } = await administrateur.client
        .from("funding_opportunities")
        .insert(fiche(`Refus ${raison}`, surcharge));
      assert.equal(error?.code, "23514", raison);
    }

    // Promouvoir une opportunité non sourcée ne passe pas davantage.
    const { data: brouillon } = await administrateur.client
      .from("funding_opportunities")
      .select("id")
      .eq("name", nom("Non vérifiée"))
      .single();
    const { error: promotion } = await administrateur.client
      .from("funding_opportunities")
      .update({ status: "verifie" })
      .eq("id", brouillon.id);
    assert.equal(promotion?.code, "23514");

    // Une collecte datée de l'avenir est refusée : on n'a pas lu une page demain.
    const { error: avenir } = await administrateur.client
      .from("funding_opportunities")
      .insert(fiche("Collecte de demain", { collected_on: "2099-01-01" }));
    assert.equal(avenir?.code, "22023");

    // Un montant sans devise, une adresse en clair, un genre inconnu.
    for (const [raison, surcharge] of [
      ["montant sans devise", { currency: null }],
      ["adresse en clair", { website: "http://exemple.org/" }],
      ["genre inconnu", { genres: ["western"] }],
      ["pays en toutes lettres", { countries: ["Cameroun"] }],
      ["minimum au-dessus du maximum", { budget_min: 30000000 }],
    ]) {
      const { error } = await administrateur.client
        .from("funding_opportunities")
        .insert(fiche(`Refus ${raison}`, surcharge));
      assert.equal(error?.code, "23514", raison);
    }
  });

  it("chaque ajout, changement et retrait est journalisé, avec l'ancien statut", async () => {
    const creee = await ajouter("Journalisée", {
      status: "non_verifie",
      source_url: null,
      collected_on: null,
      source_excerpt: "",
    });
    const { error: changement } = await administrateur.client
      .from("funding_opportunities")
      .update({
        status: "verifie",
        source_url: "https://exemple.org/appel",
        collected_on: "2026-10-01",
        source_excerpt: "Extrait fictif.",
      })
      .eq("id", creee.id);
    assert.equal(changement, null, changement?.message);
    const { error: retrait } = await administrateur.client
      .from("funding_opportunities")
      .delete()
      .eq("id", creee.id);
    assert.equal(retrait, null, retrait?.message);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("actor_id, action, details")
      .eq("action", "opportunite")
      .eq("details->>nom", nom("Journalisée"))
      .order("id");
    assert.deepEqual(
      journal.map((e) => [
        e.actor_id,
        e.details.operation,
        e.details.statut,
        e.details.ancien_statut,
      ]),
      [
        [administrateur.id, "ajout", "non_verifie", undefined],
        [administrateur.id, "modification", "verifie", "non_verifie"],
        [administrateur.id, "retrait", "verifie", undefined],
      ],
    );
    // Le journal ne garde que le nom, l'organisme et les statuts.
    for (const entree of journal) {
      assert.deepEqual(
        Object.keys(entree.details)
          .filter((cle) => cle !== "ancien_statut")
          .sort(),
        ["nom", "operation", "organisme", "statut"],
      );
    }

    // Un compte ne lit pas le journal.
    const { data: vu } = await compte.client
      .from("admin_audit_log")
      .select("id")
      .eq("action", "opportunite");
    assert.deepEqual(vu ?? [], []);
  });

  it("une modification change l'auteur de la dernière écriture, pas celui de la création", async () => {
    const second = await creerCompte("opportunites-admin-2", "Seconde administratrice");
    await promouvoirAdministrateur(second.id);
    const creee = await ajouter("Reprise");
    const { data: reprise, error } = await second.client
      .from("funding_opportunities")
      .update({ description: "Corrigée par une autre administratrice." })
      .eq("id", creee.id)
      .select("created_by, updated_by")
      .single();
    assert.equal(error, null, error?.message);
    assert.equal(reprise.created_by, administrateur.id);
    assert.equal(reprise.updated_by, second.id);
  });

  it("la même opportunité ne s'ajoute pas deux fois, ni par un renommage", async () => {
    await ajouter("Unique");

    // Casse et espaces autour mis à part, c'est la même : refusée.
    const { error: seconde } = await administrateur.client.from("funding_opportunities").insert(
      fiche("Unique", {
        name: `  ${nom("Unique").toUpperCase()} `,
        organization: "organisme FICTIF ",
      }),
    );
    assert.equal(seconde?.code, "23505");

    // Le même nom chez un autre organisme est une autre opportunité.
    const autre = await ajouter("Unique", { organization: "Autre organisme fictif" });

    // La renommer vers l'organisme de la première ne passe pas davantage.
    const { error: renommage } = await administrateur.client
      .from("funding_opportunities")
      .update({ organization: "Organisme fictif" })
      .eq("id", autre.id);
    assert.equal(renommage?.code, "23505");

    const { data: restantes } = await administrateur.client
      .from("funding_opportunities")
      .select("organization")
      .ilike("name", nom("Unique"))
      .order("organization");
    assert.deepEqual(
      restantes.map((o) => o.organization),
      ["Autre organisme fictif", "Organisme fictif"],
    );
  });

  it("en mode privé, un compte ne lit plus rien ; l'administration lit et écrit toujours", async () => {
    try {
      const actif = await sql("update public.app_settings set private_admin_only = true where id;");
      assert.equal(actif.code, 0, actif.erreurs);
      assert.deepEqual((await lues(compte.client)).noms, []);
      assert.ok((await lues(administrateur.client)).noms.includes("Vérifiée"));
      await ajouter("Saisie en mode privé");
    } finally {
      const inactif = await sql(
        "update public.app_settings set private_admin_only = false where id;",
      );
      assert.equal(inactif.code, 0, inactif.erreurs);
    }
    assert.ok((await lues(compte.client)).noms.includes("Saisie en mode privé"));
  });
});
