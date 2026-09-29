/**
 * Utilitaires partagés par les tests d'intégration.
 *
 * Les tests s'exécutent contre la pile Supabase locale, démarrée par
 * `npm run db:start`. Ils créent de vrais comptes et de vraies lignes : c'est
 * le seul moyen d'éprouver la RLS, qui ne se simule pas.
 *
 * Les clés ci-dessous sont celles de toute installation Supabase locale.
 * Elles n'ouvrent que le conteneur Docker de la machine et sont publiques par
 * construction ; elles peuvent être surchargées par variables d'environnement
 * si la configuration locale diffère.
 */
import { createClient } from "@supabase/supabase-js";

export const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

export const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const MOT_DE_PASSE = "motdepasse1";

/** Client anonyme, tel qu'un visiteur non connecté en dispose. */
export function clientAnonyme() {
  return createClient(URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client de service, qui contourne la RLS.
 *
 * Réservé à la mise en place des tests — promouvoir un administrateur, par
 * exemple, ce qu'aucun compte ne peut faire tant qu'aucun administrateur
 * n'existe. Jamais utilisé pour vérifier un comportement : ce qui est testé
 * doit toujours l'être avec les droits d'un utilisateur réel.
 */
export function clientDeService() {
  return createClient(URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Crée un compte et renvoie son client authentifié.
 *
 * L'adresse porte un suffixe unique : les tests peuvent ainsi s'enchaîner sur
 * une base déjà peuplée sans se marcher dessus.
 */
export async function creerCompte(prefixe, nomAffiche = prefixe) {
  const client = clientAnonyme();
  const email = `${prefixe}+${Date.now()}${Math.random().toString(36).slice(2, 7)}@exemple.test`;

  const { data, error } = await client.auth.signUp({
    email,
    password: MOT_DE_PASSE,
    options: { data: { display_name: nomAffiche } },
  });

  if (error) {
    throw new Error(`Création du compte ${email} impossible : ${error.message}`);
  }

  return { client, id: data.user.id, email };
}

/** Promeut un compte administrateur, comme le ferait l'exploitant en SQL direct. */
export async function promouvoirAdministrateur(id) {
  const { error } = await clientDeService().from("profiles").update({ role: "admin" }).eq("id", id);

  if (error) {
    throw new Error(`Promotion impossible : ${error.message}`);
  }
}

/** Crée un projet porté par le compte donné. */
export async function creerProjet(compte, titre) {
  const { data, error } = await compte.client
    .from("projects")
    .insert({ owner_id: compte.id, title: titre })
    .select("id, title")
    .single();

  if (error) {
    throw new Error(`Création du projet impossible : ${error.message}`);
  }

  return data;
}

/** Invitation envoyée par le porteur ; renvoie son identifiant. */
export async function inviter(porteur, projetId, email, role = "viewer", poste = "") {
  const { data, error } = await porteur.client
    .from("project_invitations")
    .insert({ project_id: projetId, email, role, job_title: poste, invited_by: porteur.id })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Invitation impossible : ${error.message}`);
  }

  return data.id;
}

/** Invite puis fait accepter : le compte devient membre du projet. */
export async function faireEntrer(porteur, projetId, compte, role) {
  const invitationId = await inviter(porteur, projetId, compte.email, role);
  const { error } = await compte.client.rpc("accepter_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(`Acceptation impossible : ${error.message}`);
  }
}
