import type { Metadata } from "next";
import Link from "next/link";

import { etapeDe } from "@/lib/assistant";
import { listerPays } from "@/lib/profils";

import { BarreEtapes, FormulaireEtape, type ValeursProjet } from "../../[id]/assistant/formulaires";

export const metadata: Metadata = {
  title: "Assistant de création — FilmFund Africa",
  robots: { index: false, follow: false },
};

/** Mêmes valeurs de départ que la création rapide. */
const PROJET_VIDE: ValeursProjet = {
  title: "",
  format: "long_metrage",
  stage: "idee",
  logline: "",
  genre: null,
  countries: [],
  languages: "",
  duration_minutes: null,
  short_synopsis: "",
  theme: "",
  stakes: "",
  artistic_vision: "",
  goals: "",
  audience: "",
};

export default function NouveauProjetAssiste() {
  const informations = etapeDe("informations");

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href="/projets/nouveau"
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← Nouveau projet
      </Link>

      <p className="text-gold mt-6 text-xs tracking-wide uppercase">Assistant de création</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        {informations.titre}
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        {informations.aide} Le projet est créé à la fin de cette étape ; les suivantes le
        complètent, et chacune peut être passée puis reprise.
      </p>

      <BarreEtapes actuelle="informations" />

      <div className="mt-8">
        {/* Noms et ordre des pays calculés ici, côté serveur, puis passés tels quels. */}
        <FormulaireEtape etape="informations" valeurs={PROJET_VIDE} pays={listerPays()} />
      </div>
    </div>
  );
}
