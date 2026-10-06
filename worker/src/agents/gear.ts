/**
 * GEAR : matériel de tournage.
 *
 * Il propose une liste d'équipements — catégorie, désignation, quantité,
 * puissance unitaire —, que l'équipe accepte ou écarte un à un. Il lit le
 * storyboard, le découpage et le matériel déjà saisi. Il ne nomme ni marque,
 * ni loueur, ni prix, et ne rend aucun calcul : le besoin électrique est
 * calculé par la plateforme, à partir de ce que l'équipe a retenu.
 *
 * La mécanique de l'appel est celle de WEAVER : provision, appel, coût
 * confirmé, dépôt. Deux choses lui sont propres, et elles seules : le
 * contexte qu'il lit, et la lecture de sa réponse, contrôlée ici avant de
 * l'être encore par la base.
 */
import {
  lireContexteMateriel,
  livrerPropositionMateriel,
  type Base,
  type ContexteMateriel,
  type EquipementPropose,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import { CATEGORIES_MATERIEL, PROFILS_GEAR, type ProfilStructure } from "../ia/profils.ts";

import { creerExecuteur } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Bornes d'un équipement, telles que la base les contrôle au dépôt. */
const DESIGNATION_MAX = 200;
const QUANTITE_MAX = 1000;
const PUISSANCE_MAX = 1_000_000;

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

const lisible = (code: string) => code.replaceAll("_", " ");

/** « 4 × travelling, 2 × fixe » : ce que le découpage demande, sans le recopier. */
function decompte(valeurs: readonly string[]): string {
  const nombres = new Map<string, number>();
  for (const valeur of valeurs) {
    nombres.set(valeur, (nombres.get(valeur) ?? 0) + 1);
  }
  return [...nombres].map(([valeur, nombre]) => `${nombre} × ${lisible(valeur)}`).join(", ");
}

/**
 * Ce qui est transmis au fournisseur : le projet, son concept, sa vision, le
 * storyboard, le découpage résumé, le matériel déjà saisi, puis l'objectif —
 * en dernier, après la donnée, pour que la demande ne soit pas noyée.
 */
export function composerContexteMateriel(contexte: ContexteMateriel, objectif: string): string {
  const { projet, vision, scenes, plans, materiel } = contexte;
  const focales = [...new Set(plans.flatMap((plan) => (plan.focale ? [plan.focale] : [])))].sort(
    (a, b) => a - b,
  );
  const blocs = [
    [
      "<projet>",
      champ("Titre", projet.titre),
      champ("Format", lisible(projet.format)),
      champ("Étape", lisible(projet.etape)),
      champ("Genre", projet.genre && lisible(projet.genre)),
      champ("Pays de production", projet.pays?.join(", ")),
      champ("Durée en minutes", projet.duree),
      "</projet>",
    ].join("\n"),
    [
      "<contexte>",
      champ("Pitch", contexte.contexte.pitch),
      champ("Synopsis court", contexte.contexte.synopsis_court),
      champ("Thème", contexte.contexte.theme),
      "</contexte>",
    ].join("\n"),
    ["<vision>", champ("Vision artistique", vision.artistique), "</vision>"].join("\n"),
    [
      "<storyboard>",
      ...(scenes.length
        ? scenes.map(
            (scene) =>
              `- ${lisible(scene.decor)}, ${scene.lieu.trim() || "lieu non précisé"}, ${scene.moment} — ${scene.titre}`,
          )
        : ["(aucune scène)"]),
      "</storyboard>",
    ].join("\n"),
    [
      "<decoupage>",
      ...(plans.length
        ? [
            `Nombre de plans : ${plans.length}`,
            `Mouvements : ${decompte(plans.map((plan) => plan.mouvement))}`,
            `Cadrages : ${decompte(plans.map((plan) => plan.cadrage))}`,
            `Angles : ${decompte(plans.map((plan) => plan.angle))}`,
            `Focales, en mm : ${focales.length ? focales.join(", ") : ABSENT}`,
          ]
        : ["(aucun plan)"]),
      "</decoupage>",
    ].join("\n"),
    [
      "<materiel_deja_saisi>",
      ...(materiel.length
        ? materiel.map((ligne) => `- ${ligne.categorie} | ${ligne.designation} × ${ligne.quantite}`)
        : ["(aucun)"]),
      "</materiel_deja_saisi>",
    ].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en équipements. Null si ce n'en est pas : JSON illisible,
 * liste vide ou trop longue, ou une seule ligne hors bornes — une proposition
 * à moitié valide ne se dépose pas.
 *
 * Le schéma envoyé au fournisseur ne borne ni les nombres ni les longueurs :
 * ce contrôle-ci le fait, et la base le refait au dépôt.
 */
export function lireEquipements(texte: string, max: number): EquipementPropose[] | null {
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

  const categories: readonly string[] = CATEGORIES_MATERIEL;
  const equipements: EquipementPropose[] = [];
  for (const brut of bruts) {
    if (typeof brut !== "object" || brut === null) {
      return null;
    }
    const { category, label, quantity, unit_power_watts, simultaneous } = brut as Record<
      string,
      unknown
    >;
    if (
      typeof category !== "string" ||
      !categories.includes(category) ||
      typeof label !== "string" ||
      typeof simultaneous !== "boolean" ||
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > QUANTITE_MAX
    ) {
      return null;
    }
    // Absente ou nulle : l'agent ne s'avance pas. Sinon, un entier borné.
    let puissance: number | null = null;
    if (unit_power_watts !== null && unit_power_watts !== undefined) {
      if (
        typeof unit_power_watts !== "number" ||
        !Number.isInteger(unit_power_watts) ||
        unit_power_watts < 0 ||
        unit_power_watts > PUISSANCE_MAX
      ) {
        return null;
      }
      puissance = unit_power_watts;
    }
    const designation = label.replace(/\s+/g, " ").trim();
    if (
      designation.length < 1 ||
      designation.length > DESIGNATION_MAX ||
      /[\u0000-\u001f\u007f]/.test(designation)
    ) {
      return null;
    }
    equipements.push({
      category,
      label: designation,
      quantity,
      unit_power_watts: puissance,
      simultaneous,
    });
  }
  return equipements;
}

function executeurMateriel(
  base: Base,
  fournisseur: Fournisseur,
  profil: ProfilStructure,
): Executeur {
  return creerExecuteur<EquipementPropose[]>(base, fournisseur, {
    profil,
    preparer: async (attemptId) => {
      const contexte = await lireContexteMateriel(base, attemptId);
      return contexte ? composerContexteMateriel(contexte, profil.objectif) : null;
    },
    lire: (texte) => lireEquipements(texte, profil.lignesMax),
    deposer: (attemptId, equipements) => livrerPropositionMateriel(base, attemptId, equipements),
    inexploitable: "La réponse du fournisseur n'est pas une liste de matériel exploitable.",
  });
}

/**
 * Fabrique de l'exécuteur de chaque action de GEAR. Un profil sans fabrique
 * ne serait servi par personne : un test d'architecture les tient accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: Fournisseur, profil: ProfilStructure) => Executeur>
> = {
  gear_list: executeurMateriel,
};

/** Ce que GEAR sait exécuter, avec ce fournisseur. */
export function executeursGear(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_GEAR).flatMap(([action, profil]) =>
      FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
    ),
  );
}
