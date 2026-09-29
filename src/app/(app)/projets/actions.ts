"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { estEtapeValide, estFormatValide } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export type EtatProjet = { erreur: string } | null;

const TITRE_MAX = 200;
const LOGLINE_MAX = 500;
const SYNOPSIS_MAX = 20000;

export async function creerProjet(
  _etatPrecedent: EtatProjet,
  formData: FormData,
): Promise<EtatProjet> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { erreur: "Votre session a expiré. Reconnectez-vous." };
  }

  const titre = String(formData.get("titre") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const etape = String(formData.get("etape") ?? "");
  const logline = String(formData.get("logline") ?? "").trim();

  /*
   * Validation côté serveur, même si le formulaire contraint déjà les
   * valeurs : le client peut envoyer ce qu'il veut. Les contraintes SQL
   * forment le dernier rempart, mais un message clair vaut mieux qu'une
   * erreur de base de données.
   */
  if (!titre) {
    return { erreur: "Donnez un titre à votre projet." };
  }
  if (titre.length > TITRE_MAX) {
    return { erreur: `Le titre ne peut pas dépasser ${TITRE_MAX} caractères.` };
  }
  if (logline.length > LOGLINE_MAX) {
    return { erreur: `Le pitch ne peut pas dépasser ${LOGLINE_MAX} caractères.` };
  }
  if (!estFormatValide(format)) {
    return { erreur: "Format de projet inconnu." };
  }
  if (!estEtapeValide(etape)) {
    return { erreur: "Étape de production inconnue." };
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({ owner_id: user.id, title: titre, format, stage: etape, logline })
    .select("id")
    .single();

  if (error || !data) {
    return { erreur: "La création du projet a échoué. Réessayez dans un instant." };
  }

  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");
  redirect(`/projets/${data.id}`);
}

export async function supprimerProjet(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();

  /*
   * Pas de filtre sur le porteur ici : la RLS s'en charge. Une suppression
   * portant sur le projet d'autrui ne touchera aucune ligne.
   */
  await supabase.from("projects").delete().eq("id", id);

  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");
  redirect("/projets");
}

export async function mettreAJourProjet(
  _etatPrecedent: EtatProjet,
  formData: FormData,
): Promise<EtatProjet> {
  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { erreur: "Projet introuvable." };
  }

  const titre = String(formData.get("titre") ?? "").trim();
  const format = String(formData.get("format") ?? "");
  const etape = String(formData.get("etape") ?? "");
  const logline = String(formData.get("logline") ?? "").trim();
  const synopsis = String(formData.get("synopsis") ?? "").trim();

  if (!titre) {
    return { erreur: "Donnez un titre à votre projet." };
  }
  if (titre.length > TITRE_MAX) {
    return { erreur: `Le titre ne peut pas dépasser ${TITRE_MAX} caractères.` };
  }
  if (logline.length > LOGLINE_MAX) {
    return { erreur: `Le pitch ne peut pas dépasser ${LOGLINE_MAX} caractères.` };
  }
  if (synopsis.length > SYNOPSIS_MAX) {
    return { erreur: "Le synopsis est trop long." };
  }
  if (!estFormatValide(format) || !estEtapeValide(etape)) {
    return { erreur: "Format ou étape inconnu." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ title: titre, format, stage: etape, logline, synopsis })
    .eq("id", id);

  if (error) {
    return { erreur: "L'enregistrement a échoué. Réessayez dans un instant." };
  }

  revalidatePath(`/projets/${id}`);
  revalidatePath("/projets");
  return null;
}
