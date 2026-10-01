/**
 * Mode privé : application réservée aux administrateurs.
 *
 * L'interrupteur est global : ce fichier l'active, puis le lève dans tous
 * les cas en fin de suite. C'est pourquoi `npm test` exécute les fichiers un
 * par un (`--test-concurrency=1`) : en parallèle, les autres suites
 * s'exécuteraient pendant que le verrou est posé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientDeService,
  creerCompte,
  creerProjet,
  faireEntrer,
  inviter,
  promouvoirAdministrateur,
} from "./helpers.mjs";

async function definirModePrive(actif) {
  const { error } = await clientDeService()
    .from("app_settings")
    .update({ private_admin_only: actif })
    .eq("id", true);

  if (error) {
    throw new Error(`Bascule du mode privé impossible : ${error.message}`);
  }
}

describe("Mode privé", () => {
  let administrateur;
  let autreAdministrateur;
  let membre;
  let equipier;
  let projetDuMembre;
  let projetAdmin;
  let invitationEnAttente;
  let imageDuMembre;
  let versionDuMembre;

  before(async () => {
    // Mise en place mode levé : les comptes et l'équipe existent déjà quand
    // le verrou tombe, comme en production.
    administrateur = await creerCompte("admin");
    autreAdministrateur = await creerCompte("admin2");
    membre = await creerCompte("membre");
    equipier = await creerCompte("equipier");
    await promouvoirAdministrateur(administrateur.id);
    await promouvoirAdministrateur(autreAdministrateur.id);

    projetDuMembre = await creerProjet(membre, "Projet d'un membre");
    projetAdmin = await creerProjet(administrateur, "Projet d'un administrateur");
    await faireEntrer(administrateur, projetAdmin.id, equipier, "editor");
    invitationEnAttente = await inviter(administrateur, projetAdmin.id, membre.email);

    imageDuMembre = `${projetDuMembre.id}/couverture/avant-le-verrou.png`;
    const { error: envoi } = await membre.client.storage
      .from("project-images")
      .upload(imageDuMembre, Buffer.from("iVBORw0KGgo=", "base64"), { contentType: "image/png" });
    assert.equal(envoi, null, envoi?.message);

    const { data: document, error: erreurDocument } = await membre.client
      .from("project_documents")
      .insert({
        project_id: projetDuMembre.id,
        type: "note_intention",
        title: "Avant le verrou",
        content: "Texte écrit avant le verrou.",
        created_by: membre.id,
      })
      .select("id")
      .single();
    assert.equal(erreurDocument, null, erreurDocument?.message);
    const { data: versionsAvant } = await membre.client
      .from("project_document_versions")
      .select("id")
      .eq("document_id", document.id);
    assert.equal(versionsAvant.length, 1);
    versionDuMembre = versionsAvant[0].id;

    await definirModePrive(true);
  });

  // Quoi qu'il arrive, le verrou est levé : un échec ici ne doit pas faire
  // échouer toutes les suites suivantes.
  after(async () => {
    await definirModePrive(false);
  });

  describe("compte non administrateur", () => {
    it("ne lit plus ses propres projets", async () => {
      const { data } = await membre.client.from("projects").select("id");
      assert.equal(data.length, 0);
    });

    it("ne lit plus son propre profil", async () => {
      const { data } = await membre.client.from("profiles").select("id");
      assert.equal(data.length, 0);
    });

    it("ne crée pas de projet", async () => {
      const { error } = await membre.client
        .from("projects")
        .insert({ owner_id: membre.id, title: "Pendant le verrou" });
      assert.ok(error, "la création doit être refusée");
    });

    it("ne modifie ni ne supprime ses projets", async () => {
      const { data: modifies } = await membre.client
        .from("projects")
        .update({ title: "Changé" })
        .eq("id", projetDuMembre.id)
        .select("id");
      assert.equal(modifies.length, 0);

      const { data: supprimes } = await membre.client
        .from("projects")
        .delete()
        .eq("id", projetDuMembre.id)
        .select("id");
      assert.equal(supprimes.length, 0);
    });

    it("n'accepte pas une invitation qui lui est pourtant destinée", async () => {
      const { error } = await membre.client.rpc("accepter_invitation", {
        p_invitation_id: invitationEnAttente,
      });
      assert.ok(error, "accepter_invitation contourne la RLS, le déclencheur doit bloquer");
    });

    it("ne devient pas administrateur", async () => {
      const { data } = await membre.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", membre.id)
        .select("id");
      assert.equal(data?.length ?? 0, 0);

      const { data: estAdmin } = await membre.client.rpc("is_admin");
      assert.equal(estAdmin, false);
    });

    it("ne quitte ni ne modifie une équipe", async () => {
      const { data: depart } = await equipier.client
        .from("project_members")
        .delete()
        .eq("project_id", projetAdmin.id)
        .eq("user_id", equipier.id)
        .select("user_id");
      assert.equal(depart?.length ?? 0, 0);

      const { data: promotion } = await equipier.client
        .from("project_members")
        .update({ role: "editor" })
        .eq("user_id", equipier.id)
        .select("user_id");
      assert.equal(promotion?.length ?? 0, 0);
    });

    it("ne lit ni n'écrit de document", async () => {
      const { data } = await membre.client.from("project_documents").select("id");
      assert.equal(data.length, 0);

      const { error } = await membre.client.from("project_documents").insert({
        project_id: projetDuMembre.id,
        type: "note_intention",
        title: "Pendant le verrou",
        created_by: membre.id,
      });
      assert.ok(error, "la création doit être refusée");
    });

    it("ne lit plus son studio ni ses adhésions", async () => {
      const { data: studios } = await membre.client.from("studios").select("id");
      assert.equal(studios.length, 0);

      const { data: adhesions } = await membre.client.from("studio_members").select("studio_id");
      assert.equal(adhesions.length, 0);
    });

    it("ne lit ni ne restaure de version de document", async () => {
      const { data } = await membre.client.from("project_document_versions").select("id");
      assert.equal(data.length, 0);

      const { error } = await membre.client.rpc("restaurer_version_document", {
        p_version_id: versionDuMembre,
      });
      assert.ok(error, "la restauration doit être refusée");
    });

    it("ne lit ni n'écrit de scène", async () => {
      const { data } = await membre.client.from("storyboard_scenes").select("id");
      assert.equal(data.length, 0);

      const { error } = await membre.client.from("storyboard_scenes").insert({
        project_id: projetDuMembre.id,
        position: 1,
        title: "Pendant le verrou",
        created_by: membre.id,
      });
      assert.ok(error, "la création doit être refusée");
    });

    it("ne lit ni n'écrit d'étape de planning", async () => {
      const { data } = await membre.client.from("project_milestones").select("id");
      assert.equal(data.length, 0);

      const { error } = await membre.client.from("project_milestones").insert({
        project_id: projetDuMembre.id,
        title: "Pendant le verrou",
        created_by: membre.id,
      });
      assert.ok(error, "la création doit être refusée");
    });

    it("ne lit ni n'écrit de candidature", async () => {
      const { data } = await membre.client.from("project_fundings").select("id");
      assert.equal(data.length, 0);

      const { error } = await membre.client.from("project_fundings").insert({
        project_id: projetDuMembre.id,
        funder: "Pendant le verrou",
        currency: "XOF",
        created_by: membre.id,
      });
      assert.ok(error, "la création doit être refusée");
    });

    it("n'obtient plus de lien vers ses propres images, ni n'en envoie", async () => {
      const { error: lien } = await membre.client.storage
        .from("project-images")
        .createSignedUrl(imageDuMembre, 60);
      assert.ok(lien, "le stockage suit le verrou, comme les tables");

      const { error: envoi } = await membre.client.storage
        .from("project-images")
        .upload(`${projetDuMembre.id}/scenes/pendant.png`, Buffer.from("x"), {
          contentType: "image/png",
        });
      assert.ok(envoi, "l'envoi doit être refusé");
    });

    it("un éditeur d'équipe perd l'accès au projet partagé", async () => {
      const { data } = await equipier.client.from("projects").select("id").eq("id", projetAdmin.id);
      assert.equal(data.length, 0);
    });
  });

  describe("administrateur", () => {
    it("lit tous les projets et tous les profils", async () => {
      const { data: projets } = await administrateur.client
        .from("projects")
        .select("id")
        .in("id", [projetDuMembre.id, projetAdmin.id]);
      assert.equal(projets.length, 2);

      const { data: profils } = await administrateur.client
        .from("profiles")
        .select("id")
        .eq("id", membre.id);
      assert.equal(profils.length, 1);
    });

    it("crée et modifie ses projets", async () => {
      const projet = await creerProjet(administrateur, "Créé pendant le verrou");
      const { data } = await administrateur.client
        .from("projects")
        .update({ logline: "Toujours possible" })
        .eq("id", projet.id)
        .select("id");
      assert.equal(data.length, 1);
    });

    it("gère un budget", async () => {
      const { error } = await administrateur.client
        .from("project_budgets")
        .insert({ project_id: projetDuMembre.id, currency: "XOF" });
      assert.equal(error, null, error?.message);

      const { error: erreurLigne } = await administrateur.client.from("budget_lines").insert({
        project_id: projetDuMembre.id,
        category: "materiel",
        label: "Caméra",
        unit_cost: 1000,
        created_by: administrateur.id,
      });
      assert.equal(erreurLigne, null, erreurLigne?.message);
    });

    it("invite, modifie et retire des membres", async () => {
      const { error: invitation } = await administrateur.client.from("project_invitations").insert({
        project_id: projetAdmin.id,
        email: `nouveau${Date.now()}@exemple.test`,
        invited_by: administrateur.id,
      });
      assert.equal(invitation, null, invitation?.message);

      const { data: modifie, error: modification } = await administrateur.client
        .from("project_members")
        .update({ role: "viewer" })
        .eq("project_id", projetAdmin.id)
        .eq("user_id", equipier.id)
        .select("role");
      assert.equal(modification, null, modification?.message);
      assert.deepEqual(modifie, [{ role: "viewer" }]);

      const { data: retire, error: retrait } = await administrateur.client
        .from("project_members")
        .delete()
        .eq("project_id", projetAdmin.id)
        .eq("user_id", equipier.id)
        .select("user_id");
      assert.equal(retrait, null, retrait?.message);
      assert.equal(retire.length, 1);
    });

    it("accepte une invitation qui lui est destinée", async () => {
      const id = await inviter(administrateur, projetAdmin.id, autreAdministrateur.email);
      const { error } = await autreAdministrateur.client.rpc("accepter_invitation", {
        p_invitation_id: id,
      });
      assert.equal(error, null, error?.message);
    });

    it("n'attribue aucun rôle applicatif", async () => {
      const { error: parProfil } = await administrateur.client
        .from("profiles")
        .update({ role: "admin" })
        .eq("id", membre.id);
      assert.ok(parProfil, "la promotion par UPDATE est gelée");

      const { error: parFonction } = await administrateur.client.rpc("definir_role", {
        email_cible: membre.email,
        nouveau_role: "admin",
      });
      assert.ok(parFonction, "la promotion par definir_role est gelée");

      // Rétrograder un autre administrateur n'est pas plus permis.
      const { error: retrogradation } = await administrateur.client.rpc("definir_role", {
        email_cible: autreAdministrateur.email,
        nouveau_role: "member",
      });
      assert.ok(retrogradation);
    });

    it("supprime un projet, équipe et invitations comprises", async () => {
      // La suppression en cascade traverse les tables gelées : elle doit
      // rester possible, sans quoi un administrateur ne pourrait plus
      // retirer un contenu.
      const { data, error } = await administrateur.client
        .from("projects")
        .delete()
        .eq("id", projetAdmin.id)
        .select("id");
      assert.equal(error, null, error?.message);
      assert.equal(data.length, 1);
    });
  });

  it("une fois le mode levé, le comportement historique revient", async () => {
    await definirModePrive(false);

    const { data } = await membre.client.from("projects").select("id").eq("id", projetDuMembre.id);
    assert.equal(data.length, 1, "le membre retrouve son projet");

    const { error } = await membre.client
      .from("projects")
      .insert({ owner_id: membre.id, title: "Après le verrou" });
    assert.equal(error, null, error?.message);

    await definirModePrive(true);
  });
});
