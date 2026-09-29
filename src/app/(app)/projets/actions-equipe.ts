"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { estRoleAttribuable, normaliserEmail, POSTE_MAX } from "@/lib/equipes";
import { createClient } from "@/lib/supabase/server";

/*
 * Aucune de ces actions ne vérifie elle-même que l'appelant est porteur du
 * projet : la RLS et les fonctions SQL le font, au plus près de la donnée.
 * Le code ci-dessous se contente de valider les entrées et de traduire les
 * refus en messages compréhensibles.
 */

export type EtatInvitation = { erreur: string } | { succes: string } | null;

export async function inviterMembre(
  _etatPrecedent: EtatInvitation,
  formData: FormData,
): Promise<EtatInvitation> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { erreur: "Votre session a expiré. Reconnectez-vous." };
  }

  const projetId = String(formData.get("projet") ?? "");
  const email = normaliserEmail(String(formData.get("email") ?? ""));
  const role = String(formData.get("role") ?? "");
  const poste = String(formData.get("poste") ?? "").trim();

  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }
  if (!email) {
    return { erreur: "Cette adresse e-mail n'est pas valide." };
  }
  if (email === user.email?.toLowerCase()) {
    return { erreur: "Vous êtes déjà le porteur de ce projet." };
  }
  if (!estRoleAttribuable(role)) {
    return { erreur: "Rôle inconnu." };
  }
  if (poste.length > POSTE_MAX) {
    return { erreur: `Le poste ne peut pas dépasser ${POSTE_MAX} caractères.` };
  }

  const { error } = await supabase.from("project_invitations").insert({
    project_id: projetId,
    email,
    role,
    job_title: poste,
    invited_by: user.id,
  });

  if (error?.code === "23505") {
    return { erreur: "Une invitation est déjà en attente pour cette adresse." };
  }
  if (error?.code === "42501") {
    return { erreur: "Seul le porteur du projet peut inviter." };
  }
  if (error) {
    return { erreur: "L'invitation n'a pas pu être enregistrée. Réessayez dans un instant." };
  }

  revalidatePath(`/projets/${projetId}`);

  /*
   * Même message que l'adresse corresponde à un compte ou non : le dire
   * permettrait à n'importe quel porteur de sonder la liste des inscrits.
   */
  return {
    succes: `Invitation enregistrée pour ${email}. Prévenez cette personne : l'invitation l'attend dans son tableau de bord, dès qu'elle se connecte ou s'inscrit avec cette adresse.`,
  };
}

export async function annulerInvitation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const projetId = String(formData.get("projet") ?? "");
  if (!id || !projetId) return;

  const supabase = await createClient();
  await supabase.from("project_invitations").delete().eq("id", id);

  revalidatePath(`/projets/${projetId}`);
}

export async function changerRoleMembre(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const membreId = String(formData.get("membre") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!projetId || !membreId || !estRoleAttribuable(role)) return;

  const supabase = await createClient();
  await supabase
    .from("project_members")
    .update({ role })
    .eq("project_id", projetId)
    .eq("user_id", membreId);

  revalidatePath(`/projets/${projetId}`);
}

export async function retirerMembre(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const membreId = String(formData.get("membre") ?? "");
  if (!projetId || !membreId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("project_members")
    .delete()
    .eq("project_id", projetId)
    .eq("user_id", membreId);

  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");

  // Qui quitte un projet n'y a plus accès : rester sur sa page mènerait à une 404.
  if (membreId === user?.id) {
    redirect("/projets");
  }

  revalidatePath(`/projets/${projetId}`);
}

export async function accepterInvitation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: projetId, error } = await supabase.rpc("accepter_invitation", {
    p_invitation_id: id,
  });

  revalidatePath("/tableau-de-bord");
  revalidatePath("/projets");

  if (!error && projetId) {
    redirect(`/projets/${projetId}`);
  }
}

export async function refuserInvitation(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.rpc("refuser_invitation", { p_invitation_id: id });

  revalidatePath("/tableau-de-bord");
}
