import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { enCentimes, formaterMontant, ORDRE_POSTES, POSTES } from "@/lib/budgets";
import { createClient } from "@/lib/supabase/server";
import type { BudgetCategory } from "@/lib/supabase/types";

import { OngletsProjet } from "../onglets";
import { supprimerLigne } from "./actions";
import { FormulaireDevise, FormulaireLigne } from "./formulaires";

export const metadata: Metadata = {
  title: "Budget — filmfundAfrica",
  robots: { index: false, follow: false },
};

const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const pourcentFr = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });

type Ligne = {
  id: string;
  category: BudgetCategory;
  label: string;
  quantity: number;
  unit_cost: number;
  total: number | null;
  actual_amount: number | null;
};

export default async function BudgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ligne?: string }>;
}) {
  const { id } = await params;
  const { ligne: ligneEnModification } = await searchParams;
  const supabase = await createClient();

  const [{ data: projet }, { data: autorise }, { data: budget }, { data: lignes }] =
    await Promise.all([
      supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
      supabase.rpc("peut_gerer_budget", { p_project_id: id }),
      supabase.from("project_budgets").select("currency").eq("project_id", id).maybeSingle(),
      supabase
        .from("budget_lines")
        .select("id, category, label, quantity, unit_cost, total, actual_amount")
        .eq("project_id", id)
        .order("created_at"),
    ]);

  /*
   * Un lecteur de l'équipe lit le projet mais pas son budget : il obtient la
   * même 404 qu'un inconnu. La RLS garantit de toute façon qu'aucune ligne ne
   * lui parviendrait.
   */
  if (!projet || !autorise) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
        Budget
      </h1>

      <OngletsProjet projetId={projet.id} actif="budget" budget />

      {budget ? (
        <Budget
          projetId={projet.id}
          devise={budget.currency}
          lignes={lignes ?? []}
          ligneEnModification={ligneEnModification}
        />
      ) : (
        <section aria-labelledby="ouverture-titre" className="mt-10 max-w-xl">
          <h2 id="ouverture-titre" className="font-serif text-2xl leading-tight">
            Ouvrir le budget
          </h2>
          <p className="text-light-muted mt-3 mb-6 text-sm leading-relaxed text-pretty">
            Commencez par la devise dans laquelle vous chiffrez le film. Le budget n&apos;est
            visible que du porteur, des éditeurs et des administrateurs : les lecteurs de
            l&apos;équipe n&apos;y ont pas accès.
          </p>
          <FormulaireDevise projetId={projet.id} />
        </section>
      )}
    </div>
  );
}

