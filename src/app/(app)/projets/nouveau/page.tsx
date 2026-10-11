import type { Metadata } from "next";
import Link from "next/link";

import { ETAPES_ASSISTANT } from "@/lib/assistant";

import { FormulaireProjet } from "./formulaire";

export const metadata: Metadata = {
  title: "Nouveau projet — FilmFund Africa",
  robots: { index: false, follow: false },
};

export default function NouveauProjet() {
  const etapes = ETAPES_ASSISTANT.map((etape) => etape.libelle.toLowerCase()).join(", ");

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/projets" className="text-light-muted hover:text-light text-sm transition-colors">
        ← Mes projets
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Nouveau projet
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        Le titre suffit pour commencer. Tout le reste se complète au fil du développement.
      </p>

      <Link
        href="/projets/nouveau/assistant"
        className="border-gold/40 bg-gold/5 hover:bg-gold/10 mt-10 block rounded-xl border p-5 transition-colors"
      >
        <span className="text-gold block font-serif text-xl">Avec l&apos;assistant</span>
        <span className="text-light-muted mt-2 block text-sm leading-relaxed text-pretty">
          {ETAPES_ASSISTANT.length} étapes guidées : {etapes}. Chacune s&apos;enregistre, peut être
          passée et reprise plus tard.
        </span>
      </Link>

      <section aria-labelledby="creation-rapide" className="border-navy-line mt-10 border-t pt-8">
        <h2 id="creation-rapide" className="font-serif text-2xl leading-tight">
          Création rapide
        </h2>
        <p className="text-light-muted mt-2 text-sm">Un titre, un format, et c&apos;est parti.</p>
        <div className="mt-6">
          <FormulaireProjet />
        </div>
      </section>
    </div>
  );
}
