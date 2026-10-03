"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

/** Côtés de la bande où il reste des onglets à faire défiler. */
type Reste = "aucun" | "gauche" | "droite" | "deux";

/** Largeur du fondu : l'onglet courant est ramené en deçà. */
const FONDU_PX = 32;

function lireReste(liste: HTMLUListElement | null): Reste {
  if (!liste) {
    return "droite";
  }
  const gauche = liste.scrollLeft > 1;
  const droite = liste.scrollLeft + liste.clientWidth < liste.scrollWidth - 1;
  if (gauche && droite) {
    return "deux";
  }
  if (gauche) {
    return "gauche";
  }
  return droite ? "droite" : "aucun";
}

/**
 * Bande des onglets. Seule la liste est un composant client : ses éléments
 * arrivent tels que le serveur les a rendus.
 *
 * Au-delà de 640 px, les onglets passent à la ligne : tous restent visibles,
 * sans script. En dessous, ils défilent dans leur bande, et ce composant
 * ajoute ce que le style seul ne sait pas faire : un fondu du seul côté où il
 * reste des onglets, et l'onglet courant ramené dans la bande à l'ouverture
 * de la page.
 */
export function BandeOnglets({ children }: { children: ReactNode }) {
  const bande = useRef<HTMLUListElement>(null);

  const suivre = useCallback((prevenir: () => void) => {
    const liste = bande.current;
    if (!liste) {
      return () => {};
    }
    liste.addEventListener("scroll", prevenir, { passive: true });
    const observateur = new ResizeObserver(prevenir);
    observateur.observe(liste);
    return () => {
      liste.removeEventListener("scroll", prevenir);
      observateur.disconnect();
    };
  }, []);

  // Avant l'hydratation, on ne sait rien du défilement : fondu à droite, le
  // cas d'une bande qui commence à son début — sans écart entre les deux
  // rendus, que React signalerait.
  const reste = useSyncExternalStore<Reste>(
    suivre,
    () => lireReste(bande.current),
    () => "droite",
  );

  useEffect(() => {
    const liste = bande.current;
    const courant = liste?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!liste || !courant) {
      return;
    }
    // Par le défilement de la bande seule, et sans animation :
    // `scrollIntoView` ferait aussi sauter la page.
    const cadre = liste.getBoundingClientRect();
    const onglet = courant.getBoundingClientRect();
    if (onglet.right > cadre.right - FONDU_PX) {
      liste.scrollLeft += onglet.right - cadre.right + FONDU_PX;
    } else if (onglet.left < cadre.left + FONDU_PX) {
      liste.scrollLeft += onglet.left - cadre.left - FONDU_PX;
    }
  }, []);

  return (
    <ul
      ref={bande}
      data-reste={reste}
      className="-mb-px flex [scrollbar-width:none] gap-x-6 overflow-x-auto text-sm max-sm:-mx-1 max-sm:scroll-px-8 max-sm:gap-x-4 max-sm:data-[reste=deux]:[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)] max-sm:data-[reste=droite]:[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)] max-sm:data-[reste=gauche]:[mask-image:linear-gradient(to_left,black_calc(100%-2rem),transparent)] sm:flex-wrap sm:gap-y-3 sm:overflow-visible [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </ul>
  );
}
