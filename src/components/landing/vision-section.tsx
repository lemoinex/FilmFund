import Image from "next/image";

import { ArrowRightIcon } from "@/components/icons";

const CARDS = [
  {
    src: "/images/vision-createur.webp",
    title: "Des créateurs talentueux",
    alt: "Un chef opérateur règle le cadre sur une caméra montée sur trépied, en extérieur.",
    position: "object-[55%_center]",
  },
  {
    src: "/images/vision-plateau.webp",
    title: "Des projets ambitieux",
    alt: "Une professionnelle tient une tablette sur un plateau de tournage, l'équipe travaille derrière elle.",
    position: "object-[45%_center]",
  },
  {
    src: "/images/vision-reperage.webp",
    title: "Un cinéma africain plus fort",
    alt: "Un technicien porte un trépied sur l'épaule face à un paysage ouvert au coucher du soleil.",
    position: "object-center",
  },
];

export function VisionSection() {
  return (
    <section id="a-propos" className="bg-ivory text-ink scroll-mt-20">
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="reveal">
            <p className="eyebrow text-gold-deep mb-5">Une vision partagée</p>
            <h2 className="font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
              Soutenir les talents et les histoires africaines
            </h2>
            <p className="text-ink-muted mt-6 max-w-lg text-base leading-relaxed text-pretty">
              Nous croyons au potentiel des histoires africaines et en leur capacité à inspirer,
              fédérer et transformer les imaginaires. filmfundAfrica est pensé pour accompagner des
              projets plus inclusifs, plus divers et plus ambitieux.
            </p>
            <a
              href="#contact"
              className="border-ink/20 hover:border-ink/50 hover:bg-ivory-soft group mt-9 inline-flex items-center gap-2.5 rounded-full border px-6 py-3.5 text-sm font-medium transition-colors"
            >
              En savoir plus
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>

          <ul className="reveal grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CARDS.map((card) => (
              <li key={card.title} className="group relative overflow-hidden rounded-xl">
                <div className="relative aspect-4/3 sm:aspect-2/3">
                  <Image
                    src={card.src}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 260px"
                    className={`object-cover ${card.position} transition-transform duration-700 group-hover:scale-105`}
                  />
                  {/*
                   * Voile dense sur la moitie basse : la legende est blanche et
                   * doit rester lisible quelle que soit la photo placee dessous.
                   */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--navy)_94%,transparent)_0%,color-mix(in_srgb,var(--navy)_70%,transparent)_28%,transparent_62%)]"
                  />
                </div>
                <p className="text-light absolute inset-x-0 bottom-0 p-4 text-sm leading-snug font-medium text-pretty">
                  {card.title}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
