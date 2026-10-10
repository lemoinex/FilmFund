/**
 * FRAME : découpage technique.
 *
 * Il propose les plans d'une scène du storyboard — cadrage, focale, angle,
 * mouvement, description, durée —, que l'équipe accepte ou écarte un à un.
 * Il lit le scénario enregistré et le concept du projet : la scène dit
 * laquelle découper. Il ne nomme aucun matériel et ne propose aucune image.
 *
 * La mécanique de l'appel est celle de WEAVER : provision, appel, coût
 * confirmé, dépôt. Deux choses lui sont propres, et elles seules : le
 * contexte qu'il lit, et la lecture de sa réponse, contrôlée ici avant de
 * l'être encore par la base.
 */
import {
  lireContexteDecoupage,
  livrerPropositionDecoupage,
  type Base,
  type ContexteDecoupage,
  type PlanPropose,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import {
  ANGLES_PLAN,
  CADRAGES_PLAN,
  MOUVEMENTS_PLAN,
  PROFILS_FRAME,
  type ProfilStructure,
} from "../ia/profils.ts";

import { creerExecuteur } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Bornes d'un plan, telles que la base les contrôle au dépôt. */
const FOCALE_MAX = 2000;
const DUREE_MAX = 3600;
const DESCRIPTION_MAX = 500;

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

const lisible = (code: string) => code.replaceAll("_", " ");

function entete(scene: { decor: string; lieu: string; moment: string; titre: string }): string {
  return `${lisible(scene.decor)}, ${scene.lieu.trim() || "lieu non précisé"}, ${scene.moment} — ${scene.titre}`;
}

/**
 * Ce qui est transmis au fournisseur : le projet, son concept, sa vision, le
 * scénario, puis la scène à découper et ce qui l'entoure, puis l'objectif —
 * en dernier, après la donnée, pour que la demande ne soit pas noyée sous un
 * scénario entier.
 */
export function composerContexteDecoupage(contexte: ContexteDecoupage, objectif: string): string {
  const { projet, vision, scene, avant, plans, episode } = contexte;
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
    ["<vision>", champ("Vision artistique", vision.artistique), "</vision>"].join("\n"),
    // La scène d'un épisode : l'épisode d'abord, puis son scénario — le sien,
    // jamais celui d'un autre. Sans épisode, le message garde sa forme.
    ...(episode
      ? [
          [
            "<episode>",
            `Épisode ${episode.numero} : ${episode.titre}`,
            champ("Résumé", episode.resume),
            "Le scénario et les scènes précédentes ci-dessous sont ceux de cet épisode, et de lui seul.",
            "</episode>",
          ].join("\n"),
        ]
      : []),
    [
      "<scenario>",
      contexte.scenario.trim() ||
        (episode
          ? "(cet épisode n'a pas encore de scénario enregistré)"
          : "(aucun scénario enregistré)"),
      "</scenario>",
    ].join("\n"),
    [
      "<scenes_precedentes>",
      ...(avant.length ? avant.map((precedente) => `- ${entete(precedente)}`) : ["(aucune)"]),
      "</scenes_precedentes>",
    ].join("\n"),
    [
      "<scene_a_decouper>",
      champ("Intitulé", scene.titre),
      champ("Décor", lisible(scene.decor)),
      champ("Lieu", scene.lieu),
      champ("Moment", scene.moment),
      champ("Cadrage principal", scene.cadrage && lisible(scene.cadrage)),
      champ("Description", scene.description),
      "Plans déjà saisis :",
      ...(plans.length
        ? plans.map(
            (plan) =>
              `- ${lisible(plan.cadrage)} | ${lisible(plan.angle)} | ${lisible(plan.mouvement)} | ${plan.description.trim() || ABSENT}`,
          )
        : ["(aucun)"]),
      "</scene_a_decouper>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/** Entier facultatif dans ses bornes ; `undefined` s'il n'en est pas un. */
function entierFacultatif(valeur: unknown, max: number): number | null | undefined {
  if (valeur === null || valeur === undefined) {
    return null;
  }
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 1 && valeur <= max
    ? valeur
    : undefined;
}

/**
 * Remet la réponse en plans. Null si ce n'en est pas : JSON illisible, liste
 * vide ou trop longue, ou un seul plan hors bornes — une proposition à moitié
 * valide ne se dépose pas.
 *
 * Le schéma envoyé au fournisseur ne borne ni les nombres ni les longueurs :
 * ce contrôle-ci le fait, et la base le refait au dépôt.
 */
export function lirePlans(texte: string, max: number): PlanPropose[] | null {
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

  const cadrages: readonly string[] = CADRAGES_PLAN;
  const angles: readonly string[] = ANGLES_PLAN;
  const mouvements: readonly string[] = MOUVEMENTS_PLAN;
  const plans: PlanPropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { shot, focal_mm, angle, movement, description, duration_seconds } = brut as Record<
      string,
      unknown
    >;
    const focale = entierFacultatif(focal_mm, FOCALE_MAX);
    const duree = entierFacultatif(duration_seconds, DUREE_MAX);
    if (
      typeof shot !== "string" ||
      !cadrages.includes(shot) ||
      typeof angle !== "string" ||
      !angles.includes(angle) ||
      typeof movement !== "string" ||
      !mouvements.includes(movement) ||
      typeof description !== "string" ||
      focale === undefined ||
      duree === undefined
    ) {
      return null;
    }
    // Une description tient sur une ligne : les retours du modèle sont repliés.
    const resume = description.replace(/\s+/g, " ").trim();
    if (resume.length > DESCRIPTION_MAX || /[\u0000-\u001f\u007f]/.test(resume)) {
      return null;
    }
    plans.push({
      shot,
      focal_mm: focale,
      angle,
      movement,
      description: resume,
      duration_seconds: duree,
    });
  }
  return plans;
}

function executeurDecoupage(
  base: Base,
  fournisseur: Fournisseur,
  profil: ProfilStructure,
): Executeur {
  return creerExecuteur<PlanPropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContexteDecoupage(base, attemptId);
      return contexte ? composerContexteDecoupage(contexte, profil.objectif) : null;
    },
    lire: (texte) => lirePlans(texte, profil.lignesMax),
    deposer: (attemptId, plans) => livrerPropositionDecoupage(base, attemptId, plans),
    inexploitable: "La réponse du fournisseur n'est pas une liste de plans exploitable.",
  });
}

/**
 * Fabrique de l'exécuteur de chaque action de FRAME. Un profil sans fabrique
 * ne serait servi par personne : un test d'architecture les tient accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: Fournisseur, profil: ProfilStructure) => Executeur>
> = {
  shot_list: executeurDecoupage,
};

/** Ce que FRAME sait exécuter, avec ce fournisseur. */
export function executeursFrame(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_FRAME).flatMap(([action, profil]) =>
      FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
    ),
  );
}
