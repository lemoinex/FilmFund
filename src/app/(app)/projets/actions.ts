"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { estEtapeValide, estFormatValide } from "@/lib/projets";
import { COMPARTIMENT_IMAGES } from "@/lib/images";
import { LIMITE_DU_PLAN } from "@/lib/plans";
import { exigerAcces } from "@/lib/supabase/garde";
import { supprimerImages } from "@/lib/supabase/liens-images";
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
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { user } = garde;

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

  if (error?.code === LIMITE_DU_PLAN) {
    return {
      erreur:
        "Le plan de votre studio ne permet pas de créer un projet de plus. Un administrateur peut changer votre plan.",
    };
  }
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
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  /*
   * Images d'abord, projet ensuite. Une fois le projet supprimé, la
   * politique de stockage ne reconnaît plus son porteur, qui ne pourrait
   * plus effacer ses fichiers : ils resteraient orphelins. On vérifie donc
   * le droit de suppression avant de toucher aux fichiers — mêmes règles que
   * les politiques de la table : porteur ou administrateur.
   */
  const [{ data: acces }, { data: estAdmin }] = await Promise.all([
    supabase.rpc("acces_au_projet", { p_project_id: id }),
    supabase.rpc("is_admin"),
  ]);

  if (acces !== "owner" && estAdmin !== true) {
    return;
  }

  const dossiers = await Promise.all(
    ["couverture", "scenes"].map((dossier) =>
      supabase.storage.from(COMPARTIMENT_IMAGES).list(`${id}/${dossier}`, { limit: 1000 }),
    ),
  );
  await supprimerImages(
    supabase,
    dossiers.flatMap(({ data }, index) =>
      (data ?? []).map((f) => `${id}/${index === 0 ? "couverture" : "scenes"}/${f.name}`),
    ),
  );

  // La RLS reste le dernier mot : sans droit, aucune ligne ne serait touchée.
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
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ title: titre, format, stage: etape, logline, synopsis })
    .eq("id", id)
    .select("id");

  if (error) {
    return { erreur: "L'enregistrement a échoué. Réessayez dans un instant." };
  }

  /*
   * La RLS ne lève pas d'erreur sur une modification interdite : elle ne
   * touche simplement aucune ligne. Sans ce contrôle, un lecteur dont le
   * rôle vient d'être abaissé verrait sa saisie acceptée en silence, puis
   * perdue.
   */
  if (!data?.length) {
    return { erreur: "Vous n'avez pas le droit de modifier ce projet." };
  }

  revalidatePath(`/projets/${id}`);
  revalidatePath("/projets");
  return null;
}
