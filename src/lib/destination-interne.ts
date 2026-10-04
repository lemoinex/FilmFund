/**
 * Destination d'une redirection demandée par la requête : toujours interne.
 *
 * Une adresse absolue permettrait d'expédier l'utilisateur sur un site tiers
 * depuis un lien d'apparence légitime. Vérifier le seul préfixe « // » ne
 * suffit pas : un navigateur lit « \ » comme « / », et ignore tabulations et
 * retours à la ligne — « /\exemple.test » et « /<tab>/exemple.test » quittent
 * le site tout autant.
 *
 * Aucun import d'alias ici : ce module est aussi chargé tel quel par les
 * tests Node.
 */
export function destinationInterne(valeur: unknown, defaut: string): string {
  if (typeof valeur !== "string" || !valeur.startsWith("/") || valeur.startsWith("//")) {
    return defaut;
  }
  return /[\\\u0000-\u001f\u007f]/.test(valeur) ? defaut : valeur;
}
