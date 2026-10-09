/**
 * Épisodes d'une série (lot SE1), éprouvés par l'API avec de vrais comptes :
 * porteur, éditeur, lecteur, compte étranger — porteur d'une série dans son
 * propre studio —, administrateur et visiteur.
 *
 * Les séries et les épisodes d'ici sont FICTIFS. Aucun appel à un fournisseur.
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

const COLONNES = "id, number, title, summary, duration_minutes, created_by";

describe("Épisodes d'une série", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let serie;
  let film;
  let serieEtrangere;
  let pilote;

  async function creerSerie(compte, titre, format = "serie") {
    const projet = await creerProjet(compte, titre);
    const { error } = await compte.client.from("projects").update({ format }).eq("id", projet.id);
    assert.equal(error, null, error?.message);
    return projet;
  }

  const ajouter = (compte, champs, projet = serie) =>
    compte.client
      .from("project_episodes")
      .insert({ project_id: projet.id, ...champs })
      .select(COLONNES)
      .single();

  const numeros = async (client, projet = serie) =>
    (
      (
        await client
          .from("project_episodes")
          .select("number")
          .eq("project_id", projet.id)
          .order("number")
      ).data ?? []
    ).map((episode) => episode.number);

  before(async () => {
    porteur = await creerCompte("episodes-porteur");
    editeur = await creerCompte("episodes-editeur");
    lecteur = await creerCompte("episodes-lecteur");
    etranger = await creerCompte("episodes-etranger");
    administrateur = await creerCompte("episodes-admin");
    await promouvoirAdministrateur(administrateur.id);

    serie = await creerSerie(porteur, "Les Marées de Kribi");
    film = await creerProjet(porteur, "Un long métrage");
    // Un second studio, avec sa propre série : rien ne passe de l'un à l'autre.
    serieEtrangere = await creerSerie(etranger, "Une autre série", "web_serie");
    await faireEntrer(porteur, serie.id, editeur, "editor");
    await faireEntrer(porteur, serie.id, lecteur, "viewer");
  });

  after(async () => {
    await sql("update public.app_settings set private_admin_only = false where id;");
  });

  it("le porteur et l'éditeur ajoutent des épisodes ; la base fixe l'auteur", async () => {
    const { data, error } = await ajouter(porteur, {
      number: 1,
      title: "La première marée",
      summary: "Awa revient au village.\nRien n'a changé, sauf elle.",
      duration_minutes: 26,
      created_by: porteur.id,
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(
      [data.number, data.title, data.duration_minutes, data.created_by],
      [1, "La première marée", 26, porteur.id],
    );
    pilote = data.id;

    // Sans auteur fourni, la base pose celui de la session.
    const { data: second, error: refus } = await ajouter(editeur, { number: 2, title: "Le filet" });
    assert.equal(refus, null, refus?.message);
    assert.deepEqual(
      [second.summary, second.duration_minutes, second.created_by],
      ["", null, editeur.id],
    );
  });

  it("ni le lecteur, ni un étranger, ni un visiteur n'en ajoutent", async () => {
    for (const compte of [lecteur, etranger]) {
      const { error } = await ajouter(compte, { number: 3, title: "Intrus" });
      assert.ok(error, "l'ajout doit être refusé");
    }
    const { error } = await clientAnonyme()
      .from("project_episodes")
      .insert({ project_id: serie.id, number: 3, title: "Intrus" });
    assert.ok(error, "un visiteur n'a aucun droit sur la table");
    assert.deepEqual(await numeros(porteur.client), [1, 2]);
  });

  it("un éditeur ne signe pas un épisode du nom d'un autre", async () => {
    const { error } = await ajouter(editeur, {
      number: 3,
      title: "Signé d'un autre",
      created_by: porteur.id,
    });
    assert.equal(error?.code, "42501");
  });

  it("l'équipe les lit ; un étranger et un visiteur, non", async () => {
    assert.deepEqual(await numeros(lecteur.client), [1, 2]);
    assert.deepEqual(await numeros(editeur.client), [1, 2]);
    assert.deepEqual(await numeros(etranger.client), []);
    assert.deepEqual(await numeros(clientAnonyme()), []);
  });

  it("deux studios ne se lisent ni ne s'écrivent : la série d'un autre reste fermée", async () => {
    const { error } = await ajouter(etranger, { number: 1, title: "Chez soi" }, serieEtrangere);
    assert.equal(error, null, error?.message);

    for (const compte of [porteur, editeur, lecteur]) {
      assert.deepEqual(await numeros(compte.client, serieEtrangere), []);
      const { error: refus } = await ajouter(
        compte,
        { number: 2, title: "Intrus" },
        serieEtrangere,
      );
      assert.ok(refus, "l'ajout chez un autre studio doit être refusé");
    }
    assert.deepEqual(await numeros(etranger.client, serieEtrangere), [1]);
  });

  it("un lecteur ne les modifie ni ne les retire", async () => {
    const { data: modifie } = await lecteur.client
      .from("project_episodes")
      .update({ title: "Renommé" })
      .eq("id", pilote)
      .select("id");
    assert.deepEqual(modifie ?? [], []);

    const { data: retire } = await lecteur.client
      .from("project_episodes")
      .delete()
      .eq("id", pilote)
      .select("id");
    assert.deepEqual(retire ?? [], []);
    assert.deepEqual(await numeros(porteur.client), [1, 2]);
  });

  it("l'éditeur modifie un épisode ; ni projet, ni auteur, ni dates ne se réécrivent", async () => {
    const { data, error } = await editeur.client
      .from("project_episodes")
      .update({ title: "La première marée, reprise", duration_minutes: 30 })
      .eq("id", pilote)
      .select("title, duration_minutes");
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, [{ title: "La première marée, reprise", duration_minutes: 30 }]);

    for (const champs of [
      { project_id: serieEtrangere.id },
      { created_by: editeur.id },
      { created_at: "2020-01-01T00:00:00Z" },
    ]) {
      const { error: refus } = await porteur.client
        .from("project_episodes")
        .update(champs)
        .eq("id", pilote);
      assert.equal(refus?.code, "42501", JSON.stringify(champs));
    }
  });

  it("deux épisodes d'une série n'ont pas le même numéro", async () => {
    const { error } = await ajouter(porteur, { number: 2, title: "Doublon" });
    assert.equal(error?.code, "23505");

    const { error: renumerote } = await porteur.client
      .from("project_episodes")
      .update({ number: 2 })
      .eq("id", pilote);
    assert.equal(renumerote?.code, "23505");

    // Le même numéro dans une autre série ne gêne personne.
    assert.deepEqual(await numeros(etranger.client, serieEtrangere), [1]);
  });

  it("la base refuse un épisode mal formé", async () => {
    for (const champs of [
      { number: 0, title: "Zéro" },
      { number: 501, title: "Trop loin" },
      { number: 9, title: "   " },
      { number: 9, title: "Deux\nlignes" },
      { number: 9, title: "t".repeat(201) },
      { number: 9, title: "Long", summary: "r".repeat(2001) },
      { number: 9, title: "Sans durée", duration_minutes: 0 },
      { number: 9, title: "Démesuré", duration_minutes: 1001 },
    ]) {
      const { error } = await ajouter(porteur, champs);
      assert.equal(error?.code, "23514", JSON.stringify(champs).slice(0, 60));
    }
  });

  it("un épisode n'existe que dans une série : un film n'en reçoit pas", async () => {
    const { error } = await ajouter(porteur, { number: 1, title: "Pas une série" }, film);
    assert.equal(error?.code, "SE001");
    assert.deepEqual(await numeros(porteur.client, film), []);
  });

  it("un projet qui a des épisodes ne quitte pas le format série", async () => {
    const changer = (format) =>
      porteur.client.from("projects").update({ format }).eq("id", serie.id).select("format");

    const { error } = await changer("long_metrage");
    assert.equal(error?.code, "SE002");
    assert.deepEqual(await numeros(porteur.client), [1, 2]);

    // D'une série à une web-série, rien ne s'y oppose.
    const { data: web, error: refus } = await changer("web_serie");
    assert.equal(refus, null, refus?.message);
    assert.deepEqual(web, [{ format: "web_serie" }]);
    assert.equal((await changer("serie")).error, null);

    // Le reste du projet se modifie toujours.
    const { error: titre } = await porteur.client
      .from("projects")
      .update({ title: "Les Marées de Kribi, saison 1" })
      .eq("id", serie.id);
    assert.equal(titre, null, titre?.message);
  });

  it("une série sans épisode change de format, puis n'en reçoit plus", async () => {
    const vide = await creerSerie(porteur, "Série sans épisode");
    const { error: ajout } = await ajouter(porteur, { number: 1, title: "Éphémère" }, vide);
    assert.equal(ajout, null, ajout?.message);

    const versFilm = () =>
      porteur.client.from("projects").update({ format: "court_metrage" }).eq("id", vide.id);
    assert.equal((await versFilm()).error?.code, "SE002");

    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("project_id", vide.id);
    assert.equal(retrait, null, retrait?.message);
    assert.equal((await versFilm()).error, null);

    const { error } = await ajouter(porteur, { number: 1, title: "Trop tard" }, vide);
    assert.equal(error?.code, "SE001");
  });

  it("un administrateur en ajoute hors de ses projets, et le journal le retient", async () => {
    const { error } = await ajouter(administrateur, {
      number: 3,
      title: "Ajouté par l'administration",
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(await numeros(administrateur.client), [1, 2, 3]);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", serie.id)
      .eq("details->>table", "project_episodes");
    assert.deepEqual(
      journal.map((entree) => [entree.action, entree.details.operation]),
      [["intervention_contenu", "insert"]],
    );
  });

  it("une adhésion révoquée ne lit ni n'écrit plus", async () => {
    const { error } = await porteur.client
      .from("project_members")
      .delete()
      .eq("project_id", serie.id)
      .eq("user_id", editeur.id);
    assert.equal(error, null, error?.message);

    assert.deepEqual(await numeros(editeur.client), []);
    const { error: refus } = await ajouter(editeur, { number: 4, title: "Après la révocation" });
    assert.ok(refus, "l'ajout doit être refusé");
    const { data: modifie } = await editeur.client
      .from("project_episodes")
      .update({ title: "Après la révocation" })
      .eq("id", pilote)
      .select("id");
    assert.deepEqual(modifie ?? [], []);
  });

  it("un jeton expiré ou forgé ne lit rien", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const { URL: adresse, PUBLISHABLE_KEY } = await import("./helpers.mjs");
    const forge = createClient(adresse, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer jeton.expire.forge" } },
    });
    const { data, error } = await forge
      .from("project_episodes")
      .select("id")
      .eq("project_id", serie.id);
    assert.ok(error, "un jeton invalide doit être refusé");
    assert.equal(data, null);
  });

  it("en mode privé, l'équipe ne lit plus rien ; l'administration lit et écrit toujours", async () => {
    try {
      const actif = await sql("update public.app_settings set private_admin_only = true where id;");
      assert.equal(actif.code, 0, actif.erreurs);
      assert.deepEqual(await numeros(porteur.client), []);
      assert.deepEqual(await numeros(lecteur.client), []);
      const { error: refus } = await ajouter(porteur, { number: 5, title: "En mode privé" });
      assert.ok(refus, "le porteur n'écrit pas en mode privé");

      assert.deepEqual(await numeros(administrateur.client), [1, 2, 3]);
      const { error } = await ajouter(administrateur, { number: 6, title: "Saisi en mode privé" });
      assert.equal(error, null, error?.message);
    } finally {
      const inactif = await sql(
        "update public.app_settings set private_admin_only = false where id;",
      );
      assert.equal(inactif.code, 0, inactif.erreurs);
    }
    assert.deepEqual(await numeros(porteur.client), [1, 2, 3, 6]);
  });

  it("supprimer le projet emporte ses épisodes", async () => {
    const { error } = await etranger.client.from("projects").delete().eq("id", serieEtrangere.id);
    assert.equal(error, null, error?.message);
    assert.deepEqual(await numeros(administrateur.client, serieEtrangere), []);
  });
});
