"use server";

import { revalidatePath } from "next/cache";

import { GENRES } from "@/lib/fiche";
import { jourCourant, lireOpportunite } from "@/lib/opportunites";
import { FORMATS } from "@/lib/projets";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { ProjectFormat } from "@/lib/supabase/types";

/*
 * Le rôle est vérifié ici, puis de nouveau par la RLS : seule
 * l'administration écrit le catalogue, et la base journalise chaque
 * écriture dans la même transaction.
 *
 * Chaque valeur est relue et validée ici, puis encore par les contraintes
 * de la table : ni l'auteur, ni les dates d'écriture ne viennent du
 * formulaire, et une opportunité ne se dit vérifiée qu'avec sa source.
 */

/** `fiche` : l'opportunité qui vient d'être ajoutée, pour y mener l'écran. */
export type EtatOpportunite = { erreur: string } | { succes: string; fiche?: string } | null;

const REFUS = "Action réservée à l'administration.";
/** Code de PostgreSQL pour une ligne qui en doublerait une autre. */
const DOUBLON = "23505";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalider(): void {
  revalidatePath("/administration/opportunites");
  revalidatePath("/administration/journal");
}

/** Ajoute une opportunité, ou enregistre celle que désigne le champ `id`. */
export async function enregistrerOpportunite(
  _etatPrecedent: EtatOpportunite,
  formData: FormData,
): Promise<EtatOpportunite> {
  const id = String(formData.get("id") ?? "");
  if (id && !UUID.test(id)) {
    return { erreur: "Demande invalide." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }

  const lecture = lireOpportunite(
    (champ) => formData.get(champ),
    (champ) => formData.getAll(champ),
    jourCourant(),
    { formats: FORMATS, genres: GENRES },
  );
  if ("erreur" in lecture) {
    return lecture;
  }
  // Les formats ont été contrôlés contre le référentiel : ce sont ceux de la base.
  const valeurs = { ...lecture.valeurs, formats: lecture.valeurs.formats as ProjectFormat[] };

  const { data, error } = id
    ? await supabase
        .from("funding_opportunities")
        .update(valeurs)
        .eq("id", id)
        .select("id")
        .maybeSingle()
    : await supabase.from("funding_opportunities").insert(valeurs).select("id").maybeSingle();

  if (error || !data) {
    return {
      erreur:
        error?.code === "42501"
          ? REFUS
          : error?.code === DOUBLON
            ? "Cette opportunité est déjà au catalogue, sous ce nom et cet organisme : modifiez sa fiche plutôt que d'en ajouter une seconde."
            : id && !error
              ? "Cette opportunité n'existe plus."
              : "L'enregistrement a échoué. Vérifiez les valeurs et réessayez.",
    };
  }

  revalider();
  return id
    ? { succes: `« ${lecture.valeurs.name} » est enregistrée.` }
    : // L'écran vide alors le formulaire et mène à la fiche : la compléter se
      // fait là, pas par un second ajout.
      { succes: `« ${lecture.valeurs.name} » est ajoutée au catalogue.`, fiche: data.id };
}

/** Retire une opportunité du catalogue. Le retrait est journalisé par la base. */
export async function supprimerOpportunite(formData: FormData) {
  const id = String(formData.get("opportunite") ?? "");
  if (!UUID.test(id)) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return;
  }

  await supabase.from("funding_opportunities").delete().eq("id", id);

  revalider();
}
