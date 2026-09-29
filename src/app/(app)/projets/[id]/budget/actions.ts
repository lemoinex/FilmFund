"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  estDeviseValide,
  estPosteValide,
  LIBELLE_MAX,
  lireMontant,
  lireQuantite,
} from "@/lib/budgets";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { BudgetCategory } from "@/lib/supabase/types";

/*
 * Les droits sont vérifiés par la RLS (fonction peut_gerer_budget) : ces
 * actions valident les saisies et traduisent les refus. Une écriture refusée
 * ne lève pas toujours d'erreur — elle ne touche aucune ligne —, d'où les
 * `.select()` qui permettent de le détecter.
 */

export type EtatBudget = { erreur: string } | null;

const REFUS = "Vous n'avez pas accès au budget de ce projet.";

type LigneValidee = {
  category: BudgetCategory;
  label: string;
  quantity: number;
  unit_cost: number;
  actual_amount: number | null;
};

function validerLigne(formData: FormData): { erreur: string } | { ligne: LigneValidee } {
  const poste = String(formData.get("poste") ?? "");
  const libelle = String(formData.get("libelle") ?? "").trim();
  const quantiteSaisie = String(formData.get("quantite") ?? "").trim();
  const coutSaisi = String(formData.get("cout") ?? "").trim();
  const reelSaisi = String(formData.get("reel") ?? "").trim();

  if (!estPosteValide(poste)) {
    return { erreur: "Poste budgétaire inconnu." };
  }
  if (!libelle) {
    return { erreur: "Décrivez la dépense." };
  }
  if (libelle.length > LIBELLE_MAX) {
    return { erreur: `La description ne peut pas dépasser ${LIBELLE_MAX} caractères.` };
  }

  const quantite = lireQuantite(quantiteSaisie || "1");
  if (quantite === null) {
    return { erreur: "La quantité doit être un nombre positif, deux décimales au plus." };
  }

  const cout = lireMontant(coutSaisi);
  if (cout === null) {
    return {
      erreur:
        "Coût unitaire illisible. Écrivez-le sans point pour les milliers, par exemple 1 500 000 ou 12,50.",
    };
  }

  let reel: number | null = null;
  if (reelSaisi) {
    reel = lireMontant(reelSaisi);
    if (reel === null) {
      return {
        erreur:
          "Montant réel illisible. Écrivez-le sans point pour les milliers, par exemple 1 400 000.",
      };
    }
  }

  return {
    ligne: {
      category: poste,
      label: libelle,
      quantity: quantite,
      unit_cost: cout,
      actual_amount: reel,
    },
  };
}

export async function ouvrirBudget(
  _etatPrecedent: EtatBudget,
  formData: FormData,
): Promise<EtatBudget> {
  const projetId = String(formData.get("projet") ?? "");
  const devise = String(formData.get("devise") ?? "");

  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }
  if (!estDeviseValide(devise)) {
    return { erreur: "Choisissez une devise dans la liste." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { error } = await supabase
    .from("project_budgets")
    .insert({ project_id: projetId, currency: devise });

  // Budget déjà ouvert, par un coéquipier dans un autre onglet par exemple :
  // le résultat voulu est atteint, il suffit d'afficher la page.
  if (error && error.code !== "23505") {
    return { erreur: error.code === "42501" ? REFUS : "L'ouverture du budget a échoué." };
  }

  revalidatePath(`/projets/${projetId}/budget`);
  return null;
}

export async function changerDevise(
  _etatPrecedent: EtatBudget,
  formData: FormData,
): Promise<EtatBudget> {
  const projetId = String(formData.get("projet") ?? "");
  const devise = String(formData.get("devise") ?? "");

  if (!projetId || !estDeviseValide(devise)) {
    return { erreur: "Choisissez une devise dans la liste." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_budgets")
    .update({ currency: devise })
    .eq("project_id", projetId)
    .select("project_id");

  if (error || !data?.length) {
    return { erreur: REFUS };
  }

  revalidatePath(`/projets/${projetId}/budget`);
  return null;
}

export async function ajouterLigne(
  _etatPrecedent: EtatBudget,
  formData: FormData,
): Promise<EtatBudget> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }

  const resultat = validerLigne(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { user } = garde;

  const { error } = await supabase
    .from("budget_lines")
    .insert({ project_id: projetId, created_by: user.id, ...resultat.ligne });

  if (error) {
    return { erreur: error.code === "42501" ? REFUS : "L'ajout de la ligne a échoué." };
  }

  revalidatePath(`/projets/${projetId}/budget`);
  return null;
}

export async function modifierLigne(
  _etatPrecedent: EtatBudget,
  formData: FormData,
): Promise<EtatBudget> {
  const projetId = String(formData.get("projet") ?? "");
  const ligneId = String(formData.get("ligne") ?? "");
  if (!projetId || !ligneId) {
    return { erreur: "Ligne introuvable." };
  }

  const resultat = validerLigne(formData);
  if ("erreur" in resultat) {
    return resultat;
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("budget_lines")
    .update(resultat.ligne)
    .eq("id", ligneId)
    .eq("project_id", projetId)
    .select("id");

  if (error || !data?.length) {
    return { erreur: error ? "L'enregistrement a échoué." : REFUS };
  }

  revalidatePath(`/projets/${projetId}/budget`);
  redirect(`/projets/${projetId}/budget#ligne-${ligneId}`);
}

export async function supprimerLigne(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const ligneId = String(formData.get("ligne") ?? "");
  if (!projetId || !ligneId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("budget_lines").delete().eq("id", ligneId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/budget`);
}
