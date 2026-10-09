/**
 * Le scénario d'un épisode (lot SE3a), éprouvé par l'API avec de vrais
 * comptes : porteur, éditeur, lecteur, compte étranger — porteur d'une série
 * dans son propre studio —, administrateur et visiteur.
 *
 * Les séries, les épisodes et les scénarios d'ici sont FICTIFS. Aucun appel à
 * un fournisseur.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  executerSqlLocal as sql,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

describe("Le scénario d'un épisode", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let serie;
  let serieEtrangere;
  const episodes = {};
  let episodeEtranger;
  let scenarioPilote;
  let scenarioGeneral;

  async function creerSerie(compte, titre) {
    const projet = await creerProjet(compte, titre);
    const { error } = await compte.client
      .from("projects")
      .update({ format: "serie" })
      .eq("id", projet.id);
    assert.equal(error, null, error?.message);
    return projet;
  }

  async function ajouterEpisode(compte, projet, number, title) {
    const { data, error } = await compte.client
      .from("project_episodes")
      .insert({ project_id: projet.id, number, title })
      .select("id")
      .single();
    assert.equal(error, null, error?.message);
    return data.id;
  }

  const creer = (compte, champs, projet = serie) =>
    compte.client
      .from("project_documents")
      .insert({ project_id: projet.id, type: "scenario", title: "Scénario", ...champs })
      .select("id, type, title, episode_id, created_by")
      .single();

  const rattacher = (compte, documentId, episodeId) =>
    compte.client
      .from("project_documents")
      .update({ episode_id: episodeId })
      .eq("id", documentId)
      .select("id, episode_id");

  const lien = async (client, documentId) =>
    (await client.from("project_documents").select("episode_id").eq("id", documentId).maybeSingle())
      .data?.episode_id;

  const versions = async (documentId) =>
    (
      await porteur.client
        .from("project_document_versions")
        .select("version_number")
        .eq("document_id", documentId)
    ).data?.length;

  before(async () => {
    porteur = await creerCompte("scenarios-porteur");
    editeur = await creerCompte("scenarios-editeur");
    lecteur = await creerCompte("scenarios-lecteur");
    etranger = await creerCompte("scenarios-etranger");
    administrateur = await creerCompte("scenarios-admin");
    await promouvoirAdministrateur(administrateur.id);

    serie = await creerSerie(porteur, "Les Marées de Kribi");
    // Un second studio, avec sa propre série : rien ne passe de l'un à l'autre.
    serieEtrangere = await creerSerie(etranger, "Une autre série");
    await faireEntrer(porteur, serie.id, editeur, "editor");
    await faireEntrer(porteur, serie.id, lecteur, "viewer");

    for (const [numero, titre] of [
      [1, "La première marée"],
      [2, "Le filet"],
      [3, "La dette"],
    ]) {
      episodes[numero] = await ajouterEpisode(porteur, serie, numero, titre);
    }
    episodeEtranger = await ajouterEpisode(etranger, serieEtrangere, 1, "Ailleurs");
  });

  after(async () => {
    await sql("update public.app_settings set private_admin_only = false where id;");
  });

  it("le porteur crée le scénario d'un épisode ; un scénario sans épisode reste possible", async () => {
    const { data, error } = await creer(porteur, {
      title: "Scénario — épisode 1",
      episode_id: episodes[1],
      created_by: porteur.id,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(
      [data.type, data.episode_id, data.created_by],
      ["scenario", episodes[1], porteur.id],
    );
    scenarioPilote = data.id;

    const { data: general, error: refus } = await creer(editeur, { title: "Scénario général" });
    assert.equal(refus, null, refus?.message);
    assert.equal(general.episode_id, null);
    scenarioGeneral = general.id;
  });

  it("un épisode n'a pas deux scénarios, à la création comme au rattachement", async () => {
    const { error } = await creer(porteur, { title: "Second", episode_id: episodes[1] });
    assert.equal(error?.code, "23505");

    const { error: refus } = await rattacher(porteur, scenarioGeneral, episodes[1]);
    assert.equal(refus?.code, "23505");
    assert.equal(await lien(porteur.client, scenarioGeneral), null);
  });

  it("seul un scénario se rattache : un autre type est refusé, et un scénario rattaché garde son type", async () => {
    const { error } = await creer(porteur, {
      type: "note_intention",
      title: "Note d'intention",
      episode_id: episodes[2],
    });
    assert.equal(error?.code, "23514");

    const { error: changement } = await porteur.client
      .from("project_documents")
      .update({ type: "traitement" })
      .eq("id", scenarioPilote);
    assert.equal(changement?.code, "23514");

    // Détaché, un scénario change de type comme tout document.
    const { data: libre } = await creer(porteur, { title: "Scénario libre" });
    const { error: permis } = await porteur.client
      .from("project_documents")
      .update({ type: "traitement" })
      .eq("id", libre.id);
    assert.equal(permis, null, permis?.message);
  });

  it("l'épisode est celui du même projet : celui d'un autre studio est refusé", async () => {
    const { error } = await creer(porteur, { title: "Chez un autre", episode_id: episodeEtranger });
    assert.equal(error?.code, "SE003");

    const { error: refus } = await rattacher(porteur, scenarioGeneral, episodeEtranger);
    assert.equal(refus?.code, "SE003");

    // Et l'étranger ne rattache pas son scénario à un épisode de la série.
    const { data: sien } = await creer(etranger, { title: "Le sien" }, serieEtrangere);
    const { error: intrusion } = await rattacher(etranger, sien.id, episodes[2]);
    assert.equal(intrusion?.code, "SE003");
    assert.equal(await lien(etranger.client, sien.id), null);
  });

  it("l'éditeur rattache, déplace et détache un scénario, sans créer de version", async () => {
    // Un premier texte : la version contre laquelle le rattachement se mesure.
    const { error: texte } = await porteur.client
      .from("project_documents")
      .update({ content: "INT. BERGE — JOUR" })
      .eq("id", scenarioGeneral);
    assert.equal(texte, null, texte?.message);
    const avant = await versions(scenarioGeneral);
    assert.equal(avant, 1);

    const { data: rattache, error } = await rattacher(editeur, scenarioGeneral, episodes[2]);
    assert.equal(error, null, error?.message);
    assert.deepEqual(rattache, [{ id: scenarioGeneral, episode_id: episodes[2] }]);

    const { error: deplace } = await rattacher(editeur, scenarioGeneral, episodes[3]);
    assert.equal(deplace, null, deplace?.message);
    assert.equal(await lien(porteur.client, scenarioGeneral), episodes[3]);

    const { error: detache } = await rattacher(editeur, scenarioGeneral, null);
    assert.equal(detache, null, detache?.message);
    assert.equal(await lien(porteur.client, scenarioGeneral), null);

    // Ni le texte ni son historique n'ont bougé.
    assert.equal(await versions(scenarioGeneral), avant);
    const { data: document } = await porteur.client
      .from("project_documents")
      .select("content, title")
      .eq("id", scenarioGeneral)
      .single();
    assert.deepEqual(document, { content: "INT. BERGE — JOUR", title: "Scénario général" });
  });

  it("ni le lecteur, ni un étranger, ni un visiteur ne rattachent ni ne créent", async () => {
    for (const compte of [lecteur, etranger]) {
      const { data } = await rattacher(compte, scenarioGeneral, episodes[2]);
      assert.deepEqual(data ?? [], []);
      const { error } = await creer(compte, { title: "Intrus", episode_id: episodes[2] });
      assert.ok(error, "la création doit être refusée");
    }
    const { error } = await clientAnonyme()
      .from("project_documents")
      .update({ episode_id: episodes[2] })
      .eq("id", scenarioGeneral);
    assert.ok(error, "un visiteur n'a aucun droit sur la table");
    assert.equal(await lien(porteur.client, scenarioGeneral), null);
  });

  it("l'équipe lit le rattachement ; un étranger et un visiteur, non", async () => {
    assert.equal(await lien(lecteur.client, scenarioPilote), episodes[1]);
    assert.equal(await lien(editeur.client, scenarioPilote), episodes[1]);
    assert.equal(await lien(etranger.client, scenarioPilote), undefined);
    assert.equal(await lien(clientAnonyme(), scenarioPilote), undefined);
  });

  it("un document ne change toujours ni de projet ni d'auteur", async () => {
    for (const champs of [{ project_id: serieEtrangere.id }, { created_by: editeur.id }]) {
      const { error } = await porteur.client
        .from("project_documents")
        .update(champs)
        .eq("id", scenarioPilote);
      assert.equal(error?.code, "42501", JSON.stringify(champs));
    }
  });

  it("un administrateur rattache hors de ses projets, et le journal le retient", async () => {
    const { data, error } = await rattacher(administrateur, scenarioGeneral, episodes[2]);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", serie.id)
      .eq("details->>table", "project_documents");
    assert.ok(
      journal.some(
        (entree) =>
          entree.action === "intervention_contenu" && entree.details.operation === "update",
      ),
      "la modification du document par l'administrateur doit être journalisée",
    );
  });

  it("retirer un épisode garde son scénario, détaché, avec son texte", async () => {
    const { error } = await porteur.client.from("project_episodes").delete().eq("id", episodes[2]);
    assert.equal(error, null, error?.message);

    const { data } = await porteur.client
      .from("project_documents")
      .select("title, content, episode_id")
      .eq("id", scenarioGeneral)
      .single();
    assert.deepEqual(data, {
      title: "Scénario général",
      content: "INT. BERGE — JOUR",
      episode_id: null,
    });
    // Aucune version de plus : rien n'a été écrit dans le texte.
    assert.equal(await versions(scenarioGeneral), 1);
  });

  it("supprimer un scénario ne touche pas à son épisode", async () => {
    const { error } = await porteur.client
      .from("project_documents")
      .delete()
      .eq("id", scenarioPilote);
    assert.equal(error, null, error?.message);

    const { data } = await porteur.client
      .from("project_episodes")
      .select("number, title")
      .eq("id", episodes[1])
      .single();
    assert.deepEqual(data, { number: 1, title: "La première marée" });

    // L'épisode peut recevoir un nouveau scénario.
    const { error: nouveau } = await creer(porteur, {
      title: "Scénario — épisode 1",
      episode_id: episodes[1],
    });
    assert.equal(nouveau, null, nouveau?.message);
  });

  it("une adhésion révoquée ne rattache plus", async () => {
    const { error } = await porteur.client
      .from("project_members")
      .delete()
      .eq("project_id", serie.id)
      .eq("user_id", editeur.id);
    assert.equal(error, null, error?.message);

    const { data } = await rattacher(editeur, scenarioGeneral, episodes[3]);
    assert.deepEqual(data ?? [], []);
    assert.equal(await lien(porteur.client, scenarioGeneral), null);
  });

  it("en mode privé, l'équipe ne rattache plus ; l'administration, toujours", async () => {
    try {
      const actif = await sql("update public.app_settings set private_admin_only = true where id;");
      assert.equal(actif.code, 0, actif.erreurs);
      const { data } = await rattacher(porteur, scenarioGeneral, episodes[3]);
      assert.deepEqual(data ?? [], []);

      const { data: parAdmin, error } = await rattacher(
        administrateur,
        scenarioGeneral,
        episodes[3],
      );
      assert.equal(error, null, error?.message);
      assert.equal(parAdmin.length, 1);
    } finally {
      const inactif = await sql(
        "update public.app_settings set private_admin_only = false where id;",
      );
      assert.equal(inactif.code, 0, inactif.erreurs);
    }
    assert.equal(await lien(porteur.client, scenarioGeneral), episodes[3]);
  });
});
