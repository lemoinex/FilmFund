import Link from "next/link";

/**
 * Navigation entre les rubriques d'un projet.
 *
 * L'onglet Budget n'apparaît qu'à qui peut l'ouvrir : le proposer à un
 * lecteur ne mènerait qu'à une page introuvable.
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
  const onglets = [
    { cle: "projet", libelle: "Projet", href: `/projets/${projetId}` },
    ...(budget ? [{ cle: "budget", libelle: "Budget", href: `/projets/${projetId}/budget` }] : []),
  ];

  // Un seul onglet n'est pas une navigation.
  if (onglets.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Rubriques du projet" className="border-navy-line mt-8 border-b">
      <ul className="-mb-px flex gap-6 text-sm">
        {onglets.map((onglet) => {
          const courant = onglet.cle === actif;
          return (
            <li key={onglet.cle}>
              <Link
                href={onglet.href}
                aria-current={courant ? "page" : undefined}
                className={`inline-block border-b-2 pb-3 transition-colors ${
                  courant
                    ? "border-gold text-light"
                    : "text-light-muted hover:text-light border-transparent"
                }`}
              >
                {onglet.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
