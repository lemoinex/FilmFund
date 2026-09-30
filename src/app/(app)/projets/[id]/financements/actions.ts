"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { estDeviseValide, lireMontant } from "@/lib/budgets";
import {
  estStatutFinancement,
  estTypeFinancement,
  NOTES_FINANCEMENT_MAX,
  ORGANISME_MAX,
  PROGRAMME_MAX,
} from "@/lib/financements";
import { lireDate } from "@/lib/planning";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { FundingKind } from "@/lib/supabase/types";

/*
 * Les droits sont vérifiés par la RLS (peut_gerer_budget) et, pour les
 * pièces du dossier, par definir_pieces_candidature, qui s'exécute avec
 * les droits de l'appelant.
 */

export type EtatCandidature = { erreur: string } | null;

const REFUS = "Vous n'avez pas accès aux financements de ce projet.";

type CandidatureValidee = {
  funder: string;
  program: string;
  kind: FundingKind;
  currency: string;
  amount_requested: number | null;
  deadline: string | null;
  notes: string;
};

function lireMontantFacultatif(saisie: string): { valeur: number | null } | { erreur: string } {
  if (!saisie) return { valeur: null };
  const montant = lireMontant(saisie);
  return montant === null
    ? {
        erreur:
          "Montant illisible. Écrivez-le sans point pour les milliers, par exemple 5 000 000 ou 12,50.",
      }
    : { valeur: montant };
}

function validerCandidature(
  formData: FormData,
): { erreur: string } | { candidature: CandidatureValidee } {
  const organisme = String(formData.get("organisme") ?? "").trim();
  const programme = String(formData.get("programme") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const devise = String(formData.get("devise") ?? "");
  const montantSaisi = String(formData.get("montant") ?? "").trim();
  const dateSaisie = String(formData.get("date_limite") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!organisme) {
    return { erreur: "Indiquez l'organisme sollicité." };
  }
  if (organisme.length > ORGANISME_MAX || programme.length > PROGRAMME_MAX) {
    return { erreur: `L'organisme et le programme sont limités à ${ORGANISME_MAX} caractères.` };
  }
  if (notes.length > NOTES_FINANCEMENT_MAX) {
    return { erreur: `Les notes ne peuvent pas dépasser ${NOTES_FINANCEMENT_MAX} caractères.` };
  }
  if (!estTypeFinancement(type)) {
    return { erreur: "Type de financement inconnu." };
  }
  if (!estDeviseValide(devise)) {
    return { erreur: "Choisissez une devise dans la liste." };
  }

  const montant = lireMontantFacultatif(montantSaisi);
  if ("erreur" in montant) {
    return montant;
  }

  const dateLimite = dateSaisie ? lireDate(dateSaisie) : null;
  if (dateSaisie && !dateLimite) {
    return { erreur: "La date limite n'existe pas." };
  }

  return {
    candidature: {
      funder: organisme,
      program: programme,
      kind: type,
      currency: devise,
      amount_requested: montant.valeur,
      deadline: dateLimite,
      notes,
    },
  };
}

function revalider(projetId: string) {
  revalidatePath(`/projets/${projetId}/financements`);
  revalidatePath("/tableau-de-bord");
}

export async function ajouterCandidature(
  _etatPrecedent: EtatCandidature,
  formData: FormData,
): Promise<EtatCandidature> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const resultat = validerCandidature(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { error } = await supabase
    .from("project_fundings")
    .insert({ project_id: projetId, created_by: garde.user.id, ...resultat.candidature });

  if (error) {
    return { erreur: error.code === "42501" ? REFUS : "L'ajout de la candidature a échoué." };
  }

  revalider(projetId);
  return null;
}

export async function modifierCandidature(
  _etatPrecedent: EtatCandidature,
  formData: FormData,
): Promise<EtatCandidature> {
  const projetId = String(formData.get("projet") ?? "");
  const candidatureId = String(formData.get("candidature") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const accordeSaisi = String(formData.get("montant_accorde") ?? "").trim();
  const pieces = formData.getAll("pieces").map(String).filter(Boolean);

  if (!projetId || !candidatureId) {
    return { erreur: "Candidature introuvable." };
  }
  if (!estStatutFinancement(statut)) {
    return { erreur: "Statut inconnu." };
  }

  const resultat = validerCandidature(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const accorde = lireMontantFacultatif(accordeSaisi);
  if ("erreur" in accorde) {
    return accorde;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_fundings")
    .update({ ...resultat.candidature, status: statut, amount_granted: accorde.valeur })
    .eq("id", candidatureId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS };
  }

  const { error: erreurPieces } = await supabase.rpc("definir_pieces_candidature", {
    p_funding_id: candidatureId,
    p_document_ids: pieces,
  });

  if (erreurPieces) {
    return {
      erreur:
        "La candidature est enregistrée, mais pas la liste de ses pièces. Rechargez la page et réessayez.",
    };
  }

  revalider(projetId);
  redirect(`/projets/${projetId}/financements#candidature-${candidatureId}`);
}

export async function supprimerCandidature(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const candidatureId = String(formData.get("candidature") ?? "");
  if (!projetId || !candidatureId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase
    .from("project_fundings")
    .delete()
    .eq("id", candidatureId)
    .eq("project_id", projetId);

  revalider(projetId);
}
