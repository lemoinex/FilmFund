import Link from "next/link";

import { BandeOnglets } from "./bande-onglets";

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
       * déborder de la page ; au-delà, ils passent à la ligne. La bande est
       * le seul composant client : les onglets restent rendus par le serveur.
       */}
      <BandeOnglets>
        {onglets.map((onglet) => {
          if (!onglet.href) {
            return (
              <li key={onglet.cle} className="shrink-0">
                <span
                  aria-disabled="true"
                  className="text-secondary/70 inline-flex items-center gap-2 border-b-2 border-transparent pb-3 max-sm:px-1"
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
                // Dans la bande défilante, un contour extérieur serait rogné
                // par ses bords : il est tracé à l'intérieur de l'onglet, qui
                // garde pour cela une marge de chaque côté de son texte.
                className={`inline-block border-b-2 pb-3 transition-colors max-sm:px-1 max-sm:focus-visible:-outline-offset-2! ${
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
      </BandeOnglets>
    </nav>
  );
}
