import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { KanbanIcon } from "@/components/icons";
import { BarreAvancement } from "@/components/ui/avancement";
import { BoutonConfirme } from "@/components/ui/confirmation";
import {
  aujourdhui,
  calculerAvancement,
  comparerEtapes,
  estEnRetard,
  estPhase,
  ETAPE_SUIVANTE,
  formaterPeriode,
  PHASES,
  STATUTS_ETAPE,
} from "@/lib/planning";
import { ETAPES } from "@/lib/projets";
import {
  etapeProposition,
  LIVRABLES_STRUCTURES,
  type EtapeProposition,
  type JalonPropose,
} from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";
import type { MilestoneStatus } from "@/lib/supabase/types";

import { OngletsProjet } from "../onglets";
import { RafraichissementPropositions } from "../proposition";
import { changerStatutEtape, supprimerEtape } from "./actions";
import { FormulaireEtape, type EtapeEditable } from "./formulaire";
import { JalonsProposes } from "./jalons-proposes";

export const metadata: Metadata = {
  title: "Planning — filmfundAfrica",
  robots: { index: false, follow: false },
};

const TONS_STATUT: Record<MilestoneStatus, string> = {
  a_faire: "bg-surface-hover text-secondary",
  en_cours: "border border-gold/40 text-gold",
  termine: "bg-gold/12 text-gold",
};

