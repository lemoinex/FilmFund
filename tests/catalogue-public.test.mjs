/**
 * Catalogue public, lu en visiteur anonyme par l'API réelle.
 *
 * La vitrine affiche la dernière version publiée de chaque plan et du
 * barème : elle doit pouvoir les lire sans session, et rien d'autre — ni
 * l'auteur d'une version, ni les abonnements des studios, ni aucune écriture.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { lireBareme, lireOffre } from "../src/lib/offre.ts";
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

  it("un visiteur lit le barème, sans son auteur, et n'en publie aucune version", async () => {
    const visiteur = clientAnonyme();

    const { data: bareme, error } = await visiteur
      .from("text_unit_rate_versions")
      .select(
        "version_number, logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note, treatment, bible, screenplay_per_sequence, dialogue_per_scene, published_at",
      )
      .order("version_number");
    assert.ifError(error);
    assert.ok(bareme.length >= 1);
    assert.equal(bareme[0].treatment, 8, "valeur de mise en service");

    const { error: auteur } = await visiteur.from("text_unit_rate_versions").select("published_by");
    assert.ok(auteur, "l'auteur d'une version doit rester fermé");

    // La vitrine présente la dernière version publiée.
    const poids = { ...bareme.at(-1) };
    delete poids.version_number;
    delete poids.published_at;
    assert.deepEqual(await lireBareme(URL, PUBLISHABLE_KEY), poids);

    const { error: publication } = await visiteur.from("text_unit_rate_versions").insert(poids);
    assert.ok(publication, "la publication doit être refusée");
  });

  it("sans adresse ni clé, la lecture renvoie null au lieu d'échouer", async () => {
    assert.equal(await lireOffre(undefined, undefined), null);
    assert.equal(await lireBareme(undefined, undefined), null);
  });
});
