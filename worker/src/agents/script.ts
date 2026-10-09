/**
 * SCRIPT : traitement, bible et scénario. Un scénario ne tient pas dans une
 * proposition, plafonnée à 20 000 caractères : il s'écrit une séquence par
 * demande, que la base ajoute à la fin du document (lot J2a).
 *
 * Pour ces textes, l'agent n'a pas de mécanique propre : écrire un traitement,
 * c'est écrire un texte long à partir du contexte du projet, comme un synopsis
 * détaillé. Il reprend donc la fabrique de WEAVER, avec ses propres profils
 * versionnés. La séquence y ajoute sa description et la fin du scénario déjà
 * écrit, que la base joint à son contexte et que la fabrique met en forme.
 *
 * Il propose aussi les épisodes d'une série (lot SE2a) : des lignes, que
 * l'équipe accepte ou écarte une à une. Il lit le projet, son concept, sa
 * vision, ses personnages, les épisodes déjà saisis et la bible de série, et
 * n'en réécrit aucun. Deux choses sont propres à ce livrable, et elles
 * seules : le contexte qu'il lit, et la lecture de sa réponse, contrôlée ici
 * avant de l'être encore par la base.
 */
import {
  lireContexteEpisodes,
  livrerPropositionEpisodes,
  type Base,
  type ContexteEpisodes,
  type EpisodePropose,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import { PROFILS_SCRIPT, PROFILS_SCRIPT_EPISODES, type ProfilStructure } from "../ia/profils.ts";

import { creerExecuteur, executeursDeProfils } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Bornes d'un épisode, telles que la base les contrôle au dépôt. */
const TITRE_MAX = 200;
const RESUME_MAX = 2000;

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

const lisible = (code: string) => code.replaceAll("_", " ");

/** Deux titres sont le même épisode à la casse, aux accents et aux espaces près. */
function cleDeTitre(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ce qui est transmis au fournisseur : le projet, son concept, ses
 * personnages, les épisodes déjà saisis, sa vision, la bible de série, puis
 * l'objectif — en dernier, après la donnée, pour que la demande ne soit pas
 * noyée.
 */
export function composerContexteEpisodes(contexte: ContexteEpisodes, objectif: string): string {
  const { projet, personnages, episodes, vision } = contexte;
  const bible = contexte.bible.trim();
  const blocs = [
    [
      "<projet>",
      champ("Titre", projet.titre),
      champ("Format", lisible(projet.format)),
      champ("Étape", lisible(projet.etape)),
      champ("Genre", projet.genre && lisible(projet.genre)),
      champ("Pays de production", projet.pays?.join(", ")),
      champ("Langues", projet.langues),
      champ("Durée en minutes", projet.duree),
      "</projet>",
    ].join("\n"),
    [
      "<contexte>",
      champ("Pitch", contexte.contexte.pitch),
      champ("Synopsis court", contexte.contexte.synopsis_court),
      champ("Synopsis", contexte.contexte.synopsis),
      champ("Thème", contexte.contexte.theme),
      champ("Enjeux", contexte.contexte.enjeux),
      "</contexte>",
    ].join("\n"),
    [
      "<personnages>",
      ...(personnages.length
        ? personnages.map((personnage) =>
            [
              `- ${personnage.nom} (${lisible(personnage.role)})`,
              personnage.description.trim() ? `  ${personnage.description.trim()}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
        : ["(aucun)"]),
      "</personnages>",
    ].join("\n"),
    [
      "<episodes_deja_saisis>",
      ...(episodes.length
        ? episodes.map((episode) =>
            [
              `- Épisode ${episode.numero} : ${episode.titre}`,
              episode.resume.trim() ? `  ${episode.resume.trim()}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
        : ["(aucun)"]),
      "</episodes_deja_saisis>",
    ].join("\n"),
    [
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
    [
      "<bible_de_serie>",
      bible || "(aucune bible de série dans le dossier)",
      "</bible_de_serie>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en épisodes. Null si ce n'en est pas : JSON illisible,
 * liste vide ou trop longue, ou une seule ligne hors bornes — une proposition
 * à moitié valide ne se dépose pas.
 *
 * Un titre rendu deux fois n'est gardé qu'une : la première. C'est le seul tri
 * fait ici ; un épisode proche d'un épisode déjà saisi est laissé à la
 * décision de l'équipe.
 *
 * Le schéma envoyé au fournisseur ne borne aucune longueur : ce contrôle-ci
 * le fait, et la base le refait au dépôt.
 */
export function lireEpisodes(texte: string, max: number): EpisodePropose[] | null {
  let reponse: unknown;
  try {
    reponse = JSON.parse(texte);
  } catch {
    return null;
  }
  const bruts = (reponse as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(bruts) || bruts.length < 1 || bruts.length > max) {
    return null;
  }

  const vus = new Set<string>();
  const episodes: EpisodePropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { title, summary } = brut as Record<string, unknown>;
    if (typeof title !== "string" || typeof summary !== "string") {
      return null;
    }
    const titre = title.replace(/\s+/g, " ").trim();
    // Les retours à la ligne d'un résumé sont gardés, rien d'autre.
    const resume = summary.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
    if (
      titre.length < 1 ||
      titre.length > TITRE_MAX ||
      /[\u0000-\u001f\u007f]/.test(titre) ||
      resume.length < 1 ||
      resume.length > RESUME_MAX ||
      /[\u0000-\u0009\u000b-\u001f\u007f]/.test(resume)
    ) {
      return null;
    }
    const cle = cleDeTitre(titre);
    if (vus.has(cle)) {
      continue;
    }
    vus.add(cle);
    episodes.push({ title: titre, summary: resume });
  }
  return episodes;
}

function executeurEpisodes(
  base: Base,
  fournisseur: Fournisseur,
  profil: ProfilStructure,
): Executeur {
  return creerExecuteur<EpisodePropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContexteEpisodes(base, attemptId);
      return contexte ? composerContexteEpisodes(contexte, profil.objectif) : null;
    },
    lire: (texte) => lireEpisodes(texte, profil.lignesMax),
    deposer: (attemptId, episodes) => livrerPropositionEpisodes(base, attemptId, episodes),
    inexploitable: "La réponse du fournisseur n'est pas une liste d'épisodes exploitable.",
  });
}

/**
 * Fabrique de l'exécuteur de chaque livrable structuré de SCRIPT. Un profil
 * sans fabrique ne serait servi par personne : un test d'architecture les
 * tient accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: Fournisseur, profil: ProfilStructure) => Executeur>
> = {
  episode_list: executeurEpisodes,
};

/** Ce que SCRIPT sait exécuter, avec ce fournisseur : ses textes, puis ses lignes. */
export function executeursScript(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return {
    ...executeursDeProfils(base, fournisseur, PROFILS_SCRIPT),
    ...Object.fromEntries(
      Object.entries(PROFILS_SCRIPT_EPISODES).flatMap(([action, profil]) =>
        FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
      ),
    ),
  };
}
