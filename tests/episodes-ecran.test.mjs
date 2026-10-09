/**
 * Épisodes d'une série (lot SE1) : les règles de l'écran, l'accord de leurs
 * bornes avec la base, et ce que lisent la page, ses actions et la fiche.
 *
 * Les règles sont un module pur ; les pages, les actions et la migration sont
 * lues comme du texte. Aucune base, aucun fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AIDE_EPISODES,
  decompteEpisodes,
  DUREE_EPISODE,
  dureeEpisode,
  ERREURS_EPISODE,
  estSerie,
  FORMATS_SERIE,
  libelleEpisode,
  LONGUEURS_EPISODE,
  messageEpisode,
  normaliserEpisode,
  NUMERO_EPISODE,
  numeroSuivant,
} from "../src/lib/episodes.ts";
import { DUREE_MINUTES } from "../src/lib/fiche.ts";
import { descriptionDe } from "../src/lib/journal-administration.ts";
import { ongletsDuProjet } from "../src/lib/onglets-projet.ts";
import { FORMATS } from "../src/lib/projets.ts";

const DOSSIER = "src/app/(app)/projets/[id]/episodes";
const MIGRATION = "supabase/migrations/20261009120000_episodes.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const sansCommentairesSql = (source) => source.replace(/^\s*--.*$/gm, "");

const SAISIE = {
  number: " 3 ",
  title: "  Le   filet ",
  summary: "Première ligne.\r\nSeconde ligne.  ",
  duration_minutes: "26",
};
const lu = (surcharge = {}) => normaliserEpisode({ ...SAISIE, ...surcharge });

describe("Épisodes : ce qu'est une série", () => {
  it("deux formats, ceux de la base, et aucun autre", () => {
    assert.deepEqual([...FORMATS_SERIE], ["serie", "web_serie"]);
    for (const format of Object.keys(FORMATS)) {
      assert.equal(estSerie(format), FORMATS_SERIE.includes(format), format);
    }
    for (const valeur of [null, undefined, "", "Série", "serie "]) {
      assert.equal(estSerie(valeur), false, String(valeur));
    }
    const migration = sansCommentairesSql(lire(MIGRATION));
    assert.equal(migration.match(/in \('serie', 'web_serie'\)/g).length, 2);
  });
});

describe("Épisodes : lecture du formulaire", () => {
  it("rend des valeurs nettes : numéro et durée en nombres, espaces resserrés", () => {
    assert.deepEqual(lu(), {
      episode: {
        number: 3,
        title: "Le filet",
        summary: "Première ligne.\nSeconde ligne.",
        duration_minutes: 26,
      },
    });
  });

  it("ce que l'équipe ne dit pas reste vide, et non inventé", () => {
    assert.deepEqual(lu({ summary: "", duration_minutes: "" }).episode, {
      number: 3,
      title: "Le filet",
      summary: "",
      duration_minutes: null,
    });
    assert.equal(lu({ summary: undefined, duration_minutes: undefined }).episode.summary, "");
  });

  it("refuse tout ce que la base refuserait, en nommant le champ", () => {
    for (const [raison, surcharge, attendu] of [
      ["numéro vide", { number: "" }, /numéro d'un épisode/],
      ["numéro nul", { number: "0" }, /de 1 à 500/],
      ["numéro trop grand", { number: "501" }, /de 1 à 500/],
      ["numéro décimal", { number: "1,5" }, /nombre entier/],
      ["numéro négatif", { number: "-1" }, /nombre entier/],
      ["numéro en lettres", { number: "un" }, /nombre entier/],
      // Ce que `Number` lirait comme un nombre, et qui n'en est pas un à l'écran.
      ["numéro en notation scientifique", { number: "1e2" }, /nombre entier/],
      ["numéro hexadécimal", { number: "0x10" }, /nombre entier/],
      ["numéro à virgule nulle", { number: "3.0" }, /nombre entier/],
      ["durée en notation scientifique", { duration_minutes: "1e2" }, /minutes entières/],
      ["numéro qui n'est pas un texte", { number: 3 }, /numéro d'un épisode/],
      ["titre vide", { title: "   " }, /Donnez un titre/],
      ["titre absent", { title: undefined }, /Donnez un titre/],
      ["titre trop long", { title: "t".repeat(201) }, /200 caractères/],
      ["caractère de contrôle dans le titre", { title: "Le\u0007filet" }, /sur une ligne/],
      ["résumé trop long", { summary: "r".repeat(2001) }, /Le résumé/],
      ["tabulation dans le résumé", { summary: "a\tb" }, /Le résumé/],
      ["durée nulle", { duration_minutes: "0" }, /de 1 à 1000/],
      ["durée démesurée", { duration_minutes: "1001" }, /de 1 à 1000/],
      ["durée décimale", { duration_minutes: "26,5" }, /minutes entières/],
    ]) {
      const resultat = lu(surcharge);
      assert.ok("erreur" in resultat, raison);
      assert.match(resultat.erreur, attendu, raison);
    }
    // Les bornes elles-mêmes sont admises.
    assert.equal(lu({ number: "1" }).episode.number, 1);
    assert.equal(lu({ number: "500" }).episode.number, 500);
    assert.equal(lu({ title: "t".repeat(200) }).episode.title.length, 200);
    assert.equal(lu({ duration_minutes: "1000" }).episode.duration_minutes, 1000);
  });

  it("les bornes sont celles de la base, et la durée celle d'un projet", () => {
    const migration = sansCommentairesSql(lire(MIGRATION));
    assert.match(
      migration,
      new RegExp(`number between ${NUMERO_EPISODE.min} and ${NUMERO_EPISODE.max}\\)`),
    );
    assert.match(
      migration,
      new RegExp(`char_length\\(btrim\\(title\\)\\) between 1 and ${LONGUEURS_EPISODE.title} `),
    );
    assert.match(
      migration,
      new RegExp(`char_length\\(summary\\) <= ${LONGUEURS_EPISODE.summary}\\)`),
    );
    assert.match(
      migration,
      new RegExp(`duration_minutes between ${DUREE_EPISODE.min} and ${DUREE_EPISODE.max}\\)`),
    );
    assert.deepEqual({ ...DUREE_EPISODE }, { ...DUREE_MINUTES });
  });
});

describe("Épisodes : ce que l'écran en dit", () => {
  it("propose le numéro qui suit le plus grand, pas le premier trou", () => {
    assert.equal(numeroSuivant([]), 1);
    assert.equal(numeroSuivant([1, 2, 3]), 4);
    assert.equal(numeroSuivant([3, 1]), 4);
    assert.equal(numeroSuivant([7]), 8);
    // À la borne, rien n'est proposé : à l'équipe de choisir un numéro libre.
    assert.equal(numeroSuivant([499]), 500);
    assert.equal(numeroSuivant([1, 500]), null);
  });

  it("l'épisode 1 se présente comme le pilote, et lui seul", () => {
    assert.equal(libelleEpisode(1), "Épisode 1 — pilote");
    assert.equal(libelleEpisode(2), "Épisode 2");
    assert.equal(libelleEpisode(10), "Épisode 10");
    assert.match(AIDE_EPISODES, /Une seule saison par projet/);
    assert.match(AIDE_EPISODES, /l'épisode 1 est présenté comme le pilote/);
  });

  it("une durée et un décompte s'accordent ; une durée absente ne s'invente pas", () => {
    assert.equal(dureeEpisode(26), "26 minutes");
    assert.equal(dureeEpisode(1), "1 minute");
    assert.equal(dureeEpisode(null), null);
    assert.equal(decompteEpisodes(0), "Aucun épisode");
    assert.equal(decompteEpisodes(1), "Un épisode");
    assert.equal(decompteEpisodes(8), "8 épisodes");
  });

  it("chaque refus de la base a son message, sans rien dire de plus", () => {
    assert.match(messageEpisode(ERREURS_EPISODE.refus), /pas le droit de modifier ce projet/);
    assert.match(messageEpisode(ERREURS_EPISODE.doublon), /porte déjà ce numéro/);
    assert.match(messageEpisode(ERREURS_EPISODE.horsSerie), /réservés aux projets de série/);
    assert.match(messageEpisode(ERREURS_EPISODE.formatAvecEpisodes), /retirez-les avant/);
    for (const code of [undefined, "", "23514", "XX000"]) {
      assert.match(messageEpisode(code), /L'enregistrement a échoué/, String(code));
    }
    // Les codes de l'écran sont ceux que la base lève.
    const migration = sansCommentairesSql(lire(MIGRATION));
    assert.match(migration, new RegExp(`errcode = '${ERREURS_EPISODE.horsSerie}'`));
    assert.match(migration, new RegExp(`errcode = '${ERREURS_EPISODE.formatAvecEpisodes}'`));
  });
});

describe("Épisodes : la migration", () => {
  const migration = sansCommentairesSql(lire(MIGRATION));

  it("la table naît protégée : RLS, mode privé, administrateurs", () => {
    assert.match(migration, /alter table public\.project_episodes enable row level security;/);
    assert.match(migration, /on public\.project_episodes\s+as restrictive\s+for all/);
    assert.match(
      migration,
      /using \(not \(select public\.mode_prive\(\)\) or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(
      migration,
      /public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)/,
    );
    assert.equal(migration.match(/public\.peut_editer_contenu\(project_id\)/g).length, 4);
  });

  it("les droits sont accordés colonne par colonne ; rien au visiteur", () => {
    assert.match(
      migration,
      /revoke all on table public\.project_episodes from anon, authenticated;/,
    );
    assert.match(
      migration,
      /grant insert \(project_id, number, title, summary, duration_minutes, created_by\)\s+on table public\.project_episodes to authenticated;/,
    );
    assert.match(
      migration,
      /grant update \(number, title, summary, duration_minutes\)\s+on table public\.project_episodes to authenticated;/,
    );
    assert.doesNotMatch(migration, /to anon|filmfund_worker|disable row level/);
  });

  it("les deux fonctions retirent leurs droits ; une seule est privilégiée", () => {
    for (const fonction of ["refuser_episode_hors_serie", "garder_format_serie"]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${fonction}\\(\\) from public, anon, authenticated;`,
        ),
        fonction,
      );
    }
    assert.equal(migration.match(/security definer/g).length, 1);
    assert.match(
      migration,
      /function public\.garder_format_serie\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = pg_catalog, public/,
    );
  });

  it("le format n'est contrôlé que s'il change, et les épisodes ne sont jamais supprimés", () => {
    assert.match(
      migration,
      /before update of format on public\.projects\s+for each row\s+when \(old\.format is distinct from new\.format\)/,
    );
    assert.doesNotMatch(migration, /delete from public\.project_episodes/);
  });
});

describe("Épisodes : la page", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));

  it("le projet se lit sous la RLS ; un projet illisible ou qui n'est pas une série répond 404", () => {
    assert.match(page, /\.from\("projects"\)\.select\("id, title, format"\)\.eq\("id", id\)/);
    assert.match(page, /if \(!projet \|\| !estSerie\(projet\.format\)\) \{\s*notFound\(\)/);
    assert.ok(page.indexOf("notFound();\n  }\n\n  const { data, error }") > 0);
    assert.ok(page.lastIndexOf("notFound()") < page.indexOf('.from("project_episodes")'));
    assert.match(page, /if \(!UUID\.test\(id\)\) \{\s*notFound\(\)/);
  });

  it("le droit d'écrire vient de la fonction de la RLS, pas de l'écran", () => {
    assert.match(page, /supabase\.rpc\("peut_editer_contenu", \{ p_project_id: id \}\)/);
    assert.match(page, /const edite = peutEditer === true;/);
    assert.doesNotMatch(page, /SECRET|service_role|is_admin/);
  });

  it("un lecteur lit sans formulaire ni bouton", () => {
    assert.match(page, /\{edite && episode\.id === enModification \? \(/);
    assert.match(page, /\{edite \? \(\s*<div className="flex flex-wrap items-center gap-1">/);
    assert.match(page, /\{edite \? \(\s*<section\s+aria-labelledby="ajout-episode"/);
  });

  it("les épisodes se lisent dans l'ordre de la saison, bornés", () => {
    assert.match(
      page,
      /\.select\("id, number, title, summary, duration_minutes"\)\s*\.eq\("project_id", id\)\s*\.order\("number"\)\s*\.limit\(NUMERO_EPISODE\.max\)/,
    );
  });

  it("la page dit ce qui manque, sans l'inventer, et annonce le décompte", () => {
    assert.match(
      page,
      /dureeEpisode\(episode\.duration_minutes\) \?\? "Information non fournie\."/,
    );
    assert.match(page, /Résumé non fourni\./);
    assert.match(page, /<p role="status"[^>]*>\s*\{decompteEpisodes\(episodes\.length\)\}\./);
    assert.match(page, /\{AIDE_EPISODES\}/);
    assert.match(page, /\{libelleEpisode\(episode\.number\)\}/);
  });

  it("retirer un épisode demande une confirmation, qui dit ce qui sera perdu", () => {
    assert.match(page, /<BoutonConfirme\s+action=\{supprimerEpisode\}/);
    assert.match(page, /champs=\{\{ projet: id, episode: episode\.id \}\}/);
    assert.match(page, /Son résumé sera perdu\./);
  });

  it("le formulaire d'ajout repart du numéro suivant après chaque ajout", () => {
    assert.match(
      page,
      /const propose = numeroSuivant\(episodes\.map\(\(episode\) => episode\.number\)\);/,
    );
    assert.match(page, /key=\{`ajout-\$\{propose \?\? "plein"\}`\}/);
    assert.match(page, /numeroPropose=\{propose\}/);
  });

  it("la page se range sous l'onglet « Fiche » : la barre du projet ne change pas", () => {
    assert.match(
      page,
      /<OngletsProjet projetId=\{id\} actif="fiche" budget=\{budget === true\} \/>/,
    );
    const cles = ongletsDuProjet("p1", { budget: true }).map((onglet) => onglet.cle);
    assert.ok(!cles.includes("episodes"));
  });

  it("aucun appel à un modèle, aucune écriture depuis la page", () => {
    assert.doesNotMatch(page, /creer_devis|ai_suggestions|jobs|"use client"|"use server"/);
    assert.doesNotMatch(page, /\.(insert|update|upsert|delete)\(/);
  });
});

describe("Épisodes : les actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions.ts`));
  const corpsDe = (nom) => {
    const debut = source.indexOf(`export async function ${nom}(`);
    const suite = source.indexOf("export async function ", debut + 1);
    return source.slice(debut, suite < 0 ? undefined : suite);
  };

  it("chaque action vérifie les identifiants, puis la session, avant d'écrire", () => {
    assert.match(source, /^"use server";/);
    for (const nom of ["ajouterEpisode", "modifierEpisode", "supprimerEpisode"]) {
      const corps = corpsDe(nom);
      const identifiants = corps.indexOf("UUID.test(projetId)");
      const garde = corps.indexOf("exigerAcces(supabase)");
      const ecriture = corps.indexOf('.from("project_episodes")');
      assert.ok(
        identifiants >= 0 && garde > identifiants && ecriture > garde,
        `${nom} : identifiants, session, puis écriture`,
      );
    }
  });

  it("ce qui s'écrit est ce que la lecture a rendu, et rien d'autre du formulaire", () => {
    assert.match(
      corpsDe("ajouterEpisode"),
      /\.\.\.lu\.episode,\s+project_id: projetId,\s+created_by: garde\.user\.id,/,
    );
    assert.match(
      corpsDe("modifierEpisode"),
      /\.update\(lu\.episode\)\s+\.eq\("id", episodeId\)\s+\.eq\("project_id", projetId\)/,
    );
    assert.doesNotMatch(source, /fromEntries|\.(insert|update)\(formData/);
    for (const champ of ["number", "title", "summary", "duration_minutes"]) {
      assert.match(source, new RegExp(`${champ}: formData\\.get\\("${champ}"\\)`), champ);
    }
  });

  it("une modification sans effet se dit comme un refus : la RLS ne lève pas d'erreur", () => {
    assert.match(
      corpsDe("modifierEpisode"),
      /if \(!data\?\.length\) return \{ erreur: messageEpisode\(ERREURS_EPISODE\.refus\) \};/,
    );
  });

  it("un retrait vise l'épisode du projet nommé, sous la RLS", () => {
    assert.match(
      corpsDe("supprimerEpisode"),
      /\.delete\(\)\.eq\("id", episodeId\)\.eq\("project_id", projetId\)/,
    );
  });

  it("aucun accès privilégié, aucun appel à un fournisseur", () => {
    assert.doesNotMatch(source, /SECRET|service_role|clientDeService|rpc\(|fetch\(/);
    assert.match(source, /revalidatePath\(`\/projets\/\$\{projetId\}\/episodes`\)/);
    assert.match(source, /revalidatePath\(`\/projets\/\$\{projetId\}\/fiche`\)/);
  });
});

describe("Épisodes : le formulaire", () => {
  const formulaire = lire(`${DOSSIER}/formulaire.tsx`);

  it("quatre champs, bornés comme la base, chacun étiqueté", () => {
    for (const [nom, suffixe] of [
      ["number", "numero"],
      ["title", "titre"],
      ["duration_minutes", "duree"],
    ]) {
      assert.match(
        formulaire,
        new RegExp(`name="${nom}"\\s+id=\\{\`\\$\\{p\\}-${suffixe}\`\\}`),
        nom,
      );
    }
    assert.match(formulaire, /<label htmlFor=\{`\$\{p\}-resume`\}/);
    assert.match(formulaire, /name="summary"/);
    assert.match(formulaire, /maxLength=\{LONGUEURS_EPISODE\.title\}/);
    assert.match(formulaire, /maxLength=\{LONGUEURS_EPISODE\.summary\}/);
    assert.match(formulaire, /aria-describedby=\{`\$\{p\}-resume-aide`\}/);
  });

  it("les identifiants sont préfixés : ajout et modification coexistent sur la page", () => {
    assert.match(
      formulaire,
      /const p = episode \? `episode-\$\{episode\.id\}` : "nouvel-episode";/,
    );
  });

  it("le numéro proposé n'est qu'une valeur par défaut", () => {
    assert.match(
      formulaire,
      /defaultValue=\{\(episode\?\.number \?\? numeroPropose\)\?\.toString\(\)\}/,
    );
  });
});

describe("Épisodes : la fiche et le journal", () => {
  const fiche = sansCommentaires(lire("src/app/(app)/projets/[id]/fiche/page.tsx"));

  it("la fiche d'une série mène à ses épisodes ; celle d'un film n'en dit rien", () => {
    assert.match(
      fiche,
      /\{estSerie\(projet\.format\) \? \(\s*<section aria-labelledby="fiche-episodes"/,
    );
    assert.match(fiche, /href=\{`\/projets\/\$\{id\}\/episodes`\}/);
    assert.match(fiche, /\{peutEditer \? "Gérer" : "Voir"\}/);
  });

  it("la fiche compte les épisodes sans les rapatrier", () => {
    assert.match(
      fiche,
      /\.from\("project_episodes"\)\s*\.select\("id", \{ count: "exact", head: true \}\)\s*\.eq\("project_id", id\)/,
    );
    assert.match(fiche, /episodes === null \? NON_FOURNI : `\$\{decompteEpisodes\(episodes\)\}\.`/);
  });

  it("une intervention de l'administration sur les épisodes se lit au journal", () => {
    const phrase = descriptionDe(
      {
        action: "intervention_contenu",
        project_id: "p1",
        details: { table: "project_episodes", operation: "insert" },
      },
      { projets: new Map([["p1", "Les Marées"]]), comptes: new Map() },
    );
    assert.match(phrase, /les épisodes du projet « Les Marées »/);
  });
});

describe("Épisodes : le format d'un projet qui en a", () => {
  const ACTIONS = {
    "l'assistant de création": "src/app/(app)/projets/[id]/assistant/actions.ts",
    "le formulaire du projet": "src/app/(app)/projets/actions.ts",
  };

  it("les deux écrans qui changent le format disent pourquoi la base refuse", () => {
    for (const [ecran, chemin] of Object.entries(ACTIONS)) {
      const source = sansCommentaires(lire(chemin));
      const ecriture = source.indexOf('.from("projects")\n    .update(');
      assert.ok(ecriture > 0, `${ecran} : écriture du projet introuvable`);
      const suite = source.slice(ecriture, ecriture + 700);
      assert.match(
        suite,
        /if \(error\) \{\s+return \{\s+erreur:\s+error\.code === ERREURS_EPISODE\.formatAvecEpisodes\s*\? messageEpisode\(error\.code\)\s*: /,
        ecran,
      );
      assert.match(
        source,
        /import \{ ERREURS_EPISODE, messageEpisode \} from "@\/lib\/episodes";/,
        ecran,
      );
    }
  });

  it("tout autre refus garde le message générique : rien d'autre n'est révélé", () => {
    for (const [ecran, chemin] of Object.entries(ACTIONS)) {
      const source = sansCommentaires(lire(chemin));
      // Le message de la base n'est jamais rendu tel quel.
      assert.doesNotMatch(source, /error\.message|error\.details|error\.hint/, ecran);
      assert.equal(source.match(/messageEpisode\(/g).length, 1, ecran);
    }
    assert.match(
      messageEpisode(ERREURS_EPISODE.formatAvecEpisodes),
      /retirez-les avant de changer son format/,
    );
  });
});
