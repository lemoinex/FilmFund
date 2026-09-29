import { ArrowRightIcon } from "@/components/icons";

export function FinalCta() {
  return (
    <section
      id="contact"
      className="bg-navy-soft pattern-weave relative isolate scroll-mt-20 overflow-hidden"
    >
      {/* Halo de projection, purement decoratif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(48rem 24rem at 50% 118%, rgba(212,168,75,0.18), transparent 70%)",
        }}
      />

      <div className="reveal mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-28">
        <h2 className="font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
          Votre prochain projet mérite le meilleur accompagnement.
        </h2>
        <p className="text-light-muted mx-auto mt-6 max-w-xl text-base leading-relaxed text-pretty">
          Découvrez un espace conçu pour développer et structurer vos projets cinématographiques et
          audiovisuels.
        </p>
        <a
          href="#plateforme"
          className="bg-gold text-navy hover:bg-gold-bright group mt-10 inline-flex items-center gap-2.5 rounded-full px-7 py-4 text-sm font-medium transition-colors"
        >
          Découvrir la plateforme
          <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </section>
  );
}
