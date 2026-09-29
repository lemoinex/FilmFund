/**
 * Mode privé : l'application réservée à une liste blanche d'administrateurs.
 *
 * Source de vérité unique côté application. Ni les composants, ni les
 * routes, ni les actions ne recopient la liste : tous passent par ici.
 *
 * Deux variables d'environnement, serveur uniquement — jamais préfixées par
 * NEXT_PUBLIC_, qui les enverrait au navigateur et publierait la liste :
 *   - PRIVATE_ADMIN_ONLY_MODE : « true » active le mode privé ; toute autre
 *     valeur, ou son absence, conserve le comportement historique ;
 *   - ALLOWED_ADMIN_EMAILS : adresses autorisées, séparées par des virgules.
 *
 * Ce contrôle garde les pages et les actions. La base applique de son côté
 * son propre verrou (table app_settings, fonction mode_prive()), fondé sur
 * le rôle administrateur : les deux doivent être activés ensemble. Voir
 * docs/mode-prive.md.
 *
 * Aucun import d'alias ici : ce module est aussi chargé tel quel par les
 * tests Node.
 */

export const MESSAGE_ACCES_RESERVE =
  "L'accès est actuellement réservé aux administrateurs autorisés.";

export const MESSAGE_INSCRIPTIONS_FERMEES = "Les inscriptions sont temporairement fermées.";

export function modePriveActif(): boolean {
  return process.env.PRIVATE_ADMIN_ONLY_MODE?.trim().toLowerCase() === "true";
}

function normaliser(email: string): string {
  return email.trim().toLowerCase();
}

export function estEmailAdminAutorise(email: string | null | undefined): boolean {
  if (!email) return false;

  const autorises = (process.env.ALLOWED_ADMIN_EMAILS ?? "")
    .split(",")
    .map(normaliser)
    .filter(Boolean);

  return autorises.includes(normaliser(email));
}

/**
 * L'utilisateur peut-il entrer dans l'application ?
 *
 * Mode privé levé : toujours, le comportement historique s'applique. Mode
 * privé actif : seulement si son adresse figure sur la liste blanche. Une
 * liste vide ou absente ferme donc l'application à tous — préférable à
 * l'ouvrir à tous par erreur de configuration.
 */
export function accesAutorise(email: string | null | undefined): boolean {
  return !modePriveActif() || estEmailAdminAutorise(email);
}
