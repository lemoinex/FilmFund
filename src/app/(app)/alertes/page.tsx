import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  grouperParProjet,
  LIMITES_ALERTES,
  NATURES_ALERTE,
  nombreEnClair,
  PRINCIPE_ALERTES,
  REGLES_ALERTE,
  type NatureAlerte,
} from "@/lib/alertes";
import { chargerMesProjets } from "@/lib/mes-projets";
import { formaterJour } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";

import { chargerAlertes } from "./lecture";

export const metadata: Metadata = {
  title: "Alertes — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Le retard se lit en rouge ; le reste garde la couleur du texte. */
const TON: Readonly<Record<NatureAlerte, string>> = {
  etape_en_retard: "border-red-400/40 text-red-200",
  dossier_incomplet: "border-gold/40 text-gold-bright",
  candidature_proche: "border-app-line text-secondary",
  opportunite_proche: "border-app-line text-secondary",
  etape_proche: "border-app-line text-secondary",
  opportunite_nouvelle: "border-app-line text-secondary",
};

export default async function AlertesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const { possedes, partages } = await chargerMesProjets(supabase, user.id, {
    limite: LIMITES_ALERTES.projets,
  });
  const projets = [...possedes, ...partages];
  const { alertes, borneAtteinte } = await chargerAlertes(supabase, projets);
  const groupes = grouperParProjet(alertes);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Alertes</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        {PRINCIPE_ALERTES}
      </p>

      {borneAtteinte ? (
        <p className="border-app-line text-secondary mt-6 rounded-lg border border-dashed px-4 py-3 text-sm leading-relaxed">
          Cette liste peut être incomplète : seuls vos {LIMITES_ALERTES.projets} projets les plus
          récents et les {LIMITES_ALERTES.lignes} premières échéances de chaque nature sont lus.
        </p>
      ) : null}

      {groupes.length ? (
        <>
          <p className="text-secondary mt-8 text-xs" aria-live="polite">
            {nombreEnClair(alertes.length)} dans {groupes.length} projet
            {groupes.length > 1 ? "s" : ""}
          </p>

          <div className="mt-3 space-y-6">
            {groupes.map((groupe) => (
              <section
                key={groupe.projetId}
                aria-labelledby={`alertes-${groupe.projetId}`}
                className="border-app-line rounded-xl border p-5 sm:p-6"
              >
                <h2 id={`alertes-${groupe.projetId}`} className="font-serif text-2xl break-words">
                  <Link
                    href={`/projets/${groupe.projetId}`}
                    className="hover:text-gold transition-colors"
                  >
                    {groupe.projet || "Projet sans titre"}
                  </Link>
                </h2>
                <ul className="mt-3 divide-y divide-[var(--app-line)]">
                  {groupe.alertes.map((alerte) => (
                    <li
                      key={`${alerte.nature}-${alerte.href}-${alerte.jour}-${alerte.titre}`}
                      className="py-3 first:pt-0 last:pb-0"
                    >
                      <Link
                        href={alerte.href}
                        className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
                      >
                        <span className="min-w-0">
                          <span
                            className={`mr-2 inline-block rounded-full border px-2.5 py-0.5 text-xs ${TON[alerte.nature]}`}
                          >
                            {NATURES_ALERTE[alerte.nature]}
                          </span>
                          <span className="group-hover:text-gold-bright text-sm break-words transition-colors">
                            {alerte.titre}
                          </span>
                          <span className="text-secondary mt-1 block text-xs">{alerte.detail}</span>
                        </span>
                        <span className="text-secondary shrink-0 text-xs tabular-nums">
                          {formaterJour(alerte.jour)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      ) : (
        <p className="border-app-line text-secondary mt-8 rounded-xl border border-dashed px-5 py-10 text-center text-sm leading-relaxed">
          {projets.length
            ? "Aucune alerte : aucune étape en retard ni à venir, aucune candidature à déposer, aucune opportunité à étudier bientôt close ni nouvellement vérifiée."
            : "Aucune alerte : vous n'avez pas encore de projet."}
        </p>
      )}

      <section aria-labelledby="regles-titre" className="mt-10">
        <h2 id="regles-titre" className="text-sm font-medium">
          Ce qui déclenche une alerte
        </h2>
        <dl className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border px-5">
          {(Object.keys(NATURES_ALERTE) as NatureAlerte[]).map((nature) => (
            <div key={nature} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
              <dt className="shrink-0 text-sm sm:w-56">{NATURES_ALERTE[nature]}</dt>
              <dd className="text-secondary text-sm leading-relaxed">{REGLES_ALERTE[nature]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-secondary mt-3 text-xs leading-relaxed">
          Une candidature de financement n&apos;alerte que les personnes qui gèrent le budget du
          projet. « À étudier » ne veut pas dire éligible : seule la source de l&apos;opportunité
          fait foi.
        </p>
      </section>
    </div>
  );
}
