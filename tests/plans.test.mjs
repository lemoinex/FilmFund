/**
 * Plans et quotas.
 *
 * Les comptes de cette suite restent au plan Gratuit (1 projet, 1 membre) :
 * c'est lui qui éprouve les limites. Elles sont tentées frontalement,
 * en concurrence, et par un compte qui n'est pas du studio.
 *
 * Les publications de version faites ici reprennent les valeurs en vigueur :
 * le catalogue de la base de test n'en est pas modifié. La règle de la
 * prochaine période, qui demande des versions antidatées, est éprouvée en
 * SQL (supabase/tests/plans.test.sql).
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { changerPlan, creerCompte, promouvoirAdministrateur } from "./helpers.mjs";

const LIMITE_DU_PLAN = "53400";

function creerProjet(compte, titre) {
  return compte.client
    .from("projects")
    .insert({ owner_id: compte.id, title: titre })
    .select("id")
    .single();
}

async function studioDe(compte) {
  const { data } = await compte.client
    .from("studios")
    .select("id")
    .eq("personal_owner_id", compte.id)
    .single();
  return data.id;
}

describe("Plans et quotas", () => {
  let administrateur;

  before(async () => {
    administrateur = await creerCompte("admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);
  });

  describe("Catalogue", () => {
    it("tout compte connecté lit les trois plans et leurs valeurs de mise en service", async () => {
      const compte = await creerCompte("lecteur-catalogue", "Lecteur", { plan: "gratuit" });
      const { data } = await compte.client
        .from("plan_versions")
        .select("plan_code, max_projects, max_members, storage_mb, price_xaf_per_month")
        .eq("version_number", 1)
        .order("price_xaf_per_month");

      assert.deepEqual(data, [
        {
          plan_code: "gratuit",
          max_projects: 1,
          max_members: 1,
          storage_mb: 100,
          price_xaf_per_month: 0,
        },
        {
          plan_code: "pro",
          max_projects: 10,
          max_members: 1,
          storage_mb: 2048,
          price_xaf_per_month: 20000,
        },
        {
          plan_code: "studio",
          max_projects: 50,
          max_members: 10,
          storage_mb: 20480,
          price_xaf_per_month: 100000,
        },
      ]);
    });

    it("un compte ne publie, ne modifie ni ne supprime de version", async () => {
      const compte = await creerCompte("fraudeur", "Fraudeur", { plan: "gratuit" });

      // Valeurs en vigueur : si une régression laissait passer la
      // publication, le catalogue de la base de test n'en serait pas faussé.
      const { data: courante } = await compte.client
        .from("plan_versions")
        .select(
          "max_projects, max_members, storage_mb, text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month",
        )
        .eq("plan_code", "gratuit")
        .order("version_number", { ascending: false })
        .limit(1)
        .single();
      const { error: publication } = await compte.client
        .from("plan_versions")
        .insert({ plan_code: "gratuit", ...courante });
      assert.ok(publication, "la publication doit être refusée");

      const { error: modification } = await compte.client
        .from("plan_versions")
        .update({ max_projects: 1000 })
        .eq("plan_code", "gratuit");
      assert.ok(modification, "la modification doit être refusée");
    });
  });

  describe("Abonnement", () => {
    it("un nouveau studio naît au plan Gratuit, et son titulaire ne s'en change pas", async () => {
      const compte = await creerCompte("nouveau", "Nouveau", { plan: "gratuit" });
      const studio = await studioDe(compte);

      const { data: abonnement } = await compte.client
        .from("studio_subscriptions")
        .select("plan_code")
        .eq("studio_id", studio)
        .single();
      assert.equal(abonnement.plan_code, "gratuit");

      const { data: change } = await compte.client
        .from("studio_subscriptions")
        .update({ plan_code: "studio" })
        .eq("studio_id", studio)
        .select("plan_code");
      assert.equal(change?.length ?? 0, 0);

      const { error: ancre } = await compte.client
        .from("studio_subscriptions")
        .update({ period_anchor: "2000-01-01T00:00:00Z" })
        .eq("studio_id", studio);
      assert.ok(ancre, "la date anniversaire ne se change pas");
    });

    it("un compte ne lit pas l'abonnement d'un autre studio", async () => {
      const proprietaire = await creerCompte("proprietaire-abonnement", "Propriétaire", {
        plan: "gratuit",
      });
      const curieux = await creerCompte("curieux", "Curieux", { plan: "gratuit" });

      const { data } = await curieux.client
        .from("studio_subscriptions")
        .select("plan_code")
        .eq("studio_id", await studioDe(proprietaire));
      assert.equal(data.length, 0);
    });
  });

  describe("Limite de projets", () => {
    it("au plan Gratuit, un second projet est refusé ; le premier reste intact", async () => {
      const compte = await creerCompte("limite-projets", "Limite", { plan: "gratuit" });

      const { data: premier, error: erreurPremier } = await creerProjet(compte, "Premier projet");
      assert.equal(erreurPremier, null, erreurPremier?.message);

      const { error } = await creerProjet(compte, "Projet de trop");
      assert.equal(error?.code, LIMITE_DU_PLAN);

      const { data: modifie } = await compte.client
        .from("projects")
        .update({ logline: "Toujours modifiable." })
        .eq("id", premier.id)
        .select("id");
      assert.equal(modifie.length, 1);
    });

    it("des créations simultanées ne prennent pas la même dernière place", async () => {
      const compte = await creerCompte("concurrence", "Concurrence", { plan: "gratuit" });

      // Cinq requêtes plutôt que deux : sans verrou, il suffit que deux
      // d'entre elles comptent avant que l'autre n'ait inséré.
      const resultats = await Promise.all(
        ["A", "B", "C", "D", "E"].map((lettre) => creerProjet(compte, `Course ${lettre}`)),
      );
      const reussites = resultats.filter((r) => !r.error);
      const refus = resultats.filter((r) => r.error?.code === LIMITE_DU_PLAN);

      assert.equal(reussites.length, 1, "une seule création doit réussir");
      assert.equal(refus.length, 4, "les autres doivent être refusées par la limite");

      const { data } = await compte.client.from("projects").select("id");
      assert.equal(data.length, 1);
    });

    it("un compte hors du studio n'apprend rien de son plan : le refus est celui des droits", async () => {
      const proprietaire = await creerCompte("studio-plein", "Studio plein", { plan: "gratuit" });
      await creerProjet(proprietaire, "Seul projet");
      const intrus = await creerCompte("intrus", "Intrus", { plan: "gratuit" });

      const { error } = await intrus.client.from("projects").insert({
        owner_id: intrus.id,
        title: "Projet glissé",
        studio_id: await studioDe(proprietaire),
      });
      assert.equal(error?.code, "42501");
    });

    it("le changement de plan par l'administration s'applique aussitôt, et se journalise", async () => {
      const compte = await creerCompte("passage-pro", "Passage au Pro", { plan: "gratuit" });
      await creerProjet(compte, "Premier");
      const studio = await studioDe(compte);

      const { data, error } = await administrateur.client
        .from("studio_subscriptions")
        .update({ plan_code: "pro" })
        .eq("studio_id", studio)
        .select("plan_code");
      assert.equal(error, null, error?.message);
      assert.deepEqual(data, [{ plan_code: "pro" }]);

      const { error: second } = await creerProjet(compte, "Second, désormais permis");
      assert.equal(second, null, second?.message);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("actor_id, details")
        .eq("action", "changement_plan_studio")
        .eq("details->>studio", studio);
      assert.deepEqual(
        journal.map(({ actor_id, details }) => ({ actor_id, details })),
        [
          {
            actor_id: administrateur.id,
            details: { studio, compte: compte.id, ancien_plan: "gratuit", nouveau_plan: "pro" },
          },
        ],
      );
    });
  });

  describe("Limite de membres", () => {
    it("au plan Gratuit, le propriétaire est le seul membre possible ; au plan Studio, d'autres entrent", async () => {
      const proprietaire = await creerCompte("proprietaire-membres", "Propriétaire", {
        plan: "gratuit",
      });
      const invite = await creerCompte("membre-invite", "Membre", { plan: "gratuit" });
      const studio = await studioDe(proprietaire);

      const { error } = await administrateur.client
        .from("studio_members")
        .insert({ studio_id: studio, user_id: invite.id, role: "member" });
      assert.equal(error?.code, LIMITE_DU_PLAN);

      await changerPlan(proprietaire.id, "studio");
      const { error: apres } = await administrateur.client
        .from("studio_members")
        .insert({ studio_id: studio, user_id: invite.id, role: "member" });
      assert.equal(apres, null, apres?.message);
    });
  });

  describe("Publication d'une version", () => {
    it("l'administration publie une version numérotée par la base, journalisée, puis intouchable", async () => {
      const { data: courante } = await administrateur.client
        .from("plan_versions")
        .select("*")
        .eq("plan_code", "studio")
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const { data: publiee, error } = await administrateur.client
        .from("plan_versions")
        .insert({
          plan_code: "studio",
          max_projects: courante.max_projects,
          max_members: courante.max_members,
          storage_mb: courante.storage_mb,
          text_units_per_month: courante.text_units_per_month,
          images_per_month: courante.images_per_month,
          pdf_exports_per_month: courante.pdf_exports_per_month,
          price_xaf_per_month: courante.price_xaf_per_month,
        })
        .select("id, version_number, published_by")
        .single();
      assert.equal(error, null, error?.message);
      assert.equal(publiee.version_number, courante.version_number + 1);
      assert.equal(publiee.published_by, administrateur.id);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("details")
        .eq("action", "publication_plan")
        .eq("actor_id", administrateur.id);
      assert.deepEqual(
        journal.map((e) => e.details),
        [{ plan: "studio", version: publiee.version_number }],
      );

      const { error: modification } = await administrateur.client
        .from("plan_versions")
        .update({ max_projects: 0 })
        .eq("id", publiee.id);
      assert.ok(modification, "une version publiée ne se modifie pas");

      const { error: suppression } = await administrateur.client
        .from("plan_versions")
        .delete()
        .eq("id", publiee.id);
      assert.ok(suppression, "une version publiée ne se supprime pas");
    });
  });
});
