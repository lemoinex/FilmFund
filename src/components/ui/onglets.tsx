import Link from "next/link";

export type Onglet = {
  cle: string;
  libelle: string;
  /** Absent : la rubrique n'existe pas encore, affichée sans lien. */
  href?: string;
};

/**
 * Navigation par onglets entre les rubriques d'un projet.
 *
 * Des liens, et non des onglets ARIA (`role="tab"`) : chaque rubrique est une
 * page distincte, avec sa propre adresse. L'onglet courant porte
 * `aria-current="page"` ; une rubrique à venir est signalée par un texte,
 * pas seulement par une couleur atténuée.
 */
export function Onglets({
  onglets,
  actif,
  libelle,
  className = "",
}: {
  onglets: Onglet[];
  actif: string;
  libelle: string;
  className?: string;
}) {
  return (
    <nav aria-label={libelle} className={`border-app-line border-b ${className}`}>
      {/*
       * Sur écran étroit, les onglets défilent dans leur bande plutôt que de
       * déborder de la page. La barre de défilement est masquée ; le fondu
       * sur le bord droit indique qu'il reste des onglets à voir.
       */}
      <ul className="-mb-px flex [scrollbar-width:none] gap-6 overflow-x-auto text-sm max-sm:[mask-image:linear-gradient(to_right,black_80%,transparent)] [&::-webkit-scrollbar]:hidden">
        {onglets.map((onglet) => {
          if (!onglet.href) {
            return (
              <li key={onglet.cle} className="shrink-0">
                <span
                  aria-disabled="true"
                  className="text-secondary/70 inline-flex items-center gap-2 border-b-2 border-transparent pb-3"
                >
                  {onglet.libelle}
                  <span className="border-app-line text-secondary rounded-full border px-1.5 py-px text-[0.625rem]">
                    Bientôt
                  </span>
                </span>
              </li>
            );
          }

          const courant = onglet.cle === actif;
          return (
            <li key={onglet.cle} className="shrink-0">
              <Link
                href={onglet.href}
                aria-current={courant ? "page" : undefined}
                className={`inline-block border-b-2 pb-3 transition-colors ${
                  courant
                    ? "border-gold text-light"
                    : "text-secondary hover:text-light border-transparent"
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
