/**
 * Cloisonnement des données entre utilisateurs.
 *
 * Ces tests ne vérifient pas que les politiques RLS « existent » : ils
 * tentent de les contourner. Une politique qu'on n'a pas essayé de
 * contourner n'est pas une politique vérifiée.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import { clientAnonyme, creerCompte, creerProjet } from "./helpers.mjs";

describe("Cloisonnement des profils et des projets", () => {
  let alice;
  let bob;
  let projetAlice;

  before(async () => {
    alice = await creerCompte("alice", "Alice Diop");
    bob = await creerCompte("bob", "Bob Traoré");
    projetAlice = await creerProjet(alice, "Lumière de l'Océan");
  });

  after(async () => {
    await alice.client.auth.signOut();
    await bob.client.auth.signOut();
  });

  it("crée le profil automatiquement à l'inscription", async () => {
    const { data } = await alice.client
      .from("profiles")
      .select("id, display_name, role")
      .eq("id", alice.id)
      .maybeSingle();

    assert.equal(data?.id, alice.id, "le profil devrait exister");
    assert.equal(data?.display_name, "Alice Diop", "le nom devrait venir des métadonnées");
  });

  it("attribue le rôle 'member' par défaut", async () => {
    const { data } = await alice.client
      .from("profiles")
      .select("role")
      .eq("id", alice.id)
      .maybeSingle();

    assert.equal(data?.role, "member", "un nouveau compte ne doit jamais naître administrateur");
  });

  it("empêche de lire le profil d'un autre compte", async () => {
    const { data } = await alice.client.from("profiles").select("id").eq("id", bob.id);
    assert.equal(data?.length, 0, "Alice ne doit voir aucune ligne du profil de Bob");
  });

  it("empêche un membre de s'auto-promouvoir administrateur", async () => {
    // Sans le déclencheur dédié, la politique « chacun modifie son profil »
    // suffirait à n'importe qui pour se donner tous les droits.
    await alice.client.from("profiles").update({ role: "admin" }).eq("id", alice.id);

    const { data } = await alice.client
      .from("profiles")
      .select("role")
      .eq("id", alice.id)
      .maybeSingle();

    assert.equal(data?.role, "member", "le rôle ne doit pas avoir changé");
  });

  it("empêche de renommer le profil d'un autre compte", async () => {
    await bob.client.from("profiles").update({ display_name: "PIRATE" }).eq("id", alice.id);

    const { data } = await alice.client
      .from("profiles")
      .select("display_name")
      .eq("id", alice.id)
      .maybeSingle();

    assert.equal(data?.display_name, "Alice Diop");
  });

  it("empêche de lire le projet d'un autre compte", async () => {
    const { data } = await bob.client.from("projects").select("id").eq("id", projetAlice.id);
    assert.equal(data?.length, 0);
  });

  it("empêche de créer un projet au nom d'un autre compte", async () => {
    const { error } = await bob.client
      .from("projects")
      .insert({ owner_id: alice.id, title: "Projet usurpé" });

    assert.ok(error, "l'insertion aurait dû être rejetée");
    assert.equal(error.code, "42501", "le rejet doit venir de la RLS");
  });

  it("empêche de modifier le projet d'un autre compte", async () => {
    await bob.client.from("projects").update({ title: "DÉTOURNÉ" }).eq("id", projetAlice.id);

    const { data } = await alice.client
      .from("projects")
      .select("title")
      .eq("id", projetAlice.id)
      .maybeSingle();

    assert.equal(data?.title, "Lumière de l'Océan");
  });

  it("empêche de supprimer le projet d'un autre compte", async () => {
    await bob.client.from("projects").delete().eq("id", projetAlice.id);

    const { data } = await alice.client.from("projects").select("id").eq("id", projetAlice.id);
    assert.equal(data?.length, 1, "le projet doit toujours exister");
  });

  it("ne renvoie aucun profil à un visiteur anonyme", async () => {
    const { data } = await clientAnonyme().from("profiles").select("id");
    assert.equal(data?.length, 0);
  });

  it("ne renvoie aucun projet à un visiteur anonyme", async () => {
    const { data } = await clientAnonyme().from("projects").select("id");
    assert.equal(data?.length, 0);
  });

  it("laisse un membre voir ses propres projets", async () => {
    const { data } = await alice.client.from("projects").select("id");
    assert.equal(data?.length, 1, "Alice doit voir son unique projet");
  });
});
