/**
 * Épisodes proposés par SCRIPT (lot SE2b) : ce que l'écran compte et annonce,
 * et ce que ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page et
 * l'encart sont lus comme du texte : leur parcours complet se vérifie dans le
 * navigateur, et les droits eux-mêmes par les tests de la base et du worker.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { NUMERO_EPISODE } from "../src/lib/episodes.ts";
import {
  bilanEpisodes,
  ERREURS_BASE,
  estActionIa,
  estActionStructuree,
  LIVRABLE_EPISODES,
  LIVRABLE_PERSONNAGES,
  messageLotEpisodes,
  nombreEpisodes,
} from "../src/lib/propositions.ts";
import { PROFIL_EPISODES, PROFILS_SCRIPT_EPISODES } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/episodes";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
/** Espaces et retours à la ligne resserrés : la mise en forme ne décide pas d'un test. */
const aPlat = (source) => source.replace(/\s+/g, " ");

describe("Épisodes proposés : catalogue, bilan et accords", () => {
  it("l'écran propose exactement ce que SCRIPT sait proposer, à la même borne", () => {
    assert.deepEqual(Object.keys(PROFILS_SCRIPT_EPISODES), [LIVRABLE_EPISODES.action]);
    assert.equal(LIVRABLE_EPISODES.lignesMax, PROFIL_EPISODES.lignesMax);
    // Ni un texte de l'assistant, ni un livrable de FIELD : un encart à part.
    assert.equal(estActionIa(LIVRABLE_EPISODES.action), false);
    assert.equal(estActionStructuree(LIVRABLE_EPISODES.action), false);
    assert.notEqual(LIVRABLE_EPISODES.action, LIVRABLE_PERSONNAGES.action);
  });

  it("compte ce qui attend, ce qui est entré dans la saison et ce qui est écarté", () => {
    assert.deepEqual(bilanEpisodes([]), { enAttente: 0, acceptes: 0, ecartes: 0 });
    assert.deepEqual(
      bilanEpisodes([
        { state: "proposed" },
        { state: "accepted" },
        { state: "accepted" },
        { state: "dismissed" },
        // Un état inconnu attend une décision : il ne passe pas pour accepté.
        { state: "autre" },
      ]),
      { enAttente: 2, acceptes: 2, ecartes: 1 },
    );
  });

  it("accorde les épisodes, et dit combien sont passés après « tout accepter »", () => {
    assert.equal(nombreEpisodes(0), "0 épisode");
    assert.equal(nombreEpisodes(1), "1 épisode");
    assert.equal(nombreEpisodes(12), "12 épisodes");
    assert.equal(messageLotEpisodes(1, 1), "1 épisode ajouté à la saison.");
    assert.equal(messageLotEpisodes(3, 3), "3 épisodes ajoutés à la saison.");
    assert.equal(
      messageLotEpisodes(0, 3),
      "Aucun épisode n'a pu être ajouté. Réessayez dans un instant.",
    );
    assert.equal(
      messageLotEpisodes(1, 3),
      "1 épisode sur 3 ajouté à la saison ; les autres attendent toujours votre décision.",
    );
    assert.equal(
      messageLotEpisodes(2, 3),
      "2 épisodes sur 3 ajoutés à la saison ; les autres attendent toujours votre décision.",
    );
  });
});

