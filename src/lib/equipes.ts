import type { ProjectMemberRole } from "@/lib/supabase/types";

/** Niveau d'accès à un projet : porteur, ou rôle de membre. */
export type AccesProjet = "owner" | ProjectMemberRole;

export const ROLES_PROJET: Record<AccesProjet, string> = {
  owner: "Porteur",
  editor: "Éditeur",
  viewer: "Lecteur",
};

/** Ce que chaque rôle attribuable permet, affiché au moment d'inviter. */
export const ROLES_ATTRIBUABLES: Record<ProjectMemberRole, string> = {
  editor: "Éditeur — lit et modifie le projet",
  viewer: "Lecteur — lit le projet",
};

export const POSTE_MAX = 80;

export function estRoleAttribuable(valeur: string): valeur is ProjectMemberRole {
  return Object.hasOwn(ROLES_ATTRIBUABLES, valeur);
}

/**
 * Convertit la valeur brute renvoyée par `acces_au_projet`.
 *
 * La fonction SQL renvoie du texte ; on ne fait confiance qu'aux trois
 * valeurs connues, tout le reste vaut absence d'accès.
 */
export function lireAcces(valeur: string | null | undefined): AccesProjet | null {
  return valeur === "owner" || valeur === "editor" || valeur === "viewer" ? valeur : null;
}

/*
 * Contrôle volontairement lâche : la seule preuve qu'une adresse existe est
 * qu'on puisse y écrire. Il écarte les fautes de frappe grossières et
 * s'aligne sur la contrainte `email_format` de la base, qui a le dernier mot.
 */
const FORMAT_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normaliserEmail(valeur: string): string | null {
  const email = valeur.trim().toLowerCase();
  return email.length <= 320 && FORMAT_EMAIL.test(email) ? email : null;
}
