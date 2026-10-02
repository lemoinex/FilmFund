/**
 * Photo de profil : limites, chemins et contrôle des octets, partagés entre
 * le navigateur, qui envoie le fichier, et le serveur, qui le rattache.
 *
 * Les mêmes limites sont imposées par le compartiment Supabase (migration
 * photos de profil) : celles-ci ne servent qu'à prévenir l'utilisateur avant
 * l'envoi. Module pur, testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

export const COMPARTIMENT_PHOTOS = "profile-photos";

export const TAILLE_PHOTO_MAX = 2 * 1024 * 1024;

export const TYPES_PHOTO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Nom tiré au hasard, comme le produit `crypto.randomUUID()`. */
const NOM = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const COMPTE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Le chemin désigne-t-il une photo du dossier de ce compte, sous un nom de
 * la forme que produit l'application ? Même règle que la contrainte
 * `avatar_path_forme` en base.
 */
export function estCheminPhotoDe(chemin: unknown, compteId: string): chemin is string {
  return (
    typeof chemin === "string" &&
    COMPTE.test(compteId) &&
    new RegExp(`^${compteId}/${NOM}\\.(jpg|png|webp)$`).test(chemin)
  );
}

/** Refus lisible, ou null si le fichier peut partir. */
export function verifierFichierPhoto(fichier: { type: string; size: number }): string | null {
  if (!Object.hasOwn(TYPES_PHOTO, fichier.type)) {
    return "Formats acceptés : JPEG, PNG ou WebP.";
  }
  if (fichier.size > TAILLE_PHOTO_MAX) {
    return "La photo dépasse 2 Mo. Réduisez-la avant de l'envoyer.";
  }
  return null;
}

const commencePar = (octets: Uint8Array, signature: number[], depuis = 0) =>
  signature.every((octet, i) => octets[depuis + i] === octet);

/**
 * Format réel d'un fichier, d'après ses premiers octets : le type déclaré à
 * l'envoi n'est qu'une affirmation du navigateur. Nul si ce n'est ni un
 * JPEG, ni un PNG, ni un WebP.
 */
export function extensionDesOctets(octets: Uint8Array): "jpg" | "png" | "webp" | null {
  if (commencePar(octets, [0xff, 0xd8, 0xff])) {
    return "jpg";
  }
  if (commencePar(octets, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  // « RIFF », quatre octets de taille, puis « WEBP ».
  if (
    commencePar(octets, [0x52, 0x49, 0x46, 0x46]) &&
    commencePar(octets, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "webp";
  }
  return null;
}

/** Extension d'un chemin de photo : « jpg », « png » ou « webp ». */
export function extensionDuChemin(chemin: string): string {
  return chemin.slice(chemin.lastIndexOf(".") + 1);
}

/** Délai après lequel un fichier jamais rattaché est tenu pour abandonné. */
export const DELAI_ORPHELINE_MS = 60 * 60 * 1000;

/**
 * Fichiers du dossier d'un compte à supprimer : tous sauf la photo en place,
 * à condition d'avoir été déposés depuis plus d'une heure — un envoi en
 * cours, pas encore rattaché, ne doit pas disparaître sous les pieds de son
 * auteur.
 */
export function photosOrphelines(
  compteId: string,
  fichiers: readonly { name: string; created_at?: string | null }[],
  actuelle: string | null,
  maintenant: number,
): string[] {
  return fichiers
    .map((fichier) => ({ chemin: `${compteId}/${fichier.name}`, depuis: fichier.created_at }))
    .filter(
      ({ chemin, depuis }) =>
        chemin !== actuelle &&
        Boolean(depuis) &&
        maintenant - Date.parse(depuis as string) > DELAI_ORPHELINE_MS,
    )
    .map(({ chemin }) => chemin);
}

/**
 * Initiales affichées à défaut de photo : « Mireille Ébodé » → « MÉ ». Une
 * seule lettre pour un seul mot ; « ? » si le nom est vide.
 */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  const lettres = [mots[0], mots.length > 1 ? mots.at(-1) : undefined]
    .filter((mot): mot is string => Boolean(mot))
    .map((mot) => [...mot][0]);
  return lettres.join("").toLocaleUpperCase("fr") || "?";
}
