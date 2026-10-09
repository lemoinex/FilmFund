import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import {
  AIDE_EPISODES,
  decompteEpisodes,
  dureeEpisode,
  estSerie,
  libelleEpisode,
  NUMERO_EPISODE,
  numeroSuivant,
} from "@/lib/episodes";
import { FORMATS } from "@/lib/projets";
import {
  etapeProposition,
  LIVRABLE_EPISODES,
  type EpisodePropose,
  type EtapeProposition,
} from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";
import { RafraichissementPropositions } from "../proposition";

import { creerScenarioEpisode, supprimerEpisode } from "./actions";
import { EpisodesProposes } from "./episodes-proposes";
import { FormulaireEpisode, type EpisodeEditable } from "./formulaire";

export const metadata: Metadata = {
  title: "Épisodes — filmfundAfrica",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Épisodes d'un projet de série. Toute l'équipe les lit, comme la fiche ;
 * porteur, éditeurs et administrateurs les écrivent. La page n'existe que
 * pour une série : pour un autre format, elle répond comme une page absente.
 */
export default async function EpisodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ episode?: string }>;
}) {
  const { id } = await params;
  const { episode: enModification } = await searchParams;
  if (!UUID.test(id)) {
    notFound();
  }
  const supabase = await createClient();

  // Le projet ne se lit que de son équipe et de l'administration : la RLS en
  // décide, et un projet illisible répond comme une page absente.
  const [{ data: projet }, { data: peutEditer }, { data: budget }] = await Promise.all([
    supabase.from("projects").select("id, title, format").eq("id", id).maybeSingle(),
    // La même fonction que la RLS des épisodes : elle a le dernier mot.
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
  ]);

  if (!projet || !estSerie(projet.format)) {
    notFound();
  }

  const { data, error } = await supabase
    .from("project_episodes")
    .select("id, number, title, summary, duration_minutes")
    .eq("project_id", id)
    .order("number")
    .limit(NUMERO_EPISODE.max);

  if (error) {
    throw new Error("Lecture des épisodes impossible.");
  }

  const episodes: EpisodeEditable[] = data ?? [];

  // Le scénario de chaque épisode, s'il en a un : un par épisode au plus,
  // la base le garantit. Lus sous la RLS des documents, comme l'équipe les lit.
  const { data: rattaches } = await supabase
    .from("project_documents")
    .select("id, episode_id")
    .eq("project_id", id)
    .eq("type", "scenario")
    .not("episode_id", "is", null)
    .limit(NUMERO_EPISODE.max);
  const scenarios = new Map(
    (rattaches ?? []).flatMap((document) =>
      document.episode_id ? [[document.episode_id, document.id] as const] : [],
    ),
  );
  const edite = peutEditer === true;
  const propose = numeroSuivant(episodes.map((episode) => episode.number));
  const assistant = await lireAssistant(supabase, id, edite);
  // Qui écrit les épisodes voit toujours l'encart ; un lecteur, seulement
  // quand une proposition attend la décision de l'équipe.
  const montrerAssistant = edite || assistant.etape.etape === "proposition";

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}/fiche`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← Fiche de {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Épisodes
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        {FORMATS[projet.format]} · {AIDE_EPISODES}
      </p>

      <OngletsProjet projetId={id} actif="fiche" budget={budget === true} />

      <p role="status" className="text-light-muted mt-8 text-sm">
        {decompteEpisodes(episodes.length)}.
      </p>

      {episodes.length ? (
        <ol className="mt-5 space-y-4">
          {episodes.map((episode) => (
            <li
              key={episode.id}
              id={`episode-${episode.id}`}
              className="border-navy-line scroll-mt-8 rounded-xl border p-5"
            >
              {edite && episode.id === enModification ? (
                <FormulaireEpisode projetId={id} episode={episode} />
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-serif text-xl leading-tight break-words">
                      <span className="text-light-muted block text-xs tracking-wide uppercase">
                        {libelleEpisode(episode.number)}
                      </span>
                      {episode.title}
                    </h2>
                    {edite ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <Link
                          href={`/projets/${id}/episodes?episode=${episode.id}#episode-${episode.id}`}
                          className="text-light-muted hover:bg-navy-soft hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
                        >
                          Modifier
                          <span className="sr-only"> : {libelleEpisode(episode.number)}</span>
                        </Link>
                        <BoutonConfirme
                          action={supprimerEpisode}
                          champs={{ projet: id, episode: episode.id }}
                          libelle="Retirer"
                          confirmation={`Retirer « ${episode.title} » ? Son résumé sera perdu.`}
                          discret
                        />
                      </div>
                    ) : null}
                  </div>
                  <p className="text-light-muted mt-2 text-xs">
                    Durée : {dureeEpisode(episode.duration_minutes) ?? "Information non fournie."}
                  </p>
                  {episode.summary ? (
                    <p className="mt-3 text-sm leading-relaxed text-pretty break-words whitespace-pre-line">
                      {episode.summary}
                    </p>
                  ) : (
                    <p className="text-light-muted mt-3 text-sm">Résumé non fourni.</p>
                  )}
                  {scenarios.has(episode.id) ? (
                    <p className="mt-4 text-sm">
                      <Link
                        href={`/projets/${id}/documents/${scenarios.get(episode.id)}`}
                        className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                      >
                        Ouvrir le scénario
                        <span className="sr-only"> de {libelleEpisode(episode.number)}</span>
                      </Link>
                    </p>
                  ) : edite ? (
                    <form action={creerScenarioEpisode} className="mt-4">
                      <input type="hidden" name="projet" value={id} />
                      <input type="hidden" name="episode" value={episode.id} />
                      <button
                        type="submit"
                        className="text-gold hover:text-gold-bright text-sm underline-offset-2 hover:underline"
                      >
                        Créer le scénario
                        <span className="sr-only"> de {libelleEpisode(episode.number)}</span>
                      </button>
                    </form>
                  ) : (
                    <p className="text-light-muted mt-4 text-xs">Scénario non commencé.</p>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-navy-line text-light-muted mt-5 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
          {edite
            ? "Aucun épisode pour l'instant. Ajoutez le premier ci-dessous : il sera présenté comme le pilote."
            : "Aucun épisode n'a encore été saisi pour cette série."}
        </p>
      )}

      {edite ? (
        <section
          aria-labelledby="ajout-episode"
          className="border-navy-line mt-10 scroll-mt-8 border-t pt-8"
        >
          <h2 id="ajout-episode" className="font-serif text-xl leading-tight">
            Ajouter un épisode
          </h2>
          {propose === null ? (
            <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
              Le dernier numéro admis, {NUMERO_EPISODE.max}, est pris : donnez à l&apos;épisode un
              numéro encore libre.
            </p>
          ) : null}
          <div className="mt-5">
            {/* Le numéro proposé change après chaque ajout : le formulaire repart de lui. */}
            <FormulaireEpisode
              key={`ajout-${propose ?? "plein"}`}
              projetId={id}
              numeroPropose={propose}
            />
          </div>
        </section>
      ) : null}

      <RafraichissementPropositions
        actif={assistant.etape.etape === "en_attente" || assistant.etape.etape === "en_cours"}
      />
      {montrerAssistant ? (
        <EpisodesProposes
          projetId={id}
          etape={assistant.etape}
          episodes={assistant.proposes}
          titresExistants={episodes.map((episode) => episode.title)}
          peutDecider={edite}
        />
      ) : null}
    </div>
  );
}

