"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  estPhase,
  estStatutEtape,
  lireDate,
  NOTES_ETAPE_MAX,
  TITRE_ETAPE_MAX,
} from "@/lib/planning";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { ProjectStage } from "@/lib/supabase/types";

/*
 * Les droits sont vérifiés par la RLS (peut_editer_contenu). Une écriture
 * refusée ne touche aucune ligne sans lever d'erreur : les `.select()`
 * permettent de le détecter.
 */

export type EtatEtape = { erreur: string } | null;

const REFUS = "Vous n'avez pas le droit de modifier ce planning.";

type EtapeValidee = {
  title: string;
  phase: ProjectStage;
  starts_on: string | null;
  due_on: string | null;
  notes: string;
};

function validerEtape(formData: FormData): { erreur: string } | { etape: EtapeValidee } {
  const titre = String(formData.get("titre") ?? "").trim();
  const phase = String(formData.get("phase") ?? "");
  const debutSaisi = String(formData.get("debut") ?? "").trim();
  const echeanceSaisie = String(formData.get("echeance") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!titre) {
    return { erreur: "Donnez un intitulé à l'étape." };
  }
  if (titre.length > TITRE_ETAPE_MAX) {
    return { erreur: `L'intitulé ne peut pas dépasser ${TITRE_ETAPE_MAX} caractères.` };
  }
  if (notes.length > NOTES_ETAPE_MAX) {
    return { erreur: `Les notes ne peuvent pas dépasser ${NOTES_ETAPE_MAX} caractères.` };
  }
  if (!estPhase(phase)) {
    return { erreur: "Phase inconnue." };
  }

  const debut = debutSaisi ? lireDate(debutSaisi) : null;
  const echeance = echeanceSaisie ? lireDate(echeanceSaisie) : null;
  if ((debutSaisi && !debut) || (echeanceSaisie && !echeance)) {
    return { erreur: "Une des dates n'existe pas." };
  }
  if (debut && echeance && echeance < debut) {
    return { erreur: "L'échéance ne peut pas précéder le début." };
  }

  return { etape: { title: titre, phase, starts_on: debut, due_on: echeance, notes } };
}

export async function ajouterEtape(
  _etatPrecedent: EtatEtape,
  formData: FormData,
): Promise<EtatEtape> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const resultat = validerEtape(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { error } = await supabase
    .from("project_milestones")
    .insert({ project_id: projetId, created_by: garde.user.id, ...resultat.etape });

  if (error) {
    return { erreur: error.code === "42501" ? REFUS : "L'ajout de l'étape a échoué." };
  }

  revalidatePath(`/projets/${projetId}/planning`);
  revalidatePath("/tableau-de-bord");
  return null;
}

export async function modifierEtape(
  _etatPrecedent: EtatEtape,
  formData: FormData,
): Promise<EtatEtape> {
  const projetId = String(formData.get("projet") ?? "");
  const etapeId = String(formData.get("etape") ?? "");
  const statut = String(formData.get("statut") ?? "");
  if (!projetId || !etapeId) {
    return { erreur: "Étape introuvable." };
  }
  if (!estStatutEtape(statut)) {
    return { erreur: "Statut inconnu." };
  }

  const resultat = validerEtape(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_milestones")
    .update({ ...resultat.etape, status: statut })
    .eq("id", etapeId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS };
  }

  revalidatePath(`/projets/${projetId}/planning`);
  revalidatePath("/tableau-de-bord");
  redirect(`/projets/${projetId}/planning#etape-${etapeId}`);
}

export async function changerStatutEtape(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const etapeId = String(formData.get("etape") ?? "");
  const statut = String(formData.get("statut") ?? "");
  if (!projetId || !etapeId || !estStatutEtape(statut)) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase
    .from("project_milestones")
    .update({ status: statut })
    .eq("id", etapeId)
    .eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/planning`);
  revalidatePath("/tableau-de-bord");
}

export async function supprimerEtape(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const etapeId = String(formData.get("etape") ?? "");
  if (!projetId || !etapeId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("project_milestones").delete().eq("id", etapeId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/planning`);
  revalidatePath("/tableau-de-bord");
}
