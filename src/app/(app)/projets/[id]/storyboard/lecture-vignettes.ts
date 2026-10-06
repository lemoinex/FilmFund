import { etapeProposition, LIVRABLE_VIGNETTE, type EtapeProposition } from "@/lib/propositions";
import type { createClient } from "@/lib/supabase/server";

/** Où en est la vignette d'une scène, et l'identifiant de celle qui attend une décision. */
export type VignetteScene = { etape: EtapeProposition; imageId: string | null };

export const VIGNETTE_AU_REPOS: VignetteScene = { etape: { etape: "repos" }, imageId: null };

/** Tâches de vignette relues pour retrouver la dernière de chaque scène. */
const TACHES_LUES = 200;

/**
 * Où en est, scène par scène, la dernière demande de vignette.
 *
 * Lectures bornées, sous la RLS de l'appelant, et sans jamais lire le fichier
 * d'une image : il ne se charge que par sa route. Qui écrit le storyboard
 * suit chaque demande depuis sa tâche ; un lecteur ne lit que les vignettes
 * en attente — il n'a pas à voir une demande en cours, seulement ce qui est
 * proposé à l'équipe.
 */
export async function lireVignettes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  peutDecider: boolean,
): Promise<Map<string, VignetteScene>> {
  const parScene = new Map<string, VignetteScene>();

  if (peutDecider) {
    const { data: taches } = await supabase
      .from("jobs")
      .select("id, state, params")
      .eq("project_id", projetId)
      .eq("action", LIVRABLE_VIGNETTE.action)
      .order("created_at", { ascending: false })
      .limit(TACHES_LUES);

    // La plus récente de chaque scène : la liste est déjà dans cet ordre.
    const dernieres = new Map<string, { id: string; state: string }>();
    for (const tache of taches ?? []) {
      const scene =
        tache.params && typeof tache.params === "object" && !Array.isArray(tache.params)
          ? tache.params.scene
          : null;
      if (typeof scene === "string" && !dernieres.has(scene)) {
        dernieres.set(scene, { id: tache.id, state: tache.state });
      }
    }
    if (!dernieres.size) {
      return parScene;
    }

    const { data: propositions } = await supabase
      .from("ai_suggestions")
      .select("id, content, state, job_id")
      .in(
        "job_id",
        [...dernieres.values()].map((tache) => tache.id),
      );

    for (const [scene, tache] of dernieres) {
      const proposition = (propositions ?? []).find((p) => p.job_id === tache.id) ?? null;
      parScene.set(scene, { etape: etapeProposition(tache, proposition), imageId: null });
    }
  }

  // Les vignettes en attente, sans leur fichier. Pour qui décide, elles
  // complètent les étapes ci-dessus ; pour un lecteur, elles sont tout ce
  // qu'il voit.
  const { data: images } = await supabase
    .from("ai_suggestion_images")
    .select("id, suggestion_id, scene_id")
    .eq("project_id", projetId)
    .eq("state", "proposed")
    .order("created_at", { ascending: false })
    .limit(TACHES_LUES);

  for (const image of images ?? []) {
    const connue = parScene.get(image.scene_id);
    if (peutDecider) {
      // Seule la vignette de la dernière demande de la scène se décide.
      if (
        connue?.etape.etape === "proposition" &&
        connue.etape.propositionId === image.suggestion_id
      ) {
        connue.imageId = image.id;
      }
    } else if (!connue) {
      // La première rencontrée est la plus récente.
      parScene.set(image.scene_id, {
        etape: { etape: "proposition", propositionId: image.suggestion_id, texte: "" },
        imageId: image.id,
      });
    }
  }

  return parScene;
}