describe("Épisodes proposés : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-ia.ts`));
  const fonctions = source.split("\nexport async function ").slice(1);
  const corps = (nom) => {
    const fonction = fonctions.find((f) => f.startsWith(`${nom}(`));
    assert.ok(fonction, `${nom} introuvable`);
    return fonction;
  };

  it("les sept actions attendues, et rien d'autre", () => {
    assert.match(source, /^"use server";/);
    assert.deepEqual(
      fonctions.map((f) => f.slice(0, f.indexOf("("))),
      [
        "demanderDevisEpisodes",
        "lancerPropositionEpisodes",
        "annulerPropositionEpisodes",
        "accepterEpisodePropose",
        "ecarterEpisodePropose",
        "accepterEpisodesRestants",
        "ecarterEpisodesRestants",
      ],
    );
  });

  it("chaque action contrôle chacun de ses identifiants et exige une session avant d'appeler la base", () => {
    for (const fonction of fonctions) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const signature = fonction.slice(0, fonction.indexOf("): Promise<"));
      const identifiants = [...signature.matchAll(/(\w+): string/g)].map((m) => m[1]);
      assert.ok(identifiants.length >= 1, `${nom} : lecture de la signature`);
      for (const identifiant of identifiants) {
        assert.ok(fonction.includes(`UUID.test(${identifiant})`), `${nom} : ${identifiant}`);
      }
      const controle = fonction.indexOf("UUID.test(");
      const garde = fonction.indexOf("await session()");
      const appel = fonction.search(/\.rpc\(/);
      assert.ok(garde > controle, `${nom} : la session suit le contrôle`);
      assert.ok(appel > garde, `${nom} : la base n'est appelée qu'après la garde`);
    }
    assert.match(source, /const garde = await exigerAcces\(supabase\);/);
  });

  it("le navigateur ne choisit ni l'action, ni le modèle, ni les paramètres du devis, ni le numéro", () => {
    assert.match(corps("demanderDevisEpisodes"), /p_action: ACTION,\s+p_params: \{\},/);
    assert.match(source, /const ACTION = LIVRABLE_EPISODES\.action;/);
    assert.doesNotMatch(source, /modele|profil|jetons|claude-/i);
    assert.match(corps("lancerPropositionEpisodes"), /!UUID\.test\(cle\)/);
    // Ce qui part à l'acceptation : la ligne, et au plus un titre et un résumé.
    assert.match(
      corps("accepterEpisodePropose"),
      /corrige = \{ title: lu\.episode\.title, summary: lu\.episode\.summary \};/,
    );
    assert.doesNotMatch(source, /p_number|p_numero|duration_minutes: saisie/);
  });

  it("un épisode corrigé passe par la lecture d'un épisode saisi avant la base", () => {
    const acceptation = corps("accepterEpisodePropose");
    assert.match(
      aPlat(acceptation),
      /normaliserEpisode\(\{ number: String\(NUMERO_EPISODE\.min\), title: saisie\.titre, summary: saisie\.resume, duration_minutes: "", \}\)/,
    );
    assert.match(acceptation, /if \("erreur" in lu\) \{\s+return lu;/);
    // Sans correction, aucun champ n'est envoyé : la base retient la proposition.
    assert.match(acceptation, /\.\.\.\(corrige \? \{ p_corrige: corrige \} : \{\}\),/);
    assert.ok(acceptation.indexOf("normaliserEpisode(") < acceptation.indexOf(".rpc("));
  });

  it("une saison pleine est dite avant d'appeler la base, et reconnue quand c'est elle qui le dit", () => {
    for (const nom of ["accepterEpisodePropose", "accepterEpisodesRestants"]) {
      const fonction = corps(nom);
      const libres = fonction.indexOf("await numerosLibres(acces.supabase, projetId)");
      assert.ok(libres > 0, nom);
      assert.ok(libres < fonction.indexOf('.rpc("accepter_episode_propose"'), nom);
    }
    assert.match(source, /return NUMERO_EPISODE\.max - \(data\?\.number \?\? 0\);/);
    assert.match(source, /\.order\("number", \{ ascending: false \}\)\s+\.limit\(1\)/);
    assert.match(source, /code === ERREURS_BASE\.listePleine/);
    assert.match(corps("demanderDevisEpisodes"), /messageDe\(error\?\.code, error\?\.message\)/);
    assert.match(corps("accepterEpisodePropose"), /messageDe\(error\.code, error\.message\)/);
    assert.equal(ERREURS_BASE.listePleine, "PR003");
    assert.ok(source.includes("${NUMERO_EPISODE.max}"));
    assert.equal(NUMERO_EPISODE.max, 500);
  });

  it("un projet qui n'est pas une série a son message, et celui de la base n'est jamais rendu tel quel", () => {
    assert.match(source, /code === ERREURS_EPISODE\.horsSerie/);
    assert.match(source, /return messageEpisode\(ERREURS_EPISODE\.horsSerie\);/);
    assert.doesNotMatch(source, /erreur: error\??\.message|erreur: lecture\.message/);
    // Le message de la base ne sert qu'à reconnaître un refus, jamais à l'afficher.
    assert.equal(source.match(/message\?\.includes\(/g).length, 2);
  });

  it("« tout accepter » ne lit que ce qui attend, sous la RLS, borné, dans l'ordre, et dit ce qui est passé", () => {
    const lot = corps("accepterEpisodesRestants");
    assert.match(lot, /\.from\("ai_suggestion_episodes"\)/);
    assert.match(lot, /\.eq\("project_id", projetId\)/);
    assert.match(lot, /\.eq\("suggestion_id", propositionId\)/);
    assert.match(lot, /\.eq\("state", "proposed"\)/);
    // L'ordre de l'assistant devient l'ordre des numéros.
    assert.match(lot, /\.order\("position"\)\s+\.limit\(LIVRABLE_EPISODES\.lignesMax\)/);
    assert.match(lot, /messageLotEpisodes\(acceptes, episodes\.length\)/);
    // Le premier refus arrête le lot : les suivants gardent leur ordre.
    assert.match(lot, /if \(error\) \{\s+break;\s+\}/);
    // Aucune correction ne passe par le lot : chaque épisode tel que proposé.
    assert.doesNotMatch(lot, /p_corrige/);
  });

  it("aucune action n'écrit directement une table, ni ne modifie un épisode existant", () => {
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE|createAdminClient|fetch\(/);
    assert.deepEqual(
      [...new Set([...source.matchAll(/\.rpc\(\s*"(\w+)"/g)].map((m) => m[1]))].sort(),
      [
        "accepter_devis",
        "accepter_episode_propose",
        "annuler_travail",
        "creer_devis",
        "ecarter_episode_propose",
        "ecarter_proposition",
      ],
    );
    assert.match(source, /revalidatePath\(`\/projets\/\$\{projetId\}\/episodes`\)/);
    assert.match(source, /revalidatePath\(`\/projets\/\$\{projetId\}\/fiche`\)/);
  });
});

describe("Épisodes proposés : page et encart", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const encart = lire(`${DOSSIER}/episodes-proposes.tsx`);
  const encartNu = aPlat(sansCommentaires(encart));

  it("la page ne lit la demande qu'après le contrôle d'accès, pour une série lisible", () => {
    const acces = page.indexOf("if (!projet || !estSerie(projet.format)) {");
    const lecture = page.indexOf("await lireAssistant(supabase, id, edite)");
    assert.ok(acces > 0 && lecture > acces);
    assert.match(page, /const edite = peutEditer === true;/);
    // Un seul appel, quel que soit ce qu'on lui passe : aucun ne précède le contrôle.
    const appels = [...page.matchAll(/await lireAssistant\(/g)].map((m) => m.index);
    assert.equal(appels.length, 1);
    assert.ok(appels[0] > acces);
    // Ni tâche ni proposition ne sont lues ailleurs que dans cette lecture.
    const definition = page.indexOf("async function lireAssistant(");
    for (const table of ['"jobs"', '"ai_suggestions"', '"ai_suggestion_episodes"']) {
      assert.ok(page.indexOf(table) > definition, table);
    }
  });

  it("qui écrit les épisodes suit la demande ; un lecteur ne lit que la dernière proposition", () => {
    const lecture = page.slice(page.indexOf("async function lireAssistant("));
    const [ecrivain, lecteur] = lecture.split("} else {");
    assert.match(ecrivain, /if \(peutDecider\) \{/);
    assert.match(ecrivain, /\.from\("jobs"\)/);
    assert.match(ecrivain, /\.eq\("action", LIVRABLE_EPISODES\.action\)/);
    assert.match(ecrivain, /etapeProposition\(tache, proposition\)/);
    // Un lecteur ne lit aucune tâche : seulement ce qui est proposé à l'équipe.
    assert.doesNotMatch(lecteur.slice(0, lecteur.indexOf("if (etape.etape !==")), /"jobs"/);
    assert.match(lecteur, /if \(proposition\?\.state === "proposed"\) \{/);
    assert.match(lecteur, /\.eq\("action", LIVRABLE_EPISODES\.action\)/);
  });

  it("la page lit les lignes de la proposition, bornées, sans numéro ni durée", () => {
    assert.match(
      page,
      /\.from\("ai_suggestion_episodes"\)\s+\.select\("id, position, title, summary, state"\)\s+\.eq\("suggestion_id", etape\.propositionId\)\s+\.order\("position"\)\s+\.limit\(LIVRABLE_EPISODES\.lignesMax\)/,
    );
    assert.equal(page.match(/\.limit\(1\)/g).length, 2);
  });

  it("un lecteur ne voit l'encart que s'il y a quelque chose à lire, et sans rien pouvoir décider", () => {
    assert.match(
      page,
      /const montrerAssistant = edite \|\| assistant\.etape\.etape === "proposition";/,
    );
    assert.match(page, /\{montrerAssistant \? \(\s+<EpisodesProposes/);
    assert.match(page, /peutDecider=\{edite\}/);
    // Dans l'encart, chaque bouton est derrière ce droit.
    assert.match(
      encartNu,
      /const auRepos = peutDecider && \(etape\.etape === "repos" \|\| etape\.etape === "echec"\);/,
    );
    assert.match(encartNu, /\{peutDecider \? \( <div className="mt-3 flex flex-wrap/);
    assert.match(encartNu, /\{peutDecider && bilan\.enAttente > 0 \? \(/);
    assert.match(encartNu, /\) : peutDecider && episode\.id === enSaisie \? \(/);
    for (const etape of ["echec", "en_attente", "en_cours", "a_rapprocher"]) {
      assert.ok(encartNu.includes(`{peutDecider && etape.etape === "${etape}"`), etape);
    }
    assert.match(encart, /Ce que l'assistant a proposé à l'équipe\./);
  });

  it("la page se rafraîchit pendant l'attente, et seulement alors", () => {
    assert.match(
      page,
      /<RafraichissementPropositions\s+actif=\{assistant\.etape\.etape === "en_attente" \|\| assistant\.etape\.etape === "en_cours"\}/,
    );
  });

  it("l'encart est client, et n'affiche le texte venu du modèle que comme du texte", () => {
    assert.match(encart, /^"use client";/);
    assert.doesNotMatch(encart, /dangerouslySetInnerHTML|innerHTML|eval\(/);
    assert.match(encart, /\{episode\.title\}/);
    assert.match(encart, /\{episode\.summary\}/);
  });

  it("l'encart dit ce qui part chez le fournisseur avant tout envoi, et rien ne part sans devis ni confirmation", () => {
    assert.match(encart, /LIVRABLE_EPISODES\.description/);
    assert.match(LIVRABLE_EPISODES.description, /transmis pour cela à notre fournisseur d'IA/);
    assert.match(LIVRABLE_EPISODES.description, /bible de série si elle existe/);
    // Le premier bouton ne demande qu'un devis ; le lancement en exige un affiché.
    assert.match(encartNu, /onClick=\{obtenirDevis\}/);
    assert.match(
      encartNu,
      /lancerPropositionEpisodes\(projetId, demande\.devis\.id, demande\.cle\)/,
    );
    assert.match(
      encartNu,
      /Cette proposition compte \{unitesTexte\(demande\.devis\.quantite\)\}\./,
    );
    assert.match(encartNu, /Confirmer la demande/);
    assert.match(
      encartNu,
      /setDemande\(\{ devis: resultat\.devis, cle: crypto\.randomUUID\(\) \}\)/,
    );
  });

  it("l'encart dit l'avertissement, signale un homonyme sans rien refuser, et confirme « tout accepter »", () => {
    assert.match(encart, /\{LIVRABLE_EPISODES\.avertissement\}/);
    assert.match(encartNu, /dejaLa\.has\(cleDeNom\(episode\.title\)\)/);
    assert.match(encartNu, /sans toucher au premier/);
    assert.match(encartNu, /titresExistants=|titresExistants\.map\(cleDeNom\)/);
    // « Tout accepter » ne lance rien : il ouvre une confirmation, qui dit combien.
    assert.match(
      encartNu,
      /setConfirmation\(true\); \}\} className=\{BOUTON_PRINCIPAL\} > Tout accepter/,
    );
    assert.match(encartNu, /`Ajouter \$\{nombreEpisodes\(bilan\.enAttente\)\} à la saison`/);
    assert.match(encartNu, /Écarter le reste/);
  });

  it("la correction reprend les bornes d'un épisode saisi, et chaque champ a son étiquette", () => {
    assert.match(encart, /maxLength=\{LONGUEURS_EPISODE\.title\}/);
    assert.match(encart, /maxLength=\{LONGUEURS_EPISODE\.summary\}/);
    assert.match(encart, /<label htmlFor=\{`\$\{id\}-titre`\}/);
    assert.match(encart, /<label htmlFor=\{`\$\{id\}-resume`\}/);
    assert.match(encart, /const id = `correction-\$\{episode\.id\}`;/);
    // Ni numéro ni durée ne se saisissent ici : la base numérote, l'équipe date ensuite.
    assert.doesNotMatch(encart, /name="number"|duration|numero/i);
  });

  it("un épisode déjà décidé se lit tel que proposé, sans bouton", () => {
    assert.match(encartNu, /\{episode\.state !== "proposed" \? \( <div className="opacity-70">/);
    assert.match(encartNu, /"Ajouté à la saison, tel quel ou corrigé" : "Écarté"/);
  });
});
