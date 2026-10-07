"use server";

import { revalidatePath } from "next/cache";

import {
  estIdentifiantDeCompte,
  lireMotif,
  lireRole,
  MOTIF_SUSPENSION,
  obstacleALaSuspension,
  obstacleAuChangementDeRole,
  ROLES_COMPTE,
} from "@/lib/comptes";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Le rôle de l'appelant est vérifié ici, puis de nouveau par
 * `definir_role()`, qui refuse tout non-administrateur. La base journalise le
 * changement dans la même transaction, par le déclencheur de `profiles`.
 */

export type EtatRole = { erreur: string } | { succes: string } | null;

const REFUS = "Action réservée à l'administration.";
const ECHEC = "Le rôle n'a pas été changé. Rechargez la page et réessayez.";

export async function changerRole(_etatPrecedent: EtatRole, formData: FormData): Promise<EtatRole> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }

  const compteId = formData.get("compte");
  const role = lireRole(formData.get("role"));
  if (!estIdentifiantDeCompte(compteId) || !role) {
    return { erreur: ECHEC };
  }

  const [{ data: modePrive }, { data: suspension }] = await Promise.all([
    supabase.rpc("mode_prive"),
    supabase.from("account_suspensions").select("user_id").eq("user_id", compteId).maybeSingle(),
  ]);
  const obstacle = obstacleAuChangementDeRole({
    // Seule la rétrogradation de soi-même est refusée.
    soiMeme: compteId === garde.user.id && role !== "admin",
    modePrive: modePrive !== false,
    suspendu: !!suspension && role === "admin",
  });
  if (obstacle) {
    return { erreur: obstacle };
  }

  // `definir_role()` désigne le compte par son adresse : elle est relue en
  // base, jamais reçue du navigateur.
  const { data: comptes } = await supabase.rpc("comptes_administration", {
    p_compte: compteId,
    p_limite: 1,
  });
  const compte = comptes?.[0];
  if (!compte?.email) {
    return { erreur: "Ce compte n'existe plus." };
  }
  if (compte.role === role) {
    return { erreur: `Ce compte a déjà le rôle « ${ROLES_COMPTE[role]} ».` };
  }

  const { error } = await supabase.rpc("definir_role", {
    email_cible: compte.email,
    nouveau_role: role,
  });
  if (error) {
    return { erreur: error.code === "42501" ? REFUS : ECHEC };
  }

  revalidatePath("/administration/utilisateurs");
  revalidatePath(`/administration/utilisateurs/${compteId}`);
  revalidatePath("/administration/journal");
  return {
    succes: `Rôle changé : ${ROLES_COMPTE[role]}. Le changement est inscrit au journal d'administration.`,
  };
}

/*
 * Suspension et rétablissement (lot V2b). Le rôle de l'appelant est vérifié
 * ici, puis par la RLS de `account_suspensions` ; les garde-fous — ni soi-même,
 * ni un administrateur — sont ceux de la base, redits ici pour être annoncés.
 * Le déclencheur journalise dans la même transaction que l'écriture.
 */

export type EtatSuspension = { erreur: string } | { succes: string } | null;

const ECHEC_SUSPENSION = "Le compte n'a pas été suspendu. Rechargez la page et réessayez.";
const ECHEC_RETABLISSEMENT = "Le compte n'a pas été rétabli. Rechargez la page et réessayez.";

function rafraichir(compteId: string) {
  revalidatePath("/administration/utilisateurs");
  revalidatePath(`/administration/utilisateurs/${compteId}`);
  revalidatePath("/administration/journal");
}

export async function suspendreCompte(
  _etatPrecedent: EtatSuspension,
  formData: FormData,
): Promise<EtatSuspension> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }

  const compteId = formData.get("compte");
  if (!estIdentifiantDeCompte(compteId)) {
    return { erreur: ECHEC_SUSPENSION };
  }
  const motif = lireMotif(formData.get("motif"));
  if (!motif) {
    return {
      erreur: `Donnez le motif de la suspension : de ${MOTIF_SUSPENSION.min} à ${MOTIF_SUSPENSION.max} caractères, sur une ligne.`,
    };
  }

  const { data: comptes } = await supabase.rpc("comptes_administration", {
    p_compte: compteId,
    p_limite: 1,
  });
  const compte = comptes?.[0];
  if (!compte) {
    return { erreur: "Ce compte n'existe plus." };
  }
  const obstacle = obstacleALaSuspension({
    soiMeme: compteId === garde.user.id,
    administrateur: compte.role === "admin",
  });
  if (obstacle) {
    return { erreur: obstacle };
  }

  const { error } = await supabase
    .from("account_suspensions")
    .insert({ user_id: compteId, reason: motif });
  if (error) {
    if (error.code === "23505") {
      return { erreur: "Ce compte est déjà suspendu." };
    }
    return { erreur: error.code === "42501" ? REFUS : ECHEC_SUSPENSION };
  }

  rafraichir(compteId);
  return { succes: "Compte suspendu. La suspension est inscrite au journal d'administration." };
}

export async function retablirCompte(
  _etatPrecedent: EtatSuspension,
  formData: FormData,
): Promise<EtatSuspension> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: REFUS };
  }

  const compteId = formData.get("compte");
  if (!estIdentifiantDeCompte(compteId)) {
    return { erreur: ECHEC_RETABLISSEMENT };
  }

  // La ligne retirée est relue : sans elle, rien n'a été rétabli.
  const { data, error } = await supabase
    .from("account_suspensions")
    .delete()
    .eq("user_id", compteId)
    .select("user_id");
  if (error) {
    return { erreur: error.code === "42501" ? REFUS : ECHEC_RETABLISSEMENT };
  }
  if (!data?.length) {
    return { erreur: "Ce compte n'est pas suspendu." };
  }

  rafraichir(compteId);
  return { succes: "Compte rétabli. Le rétablissement est inscrit au journal d'administration." };
}
