/**
 * FIELD : budget, financement et calendrier.
 *
 * Premier agent dont la proposition n'est pas un texte : il rend des lignes
 * de budget — catégorie, libellé, quantité, coût unitaire — ou des jalons de
 * planning — titre, phase, durée —, que l'équipe accepte ou écarte un à un.
 * Il ne propose ni financeur, ni montant de financement, ni date.
 *
 * La mécanique de l'appel est celle de WEAVER : provision, appel, coût
 * confirmé, dépôt. Deux choses lui sont propres, et elles seules : le
 * contexte qu'il lit, et la lecture de sa réponse, contrôlée ici avant de
 * l'être encore par la base.
 */
import {
  lireContexteBudget,
  lireContextePlanning,
  livrerPropositionBudget,
  livrerPropositionPlanning,
  type Base,
  type ContexteBudget,
  type ContextePlanning,
  type JalonPropose,
  type LigneBudget,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import {
  CATEGORIES_BUDGET,
  PHASES_PLANNING,
  PROFILS_FIELD,
  type ProfilStructure,
} from "../ia/profils.ts";

import { creerExecuteur } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Bornes des colonnes `quantity` et `unit_cost`, telles que la base les contrôle au dépôt. */
const QUANTITE_MAX = 9_999_999_999;
const COUT_MAX = 999_999_999_999;
const LIBELLE_MAX = 200;

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

/**
 * Ce qui est transmis au fournisseur pour un budget : le projet, son
 * contexte, sa vision, le budget déjà saisi, le planning, puis l'objectif —
 * en dernier, après la donnée, pour que la demande ne soit pas noyée.
 */
export function composerContexteBudget(contexte: ContexteBudget, objectif: string): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  const { projet, vision, budget, planning } = contexte;
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
      champ("Nombre de personnages", contexte.personnages),
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
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
    [
      "<budget>",
      `Devise : ${budget.devise}`,
      "Lignes déjà saisies :",
      ...(budget.lignes.length
        ? budget.lignes.map(
            (ligne) =>
              `- ${ligne.categorie} | ${ligne.libelle} | quantité ${ligne.quantite} | coût unitaire ${ligne.cout_unitaire}`,
          )
        : ["(aucune)"]),
      "</budget>",
    ].join("\n"),
    [
      "<planning>",
      ...(planning.length
        ? planning.map(
            (jalon) =>
              `- ${jalon.titre} (${lisible(jalon.phase)}) : du ${jalon.debut ?? ABSENT} au ${jalon.echeance ?? ABSENT}`,
          )
        : [ABSENT]),
      "</planning>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Au centime, comme la base. L'epsilon rattrape l'écriture binaire : sans lui,
 * 1,005 s'arrondirait à 1,00 ici et à 1,01 dans la base.
 */
const arrondi = (valeur: number) => Math.round((valeur + Number.EPSILON) * 100) / 100;

/**
 * Remet la réponse en lignes de budget. Null si ce n'en est pas : JSON
 * illisible, liste vide ou trop longue, ou une seule ligne hors bornes — une
 * proposition à moitié valide ne se dépose pas.
 *
 * Le schéma envoyé au fournisseur ne borne ni les nombres ni les longueurs :
 * ce contrôle-ci le fait, et la base le refait au dépôt.
 */
export function lireLignesBudget(texte: string, max: number): LigneBudget[] | null {
  let reponse: unknown;
  try {
    reponse = JSON.parse(texte);
  } catch {
    return null;
  }
  const brutes = (reponse as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(brutes) || brutes.length < 1 || brutes.length > max) {
    return null;
  }

  const categories: readonly string[] = CATEGORIES_BUDGET;
  const lignes: LigneBudget[] = [];
  for (const brute of brutes) {
    if (typeof brute !== "object" || brute === null) {
      return null;
    }
    const { category, label, quantity, unit_cost } = brute as Record<string, unknown>;
    if (
      typeof category !== "string" ||
      !categories.includes(category) ||
      typeof label !== "string" ||
      typeof quantity !== "number" ||
      typeof unit_cost !== "number" ||
      !Number.isFinite(quantity) ||
      !Number.isFinite(unit_cost)
    ) {
      return null;
    }
    const libelle = label.replace(/\s+/g, " ").trim();
    const quantite = arrondi(quantity);
    const cout = arrondi(unit_cost);
    if (
      libelle.length < 1 ||
      libelle.length > LIBELLE_MAX ||
      /[\u0000-\u001f\u007f]/.test(libelle) ||
      quantite < 0.01 ||
      quantite > QUANTITE_MAX ||
      cout < 0 ||
      cout > COUT_MAX
    ) {
      return null;
    }
    lignes.push({ category, label: libelle, quantity: quantite, unit_cost: cout });
  }
  return lignes;
}

function executeurBudget(base: Base, fournisseur: Fournisseur, profil: ProfilStructure): Executeur {
  return creerExecuteur<LigneBudget[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContexteBudget(base, attemptId);
      return contexte ? composerContexteBudget(contexte, profil.objectif) : null;
    },
    lire: (texte) => lireLignesBudget(texte, profil.lignesMax),
    deposer: (attemptId, lignes) => livrerPropositionBudget(base, attemptId, lignes),
    inexploitable: "La réponse du fournisseur n'est pas une liste de lignes exploitable.",
  });
}

