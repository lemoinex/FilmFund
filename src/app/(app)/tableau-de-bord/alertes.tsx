import Link from "next/link";

import { ALERTES_PRESENTEES, NATURES_ALERTE, nombreEnClair, type Alerte } from "@/lib/alertes";
import { formaterJour } from "@/lib/planning";

/**
 * Ce qui demande une action, tous projets confondus : les plus pressantes
 * d'abord, la rubrique « Alertes » ayant la liste et les règles.
 *
 * Sans alerte, le bloc ne s'affiche pas : un tableau de bord n'annonce pas
 * qu'il n'a rien à dire.
 */
export function AlertesATraiter({ alertes }: { alertes: readonly Alerte[] }) {
  if (!alertes.length) {
    return null;
  }

  return (
    <section
      aria-labelledby="alertes-titre"
      className="border-gold/40 bg-surface mt-6 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="alertes-titre" className="text-sm font-medium">
          À traiter
          <span className="text-secondary font-normal"> · {nombreEnClair(alertes.length)}</span>
        </h2>
        <Link
          href="/alertes"
          className="text-gold hover:text-gold-bright text-xs transition-colors"
        >
          Toutes les voir
        </Link>
      </div>

      <ul className="mt-4 divide-y divide-[var(--app-line)]">
        {alertes.slice(0, ALERTES_PRESENTEES).map((alerte) => (
          <li
            key={`${alerte.nature}-${alerte.href}-${alerte.jour}-${alerte.titre}`}
            className="py-3 first:pt-0 last:pb-0"
          >
            <Link
              href={alerte.href}
              className="group flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
            >
              <span className="min-w-0">
                <span className="group-hover:text-gold-bright block text-sm break-words transition-colors">
                  {alerte.titre}
                </span>
                <span className="text-secondary block text-xs">
                  {NATURES_ALERTE[alerte.nature]} · {alerte.projet} · {alerte.detail}
                </span>
              </span>
              <span className="text-secondary shrink-0 text-xs tabular-nums">
                {formaterJour(alerte.jour)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
