/**
 * SCRIPT (lot SE2a) : les épisodes proposés, de la tâche réclamée à l'épisode
 * entré dans la saison, contre la base locale et sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : le FOURNISSEUR EST FACTICE, désigné comme tel, et
 * ses réponses sont écrites par le test. Il ne prouve pas que l'agent
 * fonctionne avec le vrai fournisseur, ni ce que valent les épisodes qu'il
 * propose, ni qu'il s'en tient à la bible : cela se vérifie en recette, dans
 * le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerContexteEpisodes,
  executeursScript,
  lireEpisodes,
} from "../worker/src/agents/script.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  PROFIL_EPISODES,
  PROFILS_ARC_PERSONNAGES,
  PROFILS_FIELD,
  PROFILS_FRAME,
  PROFILS_GEAR,
  PROFILS_IA,
  PROFILS_SCRIPT,
  PROFILS_SCRIPT_EPISODES,
} from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";

/** Réponse d'un fournisseur factice : le texte donné, facturé 1 500 jetons en entrée et 600 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1500, jetonsSortie: 600 }],
  };
}

/** Fournisseur factice : rejoue les réponses données, dans l'ordre, et note ce qu'on lui demande. */
function fournisseurFactice(...reponses) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    return reponses[Math.min(demandes.length, reponses.length) - 1];
  };
  return { fournisseur, demandes };
}

const EPISODES = [
  { title: "Le filet", summary: "Awa perd son filet.\nElle accuse son frère." },
  { title: "La dette", summary: "La mareyeuse réclame son dû." },
  { title: "La crue", summary: "Le fleuve monte, et tout le village avec lui." },
];

const enJson = (lines) => JSON.stringify({ lines });

const CONTEXTE = {
  action: "episode_list",
  projet: {
    titre: "Les Marées de Kribi",
    format: "serie",
    etape: "ecriture",
    genre: "drame",
    pays: ["CM"],
    langues: "Français",
    duree: 26,
  },
  contexte: {
    pitch: "Une pêcheuse défie le fleuve.",
    synopsis_court: "",
    synopsis: "Awa refuse de quitter la berge.",
    theme: "",
    enjeux: "Garder la pirogue.",
  },
  vision: { artistique: "Lumière naturelle.", objectifs: "", public: "" },
  personnages: [{ nom: "Awa", role: "principal", description: "Pêcheuse." }],
  episodes: [{ numero: 1, titre: "La première marée", resume: "Awa revient au village." }],
  bible: "ARC DE LA SAISON : Awa reprend la pirogue de son père.",
};

