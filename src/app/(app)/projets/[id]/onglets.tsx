import { Onglets } from "@/components/ui/onglets";
import { ongletsDuProjet } from "@/lib/onglets-projet";

/**
 * Rubriques d'un projet.
 *
 * Les onglets Budget, Financements et Dossier n'apparaissent qu'à qui
 * peut les ouvrir : les proposer à un lecteur ne mènerait qu'à une page
 * introuvable. Équipe renvoie à la section de la page du projet.
 *
 * `synthese` : adresse du premier onglet quand ce n'est pas la page du
 * projet — le tableau de bord, qui est la synthèse du projet mis en avant.
 */
export function OngletsProjet({
  projetId,
  actif,
  budget,
  synthese,
}: {
  projetId: string;
  actif:
    | "projet"
    | "fiche"
    | "budget"
    | "documents"
    | "recherche"
    | "storyboard"
    | "materiel"
    | "planning"
    | "financements"
    | "dossier";
  budget: boolean;
  synthese?: string;
}) {
  return (
    <Onglets
      onglets={ongletsDuProjet(projetId, { budget, synthese })}
      actif={actif}
      libelle="Rubriques du projet"
      className="mt-8"
    />
  );
}
