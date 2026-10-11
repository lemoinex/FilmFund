import Image from "next/image";

import { ArrowRightIcon, PlayIcon } from "@/components/icons";

// Hauteur bornee au ratio de la photo (2.4:1) : au-dela, `object-cover` recadre
// tellement que la camera sort du champ et qu'il ne reste qu'un visage en gros plan.
export function Hero() {
  return (
    <section
      id="accueil"
      className="relative isolate flex items-center overflow-hidden lg:min-h-[clamp(34rem,44vw,42rem)]"
    >
      <div className="absolute inset-0 -z-20">
        <Image
          src="/images/hero-realisatrice.webp"
          alt="Une professionnelle du cinéma observe le cadre à côté d'une caméra de tournage, dans la lumière chaude de fin de journée."
          fill
          priority
          sizes="100vw"
          className="object-cover object-[64%_center]"
        />
      </div>

      {/*
       * Voile sombre en deux temps. En dessous de lg, le texte passe devant la
       * photo : le voile est vertical et plus dense. A partir de lg, il devient
       * horizontal et degage la moitie droite ou se trouve le sujet.
       */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,var(--navy)_2%,color-mix(in_srgb,var(--navy)_85%,transparent)_45%,color-mix(in_srgb,var(--navy)_62%,transparent)_100%)] lg:bg-[linear-gradient(100deg,var(--navy)_0%,color-mix(in_srgb,var(--navy)_88%,transparent)_34%,color-mix(in_srgb,var(--navy)_28%,transparent)_62%,transparent_88%)]"
      />
      <div
        aria-hidden="true"
        className="from-navy absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t to-transparent"
      />

      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:py-24">
        <div className="animate-rise max-w-xl lg:max-w-2xl">
          <p className="eyebrow text-gold mb-6">La plateforme des projets audiovisuels africains</p>

          <h1 className="font-serif text-4xl leading-[1.08] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Des histoires africaines
            <br />
            <span className="text-gold">pour un impact mondial.</span>
          </h1>

          <p className="text-light-muted mt-7 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
            FilmFund Africa est une plateforme conçue pour accompagner les producteurs dans le
            développement et la structuration de projets cinématographiques et audiovisuels
            africains.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href="#plateforme"
              className="bg-gold text-navy hover:bg-gold-bright group inline-flex items-center justify-center gap-2.5 rounded-full px-7 py-4 text-sm font-medium transition-colors"
            >
              Découvrir la plateforme
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#a-propos"
              className="text-light hover:text-gold-bright inline-flex items-center justify-center gap-3 rounded-full px-2 py-4 text-sm font-medium transition-colors"
            >
              <PlayIcon className="size-8" />
              Voir la présentation
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
