import { Onglets, type Onglet } from "@/components/ui/onglets";

/**
 * Rubriques d'un projet.
 *
 * Les onglets Budget, Financements et Dossier n'apparaissent qu'à qui
 * peut les ouvrir : les proposer à un lecteur ne mènerait qu'à une page
 * introuvable. Équipe renvoie à la section de la page du projet.
 */
export function OngletsProjet({
  projetId,
  actif,
  budget,
}: {
  projetId: string;
  actif: "projet" | "budget" | "documents" | "storyboard" | "planning" | "financements" | "dossier";
  budget: boolean;
}) {
  const onglets: Onglet[] = [
    { cle: "projet", libelle: "Synthèse", href: `/projets/${projetId}` },
    { cle: "documents", libelle: "Documents", href: `/projets/${projetId}/documents` },
    { cle: "storyboard", libelle: "Storyboard", href: `/projets/${projetId}/storyboard` },
    { cle: "planning", libelle: "Planning", href: `/projets/${projetId}/planning` },
    // Budget et financements : mêmes droits, montants confidentiels.
    ...(budget
      ? [
          { cle: "budget", libelle: "Budget", href: `/projets/${projetId}/budget` },
          {
            cle: "financements",
            libelle: "Financements",
            href: `/projets/${projetId}/financements`,
          },
          // Un dossier peut contenir le budget : il en suit les droits.
          { cle: "dossier", libelle: "Dossier", href: `/projets/${projetId}/dossier` },
        ]
      : []),
    { cle: "equipe", libelle: "Équipe", href: `/projets/${projetId}#equipe` },
  ];

  return <Onglets onglets={onglets} actif={actif} libelle="Rubriques du projet" className="mt-8" />;
}
