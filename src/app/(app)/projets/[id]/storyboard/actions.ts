"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  DESCRIPTION_PLAN_MAX,
  DUREE_PLAN_SECONDES,
  estAngle,
  estMouvement,
  FOCALE_MM,
  PLANS_PAR_SCENE_MAX,
} from "@/lib/decoupage";
import { lireEntier } from "@/lib/materiel-calculs";
import {
  DESCRIPTION_SCENE_MAX,
  estCadrage,
  estDecor,
  estMoment,
  LIEU_MAX,
  TITRE_SCENE_MAX,
} from "@/lib/storyboard";
import { exigerAcces } from "@/lib/supabase/garde";
import { supprimerImages } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";
import type {
  SceneSetting,
  SceneTime,
  ShotAngle,
  ShotMovement,
  ShotType,
} from "@/lib/supabase/types";

/*
 * Les droits sont vérifiés par la RLS (peut_editer_contenu) et, pour le
 * déplacement, par la fonction deplacer_scene, qui s'exécute avec les droits
 * de l'appelant.
 */

export type EtatScene = { erreur: string } | null;

const REFUS = "Vous n'avez pas le droit de modifier ce storyboard.";

type SceneValidee = {
  title: string;
  setting: SceneSetting;
  location: string;
  time_of_day: SceneTime;
  shot: ShotType | null;
  description: string;
};

function validerScene(formData: FormData): { erreur: string } | { scene: SceneValidee } {
  const titre = String(formData.get("titre") ?? "").trim();
  const decor = String(formData.get("decor") ?? "");
  const lieu = String(formData.get("lieu") ?? "").trim();
  const moment = String(formData.get("moment") ?? "");
  const cadrage = String(formData.get("cadrage") ?? "");
  const description = String(formData.get("description") ?? "").trim();

  if (!titre) {
    return { erreur: "Donnez un intitulé à la scène." };
  }
  if (titre.length > TITRE_SCENE_MAX) {
    return { erreur: `L'intitulé ne peut pas dépasser ${TITRE_SCENE_MAX} caractères.` };
  }
  if (lieu.length > LIEU_MAX) {
    return { erreur: `Le lieu ne peut pas dépasser ${LIEU_MAX} caractères.` };
  }
  if (description.length > DESCRIPTION_SCENE_MAX) {
    return {
      erreur: `La description ne peut pas dépasser ${DESCRIPTION_SCENE_MAX} caractères.`,
    };
  }
  if (!estDecor(decor) || !estMoment(moment)) {
    return { erreur: "Décor ou moment inconnu." };
  }
  // Le cadrage est facultatif : une chaîne vide signifie « non précisé ».
  if (cadrage && !estCadrage(cadrage)) {
    return { erreur: "Cadrage inconnu." };
  }

  return {
    scene: {
      title: titre,
      setting: decor,
      location: lieu,
      time_of_day: moment,
      shot: cadrage && estCadrage(cadrage) ? cadrage : null,
      description,
    },
  };
}

export async function ajouterScene(
  _etatPrecedent: EtatScene,
  formData: FormData,
): Promise<EtatScene> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const resultat = validerScene(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  // La nouvelle scène prend la dernière place. Si un coéquipier ajoute une
  // scène au même instant, la contrainte d'unicité refuse l'un des deux
  // ajouts : on retente une fois avec la position suivante.
  for (let tentative = 0; tentative < 2; tentative++) {
    const { data: derniere } = await supabase
      .from("storyboard_scenes")
      .select("position")
      .eq("project_id", projetId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error } = await supabase.from("storyboard_scenes").insert({
      project_id: projetId,
      position: (derniere?.position ?? 0) + 1,
      created_by: garde.user.id,
      ...resultat.scene,
    });

    if (!error) {
      revalidatePath(`/projets/${projetId}/storyboard`);
      revalidatePath("/tableau-de-bord");
      revalidatePath("/storyboard");
      return null;
    }
    if (error.code !== "23505") {
      return { erreur: error.code === "42501" ? REFUS : "L'ajout de la scène a échoué." };
    }
  }

  return { erreur: "Le storyboard vient d'être modifié par ailleurs. Réessayez." };
}

export async function modifierScene(
  _etatPrecedent: EtatScene,
  formData: FormData,
): Promise<EtatScene> {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  if (!projetId || !sceneId) {
    return { erreur: "Scène introuvable." };
  }

  const resultat = validerScene(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("storyboard_scenes")
    .update(resultat.scene)
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS };
  }

  revalidatePath(`/projets/${projetId}/storyboard`);
  redirect(`/projets/${projetId}/storyboard#scene-${sceneId}`);
}

export async function deplacerScene(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  const sens = String(formData.get("sens") ?? "");
  if (!projetId || !sceneId || (sens !== "haut" && sens !== "bas")) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.rpc("deplacer_scene", { p_scene_id: sceneId, p_vers_le_haut: sens === "haut" });

  revalidatePath(`/projets/${projetId}/storyboard`);
}

