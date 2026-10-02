"use server";

import { revalidatePath } from "next/cache";

import {
  COMPARTIMENT_PHOTOS,
  estCheminPhotoDe,
  extensionDesOctets,
  extensionDuChemin,
  photosOrphelines,
  TAILLE_PHOTO_MAX,
} from "@/lib/photos";
import { normaliserProfil } from "@/lib/profils";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

export type EtatProfil = { erreur: string } | { message: string } | null;

export async function mettreAJourProfil(
  _etatPrecedent: EtatProfil,
  formData: FormData,
): Promise<EtatProfil> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { user } = garde;

  /*
   * Validation côté serveur, même si le formulaire contraint déjà les
   * valeurs : le client peut envoyer ce qu'il veut. Seuls les champs nommés
   * ici partent en base — le rôle n'en fait pas partie, et un champ « role »
   * glissé dans le formulaire serait ignoré.
   */
  const lecture = normaliserProfil({
    display_name: formData.get("nomAffiche"),
    first_name: formData.get("prenom"),
    last_name: formData.get("nom"),
    country: formData.get("pays"),
    city: formData.get("ville"),
    profession: formData.get("profession"),
    profile_type: formData.get("type"),
  });
  if ("erreur" in lecture) {
    return lecture;
  }

  /*
   * Le compte modifié est celui de la session, jamais un identifiant venu du
   * formulaire. Le filtre compte autant que la RLS : celle-ci laisse un
   * administrateur modifier tout profil, et cet écran n'est que le sien.
   */
  const { data, error } = await supabase
    .from("profiles")
    .update(lecture.profil)
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { erreur: "L'enregistrement du profil a échoué. Réessayez dans un instant." };
  }

  // Le nom affiché figure dans la coque de l'espace connecté, et le prénom
  // sur le tableau de bord.
  revalidatePath("/", "layout");
  return { message: "Profil enregistré." };
}

/*
 * Photo de profil.
 *
 * Le fichier est déjà dans le stockage quand ces actions s'exécutent : le
 * navigateur l'y a envoyé directement, sous le contrôle des politiques de
 * stockage — les actions serveur plafonnent le corps d'une requête à 1 Mo.
 * `definirPhoto` contrôle ses octets réels, enregistre son chemin, puis
 * supprime la photo remplacée. En cas d'échec, le fichier envoyé est
 * supprimé à son tour.
 */

export type EtatPhoto = { erreur: string } | { ok: true };

const PAS_UNE_IMAGE = "Ce fichier n'est pas une image JPEG, PNG ou WebP valide.";

async function supprimerPhotos(supabase: ClientServeur, chemins: (string | null | undefined)[]) {
  const aSupprimer = chemins.filter((chemin): chemin is string => Boolean(chemin));
  if (aSupprimer.length) {
    await supabase.storage.from(COMPARTIMENT_PHOTOS).remove(aSupprimer);
  }
}

/**
 * Supprime les fichiers du dossier du compte que le profil ne désigne pas :
 * envois interrompus avant leur rattachement, suppressions précédentes en
 * échec. Un échec ici est sans conséquence : le passage suivant les
 * reprendra.
 */
async function nettoyerPhotosOrphelines(
  supabase: ClientServeur,
  compteId: string,
  actuelle: string | null,
) {
  const { data } = await supabase.storage.from(COMPARTIMENT_PHOTOS).list(compteId, { limit: 100 });
  await supprimerPhotos(supabase, photosOrphelines(compteId, data ?? [], actuelle, Date.now()));
}

export async function definirPhoto(formData: FormData): Promise<EtatPhoto> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { user } = garde;

  // Le dossier est celui du compte de la session, jamais un identifiant
  // venu du formulaire.
  const chemin = formData.get("chemin");
  if (!estCheminPhotoDe(chemin, user.id)) {
    return { erreur: "Photo invalide." };
  }

  /*
   * Octets réels : le compartiment n'a vérifié que le type déclaré par le
   * navigateur. Un fichier qui n'est pas l'image annoncée par son extension
   * n'est jamais rattaché.
   */
  const { data: fichier } = await supabase.storage.from(COMPARTIMENT_PHOTOS).download(chemin);
  const octets = fichier ? new Uint8Array(await fichier.slice(0, 16).arrayBuffer()) : null;
  if (
    !fichier ||
    fichier.size > TAILLE_PHOTO_MAX ||
    !octets ||
    extensionDesOctets(octets) !== extensionDuChemin(chemin)
  ) {
    await supprimerPhotos(supabase, [chemin]);
    return { erreur: PAS_UNE_IMAGE };
  }

  const { data: avant } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: chemin })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    await supprimerPhotos(supabase, [chemin]);
    return { erreur: "La photo n'a pas pu être enregistrée. Réessayez dans un instant." };
  }

  if (avant?.avatar_path && avant.avatar_path !== chemin) {
    await supprimerPhotos(supabase, [avant.avatar_path]);
  }
  await nettoyerPhotosOrphelines(supabase, user.id, chemin);

  // La photo figure aussi dans la coque de l'espace connecté.
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function retirerPhoto(): Promise<EtatPhoto> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { user } = garde;

  const { data: avant } = await supabase
    .from("profiles")
    .select("avatar_path")
    .eq("id", user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_path: null })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { erreur: "La photo n'a pas pu être retirée. Réessayez dans un instant." };
  }

  await supprimerPhotos(supabase, [avant?.avatar_path]);
  await nettoyerPhotosOrphelines(supabase, user.id, null);

  revalidatePath("/", "layout");
  return { ok: true };
}
