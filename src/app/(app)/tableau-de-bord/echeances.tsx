import Link from "next/link";

import { joursAvant } from "@/lib/financements";
import { formaterJour } from "@/lib/planning";
import { NATURES_ECHEANCE, type Echeance } from "@/lib/tableau-de-bord";

function delai(jours: number): string {
  if (jours === 0) {
    return "aujourd'hui";
  }
  return jours === 1 ? "demain" : `dans ${jours} jours`;
}

/**
 * Les prochaines échéances, tous projets confondus. Chaque ligne dit sa
 * nature — une étape du planning n'engage pas comme une date limite de
 * candidature — et mène à la page où elle se gère.
 *
 * Une candidature de financement n'apparaît qu'à qui gère le budget du
 * projet : la base ne rend ces lignes qu'à lui.
 */
export function ProchainesEcheances({
  echeances,
  aujourdhui,
}: {
  echeances: readonly Echeance[];
  aujourdhui: string;
}) {
  return (
    <section
      aria-labelledby="echeances-titre"
      className="border-app-line bg-surface mt-6 rounded-xl border p-5"
    >
      <h3 id="echeances-titre" className="text-sm font-medium">
        Prochaines échéances
      </h3>

      {echeances.length ? (
        <ul className="mt-4 divide-y divide-[var(--app-line)]">
          {echeances.map((echeance) => (
            <li
              key={`${echeance.nature}-${echeance.href}-${echeance.jour}-${echeance.titre}`}
              className="py-3 first:pt-0 last:pb-0"
            >
              <Link
                href={echeance.href}
                className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              >
                <span className="min-w-0">
                  <span className="group-hover:text-gold-bright block text-sm transition-colors">
                    {echeance.titre}
                  </span>
                  <span className="text-secondary block text-xs">
                    {NATURES_ECHEANCE[echeance.nature]} · {echeance.contexte}
                  </span>
                </span>
                <span className="text-secondary shrink-0 text-xs tabular-nums">
                  {formaterJour(echeance.jour)}
                  <span className="text-light">
                    {" "}
                    — {delai(joursAvant(echeance.jour, aujourdhui))}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          Aucune échéance à venir : ni étape datée au planning, ni candidature à préparer, ni date
          limite d&apos;une opportunité à étudier.
        </p>
      )}
    </section>
  );
}
