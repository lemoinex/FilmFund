import type { ShotAngle, ShotMovement } from "@/lib/supabase/types";

/**
 * Découpage technique : les plans d'une scène du storyboard. Libellés et
 * bornes, les mêmes que celles de la base. Le cadrage d'un plan reprend
 * l'échelle du storyboard (`CADRAGES`). Module sans import à l'exécution :
 * les tests Node le chargent tel quel.
 */

export const ANGLES: Record<ShotAngle, string> = {
  normal: "Normal",
  plongee: "Plongée",
  contre_plongee: "Contre-plongée",
};

export const MOUVEMENTS: Record<ShotMovement, string> = {
  fixe: "Fixe",
  panoramique: "Panoramique",
  travelling: "Travelling",
  epaule: "À l'épaule",
  autre: "Autre",
};

export const DESCRIPTION_PLAN_MAX = 500;
export const FOCALE_MM = { min: 1, max: 2000 } as const;
export const DUREE_PLAN_SECONDES = { min: 1, max: 3600 } as const;

/** Au-delà, l'écran ne propose plus d'ajout dans la scène. */
export const PLANS_PAR_SCENE_MAX = 50;

export function estAngle(valeur: string): valeur is ShotAngle {
  return Object.hasOwn(ANGLES, valeur);
}

export function estMouvement(valeur: string): valeur is ShotMovement {
  return Object.hasOwn(MOUVEMENTS, valeur);
}

/** « 45 s », « 1 min 05 s ». */
export function formaterDureePlan(secondes: number): string {
  if (secondes < 60) {
    return `${secondes} s`;
  }
  const reste = secondes % 60;
  const minutes = Math.floor(secondes / 60);
  return reste ? `${minutes} min ${String(reste).padStart(2, "0")} s` : `${minutes} min`;
}

/**
 * En-tête du découpage d'une scène : « 3 plans · 24 s ».
 *
 * La durée n'est donnée que si chaque plan a la sienne : un total partiel se
 * lirait comme la durée de la scène.
 */
export function resumeDecoupage(plans: readonly { duration_seconds: number | null }[]): string {
  if (!plans.length) {
    return "aucun plan";
  }
  const nombre = `${plans.length} plan${plans.length > 1 ? "s" : ""}`;
  let total = 0;
  for (const plan of plans) {
    if (plan.duration_seconds === null) {
      return nombre;
    }
    total += plan.duration_seconds;
  }
  return `${nombre} · ${formaterDureePlan(total)}`;
}
