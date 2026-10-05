import type { GearCategory } from "@/lib/supabase/types";

/**
 * Matériel d'un tournage : libellés et bornes, les mêmes que celles de la
 * base. Module sans import à l'exécution : les tests Node le chargent tel quel.
 */

/** Catégories, dans l'ordre où l'écran les présente. */
export const CATEGORIES_MATERIEL: Record<GearCategory, string> = {
  image: "Image",
  lumiere: "Lumière",
  son: "Son",
  machinerie: "Machinerie",
  energie: "Énergie",
  regie: "Régie",
};

export const DESIGNATION_MAX = 200;
export const QUANTITE = { min: 1, max: 1000 } as const;
export const PUISSANCE_WATTS = { min: 0, max: 1_000_000 } as const;
export const TENSION_VOLTS = { min: 100, max: 250 } as const;
export const MARGE_POURCENT = { min: 0, max: 100 } as const;

/**
 * Réglages retenus tant qu'un projet n'a pas les siens. Un choix du lot, pas
 * une norme : l'écran le dit et renvoie au chef électricien.
 */
export const REGLAGES_PAR_DEFAUT = { tension: 230, marge: 30 } as const;

/** Au-delà, l'écran ne propose plus d'ajout : une liste, pas un inventaire. */
export const EQUIPEMENTS_MAX = 300;

export function estCategorieMateriel(valeur: string): valeur is GearCategory {
  return Object.hasOwn(CATEGORIES_MATERIEL, valeur);
}
