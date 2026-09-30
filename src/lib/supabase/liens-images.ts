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
