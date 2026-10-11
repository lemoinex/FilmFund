/**
 * ARC : analyse dramaturgique, personnages et arcs narratifs.
 *
 * Premier agent qui ne réécrit pas le projet : il le lit et en rend une
 * lecture. Pour l'analyse, la mécanique est celle de WEAVER — même contexte,
 * même fabrique d'exécuteurs —, seul le profil change.
 *
 * Il propose aussi des personnages (lot X2a) : des lignes, que l'équipe
 * accepte ou écarte une à une. Il lit le projet, son concept, sa vision et
 * les personnages déjà saisis, et n'en réécrit aucun. Deux choses sont
 * propres à ce livrable, et elles seules : le contexte qu'il lit, et la
 * lecture de sa réponse, contrôlée ici avant de l'être encore par la base.
 */
import { ecrirePersonnage } from "./personnage.ts";
import {
  lireContexteFichePersonnage,
  lireContextePersonnages,
  livrerPropositionFiche,
  livrerPropositionPersonnages,
  type Base,
  type ChampPropose,
  type ContexteFichePersonnage,
  type ContextePersonnages,
  type PersonnagePropose,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import {
  CHAMPS_FICHE_PERSONNAGE,
  PROFILS_ARC,
  PROFILS_ARC_FICHE,
  PROFILS_ARC_PERSONNAGES,
  ROLES_PERSONNAGE,
  type ProfilStructure,
} from "../ia/profils.ts";

import { creerExecuteur, executeursDeProfils } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Bornes d'un personnage, telles que la base les contrôle au dépôt. */
const NOM_MAX = 120;
const DESCRIPTION_MAX = 2000;

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

const lisible = (code: string) => code.replaceAll("_", " ");

/** Deux noms sont le même personnage à la casse, aux accents et aux espaces près. */
function cleDeNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ce qui est transmis au fournisseur : le projet, son concept, les
 * personnages déjà saisis, sa vision, puis l'objectif — en dernier, après la
 * donnée, pour que la demande ne soit pas noyée.
 */
export function composerContextePersonnages(
  contexte: ContextePersonnages,
  objectif: string,
): string {
  const { projet, personnages, vision } = contexte;
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
      "<personnages_deja_saisis>",
      ...(personnages.length
        ? personnages.map((personnage) => ecrirePersonnage(personnage))
        : ["(aucun)"]),
      "</personnages_deja_saisis>",
    ].join("\n"),
    [
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en personnages. Null si ce n'en est pas : JSON illisible,
 * liste vide ou trop longue, ou une seule ligne hors bornes — une proposition
 * à moitié valide ne se dépose pas.
 *
 * Un nom rendu deux fois n'est gardé qu'une : la première. C'est le seul tri
 * fait ici ; un personnage déjà saisi par l'équipe est laissé à sa décision,
 * et l'écran le lui signale.
 *
 * Le schéma envoyé au fournisseur ne borne aucune longueur : ce contrôle-ci
 * le fait, et la base le refait au dépôt.
 */
export function lirePersonnages(texte: string, max: number): PersonnagePropose[] | null {
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

  const roles: readonly string[] = ROLES_PERSONNAGE;
  const vus = new Set<string>();
  const personnages: PersonnagePropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { name, role, description } = brut as Record<string, unknown>;
    if (
      typeof name !== "string" ||
      typeof role !== "string" ||
      !roles.includes(role) ||
      typeof description !== "string"
    ) {
      return null;
    }
    const nom = name.replace(/\s+/g, " ").trim();
    // Les retours à la ligne d'une description sont gardés, rien d'autre.
    const portrait = description.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
    if (
      nom.length < 1 ||
      nom.length > NOM_MAX ||
      /[\u0000-\u001f\u007f]/.test(nom) ||
      portrait.length < 1 ||
      portrait.length > DESCRIPTION_MAX ||
      /[\u0000-\u0009\u000b-\u001f\u007f]/.test(portrait)
    ) {
      return null;
    }
    const cle = cleDeNom(nom);
    if (vus.has(cle)) {
      continue;
    }
    vus.add(cle);
    personnages.push({ name: nom, role, description: portrait });
  }
  return personnages;
}

/** Bornes d'un champ de fiche, telles que la base les contrôle au dépôt. */
const BORNES_FICHE: Readonly<Record<string, { max: number; ligne: boolean }>> = {
  age: { max: 60, ligne: true },
  occupation: { max: 160, ligne: true },
  apparence: { max: 600, ligne: false },
  objectif: { max: 600, ligne: false },
  obstacle: { max: 600, ligne: false },
  arc: { max: 800, ligne: false },
  traits: { max: 600, ligne: false },
  liens: { max: 600, ligne: false },
};

/**
 * Ce qui est transmis au fournisseur pour compléter une fiche : le projet, son
 * concept, tous les personnages, la vision, le scénario, puis le personnage à
 * compléter, ses champs vides et l'objectif — en dernier, après la donnée.
 */
export function composerContexteFiche(contexte: ContexteFichePersonnage, objectif: string): string {
  const { projet, personnages, vision, personnage: aCompleter } = contexte;
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
      ...personnages.map((autre) => ecrirePersonnage(autre)),
      "</personnages>",
    ].join("\n"),
    [
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
    [
      "<scenario>",
      contexte.scenario.trim() || "(aucun scénario enregistré)",
      // Dit à l'agent plutôt que tu : il n'a pas lu la fin.
      ...(contexte.scenario_coupe
        ? ["(le scénario est coupé ici : la suite n'est pas transmise)"]
        : []),
      "</scenario>",
    ].join("\n"),
    ["<personnage_a_completer>", ecrirePersonnage(aCompleter), "</personnage_a_completer>"].join(
      "\n",
    ),
    ["<champs_a_proposer>", contexte.champs_vides.join(", "), "</champs_a_proposer>"].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en champs de fiche. Null si ce n'en est pas : JSON
 * illisible, liste vide ou trop longue, champ inconnu, texte vide ou hors
 * bornes — une proposition à moitié valide ne se dépose pas.
 *
 * Un champ rendu deux fois n'est gardé qu'une : la première. Le worker ne
 * trie pas les champs demandés : la base ne dépose que ceux qui sont encore
 * vides au moment du dépôt, et refait ces contrôles.
 */
export function lireChampsFiche(texte: string): ChampPropose[] | null {
  let reponse: unknown;
  try {
    reponse = JSON.parse(texte);
  } catch {
    return null;
  }
  const bruts = (reponse as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(bruts) || bruts.length < 1 || bruts.length > CHAMPS_FICHE_PERSONNAGE.length) {
    return null;
  }

  const vus = new Set<string>();
  const champs: ChampPropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { field, value } = brut as Record<string, unknown>;
    if (
      typeof field !== "string" ||
      typeof value !== "string" ||
      !Object.hasOwn(BORNES_FICHE, field)
    ) {
      return null;
    }
    const { max, ligne } = BORNES_FICHE[field];
    const valeur = ligne
      ? value.replace(/\s+/g, " ").trim()
      : value.replace(/\r\n?/g, "\n").replace(/\t/g, " ").trim();
    if (
      valeur.length < 1 ||
      valeur.length > max ||
      /[\u0000-\u0009\u000b-\u001f\u007f]/.test(valeur)
    ) {
      return null;
    }
    if (vus.has(field)) {
      continue;
    }
    vus.add(field);
    champs.push({ field, value: valeur });
  }
  return champs;
}

function executeurFiche(base: Base, fournisseur: Fournisseur, profil: ProfilStructure): Executeur {
  return creerExecuteur<ChampPropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContexteFichePersonnage(base, attemptId);
      return contexte ? composerContexteFiche(contexte, profil.objectif) : null;
    },
    lire: (texte) => lireChampsFiche(texte),
    deposer: (attemptId, champs) => livrerPropositionFiche(base, attemptId, champs),
    inexploitable: "La réponse du fournisseur n'est pas une fiche de personnage exploitable.",
  });
}

