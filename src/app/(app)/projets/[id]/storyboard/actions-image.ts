"use server";

import { revalidatePath } from "next/cache";

import { COMPARTIMENT_IMAGES } from "@/lib/images";
import { LIVRABLE_VIGNETTE, lireVignette, messageErreur } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { nettoyerImagesOrphelines, supprimerImages } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de storyboard : la vignette d'une scène.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent une image, puis acceptent ou écartent la vignette que le
 * worker a déposée. Les droits et le quota sont décidés par la base ; rien de
 * ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable, ni le modèle, ni le style, ni le
 * nombre d'images : il désigne une scène, que la base vérifie.
 *
 * Accepter est le seul geste qui change l'image d'une scène. Le worker n'a
 * aucun droit sur le stockage : c'est ici, sous la session de qui décide, que
 * le fichier y est déposé, avant que la base ne le rattache.
 */

const ACTION = LIVRABLE_VIGNETTE.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string, imageChangee = false): void {
  revalidatePath(`/projets/${projetId}/storyboard`);
  if (imageChangee) {
    revalidatePath("/storyboard");
    revalidatePath("/tableau-de-bord");
  }
}

export async function demanderDevisVignette(
  projetId: string,
  sceneId: string,
): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(sceneId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: ACTION,
    p_params: { scene: sceneId },
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageErreur(error?.code) };
  }

  return {
    devis: {
      id: devis.quote_id,
      quantite: devis.quantity,
      disponible: devis.available,
      allocation: devis.allowance,
    },
  };
}

/**
 * Accepte le devis : l'image est réservée et la tâche naît. La clé vient du
 * navigateur, qui la garde le temps de la demande : un double envoi renvoie
 * la même réservation au lieu d'en créer une seconde.
 */
export async function lancerVignette(
  projetId: string,
  devisId: string,
  cle: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(devisId) || !UUID.test(cle)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_devis", {
    p_quote_id: devisId,
    p_idempotency_key: cle,
  });
  if (error) {
    return { erreur: messageErreur(error.code) };
  }

  revalider(projetId);
  return { ok: true };
}

export async function annulerVignette(
  projetId: string,
  tacheId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(tacheId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("annuler_travail", { p_job_id: tacheId });
  // La page est rafraîchie même en cas de refus : la tâche a pu être prise
  // entre-temps, et l'écran doit le montrer.
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte la vignette : elle devient l'image de sa scène.
 *
 * Trois temps, sous la session de qui décide. Le fichier est relu en base —
 * seulement ce que la RLS lui ouvre — et déposé dans le compartiment privé ;
 * la base vérifie qu'il y est, le rattache à la scène et rend l'image que la
 * scène portait ; cette ancienne image est alors supprimée. Si la base
 * refuse, le fichier tout juste déposé est retiré : rien ne traîne.
 */
export async function accepterVignette(
  projetId: string,
  imageId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(imageId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }
  const { supabase } = acces;

  const { data: vignette } = await supabase
    .from("ai_suggestion_images")
    .select("file, state")
    .eq("id", imageId)
    .eq("project_id", projetId)
    .maybeSingle();
  const fichier = vignette?.state === "proposed" ? lireVignette(vignette.file) : null;
  if (!fichier) {
    revalider(projetId);
    return { erreur: "Cette vignette n'attend plus de décision." };
  }

  // Le nom est tiré au sort ici : rien du chemin ne vient du navigateur.
  const chemin = `${projetId}/scenes/${crypto.randomUUID()}.png`;
  const { error: depot } = await supabase.storage
    .from(COMPARTIMENT_IMAGES)
    .upload(chemin, fichier, { contentType: "image/png", upsert: false });
  if (depot) {
    return { erreur: "La vignette n'a pas pu être enregistrée. Réessayez dans un instant." };
  }

  const { data: ancienne, error } = await supabase.rpc("accepter_image_proposee", {
    p_image_id: imageId,
    p_path: chemin,
  });
  if (error) {
    await supprimerImages(supabase, [chemin]);
    revalider(projetId);
    return { erreur: messageErreur(error.code) };
  }

  if (ancienne && ancienne !== chemin) {
    await supprimerImages(supabase, [ancienne]);
  }
  await nettoyerImagesOrphelines(supabase, projetId);
  revalider(projetId, true);
  return { ok: true };
}

/** Écarte la vignette : la scène garde l'image qu'elle avait, ou n'en a pas. */
export async function ecarterVignette(
  projetId: string,
  imageId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(imageId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_image_proposee", { p_image_id: imageId });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}
