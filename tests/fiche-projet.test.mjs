/**
 * Fiche du projet et personnages (lot R1), éprouvés par l'API avec de vrais
 * comptes : porteur, éditeur, lecteur, compte étranger, administrateur et
 * visiteur.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const FICHE = "genre, countries, languages, duration_minutes, theme, stakes, audience";

describe("Fiche du projet", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;

  before(async () => {
    porteur = await creerCompte("fiche-porteur");
    editeur = await creerCompte("fiche-editeur");
    lecteur = await creerCompte("fiche-lecteur");
    etranger = await creerCompte("fiche-etranger");
    administrateur = await creerCompte("fiche-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Eaux de Kribi");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
  });

  const lireFiche = (compte) =>
    compte.client.from("projects").select(FICHE).eq("id", projet.id).maybeSingle();

  it("le porteur et l'éditeur complètent la fiche", async () => {
    const { error } = await porteur.client
      .from("projects")
      .update({
        genre: "drame",
        countries: ["CM", "SN"],
        languages: "Français, ewondo",
        duration_minutes: 95,
        theme: "La mer nourricière",
      })
      .eq("id", projet.id);
    assert.equal(error, null, error?.message);

    const { error: ajout } = await editeur.client
      .from("projects")
      .update({ stakes: "Garder la plage.\nGarder la famille.", audience: "Tout public" })
      .eq("id", projet.id);
    assert.equal(ajout, null, ajout?.message);

    const { data } = await lireFiche(lecteur);
    assert.deepEqual(data, {
      genre: "drame",
      countries: ["CM", "SN"],
      languages: "Français, ewondo",
      duration_minutes: 95,
      theme: "La mer nourricière",
      stakes: "Garder la plage.\nGarder la famille.",
      audience: "Tout public",
    });
  });

  it("ni le lecteur, ni un étranger, ni un administrateur ne réécrivent la fiche", async () => {
    for (const compte of [lecteur, etranger, administrateur]) {
      const { data } = await compte.client
        .from("projects")
        .update({ theme: "RÉÉCRIT" })
        .eq("id", projet.id)
        .select("id");
      assert.deepEqual(data ?? [], []);
    }
    assert.equal((await lireFiche(porteur)).data.theme, "La mer nourricière");
  });

  it("un étranger et un visiteur ne lisent pas la fiche", async () => {
    assert.equal((await lireFiche(etranger)).data, null);
    const { data } = await clientAnonyme().from("projects").select(FICHE).eq("id", projet.id);
    assert.deepEqual(data ?? [], []);
  });

  it("la base refuse une fiche mal formée", async () => {
    for (const [champs, code] of [
      [{ genre: "western" }, "23514"],
      [{ countries: ["cm"] }, "23514"],
      [{ duration_minutes: 0 }, "23514"],
      [{ theme: "La\nmer" }, "23514"],
    ]) {
      const { error } = await porteur.client.from("projects").update(champs).eq("id", projet.id);
      assert.equal(error?.code, code, JSON.stringify(champs));
    }
  });

  describe("Personnages", () => {
    let personnage;

    const ajouter = (compte, champs) =>
      compte.client
        .from("project_characters")
        .insert({ project_id: projet.id, ...champs })
        .select("id, name, role, created_by")
        .single();

    it("le porteur et l'éditeur ajoutent des personnages", async () => {
      const { data, error } = await ajouter(porteur, { name: "Ɛyɔ", role: "principal" });
      assert.equal(error, null, error?.message);
      assert.deepEqual([data.name, data.role, data.created_by], ["Ɛyɔ", "principal", porteur.id]);
      personnage = data.id;

      const { error: refus } = await ajouter(editeur, { name: "Le pêcheur" });
      assert.equal(refus, null, refus?.message);
    });

    it("ni le lecteur ni un étranger n'en ajoutent", async () => {
      for (const compte of [lecteur, etranger]) {
        const { error } = await ajouter(compte, { name: "Intrus" });
        assert.equal(error?.code, "42501");
      }
    });

    it("l'équipe les lit ; un étranger et un visiteur, non", async () => {
      const noms = async (client) =>
        (await client.from("project_characters").select("name").eq("project_id", projet.id)).data ??
        [];
      assert.equal((await noms(lecteur.client)).length, 2);
      assert.deepEqual(await noms(etranger.client), []);
      assert.deepEqual(await noms(clientAnonyme()), []);
    });

    it("un lecteur ne les modifie ni ne les supprime", async () => {
      const { data: modifie } = await lecteur.client
        .from("project_characters")
        .update({ name: "Renommé" })
        .eq("id", personnage)
        .select("id");
      assert.deepEqual(modifie ?? [], []);

      const { data: supprime } = await lecteur.client
        .from("project_characters")
        .delete()
        .eq("id", personnage)
        .select("id");
      assert.deepEqual(supprime ?? [], []);
    });

    it("un personnage ne change ni de projet ni d'auteur", async () => {
      const autre = await creerProjet(porteur, "Un autre projet");
      for (const champs of [{ project_id: autre.id }, { created_by: editeur.id }]) {
        const { error } = await porteur.client
          .from("project_characters")
          .update(champs)
          .eq("id", personnage);
        assert.equal(error?.code, "42501", JSON.stringify(champs));
      }
    });

    it("un administrateur en ajoute, et le journal le retient", async () => {
      const { error } = await ajouter(administrateur, { name: "Ajouté par l'administration" });
      assert.equal(error, null, error?.message);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("action, details")
        .eq("project_id", projet.id)
        .eq("details->>table", "project_characters");
      assert.deepEqual(
        journal.map((entree) => [entree.action, entree.details.operation]),
        [["intervention_contenu", "insert"]],
      );
    });

    it("la base refuse un personnage mal formé", async () => {
      for (const champs of [
        { name: "  " },
        { name: "Awa", role: "figurant" },
        { name: "Awa", description: "d".repeat(2001) },
      ]) {
        const { error } = await ajouter(porteur, champs);
        assert.equal(error?.code, "23514", JSON.stringify(champs).slice(0, 60));
      }
    });
  });
});