function executeurPersonnages(
  base: Base,
  fournisseur: Fournisseur,
  profil: ProfilStructure,
): Executeur {
  return creerExecuteur<PersonnagePropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContextePersonnages(base, attemptId);
      return contexte ? composerContextePersonnages(contexte, profil.objectif) : null;
    },
    lire: (texte) => lirePersonnages(texte, profil.lignesMax),
    deposer: (attemptId, personnages) => livrerPropositionPersonnages(base, attemptId, personnages),
    inexploitable: "La réponse du fournisseur n'est pas une liste de personnages exploitable.",
  });
}

/**
 * Fabrique de l'exécuteur de chaque livrable structuré d'ARC. Un profil sans
 * fabrique ne serait servi par personne : un test d'architecture les tient
 * accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: Fournisseur, profil: ProfilStructure) => Executeur>
> = {
  character_list: executeurPersonnages,
  character_sheet: executeurFiche,
};

/** Ce qu'ARC sait exécuter, avec ce fournisseur : ses textes, puis ses lignes. */
export function executeursArc(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return {
    ...executeursDeProfils(base, fournisseur, PROFILS_ARC),
    ...Object.fromEntries(
      Object.entries({ ...PROFILS_ARC_PERSONNAGES, ...PROFILS_ARC_FICHE }).flatMap(
        ([action, profil]) =>
          FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
      ),
    ),
  };
}
