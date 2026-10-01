import { COMPARTIMENT_IMAGES, DUREE_LIEN_SECONDES } from "@/lib/images";
import type { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

/**
 * Liens signés pour une liste de chemins, en une seule requête.
 *
 * Délivrés avec la session de l'utilisateur : les politiques de stockage
 * décident, fichier par fichier. Un chemin refusé ou introuvable est
 * simplement absent du résultat — l'interface affiche alors l'emplacement
 * vide, plutôt qu'une image cassée.
 */
export async function liensSignes(
  supabase: ClientServeur,
  chemins: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const demandes = [...new Set(chemins.filter((c): c is string => Boolean(c)))];
  if (!demandes.length) return new Map();

  const { data } = await supabase.storage
    .from(COMPARTIMENT_IMAGES)
    .createSignedUrls(demandes, DUREE_LIEN_SECONDES);

  const liens = new Map<string, string>();
  for (const lien of data ?? []) {
    if (lien.path && lien.signedUrl && !lien.error) {
      liens.set(lien.path, lien.signedUrl);
    }
  }
  return liens;
}

/**
 * Supprime les images orphelines d'un projet : fichiers déposés depuis plus
 * d'une heure que ni la couverture ni aucune scène ne désignent.
 *
 * Appelée après chaque action sur les images du projet. Un échec est sans
 * conséquence : le passage suivant reprendra les mêmes fichiers.
 */
export async function nettoyerImagesOrphelines(
  supabase: ClientServeur,
  projetId: string,
): Promise<void> {
  const { data } = await supabase.rpc("images_orphelines", { p_project_id: projetId });
  await supprimerImages(supabase, data ?? []);
}

/** Supprime des fichiers du compartiment ; sans effet sur une liste vide. */
export async function supprimerImages(
  supabase: ClientServeur,
  chemins: (string | null | undefined)[],
): Promise<void> {
  const aSupprimer = chemins.filter((c): c is string => Boolean(c));
  if (aSupprimer.length) {
    await supabase.storage.from(COMPARTIMENT_IMAGES).remove(aSupprimer);
  }
}
