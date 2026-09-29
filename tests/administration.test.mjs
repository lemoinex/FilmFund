/**
 * Droits d'administration.
 *
 * On vérifie autant ce qu'un administrateur doit pouvoir faire que ce qu'il
 * ne doit PAS pouvoir faire. Un test qui ne contrôle que les permissions
 * accordées laisse passer les privilèges excessifs.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, promouvoirAdministrateur } from "./helpers.mjs";

describe("Droits d'administration", () => {
  let patron;
  let membre;
  let projetDuMembre;

  before(async () => {
    patron = await creerCompte("patron", "Patron");
    membre = await creerCompte("membre", "Membre");
    projetDuMembre = await creerProjet(membre, "Projet du membre");
  });

  it("refuse definir_role à un compte qui n'est pas administrateur", async () => {
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: patron.email,
      nouveau_role: "admin",
    });

    assert.ok(error, "un membre ne doit pas pouvoir appeler definir_role");
  });

  it("permet le bootstrap du premier administrateur", async () => {
    // Aucun administrateur n'existant au départ, la première promotion passe
    // nécessairement hors de l'application. Ce test protège une correction :
    // le déclencheur bloquait autrefois jusqu'aux requêtes SQL directes, ce
    // qui rendait la création du premier administrateur impossible.
    await promouvoirAdministrateur(patron.id);

    const { data } = await patron.client
      .from("profiles")
      .select("role")
      .eq("id", patron.id)
      .maybeSingle();

    assert.equal(data?.role, "admin");
  });

  it("laisse un administrateur lire tous les profils", async () => {
    const { data, error } = await patron.client.from("profiles").select("id");

    // Une erreur ici signale en général que le rôle `authenticated` a perdu
    // le droit d'exécuter is_admin(), que les politiques appellent.
    assert.equal(error, null, error?.message);
    assert.ok(data.length >= 2, "l'administrateur doit voir plus que son seul profil");
  });

  it("laisse un administrateur lire les projets des autres", async () => {
    const { data, error } = await patron.client.from("projects").select("id");

    assert.equal(error, null, error?.message);
    assert.ok(
      data.some((projet) => projet.id === projetDuMembre.id),
      "le projet du membre doit être visible",
    );
  });

  it("interdit à un administrateur de réécrire le projet d'un auteur", async () => {
    // Décision assumée : supprimer sur demande, oui ; réécrire en silence, non.
    await patron.client.from("projects").update({ title: "RÉÉCRIT" }).eq("id", projetDuMembre.id);

    const { data } = await membre.client
      .from("projects")
      .select("title")
      .eq("id", projetDuMembre.id)
      .maybeSingle();

    assert.equal(data?.title, "Projet du membre");
  });

  it("permet à un administrateur de promouvoir un autre compte", async () => {
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: membre.email,
      nouveau_role: "admin",
    });

    assert.equal(error, null, error?.message);

    const { data } = await patron.client
      .from("profiles")
      .select("role")
      .eq("id", membre.id)
      .maybeSingle();

    assert.equal(data?.role, "admin");
  });

  it("empêche un administrateur de retirer son propre rôle", async () => {
    // Sans ce garde-fou, le dernier administrateur peut se verrouiller dehors.
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: patron.email,
      nouveau_role: "member",
    });

    assert.ok(error, "la rétrogradation de soi-même doit être refusée");

    const { data } = await patron.client
      .from("profiles")
      .select("role")
      .eq("id", patron.id)
      .maybeSingle();

    assert.equal(data?.role, "admin");
  });

  it("refuse definir_role sur une adresse inconnue", async () => {
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: "personne@nulle-part.test",
      nouveau_role: "admin",
    });

    assert.ok(error);
  });

  it("permet à un administrateur de supprimer le projet d'un autre", async () => {
    const cible = await creerCompte("cible", "Cible");
    const projet = await creerProjet(cible, "Projet à supprimer");

    await patron.client.from("projects").delete().eq("id", projet.id);

    const { data } = await cible.client.from("projects").select("id").eq("id", projet.id);
    assert.equal(data?.length, 0, "le projet devrait avoir été supprimé");
  });
});
