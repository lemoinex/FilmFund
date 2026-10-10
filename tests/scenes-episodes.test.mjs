/**
 * La scène d'un épisode (lot SE5) : d'abord par l'API avec de vrais comptes —
 * porteur, éditeur, lecteur, compte étranger, administrateur et visiteur —,
 * puis ce que l'écran et ses actions en font, lus comme du texte.
 *
 * Les séries, les épisodes et les scènes d'ici sont FICTIFS. Aucun appel à un
 * fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  AIDE_EPISODE_DE_SCENE,
  episodeDeScene,
  ERREUR_EPISODE_DE_SCENE,
  MESSAGE_EPISODE_DE_SCENE,
  SANS_SCENARIO_D_EPISODE,
} from "../src/lib/episodes.ts";
import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const STORYBOARD = "src/app/(app)/projets/[id]/storyboard";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");
const corpsDe = (source, nom) => {
  const debut = source.indexOf(`function ${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  const suite = source.indexOf("export ", debut + 1);
  return source.slice(debut, suite < 0 ? undefined : suite);
};

describe("La scène d'un épisode : par l'API", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let serie;
  let pilote;
  let second;
  let episodeEtranger;
  let scene;

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

  const creerScene = (compte, position, champs = {}, projet = serie) =>
    compte.client
      .from("storyboard_scenes")
      .insert({
        project_id: projet.id,
        position,
        title: `Scène ${position}`,
        setting: "ext",
        time_of_day: "aube",
        created_by: compte.id,
        ...champs,
      })
      .select("id, episode_id")
      .single();

  const rattacher = (compte, sceneId, episode_id) =>
    compte.client
      .from("storyboard_scenes")
      .update({ episode_id })
      .eq("id", sceneId)
      .select("id, episode_id");

  const lireScene = async (compte, sceneId) =>
    (
      await compte.client
        .from("storyboard_scenes")
        .select("id, title, episode_id")
        .eq("id", sceneId)
        .maybeSingle()
    ).data;

  before(async () => {
    porteur = await creerCompte("scenes-porteur");
    editeur = await creerCompte("scenes-editeur");
    lecteur = await creerCompte("scenes-lecteur");
    etranger = await creerCompte("scenes-etranger");
    administrateur = await creerCompte("scenes-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);

    serie = await creerSerie(porteur, "Les Marées de Kribi");
    await faireEntrer(porteur, serie.id, editeur, "editor");
    await faireEntrer(porteur, serie.id, lecteur, "viewer");
    pilote = await ajouterEpisode(porteur, serie, 1, "Le filet");
    second = await ajouterEpisode(porteur, serie, 2, "La dette");

    const ailleurs = await creerSerie(etranger, "Une autre série");
    episodeEtranger = await ajouterEpisode(etranger, ailleurs, 1, "Ailleurs");

    const { data, error } = await creerScene(porteur, 1, { episode_id: pilote });
    assert.equal(error, null, error?.message);
    scene = data.id;
  });

  it("le porteur crée une scène rattachée à un épisode, ou à aucun", async () => {
    assert.deepEqual(await lireScene(porteur, scene), {
      id: scene,
      title: "Scène 1",
      episode_id: pilote,
    });
    const { data, error } = await creerScene(porteur, 2);
    assert.equal(error, null, error?.message);
    assert.equal(data.episode_id, null);
  });

  it("l'éditeur rattache, change et détache l'épisode d'une scène", async () => {
    for (const cible of [second, null, pilote]) {
      const { data, error } = await rattacher(editeur, scene, cible);
      assert.equal(error, null, error?.message);
      assert.deepEqual(data, [{ id: scene, episode_id: cible }]);
    }
  });

  it("toute l'équipe lit l'épisode d'une scène ; un lecteur ne le change pas", async () => {
    assert.equal((await lireScene(lecteur, scene)).episode_id, pilote);
    const { data, error } = await rattacher(lecteur, scene, second);
    // La politique ne rend aucune ligne à modifier : ni erreur, ni changement.
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, []);
    assert.equal((await lireScene(porteur, scene)).episode_id, pilote);
    const creation = await creerScene(lecteur, 9, { episode_id: pilote });
    assert.equal(creation.error?.code, "42501");
  });

  it("l'épisode d'un autre projet est refusé, à la création comme à la modification", async () => {
    const creation = await creerScene(porteur, 3, { episode_id: episodeEtranger });
    assert.equal(creation.error?.code, ERREUR_EPISODE_DE_SCENE);
    const modification = await rattacher(porteur, scene, episodeEtranger);
    assert.equal(modification.error?.code, ERREUR_EPISODE_DE_SCENE);
    assert.equal((await lireScene(porteur, scene)).episode_id, pilote);
  });

  it("un compte étranger ne lit ni ne rattache rien, pas même à son propre épisode", async () => {
    assert.equal(await lireScene(etranger, scene), null);
    const { data, error } = await rattacher(etranger, scene, episodeEtranger);
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, []);
    assert.equal((await lireScene(porteur, scene)).episode_id, pilote);
  });

  it("un administrateur hors équipe rattache une scène, et le journal le retient", async () => {
    const { data, error } = await rattacher(administrateur, scene, second);
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, [{ id: scene, episode_id: second }]);
    // Remise en place avant toute vérification : les tests suivants en dépendent.
    await rattacher(porteur, scene, pilote);
    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", serie.id)
      .eq("action", "intervention_contenu");
    assert.ok(
      (journal ?? []).some(
        (entree) =>
          entree.details.table === "storyboard_scenes" && entree.details.operation === "update",
      ),
      "l'intervention de l'administrateur doit être journalisée",
    );
  });

  it("un visiteur ne lit aucune scène", async () => {
    const { data } = await clientAnonyme()
      .from("storyboard_scenes")
      .select("id, episode_id")
      .eq("id", scene);
    assert.deepEqual(data ?? [], []);
  });

  it("retirer un épisode ne supprime pas ses scènes : le lien se vide", async () => {
    const { data: creee, error } = await creerScene(porteur, 5, { episode_id: second });
    assert.equal(error, null, error?.message);
    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("id", second);
    assert.equal(retrait, null, retrait?.message);
    assert.deepEqual(await lireScene(porteur, creee.id), {
      id: creee.id,
      title: "Scène 5",
      episode_id: null,
    });
    // Les scènes des autres épisodes ne bougent pas.
    assert.equal((await lireScene(porteur, scene)).episode_id, pilote);
  });
});

describe("La scène d'un épisode : ce que l'écran en dit", () => {
  it("l'épisode d'une scène se dit comme à l'écran des épisodes", () => {
    assert.equal(episodeDeScene({ number: 1, title: "Le filet" }), "Épisode 1 — pilote : Le filet");
    assert.equal(episodeDeScene({ number: 4, title: "La crue" }), "Épisode 4 : La crue");
  });

  it("le code de l'écran est celui que la base lève, et son message ne dit rien de plus", () => {
    const migration = lire("supabase/migrations/20261010220000_scenes_episodes.sql").replace(
      /^\s*--.*$/gm,
      "",
    );
    assert.equal(ERREUR_EPISODE_DE_SCENE, "SE005");
    assert.equal(migration.split(`errcode = '${ERREUR_EPISODE_DE_SCENE}'`).length - 1, 1);
    assert.match(MESSAGE_EPISODE_DE_SCENE, /n'est pas un épisode de ce projet/);
    assert.doesNotMatch(MESSAGE_EPISODE_DE_SCENE, /SE005/);
  });

  it("l'écran dit quel scénario l'assistant lira, et qu'il ne se rabat sur aucun autre", () => {
    assert.match(AIDE_EPISODE_DE_SCENE, /lit le scénario de cet épisode, et lui seul/);
    assert.match(
      AIDE_EPISODE_DE_SCENE,
      /Sans épisode, il lit le scénario qui n'est rattaché à aucun épisode/,
    );
    assert.match(SANS_SCENARIO_D_EPISODE, /n'a pas de scénario enregistré/);
    assert.match(SANS_SCENARIO_D_EPISODE, /jamais d'après le scénario d'un autre épisode/);
  });
});

describe("La scène d'un épisode : la migration", () => {
  const migration = lire("supabase/migrations/20261010220000_scenes_episodes.sql").replace(
    /^\s*--.*$/gm,
    "",
  );

  it("une colonne facultative : retirer un épisode détache ses scènes, sans les supprimer", () => {
    assert.match(
      migration,
      /add column episode_id uuid references public\.project_episodes \(id\) on delete set null;/,
    );
    assert.doesNotMatch(migration, /on delete cascade|not null default|create policy|drop /i);
  });

  it("la règle est tenue par la base, sous les droits de l'appelant", () => {
    assert.match(migration, /e\.id = new\.episode_id and e\.project_id = new\.project_id/);
    assert.match(
      migration,
      /before insert or update of episode_id, project_id on public\.storyboard_scenes/,
    );
    assert.match(
      migration,
      /revoke all on function public\.controler_episode_de_la_scene\(\) from public, anon, authenticated;/,
    );
    const declencheur = migration.slice(
      migration.indexOf("function public.controler_episode_de_la_scene()"),
      migration.indexOf("revoke all on function public.controler_episode_de_la_scene()"),
    );
    assert.doesNotMatch(declencheur, /security definer/);
    assert.match(
      migration,
      /grant insert \(episode_id\), update \(episode_id\) on table public\.storyboard_scenes to authenticated;/,
    );
    assert.equal(migration.split("grant ").length - 1, 1);
  });

  it("une seule fonction de contexte est reprise : celle de FRAME", () => {
    assert.deepEqual(
      [...migration.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]),
      ["controler_episode_de_la_scene", "contexte_decoupage"],
    );
  });
});

describe("La scène d'un épisode : actions, formulaire et page", () => {
  const actions = aPlat(lire(`${STORYBOARD}/actions.ts`));
  const formulaire = aPlat(lire(`${STORYBOARD}/formulaire.tsx`));
  const page = aPlat(lire(`${STORYBOARD}/page.tsx`));
  const encart = aPlat(lire(`${STORYBOARD}/plans-proposes.tsx`));

  it("l'épisode saisi est validé ; un formulaire qui ne le porte pas ne touche pas au rattachement", () => {
    const valider = corpsDe(actions, "validerScene");
    assert.match(valider, /const episode = formData\.get\("episode"\);/);
    assert.match(
      valider,
      /if \(episode !== null && episode !== "" && !UUID\.test\(String\(episode\)\)\) \{ return \{ erreur: "Épisode inconnu\." \}; \}/,
    );
    assert.match(
      valider,
      /\.\.\.\(episode === null \? \{\} : \{ episode_id: episode === "" \? null : String\(episode\) \}\),/,
    );
  });

  it("le refus de la base a son message, à l'ajout comme à la modification", () => {
    assert.equal(actions.split("error.code === ERREUR_EPISODE_DE_SCENE").length - 1, 1);
    assert.equal(actions.split("error?.code === ERREUR_EPISODE_DE_SCENE").length - 1, 1);
    assert.equal(actions.split("return { erreur: MESSAGE_EPISODE_DE_SCENE };").length - 1, 2);
    // La scène reste tenue à son projet : l'épisode ne s'écrit pas ailleurs.
    assert.match(
      corpsDe(actions, "modifierScene"),
      /\.update\(resultat\.scene\) \.eq\("id", sceneId\) \.eq\("project_id", projetId\)/,
    );
  });

  it("le champ n'est rendu que si le projet a des épisodes, avec son aide", () => {
    assert.match(formulaire, /\{episodes\.length \? \( <div> <label htmlFor=\{`\$\{p\}-episode`\}/);
    assert.match(formulaire, /name="episode" defaultValue=\{scene\?\.episode_id \?\? ""\}/);
    assert.match(formulaire, /<option value="">Aucun épisode<\/option>/);
    assert.match(formulaire, /\{libelleEpisode\(episode\.number\)\} : \{episode\.title\}/);
    assert.match(formulaire, /aria-describedby=\{`\$\{p\}-episode-aide`\}/);
    assert.match(formulaire, /\{AIDE_EPISODE_DE_SCENE\}/);
    assert.match(formulaire, /episodes = \[\],/);
  });

  it("la page ne lit les épisodes que pour une série, de façon bornée", () => {
    assert.match(page, /supabase\.from\("projects"\)\.select\("id, title, format"\)/);
    assert.match(
      page,
      /estSerie\(projet\.format\) \? await supabase \.from\("project_episodes"\) \.select\("id, number, title"\) \.eq\("project_id", projet\.id\) \.order\("number"\) \.limit\(NUMERO_EPISODE\.max\) : \{ data: \[\] \};/,
    );
    assert.match(page, /image_path, episode_id",? \)/);
    assert.equal(page.split("episodes={episodes}").length - 1, 2);
  });

  it("la carte dit l'épisode de la scène, et l'avertissement est celui de son scénario", () => {
    assert.match(
      page,
      /\{episode \? <p className="[^"]*">\{episodeDeScene\(episode\)\}<\/p> : null\}/,
    );
    assert.match(
      page,
      /sansScenario=\{ scene\.episode_id \? assistant\.scenarios\.episodes\.has\(scene\.episode_id\) \? null : SANS_SCENARIO_D_EPISODE : assistant\.scenarios\.sansEpisode \? null : LIVRABLE_DECOUPAGE\.sansScenario \}/,
    );
    // Les scénarios du projet sont lus par épisode, bornés.
    assert.match(
      page,
      /\.select\("episode_id"\) \.eq\("project_id", projetId\) \.eq\("type", "scenario"\)/,
    );
    assert.match(page, /\.limit\(NUMERO_EPISODE\.max \+ 1\);/);
    assert.match(
      page,
      /sansEpisode: \(documents \?\? \[\]\)\.some\(\(document\) => document\.episode_id === null\),/,
    );
    assert.match(encart, /\{sansScenario \? ` \$\{sansScenario\}` : null\}/);
    assert.doesNotMatch(`${page}${encart}`, /scenarioPresent/);
  });
});
