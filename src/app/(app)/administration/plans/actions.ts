"use server";

import { revalidatePath } from "next/cache";

import { lireValeursBareme, lireValeursPlan } from "@/lib/plans";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Le rôle est vérifié ici, puis de nouveau par la RLS : seule
 * l'administration publie une version — d'un plan ou du barème — ou change
 * le plan d'un studio, et la base journalise chacune de ces actions.
 */

export type EtatPlan = { erreur: string } | { succes: string } | null;

const REFUS = "Action réservée à l'administration.";

async function exigerAdministrateur() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }
  return { supabase };
}

function revaliderApresPublication() {
  revalidatePath("/administration/plans");
  revalidatePath("/administration/journal");
  // La vitrine présente la dernière version publiée : sans cela, l'ancienne
  // valeur y resterait affichée jusqu'à sa prochaine régénération périodique.
  revalidatePath("/");
}

export async function publierVersionPlan(
  _etatPrecedent: EtatPlan,
  formData: FormData,
): Promise<EtatPlan> {
  const acces = await exigerAdministrateur();
  if ("erreur" in acces) {
    return acces;
  }
  const { supabase } = acces;

  const plan = String(formData.get("plan") ?? "");
  const lecture = lireValeursPlan((cle) => formData.get(cle));
  if ("erreur" in lecture) {
    return lecture;
  }

  const { data, error } = await supabase
    .from("plan_versions")
    .insert({ plan_code: plan, ...lecture.valeurs })
    .select("version_number")
    .single();

  if (error || !data) {
    return {
      erreur:
        error?.code === "42501" ? REFUS : "La publication a échoué. Vérifiez le plan et réessayez.",
    };
  }

  revaliderApresPublication();
  return {
    succes: `Version ${data.version_number} publiée. Elle s'applique à chaque studio à partir de sa prochaine période.`,
  };
}

export async function publierVersionBareme(
  _etatPrecedent: EtatPlan,
  formData: FormData,
): Promise<EtatPlan> {
  const acces = await exigerAdministrateur();
  if ("erreur" in acces) {
    return acces;
  }
  const { supabase } = acces;

  const lecture = lireValeursBareme((cle) => formData.get(cle));
  if ("erreur" in lecture) {
    return lecture;
  }

  const { data, error } = await supabase
    .from("text_unit_rate_versions")
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

  revaliderApresPublication();
  return {
    succes: `Version ${data.version_number} du barème publiée. Elle s'applique à chaque studio à partir de sa prochaine période.`,
  };
}

export async function changerPlanStudio(
  _etatPrecedent: EtatPlan,
  formData: FormData,
): Promise<EtatPlan> {
  const acces = await exigerAdministrateur();
  if ("erreur" in acces) {
    return acces;
  }
  const { supabase } = acces;

  const studio = String(formData.get("studio") ?? "");
  const plan = String(formData.get("plan") ?? "");
  if (!studio || !plan) {
    return { erreur: "Studio ou plan manquant." };
  }

  const { data, error } = await supabase
    .from("studio_subscriptions")
    .update({ plan_code: plan })
    .eq("studio_id", studio)
    .select("plan_code");

  if (error) {
    return { erreur: "Le changement de plan a échoué. Vérifiez le plan et réessayez." };
  }
  if (!data?.length) {
    return { erreur: REFUS };
  }

  revalidatePath("/administration/plans");
  revalidatePath("/administration/journal");
  return { succes: "Plan changé. Il s'applique aussitôt." };
}
