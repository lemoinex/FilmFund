/**
 * Ce qui attend sur un projet (lot AS2) : les règles, ce que la page et sa
 * lecture écrivent, puis la lecture elle-même contre la base locale, sous la
 * session de chaque rôle.
 *
 * AUCUN APPEL PAYANT ici : quand une proposition doit exister, elle est
 * déposée par le test ou par un FOURNISSEUR FACTICE, désigné comme tel.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import {
  ACTIONS_ASSISTANT,
  BESOINS_ASSISTANT,
  ceQuiAttend,
  cibleDe,
  decompteAttentes,
  dernieresParCible,
  NATURES_ATTENTE,
  TACHES_LUES_MAX,
} from "../src/lib/assistant-ia.ts";
import { executeursScript } from "../worker/src/agents/script.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  deposerProposition,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const PROJET = "src/app/(app)/projets/[id]";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");

const DEMANDES = BESOINS_ASSISTANT.flatMap((besoin) => besoin.demandes);
const VIDE = { scenes: new Map(), documents: new Map(), scenarios: new Map() };
const TOUT = { peutDemander: true, budget: true };
const LECTEUR = { peutDemander: false, budget: false };

let rang = 0;
/** Une tâche d'essai ; chaque appel est plus ancien que le précédent, comme la lecture les rend. */
const tache = (action, state, autres = {}) => {
  rang += 1;
  return {
    id: `tache-${rang}`,
    action,
    state,
    created_at: new Date(Date.UTC(2026, 9, 10, 12, 0, 0) - rang * 60_000).toISOString(),
    scene: null,
    document: null,
    episode: null,
    ...autres,
  };
};

describe("Ce qui attend : la cible d'une demande", () => {
  it("chaque écran a sa cible : l'action, ou la scène, le document, l'épisode", () => {
    assert.equal(cibleDe(tache("logline", "queued")), "logline");
    assert.equal(cibleDe(tache("research", "queued")), "recherche");
    assert.equal(cibleDe(tache("cultural_context", "queued")), "recherche");
    for (const action of ["text_improve", "text_shorten", "text_expand", "text_correct"]) {
      assert.equal(cibleDe(tache(action, "queued", { document: "d1" })), "retouche:d1");
    }
    assert.equal(cibleDe(tache("dialogue", "queued", { document: "d1" })), "dialogue:d1");
    assert.equal(cibleDe(tache("shot_list", "queued", { scene: "s1" })), "shot_list:s1");
    assert.equal(
      cibleDe(tache("storyboard_image", "queued", { scene: "s1" })),
      "storyboard_image:s1",
    );
    assert.equal(cibleDe(tache("screenplay", "queued")), "screenplay:");
    assert.equal(cibleDe(tache("screenplay", "queued", { episode: "e1" })), "screenplay:e1");
  });

  it("seule la dernière demande de chaque cible est gardée, comme sur son écran", () => {
    const taches = [
      tache("logline", "cancelled"),
      tache("logline", "succeeded"),
      tache("shot_list", "queued", { scene: "s1" }),
      tache("shot_list", "succeeded", { scene: "s2" }),
      tache("shot_list", "succeeded", { scene: "s1" }),
      tache("cultural_context", "running"),
      tache("research", "succeeded"),
      tache("pdf_export", "queued"),
      tache("opportunity_watch", "queued"),
    ];
    assert.deepEqual(
      dernieresParCible(taches).map((t) => t.id),
      [taches[0].id, taches[2].id, taches[3].id, taches[5].id],
    );
  });

  it("la lecture ne retient que les actions du catalogue", () => {
    assert.deepEqual([...ACTIONS_ASSISTANT].sort(), DEMANDES.map((d) => d.action).sort());
    assert.ok(!ACTIONS_ASSISTANT.includes("opportunity_watch"));
    assert.ok(!ACTIONS_ASSISTANT.some((action) => action.endsWith("_export")));
  });
});

