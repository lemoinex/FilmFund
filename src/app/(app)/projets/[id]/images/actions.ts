"use server";

import { revalidatePath } from "next/cache";

import { estCheminDe } from "@/lib/images";
import { exigerAcces } from "@/lib/supabase/garde";
import { nettoyerImagesOrphelines, supprimerImages } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

/*
 * Rattachement des images envoyées depuis le navigateur.
 *
 * Le fichier est déjà dans le stockage quand ces actions s'exécutent : le
 * navigateur l'y a envoyé directement, sous le contrôle des politiques de
 * stockage. Ces actions enregistrent son chemin — la contrainte SQL vérifie
 * qu'il appartient au bon projet — puis suppriment l'image remplacée. En
 * cas d'échec, le fichier fraîchement envoyé est supprimé à son tour.
 *
 * Ces suppressions peuvent elles-mêmes échouer, et un envoi interrompu
 * avant son rattachement n'appelle aucune action : chaque action se termine
 * donc par le nettoyage des images orphelines du projet.
 */

export type EtatImage = { erreur: string } | { ok: true };

const REFUS = "Vous n'avez pas le droit de modifier les images de ce projet.";

async function conclure(supabase: Awaited<ReturnType<typeof createClient>>, projetId: string) {
  await nettoyerImagesOrphelines(supabase, projetId);
  revalidatePath(`/projets/${projetId}`);
  revalidatePath(`/projets/${projetId}/storyboard`);
  revalidatePath("/tableau-de-bord");
}

export async function definirCouverture(formData: FormData): Promise<EtatImage> {
  const projetId = String(formData.get("projet") ?? "");
  const chemin = String(formData.get("chemin") ?? "");

  if (!projetId || !estCheminDe(chemin, projetId, "couverture")) {
    return { erreur: "Image invalide." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data: avant } = await supabase
    .from("projects")
    .select("cover_path")
    .eq("id", projetId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("projects")
    .update({ cover_path: chemin })
    .eq("id", projetId)
    .select("id");

  if (error || !data?.length) {
    await supprimerImages(supabase, [chemin]);
    return { erreur: error ? "L'image n'a pas pu être rattachée au projet." : REFUS };
  }

  if (avant?.cover_path && avant.cover_path !== chemin) {
    await supprimerImages(supabase, [avant.cover_path]);
  }

  await conclure(supabase, projetId);
  return { ok: true };
}

export async function retirerCouverture(formData: FormData): Promise<EtatImage> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data: avant } = await supabase
    .from("projects")
    .select("cover_path")
    .eq("id", projetId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("projects")
    .update({ cover_path: null })
    .eq("id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'image n'a pas pu être retirée." : REFUS };
  }

  await supprimerImages(supabase, [avant?.cover_path]);
  await conclure(supabase, projetId);
  return { ok: true };
}

export async function definirImageScene(formData: FormData): Promise<EtatImage> {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  const chemin = String(formData.get("chemin") ?? "");

  if (!projetId || !sceneId || !estCheminDe(chemin, projetId, "scenes")) {
    return { erreur: "Image invalide." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data: avant } = await supabase
    .from("storyboard_scenes")
    .select("image_path")
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("storyboard_scenes")
    .update({ image_path: chemin })
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    await supprimerImages(supabase, [chemin]);
    return { erreur: error ? "L'image n'a pas pu être rattachée à la scène." : REFUS };
  }

  if (avant?.image_path && avant.image_path !== chemin) {
    await supprimerImages(supabase, [avant.image_path]);
  }

  await conclure(supabase, projetId);
  return { ok: true };
}

export async function retirerImageScene(formData: FormData): Promise<EtatImage> {
  const projetId = String(formData.get("projet") ?? "");
  const sceneId = String(formData.get("scene") ?? "");
  if (!projetId || !sceneId) {
    return { erreur: "Scène introuvable." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data: avant } = await supabase
    .from("storyboard_scenes")
    .select("image_path")
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("storyboard_scenes")
    .update({ image_path: null })
    .eq("id", sceneId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'image n'a pas pu être retirée." : REFUS };
  }

  await supprimerImages(supabase, [avant?.image_path]);
  await conclure(supabase, projetId);
  return { ok: true };
}
