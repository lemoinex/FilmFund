"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type EtatFormulaire = { erreur: string } | { message: string } | null;

const LONGUEUR_MOT_DE_PASSE_MIN = 8;

/*
 * Message unique pour tout échec de connexion : distinguer « compte inconnu »
 * de « mot de passe incorrect » permettrait d'énumérer les adresses inscrites.
 */
const IDENTIFIANTS_INVALIDES = "Adresse e-mail ou mot de passe incorrect.";

function validerMotDePasse(motDePasse: string): string | null {
  if (motDePasse.length < LONGUEUR_MOT_DE_PASSE_MIN) {
    return `Le mot de passe doit contenir au moins ${LONGUEUR_MOT_DE_PASSE_MIN} caractères.`;
  }
  if (/^\d+$/.test(motDePasse) || /^[a-zA-Z]+$/.test(motDePasse)) {
    return "Le mot de passe doit mêler lettres et chiffres.";
  }
  return null;
}

/** Destination après connexion. Toujours interne, jamais une URL absolue. */
function destination(valeur: FormDataEntryValue | null): string {
  const suite = typeof valeur === "string" ? valeur : "";
  // Une redirection ouverte permettrait d'envoyer l'utilisateur sur un site
  // tiers depuis un lien qui a l'air légitime.
  return suite.startsWith("/") && !suite.startsWith("//") ? suite : "/tableau-de-bord";
}

export async function connexion(
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const motDePasse = String(formData.get("motDePasse") ?? "");

  if (!email || !motDePasse) {
    return { erreur: "Renseignez votre adresse e-mail et votre mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });

  if (error) {
    return { erreur: IDENTIFIANTS_INVALIDES };
  }

  revalidatePath("/", "layout");
  redirect(destination(formData.get("suite")));
}

export async function inscription(
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const nom = String(formData.get("nom") ?? "").trim();

  if (!email || !motDePasse) {
    return { erreur: "Renseignez votre adresse e-mail et un mot de passe." };
  }

  const problemeMotDePasse = validerMotDePasse(motDePasse);
  if (problemeMotDePasse) {
    return { erreur: problemeMotDePasse };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: motDePasse,
    // Le nom transite par les métadonnées et alimente le profil via le
    // déclencheur `handle_new_user`. Le rôle, lui, n'est jamais transmis par
    // le client : il reste décidé par la base.
    options: { data: { display_name: nom.slice(0, 120) } },
  });

  if (error) {
    return { erreur: "La création du compte a échoué. Réessayez dans un instant." };
  }

  // Session absente : la confirmation par e-mail est exigée.
  if (!data.session) {
    return {
      message:
        "Compte créé. Consultez votre boîte e-mail pour confirmer votre adresse, puis connectez-vous.",
    };
  }

  revalidatePath("/", "layout");
  redirect("/tableau-de-bord");
}

export async function deconnexion() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
