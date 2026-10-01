/**
 * Catalogue public, lu en visiteur anonyme par l'API réelle.
 *
 * La vitrine affiche la dernière version publiée de chaque plan : elle doit
 * pouvoir la lire sans session, et rien d'autre — ni l'auteur d'une version,
 * ni les abonnements des studios, ni aucune écriture.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { lireOffre } from "../src/lib/offre.ts";
import { clientAnonyme, PUBLISHABLE_KEY, URL } from "./helpers.mjs";

describe("Catalogue public", () => {
  it("la vitrine lit l'offre sans session : trois plans, chacun à sa dernière version", async () => {
    const offre = await lireOffre(URL, PUBLISHABLE_KEY);
    assert.ok(offre, "l'offre doit être lisible");
    assert.deepEqual(
      offre.map((carte) => carte.code),
      ["gratuit", "pro", "studio"],
    );

    const { data: versions } = await clientAnonyme()
      .from("plan_versions")
      .select("plan_code, version_number");
    for (const carte of offre) {
      const derniere = Math.max(
        ...versions.filter((v) => v.plan_code === carte.code).map((v) => v.version_number),
      );
      assert.equal(carte.version.version_number, derniere, `plan ${carte.code}`);
    }
  });

  it("un visiteur ne lit ni l'auteur d'une version ni les abonnements", async () => {
    const visiteur = clientAnonyme();

    const { error: auteur } = await visiteur.from("plan_versions").select("published_by");
    assert.ok(auteur, "l'auteur d'une version doit rester fermé");

    const { error: abonnements } = await visiteur.from("studio_subscriptions").select("plan_code");
    assert.ok(abonnements, "les abonnements doivent rester fermés");
  });

  it("un visiteur ne publie ni ne modifie rien", async () => {
    const visiteur = clientAnonyme();

    // Valeurs et nom en vigueur : si une régression laissait passer ces
    // écritures, le catalogue de la base de test n'en serait pas faussé.
    const { data: courante } = await visiteur
      .from("plan_versions")
      .select(
        "max_projects, max_members, storage_mb, text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month",
      )
      .eq("plan_code", "gratuit")
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    const { error: publication } = await visiteur
      .from("plan_versions")
      .insert({ plan_code: "gratuit", ...courante });
    assert.ok(publication, "la publication doit être refusée");

    const { error: renommage } = await visiteur
      .from("plans")
      .update({ name: "Gratuit" })
      .eq("code", "gratuit");
    assert.ok(renommage, "le renommage doit être refusé");
  });

  it("sans adresse ni clé, la lecture renvoie null au lieu d'échouer", async () => {
    assert.equal(await lireOffre(undefined, undefined), null);
  });
});