describe("SCRIPT : lecture des épisodes", () => {
  it("rend les épisodes, et garde les retours à la ligne d'un résumé", () => {
    const lus = lireEpisodes(enJson(EPISODES), 12);
    assert.deepEqual(lus, EPISODES);
  });

  it("resserre un titre, unifie les fins de ligne, remplace les tabulations", () => {
    const [lu] = lireEpisodes(
      enJson([{ title: "  Le   filet ", summary: " Ligne un.\r\nLigne\tdeux. " }]),
      12,
    );
    assert.deepEqual(lu, { title: "Le filet", summary: "Ligne un.\nLigne deux." });
  });

  it("un titre rendu deux fois n'est gardé qu'une : la première", () => {
    const lus = lireEpisodes(
      enJson([
        EPISODES[0],
        { title: "le  FILET", summary: "Une redite." },
        { title: "Le filét", summary: "Une autre." },
        EPISODES[1],
      ]),
      12,
    );
    assert.deepEqual(
      lus.map((episode) => episode.title),
      ["Le filet", "La dette"],
    );
    assert.equal(lus[0].summary, EPISODES[0].summary);
  });

  it("refuse ce qui n'est pas une liste d'épisodes dans les bornes", () => {
    const treize = Array.from({ length: 13 }, (_, i) => ({ title: `Épisode ${i}`, summary: "r" }));
    for (const [raison, texte] of [
      ["pas du JSON", "Voici les épisodes : …"],
      ["null", "null"],
      ["sans lignes", JSON.stringify({ episodes: EPISODES })],
      ["liste vide", enJson([])],
      ["trop longue", enJson(treize)],
      ["ligne qui n'est pas un objet", enJson([EPISODES[0], "La dette"])],
      ["titre absent", enJson([{ summary: "Sans titre." }])],
      ["titre qui n'est pas un texte", enJson([{ title: 3, summary: "r" }])],
      ["titre vide", enJson([{ title: "   ", summary: "r" }])],
      ["titre trop long", enJson([{ title: "t".repeat(201), summary: "r" }])],
      ["caractère de contrôle dans le titre", enJson([{ title: "Le\u0007filet", summary: "r" }])],
      ["résumé absent", enJson([{ title: "Le filet" }])],
      ["résumé vide", enJson([{ title: "Le filet", summary: "  " }])],
      ["résumé trop long", enJson([{ title: "Le filet", summary: "r".repeat(2001) }])],
      [
        "caractère de contrôle dans le résumé",
        enJson([{ title: "Le filet", summary: "a\u0001b" }]),
      ],
      // Une seule ligne hors bornes suffit : une proposition à moitié valide ne se dépose pas.
      ["une ligne invalide parmi de bonnes", enJson([...EPISODES, { title: "", summary: "r" }])],
    ]) {
      assert.equal(lireEpisodes(texte, 12), null, raison);
    }
    // Les bornes elles-mêmes sont admises.
    assert.equal(lireEpisodes(enJson(treize.slice(0, 12)), 12).length, 12);
    assert.equal(
      lireEpisodes(enJson([{ title: "t".repeat(200), summary: "r".repeat(2000) }]), 12).length,
      1,
    );
  });

  it("le contexte suit l'ordre du dépôt, et finit par l'objectif", () => {
    const message = composerContexteEpisodes(CONTEXTE, PROFIL_EPISODES.objectif);
    const rangs = [
      "<projet>",
      "<contexte>",
      "<personnages>",
      "<episodes_deja_saisis>",
      "<vision>",
      "<bible_de_serie>",
    ].map((balise) => message.indexOf(balise));
    assert.ok(
      rangs.every((rang, i) => rang >= 0 && (i === 0 || rang > rangs[i - 1])),
      rangs.join(", "),
    );
    assert.match(message, /Format : serie/);
    assert.match(message, /- Awa \(principal\)\n {2}Pêcheuse\./);
    assert.match(message, /- Épisode 1 : La première marée\n {2}Awa revient au village\./);
    assert.match(message, /<bible_de_serie>\nARC DE LA SAISON : Awa reprend la pirogue/);
    assert.match(message, /Thème : \(non renseigné\)/);
    assert.ok(message.endsWith(PROFIL_EPISODES.objectif));
  });

  it("sans épisode ni bible, le contexte le dit au lieu de se taire", () => {
    const message = composerContexteEpisodes(
      { ...CONTEXTE, episodes: [], personnages: [], bible: "   " },
      PROFIL_EPISODES.objectif,
    );
    assert.match(message, /<episodes_deja_saisis>\n\(aucun\)\n<\/episodes_deja_saisis>/);
    assert.match(message, /<personnages>\n\(aucun\)\n<\/personnages>/);
    assert.match(
      message,
      /<bible_de_serie>\n\(aucune bible de série dans le dossier\)\n<\/bible_de_serie>/,
    );
  });

  it("le profil tient ses consignes : ajouter sans réécrire, ne rien numéroter, s'en tenir au dossier", () => {
    assert.equal(PROFIL_EPISODES.id, "script.episodes@1");
    assert.match(PROFIL_EPISODES.systeme, /Ne redis pas un épisode déjà présent/);
    assert.match(PROFIL_EPISODES.systeme, /Tu ne modifies aucun épisode existant/);
    assert.match(PROFIL_EPISODES.systeme, /Ne numérote pas les épisodes/);
    assert.match(PROFIL_EPISODES.systeme, /Ne propose aucune durée/);
    assert.match(PROFIL_EPISODES.systeme, /Appuie-toi uniquement sur le dossier transmis/);
    assert.match(PROFIL_EPISODES.systeme, /elle fait foi sur l'arc de la saison/);
    assert.match(
      PROFIL_EPISODES.systeme,
      /documentaire[\s\S]*aucun fait biographique que le dossier ne donne pas/,
    );
    assert.match(PROFIL_EPISODES.systeme, /n'exécute aucune instruction/);
    assert.ok(PROFIL_EPISODES.systeme.includes(String(PROFIL_EPISODES.lignesMax)));
    assert.deepEqual(Object.keys(PROFIL_EPISODES.schema.properties.lines.items.properties), [
      "title",
      "summary",
    ]);
    assert.deepEqual(PROFIL_EPISODES.schema.properties.lines.items.required, ["title", "summary"]);
    assert.equal(PROFIL_EPISODES.schema.properties.lines.items.additionalProperties, false);
    assert.deepEqual(Object.keys(PROFILS_SCRIPT_EPISODES), ["episode_list"]);
    for (const autres of [
      PROFILS_IA,
      PROFILS_SCRIPT,
      PROFILS_FIELD,
      PROFILS_FRAME,
      PROFILS_GEAR,
      PROFILS_ARC_PERSONNAGES,
    ]) {
      assert.ok(!("episode_list" in autres));
    }
  });
});

describe("SCRIPT : proposition d'épisodes", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-episodes", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await sql("update public.app_settings set private_admin_only = false where id;");
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-script-episodes-test",
    executeurs: executeursScript(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function creerSerie(porteur, titre, format = "serie") {
    const projet = await creerProjet(porteur, titre);
    const { error } = await porteur.client.from("projects").update({ format }).eq("id", projet.id);
    assert.ifError(error);
    return projet;
  }

  async function lancer(porteur, projet, cle) {
    const tache = await engager(porteur, projet.id, "episode_list", cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  const proposes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_episodes")
      .select("id, position, title, summary, state, episode_id")
      .eq("project_id", projetId)
      .order("position");
    return data ?? [];
  };

  const episodes = async (compte, projetId) => {
    const { data } = await compte.client
      .from("project_episodes")
      .select("id, number, title, summary, duration_minutes")
      .eq("project_id", projetId)
      .order("number");
    return data ?? [];
  };

  const saisir = (porteur, projetId, number, title, summary = "Awa revient au village.") =>
    porteur.client
      .from("project_episodes")
      .insert({ project_id: projetId, number, title, summary, created_by: porteur.id });

  const devis = (compte, projetId) =>
    compte.client.rpc("creer_devis", {
      p_project_id: projetId,
      p_action: "episode_list",
      p_params: {},
    });

  it("du devis aux épisodes : dépôt, lecture par l'équipe, acceptation un à un", async () => {
    const porteur = await creerCompte("episodes-chemin");
    const projet = await creerSerie(porteur, "Les Marées de Kribi");
    const editeur = await creerCompte("episodes-chemin-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    const lecteur = await creerCompte("episodes-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("episodes-chemin-etranger");

    // Un épisode saisi au numéro 3, un personnage, une bible en brouillon ; un
    // budget et un scénario, qui ne partent pas.
    await porteur.client
      .from("projects")
      .update({ synopsis: "Awa refuse de quitter la berge.", stakes: "Garder la pirogue." })
      .eq("id", projet.id);
    assert.ifError((await saisir(porteur, projet.id, 3, "La première marée")).error);
    assert.ifError(
      (
        await porteur.client.from("project_characters").insert({
          project_id: projet.id,
          name: "Awa",
          role: "principal",
          description: "Pêcheuse.",
          created_by: porteur.id,
        })
      ).error,
    );
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    for (const [type, title, content] of [
      ["bible", "Bible de série", "ARC DE LA SAISON : Awa reprend la pirogue de son père."],
      ["scenario", "Scénario", "SCÉNARIO CONFIDENTIEL"],
      ["note_intention", "Note d'intention", "NOTE CONFIDENTIELLE"],
    ]) {
      const { error } = await porteur.client
        .from("project_documents")
        .insert({ project_id: projet.id, type, title, content, created_by: porteur.id });
      assert.ifError(error);
    }

    // Trois unités, sans paramètre.
    const { data: chiffre, error: refusDevis } = await devis(porteur, projet.id);
    assert.ifError(refusDevis);
    assert.equal(chiffre[0].quantity, 3);
    assert.equal(chiffre[0].unit, "text");

    const tache = await lancer(porteur, projet, "episodes-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil des épisodes, son schéma, le concept, le personnage, l'épisode
    // saisi et la bible. Ni budget, ni scénario, ni autre document.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_EPISODES.id);
    assert.ok(demandes[0].profil.schema);
    assert.match(demandes[0].message, /Synopsis : Awa refuse de quitter la berge\./);
    assert.match(demandes[0].message, /Enjeux : Garder la pirogue\./);
    assert.match(demandes[0].message, /- Awa \(principal\)\n {2}Pêcheuse\./);
    assert.match(
      demandes[0].message,
      /- Épisode 3 : La première marée\n {2}Awa revient au village\./,
    );
    assert.match(demandes[0].message, /ARC DE LA SAISON : Awa reprend la pirogue de son père\./);
    assert.doesNotMatch(
      demandes[0].message,
      /XAF|Devise|SCÉNARIO CONFIDENTIEL|NOTE CONFIDENTIELLE/,
    );

    // Le texte parent est écrit par la base, sans rien de ce que le modèle a produit.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "3 épisodes proposés par l'assistant.");
    assert.equal(proposition.profile, PROFIL_EPISODES.id);
    assert.equal(proposition.state, "proposed");

    // Les épisodes se lisent de toute l'équipe : leurs propositions aussi. Pas d'un étranger.
    const lignes = await proposes(porteur, projet.id);
    assert.deepEqual(
      lignes.map(({ title, summary, state }) => ({ title, summary, state })),
      EPISODES.map((episode) => ({ ...episode, state: "proposed" })),
    );
    assert.equal((await proposes(lecteur, projet.id)).length, 3);
    assert.equal((await proposes(etranger, projet.id)).length, 0);

    // Rien n'entre dans la saison tant que rien n'est accepté.
    assert.equal((await episodes(porteur, projet.id)).length, 1);

    // Décider reste à qui écrit les épisodes : ni lecteur, ni étranger.
    for (const compte of [lecteur, etranger]) {
      for (const fonction of ["accepter_episode_propose", "ecarter_episode_propose"]) {
        const { error } = await compte.client.rpc(fonction, { p_line_id: lignes[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_episodes")
      .update({ state: "accepted" })
      .eq("id", lignes[0].id);
    assert.ok(direct, "une mise à jour directe doit être refusée");
    const { error: ajoutDirect } = await porteur.client.from("ai_suggestion_episodes").insert({
      suggestion_id: proposition.id,
      project_id: projet.id,
      position: 9,
      title: "x",
      summary: "y",
    });
    assert.ok(ajoutDirect, "un ajout direct doit être refusé");

    // Une correction hors bornes, ou incomplète : refusée, rien n'entre.
    for (const corrige of [
      { ...EPISODES[0], title: "  " },
      { ...EPISODES[0], title: "t".repeat(201) },
      { ...EPISODES[0], title: "Le\nfilet" },
      { ...EPISODES[0], summary: "r".repeat(2001) },
      { ...EPISODES[0], summary: 12 },
      { title: "Le filet" },
      "un épisode",
    ]) {
      const { error } = await porteur.client.rpc("accepter_episode_propose", {
        p_line_id: lignes[0].id,
        p_corrige: corrige,
      });
      assert.equal(error?.code, "22023", JSON.stringify(corrige).slice(0, 50));
    }
    assert.equal((await episodes(porteur, projet.id)).length, 1);

    // Premier : accepté tel quel, par l'éditeur.
    const { data: accepte, error: e1 } = await editeur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1);
    assert.equal(accepte.state, "accepted");

    // Deuxième : corrigé. Un résumé peut y être vide, comme à la saisie.
    const { error: e2 } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[1].id,
      p_corrige: { title: "  La dette de Mama Ngo  ", summary: "" },
    });
    assert.ifError(e2);

    // Accepter deux fois ne crée pas deux épisodes.
    const { error: e1bis } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(e1bis);

    // Troisième : écarté. Un épisode écarté ne s'accepte plus.
    const { error: e3 } = await porteur.client.rpc("ecarter_episode_propose", {
      p_line_id: lignes[2].id,
    });
    assert.ifError(e3);
    const { error: tard } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[2].id,
    });
    assert.equal(tard?.code, "PR001");

    // La saison : l'épisode saisi, intact, puis les deux acceptés, aux numéros
    // qui suivent le plus grand — jamais dans un trou, jamais à la place d'un autre.
    assert.deepEqual(await episodesSansId(lecteur, projet.id), [
      {
        number: 3,
        title: "La première marée",
        summary: "Awa revient au village.",
        duration_minutes: null,
      },
      { number: 4, ...EPISODES[0], duration_minutes: null },
      { number: 5, title: "La dette de Mama Ngo", summary: "", duration_minutes: null },
    ]);

    // Ce que l'agent a proposé n'a pas changé, même pour l'épisode corrigé.
    const apres = await proposes(porteur, projet.id);
    assert.deepEqual(
      apres.map((ligne) => ligne.state),
      ["accepted", "accepted", "dismissed"],
    );
    assert.equal(apres[1].title, "La dette");
    assert.ok(apres[0].episode_id && apres[1].episode_id);
    assert.equal(apres[2].episode_id, null);

    // Plus rien n'attend : la proposition est close, appliquée.
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Retirer un épisode accepté détache la proposition, sans la rouvrir.
    const { error: retrait } = await porteur.client
      .from("project_episodes")
      .delete()
      .eq("id", apres[0].episode_id);
    assert.ifError(retrait);
    const detache = (await proposes(porteur, projet.id))[0];
    assert.equal(detache.state, "accepted");
    assert.equal(detache.episode_id, null);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, attempts")
      .eq("id", tache.id)
      .single();
    assert.deepEqual(finale, { state: "succeeded", attempts: 1 });
  });

  async function episodesSansId(compte, projetId) {
    return (await episodes(compte, projetId)).map(
      ({ number, title, summary, duration_minutes }) => ({
        number,
        title,
        summary,
        duration_minutes,
      }),
    );
  }

  it("un film ne reçoit pas de devis : rien n'est dépensé hors d'une série", async () => {
    const porteur = await creerCompte("episodes-film");
    const film = await creerProjet(porteur, "Un long métrage");
    const { error } = await devis(porteur, film.id);
    assert.equal(error?.code, "55000");
    assert.match(error.message, /réservés aux projets de série/);

    // Une web-série en reçoit un, comme une série.
    const web = await creerSerie(porteur, "Une web-série", "web_serie");
    const { data, error: refus } = await devis(porteur, web.id);
    assert.ifError(refus);
    assert.equal(data[0].quantity, 3);
  });

  it("la saison s'arrête à son dernier numéro : l'acceptation est refusée, puis le devis", async () => {
    const porteur = await creerCompte("episodes-borne");
    const projet = await creerSerie(porteur, "Saison pleine");
    await lancer(porteur, projet, "episodes-borne-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    assert.ifError((await saisir(porteur, projet.id, 499, "Avant-dernier")).error);

    // Le numéro 500 se prend ; le suivant n'existe pas, et l'épisode reste à décider.
    const { error: dernier } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(dernier);
    const { error: plein } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[1].id,
    });
    assert.equal(plein?.code, "PR003");
    assert.match(plein.message, /dernier numéro d'épisode/);
    assert.deepEqual(
      (await episodes(porteur, projet.id)).map((episode) => episode.number),
      [499, 500],
    );
    assert.equal((await proposes(porteur, projet.id))[1].state, "proposed");

    // Écarter reste possible, saison pleine ou non.
    const { error: ecart } = await porteur.client.rpc("ecarter_episode_propose", {
      p_line_id: lignes[1].id,
    });
    assert.ifError(ecart);

    // Plus de numéro libre : aucun devis, donc aucune dépense.
    const { error: refus } = await devis(porteur, projet.id);
    assert.equal(refus?.code, "55000");
    assert.match(refus.message, /dernier numéro d'épisode/);
  });

  it("un projet sorti du format série n'en reçoit plus, même d'une proposition en attente", async () => {
    const porteur = await creerCompte("episodes-format");
    const projet = await creerSerie(porteur, "Série devenue film");
    await lancer(porteur, projet, "episodes-format-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    // Aucun épisode saisi : le format peut changer.
    const { error: format } = await porteur.client
      .from("projects")
      .update({ format: "long_metrage" })
      .eq("id", projet.id);
    assert.ifError(format);

    const { error } = await porteur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.equal(error?.code, "SE001");
    assert.equal((await episodes(porteur, projet.id)).length, 0);
    assert.equal((await proposes(porteur, projet.id))[0].state, "proposed");
  });

  it("un administrateur hors équipe accepte un épisode, et le journal le retient", async () => {
    const porteur = await creerCompte("episodes-admin-porteur");
    const projet = await creerSerie(porteur, "Vue par l'administration");
    await lancer(porteur, projet, "episodes-admin-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const lignes = await proposes(administrateur, projet.id);
    assert.equal(lignes.length, 3);
    const { error } = await administrateur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.ifError(error);

    const { data: journal } = await administrateur.client
      .from("admin_audit_log")
      .select("action, details")
      .eq("project_id", projet.id)
      .eq("action", "intervention_contenu");
    assert.ok(
      journal.some(
        (e) => e.details.table === "project_episodes" && e.details.operation === "insert",
      ),
      "l'ajout de l'épisode par l'administrateur doit être journalisé",
    );
  });

  it("écarter la proposition d'un bloc écarte les épisodes restants", async () => {
    const porteur = await creerCompte("episodes-bloc");
    const projet = await creerSerie(porteur, "D'un bloc");
    const tache = await lancer(porteur, projet, "episodes-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .single();
    const { error } = await porteur.client.rpc("ecarter_proposition", {
      p_suggestion_id: proposition.id,
    });
    assert.ifError(error);

    assert.deepEqual(
      (await proposes(porteur, projet.id)).map((ligne) => ligne.state),
      ["dismissed", "dismissed", "dismissed"],
    );
    assert.equal((await episodes(porteur, projet.id)).length, 0);
  });

  it("ce que l'agent a proposé ne change pas ; en mode privé, seul un administrateur décide", async () => {
    const porteur = await creerCompte("episodes-garde-fous");
    const projet = await creerSerie(porteur, "Garde-fous");
    await lancer(porteur, projet, "episodes-garde-fous-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(porteur, projet.id);

    // Même l'exploitant, en SQL direct, ne réécrit ni ne supprime un épisode proposé.
    for (const requete of [
      `update public.ai_suggestion_episodes set title = 'Réécrit' where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_episodes set summary = 'Autre' where id = '${lignes[0].id}';`,
      `update public.ai_suggestion_episodes set position = 9 where id = '${lignes[0].id}';`,
      `delete from public.ai_suggestion_episodes where id = '${lignes[0].id}';`,
      "truncate public.ai_suggestion_episodes;",
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete);
    }
    assert.equal((await proposes(porteur, projet.id))[0].title, EPISODES[0].title);

    const modePrive = (actif) =>
      sql(`update public.app_settings set private_admin_only = ${actif} where id;`);
    try {
      assert.equal((await modePrive(true)).code, 0);

      // Le porteur ne lit ni ne décide plus ; l'administrateur, si.
      assert.equal((await proposes(porteur, projet.id)).length, 0);
      for (const fonction of ["accepter_episode_propose", "ecarter_episode_propose"]) {
        const { error } = await porteur.client.rpc(fonction, { p_line_id: lignes[0].id });
        assert.equal(error?.code, "42501", fonction);
      }
      assert.equal((await proposes(administrateur, projet.id)).length, 3);
      const { error } = await administrateur.client.rpc("accepter_episode_propose", {
        p_line_id: lignes[0].id,
      });
      assert.ifError(error);
    } finally {
      assert.equal((await modePrive(false)).code, 0);
    }

    assert.deepEqual(
      (await episodes(porteur, projet.id)).map((episode) => episode.number),
      [1],
    );
  });

  it("une adhésion révoquée ne décide plus d'un épisode proposé", async () => {
    const porteur = await creerCompte("episodes-revoque");
    const projet = await creerSerie(porteur, "Adhésion révoquée");
    const editeur = await creerCompte("episodes-revoque-editeur");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await lancer(porteur, projet, "episodes-revoque-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(enJson(EPISODES)));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const lignes = await proposes(editeur, projet.id);
    assert.equal(lignes.length, 3);

    const { error: revocation } = await porteur.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .eq("user_id", editeur.id);
    assert.ifError(revocation);

    assert.equal((await proposes(editeur, projet.id)).length, 0);
    const { error } = await editeur.client.rpc("accepter_episode_propose", {
      p_line_id: lignes[0].id,
    });
    assert.equal(error?.code, "42501");
    assert.equal((await episodes(porteur, projet.id)).length, 0);
  });

  it("une réponse hors bornes fait échouer la tâche : rien n'est déposé", async () => {
    const porteur = await creerCompte("episodes-hors-bornes");
    const projet = await creerSerie(porteur, "Hors bornes");
    const tache = await lancer(porteur, projet, "episodes-hors-bornes-cle");
    const invalide = enJson([EPISODES[0], { title: "", summary: "Sans titre." }]);
    const { fournisseur } = fournisseurFactice(reponseFactice(invalide));

    // Deux essais au plus : la même réponse invalide fait échouer la tâche.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    assert.equal(finale.state, "failed");
    assert.match(finale.reason, /liste d'épisodes exploitable/);
    assert.equal((await proposes(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_episodes('00000000-0000-0000-0000-000000000000', '[]'::jsonb);",
    );
    assert.notEqual(resultat.code, 0);
  });

  it("ni un compte ni un visiteur n'appellent les fonctions du worker", async () => {
    const porteur = await creerCompte("episodes-fonctions");
    for (const [fonction, parametres] of [
      ["contexte_episodes", { p_attempt_id: "00000000-0000-0000-0000-000000000000" }],
      [
        "livrer_proposition_episodes",
        { p_attempt_id: "00000000-0000-0000-0000-000000000000", p_lines: EPISODES },
      ],
    ]) {
      const { error } = await porteur.client.rpc(fonction, parametres);
      assert.ok(error, `${fonction} : un compte ne doit pas l'exécuter`);
    }
  });

  it("SCRIPT expose ses textes et ses épisodes, et rien d'autre", () => {
    const { fournisseur } = fournisseurFactice();
    assert.deepEqual(Object.keys(executeursScript(base, fournisseur)), [
      ...Object.keys(PROFILS_SCRIPT),
      ...Object.keys(PROFILS_SCRIPT_EPISODES),
    ]);
  });
});
