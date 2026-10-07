import Link from "next/link";

import { decompteEnClair, REGLE_A_ETUDIER, type Compatibilite } from "@/lib/compatibilite";
import { CATEGORIES_OPPORTUNITE, montantEnClair } from "@/lib/opportunites";
import { formaterJour } from "@/lib/planning";

export type OpportuniteAEtudier = {
  id: string;
  name: string;
  organization: string;
  category: string;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  deadline: string | null;
  compatibilite: Compatibilite;
};

/**
 * Les premières opportunités à étudier pour le projet mis en avant : un
 * aperçu, dont l'onglet du projet a la liste et les raisons.
 *
 * `total` est le nombre d'opportunités à étudier, `catalogueVide` dit si
 * aucune opportunité vérifiée n'existe encore : les deux états vides ne se
 * disent pas de la même façon.
 */
export function OpportunitesAEtudier({
  projetId,
  titreProjet,
  opportunites,
  total,
  catalogueVide,
}: {
  projetId: string;
  titreProjet: string;
  opportunites: readonly OpportuniteAEtudier[];
  total: number;
  catalogueVide: boolean;
}) {
  return (
    <section
      aria-labelledby="opportunites-titre"
      className="border-app-line bg-surface mt-6 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="opportunites-titre" className="text-sm font-medium">
          Opportunités à étudier
        </h3>
        <Link
          href={`/projets/${projetId}/opportunites`}
          className="text-gold hover:text-gold-bright text-xs transition-colors"
        >
          Toutes les comparer
          <span className="sr-only"> pour {titreProjet}</span>
        </Link>
      </div>
      <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">{REGLE_A_ETUDIER}</p>

      {opportunites.length ? (
        <>
          <ul className="mt-4 divide-y divide-[var(--app-line)]">
            {opportunites.map((opportunite) => (
              <li key={opportunite.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={`/opportunites/${opportunite.id}`}
                  className="hover:text-gold-bright font-serif text-lg underline-offset-4 transition-colors hover:underline"
                >
                  {opportunite.name}
                </Link>
                <p className="text-secondary mt-0.5 text-xs">
                  {opportunite.organization} ·{" "}
                  {CATEGORIES_OPPORTUNITE[
                    opportunite.category as keyof typeof CATEGORIES_OPPORTUNITE
                  ] ?? opportunite.category}
                </p>
                <p className="mt-2 text-xs">{decompteEnClair(opportunite.compatibilite)}</p>
                <p className="text-secondary mt-1 text-xs">
                  {montantEnClair(opportunite)} · Date limite :{" "}
                  {opportunite.deadline
                    ? formaterJour(opportunite.deadline)
                    : "Information non fournie."}
                </p>
              </li>
            ))}
          </ul>
          {total > opportunites.length ? (
            <p className="text-secondary mt-4 text-xs">
              {total - opportunites.length === 1
                ? "Une autre opportunité est à étudier."
                : `${total - opportunites.length} autres opportunités sont à étudier.`}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          {catalogueVide
            ? "Aucune opportunité vérifiée n'est encore au catalogue. La plateforme n'affiche aucune opportunité fictive."
            : "Aucune opportunité ouverte du catalogue ne remplit un critère de ce projet sans en contredire un autre. Complétez sa fiche, ou comparez-les toutes."}
        </p>
      )}
    </section>
  );
}
