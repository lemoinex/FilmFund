/**
 * La séquence d'un épisode (lot SE3b) : ce que l'écran en dit, ce que ses
 * actions vérifient, et l'accord entre l'écran et la base sur le scénario
 * visé.
 *
 * Les règles sont un module pur ; les pages, les actions et la migration sont
 * lues comme du texte. Aucune base, aucun fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ERREURS_BASE, messageErreur } from "../src/lib/propositions.ts";

const MIGRATION = "supabase/migrations/20261010120000_sequence_episode.sql";
const PROJET = "src/app/(app)/projets/[id]";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
/** Sans commentaires, espaces resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ");
const sansCommentairesSql = (source) => source.replace(/^\s*--.*$/gm, "");
const fonctionSql = (source, nom) => {
  const debut = source.indexOf(`create or replace function public.${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  return source.slice(debut, source.indexOf("\n$$;", debut));
};
const corpsDe = (source, nom) => {
  const debut = source.indexOf(`export async function ${nom}(`);
  assert.ok(debut >= 0, `${nom} introuvable`);
  const suite = source.indexOf("export ", debut + 1);
  return source.slice(debut, suite < 0 ? undefined : suite);
};

describe("Séquence d'un épisode : ce que l'écran en dit", () => {
  it("un épisode retiré a son message, qui dit quoi faire de la proposition", () => {
    assert.equal(ERREURS_BASE.episodeRetire, "SE004");
    const message = messageErreur(ERREURS_BASE.episodeRetire);
    assert.match(message, /L'épisode de cette séquence a été retiré/);
    assert.match(message, /Reportez-la à la main, ou écartez-la\./);
    assert.doesNotMatch(message, /SE004/);
    // Les autres codes de la série gardent le message générique.
    for (const code of ["SE001", "SE002", "SE003"]) {
      assert.notEqual(messageErreur(code), message, code);
    }
  });

  it("le code de l'écran est celui que la base lève, à l'acceptation seulement", () => {
    const migration = sansCommentairesSql(lire(MIGRATION));
    assert.equal(migration.split(`errcode = '${ERREURS_BASE.episodeRetire}'`).length - 1, 1);
    assert.match(
      fonctionSql(migration, "accepter_proposition"),
      new RegExp(`errcode = '${ERREURS_BASE.episodeRetire}'`),
    );
  });
});

describe("Séquence d'un épisode : la migration", () => {
  const migration = sansCommentairesSql(lire(MIGRATION));

  it("aucun schéma, aucun droit : trois fonctions reprises, et rien d'autre", () => {
    assert.deepEqual(
      [...migration.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]),
      ["creer_devis", "contexte_redaction", "accepter_proposition"],
    );
    assert.doesNotMatch(
      migration,
      /\b(create table|alter table|create policy|drop |grant |revoke |create index|create trigger)/i,
    );
    assert.equal(migration.split("security definer").length - 1, 3);
    assert.equal(migration.split("set search_path = pg_catalog, public").length - 1, 3);
  });

  it("le devis contrôle l'épisode avant toute réservation, dans le projet de la demande", () => {
    const devis = fonctionSql(migration, "creer_devis");
    const controle = devis.indexOf("Désignez un épisode de ce projet.");
    assert.ok(controle > 0);
    assert.ok(controle < devis.indexOf("insert into public."), "avant toute écriture");
    assert.match(
      devis,
      /e\.id::text = lower\(v_parametres ->> 'episode'\) and e\.project_id = p_project_id/,
    );
    assert.match(devis, /jsonb_typeof\(v_parametres -> 'episode'\) is distinct from 'string'/);
  });

  it("contexte et acceptation choisissent le même scénario", () => {
    const contexte = fonctionSql(migration, "contexte_redaction");
    const acceptation = fonctionSql(migration, "accepter_proposition");
    // L'épisode est relu dans le projet de la tâche, des deux côtés.
    assert.match(
      contexte,
      /where e\.id::text = lower\(v_job\.params ->> 'episode'\) and e\.project_id = v_projet\.id;/,
    );
    assert.match(
      acceptation,
      /where e\.id::text = lower\(v_parametres ->> 'episode'\)\s+and e\.project_id = v_proposition\.project_id;/,
    );
    // Sans épisode, « is not distinct from » ne retient que les scénarios sans épisode.
    assert.match(contexte, /and d\.episode_id is not distinct from v_episode\.id\n/);
    assert.match(
      acceptation,
      /and \(v_proposition\.action <> 'screenplay' or d\.episode_id is not distinct from v_episode\)\n/,
    );
    for (const corps of [contexte, acceptation]) {
      assert.match(corps, /order by d\.updated_at desc, d\.id\s+limit 1/);
    }
  });

  it("épisode retiré : rien ne part chez le fournisseur, rien n'est écrit ailleurs", () => {
    const contexte = fonctionSql(migration, "contexte_redaction");
    assert.match(contexte, /if v_episode\.id is null then\s+return null;\s+end if;/);
    const acceptation = fonctionSql(migration, "accepter_proposition");
    const refus = acceptation.indexOf("errcode = 'SE004'");
    assert.ok(refus > 0);
    // Le refus tombe avant le choix du document, donc avant toute écriture
    // d'une séquence.
    const choix = acceptation.indexOf("d.episode_id is not distinct from v_episode");
    assert.ok(refus < choix);
    assert.ok(choix < acceptation.indexOf("insert into public.project_documents"));
    assert.ok(choix < acceptation.indexOf("set content = v_final where id = v_document"));
  });

  it("le contexte de l'épisode est borné, et ne porte pas les scénarios des autres épisodes", () => {
    const contexte = fonctionSql(migration, "contexte_redaction");
    assert.match(contexte, /and not \(v_episode\.id is not null and d\.episode_id is not null\)/);
    assert.match(contexte, /left\(t\.summary, 300\)/);
    assert.match(contexte, /order by e\.number\s+limit 100/);
    assert.match(
      contexte,
      /'numero', v_episode\.number,\s+'titre', v_episode\.title,\s+'resume', v_episode\.summary/,
    );
  });
});

describe("Séquence d'un épisode : le worker", () => {
  it("le profil ne change pas, et ses blocs sont ceux que la base rend", () => {
    const agent = lire("worker/src/agents/weaver.ts");
    for (const balise of ['"<saison>"', '"<episode_a_ecrire>"']) {
      assert.equal(agent.split(balise).length - 1, 1, balise);
    }
    assert.ok(agent.indexOf('"<episode_a_ecrire>"') < agent.indexOf('"<scenario_deja_ecrit>"'));
    const base = lire("worker/src/base.ts");
    assert.match(base, /episode\?: \{ numero: number; titre: string; resume: string \} \| null;/);
    assert.match(
      base,
      /saison\?: \{ numero: number; titre: string; resume: string \}\[\] \| null;/,
    );
    const profils = lire("worker/src/ia/profils.ts");
    assert.match(profils, /id: "script\.scenario@1"/);
    assert.doesNotMatch(profils, /script\.scenario@2/);
  });
});

describe("Séquence d'un épisode : la demande", () => {
  const actions = aPlat(lire(`${PROJET}/actions-ia.ts`));
  const devis = corpsDe(actions, "demanderDevis");

  it("seule une séquence désigne un épisode, et son identifiant est validé", () => {
    assert.match(
      devis,
      /if \(episodeId !== undefined && \(action !== "screenplay" \|\| !UUID\.test\(episodeId\)\)\) \{ return DEMANDE_INVALIDE; \}/,
    );
    assert.ok(devis.indexOf("episodeId !== undefined") < devis.indexOf("await session()"));
    assert.match(devis, /\.\.\.\(episodeId \? \{ episode: episodeId \} : \{\}\),/);
    // L'épisode ne part qu'avec la description d'une séquence.
    assert.equal(devis.split("episode: episodeId").length - 1, 1);
    assert.match(devis, /sequences: 1, sequence: texte, \.\.\.\(episodeId/);
  });

  it("aucune action n'appelle un fournisseur, ni ne choisit un document", () => {
    assert.doesNotMatch(actions, /anthropic|openai|API_KEY|cle_fournisseur/i);
    assert.doesNotMatch(devis, /project_documents|project_episodes/);
  });
});

describe("Séquence d'un épisode : les encarts", () => {
  const lecture = aPlat(lire("src/lib/propositions-serveur.ts"));
  const documents = aPlat(lire(`${PROJET}/documents/page.tsx`));
  const editeur = aPlat(lire(`${PROJET}/documents/[documentId]/page.tsx`));
  const encart = aPlat(lire(`${PROJET}/proposition.tsx`));

  it("l'encart général ne suit que les demandes sans épisode, et ne montre qu'un scénario sans épisode", () => {
    assert.match(
      lecture,
      /if \(action === "screenplay"\) \{ requete = requete\.is\("params->>episode", null\); \}/,
    );
    assert.match(
      documents,
      /if \(action === "screenplay"\) \{ requete = requete\.is\("episode_id", null\); \}/,
    );
  });

  it("l'encart d'un épisode suit la demande de cet épisode, lue bornée", () => {
    const lire = corpsDe(lecture, "lireEtapeSequenceEpisode");
    assert.match(lire, /if \(!peutDemander\) \{ return REPOS; \}/);
    assert.match(lire, /\.eq\("project_id", projetId\)/);
    assert.match(lire, /\.eq\("action", "screenplay"\)/);
    assert.match(lire, /\.eq\("params->>episode", episodeId\)/);
    assert.match(lire, /\.limit\(1\)/);
  });

  it("l'encart ne se tient que sous le scénario d'un épisode, pour qui peut l'écrire", () => {
    assert.match(
      editeur,
      /const episode = peutEditer \? \(rattachement\?\.actuel \?\? null\) : null;/,
    );
    assert.match(
      editeur,
      /const sequence = episode \? await lireEtapeSequenceEpisode\(supabase, projet\.id, episode\.id, true\) : null;/,
    );
    assert.match(editeur, /\{episode && sequence \? \( <Proposition/);
    assert.match(
      editeur,
      /action="screenplay" episodeId=\{episode\.id\} contenuEnregistre=\{document\.content\}/,
    );
    // Appliquer reste au porteur et aux éditeurs, comme la base le veut.
    assert.match(editeur, /peutAppliquer=\{acces === "owner" \|\| acces === "editor"\}/);
    // Un seul rafraîchissement pour tous les encarts de la page.
    assert.equal(editeur.split("<RafraichissementPropositions").length - 1, 1);
    assert.match(
      editeur,
      /\) \|\| sequence\?\.etape === "en_attente" \|\| sequence\?\.etape === "en_cours" \}/,
    );
  });

  it("l'écran dit ce qui part, et ce qui ne part pas", () => {
    assert.match(editeur, /sans rien y remplacer/);
    assert.match(
      editeur,
      /L'assistant reçoit cet épisode, la liste des épisodes de la saison et la fin de ce scénario ; les scénarios des autres épisodes ne lui sont pas transmis\./,
    );
  });

  it("sous un éditeur, l'encart refuse d'agir sur un document non enregistré", () => {
    // Au devis comme à l'acceptation : sinon l'éditeur, qui garde son texte,
    // effacerait la séquence ajoutée à l'enregistrement suivant.
    assert.equal(encart.split("if (editeurModifie()) {").length - 1, 2);
    assert.match(encart, /if \(contenuEnregistre === undefined\) \{ return false; \}/);
    assert.match(
      encart,
      /champ\.value\.replaceAll\("\\r\\n", "\\n"\) !== contenuEnregistre\.replaceAll\("\\r\\n", "\\n"\)/,
    );
    const devis = encart.slice(encart.indexOf("function obtenirDevis()"));
    assert.ok(devis.indexOf("editeurModifie()") < devis.indexOf("demanderDevis("));
    const appliquer = encart.slice(encart.indexOf("onClick={() => { if (editeurModifie())"));
    assert.ok(appliquer.indexOf("editeurModifie()") < appliquer.indexOf("appliquerProposition("));
  });

  it("la page est rechargée après une acceptation, sous un éditeur seulement", () => {
    assert.match(
      encart,
      /contenuEnregistre === undefined \? undefined : \(\) => window\.location\.reload\(\),/,
    );
    assert.equal(encart.split("window.location.reload()").length - 1, 1);
  });

  it("l'épisode de la demande vient de la page, jamais d'une saisie", () => {
    assert.match(
      encart,
      /demanderDevis\( projetId, action, consigne \? saisie : undefined, episodeId, \)/,
    );
    assert.doesNotMatch(encart, /setEpisode|name="episode"/);
    // Les autres pages n'en désignent aucun.
    assert.doesNotMatch(documents, /episodeId=/);
  });
});
