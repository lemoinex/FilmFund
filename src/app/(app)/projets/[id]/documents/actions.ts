"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  CONTENU_DOCUMENT_MAX,
  estStatutDocument,
  estTypeDocument,
  TITRE_DOCUMENT_MAX,
  TYPES_DOCUMENT,
} from "@/lib/documents";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Les droits sont vérifiés par la RLS (peut_editer_contenu). Une écriture
 * refusée ne touche aucune ligne sans lever d'erreur : les `.select()`
 * permettent de le détecter et de le dire.
 */

/*
 * `enregistreLe` est une date ISO, pas un texte : formatée sur le serveur,
 * l'heure serait celle du fuseau de l'hébergeur et non celle de
 * l'utilisateur.
 */
export type EtatDocument = { erreur: string } | { enregistreLe: string } | null;

const REFUS = "Vous n'avez pas le droit de modifier les documents de ce projet.";

export async function creerDocument(
  _etatPrecedent: EtatDocument,
  formData: FormData,
): Promise<EtatDocument> {
  const projetId = String(formData.get("projet") ?? "");
  const type = String(formData.get("type") ?? "");
  const titreSaisi = String(formData.get("titre") ?? "").trim();

  if (!projetId) {
    return { erreur: "Projet introuvable." };
  }
  if (!estTypeDocument(type)) {
    return { erreur: "Choisissez un type de document." };
  }
  if (titreSaisi.length > TITRE_DOCUMENT_MAX) {
    return { erreur: `Le titre ne peut pas dépasser ${TITRE_DOCUMENT_MAX} caractères.` };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      project_id: projetId,
      type,
      // Sans titre saisi, le type en tient lieu : on ne bloque pas la
      // création d'une note d'intention sur un champ facultatif.
      title: titreSaisi || TYPES_DOCUMENT[type].libelle,
      created_by: garde.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { erreur: error?.code === "42501" ? REFUS : "La création du document a échoué." };
  }

  revalidatePath(`/projets/${projetId}/documents`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/documents");
  redirect(`/projets/${projetId}/documents/${data.id}`);
}

export async function enregistrerDocument(
  _etatPrecedent: EtatDocument,
  formData: FormData,
): Promise<EtatDocument> {
  const projetId = String(formData.get("projet") ?? "");
  const documentId = String(formData.get("document") ?? "");
  const type = String(formData.get("type") ?? "");
  const statut = String(formData.get("statut") ?? "");
  const titre = String(formData.get("titre") ?? "").trim();
  // Le contenu n'est pas rogné : les espaces et retours à la ligne d'un
  // texte font partie de sa mise en forme.
  const contenu = String(formData.get("contenu") ?? "");

  if (!projetId || !documentId) {
    return { erreur: "Document introuvable." };
  }
  if (!titre) {
    return { erreur: "Donnez un titre au document." };
  }
  if (titre.length > TITRE_DOCUMENT_MAX) {
    return { erreur: `Le titre ne peut pas dépasser ${TITRE_DOCUMENT_MAX} caractères.` };
  }
  if (contenu.length > CONTENU_DOCUMENT_MAX) {
    return { erreur: "Le document est trop long pour être enregistré." };
  }
  if (!estTypeDocument(type) || !estStatutDocument(statut)) {
    return { erreur: "Type ou statut inconnu." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("project_documents")
    .update({ type, status: statut, title: titre, content: contenu })
    .eq("id", documentId)
    .eq("project_id", projetId)
    .select("updated_at");

  if (error) {
    return { erreur: "L'enregistrement a échoué. Réessayez dans un instant." };
  }
  if (!data?.length) {
    return { erreur: REFUS };
  }

  revalidatePath(`/projets/${projetId}/documents`);
  revalidatePath(`/projets/${projetId}/documents/${documentId}`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/documents");

  return { enregistreLe: data[0].updated_at };
}

export type EtatRestauration = { erreur: string } | null;

/*
 * La restauration passe par une fonction de la base, soumise à la RLS de
 * l'appelant : elle réenregistre le titre et le texte de la version, ce qui
 * crée une nouvelle version marquée comme restauration.
 */
export async function restaurerVersion(
  _etatPrecedent: EtatRestauration,
  formData: FormData,
): Promise<EtatRestauration> {
  const projetId = String(formData.get("projet") ?? "");
  const documentId = String(formData.get("document") ?? "");
  const versionId = String(formData.get("version") ?? "");

  if (!projetId || !documentId || !versionId) {
    return { erreur: "Version introuvable." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { error } = await supabase.rpc("restaurer_version_document", { p_version_id: versionId });

  if (error) {
    if (error.code === "42501") return { erreur: REFUS };
    if (error.code === "P0002") return { erreur: "Version introuvable." };
    return { erreur: "La restauration a échoué. Réessayez dans un instant." };
  }

  revalidatePath(`/projets/${projetId}/documents`);
  revalidatePath(`/projets/${projetId}/documents/${documentId}`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/documents");
  redirect(`/projets/${projetId}/documents/${documentId}`);
}

export async function supprimerDocument(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const documentId = String(formData.get("document") ?? "");
  if (!projetId || !documentId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("project_documents").delete().eq("id", documentId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/documents`);
  revalidatePath("/tableau-de-bord");
  revalidatePath("/documents");
  redirect(`/projets/${projetId}/documents`);
}
