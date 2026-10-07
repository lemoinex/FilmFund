import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { estEtape, etapeDe, etapePrecedente, etapeSuivante, type CleEtape } from "@/lib/assistant";
import { lireAcces } from "@/lib/equipes";
import { MAX_PERSONNAGES, ROLES_PERSONNAGE } from "@/lib/fiche";
import { listerPays } from "@/lib/profils";
import {
  etapeProposition,
  LIVRABLE_PERSONNAGES,
  type EtapeProposition,
  type PersonnagePropose,
} from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";

import { RafraichissementPropositions } from "../../proposition";
import { supprimerPersonnage } from "../actions";
import { BarreEtapes, FormulaireEtape } from "../formulaires";
import { FormulairePersonnage, type PersonnageEditable } from "../personnages";
import { PersonnagesProposes } from "../personnages-proposes";

export const metadata: Metadata = {
  title: "Assistant de création — filmfundAfrica",
  robots: { index: false, follow: false },
};

const BOUTON =
  "bg-gold text-navy hover:bg-gold-bright block w-full rounded-full px-6 py-3.5 text-center text-sm font-medium transition-colors sm:w-auto sm:min-w-64";

export default async function EtapeAssistant({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; etape: string }>;
  searchParams: Promise<{ personnage?: string }>;
}) {
  const { id, etape } = await params;
  const { personnage: enModification } = await searchParams;
  if (!estEtape(etape)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/connexion");
  }

  const [{ data: projet }, { data: accesBrut }] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, format, stage, logline, genre, countries, languages, duration_minutes, short_synopsis, theme, stakes, artistic_vision, goals, audience",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("acces_au_projet", { p_project_id: id }),
  ]);

  /*
   * Porteur et éditeurs seulement, comme la RLS, qui a le dernier mot. Un
   * lecteur, un administrateur hors équipe ou un inconnu reçoivent la même
   * page introuvable : l'assistant n'existe pas pour eux.
   */
  const acces = lireAcces(accesBrut);
  if (!projet || (acces !== "owner" && acces !== "editor")) {
    notFound();
  }

  const definition = etapeDe(etape);
  const adresse = (cle: CleEtape | null) =>
    cle ? `/projets/${id}/assistant/${cle}` : `/projets/${id}/fiche`;
  const precedente = etapePrecedente(etape);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}/fiche`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <p className="text-gold mt-6 text-xs tracking-wide uppercase">Assistant de création</p>
      <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        {definition.titre}
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">{definition.aide}</p>

      <BarreEtapes projetId={id} actuelle={etape} />

      <div className="mt-8">
        {etape === "personnages" ? (
          <Personnages
            projetId={id}
            enModification={enModification}
            suivante={adresse(etapeSuivante(etape))}
            precedente={adresse(precedente)}
          />
        ) : (
          <FormulaireEtape
            projetId={id}
            etape={etape}
            valeurs={projet}
            // Noms et ordre des pays calculés ici, côté serveur, puis passés tels quels.
            pays={etape === "informations" ? listerPays() : []}
            precedente={precedente ? adresse(precedente) : undefined}
            suivante={adresse(etapeSuivante(etape))}
          />
        )}
      </div>
    </div>
  );
}

async function Personnages({
  projetId,
  enModification,
  suivante,
  precedente,
}: {
  projetId: string;
  enModification?: string;
  suivante: string;
  precedente: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_characters")
    .select("id, name, role, description")
    .eq("project_id", projetId)
    .order("position")
    .order("created_at");
  const personnages: PersonnageEditable[] = data ?? [];
  const assistant = await lireAssistant(supabase, projetId);

  return (
    <>
      {personnages.length ? (
        <ol className="space-y-4">
          {personnages.map((personnage) => (
            <li
              key={personnage.id}
              id={`personnage-${personnage.id}`}
              className="border-navy-line scroll-mt-8 rounded-xl border p-5"
            >
              {personnage.id === enModification ? (
                <FormulairePersonnage projetId={projetId} personnage={personnage} />
              ) : (
                <Personnage projetId={projetId} personnage={personnage} />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-navy-line text-light-muted rounded-xl border border-dashed p-5 text-sm leading-relaxed">
          Aucun personnage pour l&apos;instant. Chacun s&apos;enregistre dès son ajout ; vous
          pourrez les reprendre à tout moment.
        </p>
      )}

      <section aria-labelledby="ajout-personnage" className="border-navy-line mt-10 border-t pt-8">
        <h2 id="ajout-personnage" className="font-serif text-2xl leading-tight">
          Nouveau personnage
        </h2>
        {personnages.length < MAX_PERSONNAGES ? (
          <div className="mt-6">
            <FormulairePersonnage projetId={projetId} />
          </div>
        ) : (
          <p className="text-light-muted mt-3 text-sm">
            {MAX_PERSONNAGES} personnages au plus par projet. Retirez-en un pour en ajouter un
            autre.
          </p>
        )}
      </section>

      <RafraichissementPropositions
        actif={assistant.etape.etape === "en_attente" || assistant.etape.etape === "en_cours"}
      />
      <PersonnagesProposes
        projetId={projetId}
        etape={assistant.etape}
        personnages={assistant.proposes}
        nomsExistants={personnages.map((personnage) => personnage.name)}
      />

      <div className="border-navy-line mt-10 flex flex-col gap-2 border-t pt-8 sm:flex-row sm:items-center">
        <Link href={suivante} className={BOUTON}>
          Continuer
        </Link>
        <Link
          href={precedente}
          className="text-light-muted hover:text-light rounded-full px-3 py-2 text-center text-sm transition-colors sm:ml-auto"
        >
          ← Étape précédente
        </Link>
      </div>
    </>
  );
}

/**
 * Où en est la dernière demande de personnages sur ce projet, et les lignes
 * de sa proposition si elle attend encore une décision.
 *
 * Trois lectures bornées, sous la RLS de l'appelant. L'assistant n'existe que
 * pour le porteur et les éditeurs : tous suivent la demande depuis sa tâche.
 */
async function lireAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
): Promise<{ etape: EtapeProposition; proposes: PersonnagePropose[] }> {
  const { data: tache } = await supabase
    .from("jobs")
    .select("id, state")
    .eq("project_id", projetId)
    .eq("action", LIVRABLE_PERSONNAGES.action)
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
  const etape = etapeProposition(tache, proposition);

  if (etape.etape !== "proposition") {
    return { etape, proposes: [] };
  }

  const { data: proposes } = await supabase
    .from("ai_suggestion_characters")
    .select("id, position, name, role, description, state")
    .eq("suggestion_id", etape.propositionId)
    .order("position")
    // Bornée comme la base borne le dépôt.
    .limit(LIVRABLE_PERSONNAGES.lignesMax);

  return { etape, proposes: proposes ?? [] };
}

function Personnage({
  projetId,
  personnage,
}: {
  projetId: string;
  personnage: PersonnageEditable;
}) {
  const role = Object.hasOwn(ROLES_PERSONNAGE, personnage.role)
    ? ROLES_PERSONNAGE[personnage.role as keyof typeof ROLES_PERSONNAGE]
    : null;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="min-w-0 font-serif text-lg leading-snug break-words">{personnage.name}</h2>
        {role ? (
          <span
            className={`rounded px-2 py-0.5 text-xs ${
              personnage.role === "principal" ? "text-gold bg-gold/10" : "bg-navy-soft"
            }`}
          >
            {role}
          </span>
        ) : null}
      </div>
      {personnage.description ? (
        <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty whitespace-pre-line">
          {personnage.description}
        </p>
      ) : null}
      <div className="border-navy-line mt-4 flex flex-wrap items-center justify-end gap-1 border-t pt-3">
        <Link
          href={`/projets/${projetId}/assistant/personnages?personnage=${personnage.id}#personnage-${personnage.id}`}
          className="text-light-muted hover:bg-navy-soft hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
        >
          Modifier<span className="sr-only"> {personnage.name}</span>
        </Link>
        <BoutonConfirme
          action={supprimerPersonnage}
          champs={{ projet: projetId, personnage: personnage.id }}
          libelle="Retirer"
          confirmation={`Retirer ${personnage.name}`}
          discret
        />
      </div>
    </>
  );
}
