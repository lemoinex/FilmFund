"use server";

import { revalidatePath } from "next/cache";

import { normaliserProfil } from "@/lib/profils";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

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
