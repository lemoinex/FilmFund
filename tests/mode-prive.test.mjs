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
  definirPlafondIa,
  deposerExport,
  deposerProposition,
  engager,
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
  let devisDuMembre;
  let tacheDuMembre;
  let propositionDuMembre;
  let exportDuMembre;

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

    const { data: devis, error: erreurDevis } = await membre.client.rpc("creer_devis", {
      p_project_id: projetDuMembre.id,
      p_action: "logline",
      p_params: {},
    });
    assert.equal(erreurDevis, null, erreurDevis?.message);
    devisDuMembre = devis[0].quote_id;

    const { data: devisAccepte } = await membre.client.rpc("creer_devis", {
      p_project_id: projetDuMembre.id,
      p_action: "logline",
      p_params: {},
    });
    const { data: reservation, error: erreurReservation } = await membre.client.rpc(
      "accepter_devis",
      { p_quote_id: devisAccepte[0].quote_id, p_idempotency_key: "avant-le-verrou" },
    );
    assert.equal(erreurReservation, null, erreurReservation?.message);
    const { data: tache } = await membre.client
      .from("jobs")
      .select("id")
      .eq("reservation_id", reservation.id)
      .single();
    tacheDuMembre = tache.id;

    // Une proposition déposée avant le verrou, sur une tâche à part : celle
    // du dessus doit rester en attente pour éprouver l'annulation. Le
    // registre local garde les provisions des exécutions précédentes.
    await definirPlafondIa(1_000_000);
    const tacheAboutie = await engager(
      membre,
      projetDuMembre.id,
      "logline",
      "avant-le-verrou-proposition",
    );
    await deposerProposition(tacheAboutie.id, "Une proposition d'avant le verrou.");
    const { data: proposition, error: erreurProposition } = await membre.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tacheAboutie.id)
      .single();
    assert.equal(erreurProposition, null, erreurProposition?.message);
    propositionDuMembre = proposition.id;

    // Un export déposé avant le verrou, lui aussi.
    const tacheExport = await engager(
      membre,
      projetDuMembre.id,
      "pdf_export",
      "avant-le-verrou-export",
      { sections: ["synthese"] },
    );
    await deposerExport(tacheExport.id);
    const { data: exportDepose, error: erreurExport } = await membre.client
      .from("project_exports")
      .select("id")
      .eq("job_id", tacheExport.id)
      .single();
    assert.equal(erreurExport, null, erreurExport?.message);
    exportDuMembre = exportDepose.id;

    await definirModePrive(true);
  });

  // Quoi qu'il arrive, le verrou est levé : un échec ici ne doit pas faire
  // échouer toutes les suites suivantes.
  after(async () => {
    await definirModePrive(false);
    await definirPlafondIa(5);
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

    it("ne lit plus ni les plans ni son abonnement", async () => {
      const { data: plans } = await membre.client.from("plans").select("code");
      assert.equal(plans.length, 0);

      const { data: abonnements } = await membre.client
        .from("studio_subscriptions")
        .select("studio_id");
      assert.equal(abonnements.length, 0);
    });

    it("ne demande ni n'accepte de devis, et ne lit plus ni devis ni barème", async () => {
      // Les fonctions de devis s'exécutent hors RLS : elles vérifient le
      // mode privé elles-mêmes.
      const { error: demande } = await membre.client.rpc("creer_devis", {
        p_project_id: projetDuMembre.id,
        p_action: "logline",
        p_params: {},
      });
      assert.ok(demande, "la demande de devis doit être refusée");

      const { error: acceptation } = await membre.client.rpc("accepter_devis", {
        p_quote_id: devisDuMembre,
        p_idempotency_key: "pendant-le-verrou",
      });
      assert.ok(acceptation, "l'acceptation doit être refusée");

      const { data: devis } = await membre.client.from("quotes").select("id");
      assert.equal(devis.length, 0);

      const { data: bareme } = await membre.client.from("text_unit_rate_versions").select("id");
      assert.equal(bareme.length, 0);
    });

    it("ne lit ni n'annule ses tâches", async () => {
      const { data: taches } = await membre.client.from("jobs").select("id");
      assert.equal(taches.length, 0);

      const { data: essais } = await membre.client.from("job_attempts").select("id");
      assert.equal(essais.length, 0);

      const { error } = await membre.client.rpc("annuler_travail", { p_job_id: tacheDuMembre });
      assert.ok(error, "l'annulation doit être refusée");
    });

    it("ne lit, n'applique ni n'écarte ses propositions", async () => {
      const { data } = await membre.client.from("ai_suggestions").select("id");
      assert.equal(data.length, 0);

      // Ces fonctions s'exécutent hors RLS : elles vérifient le mode privé
      // elles-mêmes.
      const { error: application } = await membre.client.rpc("accepter_proposition", {
        p_suggestion_id: propositionDuMembre,
      });
      assert.ok(application, "l'application doit être refusée");

      const { error: ecart } = await membre.client.rpc("ecarter_proposition", {
        p_suggestion_id: propositionDuMembre,
      });
      assert.ok(ecart, "l'écart doit être refusé");

      const { data: restee } = await administrateur.client
        .from("ai_suggestions")
        .select("state")
        .eq("id", propositionDuMembre)
        .single();
      assert.equal(restee.state, "proposed");
    });

    it("ne lit plus ses exports, ni n'en retrouve un", async () => {
      const { data } = await membre.client.from("project_exports").select("id");
      assert.equal(data.length, 0);

      const { data: retrouve } = await membre.client.rpc("export_disponible", {
        p_project_id: projetDuMembre.id,
        p_params: { sections: ["synthese"] },
      });
      assert.equal(retrouve, null);

      // Le fichier, lui, est toujours là : l'administration le lit.
      const { data: garde } = await administrateur.client
        .from("project_exports")
        .select("id")
        .eq("id", exportDuMembre);
      assert.equal(garde.length, 1);
    });

    it("ne lit ni ne configure les intégrations IA", async () => {
      const { data } = await membre.client.from("ai_provider_keys").select("provider");
      assert.equal(data.length, 0);

      // Ces fonctions s'exécutent hors RLS : elles vérifient le rôle
      // elles-mêmes.
      const { error } = await membre.client.rpc("definir_cle_fournisseur", {
        p_provider: "anthropic",
        p_cle: "sk-ant-factice-mode-prive-aaaaaaaa",
      });
      assert.ok(error, "l'enregistrement doit être refusé");

      const { error: lecture } = await membre.client.rpc("cle_fournisseur", {
        p_provider: "anthropic",
      });
      assert.ok(lecture, "la lecture de la clé doit être refusée");
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

    it("ne lit plus les pondérations du score, ni les faits de son propre projet", async () => {
      const { data: ponderations } = await membre.client
        .from("readiness_weight_versions")
        .select("version_number");
      assert.equal(ponderations.length, 0);

      // La fonction s'exécute sous la RLS de l'appelant : le projet lui est
      // devenu invisible, elle ne rend donc rien.
      const { data: faits, error } = await membre.client.rpc("faits_maturite", {
        p_project_id: projetDuMembre.id,
      });
      assert.ifError(error);
      assert.equal(faits, null);

      // La lecture groupée des listes suit le même verrou.
      const { data: enLot, error: erreurEnLot } = await membre.client.rpc(
        "faits_maturite_projets",
        { p_project_ids: [projetDuMembre.id] },
      );
      assert.ifError(erreurEnLot);
      assert.deepEqual(enLot, []);
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

    it("demande et accepte un devis", async () => {
      const { data: devis, error } = await administrateur.client.rpc("creer_devis", {
        p_project_id: projetAdmin.id,
        p_action: "logline",
        p_params: {},
      });
      assert.equal(error, null, error?.message);

      const { error: acceptation } = await administrateur.client.rpc("accepter_devis", {
        p_quote_id: devis[0].quote_id,
        p_idempotency_key: "admin-pendant-le-verrou",
      });
      assert.equal(acceptation, null, acceptation?.message);
    });

    it("configure et retire une intégration IA", async () => {
      const { error } = await administrateur.client.rpc("definir_cle_fournisseur", {
        p_provider: "anthropic",
        p_cle: "sk-ant-factice-mode-prive-bbbbbbbb",
      });
      assert.equal(error, null, error?.message);

      const { data } = await administrateur.client.from("ai_provider_keys").select("provider");
      assert.deepEqual(data, [{ provider: "anthropic" }]);

      const { error: retrait } = await administrateur.client.rpc("retirer_cle_fournisseur", {
        p_provider: "anthropic",
      });
      assert.equal(retrait, null, retrait?.message);
    });

    it("écarte la proposition d'un membre", async () => {
      const { data, error } = await administrateur.client.rpc("ecarter_proposition", {
        p_suggestion_id: propositionDuMembre,
      });
      assert.equal(error, null, error?.message);
      assert.equal(data.state, "dismissed");
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
