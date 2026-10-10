/**
 * Les administrateurs lisent les équipes (lot Z4), éprouvé par l'API avec de
 * vrais comptes : une administratrice membre d'aucun projet, une porteuse, un
 * membre, un compte étranger et un visiteur.
 *
 * Avant ce lot, une administratrice ne lisait que les équipes dont elle
 * faisait partie : le comptage « membres d'équipe » des statistiques d'usage,
 * calculé sous ses droits, valait zéro quelle que soit la plateforme.
 *
 * Les comptes et les projets d'ici sont FICTIFS. Aucun appel à un fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const MIGRATION = "supabase/migrations/20261011000000_admin_lit_equipes.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

describe("Les administrateurs lisent les équipes", () => {
  let administratrice;
  let porteuse;
  let membre;
  let etranger;
  let projet;

  const adhesions = async (compte, projetId) => {
    const { data, error } = await compte.client
      .from("project_members")
      .select("user_id, role")
      .eq("project_id", projetId);
    assert.equal(error, null, error?.message);
    return data;
  };

  before(async () => {
    administratrice = await creerCompte("equipes-admin", "Administration");
    await promouvoirAdministrateur(administratrice.id);
    porteuse = await creerCompte("equipes-porteuse");
    membre = await creerCompte("equipes-membre");
    etranger = await creerCompte("equipes-etranger");
    projet = await creerProjet(porteuse, "Projet à équipe");
    await faireEntrer(porteuse, projet.id, membre, "viewer");
  });

  it("une administratrice hors de toute équipe lit l'adhésion d'un projet", async () => {
    // Elle n'est membre d'aucun projet : ce qu'elle lit ne vient pas d'une adhésion.
    const { data: siennes } = await administratrice.client
      .from("project_members")
      .select("project_id")
      .eq("user_id", administratrice.id);
    assert.deepEqual(siennes, []);
    assert.deepEqual(await adhesions(administratrice, projet.id), [
      { user_id: membre.id, role: "viewer" },
    ]);
  });

  it("le comptage « membres d'équipe » des statistiques n'est plus celui de ses seules équipes", async () => {
    const { data, error } = await administratrice.client.rpc("statistiques_usage");
    assert.equal(error, null, error?.message);
    const ligne = data.find((l) => l.domaine === "contenus" && l.cle === "membres_equipe");
    assert.ok(ligne, "le comptage figure dans les statistiques");
    // Au moins l'adhésion de ce test : avant le lot, elle lisait zéro.
    assert.ok(ligne.nombre >= 1, `membres d'équipe : ${ligne.nombre}`);
  });

  it("un membre et la porteuse lisent l'équipe de leur projet, comme avant", async () => {
    for (const compte of [membre, porteuse]) {
      assert.deepEqual(await adhesions(compte, projet.id), [
        { user_id: membre.id, role: "viewer" },
      ]);
    }
  });

  it("un compte étranger et un visiteur ne lisent aucune adhésion de ce projet", async () => {
    assert.deepEqual(await adhesions(etranger, projet.id), []);
    const { data } = await clientAnonyme()
      .from("project_members")
      .select("user_id")
      .eq("project_id", projet.id);
    assert.deepEqual(data ?? [], []);
  });

  it("un compte ordinaire ne lit toujours pas les statistiques", async () => {
    const { data, error } = await membre.client.rpc("statistiques_usage");
    assert.equal(error?.code, "42501");
    assert.equal(data, null);
  });

  it("lire n'est pas écrire : l'administratrice ne change ni ne retire un membre par cette table", async () => {
    const modification = await administratrice.client
      .from("project_members")
      .update({ role: "editor" })
      .eq("project_id", projet.id)
      .select("user_id");
    assert.deepEqual(modification.data ?? [], []);
    const retrait = await administratrice.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .select("user_id");
    assert.deepEqual(retrait.data ?? [], []);
    assert.deepEqual(await adhesions(porteuse, projet.id), [
      { user_id: membre.id, role: "viewer" },
    ]);
  });
});

describe("Les administrateurs lisent les équipes : la migration", () => {
  const migration = lire(MIGRATION).replace(/^\s*--.*$/gm, "");

  it("une seule règle, de lecture, pour les comptes, tenue par is_admin()", () => {
    assert.match(
      migration,
      /create policy "Un administrateur lit toutes les équipes"\s+on public\.project_members for select\s+to authenticated\s+using \(\(select public\.is_admin\(\)\)\);/,
    );
    assert.equal(migration.split("create policy").length - 1, 1);
    assert.doesNotMatch(
      migration,
      /drop |alter |grant |revoke |create (or replace )?function|for (all|insert|update|delete)/i,
    );
  });
});
