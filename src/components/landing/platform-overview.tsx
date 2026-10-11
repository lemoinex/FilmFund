import { DocumentIcon, KanbanIcon, QuillIcon, StoryboardIcon } from "@/components/icons";

import { DashboardMockup } from "./dashboard-mockup";

const FEATURES = [
  {
    Icon: QuillIcon,
    title: "Développement narratif",
    description: "Synopsis, personnages, arcs et structure.",
  },
  {
    Icon: DocumentIcon,
    title: "Documents professionnels",
    description: "Notes d'intention, note de réalisation, bible et pitch deck.",
  },
  {
    Icon: StoryboardIcon,
    title: "Préproduction",
    description: "Storyboard et éléments visuels.",
  },
  {
    Icon: KanbanIcon,
    title: "Gestion de projet",
    description: "Organisation et suivi des différentes étapes.",
  },
];

export function PlatformOverview() {
  return (
    <section id="plateforme" className="bg-ivory text-ink scroll-mt-20">
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
          <div className="reveal">
            <p className="eyebrow text-gold-deep mb-5">Une plateforme complète</p>
            <h2
              id="fonctionnalites"
              className="scroll-mt-24 font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl"
            >
              De l&apos;idée au dossier de production
            </h2>
            <p className="text-ink-muted mt-6 max-w-lg text-base leading-relaxed text-pretty">
              FilmFund Africa vous offre un espace de travail structuré pour développer vos projets,
              créer vos documents professionnels et préparer vos pitchs, avec l&apos;appui de
              l&apos;intelligence artificielle.
            </p>

            <ul className="mt-10 space-y-6">
              {FEATURES.map(({ Icon, title, description }) => (
                <li key={title} className="flex items-start gap-4">
                  <span className="bg-gold/15 text-gold-deep flex size-11 shrink-0 items-center justify-center rounded-lg">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-medium">{title}</h3>
                    <p className="text-ink-muted mt-1 text-sm leading-relaxed text-pretty">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="reveal">
            <DashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
