import Image from "next/image";

import { ArrowRightIcon, CheckIcon } from "@/components/icons";

/*
 * Proposition de valeur, jamais garantie : aucune promesse de financement,
 * d'investissement ou d'acces a des partenaires.
 */
const BENEFITS = [
  "Structurez vos projets plus efficacement.",
  "Préparez des documents professionnels de qualité.",
  "Utilisez l'assistance de l'IA pour enrichir vos contenus.",
  "Centralisez les éléments de votre production.",
];

export function ProducerSection() {
  return (
    <section id="producteurs" className="bg-navy scroll-mt-20">
      <div className="grid grid-cols-1 items-stretch lg:grid-cols-2">
        <div className="relative min-h-72 sm:min-h-96 lg:min-h-full">
          <Image
            src="/images/equipe-tournage.webp"
            alt="Une équipe de tournage en silhouette installe caméra et perche face à un coucher de soleil."
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover object-center"
          />
          {/* Fondu vers le texte : evite une cesure trop nette entre image et fond. */}
          <div
            aria-hidden="true"
            className="from-navy absolute inset-0 bg-gradient-to-t to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[var(--navy)]"
          />
        </div>

        <div className="reveal flex items-center px-5 py-16 sm:px-8 sm:py-20 lg:py-24 lg:pr-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:pl-14">
          <div className="max-w-xl">
            <p className="eyebrow text-gold mb-5">Pour les producteurs</p>
            <h2 className="font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Un allié stratégique
              <br className="hidden sm:block" /> pour vos projets
            </h2>
            <p className="text-light-muted mt-6 text-base leading-relaxed text-pretty">
              Gagnez du temps, structurez vos idées, accédez à des outils puissants et donnez à vos
              projets la clarté nécessaire pour convaincre vos partenaires et investisseurs.
            </p>

            <ul className="mt-8 space-y-4">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-sm leading-relaxed">
                  <CheckIcon className="text-gold mt-0.5 size-4 shrink-0" />
                  {benefit}
                </li>
              ))}
            </ul>

            <a
              href="#fonctionnalites"
              className="bg-gold text-navy hover:bg-gold-bright group mt-10 inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
            >
              Découvrir les fonctionnalités
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
