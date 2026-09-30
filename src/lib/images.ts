/**
 * Images de projet : constantes partagées entre le navigateur, qui envoie
 * les fichiers, et le serveur, qui les rattache et délivre les liens.
 *
 * Les mêmes limites sont imposées par le compartiment Supabase (migration
 * images) : celles-ci ne servent qu'à prévenir l'utilisateur avant l'envoi.
 */

export const COMPARTIMENT_IMAGES = "project-images";

export const TAILLE_IMAGE_MAX = 5 * 1024 * 1024;

export const TYPES_IMAGE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export type DossierImage = "couverture" | "scenes";

/**
 * Durée de validité d'un lien signé. Une heure couvre une séance de
 * travail ; au-delà, un rechargement de page en délivre un nouveau.
 */
export const DUREE_LIEN_SECONDES = 60 * 60;

/** Vérifie qu'un chemin désigne bien un fichier du projet et du dossier attendus. */
export function estCheminDe(chemin: string, projetId: string, dossier: DossierImage): boolean {
  const prefixe = `${projetId}/${dossier}/`;
  const fichier = chemin.slice(prefixe.length);
  return chemin.startsWith(prefixe) && fichier.length > 0 && !fichier.includes("/");
}

/** Refus lisible, ou null si le fichier peut partir. */
export function verifierFichier(fichier: { type: string; size: number }): string | null {
  if (!Object.hasOwn(TYPES_IMAGE, fichier.type)) {
    return "Formats acceptés : JPEG, PNG ou WebP.";
  }
  if (fichier.size > TAILLE_IMAGE_MAX) {
    return "L'image dépasse 5 Mo. Réduisez-la avant de l'envoyer.";
  }
  return null;
}
