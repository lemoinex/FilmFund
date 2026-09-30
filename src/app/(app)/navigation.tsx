"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ComponentType } from "react";

import {
  ClapperIcon,
  DocumentIcon,
  KanbanIcon,
  QuillIcon,
  SparkIcon,
  StoryboardIcon,
} from "@/components/icons";

type Rubrique = {
  libelle: string;
  icone: ComponentType<{ className?: string }>;
  /** Absent : la rubrique n'existe pas encore et n'est pas cliquable. */
  href?: string;
};

/*
 * Seules les rubriques dotées d'une route sont des liens. Les autres sont
 * annoncées « Bientôt » plutôt que pointées vers une page qui n'existe pas.
 */
const RUBRIQUES: Rubrique[] = [
  { libelle: "Tableau de bord", icone: KanbanIcon, href: "/tableau-de-bord" },
  { libelle: "Mes projets", icone: ClapperIcon, href: "/projets" },
  { libelle: "Documents", icone: DocumentIcon, href: "/documents" },
  { libelle: "Storyboard", icone: StoryboardIcon, href: "/storyboard" },
  { libelle: "Assistant IA", icone: SparkIcon },
  { libelle: "Ressources", icone: QuillIcon },
];

function estActive(href: string, chemin: string) {
  return chemin === href || chemin.startsWith(`${href}/`);
}

function ListeRubriques() {
  const chemin = usePathname();

  return (
    <ul className="space-y-1 text-sm">
      {RUBRIQUES.map(({ libelle, icone: Icone, href }) => {
        if (!href) {
          return (
            <li key={libelle}>
              <span
                aria-disabled="true"
                className="text-secondary/60 flex items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <Icone className="size-5 shrink-0" />
                <span className="flex-1">{libelle}</span>
                <span className="border-app-line text-secondary rounded-full border px-2 py-0.5 text-[0.6875rem]">
                  Bientôt
                </span>
              </span>
            </li>
          );
        }

        const active = estActive(href, chemin);
        return (
          <li key={libelle}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                active
                  ? "bg-surface-hover text-light"
                  : "text-secondary hover:bg-surface hover:text-light"
              }`}
            >
              <Icone className={`size-5 shrink-0 ${active ? "text-gold" : ""}`} />
              {libelle}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Navigation de la barre latérale, sur écran large. */
export function NavigationLaterale() {
  return (
    <nav aria-label="Navigation de l'espace de travail">
      <ListeRubriques />
    </nav>
  );
}

/**
 * Menu repliable, sur écran étroit.
 *
 * `<details>` : ouvrable au clavier comme à la souris, fonctionnel avant
 * l'hydratation. Le composant est client pour une seule raison : refermer le
 * menu après une navigation, sans quoi il resterait ouvert sur la nouvelle
 * page — la mise en page, elle, ne se recharge pas.
 */
export function MenuMobile({ children }: { children?: React.ReactNode }) {
  const chemin = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (menu.current) {
      menu.current.open = false;
    }
  }, [chemin]);

  return (
    <details ref={menu} className="group">
      <summary
        aria-label="Ouvrir ou fermer le menu"
        className="border-app-line group-open:bg-surface-hover flex size-11 cursor-pointer list-none items-center justify-center rounded-full border transition-colors marker:content-none [&::-webkit-details-marker]:hidden"
      >
        <span aria-hidden="true" className="relative block h-3.5 w-5">
          <span className="bg-light absolute inset-x-0 top-0 h-px transition-transform duration-200 group-open:top-1/2 group-open:rotate-45" />
          <span className="bg-light absolute inset-x-0 top-1/2 h-px transition-opacity duration-200 group-open:opacity-0" />
          <span className="bg-light absolute inset-x-0 bottom-0 h-px transition-transform duration-200 group-open:bottom-1/2 group-open:-rotate-45" />
        </span>
      </summary>

      <div className="border-app-line bg-sidebar absolute inset-x-2 top-full z-50 mt-2 rounded-xl border p-3 shadow-2xl">
        <nav aria-label="Navigation de l'espace de travail">
          <ListeRubriques />
        </nav>
        {children ? <div className="border-app-line mt-3 border-t pt-3">{children}</div> : null}
      </div>
    </details>
  );
}
