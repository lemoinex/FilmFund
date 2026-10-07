import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SparkIcon } from "@/components/icons";
import { BarreAvancement } from "@/components/ui/avancement";
import { BoutonConfirme } from "@/components/ui/confirmation";
import { DEVISES, enCentimes, formaterMontant } from "@/lib/budgets";
import {
  calculerPlanFinancement,
  joursAvant,
  preremplirCandidature,
  ORDRE_STATUTS,
  STATUTS_FINANCEMENT,
  TYPES_FINANCEMENT,
} from "@/lib/financements";
import { echeanceDe, montantEnClair, STATUTS_VISIBLES } from "@/lib/opportunites";
import { aujourdhui, formaterJour } from "@/lib/planning";
import { createClient } from "@/lib/supabase/server";
import type { FundingStatus } from "@/lib/supabase/types";

import { OngletsProjet } from "../onglets";
import { supprimerCandidature } from "./actions";
import { FormulaireCandidature, type CandidatureEditable } from "./formulaire";

export const metadata: Metadata = {
  title: "Financements — filmfundAfrica",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jourLong = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

const TONS_STATUT: Record<FundingStatus, string> = {
  a_preparer: "bg-surface-hover text-secondary",
  deposee: "border border-gold/40 text-gold",
  acceptee: "bg-gold/12 text-gold",
  refusee: "bg-red-400/10 text-red-200",
};

export default async function FinancementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ candidature?: string; opportunite?: string }>;
}) {
  const { id } = await params;
  const { candidature: enModification, opportunite: opportuniteId } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: autorise },
    { data: budget },
    { data: lignes },
    { data: candidatures },
    { data: documents },
    { data: pieces },
  ] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase.from("project_budgets").select("currency").eq("project_id", id).maybeSingle(),
    supabase.from("budget_lines").select("total").eq("project_id", id),
    supabase
      .from("project_fundings")
      .select(
        "id, funder, program, kind, status, currency, amount_requested, amount_granted, deadline, notes",
      )
      .eq("project_id", id)
      .order("deadline", { ascending: true, nullsFirst: false }),
    supabase.from("project_documents").select("id, title").eq("project_id", id).order("title"),
    supabase.from("funding_documents").select("funding_id, document_id").eq("project_id", id),
  ]);

  // Même règle que le budget : un lecteur de l'équipe obtient la même 404
  // qu'un inconnu. La RLS garantit qu'aucun montant ne lui parviendrait.
  if (!projet || !autorise) {
    notFound();
  }

  // Candidature préparée depuis une opportunité du catalogue (lot U1). Lue
  // après le contrôle des droits, avec le filtre des écrans des équipes :
  // une démonstration ou une opportunité non vérifiée ne préremplit rien,
  // même pour un administrateur. Un identifiant inconnu, mal formé ou une
  // opportunité expirée laisse le formulaire vide, sans erreur.
  const jourCourant = aujourdhui();
  const { data: opportuniteLue } =
    typeof opportuniteId === "string" && UUID.test(opportuniteId)
      ? await supabase
          .from("funding_opportunities")
          .select(
            "id, name, organization, category, budget_min, budget_max, currency, deadline, source_url, collected_on, status",
          )
          .eq("id", opportuniteId)
          .in("status", STATUTS_VISIBLES)
          .maybeSingle()
      : { data: null };
  const reprise =
    opportuniteLue && echeanceDe(opportuniteLue, jourCourant) !== "passee" ? opportuniteLue : null;
  const prerempli = reprise
    ? preremplirCandidature(reprise, Object.keys(DEVISES), jourCourant)
    : undefined;

  const liste = candidatures ?? [];
  const totalBudget = (lignes ?? []).reduce((somme, l) => somme + enCentimes(l.total ?? 0), 0);
  const plan = calculerPlanFinancement(
    liste,
    budget ? { totalCentimes: totalBudget, devise: budget.currency } : null,
  );
  const jour = aujourdhui();

  const titresDocuments = new Map((documents ?? []).map((d) => [d.id, d.title]));
  const piecesPar = new Map<string, string[]>();
  for (const { funding_id, document_id } of pieces ?? []) {
    piecesPar.set(funding_id, [...(piecesPar.get(funding_id) ?? []), document_id]);
  }

  const groupes = ORDRE_STATUTS.map((statut) => ({
    statut,
    candidatures: liste.filter((c) => c.status === statut),
  })).filter((g) => g.candidatures.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Financements
      </h1>

      <OngletsProjet projetId={projet.id} actif="financements" budget />

      <section
        aria-labelledby="plan-titre"
        className="border-app-line bg-surface mt-10 rounded-xl border p-5"
      >
        <h2 id="plan-titre" className="text-sm font-medium">
          Plan de financement
        </h2>

        {budget && totalBudget > 0 ? (
          <>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Chiffre
                libelle="Budget prévisionnel"
                valeur={formaterMontant(totalBudget, budget.currency)}
              />
              <Chiffre libelle="Acquis" valeur={formaterMontant(plan.acquis, budget.currency)} or />
              <Chiffre
                libelle="Reste à financer"
                valeur={formaterMontant(plan.resteAFinancer ?? 0, budget.currency)}
              />
            </dl>
            <div className="mt-5">
              <BarreAvancement
                pourcent={plan.couverture ?? 0}
                libelle="Part du budget couverte par les financements acquis"
              />
            </div>
            <p className="text-secondary mt-3 text-xs leading-relaxed">
              {plan.couverture} % du budget couvert
              {plan.enAttente
                ? ` · ${formaterMontant(plan.enAttente, budget.currency)} en attente de réponse`
                : null}
            </p>
            {plan.autresDevises || plan.accepteesSansMontant ? (
              <p className="text-secondary mt-2 text-xs leading-relaxed">
                Non comptés :{" "}
                {[
                  plan.autresDevises
                    ? `${plan.autresDevises} candidature${plan.autresDevises > 1 ? "s" : ""} dans une autre devise que le budget (${budget.currency}), faute de taux de change fixé`
                    : null,
                  plan.accepteesSansMontant
                    ? `${plan.accepteesSansMontant} acceptée${plan.accepteesSansMontant > 1 ? "s" : ""} sans montant accordé renseigné`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ; ")}
                .
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-secondary mt-3 text-sm leading-relaxed">
            La couverture se mesure par rapport au budget prévisionnel, encore vide.{" "}
            <Link
              href={`/projets/${projet.id}/budget`}
              className="text-gold hover:text-gold-bright transition-colors"
            >
              Chiffrer le budget
            </Link>
          </p>
        )}
      </section>

      {groupes.length ? (
        <div className="mt-10 space-y-10">
          {groupes.map(({ statut, candidatures: liste }) => (
            <section key={statut} aria-labelledby={`statut-${statut}`}>
              <h2 id={`statut-${statut}`} className="text-gold text-sm font-medium">
                {STATUTS_FINANCEMENT[statut]}
              </h2>
              <ul className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
                {liste.map((candidature) => (
                  <li
                    key={candidature.id}
                    id={`candidature-${candidature.id}`}
                    className="scroll-mt-8 p-4 sm:px-5"
                  >
                    {candidature.id === enModification ? (
                      <FormulaireCandidature
                        projetId={projet.id}
                        candidature={candidature}
                        documents={documents ?? []}
                        pieces={piecesPar.get(candidature.id) ?? []}
                      />
                    ) : (
                      <LigneCandidature
                        projetId={projet.id}
                        candidature={candidature}
                        pieces={(piecesPar.get(candidature.id) ?? []).map((docId) => ({
                          id: docId,
                          title: titresDocuments.get(docId) ?? "Document",
                        }))}
                        jour={jour}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <SparkIcon className="text-gold mx-auto size-9" />
          <p className="mt-4 font-serif text-xl">Aucune candidature pour l&apos;instant</p>
          <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed text-pretty">
            Recensez les fonds, coproducteurs et diffuseurs sollicités. Leurs réponses mesureront ce
            qui reste à financer.
          </p>
        </div>
      )}

      <section aria-labelledby="ajout-candidature" className="border-app-line mt-12 border-t pt-10">
        <h2 id="ajout-candidature" className="font-serif text-2xl leading-tight">
          Nouvelle candidature
        </h2>
        {reprise && prerempli ? (
          <div className="border-app-line bg-surface mt-5 rounded-xl border p-5 text-sm">
            <p className="font-medium">
              Préparée d&apos;après « {reprise.name} », du catalogue des opportunités
            </p>
            <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
              L&apos;organisme, le programme{prerempli.deadline ? ", la date limite" : ""}
              {prerempli.currency ? ", la devise" : ""} et la note de source sont repris de sa fiche
              {reprise.collected_on
                ? `, lue à sa source le ${jourLong.format(new Date(`${reprise.collected_on}T00:00:00Z`))}`
                : ""}
              . Elle a pu changer depuis : vérifiez sur la source avant d&apos;enregistrer. Rien
              n&apos;est enregistré tant que vous n&apos;avez pas ajouté la candidature.
            </p>
            <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
              Montant de l&apos;aide annoncé : {montantEnClair(reprise)} Le montant demandé reste à
              saisir : ce n&apos;est pas le même chiffre.
              {prerempli.kind === null ? " Le type de financement reste à choisir." : ""}
            </p>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <Link
                href={`/opportunites/${reprise.id}`}
                className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
              >
                Relire la fiche et sa source
              </Link>
              <Link
                href={`/projets/${projet.id}/financements#ajout-candidature`}
                className="text-secondary hover:text-light transition-colors"
              >
                Vider le formulaire
              </Link>
            </p>
          </div>
        ) : null}
        <div className="mt-6">
          {/* Clé : passer d'une opportunité à l'autre remonte le formulaire avec ses valeurs. */}
          <FormulaireCandidature
            key={reprise?.id ?? "vide"}
            projetId={projet.id}
            deviseParDefaut={budget?.currency}
            prerempli={prerempli}
          />
        </div>
      </section>
    </div>
  );
}

function Chiffre({
  libelle,
  valeur,
  or = false,
}: {
  libelle: string;
  valeur: string;
  or?: boolean;
}) {
  return (
    <div>
      <dt className="text-secondary text-xs tracking-wide uppercase">{libelle}</dt>
      <dd className={`mt-1 font-serif text-xl tabular-nums ${or ? "text-gold" : ""}`}>{valeur}</dd>
    </div>
  );
}

function LigneCandidature({
  projetId,
  candidature,
  pieces,
  jour,
}: {
  projetId: string;
  candidature: CandidatureEditable;
  pieces: { id: string; title: string }[];
  jour: string;
}) {
  const montant = (valeur: number | null) =>
    valeur === null ? null : formaterMontant(enCentimes(valeur), candidature.currency);

  // L'échéance ne compte que pour une candidature encore à déposer.
  const jours =
    candidature.deadline && candidature.status === "a_preparer"
      ? joursAvant(candidature.deadline, jour)
      : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg leading-snug text-pretty">{candidature.funder}</p>
        <p className="text-secondary mt-1 text-xs">
          {[TYPES_FINANCEMENT[candidature.kind], candidature.program].filter(Boolean).join(" · ")}
        </p>

        <p className="mt-3 text-sm">
          {montant(candidature.amount_requested) ? (
            <span>Demandé : {montant(candidature.amount_requested)}</span>
          ) : (
            <span className="text-secondary">Montant non précisé</span>
          )}
          {candidature.amount_granted !== null ? (
            <span className="text-gold"> · Accordé : {montant(candidature.amount_granted)}</span>
          ) : null}
        </p>

        {candidature.deadline ? (
          <p className="text-secondary mt-1 text-xs">
            Date limite : {formaterJour(candidature.deadline)}
            {jours !== null ? (
              <span className={jours < 0 ? "text-red-200" : jours <= 14 ? "text-gold" : ""}>
                {" "}
                ·{" "}
                {jours < 0
                  ? `dépassée de ${-jours} jour${-jours > 1 ? "s" : ""}`
                  : jours === 0
                    ? "aujourd'hui"
                    : `dans ${jours} jour${jours > 1 ? "s" : ""}`}
              </span>
            ) : null}
          </p>
        ) : null}

        {pieces.length ? (
          <p className="text-secondary mt-2 text-xs">
            Pièces :{" "}
            {pieces.map((piece, index) => (
              <span key={piece.id}>
                {index > 0 ? ", " : null}
                <Link
                  href={`/projets/${projetId}/documents/${piece.id}`}
                  className="text-light hover:text-gold underline decoration-[var(--app-line)] underline-offset-2 transition-colors"
                >
                  {piece.title}
                </Link>
              </span>
            ))}
          </p>
        ) : null}

        {candidature.notes ? (
          <p className="text-secondary mt-2 text-sm leading-relaxed whitespace-pre-line">
            {candidature.notes}
          </p>
        ) : null}
      </div>

      <span
        className={`shrink-0 rounded-md px-2.5 py-1 text-xs ${TONS_STATUT[candidature.status]}`}
      >
        {STATUTS_FINANCEMENT[candidature.status]}
      </span>

      <div className="flex w-full flex-wrap items-center justify-end gap-2">
        <Link
          href={`/projets/${projetId}/financements?candidature=${candidature.id}#candidature-${candidature.id}`}
          className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
        >
          Modifier
          <span className="sr-only"> la candidature {candidature.funder}</span>
        </Link>
        <BoutonConfirme
          action={supprimerCandidature}
          champs={{ projet: projetId, candidature: candidature.id }}
          libelle="Supprimer"
          confirmation="Supprimer la candidature"
          discret
        />
      </div>
    </div>
  );
}