export default async function PlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ etape?: string }>;
}) {
  const { id } = await params;
  const { etape: etapeEnModification } = await searchParams;
  const supabase = await createClient();

  const [{ data: projet }, { data: peutEditer }, { data: budget }, { data: etapes }] =
    await Promise.all([
      supabase.from("projects").select("id, title, stage").eq("id", id).maybeSingle(),
      supabase.rpc("peut_editer_contenu", { p_project_id: id }),
      supabase.rpc("peut_gerer_budget", { p_project_id: id }),
      supabase
        .from("project_milestones")
        .select("id, title, phase, starts_on, due_on, status, notes")
        .eq("project_id", id),
    ]);

  if (!projet) {
    notFound();
  }

  const peutDecider = peutEditer === true;
  const assistant = await lireAssistant(supabase, projet.id, peutDecider);
  // Qui écrit le planning voit toujours l'encart ; un lecteur, seulement
  // quand des jalons proposés attendent — il les lit, sans en décider.
  const montrerAssistant = peutDecider || assistant.etape.etape === "proposition";

  const liste = [...(etapes ?? [])].sort(comparerEtapes);
  const avancement = calculerAvancement(liste);
  const jour = aujourdhui();
  const enRetard = liste.filter((e) => estEnRetard(e, jour)).length;

  // Les étapes rangées par phase, dans l'ordre du cycle de vie d'un projet.
  const groupes = PHASES.map((phase) => ({
    phase,
    etapes: liste.filter((e) => e.phase === phase),
  })).filter((g) => g.etapes.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Planning
      </h1>

      <OngletsProjet projetId={projet.id} actif="planning" budget={budget === true} />

      {avancement ? (
        <section
          aria-labelledby="avancement-titre"
          className="border-app-line bg-surface mt-10 rounded-xl border p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="avancement-titre" className="text-sm font-medium">
              Avancement du projet
            </h2>
            <p className="text-gold text-sm tabular-nums">{avancement.pourcent} %</p>
          </div>
          <div className="mt-4">
            <BarreAvancement
              pourcent={avancement.pourcent}
              libelle="Part des étapes du planning terminées"
            />
          </div>
          <p className="text-secondary mt-3 text-xs">
            {avancement.terminees} étape{avancement.terminees > 1 ? "s" : ""} terminée
            {avancement.terminees > 1 ? "s" : ""} sur {avancement.total}
            {enRetard ? <span className="text-red-200"> · {enRetard} en retard</span> : null}
          </p>
        </section>
      ) : null}

      {groupes.length ? (
        <div className="mt-10 space-y-10">
          {groupes.map(({ phase, etapes: etapesPhase }) => (
            <section key={phase} aria-labelledby={`phase-${phase}`}>
              <h2 id={`phase-${phase}`} className="text-gold text-sm font-medium">
                {ETAPES[phase]}
              </h2>
              <ol className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
                {etapesPhase.map((etape) => (
                  <li key={etape.id} id={`etape-${etape.id}`} className="scroll-mt-8 p-4 sm:px-5">
                    {etape.id === etapeEnModification && peutEditer ? (
                      <FormulaireEtape projetId={projet.id} etape={etape} />
                    ) : (
                      <LigneEtape
                        projetId={projet.id}
                        etape={etape}
                        enRetard={estEnRetard(etape, jour)}
                        peutEditer={peutEditer === true}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <KanbanIcon className="text-gold mx-auto size-9" />
          <p className="mt-4 font-serif text-xl">Le planning est vide</p>
          <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed text-pretty">
            {peutEditer
              ? "Listez les étapes du projet, de l'écriture au tournage. Leur avancement mesurera celui du projet."
              : "Les étapes planifiées par l'équipe apparaîtront ici."}
          </p>
        </div>
      )}

      {montrerAssistant ? (
        <>
          <RafraichissementPropositions
            actif={assistant.etape.etape === "en_attente" || assistant.etape.etape === "en_cours"}
          />
          <JalonsProposes
            projetId={projet.id}
            etape={assistant.etape}
            jalons={assistant.jalons}
            peutDecider={peutDecider}
          />
        </>
      ) : null}

      {peutEditer ? (
        <section aria-labelledby="ajout-etape" className="border-app-line mt-12 border-t pt-10">
          <h2 id="ajout-etape" className="font-serif text-2xl leading-tight">
            Nouvelle étape
          </h2>
          <div className="mt-6">
            <FormulaireEtape
              projetId={projet.id}
              // Nouvelle étape proposée dans la phase où en est le projet.
              phaseParDefaut={estPhase(projet.stage) ? projet.stage : "developpement"}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

type Assistant = { etape: EtapeProposition; jalons: JalonPropose[] };

/**
 * Où en est la dernière demande de jalons sur ce projet, et les jalons de sa
 * proposition si elle attend encore une décision.
 *
 * Trois lectures bornées, sous la RLS de l'appelant. Qui écrit le planning
 * suit la demande depuis sa tâche ; un lecteur ne lit que la dernière
 * proposition — il n'a pas à voir une demande en cours, seulement ce qui
 * est proposé à l'équipe.
 */
async function lireAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  peutDecider: boolean,
): Promise<Assistant> {
  let etape: EtapeProposition = { etape: "repos" };

  if (peutDecider) {
    const { data: tache } = await supabase
      .from("jobs")
      .select("id, state")
      .eq("project_id", projetId)
      .eq("action", "schedule_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: proposition } = tache
      ? await supabase
          .from("ai_suggestions")
          .select("id, content, state")
          .eq("job_id", tache.id)
          .maybeSingle()
      : { data: null };
    etape = etapeProposition(tache, proposition);
  } else {
    const { data: proposition } = await supabase
      .from("ai_suggestions")
      .select("id, content, state")
      .eq("project_id", projetId)
      .eq("action", "schedule_plan")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proposition?.state === "proposed") {
      etape = { etape: "proposition", propositionId: proposition.id, texte: proposition.content };
    }
  }

  if (etape.etape !== "proposition") {
    return { etape, jalons: [] };
  }

  const { data: jalons } = await supabase
    .from("ai_suggestion_milestones")
    .select("id, position, title, phase, duration_days, state")
    .eq("suggestion_id", etape.propositionId)
    .order("position")
    // Bornée comme la base borne le dépôt.
    .limit(LIVRABLES_STRUCTURES.schedule_plan.lignesMax);

  return { etape, jalons: jalons ?? [] };
}

function LigneEtape({
  projetId,
  etape,
  enRetard,
  peutEditer,
}: {
  projetId: string;
  etape: EtapeEditable;
  enRetard: boolean;
  peutEditer: boolean;
}) {
  const suivante = ETAPE_SUIVANTE[etape.status];

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${etape.status === "termine" ? "text-secondary line-through decoration-1" : ""}`}
        >
          {etape.title}
        </p>
        <p className="text-secondary mt-1 text-xs">
          {formaterPeriode(etape.starts_on, etape.due_on)}
          {/* Le retard est écrit : la couleur ne fait que le souligner. */}
          {enRetard ? <span className="text-red-200"> · en retard</span> : null}
        </p>
        {etape.notes ? (
          <p className="text-secondary mt-2 text-sm leading-relaxed whitespace-pre-line">
            {etape.notes}
          </p>
        ) : null}
      </div>

      <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs ${TONS_STATUT[etape.status]}`}>
        {STATUTS_ETAPE[etape.status]}
      </span>

      {peutEditer ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <form action={changerStatutEtape}>
            <input type="hidden" name="projet" value={projetId} />
            <input type="hidden" name="etape" value={etape.id} />
            <input type="hidden" name="statut" value={suivante.statut} />
            <button
              type="submit"
              className="border-app-line hover:bg-surface-hover rounded-full border px-3 py-1.5 text-xs transition-colors"
            >
              {suivante.libelle}
              <span className="sr-only"> l&apos;étape {etape.title}</span>
            </button>
          </form>
          <Link
            href={`/projets/${projetId}/planning?etape=${etape.id}#etape-${etape.id}`}
            className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
          >
            Modifier
            <span className="sr-only"> l&apos;étape {etape.title}</span>
          </Link>
          <BoutonConfirme
            action={supprimerEtape}
            champs={{ projet: projetId, etape: etape.id }}
            libelle="Supprimer"
            confirmation="Supprimer l'étape"
            discret
          />
        </div>
      ) : null}
    </div>
  );
}
