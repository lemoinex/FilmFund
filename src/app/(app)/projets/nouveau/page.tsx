import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireProjet } from "./formulaire";

export const metadata: Metadata = {
  title: "Nouveau projet — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default function NouveauProjet() {
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

      <div className="mt-10">
        <FormulaireProjet />
      </div>
    </div>
  );
}
