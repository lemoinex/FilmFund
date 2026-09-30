import { Onglets, type Onglet } from "@/components/ui/onglets";

/**
 * Rubriques d'un projet.
 *
 * L'onglet Budget n'apparaît qu'à qui peut l'ouvrir : le proposer à un
 * lecteur ne mènerait qu'à une page introuvable. Équipe renvoie à la section
 * de la page du projet.
 */
export function OngletsProjet({
  projetId,
  actif,
  budget,
}: {
  projetId: string;
  actif: "projet" | "budget" | "documents" | "storyboard" | "planning";
  budget: boolean;
}) {
  const onglets: Onglet[] = [
    { cle: "projet", libelle: "Synthèse", href: `/projets/${projetId}` },
    { cle: "documents", libelle: "Documents", href: `/projets/${projetId}/documents` },
    { cle: "storyboard", libelle: "Storyboard", href: `/projets/${projetId}/storyboard` },
    { cle: "planning", libelle: "Planning", href: `/projets/${projetId}/planning` },
    ...(budget ? [{ cle: "budget", libelle: "Budget", href: `/projets/${projetId}/budget` }] : []),
    { cle: "equipe", libelle: "Équipe", href: `/projets/${projetId}#equipe` },
  ];

  return <Onglets onglets={onglets} actif={actif} libelle="Rubriques du projet" className="mt-8" />;
}