/** Bornes d'un jalon, telles que la base les contrôle au dépôt. */
const DUREE_MAX = 730;
const TITRE_MAX = 200;

/**
 * Ce qui est transmis au fournisseur pour un planning : le projet, son
 * contexte, sa vision, le planning déjà saisi, puis l'objectif. Le budget n'y
 * figure pas : les lecteurs de l'équipe lisent le planning, pas le budget.
 */
export function composerContextePlanning(contexte: ContextePlanning, objectif: string): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  const { projet, vision, planning } = contexte;
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
      champ("Nombre de personnages", contexte.personnages),
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
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
    [
      "<planning>",
      "Jalons déjà saisis :",
      ...(planning.length
        ? planning.map(
            (jalon) =>
              `- ${jalon.titre} (${lisible(jalon.phase)}, ${lisible(jalon.statut)}) : du ${jalon.debut ?? ABSENT} au ${jalon.echeance ?? ABSENT}`,
          )
        : ["(aucun)"]),
      "</planning>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en jalons. Null si ce n'en est pas : JSON illisible, liste
 * vide ou trop longue, ou un seul jalon hors bornes — une proposition à
 * moitié valide ne se dépose pas.
 *
 * Le schéma envoyé au fournisseur ne borne ni les nombres ni les longueurs :
 * ce contrôle-ci le fait, et la base le refait au dépôt.
 */
export function lireJalons(texte: string, max: number): JalonPropose[] | null {
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

  const phases: readonly string[] = PHASES_PLANNING;
  const jalons: JalonPropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { title, phase, duration_days } = brut as Record<string, unknown>;
    if (
      typeof title !== "string" ||
      typeof phase !== "string" ||
      !phases.includes(phase) ||
      typeof duration_days !== "number" ||
      !Number.isInteger(duration_days) ||
      duration_days < 1 ||
      duration_days > DUREE_MAX
    ) {
      return null;
    }
    const titre = title.replace(/\s+/g, " ").trim();
    if (titre.length < 1 || titre.length > TITRE_MAX || /[\u0000-\u001f\u007f]/.test(titre)) {
      return null;
    }
    jalons.push({ title: titre, phase, duration_days });
  }
  return jalons;
}

function executeurPlanning(
  base: Base,
  fournisseur: Fournisseur,
  profil: ProfilStructure,
): Executeur {
  return creerExecuteur<JalonPropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContextePlanning(base, attemptId);
      return contexte ? composerContextePlanning(contexte, profil.objectif) : null;
    },
    lire: (texte) => lireJalons(texte, profil.lignesMax),
    deposer: (attemptId, jalons) => livrerPropositionPlanning(base, attemptId, jalons),
    inexploitable: "La réponse du fournisseur n'est pas une liste de jalons exploitable.",
  });
}

/**
 * Fabrique de l'exécuteur de chaque action de FIELD. Un profil sans fabrique
 * ne serait servi par personne : un test d'architecture les tient accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: Fournisseur, profil: ProfilStructure) => Executeur>
> = {
  budget_plan: executeurBudget,
  schedule_plan: executeurPlanning,
};

/** Ce que FIELD sait exécuter, avec ce fournisseur. */
export function executeursField(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_FIELD).flatMap(([action, profil]) =>
      FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
    ),
  );
}