describe("Ce qui attend : ce qu'un projet montre", () => {
  it("une proposition se montre si sa tâche a réussi et qu'elle n'est pas décidée", () => {
    const reussie = tache("logline", "succeeded");
    const decidee = tache("treatment", "succeeded");
    const attentes = ceQuiAttend([reussie, decidee], new Set([reussie.id]), VIDE, TOUT);
    assert.deepEqual(
      attentes.map(({ id, nature, libelle, chemin, cible }) => [
        id,
        nature,
        libelle,
        chemin,
        cible,
      ]),
      [[reussie.id, "proposition", "Pitch", "#assistant-logline", null]],
    );
    assert.equal(attentes[0].depuis, reussie.created_at);
  });

  it("une demande non terminée se dit par son état ; un échec ou une annulation, non", () => {
    const taches = [
      tache("logline", "queued"),
      tache("treatment", "running"),
      tache("bible", "awaiting_reconciliation"),
      tache("gear_list", "failed"),
      tache("schedule_plan", "cancelled"),
      tache("pitch_oral", "inconnu"),
    ];
    assert.deepEqual(
      ceQuiAttend(taches, new Set(), VIDE, TOUT).map((a) => [a.action, a.nature]),
      [
        ["logline", "en_file"],
        ["treatment", "en_cours"],
        ["bible", "a_rapprocher"],
      ],
    );
    assert.deepEqual(Object.keys(NATURES_ATTENTE), [
      "proposition",
      "en_file",
      "en_cours",
      "a_rapprocher",
    ]);
    assert.match(NATURES_ATTENTE.a_rapprocher, /l'issue de la demande n'est pas connue/);
  });

  it("une demande plus récente, même annulée, cache la proposition qui la précède", () => {
    const annulee = tache("logline", "cancelled");
    const ancienne = tache("logline", "succeeded");
    assert.deepEqual(ceQuiAttend([annulee, ancienne], new Set([ancienne.id]), VIDE, TOUT), []);
  });

  it("les propositions passent avant les demandes en cours, chacune dans l'ordre de lecture", () => {
    const taches = [
      tache("logline", "queued"),
      tache("treatment", "succeeded"),
      tache("bible", "running"),
      tache("gear_list", "succeeded"),
    ];
    const attentes = ceQuiAttend(taches, new Set([taches[1].id, taches[3].id]), VIDE, TOUT);
    assert.deepEqual(
      attentes.map((a) => a.action),
      ["treatment", "gear_list", "logline", "bible"],
    );
  });

  it("un lecteur ne lit que les propositions que leur écran lui montre, jamais une demande en cours", () => {
    assert.deepEqual(
      DEMANDES.filter((demande) => demande.lecteur)
        .map((demande) => demande.action)
        .sort(),
      [
        "cultural_context",
        "episode_list",
        "gear_list",
        "research",
        "schedule_plan",
        "shot_list",
        "storyboard_image",
      ],
    );
    const taches = [
      tache("episode_list", "succeeded"),
      tache("logline", "succeeded"),
      tache("character_list", "succeeded"),
      tache("gear_list", "queued"),
      tache("schedule_plan", "running"),
      tache("research", "awaiting_reconciliation"),
      tache("dialogue", "succeeded", { document: "d1" }),
    ];
    const proposees = new Set(taches.map((t) => t.id));
    const cibles = { ...VIDE, documents: new Map([["d1", "Scénario"]]) };
    assert.deepEqual(
      ceQuiAttend(taches, proposees, cibles, LECTEUR).map((a) => [a.action, a.nature]),
      [["episode_list", "proposition"]],
    );
    assert.equal(ceQuiAttend(taches, proposees, cibles, TOUT).length, 7);
  });

  it("l'écran d'un lecteur est bien celui qui lui montre la proposition", () => {
    // Les pages dont l'encart se rend à un lecteur quand une proposition attend.
    for (const [action, page] of [
      ["episode_list", "episodes/page.tsx"],
      ["gear_list", "materiel/page.tsx"],
      ["schedule_plan", "planning/page.tsx"],
      ["shot_list", "storyboard/page.tsx"],
    ]) {
      assert.match(
        aPlat(lire(`${PROJET}/${page}`)),
        /const montrerAssistant = \w+ \|\| assistant\.etape\.etape === "proposition";/,
        action,
      );
    }
    assert.match(lire(`${PROJET}/recherche/page.tsx`), /un lecteur ne lit que ce qui est proposé/);
    assert.match(lire(`${PROJET}/storyboard/page.tsx`), /un lecteur ne lit que les propositions/);
    // Les encarts de texte ne se rendent qu'à qui peut demander.
    for (const page of ["page.tsx", "documents/page.tsx", "fiche/page.tsx"]) {
      assert.match(aPlat(lire(`${PROJET}/${page}`)), /\{peutDemander \? \(/, page);
    }
  });

  it("la proposition de budget ne se montre qu'à qui gère le budget", () => {
    const budget = tache("budget_plan", "succeeded");
    const proposees = new Set([budget.id]);
    assert.equal(ceQuiAttend([budget], proposees, VIDE, TOUT).length, 1);
    assert.deepEqual(
      ceQuiAttend([budget], proposees, VIDE, { peutDemander: true, budget: false }),
      [],
    );
    assert.deepEqual(ceQuiAttend([budget], proposees, VIDE, LECTEUR), []);
  });

  it("une attente mène à sa cible : la scène, le document, le scénario de l'épisode", () => {
    const taches = [
      tache("shot_list", "succeeded", { scene: "s1" }),
      tache("storyboard_image", "queued", { scene: "s2" }),
      tache("dialogue", "succeeded", { document: "d1" }),
      tache("text_shorten", "running", { document: "d2" }),
      tache("screenplay", "succeeded", { episode: "e1" }),
      tache("screenplay", "queued"),
    ];
    const cibles = {
      scenes: new Map([
        ["s1", "La berge"],
        ["s2", "  "],
      ]),
      documents: new Map([
        ["d1", "Scénario"],
        ["d2", "Note d'intention"],
      ]),
      scenarios: new Map([["e1", { id: "d9", titre: "Scénario — épisode 1" }]]),
    };
    const attentes = ceQuiAttend(taches, new Set(taches.map((t) => t.id)), cibles, TOUT);
    assert.deepEqual(Object.fromEntries(attentes.map((a) => [a.id, [a.cible, a.chemin]])), {
      [taches[0].id]: ["La berge", "/storyboard#scene-s1"],
      [taches[1].id]: ["Scène sans titre", "/storyboard#scene-s2"],
      [taches[2].id]: ["Scénario", "/documents/d1#assistant-dialogues"],
      [taches[3].id]: ["Note d'intention", "/documents/d2#assistant-retouches"],
      [taches[4].id]: ["Scénario — épisode 1", "/documents/d9#assistant-screenplay"],
      [taches[5].id]: [null, "/documents#assistant-screenplay"],
    });
    // Les ancres sont celles que ces écrans posent.
    assert.match(lire(`${PROJET}/storyboard/page.tsx`), /id=\{`scene-\$\{scene\.id\}`\}/);
    assert.match(
      lire(`${PROJET}/documents/[documentId]/dialogues.tsx`),
      /id="assistant-dialogues"/,
    );
    assert.match(
      lire(`${PROJET}/documents/[documentId]/retouches.tsx`),
      /id="assistant-retouches"/,
    );
  });

  it("une cible retirée ne donne aucun lien, et la page le dit", () => {
    const taches = [
      tache("shot_list", "succeeded", { scene: "s1" }),
      tache("dialogue", "succeeded", { document: "d1" }),
      tache("screenplay", "succeeded", { episode: "e1" }),
    ];
    const attentes = ceQuiAttend(taches, new Set(taches.map((t) => t.id)), VIDE, TOUT);
    assert.deepEqual(
      attentes.map((a) => [a.cible, a.chemin]),
      [
        ["Scène retirée", null],
        ["Document retiré", null],
        ["Épisode retiré, ou scénario détaché", null],
      ],
    );
  });

  it("le décompte dit ce qui attend, ou que rien n'attend", () => {
    const a = (nature) => ({ nature });
    assert.equal(decompteAttentes([]), "Rien n'attend sur ce projet");
    assert.equal(decompteAttentes([a("proposition")]), "1 proposition à décider");
    assert.equal(
      decompteAttentes([a("proposition"), a("proposition"), a("en_file"), a("a_rapprocher")]),
      "2 propositions à décider, 2 demandes en cours",
    );
    assert.equal(decompteAttentes([a("en_cours")]), "1 demande en cours");
  });
});

describe("Ce qui attend : la lecture et la page", () => {
  const lecture = aPlat(lire(`${PROJET}/assistant-ia/lecture.ts`));
  const page = aPlat(lire(`${PROJET}/assistant-ia/page.tsx`));

  it("des tâches, seuls l'action, l'état, la date et la cible sont lus, de façon bornée", () => {
    assert.match(
      lecture,
      /"id, action, state, created_at, scene:params->>scene, document:params->>document, episode:params->>episode",/,
    );
    assert.doesNotMatch(lecture, /"[^"]*\bparams\b(?!->>)[^"]*"/);
    assert.doesNotMatch(lecture, /question|sequence|reason/);
    assert.match(lecture, /\.eq\("project_id", projetId\) \.in\("action", ACTIONS_ASSISTANT\)/);
    assert.match(
      lecture,
      /\.order\("created_at", \{ ascending: false \}\) \.limit\(TACHES_LUES_MAX\);/,
    );
    assert.equal(TACHES_LUES_MAX, 100);
    assert.match(lecture, /borneAtteinte: taches\.length >= TACHES_LUES_MAX/);
  });

  it("des propositions, seule l'existence est lue : jamais leur contenu", () => {
    assert.match(lecture, /\.from\("ai_suggestions"\) \.select\("job_id"\)/);
    assert.match(lecture, /\.eq\("state", "proposed"\)/);
    assert.doesNotMatch(lecture, /content|final_content|replaced_content/);
    // Aucune table de lignes : le parent dit seul si quelque chose attend.
    assert.doesNotMatch(lecture, /ai_suggestion_/);
    assert.deepEqual(
      [...lecture.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]),
      ["jobs", "ai_suggestions", "storyboard_scenes", "project_documents", "project_documents"],
    );
    // Chaque lecture est tenue au projet, et rien n'est écrit.
    assert.equal(lecture.split('.eq("project_id", projetId)').length - 1, 5);
    assert.doesNotMatch(lecture, /\.(insert|update|delete|upsert|rpc)\(/);
  });

  it("la page lit ce qui attend après le contrôle d'accès, avec les droits de l'appelant", () => {
    assert.ok(page.indexOf("if (!projet) { notFound(); }") < page.indexOf("chargerAttentes("));
    assert.match(
      page,
      /await chargerAttentes\(supabase, id, \{ peutDemander, budget: gereBudget, \}\);/,
    );
  });

  it("elle ne décide rien : un lien par attente, aucun bouton, et ses réserves", () => {
    assert.doesNotMatch(page, /<form|<button|"use client"|accepter_|ecarter_|annuler_/);
    assert.match(page, /href=\{`\/projets\/\$\{id\}\$\{attente\.chemin\}`\}/);
    assert.match(page, /\{attente\.chemin === null \? \(/);
    assert.match(page, /aucun écran ne l&apos;ouvre plus/);
    assert.match(page, /Chaque écran ne garde que sa dernière demande/);
    assert.match(page, /Rien ne se décide depuis cette page/);
    assert.match(page, /Seules les \$\{TACHES_LUES_MAX\} dernières demandes du projet sont lues/);
    assert.match(page, /\{decompteAttentes\(attentes\)\}\./);
    // L'état ne se dit jamais par la seule couleur.
    assert.match(page, /\{NATURES_ATTENTE\[attente\.nature\]\}/);
  });
});

/*
 * La lecture contre la base locale. Le module de la page importe des alias
 * que Node ne résout pas : ses requêtes sont rejouées ici, à l'identique —
 * le bloc précédent vérifie que ce sont bien celles du fichier —, sous la
 * session de chaque rôle.
 */
async function lireAttentes(compte, projetId, contexte) {
  const { data, error } = await compte.client
    .from("jobs")
    .select(
      "id, action, state, created_at, scene:params->>scene, document:params->>document, episode:params->>episode",
    )
    .eq("project_id", projetId)
    .in("action", ACTIONS_ASSISTANT)
    .order("created_at", { ascending: false })
    .limit(TACHES_LUES_MAX);
  assert.ifError(error);
  const taches = data ?? [];
  const dernieres = dernieresParCible(taches);
  const reussies = dernieres.filter((t) => t.state === "succeeded").map((t) => t.id);
  const episodes = [...new Set(dernieres.map((t) => t.episode).filter(Boolean))];

  const { data: propositions } = reussies.length
    ? await compte.client
        .from("ai_suggestions")
        .select("job_id")
        .eq("project_id", projetId)
        .eq("state", "proposed")
        .in("job_id", reussies)
    : { data: [] };
  const { data: scenarios } = episodes.length
    ? await compte.client
        .from("project_documents")
        .select("id, title, episode_id")
        .eq("project_id", projetId)
        .eq("type", "scenario")
        .in("episode_id", episodes)
    : { data: [] };

  return {
    taches,
    attentes: ceQuiAttend(
      taches,
      new Set((propositions ?? []).map((p) => p.job_id)),
      {
        scenes: new Map(),
        documents: new Map(),
        scenarios: new Map(
          (scenarios ?? []).map((d) => [d.episode_id, { id: d.id, titre: d.title }]),
        ),
      },
      contexte,
    ),
  };
}

describe("Ce qui attend : contre la base, sous chaque rôle", () => {
  const OPUS = "claude-opus-5-5";
  let base;
  let porteur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let tachePitch;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    await definirPlafondIa(1_000_000);
    porteur = await creerCompte("attente-porteur");
    lecteur = await creerCompte("attente-lecteur");
    etranger = await creerCompte("attente-etranger");
    administrateur = await creerCompte("attente-admin", "Administration");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Les Marées de Kribi");
    const { error } = await porteur.client
      .from("projects")
      .update({ format: "serie" })
      .eq("id", projet.id);
    assert.ifError(error);
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  it("rien n'attend sur un projet sans demande", async () => {
    const { attentes } = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(attentes, []);
  });

  it("une demande en file se lit du porteur, pas du lecteur ; un étranger ne lit aucune tâche", async () => {
    tachePitch = await engager(porteur, projet.id, "logline", "attente-pitch-1");
    const duPorteur = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(
      duPorteur.attentes.map((a) => [a.id, a.nature, a.chemin]),
      [[tachePitch.id, "en_file", "#assistant-logline"]],
    );
    // La base rend la tâche au lecteur : c'est la page qui ne la lui montre pas.
    const duLecteur = await lireAttentes(lecteur, projet.id, LECTEUR);
    assert.equal(duLecteur.taches.length, 1);
    assert.deepEqual(duLecteur.attentes, []);
    // Pour un étranger, la base ne rend rien — quels que soient les droits prétendus.
    const deLEtranger = await lireAttentes(etranger, projet.id, TOUT);
    assert.deepEqual([deLEtranger.taches, deLEtranger.attentes], [[], []]);
  });

  it("la proposition déposée attend une décision ; un administrateur hors équipe la lit", async () => {
    await deposerProposition(tachePitch.id, "Une pêcheuse défie le fleuve.");
    const duPorteur = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(
      duPorteur.attentes.map((a) => [a.id, a.nature]),
      [[tachePitch.id, "proposition"]],
    );
    const deLAdmin = await lireAttentes(administrateur, projet.id, TOUT);
    assert.deepEqual(
      deLAdmin.attentes.map((a) => [a.id, a.nature]),
      [[tachePitch.id, "proposition"]],
    );
    // Un pitch ne se lit pas d'un lecteur sur son écran : il ne lui est pas annoncé.
    assert.deepEqual((await lireAttentes(lecteur, projet.id, LECTEUR)).attentes, []);
  });

  it("une nouvelle demande cache la proposition qui la précède, même une fois annulée", async () => {
    const suivante = await engager(porteur, projet.id, "logline", "attente-pitch-2");
    let lu = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(
      lu.attentes.map((a) => [a.id, a.nature]),
      [[suivante.id, "en_file"]],
    );
    const { error } = await porteur.client.rpc("annuler_travail", { p_job_id: suivante.id });
    assert.ifError(error);
    lu = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(lu.attentes, []);
    // L'ancienne proposition est toujours « proposée » en base : c'est la règle
    // de l'écran, pas la base, qui la tait.
    const { data } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("job_id", tachePitch.id)
      .single();
    assert.equal(data.state, "proposed");
  });

  it("des épisodes proposés se lisent de toute l'équipe, jusqu'à ce que tout soit décidé", async () => {
    const tacheEpisodes = await engager(porteur, projet.id, "episode_list", "attente-episodes-1");
    const nettoyage = await sql(annulerLesAutresTaches([tacheEpisodes.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    // FOURNISSEUR FACTICE : deux épisodes écrits par le test.
    const fournisseur = async () => ({
      texte: JSON.stringify({
        lines: [
          { title: "Le filet", summary: "Awa perd son filet." },
          { title: "La dette", summary: "La mareyeuse réclame son dû." },
        ],
      }),
      arret: "fin",
      modeleServi: OPUS,
      repli: false,
      usages: [{ modele: OPUS, jetonsEntree: 1500, jetonsSortie: 600 }],
    });
    assert.equal(
      await traiterUnTravail({
        base,
        nom: "attente-test",
        executeurs: executeursScript(base, fournisseur),
        journal: () => {},
        battementMs: 50,
      }),
      true,
    );

    for (const [compte, contexte] of [
      [porteur, TOUT],
      [lecteur, LECTEUR],
    ]) {
      const { attentes } = await lireAttentes(compte, projet.id, contexte);
      assert.deepEqual(
        attentes.map((a) => [a.id, a.nature, a.chemin]),
        [[tacheEpisodes.id, "proposition", "/episodes#assistant-episodes"]],
      );
    }

    // Une ligne décidée sur deux : la proposition attend encore.
    const { data: lignes } = await porteur.client
      .from("ai_suggestion_episodes")
      .select("id")
      .eq("project_id", projet.id)
      .order("position");
    assert.ifError(
      (await porteur.client.rpc("accepter_episode_propose", { p_line_id: lignes[0].id })).error,
    );
    assert.equal((await lireAttentes(lecteur, projet.id, LECTEUR)).attentes.length, 1);
    // La dernière décidée : la base clôt le parent, et plus rien n'attend.
    assert.ifError(
      (await porteur.client.rpc("ecarter_episode_propose", { p_line_id: lignes[1].id })).error,
    );
    assert.deepEqual((await lireAttentes(porteur, projet.id, TOUT)).attentes, []);
    assert.deepEqual((await lireAttentes(lecteur, projet.id, LECTEUR)).attentes, []);
  });

  it("la lecture ne rapporte que la cible d'une demande, pas ce que l'équipe a écrit", async () => {
    const { data: episode, error } = await porteur.client
      .from("project_episodes")
      .insert({ project_id: projet.id, number: 9, title: "La crue", created_by: porteur.id })
      .select("id")
      .single();
    assert.ifError(error);
    const { data: scenario, error: refus } = await porteur.client
      .from("project_documents")
      .insert({
        project_id: projet.id,
        type: "scenario",
        title: "Scénario — épisode 9",
        content: "EXT. FLEUVE — JOUR",
        episode_id: episode.id,
      })
      .select("id")
      .single();
    assert.ifError(refus);

    const SECRET = "Awa retrouve son filet sur la berge, de nuit.";
    const sequence = await engager(porteur, projet.id, "screenplay", "attente-sequence-1", {
      sequences: 1,
      sequence: SECRET,
      episode: episode.id,
    });
    const lu = await lireAttentes(porteur, projet.id, TOUT);
    assert.ok(!JSON.stringify(lu.taches).includes("retrouve son filet"));
    const [attente] = lu.attentes.filter((a) => a.id === sequence.id);
    assert.deepEqual(
      [attente.nature, attente.cible, attente.chemin],
      ["en_file", "Scénario — épisode 9", `/documents/${scenario.id}#assistant-screenplay`],
    );

    // Scénario détaché : la demande reste listée, sans lien mort.
    assert.ifError(
      (
        await porteur.client
          .from("project_documents")
          .update({ episode_id: null })
          .eq("id", scenario.id)
      ).error,
    );
    const apres = await lireAttentes(porteur, projet.id, TOUT);
    assert.deepEqual(
      apres.attentes.filter((a) => a.id === sequence.id).map((a) => [a.cible, a.chemin]),
      [["Épisode retiré, ou scénario détaché", null]],
    );
    await porteur.client.rpc("annuler_travail", { p_job_id: sequence.id });
  });
});
