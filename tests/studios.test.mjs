/**
 * Studios.
 *
 * Un studio regroupe des projets ; il ne donne accès à aucun d'eux. Les
 * tests tentent de contourner chaque règle : studio d'autrui forgé, projet
 * déplacé, adhésion que l'on s'attribue, propriétaire de studio qui lirait
 * un projet dont il n'est pas l'équipe.
 *
 * Matrice des rôles éprouvée sur un studio partagé : auteur (membre du
 * studio, porteur du projet), collaborateur (équipe du projet, hors
 * studio), propriétaire du studio (hors équipe), administrateur global.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { creerCompte, creerProjet, faireEntrer, promouvoirAdministrateur } from "./helpers.mjs";

async function studioPersonnel(compte) {
  const { data, error } = await compte.client
    .from("studios")
    .select("id, personal_owner_id")
    .eq("personal_owner_id", compte.id)
    .single();
  assert.equal(error, null, error?.message);
  return data.id;
}

describe("Studios", () => {
  let proprietaire;
  let membre;
  let collaborateur;
  let tiers;
  let administrateur;
  let studioPartage;
  let projetPartage;

  before(async () => {
    proprietaire = await creerCompte("proprietaire", "Propriétaire du studio");
    membre = await creerCompte("membre", "Membre du studio");
    collaborateur = await creerCompte("collaborateur", "Collaborateur");
    tiers = await creerCompte("tiers", "Compte d'un autre studio");
    administrateur = await creerCompte("admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);

    // Le studio personnel du propriétaire devient partagé : l'administration
    // y fait entrer un membre — seul chemin d'adhésion dans ce lot.
    studioPartage = await studioPersonnel(proprietaire);
    const { error: adhesion } = await administrateur.client
      .from("studio_members")
      .insert({ studio_id: studioPartage, user_id: membre.id, role: "member" });
    assert.equal(adhesion, null, adhesion?.message);

    const { data, error } = await membre.client
      .from("projects")
      .insert({ owner_id: membre.id, title: "Le film du membre", studio_id: studioPartage })
      .select("id, studio_id")
      .single();
    assert.equal(error, null, error?.message);
    projetPartage = data;
    await faireEntrer(membre, projetPartage.id, collaborateur, "editor");
  });

  describe("Studio personnel", () => {
    it("chaque compte reçoit à l'inscription un studio personnel, dont il est propriétaire", async () => {
      const { data: studios } = await tiers.client.from("studios").select("id, personal_owner_id");
      assert.equal(studios.length, 1);
      assert.equal(studios[0].personal_owner_id, tiers.id);

      const { data: adhesions } = await tiers.client
        .from("studio_members")
        .select("user_id, role")
        .eq("studio_id", studios[0].id);
      assert.deepEqual(adhesions, [{ user_id: tiers.id, role: "owner" }]);
    });

    it("un projet naît dans le studio personnel de son porteur", async () => {
      const projet = await creerProjet(tiers, "Projet sans studio précisé");
      const { data } = await tiers.client
        .from("projects")
        .select("studio_id")
        .eq("id", projet.id)
        .single();
      assert.equal(data.studio_id, await studioPersonnel(tiers));
    });

    it("le titulaire ne quitte pas son studio personnel ni n'en perd la propriété, même par l'administration", async () => {
      const { error: retrait } = await administrateur.client
        .from("studio_members")
        .delete()
        .eq("studio_id", studioPartage)
        .eq("user_id", proprietaire.id);
      assert.equal(retrait?.code, "42501");

      const { error: declassement } = await administrateur.client
        .from("studio_members")
        .update({ role: "member" })
        .eq("studio_id", studioPartage)
        .eq("user_id", proprietaire.id);
      assert.equal(declassement?.code, "42501");

      const { error: suppression } = await administrateur.client
        .from("studios")
        .delete()
        .eq("id", studioPartage);
      assert.ok(suppression, "un studio personnel ne se supprime pas");
    });
  });

  describe("Isolation entre studios", () => {
    it("un compte ne lit ni le studio ni les membres d'un autre studio", async () => {
      const { data: studios } = await tiers.client
        .from("studios")
        .select("id")
        .eq("id", studioPartage);
      assert.equal(studios.length, 0);

      const { data: adhesions } = await tiers.client
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studioPartage);
      assert.equal(adhesions.length, 0);
    });

    it("un studio forgé est refusé : on ne crée pas de projet dans le studio d'autrui", async () => {
      const { error } = await tiers.client
        .from("projects")
        .insert({ owner_id: tiers.id, title: "Projet glissé", studio_id: studioPartage });
      assert.equal(error?.code, "42501");
    });

    it("un projet ne change pas de studio", async () => {
      const projet = await creerProjet(tiers, "Projet à déplacer");
      const { error } = await tiers.client
        .from("projects")
        .update({ studio_id: studioPartage })
        .eq("id", projet.id);
      assert.equal(error?.code, "42501");
    });

    it("personne ne s'ajoute à un studio, ne s'y donne un rôle ni n'en crée", async () => {
      const { error: ajout } = await tiers.client
        .from("studio_members")
        .insert({ studio_id: studioPartage, user_id: tiers.id, role: "owner" });
      assert.ok(ajout, "l'ajout doit être refusé");

      const { data: promotion } = await membre.client
        .from("studio_members")
        .update({ role: "owner" })
        .eq("studio_id", studioPartage)
        .eq("user_id", membre.id)
        .select("role");
      assert.equal(promotion?.length ?? 0, 0);

      const { data: adhesion } = await administrateur.client
        .from("studio_members")
        .select("role")
        .eq("studio_id", studioPartage)
        .eq("user_id", membre.id)
        .single();
      assert.equal(adhesion.role, "member");

      const { error: creation } = await tiers.client.from("studios").insert({ name: "Mon studio" });
      assert.ok(creation, "la création de studio doit être refusée");
    });
  });

  describe("Matrice des rôles dans un studio partagé", () => {
    it("un membre du studio y crée un projet", () => {
      assert.equal(projetPartage.studio_id, studioPartage);
    });

    it("l'auteur et le collaborateur accèdent au projet ; le propriétaire du studio, hors équipe, n'en voit rien", async () => {
      for (const compte of [membre, collaborateur]) {
        const { data } = await compte.client
          .from("projects")
          .select("id")
          .eq("id", projetPartage.id);
        assert.equal(data.length, 1);
      }

      const { data: vu } = await proprietaire.client
        .from("projects")
        .select("id")
        .eq("id", projetPartage.id);
      assert.equal(vu.length, 0);

      const { data: modifie } = await proprietaire.client
        .from("projects")
        .update({ title: "Réécrit par le propriétaire du studio" })
        .eq("id", projetPartage.id)
        .select("id");
      assert.equal(modifie.length, 0);
    });

    it("un collaborateur de projet n'est pas membre du studio, et n'y crée rien", async () => {
      const { data } = await collaborateur.client
        .from("studios")
        .select("id")
        .eq("id", studioPartage);
      assert.equal(data.length, 0);

      const { error } = await collaborateur.client.from("projects").insert({
        owner_id: collaborateur.id,
        title: "Projet du collaborateur",
        studio_id: studioPartage,
      });
      assert.equal(error?.code, "42501");
    });

    it("l'administrateur global voit le studio, ses membres et le projet", async () => {
      const { data: studio } = await administrateur.client
        .from("studios")
        .select("id")
        .eq("id", studioPartage);
      assert.equal(studio.length, 1);

      const { data: adhesions } = await administrateur.client
        .from("studio_members")
        .select("user_id")
        .eq("studio_id", studioPartage);
      assert.equal(adhesions.length, 2);

      const { data: projet } = await administrateur.client
        .from("projects")
        .select("id")
        .eq("id", projetPartage.id);
      assert.equal(projet.length, 1);
    });
  });

  describe("Journal", () => {
    it("l'ajout d'un membre par l'administration est journalisé", async () => {
      const { data } = await administrateur.client
        .from("admin_audit_log")
        .select("actor_id, details")
        .eq("action", "intervention_studio")
        .eq("details->>studio", studioPartage);

      assert.deepEqual(
        data.map(({ actor_id, details }) => ({ actor_id, details })),
        [
          {
            actor_id: administrateur.id,
            details: {
              table: "studio_members",
              operation: "insert",
              studio: studioPartage,
              compte: membre.id,
            },
          },
        ],
      );
    });
  });

  describe("Adhésion révoquée", () => {
    it("retiré du studio, un membre ne peut plus y créer de projet", async () => {
      const { data: retire, error: erreurRetrait } = await administrateur.client
        .from("studio_members")
        .delete()
        .eq("studio_id", studioPartage)
        .eq("user_id", membre.id)
        .select("user_id");
      assert.equal(erreurRetrait, null, erreurRetrait?.message);
      assert.equal(retire.length, 1);

      const { error } = await membre.client
        .from("projects")
        .insert({ owner_id: membre.id, title: "Après le départ", studio_id: studioPartage });
      assert.equal(error?.code, "42501");
    });
  });
});
