type MembreEquipe = { user_id: string; display_name: string | null };

/**
 * Nom de l'auteur d'une version, tel que l'équipe le connaît.
 *
 * Les profils ne se lisent qu'entre soi : l'équipe du projet est la source
 * des noms. Un auteur qui n'en fait pas ou plus partie — administrateur,
 * ancien membre — est désigné comme tel. Une version sans auteur vient
 * d'une écriture hors de l'application : on n'affiche alors rien.
 */
export function auteurDeVersion(
  auteurId: string | null,
  equipe: readonly MembreEquipe[],
): string | null {
  if (!auteurId) {
    return null;
  }
  const membre = equipe.find((m) => m.user_id === auteurId);
  if (!membre) {
    return "un compte hors de l'équipe";
  }
  return membre.display_name?.trim() || "un membre sans nom";
}
