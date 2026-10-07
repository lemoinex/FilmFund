"use server";

import { revalidatePath } from "next/cache";

import {
  estIdentifiantDeCompte,
  lireRole,
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

  const { data: modePrive } = await supabase.rpc("mode_prive");
  const obstacle = obstacleAuChangementDeRole({
    // Seule la rétrogradation de soi-même est refusée.
    soiMeme: compteId === garde.user.id && role !== "admin",
    modePrive: modePrive !== false,
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