/**
 * Où en est la dernière demande d'épisodes sur ce projet, et les lignes de sa
 * proposition si elle attend encore une décision.
 *
 * Trois lectures bornées, sous la RLS de l'appelant. Qui écrit les épisodes
 * suit la demande depuis sa tâche ; un lecteur ne lit que la dernière
 * proposition — il n'a pas à voir une demande en cours, seulement ce qui est
 * proposé à l'équipe.
 */
async function lireAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  peutDecider: boolean,
): Promise<{ etape: EtapeProposition; proposes: EpisodePropose[] }> {
  let etape: EtapeProposition = { etape: "repos" };

  if (peutDecider) {
    const { data: tache } = await supabase
      .from("jobs")
      .select("id, state")
      .eq("project_id", projetId)
      .eq("action", LIVRABLE_EPISODES.action)
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
      .eq("action", LIVRABLE_EPISODES.action)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proposition?.state === "proposed") {
      etape = { etape: "proposition", propositionId: proposition.id, texte: proposition.content };
    }
  }

  if (etape.etape !== "proposition") {
    return { etape, proposes: [] };
  }

  const { data: proposes } = await supabase
    .from("ai_suggestion_episodes")
    .select("id, position, title, summary, state")
    .eq("suggestion_id", etape.propositionId)
    .order("position")
    // Bornée comme la base borne le dépôt.
    .limit(LIVRABLE_EPISODES.lignesMax);

  return { etape, proposes: proposes ?? [] };
}
