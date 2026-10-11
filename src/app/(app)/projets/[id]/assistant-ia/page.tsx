import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  besoinsDuProjet,
  decompteAttentes,
  decompteDemandes,
  destinationAssistant,
  NATURES_ATTENTE,
  TACHES_LUES_MAX,
  type TarifAssistant,
} from "@/lib/assistant-ia";
import { estSerie } from "@/lib/episodes";
import { lireAcces } from "@/lib/equipes";
import { FORMATS } from "@/lib/projets";
import { unitesImage, unitesTexte } from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";

import { chargerAttentes } from "./lecture";

export const metadata: Metadata = {
  title: "Assistant IA — FilmFund Africa",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

/** Colonnes du barème publié : une par prix que la page affiche. */
const COLONNES_BAREME =
  "version_number, logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note, direction_note, pitch_extended, pitch_oral, dramatic_analysis, character_list, episode_list, budget_plan, schedule_plan, shot_list, gear_list, research, cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage";

/** Ce qu'un prix compte, quand il ne compte pas une demande entière. */
const PAR: Partial<Record<TarifAssistant, string>> = {
  screenplay_per_sequence: " par séquence",
  dialogue_per_scene: " par scène",
  text_edit_per_passage: " par passage",
};

/**
 * Ce que l'assistant sait faire pour ce projet, et où le lui demander.
 *
 * La page ne lance rien : elle mène à l'encart de chaque demande, qui garde
 * son devis et sa confirmation. Elle se lit de toute l'équipe ; les liens ne
 * se montrent qu'à qui peut engager les unités du studio.
 */
export default async function AssistantIaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    notFound();
  }
  const supabase = await createClient();

  // Le projet ne se lit que de son équipe et de l'administration : la RLS en
  // décide, et un projet illisible répond comme une page absente.
  const [
    { data: projet },
    { data: accesBrut },
    { data: estAdmin },
    { data: budget },
    { data: bareme },
  ] = await Promise.all([
    supabase.from("projects").select("id, title, format").eq("id", id).maybeSingle(),
    supabase.rpc("acces_au_projet", { p_project_id: id }),
    supabase.rpc("is_admin"),
    // La fonction que la base applique au budget : elle a le dernier mot.

    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase
      .from("text_unit_rate_versions")
      .select(COLONNES_BAREME)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!projet) {
    notFound();
  }

  // Même règle que la fonction SQL peut_engager_unites, que la base applique à
  // chaque devis et que les comptes n'appellent pas : porteur, éditeurs et
  // administrateurs. Elle ne décide ici que des liens montrés.
  const acces = lireAcces(accesBrut);
  const peutDemander = acces === "owner" || acces === "editor" || estAdmin === true;
  const gereBudget = budget === true;
  const besoins = besoinsDuProjet({ serie: estSerie(projet.format), budget: gereBudget });
  // Lu après le contrôle d'accès, sous la RLS de l'appelant.
  const { attentes, borneAtteinte } = await chargerAttentes(supabase, id, {
    peutDemander,
    budget: gereBudget,
  });

  const prix = (tarif: TarifAssistant): string => {
    if (tarif === "image") {
      return `${unitesImage(1)}, sur le quota d'images`;
    }
    return bareme ? `${unitesTexte(bareme[tarif])}${PAR[tarif] ?? ""}` : "Prix indisponible";
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Assistant IA
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        {FORMATS[projet.format]} · Ce que l&apos;assistant sait faire pour ce projet, et où le lui
        demander. Cette page ne lance rien : chaque demande se fait sur son écran, après un devis
        affiché et votre confirmation.
      </p>

      <OngletsProjet projetId={id} actif="projet" budget={gereBudget} />

      <section aria-labelledby="assistant-attente" className="mt-8">
        <h2 id="assistant-attente" className="font-serif text-xl leading-tight">
          Ce qui attend
        </h2>
        <p role="status" className="text-light-muted mt-2 text-sm">
          {decompteAttentes(attentes)}.
        </p>
        {attentes.length ? (
          <ul className="mt-5 space-y-3">
            {attentes.map((attente) => (
              <li key={attente.id} className="border-navy-line rounded-xl border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-medium break-words">{attente.libelle}</h3>
                  <span
                    className={`text-xs ${attente.nature === "proposition" ? "text-gold" : "text-light-muted"}`}
                  >
                    {NATURES_ATTENTE[attente.nature]}
                  </span>
                </div>
                <p className="text-light-muted mt-2 text-xs leading-relaxed break-words">
                  {attente.cible ? `${attente.cible} · ` : ""}
                  Demandée le {dateFr.format(new Date(attente.depuis))}
                </p>
                {attente.chemin === null ? (
                  <p className="text-light-muted mt-2 text-xs leading-relaxed text-pretty">
                    Ce qu&apos;elle visait n&apos;est plus en place : aucun écran ne l&apos;ouvre
                    plus.
                  </p>
                ) : (
                  <Link
                    href={`/projets/${id}${attente.chemin}`}
                    className="text-light-muted hover:bg-navy-soft hover:text-light mt-3 inline-flex rounded-full px-3 py-1.5 text-xs transition-colors"
                  >
                    Ouvrir
                    <span className="sr-only"> : {attente.libelle}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-light-muted mt-4 text-xs leading-relaxed text-pretty">
          Chaque écran ne garde que sa dernière demande : une proposition plus ancienne, jamais
          décidée, n&apos;apparaît pas ici. Rien ne se décide depuis cette page.
          {borneAtteinte
            ? ` Seules les ${TACHES_LUES_MAX} dernières demandes du projet sont lues : la liste peut être incomplète.`
            : ""}
        </p>
      </section>

      <p role="status" className="text-light-muted border-navy-line mt-10 border-t pt-8 text-sm">
        {decompteDemandes(besoins)} possibles pour ce projet.
      </p>

      {peutDemander ? null : (
        <p className="border-navy-line mt-4 rounded-xl border p-4 text-sm leading-relaxed text-pretty">
          Vous lisez ce projet : seuls son porteur et ses éditeurs demandent à l&apos;assistant.
          Vous lisez ici ce qu&apos;il peut faire ; ce que l&apos;équipe accepte se lit dans chaque
          rubrique.
        </p>
      )}

      {besoins.map((besoin) => (
        <section
          key={besoin.cle}
          aria-labelledby={`besoin-${besoin.cle}`}
          className="border-navy-line mt-10 border-t pt-8"
        >
          <h2 id={`besoin-${besoin.cle}`} className="font-serif text-xl leading-tight">
            {besoin.titre}
          </h2>
          <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">{besoin.aide}</p>

          <ul className="mt-5 space-y-4">
            {besoin.demandes.map((demande) => (
              <li key={demande.action} className="border-navy-line rounded-xl border p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-medium break-words">{demande.libelle}</h3>
                  <span className="text-gold text-xs">{prix(demande.tarif)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-pretty">{demande.effet}</p>
                <p className="text-light-muted mt-2 text-xs leading-relaxed text-pretty">
                  {demande.lieu}
                </p>
                {peutDemander ? (
                  <Link
                    href={destinationAssistant(id, demande)}
                    className="text-light-muted hover:bg-navy-soft hover:text-light mt-3 inline-flex rounded-full px-3 py-1.5 text-xs transition-colors"
                  >
                    Ouvrir cet écran
                    <span className="sr-only"> : {demande.libelle}</span>
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section
        aria-labelledby="assistant-regles"
        className="border-navy-line mt-10 border-t pt-8 text-sm leading-relaxed"
      >
        <h2 id="assistant-regles" className="font-serif text-xl leading-tight">
          Ce qui ne change jamais
        </h2>
        <ul className="text-light-muted mt-4 list-disc space-y-2 pl-5 text-pretty">
          <li>
            Vous gardez la main : une proposition se lit, se corrige, s&apos;accepte ou
            s&apos;écarte. Rien n&apos;est remplacé sans votre accord.
          </li>
          <li>
            Les calculs restent ceux de la plateforme : totaux du budget, plan de financement,
            besoin électrique, score de maturité, compatibilité d&apos;une opportunité.
            L&apos;assistant n&apos;en rend aucun.
          </li>
          <li>Chaque écran dit, avant tout envoi, ce qui est transmis au fournisseur d&apos;IA.</li>
          <li>
            {bareme
              ? `Les prix sont ceux du barème en vigueur (version ${bareme.version_number}) ; le devis affiché avant chaque demande fait foi.`
              : "Le barème n'a pas pu être lu : le devis affiché avant chaque demande dit son prix."}
          </li>
        </ul>
      </section>
    </div>
  );
}
