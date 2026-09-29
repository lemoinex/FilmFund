import Image from "next/image";

import {
  ClapperIcon,
  DocumentIcon,
  KanbanIcon,
  QuillIcon,
  SparkIcon,
  StoryboardIcon,
} from "@/components/icons";

/*
 * Maquette de demonstration, construite en HTML et Tailwind : aucune capture
 * d'ecran, aucune donnee reelle. Le projet « Lumiere de l'Ocean » et son taux
 * d'avancement sont fictifs, et la legende le dit explicitement au lecteur.
 */

const SIDEBAR = [
  { Icon: KanbanIcon, label: "Tableau de bord", active: true },
  { Icon: ClapperIcon, label: "Mes projets" },
  { Icon: DocumentIcon, label: "Documents" },
  { Icon: StoryboardIcon, label: "Storyboard" },
  { Icon: SparkIcon, label: "Assistant IA" },
  { Icon: QuillIcon, label: "Ressources" },
];

const TABS = ["Synthèse", "Documents", "Storyboard", "Équipe"];

const CARDS = [
  { title: "Synopsis", status: "Généré par IA" },
  { title: "Note d'intention", status: "En cours" },
  { title: "Storyboard", status: "12 scènes" },
];

const THUMBS = [
  { src: "/images/projet-cote.webp", position: "object-center" },
  { src: "/images/projet-portrait.webp", position: "object-[60%_center]" },
  { src: "/images/projet-storyboard.webp", position: "object-center" },
];

export function DashboardMockup() {
  return (
    <figure className="w-full">
      {/*
       * `text-light` explicite : la maquette vit dans une section ivoire, donc
       * sans cela tout texte non colore herite de l'encre sombre et devient
       * illisible sur ce fond navy.
       */}
      <div className="border-navy-line bg-navy text-light overflow-hidden rounded-xl border shadow-2xl">
        <div className="flex">
          {/* Navigation laterale, masquee sur mobile faute de place utile. */}
          <div className="border-navy-line hidden w-44 shrink-0 border-r p-3 sm:block lg:w-48">
            <div className="mb-4 flex items-center gap-2 px-2 py-1 text-[11px]">
              <ClapperIcon className="text-gold size-4" />
              <span>
                filmfund<span className="text-gold">Africa</span>
              </span>
            </div>
            <ul className="space-y-0.5">
              {SIDEBAR.map(({ Icon, label, active }) => (
                <li
                  key={label}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px] ${
                    active ? "bg-navy-soft text-light" : "text-light-muted"
                  }`}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-navy-soft/40 min-w-0 flex-1 p-4 sm:p-5">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium">Mon projet</p>
              <p className="text-light-muted text-[10px]">Démonstration</p>
            </div>

            <div className="flex items-center gap-3">
              <div className="border-navy-line relative hidden size-12 shrink-0 overflow-hidden rounded-md border sm:block">
                <Image
                  src="/images/projet-cote.webp"
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0">
                <p className="font-serif text-base sm:text-lg">Lumière de l&apos;Océan</p>
                <div className="text-light-muted mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                  <span className="bg-navy rounded px-2 py-0.5">Long métrage</span>
                  <span className="bg-navy rounded px-2 py-0.5">Drame</span>
                  <span className="text-gold bg-gold/10 rounded px-2 py-0.5">En développement</span>
                </div>
              </div>
            </div>

            <div className="border-navy-line text-light-muted mt-4 flex gap-4 border-b pb-2 text-[11px]">
              {TABS.map((tab, index) => (
                <span
                  key={tab}
                  className={index === 0 ? "text-light border-gold -mb-2.5 border-b-2 pb-2" : ""}
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className="border-navy-line bg-navy mt-4 rounded-lg border p-3">
              <div className="text-light-muted flex items-center justify-between text-[11px]">
                <span>Avancement du projet</span>
                <span className="text-light">42 %</span>
              </div>
              <div className="bg-navy-soft mt-2 h-1.5 overflow-hidden rounded-full">
                <div className="bg-gold h-full w-[42%] rounded-full" />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {CARDS.map((card) => (
                <div key={card.title} className="border-navy-line bg-navy rounded-lg border p-2.5">
                  <p className="truncate text-[11px] font-medium">{card.title}</p>
                  <p className="text-light-muted mt-1 truncate text-[10px]">{card.status}</p>
                  <p className="text-gold mt-2 text-[10px]">Voir</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vignettes de reperage : decoratives, donc alt vide. */}
          <div className="hidden w-24 shrink-0 flex-col gap-2 p-3 lg:flex">
            {THUMBS.map((thumb) => (
              <div
                key={thumb.src}
                className="border-navy-line relative aspect-4/3 overflow-hidden rounded-md border"
              >
                <Image
                  src={thumb.src}
                  alt=""
                  fill
                  sizes="96px"
                  className={`object-cover ${thumb.position}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* La legende est hors du cadre sombre : elle suit l'encre de la section ivoire. */}
      <figcaption className="text-ink-muted mt-3 text-center text-xs">
        Maquette de démonstration. Le projet et les données affichés sont fictifs.
      </figcaption>
    </figure>
  );
}