function Budget({
  projetId,
  devise,
  lignes,
  ligneEnModification,
}: {
  projetId: string;
  devise: string;
  lignes: Ligne[];
  ligneEnModification?: string;
}) {
  const montant = (centimes: number) => formaterMontant(centimes, devise);

  // Sommes en centimes entiers : additionner des flottants à deux décimales
  // finit par afficher un centime de trop.
  const prevu = lignes.reduce((somme, l) => somme + enCentimes(l.total ?? 0), 0);
  const engagees = lignes.filter((l) => l.actual_amount !== null);
  const depense = engagees.reduce((somme, l) => somme + enCentimes(l.actual_amount ?? 0), 0);
  const prevuEngage = engagees.reduce((somme, l) => somme + enCentimes(l.total ?? 0), 0);
  const ecart = depense - prevuEngage;

  const postes = ORDRE_POSTES.map((poste) => {
    const lignesPoste = lignes.filter((l) => l.category === poste);
    return {
      poste,
      lignes: lignesPoste,
      total: lignesPoste.reduce((somme, l) => somme + enCentimes(l.total ?? 0), 0),
    };
  }).filter((p) => p.lignes.length > 0);

  return (
    <>
      <section aria-labelledby="synthese-titre" className="mt-10">
        <h2 id="synthese-titre" className="sr-only">
          Synthèse
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Indicateur libelle="Prévisionnel" valeur={montant(prevu)}>
            {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
          </Indicateur>
          <Indicateur libelle="Dépensé" valeur={montant(depense)}>
            {engagees.length
              ? `${engagees.length} ligne${engagees.length > 1 ? "s" : ""} engagée${engagees.length > 1 ? "s" : ""}`
              : "Aucune dépense engagée"}
          </Indicateur>
          <Indicateur
            libelle="Écart sur l'engagé"
            valeur={engagees.length ? `${ecart > 0 ? "+" : ""}${montant(ecart)}` : "—"}
            ton={ecart > 0 ? "alerte" : ecart < 0 ? "favorable" : undefined}
          >
            {!engagees.length
              ? "Renseignez un montant réel pour suivre l'écart"
              : ecart > 0
                ? "Dépassement par rapport au prévu"
                : ecart < 0
                  ? "Économie par rapport au prévu"
                  : "Conforme au prévu"}
          </Indicateur>
        </dl>
      </section>

      {postes.length ? (
        <section aria-labelledby="repartition-titre" className="mt-12">
          <h2 id="repartition-titre" className="font-serif text-2xl leading-tight">
            Répartition
          </h2>
          <ul className="mt-6 space-y-4">
            {postes.map(({ poste, total }) => {
              const part = prevu > 0 ? total / prevu : 0;
              return (
                <li key={poste}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                    <a href={`#poste-${poste}`} className="hover:text-gold transition-colors">
                      {POSTES[poste]}
                    </a>
                    <span className="text-light-muted tabular-nums">
                      {montant(total)} · {pourcentFr.format(part)}
                    </span>
                  </div>
                  {/* Barre décorative : le pourcentage est déjà écrit au-dessus. */}
                  <div aria-hidden="true" className="bg-navy-soft mt-2 h-1.5 rounded-full">
                    <div
                      className="bg-gold h-full rounded-full"
                      style={{ width: `${Math.max(part * 100, 0.5)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="detail-titre" className="mt-12">
        <h2 id="detail-titre" className="font-serif text-2xl leading-tight">
          Détail
        </h2>

        {postes.length ? (
          <div className="mt-6 space-y-10">
            {postes.map(({ poste, lignes: lignesPoste, total }) => (
              <div key={poste} id={`poste-${poste}`} className="scroll-mt-24">
                <h3 className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-gold text-sm font-medium">{POSTES[poste]}</span>
                  <span className="text-light-muted text-sm tabular-nums">{montant(total)}</span>
                </h3>

                <ul className="border-navy-line mt-3 divide-y divide-[var(--navy-line)] rounded-xl border">
                  {lignesPoste.map((ligne) => (
                    <li
                      key={ligne.id}
                      id={`ligne-${ligne.id}`}
                      className="scroll-mt-24 p-4 sm:px-5"
                    >
                      {ligne.id === ligneEnModification ? (
                        <FormulaireLigne projetId={projetId} devise={devise} ligne={ligne} />
                      ) : (
                        <LigneBudget projetId={projetId} ligne={ligne} montant={montant} />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-navy-line text-light-muted mt-6 rounded-xl border border-dashed p-8 text-center text-sm">
            Aucune dépense pour l&apos;instant. Ajoutez la première ligne ci-dessous.
          </p>
        )}
      </section>

      <section aria-labelledby="ajout-titre" className="border-navy-line mt-12 border-t pt-10">
        <h2 id="ajout-titre" className="font-serif text-2xl leading-tight">
          Ajouter une ligne
        </h2>
        <div className="mt-6">
          <FormulaireLigne projetId={projetId} devise={devise} />
        </div>
      </section>

      <section
        aria-labelledby="devise-titre"
        className="border-navy-line mt-16 max-w-xl rounded-xl border border-dashed p-5"
      >
        <h2 id="devise-titre" className="text-sm font-medium">
          Devise
        </h2>
        <p className="text-light-muted mt-2 mb-5 text-sm leading-relaxed text-pretty">
          Changer de devise ne convertit pas les montants déjà saisis : ils sont simplement affichés
          dans la nouvelle monnaie.
        </p>
        <FormulaireDevise projetId={projetId} deviseActuelle={devise} />
      </section>
    </>
  );
}

function Indicateur({
  libelle,
  valeur,
  ton,
  children,
}: {
  libelle: string;
  valeur: string;
  ton?: "alerte" | "favorable";
  children: React.ReactNode;
}) {
  return (
    <div className="border-navy-line bg-navy-soft/40 rounded-xl border p-5">
      <dt className="text-light-muted text-xs tracking-wide uppercase">{libelle}</dt>
      <dd
        className={`mt-2 font-serif text-2xl leading-tight tabular-nums ${
          ton === "alerte" ? "text-red-200" : ton === "favorable" ? "text-gold-bright" : ""
        }`}
      >
        {valeur}
      </dd>
      <dd className="text-light-muted mt-2 text-xs leading-relaxed">{children}</dd>
    </div>
  );
}

function LigneBudget({
  projetId,
  ligne,
  montant,
}: {
  projetId: string;
  ligne: Ligne;
  montant: (centimes: number) => string;
}) {
  const reel = ligne.actual_amount;
  const depassement = reel !== null && enCentimes(reel) > enCentimes(ligne.total ?? 0);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">{ligne.label}</p>
        <p className="text-light-muted mt-1 text-xs tabular-nums">
          {nombreFr.format(ligne.quantity)} × {montant(enCentimes(ligne.unit_cost))}
        </p>
      </div>

      <div className="text-right text-sm tabular-nums">
        <p>{montant(enCentimes(ligne.total ?? 0))}</p>
        <p className={`mt-1 text-xs ${depassement ? "text-red-200" : "text-light-muted"}`}>
          {reel === null ? "Non engagé" : `Réel : ${montant(enCentimes(reel))}`}
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Link
          href={`/projets/${projetId}/budget?ligne=${ligne.id}#ligne-${ligne.id}`}
          className="text-light-muted hover:text-light hover:bg-navy-soft rounded-full px-3 py-1.5 text-xs transition-colors"
        >
          Modifier
          <span className="sr-only"> la ligne {ligne.label}</span>
        </Link>
        <BoutonConfirme
          action={supprimerLigne}
          champs={{ projet: projetId, ligne: ligne.id }}
          libelle="Supprimer"
          confirmation="Supprimer la ligne"
          discret
        />
      </div>
    </div>
  );
}
