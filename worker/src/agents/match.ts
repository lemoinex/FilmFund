/**
 * MATCH : veille des opportunités, pour le catalogue de l'administration.
 *
 * Deux temps, deux fournisseurs, comme SCOUT dont il reprend la collecte : le
 * moteur de recherche rend des pages, le modèle de texte ne lit que leurs
 * extraits. Il n'en rédige pas une synthèse : il relève les opportunités que
 * ces pages annoncent — un nom, un organisme, une catégorie, un résumé, et le
 * rang de la page. L'adresse et l'extrait d'une opportunité viennent de la
 * page, jamais du modèle.
 *
 * Le worker ne visite aucune page. Il ne peut donc rien vérifier : une
 * opportunité acceptée entre au catalogue « non vérifiée », et c'est
 * l'administrateur qui la vérifie, page ouverte.
 *
 * Une veille n'appartient à aucun projet : seule sa question part chez le
 * moteur, et rien d'un projet n'est transmis au modèle.
 */
import {
  lireContexteVeille,
  livrerPropositionVeille,
  type Base,
  type OpportuniteRelevee,
  type SourceCollectee,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import type { Fournisseur, FournisseurRecherche } from "../ia/passerelle.ts";
import { CATEGORIES_OPPORTUNITE, PROFILS_MATCH, type ProfilVeille } from "../ia/profils.ts";

import { collecter } from "./scout.ts";
import { creerExecuteur } from "./weaver.ts";

/** Bornes d'une opportunité relevée, telles que la base les contrôle au dépôt. */
const NOM_MAX = 200;
const RESUME_MAX = 1500;

const ADRESSE = /(https?:\/\/|www\.)/i;

/** Texte sur une ligne, espaces resserrés. */
const surUneLigne = (texte: string) => texte.replace(/\s+/g, " ").trim();

/**
 * Ce qui est transmis au modèle : la recherche, les pages numérotées, puis
 * l'objectif — en dernier, après la donnée. Les adresses n'y figurent pas :
 * le modèle n'a pas à en écrire, seulement à désigner une page par son rang.
 */
export function composerDossierVeille(
  question: string,
  sources: readonly SourceCollectee[],
  objectif: string,
): string {
  const blocs = [
    ["<recherche>", question, "</recherche>"].join("\n"),
    [
      "<pages>",
      ...sources.map((source, rang) =>
        [
          `[${rang + 1}] ${source.title}`,
          `Site : ${new URL(source.url).hostname}`,
          `Date : ${source.published_on ?? "non indiquée"}`,
          "Extrait :",
          source.excerpt,
        ].join("\n"),
      ),
      "</pages>",
    ].join("\n\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en opportunités relevées. Null si ce n'en est pas : JSON
 * illisible, liste trop longue, ou une seule opportunité hors bornes — page
 * absente de la collecte, catégorie inconnue, adresse écrite par le modèle.
 * Une proposition à moitié valide ne se dépose pas.
 *
 * Une liste vide est une réponse : les pages n'annoncent rien. La même
 * opportunité relevée deux fois n'est gardée qu'une fois, la première.
 */
export function lireOpportunites(
  texte: string,
  pages: number,
  max: number,
): OpportuniteRelevee[] | null {
  let reponse: unknown;
  try {
    reponse = JSON.parse(texte);
  } catch {
    return null;
  }
  const brutes = (reponse as { opportunities?: unknown } | null)?.opportunities;
  if (!Array.isArray(brutes) || brutes.length > max) {
    return null;
  }

  const categories: readonly string[] = CATEGORIES_OPPORTUNITE;
  const vues = new Set<string>();
  const opportunites: OpportuniteRelevee[] = [];
  for (const brute of brutes) {
    if (typeof brute !== "object" || brute === null) {
      return null;
    }
    const { source, name, organization, category, summary } = brute as Record<string, unknown>;
    if (
      typeof source !== "number" ||
      !Number.isInteger(source) ||
      source < 1 ||
      source > pages ||
      typeof name !== "string" ||
      typeof organization !== "string" ||
      typeof category !== "string" ||
      !categories.includes(category) ||
      typeof summary !== "string"
    ) {
      return null;
    }
    const nom = surUneLigne(name);
    const organisme = surUneLigne(organization);
    // Le résumé garde ses paragraphes ; le reste des caractères de contrôle
    // n'a rien à y faire.
    const resume = summary
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (
      nom.length < 1 ||
      nom.length > NOM_MAX ||
      organisme.length > NOM_MAX ||
      resume.length < 1 ||
      resume.length > RESUME_MAX ||
      /[\u0000-\u001f\u007f]/.test(nom + organisme) ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(resume) ||
      ADRESSE.test(nom) ||
      ADRESSE.test(organisme) ||
      ADRESSE.test(resume)
    ) {
      return null;
    }
    const cle = `${nom.toLowerCase()}\u0000${organisme.toLowerCase()}`;
    if (vues.has(cle)) {
      continue;
    }
    vues.add(cle);
    opportunites.push({ source, name: nom, organization: organisme, category, summary: resume });
  }
  return opportunites;
}

function executeurVeille(
  base: Base,
  fournisseur: Fournisseur,
  moteur: FournisseurRecherche,
  profil: ProfilVeille,
): Executeur {
  return async (travail, signal) => {
    const contexte = await lireContexteVeille(base, travail.attemptId);
    if (contexte === null) {
      throw new EchecConnu("Cette veille n'est plus autorisée.");
    }

    const sources = await collecter(
      base,
      moteur,
      profil,
      travail.attemptId,
      contexte.question,
      signal,
    );

    // Le relevé : même mécanique que tout livrable structuré, sur ces pages-là.
    return creerExecuteur<OpportuniteRelevee[]>(base, fournisseur, {
      profil,
      preparer: async () => composerDossierVeille(contexte.question, sources, profil.objectif),
      lire: (texte) => lireOpportunites(texte, sources.length, profil.opportunitesMax),
      deposer: (attemptId, opportunites) =>
        livrerPropositionVeille(base, attemptId, sources, opportunites),
      inexploitable:
        "La réponse du fournisseur n'est pas un relevé exploitable : elle désigne une page absente de la collecte, ou sort du format demandé.",
    })(travail, signal);
  };
}

/** Ce que MATCH sait exécuter, avec ce modèle de texte et ce moteur de recherche. */
export function executeursMatch(
  base: Base,
  fournisseur: Fournisseur,
  moteur: FournisseurRecherche,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_MATCH).map(([action, profil]) => [
      action,
      executeurVeille(base, fournisseur, moteur, profil),
    ]),
  );
}
