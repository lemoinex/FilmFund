"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { accesAutorise, MESSAGE_INSCRIPTIONS_FERMEES, modePriveActif } from "@/lib/acces-prive";
import { destinationInterne } from "@/lib/destination-interne";
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
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: motDePasse,
  });

  if (error) {
    return { erreur: IDENTIFIANTS_INVALIDES };
  }

  revalidatePath("/", "layout");

  // Mode privé : un compte hors liste blanche va droit à la page d'accès
  // réservé. Le laisser partir vers le tableau de bord afficherait cette
  // page sous l'adresse du tableau de bord, après un détour par le
  // middleware.
  if (!accesAutorise(data.user.email)) {
    redirect("/acces-refuse");
  }

  // Destination toujours interne, jamais une adresse fournie telle quelle.
  redirect(destinationInterne(formData.get("suite"), "/tableau-de-bord"));
}

export async function inscription(
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  // Refus côté serveur : masquer le formulaire n'empêche pas de poster
  // l'action directement. Les inscriptions doivent en outre être fermées
  // dans Supabase (Authentication → « Allow new users to sign up »), seul
  // rempart contre un appel direct à l'API d'authentification.
  if (modePriveActif()) {
    return { erreur: MESSAGE_INSCRIPTIONS_FERMEES };
  }

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

/*
 * Message unique, affiché que l'adresse existe ou non. Répondre « aucun
 * compte avec cette adresse » transformerait ce formulaire en outil
 * d'énumération des comptes inscrits, accessible sans authentification.
 */
const DEMANDE_ENREGISTREE =
  "Si un compte existe avec cette adresse, un lien de réinitialisation vient d'y être envoyé. Pensez à vérifier vos indésirables.";

export async function demanderReinitialisation(
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { erreur: "Renseignez votre adresse e-mail." };
  }

  const supabase = await createClient();

  /*
   * `redirectTo` doit figurer dans les Redirect URLs du projet Supabase,
   * sans quoi le lien reçu par e-mail renverra vers la Site URL par défaut.
   */
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reinitialisation`,
  });

  // L'erreur éventuelle n'est délibérément pas remontée : elle révélerait
  // l'existence ou l'absence du compte.
  return { message: DEMANDE_ENREGISTREE };
}

export async function definirNouveauMotDePasse(
  _etatPrecedent: EtatFormulaire,
  formData: FormData,
): Promise<EtatFormulaire> {
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");

  if (motDePasse !== confirmation) {
    return { erreur: "Les deux mots de passe ne correspondent pas." };
  }

  const probleme = validerMotDePasse(motDePasse);
  if (probleme) {
    return { erreur: probleme };
  }

  const supabase = await createClient();

  /*
   * À ce stade, la session de récupération a été ouverte par la route
   * /auth/reinitialisation. On revérifie néanmoins qu'un utilisateur est bien
   * authentifié : sans cela, un accès direct à cette page permettrait de
   * soumettre le formulaire sans jeton valide.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      erreur: "Votre lien de réinitialisation a expiré. Demandez-en un nouveau.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password: motDePasse });

  if (error) {
    return { erreur: "La modification du mot de passe a échoué. Réessayez dans un instant." };
  }

  revalidatePath("/", "layout");
  redirect("/tableau-de-bord");
}
