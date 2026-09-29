import type { SceneSetting, SceneTime, ShotType } from "@/lib/supabase/types";

/** Abréviations d'usage dans un en-tête de scène. */
export const DECORS: Record<SceneSetting, { abrege: string; libelle: string }> = {
  int: { abrege: "INT.", libelle: "Intérieur" },
  ext: { abrege: "EXT.", libelle: "Extérieur" },
  int_ext: { abrege: "INT./EXT.", libelle: "Intérieur / extérieur" },
};

export const MOMENTS: Record<SceneTime, string> = {
  jour: "Jour",
  nuit: "Nuit",
  aube: "Aube",
  crepuscule: "Crépuscule",
};

/** Échelle des plans, du plus large au plus serré. */
export const CADRAGES: Record<ShotType, string> = {
  plan_ensemble: "Plan d'ensemble",
  plan_large: "Plan large",
  plan_moyen: "Plan moyen",
  plan_americain: "Plan américain",
  plan_rapproche: "Plan rapproché",
  gros_plan: "Gros plan",
  tres_gros_plan: "Très gros plan",
  insert: "Insert",
  plan_sequence: "Plan-séquence",
};

export const TITRE_SCENE_MAX = 200;
export const LIEU_MAX = 200;
export const DESCRIPTION_SCENE_MAX = 5000;

export function estDecor(valeur: string): valeur is SceneSetting {
  return Object.hasOwn(DECORS, valeur);
}

export function estMoment(valeur: string): valeur is SceneTime {
  return Object.hasOwn(MOMENTS, valeur);
}

export function estCadrage(valeur: string): valeur is ShotType {
  return Object.hasOwn(CADRAGES, valeur);
}

/**
 * En-tête au format scénario : « EXT. BERGES DU NIGER — NUIT ».
 *
 * En capitales, selon l'usage ; sans lieu renseigné, l'en-tête garde le
 * décor et le moment plutôt que d'afficher un trou.
 */
export function enteteScene(scene: {
  setting: SceneSetting;
  location: string;
  time_of_day: SceneTime;
}): string {
  const lieu = scene.location.trim();
  return [DECORS[scene.setting].abrege, lieu, "—", MOMENTS[scene.time_of_day]]
    .filter(Boolean)
    .join(" ")
    .toLocaleUpperCase("fr-FR");
}

/** Numéro de scène sur deux chiffres, comme sur une planche de storyboard. */
export function numeroScene(index: number): string {
  return String(index + 1).padStart(2, "0");
}
