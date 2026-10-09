"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  ERREURS_EPISODE,
  ERREURS_SCENARIO,
  messageEpisode,
  normaliserEpisode,
  titreScenarioEpisode,
} from "@/lib/episodes";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Épisodes d'une série. Chaque valeur est relue et validée ici, puis encore
 * par les contraintes de la table. La RLS décide qui écrit — porteur,
 * éditeurs, administrateurs —, et la base refuse un épisode hors d'une série
 * ou un numéro déjà pris. Aucun rôle de service.
 */

export type EtatEpisode = { erreur: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lireEpisode(formData: FormData) {
  return normaliserEpisode({
    number: formData.get("number"),
    title: formData.get("title"),
    summary: formData.get("summary") ?? "",
    duration_minutes: formData.get("duration_minutes") ?? "",
  });
}

function revaliderEpisodes(projetId: string): void {
  revalidatePath(`/projets/${projetId}/episodes`);
  revalidatePath(`/projets/${projetId}/fiche`);
}

export async function ajouterEpisode(
  _etatPrecedent: EtatEpisode,
  formData: FormData,
): Promise<EtatEpisode> {
  const projetId = String(formData.get("projet") ?? "");
  if (!UUID.test(projetId)) return { erreur: "Projet introuvable." };

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const lu = lireEpisode(formData);
  if ("erreur" in lu) return lu;

  const { error } = await supabase.from("project_episodes").insert({
    ...lu.episode,
    project_id: projetId,
    created_by: garde.user.id,
  });

  if (error) {
    return { erreur: messageEpisode(error.code) };
  }

  revaliderEpisodes(projetId);
  return null;
}

export async function modifierEpisode(
  _etatPrecedent: EtatEpisode,
  formData: FormData,
): Promise<EtatEpisode> {
  const projetId = String(formData.get("projet") ?? "");
  const episodeId = String(formData.get("episode") ?? "");
  if (!UUID.test(projetId) || !UUID.test(episodeId)) return { erreur: "Épisode introuvable." };

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const lu = lireEpisode(formData);
  if ("erreur" in lu) return lu;

  const { data, error } = await supabase
    .from("project_episodes")
    .update(lu.episode)
    .eq("id", episodeId)
    .eq("project_id", projetId)
    .select("id");

  if (error) return { erreur: messageEpisode(error.code) };
  // Sans droit, la RLS ne touche aucune ligne et ne rend aucune erreur.
  if (!data?.length) return { erreur: messageEpisode(ERREURS_EPISODE.refus) };

  revaliderEpisodes(projetId);
  redirect(`/projets/${projetId}/episodes#episode-${episodeId}`);
}

export async function supprimerEpisode(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const episodeId = String(formData.get("episode") ?? "");
  if (!UUID.test(projetId) || !UUID.test(episodeId)) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) return;

  // La RLS a le dernier mot : sans droit, aucune ligne n'est touchée.
  await supabase.from("project_episodes").delete().eq("id", episodeId).eq("project_id", projetId);

  revaliderEpisodes(projetId);
}

/**
 * Crée le scénario d'un épisode, en brouillon, et y mène. Si l'épisode en a
 * déjà un — créé entre-temps par un autre membre —, c'est lui qui s'ouvre :
 * la base n'en admet qu'un par épisode.
 *
 * Le titre vient du numéro lu en base, pas du navigateur. La RLS décide qui
 * crée un document ; la base vérifie que l'épisode est bien de ce projet.
 */
export async function creerScenarioEpisode(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const episodeId = String(formData.get("episode") ?? "");
  if (!UUID.test(projetId) || !UUID.test(episodeId)) return;

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return;

  // L'épisode de ce projet, sous la RLS : illisible, il ne reçoit rien.
  const { data: episode } = await supabase
    .from("project_episodes")
    .select("number")
    .eq("id", episodeId)
    .eq("project_id", projetId)
    .maybeSingle();
  if (!episode) return;

  const { data: cree, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: projetId,
      type: "scenario",
      title: titreScenarioEpisode(episode.number),
      episode_id: episodeId,
      created_by: garde.user.id,
    })
    .select("id")
    .maybeSingle();

  let documentId = cree?.id;
  if (error?.code === ERREURS_SCENARIO.dejaRattache) {
    const { data: existant } = await supabase
      .from("project_documents")
      .select("id")
      .eq("project_id", projetId)
      .eq("episode_id", episodeId)
      .maybeSingle();
    documentId = existant?.id;
  }
  if (!documentId) return;

  revaliderEpisodes(projetId);
  revalidatePath(`/projets/${projetId}/documents`);
  redirect(`/projets/${projetId}/documents/${documentId}`);
}
