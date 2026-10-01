"use server";

import { revalidatePath } from "next/cache";

import { cleValide, estFournisseurConnu, messageErreur } from "@/lib/integrations-ia";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Clés des fournisseurs d'IA.
 *
 * La clé traverse ces actions sans jamais s'y arrêter : elle part aussitôt
 * vers la base, qui la range dans le coffre. Rien n'en est journalisé, mis en
 * cache, renvoyé au navigateur ni glissé dans un message d'erreur — pas même
 * sa longueur ou ses derniers caractères.
 *
 * Le rôle est vérifié ici, puis de nouveau par la fonction en base, qui seule
 * sait écrire dans le coffre et journalise chaque changement.
 */

export type EtatIntegration = { erreur: string } | { succes: string } | null;

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

function revalider() {
  revalidatePath("/administration/integrations");
  revalidatePath("/administration/journal");
}

/**
 * Enregistrer, remplacer ou retirer : une seule action, pour que l'écran
 * n'affiche jamais deux retours à la fois — « clé enregistrée » et « clé
 * retirée » côte à côte ne diraient plus où en est le fournisseur.
 */
export async function gererCle(
  _etatPrecedent: EtatIntegration,
  formData: FormData,
): Promise<EtatIntegration> {
  const fournisseur = String(formData.get("fournisseur") ?? "");
  const cle = String(formData.get("cle") ?? "").trim();
  const retrait = formData.get("intention") === "retrait";

  if (!estFournisseurConnu(fournisseur)) {
    return { erreur: "Fournisseur inconnu." };
  }

  if (retrait) {
    const acces = await exigerAdministrateur();
    if ("erreur" in acces) {
      return acces;
    }
    const { error } = await acces.supabase.rpc("retirer_cle_fournisseur", {
      p_provider: fournisseur,
    });
    if (error) {
      return { erreur: messageErreur(error.code) };
    }
    revalider();
    return {
      succes:
        "Clé retirée. Les demandes en cours resteront en attente, annulables par leur auteur.",
    };
  }

  if (!cleValide(cle)) {
    return { erreur: messageErreur("22023") };
  }

  const acces = await exigerAdministrateur();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("definir_cle_fournisseur", {
    p_provider: fournisseur,
    p_cle: cle,
  });
  if (error) {
    return { erreur: messageErreur(error.code) };
  }

  revalider();
  return {
    succes:
      "Clé enregistrée. Elle n'est plus affichable ; le worker la prendra en compte dans la minute.",
  };
}
