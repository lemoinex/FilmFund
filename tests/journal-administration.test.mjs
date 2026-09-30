/**
 * Journal des actions d'administration.
 *
 * Chaque action sensible doit laisser une trace, et une seule ; le travail
 * ordinaire d'un porteur ou d'un membre n'en laisse aucune. Le journal ne se
 * lit que par les administrateurs et ne se réécrit par personne, rôle de
 * service compris.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientAnonyme,
  clientDeService,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

/** Entrées du journal, lues avec les droits de l'administrateur. */
async function entrees(administrateur, filtre) {
  let requete = administrateur.client.from("admin_audit_log").select("*").order("id");
  for (const [colonne, valeur] of Object.entries(filtre)) {
    requete = valeur === null ? requete.is(colonne, null) : requete.eq(colonne, valeur);
  }
  const { data, error } = await requete;
  assert.equal(error, null, error?.message);
  return data;
}

async function definirModePrive(actif) {
  const { error } = await clientDeService()
    .from("app_settings")
    .update({ private_admin_only: actif })
    .eq("id", true);
  assert.equal(error, null, error?.message);
}

describe("Journal d'administration", () => {
  let administrateur;
  let porteur;
  let cible;

  before(async () => {
    administrateur = await creerCompte("journal-admin", "Administratrice");
    porteur = await creerCompte("journal-porteur", "Porteur");
    cible = await creerCompte("journal-cible", "Cible");
    await promouvoirAdministrateur(administrateur.id);
  });

  after(async () => {
    await definirModePrive(false);
  });

  describe("Rôles et profils", () => {
    it("journalise la promotion faite en SQL direct, sans auteur", async () => {
      const journal = await entrees(administrateur, {
        action: "changement_role",
        "details->>compte": administrateur.id,
      });

      assert.equal(journal.length, 1);
      assert.equal(journal[0].actor_id, null);
      assert.equal(journal[0].details.ancien_role, "member");
      assert.equal(journal[0].details.nouveau_role, "admin");
    });

    it("journalise un changement de rôle fait par un administrateur, avec son auteur", async () => {
      for (const role of ["admin", "member"]) {
        const { error } = await administrateur.client.rpc("definir_role", {
          email_cible: cible.email,
          nouveau_role: role,
        });
        assert.equal(error, null, error?.message);
      }

      const journal = await entrees(administrateur, {
        action: "changement_role",
        "details->>compte": cible.id,
      });

      assert.deepEqual(
        journal.map((entree) => [entree.actor_id, entree.details.nouveau_role]),
        [
          [administrateur.id, "admin"],
          [administrateur.id, "member"],
        ],
      );
    });

    it("journalise la modification du profil d'autrui, sans recopier la valeur", async () => {
      const { data, error } = await administrateur.client
        .from("profiles")
        .update({ display_name: "Nom corrigé par l'administration" })
        .eq("id", cible.id)
        .select("id");
      assert.equal(error, null, error?.message);
      assert.equal(data.length, 1);

      const journal = await entrees(administrateur, {
        action: "modification_profil",
        "details->>compte": cible.id,
      });

      assert.equal(journal.length, 1);
      assert.equal(journal[0].actor_id, administrateur.id);
      assert.deepEqual(journal[0].details.champs, ["display_name"]);
      assert.ok(!JSON.stringify(journal[0]).includes("corrigé"));
    });

    it("ne journalise pas un compte qui modifie son propre profil", async () => {
      const { error } = await porteur.client
        .from("profiles")
        .update({ display_name: "Porteur renommé" })
        .eq("id", porteur.id);
      assert.equal(error, null, error?.message);

      const journal = await entrees(administrateur, { "details->>compte": porteur.id });
      assert.equal(journal.length, 0);
    });
  });

  describe("Mode privé", () => {
    it("journalise chaque bascule, sans auteur quand elle vient du SQL direct", async () => {
      const { data: avant } = await administrateur.client
        .from("admin_audit_log")
        .select("id")
        .order("id", { ascending: false })
        .limit(1);
      const dernier = avant[0]?.id ?? 0;

      await definirModePrive(true);
      await definirModePrive(true);
      await definirModePrive(false);

      const { data: journal, error } = await administrateur.client
        .from("admin_audit_log")
        .select("*")
        .eq("action", "mode_prive")
        .gt("id", dernier)
        .order("id");
      assert.equal(error, null, error?.message);

      // La mise à jour sans changement ne compte pas : deux bascules, pas trois.
      assert.deepEqual(
        journal.map((entree) => [entree.actor_id, entree.details.actif]),
        [
          [null, true],
          [null, false],
        ],
      );
    });
  });

  describe("Suppression de projets", () => {
    it("journalise une seule fois la suppression du projet d'autrui par un administrateur", async () => {
      const projet = await creerProjet(porteur, "Projet supprimé par l'administration");

      // Du contenu, pour vérifier que la cascade ne multiplie pas les entrées.
      const budget = await porteur.client
        .from("project_budgets")
        .insert({ project_id: projet.id, currency: "XOF" });
      assert.equal(budget.error, null, budget.error?.message);

      const ajouts = await Promise.all([
        porteur.client.from("budget_lines").insert({
          project_id: projet.id,
          category: "materiel",
          label: "Location caméra",
          quantity: 1,
          unit_cost: 85000,
        }),
        porteur.client
          .from("project_milestones")
          .insert({ project_id: projet.id, title: "Repérages" }),
        porteur.client
          .from("project_documents")
          .insert({ project_id: projet.id, type: "traitement", title: "Traitement" }),
      ]);
      for (const { error } of ajouts) {
        assert.equal(error, null, error?.message);
      }
      await faireEntrer(porteur, projet.id, cible, "viewer");

      const { data, error } = await administrateur.client
        .from("projects")
        .delete()
        .eq("id", projet.id)
        .select("id");
      assert.equal(error, null, error?.message);
      assert.equal(data.length, 1);

      const journal = await entrees(administrateur, { project_id: projet.id });

      assert.equal(journal.length, 1);
      assert.equal(journal[0].action, "suppression_projet");
      assert.equal(journal[0].actor_id, administrateur.id);
      assert.equal(journal[0].details.porteur, porteur.id);
    });

    it("ne journalise pas un porteur qui supprime son propre projet", async () => {
      const projet = await creerProjet(porteur, "Projet retiré par son porteur");
      await porteur.client.from("projects").delete().eq("id", projet.id);

      assert.equal((await entrees(administrateur, { project_id: projet.id })).length, 0);
    });

    it("ne journalise pas un administrateur dans son propre projet", async () => {
      const projet = await creerProjet(administrateur, "Projet de l'administratrice");
      await administrateur.client
        .from("project_milestones")
        .insert({ project_id: projet.id, title: "Écriture" });
      await administrateur.client.from("projects").delete().eq("id", projet.id);

      assert.equal((await entrees(administrateur, { project_id: projet.id })).length, 0);
    });

    it("ne journalise pas un administrateur invité qui rejoint puis travaille dans un projet", async () => {
      const projet = await creerProjet(porteur, "Projet où l'administratrice est invitée");
      await faireEntrer(porteur, projet.id, administrateur, "editor");

      const { error } = await administrateur.client
        .from("project_milestones")
        .insert({ project_id: projet.id, title: "Tournage" });
      assert.equal(error, null, error?.message);

      assert.equal((await entrees(administrateur, { project_id: projet.id })).length, 0);
    });
  });

  describe("Interventions dans le contenu", () => {
    it("journalise un administrateur hors équipe qui modifie le planning, sans le contenu", async () => {
      const projet = await creerProjet(porteur, "Projet où l'administration intervient");
      const { data: etape, error } = await porteur.client
        .from("project_milestones")
        .insert({ project_id: projet.id, title: "Montage" })
        .select("id")
        .single();
      assert.equal(error, null, error?.message);

      const { data } = await administrateur.client
        .from("project_milestones")
        .update({ title: "Montage image confidentiel" })
        .eq("id", etape.id)
        .select("id");
      assert.equal(data.length, 1, "peut_editer_contenu() ouvre le planning aux administrateurs");

      const journal = await entrees(administrateur, { project_id: projet.id });

      assert.equal(journal.length, 1);
      assert.equal(journal[0].action, "intervention_contenu");
      assert.equal(journal[0].actor_id, administrateur.id);
      assert.deepEqual(journal[0].details, {
        table: "project_milestones",
        operation: "update",
        ligne: etape.id,
      });
      assert.ok(!JSON.stringify(journal[0]).includes("confidentiel"));
    });

    it("ne journalise pas le porteur ni un membre de l'équipe", async () => {
      const projet = await creerProjet(porteur, "Projet sans intervention");
      await faireEntrer(porteur, projet.id, cible, "editor");

      for (const compte of [porteur, cible]) {
        const { error } = await compte.client
          .from("project_milestones")
          .insert({ project_id: projet.id, title: "Étape d'équipe" });
        assert.equal(error, null, error?.message);
      }

      assert.equal((await entrees(administrateur, { project_id: projet.id })).length, 0);
    });
  });

  describe("Protection du journal", () => {
    it("réserve la lecture aux administrateurs", async () => {
      const { data: duPorteur } = await porteur.client.from("admin_audit_log").select("id");
      assert.deepEqual(duPorteur ?? [], []);

      const { data: anonyme } = await clientAnonyme().from("admin_audit_log").select("id");
      assert.deepEqual(anonyme ?? [], []);
    });

    it("refuse à un administrateur d'écrire, réécrire ou effacer une entrée", async () => {
      const [entree] = await entrees(administrateur, {
        action: "changement_role",
        "details->>compte": administrateur.id,
      });

      const ajout = await administrateur.client
        .from("admin_audit_log")
        .insert({ action: "mode_prive", details: {} });
      assert.ok(ajout.error, "l'ajout direct doit être refusé");

      const appel = await administrateur.client.rpc("journaliser", {
        p_action: "mode_prive",
        p_project_id: null,
        p_details: {},
      });
      assert.ok(appel.error, "la fonction d'écriture ne doit pas être exécutable");

      await administrateur.client
        .from("admin_audit_log")
        .update({ details: { falsifie: true } })
        .eq("id", entree.id);
      await administrateur.client.from("admin_audit_log").delete().eq("id", entree.id);

      const [apres] = await entrees(administrateur, { id: entree.id });
      assert.deepEqual(apres, entree);
    });

    it("refuse la réécriture et l'effacement même au rôle de service", async () => {
      const [entree] = await entrees(administrateur, {
        action: "changement_role",
        "details->>compte": administrateur.id,
      });
      const service = clientDeService();

      const modification = await service
        .from("admin_audit_log")
        .update({ details: { falsifie: true } })
        .eq("id", entree.id);
      assert.ok(modification.error, "la modification doit être refusée");

      const suppression = await service.from("admin_audit_log").delete().eq("id", entree.id);
      assert.ok(suppression.error, "la suppression doit être refusée");

      const [apres] = await entrees(administrateur, { id: entree.id });
      assert.deepEqual(apres, entree);
    });
  });
});
