"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  DESIGNATION_MAX,
  EQUIPEMENTS_MAX,
  estCategorieMateriel,
  MARGE_POURCENT,
  PUISSANCE_WATTS,
  QUANTITE,
  TENSION_VOLTS,
} from "@/lib/materiel";
import { lireEntier } from "@/lib/materiel-calculs";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { GearCategory } from "@/lib/supabase/types";

/*
 * Les droits sont vérifiés par la RLS (peut_editer_contenu). Une écriture
 * refusée ne touche aucune ligne sans lever d'erreur : les `.select()`
 * permettent de le détecter.
 */

export type EtatMateriel = { erreur: string } | { succes: string } | null;

const REFUS = "Vous n'avez pas le droit de modifier ce matériel.";

type EquipementValide = {
  category: GearCategory;
  label: string;
  quantity: number;
  unit_power_watts: number | null;
  simultaneous: boolean;
};

function validerEquipement(
  formData: FormData,
): { erreur: string } | { equipement: EquipementValide } {
  const categorie = String(formData.get("categorie") ?? "");
  const designation = String(formData.get("designation") ?? "").trim();
  const quantite = lireEntier(String(formData.get("quantite") ?? ""), QUANTITE);
  const puissance = lireEntier(String(formData.get("puissance") ?? ""), PUISSANCE_WATTS);

  if (!estCategorieMateriel(categorie)) {
    return { erreur: "Catégorie inconnue." };
  }
  if (!designation) {
    return { erreur: "Donnez une désignation à l'équipement." };
  }
  // La base refuse tout caractère de contrôle : une désignation tient sur une ligne.
  if (designation.length > DESIGNATION_MAX || /\p{Cc}/u.test(designation)) {
    return {
      erreur: `La désignation tient sur une ligne de ${DESIGNATION_MAX} caractères au plus.`,
    };
  }
  if (quantite === null || quantite === "invalide") {
    return {
      erreur: `La quantité est un nombre entier, de ${QUANTITE.min} à ${QUANTITE.max}.`,
    };
  }
  if (puissance === "invalide") {
    return {
      erreur: `La puissance est un nombre entier de watts, de ${PUISSANCE_WATTS.min} à ${PUISSANCE_WATTS.max}.`,
    };
  }

  return {
    equipement: {
      category: categorie,
      label: designation,
      quantity: quantite,
      unit_power_watts: puissance,
      // Case à cocher : absente du formulaire quand elle est décochée.
      simultaneous: formData.get("simultane") === "on",
    },
  };
}

export async function ajouterEquipement(
  _etatPrecedent: EtatMateriel,
  formData: FormData,
): Promise<EtatMateriel> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const resultat = validerEquipement(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { count } = await supabase
    .from("project_gear")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projetId);
  if ((count ?? 0) >= EQUIPEMENTS_MAX) {
    return { erreur: `Une liste de matériel compte ${EQUIPEMENTS_MAX} lignes au plus.` };
  }

  const { error } = await supabase
    .from("project_gear")
    .insert({ project_id: projetId, created_by: garde.user.id, ...resultat.equipement });

  if (error) {
    return { erreur: error.code === "42501" ? REFUS : "L'ajout de l'équipement a échoué." };
  }

  revalidatePath(`/projets/${projetId}/materiel`);
  return null;
}

export async function modifierEquipement(
  _etatPrecedent: EtatMateriel,
  formData: FormData,
): Promise<EtatMateriel> {
  const projetId = String(formData.get("projet") ?? "");
  const equipementId = String(formData.get("equipement") ?? "");
  if (!projetId || !equipementId) {
    return { erreur: "Équipement introuvable." };
  }

  const resultat = validerEquipement(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_gear")
    .update(resultat.equipement)
    .eq("id", equipementId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS };
  }

  revalidatePath(`/projets/${projetId}/materiel`);
  redirect(`/projets/${projetId}/materiel#equipement-${equipementId}`);
}

export async function supprimerEquipement(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const equipementId = String(formData.get("equipement") ?? "");
  if (!projetId || !equipementId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("project_gear").delete().eq("id", equipementId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/materiel`);
}

export async function enregistrerReglages(
  _etatPrecedent: EtatMateriel,
  formData: FormData,
): Promise<EtatMateriel> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const tension = lireEntier(String(formData.get("tension") ?? ""), TENSION_VOLTS);
  const marge = lireEntier(String(formData.get("marge") ?? ""), MARGE_POURCENT);
  if (tension === null || tension === "invalide") {
    return {
      erreur: `La tension est un nombre entier de volts, de ${TENSION_VOLTS.min} à ${TENSION_VOLTS.max}.`,
    };
  }
  if (marge === null || marge === "invalide") {
    return {
      erreur: `La marge est un pourcentage entier, de ${MARGE_POURCENT.min} à ${MARGE_POURCENT.max}.`,
    };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const reglages = { voltage_volts: tension, generator_margin_percent: marge };

  // Modification, puis création si le projet n'a pas encore ses réglages.
  // Pas d'« upsert » : il réécrirait `project_id`, que les droits par colonne
  // interdisent de modifier. Une création simultanée par un coéquipier
  // (23505) ramène à la modification.
  for (let tentative = 0; tentative < 2; tentative++) {
    const { data: modifies, error: refus } = await supabase
      .from("project_power_settings")
      .update(reglages)
      .eq("project_id", projetId)
      .select("project_id");
    if (refus) {
      return { erreur: "L'enregistrement a échoué." };
    }
    if (modifies?.length) {
      break;
    }

    const { error } = await supabase
      .from("project_power_settings")
      .insert({ project_id: projetId, ...reglages });
    if (!error) {
      break;
    }
    if (error.code !== "23505" || tentative === 1) {
      return { erreur: error.code === "42501" ? REFUS : "L'enregistrement a échoué." };
    }
  }

  revalidatePath(`/projets/${projetId}/materiel`);
  return { succes: "Réglages enregistrés." };
}