export async function supprimerScene(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  if (!projetId || !sceneId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  const { data: supprimees } = await supabase
    .from("storyboard_scenes")
    .delete()
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .select("image_path");

  // L'image part avec la scène, et seulement si la scène est bien partie.
  await supprimerImages(
    supabase,
    (supprimees ?? []).map((s) => s.image_path),
  );

  revalidatePath(`/projets/${projetId}/storyboard`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/storyboard");
}

/*
 * Découpage technique : les plans d'une scène. Mêmes droits que la scène,
 * vérifiés par la RLS ; le déplacement passe par `deplacer_plan`, qui
 * s'exécute avec les droits de l'appelant.
 */

export type EtatPlan = { erreur: string } | null;

const REFUS_PLAN = "Vous n'avez pas le droit de modifier ce découpage.";

type PlanValide = {
  shot: ShotType;
  focal_mm: number | null;
  angle: ShotAngle;
  movement: ShotMovement;
  description: string;
  duration_seconds: number | null;
};

function validerPlan(formData: FormData): { erreur: string } | { plan: PlanValide } {
  const cadrage = String(formData.get("cadrage") ?? "");
  const angle = String(formData.get("angle") ?? "");
  const mouvement = String(formData.get("mouvement") ?? "");
  const description = String(formData.get("description") ?? "").trim();
  const focale = lireEntier(String(formData.get("focale") ?? ""), FOCALE_MM);
  const duree = lireEntier(String(formData.get("duree") ?? ""), DUREE_PLAN_SECONDES);

  if (!estCadrage(cadrage)) {
    return { erreur: "Choisissez le cadrage du plan." };
  }
  if (!estAngle(angle) || !estMouvement(mouvement)) {
    return { erreur: "Angle ou mouvement inconnu." };
  }
  if (focale === "invalide") {
    return {
      erreur: `La focale est un nombre entier de millimètres, de ${FOCALE_MM.min} à ${FOCALE_MM.max}.`,
    };
  }
  if (duree === "invalide") {
    return {
      erreur: `La durée est un nombre entier de secondes, de ${DUREE_PLAN_SECONDES.min} à ${DUREE_PLAN_SECONDES.max}.`,
    };
  }
  if (description.length > DESCRIPTION_PLAN_MAX) {
    return {
      erreur: `La description ne peut pas dépasser ${DESCRIPTION_PLAN_MAX} caractères.`,
    };
  }

  return {
    plan: {
      shot: cadrage,
      focal_mm: focale,
      angle,
      movement: mouvement,
      description,
      duration_seconds: duree,
    },
  };
}

export async function ajouterPlan(_etatPrecedent: EtatPlan, formData: FormData): Promise<EtatPlan> {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  if (!projetId || !sceneId) {
    return { erreur: "Scène introuvable." };
  }

  const resultat = validerPlan(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  // Le plan prend la dernière place de sa scène ; un ajout simultané par un
  // coéquipier est refusé par la contrainte d'unicité, et retenté une fois.
  for (let tentative = 0; tentative < 2; tentative++) {
    const { data: derniers, count } = await supabase
      .from("scene_shots")
      .select("position", { count: "exact" })
      .eq("scene_id", sceneId)
      .eq("project_id", projetId)
      .order("position", { ascending: false })
      .limit(1);

    if ((count ?? 0) >= PLANS_PAR_SCENE_MAX) {
      return { erreur: `Une scène compte ${PLANS_PAR_SCENE_MAX} plans au plus.` };
    }

    const { error } = await supabase.from("scene_shots").insert({
      project_id: projetId,
      scene_id: sceneId,
      position: (derniers?.[0]?.position ?? 0) + 1,
      created_by: garde.user.id,
      ...resultat.plan,
    });

    if (!error) {
      revalidatePath(`/projets/${projetId}/storyboard`);
      return null;
    }
    // 23503 : la scène n'est pas — ou plus — celle de ce projet.
    if (error.code === "23503") {
      return { erreur: "Scène introuvable." };
    }
    if (error.code !== "23505") {
      return { erreur: error.code === "42501" ? REFUS_PLAN : "L'ajout du plan a échoué." };
    }
  }

  return { erreur: "Le découpage vient d'être modifié par ailleurs. Réessayez." };
}

export async function modifierPlan(
  _etatPrecedent: EtatPlan,
  formData: FormData,
): Promise<EtatPlan> {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  const planId = String(formData.get("plan") ?? "");
  if (!projetId || !sceneId || !planId) {
    return { erreur: "Plan introuvable." };
  }

  const resultat = validerPlan(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("scene_shots")
    .update(resultat.plan)
    .eq("id", planId)
    .eq("scene_id", sceneId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS_PLAN };
  }

  revalidatePath(`/projets/${projetId}/storyboard`);
  redirect(`/projets/${projetId}/storyboard?decoupage=${sceneId}#scene-${sceneId}`);
}

export async function deplacerPlan(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const planId = String(formData.get("plan") ?? "");
  const sens = String(formData.get("sens") ?? "");
  if (!projetId || !planId || (sens !== "haut" && sens !== "bas")) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.rpc("deplacer_plan", { p_plan_id: planId, p_vers_le_haut: sens === "haut" });

  revalidatePath(`/projets/${projetId}/storyboard`);
}

export async function supprimerPlan(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const planId = String(formData.get("plan") ?? "");
  if (!projetId || !planId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("scene_shots").delete().eq("id", planId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/storyboard`);
}
