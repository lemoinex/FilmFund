/**
 * Rubriques d'un projet, dans l'ordre où ses écrans les présentent.
 *
 * La page du projet et le tableau de bord en tirent la même liste : écrite à
 * deux endroits, elle avait cessé d'être la même. Module pur, testable sans
 * pile Supabase ; aucun import d'alias, il est aussi chargé tel quel par les
 * tests Node.
 */

export type OngletProjet = { cle: string; libelle: string; href: string };

/**
 * Onglets d'un projet.
 *
 * Budget, Financements et Dossier n'apparaissent qu'à qui gère le budget :
 * les proposer à un lecteur ne mènerait qu'à une page introuvable. Chaque
 * page garde son propre contrôle ; cette liste ne décide que de ce qui est
 * proposé. Équipe renvoie à la section de la page du projet.
 *
 * `synthese` remplace l'adresse du premier onglet : sur le tableau de bord,
 * la synthèse du projet mis en avant est le tableau de bord lui-même.
 */
export function ongletsDuProjet(
  projetId: string,
  { budget, synthese }: { budget: boolean; synthese?: string },
): OngletProjet[] {
  const base = `/projets/${projetId}`;

  return [
    { cle: "projet", libelle: "Synthèse", href: synthese ?? base },
    { cle: "fiche", libelle: "Fiche", href: `${base}/fiche` },
    { cle: "documents", libelle: "Documents", href: `${base}/documents` },
    { cle: "recherche", libelle: "Recherche", href: `${base}/recherche` },
    { cle: "storyboard", libelle: "Storyboard", href: `${base}/storyboard` },
    { cle: "materiel", libelle: "Matériel", href: `${base}/materiel` },
    { cle: "planning", libelle: "Planning", href: `${base}/planning` },
    // Ouvert à toute l'équipe : la comparaison ne lit ni budget ni financement.
    { cle: "opportunites", libelle: "Opportunités", href: `${base}/opportunites` },
    // Budget et financements : mêmes droits, montants confidentiels.
    ...(budget
      ? [
          { cle: "budget", libelle: "Budget", href: `${base}/budget` },
          { cle: "financements", libelle: "Financements", href: `${base}/financements` },
          // Un dossier peut contenir le budget : il en suit les droits.
          { cle: "dossier", libelle: "Dossier", href: `${base}/dossier` },
        ]
      : []),
    { cle: "equipe", libelle: "Équipe", href: `${base}#equipe` },
  ];
}
