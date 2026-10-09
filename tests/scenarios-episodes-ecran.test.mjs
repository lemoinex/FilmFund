/**
 * Le scénario d'un épisode (lot SE3a) : les règles de l'écran, leur accord
 * avec la base, et ce que lisent la page des épisodes, l'éditeur d'un
 * document et leurs actions.
 *
 * Les règles sont un module pur ; les pages, les actions et la migration sont
 * lues comme du texte. Aucune base, aucun fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ERREURS_SCENARIO, messageScenario, titreScenarioEpisode } from "../src/lib/episodes.ts";

const MIGRATION = "supabase/migrations/20261010000000_scenarios_episodes.sql";
const EPISODES = "src/app/(app)/projets/[id]/episodes";
const DOCUMENTS = "src/app/(app)/projets/[id]/documents";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");
const sansCommentairesSql = (source) => source.replace(/^\s*--.*$/gm, "");
const corpsDe = (source, nom) => {
  const debut = source.indexOf(`export async function ${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  const suite = source.indexOf("export ", debut + 1);
  return source.slice(debut, suite < 0 ? undefined : suite);
};

describe("Scénario d'un épisode : ce que l'écran en dit", () => {
  it("un scénario créé depuis son épisode en porte le numéro", () => {
    assert.equal(titreScenarioEpisode(1), "Scénario — épisode 1");
    assert.equal(titreScenarioEpisode(12), "Scénario — épisode 12");
  });

  it("chaque refus de la base a son message, sans rien dire de plus", () => {
    assert.match(messageScenario(ERREURS_SCENARIO.refus), /pas le droit de modifier les documents/);
    assert.match(messageScenario(ERREURS_SCENARIO.dejaRattache), /a déjà son scénario/);
    assert.match(
      messageScenario(ERREURS_SCENARIO.autreProjet),
      /n'est pas un épisode de ce projet/,
    );
    assert.match(
      messageScenario(ERREURS_SCENARIO.pasUnScenario),
      /Seul un scénario se rattache à un épisode/,
    );
    for (const code of [undefined, "", "XX000", "SE001"]) {
      assert.match(messageScenario(code), /L'enregistrement a échoué/, String(code));
    }
  });

  it("les codes de l'écran sont ceux que la base lève", () => {
    const migration = sansCommentairesSql(lire(MIGRATION));
    assert.match(migration, new RegExp(`errcode = '${ERREURS_SCENARIO.autreProjet}'`));
    assert.equal(ERREURS_SCENARIO.dejaRattache, "23505");
    assert.equal(ERREURS_SCENARIO.pasUnScenario, "23514");
  });
});

describe("Scénario d'un épisode : la migration", () => {
  const migration = sansCommentairesSql(lire(MIGRATION));

  it("une colonne facultative : retirer un épisode détache son scénario, sans le supprimer", () => {
    assert.match(
      migration,
      /add column episode_id uuid references public\.project_episodes \(id\) on delete set null,/,
    );
    assert.doesNotMatch(migration, /on delete cascade/);
    assert.doesNotMatch(migration, /add column episode_id uuid[^,]*not null/);
  });

  it("la base tient ses trois règles", () => {
    assert.match(
      migration,
      /add constraint document_episode_scenario check \(episode_id is null or type = 'scenario'\);/,
    );
    assert.match(
      migration,
      /create unique index project_documents_episode_unique\s+on public\.project_documents \(episode_id\)\s+where episode_id is not null;/,
    );
    assert.match(migration, /where e\.id = new\.episode_id and e\.project_id = new\.project_id/);
    assert.match(
      migration,
      /before insert or update of episode_id, project_id on public\.project_documents/,
    );
  });

  it("le droit de modifier est accordé pour cette colonne, et rien d'autre ne change", () => {
    assert.match(
      migration,
      /grant update \(episode_id\) on table public\.project_documents to authenticated;/,
    );
    assert.equal(migration.match(/^grant /gm).length, 1);
    assert.match(
      migration,
      /revoke all on function public\.controler_episode_du_document\(\) from public, anon, authenticated;/,
    );
    assert.doesNotMatch(
      migration,
      /policy|security definer|\banon;|filmfund_worker|disable row level|creer_devis|accepter_proposition/,
    );
  });
});

describe("Scénario d'un épisode : la page des épisodes", () => {
  const page = aPlat(lire(`${EPISODES}/page.tsx`));
  const actions = aPlat(lire(`${EPISODES}/actions.ts`));
  const creation = corpsDe(actions, "creerScenarioEpisode");

  it("la page lit les scénarios rattachés, sous la RLS des documents, bornés", () => {
    assert.match(
      page,
      /\.from\("project_documents"\) \.select\("id, episode_id"\) \.eq\("project_id", id\) \.eq\("type", "scenario"\) \.not\("episode_id", "is", null\) \.limit\(NUMERO_EPISODE\.max\)/,
    );
    // Lus après le contrôle d'accès de la page.
    assert.ok(
      page.indexOf('.from("project_documents")') >
        page.indexOf("if (!projet || !estSerie(projet.format)) {"),
    );
    // Le texte d'un scénario ne se lit pas ici.
    assert.doesNotMatch(page, /\.from\("project_documents"\) \.select\("[^"]*(content|title)/);
  });

  it("chaque épisode ouvre son scénario ; seul qui écrit peut le créer", () => {
    assert.match(
      page,
      /\{scenarios\.has\(episode\.id\) \? \( <p className="mt-4 text-sm"> <Link href=\{`\/projets\/\$\{id\}\/documents\/\$\{scenarios\.get\(episode\.id\)\}`\}/,
    );
    assert.match(page, /\) : edite \? \( <form action=\{creerScenarioEpisode\}/);
    assert.match(page, /Scénario non commencé\./);
    assert.match(page, /<input type="hidden" name="episode" value=\{episode\.id\} \/>/);
    // Le bouton dit de quel épisode il s'agit, pour un lecteur d'écran.
    assert.match(
      page,
      /Créer le scénario <span className="sr-only"> de \{libelleEpisode\(episode\.number\)\}<\/span>/,
    );
  });

  it("la création contrôle ses identifiants, puis la session, avant d'écrire", () => {
    const identifiants = creation.indexOf("!UUID.test(projetId) || !UUID.test(episodeId)");
    const garde = creation.indexOf("exigerAcces(supabase)");
    const ecriture = creation.indexOf('.from("project_documents")');
    assert.ok(identifiants >= 0 && garde > identifiants && ecriture > garde);
    assert.doesNotMatch(actions, /SECRET|service_role|clientDeService|\.rpc\(|fetch\(/);
  });

  it("le titre vient du numéro lu en base, et l'épisode est celui du projet nommé", () => {
    assert.match(
      creation,
      /\.from\("project_episodes"\) \.select\("number"\) \.eq\("id", episodeId\) \.eq\("project_id", projetId\) \.maybeSingle\(\); if \(!episode\) return;/,
    );
    assert.match(
      creation,
      /\.insert\(\{ project_id: projetId, type: "scenario", title: titreScenarioEpisode\(episode\.number\), episode_id: episodeId, created_by: garde\.user\.id, \}\)/,
    );
    assert.doesNotMatch(creation, /formData\.get\("(titre|title|type|numero|number)"\)/);
  });

  it("si l'épisode a déjà son scénario, c'est lui qui s'ouvre", () => {
    assert.match(creation, /if \(error\?\.code === ERREURS_SCENARIO\.dejaRattache\) \{/);
    assert.match(
      creation,
      /\.eq\("project_id", projetId\) \.eq\("episode_id", episodeId\) \.maybeSingle\(\); documentId = existant\?\.id;/,
    );
    assert.match(creation, /if \(!documentId\) return;/);
    assert.match(creation, /redirect\(`\/projets\/\$\{projetId\}\/documents\/\$\{documentId\}`\);/);
  });
});

describe("Scénario d'un épisode : l'éditeur", () => {
  const page = aPlat(lire(`${DOCUMENTS}/[documentId]/page.tsx`));
  const actions = aPlat(lire(`${DOCUMENTS}/actions.ts`));
  const rattachement = lire(`${DOCUMENTS}/[documentId]/rattachement.tsx`);
  const rattacher = corpsDe(actions, "rattacherScenario");

  it("l'épisode d'un scénario ne se lit que pour un scénario d'une série", () => {
    assert.match(
      page,
      /const rattachement = document\.type === "scenario" && estSerie\(projet\.format\) \? await lireRattachement\(supabase, projet\.id, document\.id, document\.episode_id\) : null;/,
    );
    assert.match(page, /episode_id, projects\(id, title, format\)/);
    // Lu après le 404 d'un document illisible.
    assert.ok(page.indexOf("await lireRattachement(") > page.indexOf("notFound();"));
  });

  it("la liste ne propose que les épisodes sans scénario, et celui du document", () => {
    const lecture = page.slice(page.indexOf("async function lireRattachement("));
    assert.match(
      lecture,
      /\.from\("project_episodes"\) \.select\("id, number, title"\) \.eq\("project_id", projetId\) \.order\("number"\) \.limit\(NUMERO_EPISODE\.max\)/,
    );
    assert.match(
      lecture,
      /\.eq\("type", "scenario"\) \.not\("episode_id", "is", null\) \.neq\("id", documentId\) \.limit\(NUMERO_EPISODE\.max\)/,
    );
    assert.match(lecture, /episodes: tous\.filter\(\(episode\) => !occupes\.has\(episode\.id\)\)/);
    assert.match(
      lecture,
      /actuel: tous\.find\(\(episode\) => episode\.id === episodeId\) \?\? null/,
    );
  });

  it("qui écrit le document rattache ; un lecteur lit seulement de quel épisode il s'agit", () => {
    const [ecrivain, lecteur] = page.split(") : ( <article");
    assert.match(ecrivain, /\{rattachement \? \( <RattachementEpisode/);
    assert.doesNotMatch(lecteur.slice(0, lecteur.indexOf("async function")), /RattachementEpisode/);
    assert.match(
      lecteur,
      /\{rattachement\?\.actuel \? \( <p className="text-secondary mt-3 text-xs"> Scénario de/,
    );
  });

  it("le rattachement contrôle ses identifiants, puis la session, et vise le document du projet", () => {
    assert.match(
      rattacher,
      /if \(!UUID\.test\(projetId\) \|\| !UUID\.test\(documentId\) \|\| \(episodeId && !UUID\.test\(episodeId\)\)\) \{/,
    );
    const garde = rattacher.indexOf("exigerAcces(supabase)");
    const ecriture = rattacher.indexOf('.from("project_documents")');
    assert.ok(garde > 0 && ecriture > garde);
    assert.match(
      rattacher,
      /\.update\(\{ episode_id: episodeId \|\| null \}\) \.eq\("id", documentId\) \.eq\("project_id", projetId\) \.select\("id"\)/,
    );
    // Rien d'autre du document n'est écrit par ce chemin.
    assert.doesNotMatch(rattacher, /content|title|type:|status/);
  });

  it("un refus se dit, y compris celui que la RLS rend sans erreur", () => {
    assert.match(
      rattacher,
      /if \(error\) \{ return \{ erreur: messageScenario\(error\.code\) \}; \}/,
    );
    assert.match(rattacher, /if \(!data\?\.length\) \{ return \{ erreur: REFUS \}; \}/);
    assert.doesNotMatch(rattacher, /error\.message/);
    assert.match(rattacher, /revalidatePath\(`\/projets\/\$\{projetId\}\/episodes`\)/);
  });

  it("changer le type d'un scénario rattaché dit pourquoi la base refuse", () => {
    const enregistrement = corpsDe(actions, "enregistrerDocument");
    assert.match(
      enregistrement,
      /error\.code === ERREURS_SCENARIO\.pasUnScenario && type !== "scenario" \? messageScenario\(error\.code\) : "L'enregistrement a échoué\. Réessayez dans un instant\."/,
    );
  });

  it("l'encart du rattachement est étiqueté, et dit que le texte ne change pas", () => {
    assert.match(rattachement, /^"use client";/);
    assert.match(rattachement, /<label htmlFor="rattachement-choix"/);
    assert.match(rattachement, /id="rattachement-choix"\s+name="episode"/);
    assert.match(rattachement, /<option value="">Aucun épisode<\/option>/);
    assert.match(rattachement, /Le rattacher ne change ni son texte ni son historique\./);
    assert.match(rattachement, /Ce scénario n'est rattaché à aucun épisode\./);
    assert.doesNotMatch(rattachement, /dangerouslySetInnerHTML/);
  });
});
