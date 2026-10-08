/**
 * Alerte « nouvelle opportunité » (lot W2) : ce que la lecture des alertes
 * demande à la base, joué depuis l'API, et le calcul sur ce qu'elle rend.
 *
 * Les règles de l'alerte elles-mêmes sont éprouvées par tests/alertes.test.mjs ;
 * le déclencheur qui pose la date, par supabase/tests/opportunite_verifiee_le.test.sql.
 * AUCUN APPEL À UN FOURNISSEUR.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { calculerAlertes, SEUILS_ALERTES } from "../src/lib/alertes.ts";
import { jourApres } from "../src/lib/tableau-de-bord.ts";
import { creerCompte, promouvoirAdministrateur } from "./helpers.mjs";

const COLONNES =
  "id, name, organization, countries, formats, genres, deadline, status, verified_at";
const marque = `W2-${Date.now()}`;
const jour = new Date().toISOString().slice(0, 10);

describe("Nouvelle opportunité : de la base à l'alerte", () => {
  let administrateur;
  let membre;
  let verifiee;
  let enAttente;

  const ajouter = async (nom, statut) => {
    const { data, error } = await administrateur.client
      .from("funding_opportunities")
      .insert({
        name: `${nom} ${marque}`,
        organization: `Organisme ${marque}`,
        category: "fonds",
        status: statut,
        ...(statut === "verifie"
          ? {
              source_url: "https://exemple.test/appel",
              collected_on: jour,
              source_excerpt: "Extrait de la page consultée pour ce test.",
            }
          : {}),
      })
      .select("id, verified_at")
      .single();
    assert.ifError(error);
    return data;
  };

  /** La requête de `alertes/lecture.ts`, telle quelle. */
  const recentes = (compte) =>
    compte.client
      .from("funding_opportunities")
      .select(COLONNES)
      .eq("status", "verifie")
      .gte("verified_at", `${jourApres(jour, -SEUILS_ALERTES.opportuniteNouvelle)}T00:00:00Z`)
      .order("verified_at", { ascending: false })
      .limit(500);

  before(async () => {
    administrateur = await creerCompte("nouvelle-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    membre = await creerCompte("nouvelle-membre");
    verifiee = await ajouter("Fonds vérifié", "verifie");
    enAttente = await ajouter("Fonds en attente", "non_verifie");
  });

  after(async () => {
    await administrateur.client
      .from("funding_opportunities")
      .delete()
      .eq("organization", `Organisme ${marque}`);
  });

  it("la base date l'opportunité vérifiée, et pas celle qui attend", () => {
    assert.ok(verifiee.verified_at, "une date est posée à la création vérifiée");
    assert.equal(enAttente.verified_at, null);
    assert.equal(verifiee.verified_at.slice(0, 10), jour);
  });

  it("un compte lit l'opportunité récente, sa date comprise, et jamais celle qui attend", async () => {
    const { data, error } = await recentes(membre);
    assert.ifError(error);
    const siennes = data.filter((o) => o.organization === `Organisme ${marque}`);
    assert.deepEqual(
      siennes.map((o) => o.id),
      [verifiee.id],
    );
    assert.deepEqual(Object.keys(siennes[0]).sort(), COLONNES.split(", ").sort());
    assert.match(siennes[0].verified_at, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("ce que la base rend donne une alerte « nouvelle », datée du jour", async () => {
    const { data } = await recentes(membre);
    const lue = data.find((o) => o.id === verifiee.id);
    const alertes = calculerAlertes(
      {
        titres: new Map([["projet", "Projet d'essai"]]),
        etapes: [],
        candidatures: [],
        pieces: [],
        opportunites: [
          {
            id: lue.id,
            projetId: "projet",
            name: lue.name,
            organization: lue.organization,
            deadline: lue.deadline,
            verifieeLe: lue.verified_at?.slice(0, 10) ?? null,
          },
        ],
      },
      jour,
    );
    assert.deepEqual(
      alertes.map((a) => [a.nature, a.jour, a.href]),
      [["opportunite_nouvelle", jour, `/opportunites/${verifiee.id}`]],
    );
    assert.match(alertes[0].detail, /vérifiée aujourd'hui$/);
  });

  it("personne ne réécrit la date depuis l'API, pas même un administrateur", async () => {
    for (const compte of [membre, administrateur]) {
      const { error } = await compte.client
        .from("funding_opportunities")
        .update({ verified_at: "2020-01-01T00:00:00Z" })
        .eq("id", verifiee.id);
      assert.ok(error, "l'écriture de la date doit être refusée");
    }
    const { data } = await administrateur.client
      .from("funding_opportunities")
      .select("verified_at")
      .eq("id", verifiee.id)
      .single();
    assert.equal(data.verified_at, verifiee.verified_at);
  });

  it("corriger l'opportunité ne la redate pas ; la faire vérifier la date", async () => {
    const { error: correction } = await administrateur.client
      .from("funding_opportunities")
      .update({ description: "Une précision ajoutée." })
      .eq("id", verifiee.id);
    assert.ifError(correction);
    const { data: apres } = await administrateur.client
      .from("funding_opportunities")
      .select("verified_at")
      .eq("id", verifiee.id)
      .single();
    assert.equal(apres.verified_at, verifiee.verified_at);

    const { data: passee, error } = await administrateur.client
      .from("funding_opportunities")
      .update({
        status: "verifie",
        source_url: "https://exemple.test/appel-2",
        collected_on: jour,
        source_excerpt: "Extrait de la page consultée pour ce test.",
      })
      .eq("id", enAttente.id)
      .select("verified_at")
      .single();
    assert.ifError(error);
    assert.ok(passee.verified_at);
    const { data } = await recentes(membre);
    assert.equal(data.filter((o) => o.organization === `Organisme ${marque}`).length, 2);
  });
});
