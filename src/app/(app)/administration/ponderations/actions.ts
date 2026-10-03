"use server";

import { revalidatePath } from "next/cache";

import { lireValeursPonderations } from "@/lib/maturite";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Le rôle est vérifié ici, puis de nouveau par la RLS : seule
 * l'administration publie une version des pondérations, et la base
 * journalise la publication dans la même transaction.
 */

export type EtatPonderations = { erreur: string } | { succes: string } | null;

const REFUS = "Action réservée à l'administration.";

export async function publierVersionPonderations(
  _etatPrecedent: EtatPonderations,
  formData: FormData,
): Promise<EtatPonderations> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }

  const lecture = lireValeursPonderations((code) => formData.get(code));
  if ("erreur" in lecture) {
    return lecture;
  }

  const { data, error } = await supabase
    .from("readiness_weight_versions")
    .insert(lecture.valeurs)
    .select("version_number")
    .single();

  if (error || !data) {
    return {
      erreur:
        error?.code === "42501"
          ? REFUS
          : "La publication a échoué. Vérifiez les valeurs et réessayez.",
    };
  }

  revalidatePath("/administration/ponderations");
  revalidatePath("/administration/journal");
  return {
    succes: `Version ${data.version_number} publiée. Elle s'applique aussitôt à tous les projets.`,
  };
}
