import { Onglets, type Onglet } from "@/components/ui/onglets";

/**
 * Rubriques d'un projet.
 *
 * L'onglet Budget n'apparaît qu'à qui peut l'ouvrir : le proposer à un
 * lecteur ne mènerait qu'à une page introuvable. Équipe renvoie à la section
 * de la page du projet ; Documents et Storyboard sont annoncés, sans lien,
 * tant qu'ils n'existent pas.
 */
export function OngletsProjet({
  projetId,
  actif,
  budget,
}: {
  projetId: string;
  actif: "projet" | "budget";
  budget: boolean;
}) {
  const onglets: Onglet[] = [
    { cle: "projet", libelle: "Synthèse", href: `/projets/${projetId}` },
    ...(budget ? [{ cle: "budget", libelle: "Budget", href: `/projets/${projetId}/budget` }] : []),
    { cle: "equipe", libelle: "Équipe", href: `/projets/${projetId}#equipe` },
    { cle: "documents", libelle: "Documents" },
    { cle: "storyboard", libelle: "Storyboard" },
  ];

  return <Onglets onglets={onglets} actif={actif} libelle="Rubriques du projet" className="mt-8" />;
}
