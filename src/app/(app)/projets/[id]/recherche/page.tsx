import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import {
  bilanSources,
  etapeProposition,
  LIVRABLE_RECHERCHE,
  nombreSources,
  segmentsSynthese,
  type EtapeProposition,
  type SourceProposee,
} from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";
import { RafraichissementPropositions } from "../proposition";
import { supprimerSource } from "./actions";
import { DecisionSource, DemandeRecherche, EcarterSourcesRestantes } from "./recherche";

export const metadata: Metadata = {
  title: "Recherche — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Sources retenues affichées : au-delà, la page le dit plutôt que de s'allonger sans fin. */
const SOURCES_RETENUES_MAX = 200;

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

/** « 14 mars 2026 », d'une date ou d'un horodatage de la base. */
const enJour = (valeur: string) => jour.format(new Date(valeur));

/** Libellés des cinq statuts du dépôt. Ce lot n'en écrit qu'un : « non vérifiée ». */
const STATUTS: Readonly<Record<string, string>> = {
  non_verifie: "Non vérifiée",
  verifie: "Vérifiée",
  expire: "Expirée",
  introuvable: "Introuvable",
  demo: "Démonstration",
};

export default async function RecherchePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: projet }, { data: peutEditer }, { data: budget }, { data: retenues }] =
    await Promise.all([
      supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
      supabase.rpc("peut_editer_contenu", { p_project_id: id }),
      supabase.rpc("peut_gerer_budget", { p_project_id: id }),
      supabase
        .from("project_sources")
        .select("id, url, title, site, excerpt, published_on, collected_at, status, question")
        .eq("project_id", id)
        .order("created_at", { ascending: false })
        .limit(SOURCES_RETENUES_MAX),
    ]);

  if (!projet) {
    notFound();
  }

  const peutDecider = peutEditer === true;
  const recherche = await lireRecherche(supabase, projet.id, peutDecider);
  const gardees = retenues ?? [];
  const bilan = bilanSources(recherche.sources);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Recherche
      </h1>
      <p className="text-secondary mt-3 text-sm">
        {gardees.length
          ? `${nombreSources(gardees.length)} ${gardees.length > 1 ? "retenues" : "retenue"} pour ce projet.`
          : "Aucune source retenue pour l'instant."}
      </p>

      <OngletsProjet projetId={projet.id} actif="recherche" budget={budget === true} />

      {peutDecider ? (
        <>
          <RafraichissementPropositions
            actif={recherche.etape.etape === "en_attente" || recherche.etape.etape === "en_cours"}
          />
          <DemandeRecherche
            projetId={projet.id}
            etape={recherche.etape}
            sansSource={recherche.sansSource}
          />
        </>
      ) : null}

      {recherche.synthese !== null ? (
        <section aria-labelledby="derniere-recherche" className="mt-12">
          <h2 id="derniere-recherche" className="font-serif text-2xl leading-tight">
            Dernière recherche
          </h2>
          {recherche.question ? (
            <p className="text-secondary mt-2 text-sm leading-relaxed">
              <span className="sr-only">Question posée : </span>« {recherche.question} »
            </p>
          ) : null}

          <p className="border-gold/40 bg-gold/10 text-gold-bright mt-5 rounded-lg border px-4 py-3 text-xs leading-relaxed text-pretty">
            {LIVRABLE_RECHERCHE.avertissement}
          </p>

          <h3 className="text-gold mt-8 text-sm font-medium">Synthèse</h3>
          {/*
           * Texte venu d'un modèle : affiché comme du texte, jamais interprété.
           * Seuls les renvois « [n] » deviennent des liens, vers la source de
           * cette page — jamais vers une adresse que le modèle aurait écrite.
           */}
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
            {segmentsSynthese(recherche.synthese, recherche.sources.length).map((segment, rang) =>
              "renvoi" in segment ? (
                <a
                  key={rang}
                  href={`#source-${segment.renvoi}`}
                  className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                >
                  <span className="sr-only">source </span>[{segment.renvoi}]
                </a>
              ) : (
                <span key={rang}>{segment.texte}</span>
              ),
            )}
          </p>

          <h3 className="text-gold mt-10 text-sm font-medium">
            Sources collectées
            <span className="text-secondary font-normal">
              {" "}
              — {nombreSources(recherche.sources.length)}
              {bilan.enAttente ? `, ${bilan.enAttente} en attente de décision` : ""}
            </span>
          </h3>
          <ol className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
            {recherche.sources.map((source) => (
              <li
                key={source.id}
                id={`source-${source.position}`}
                className="scroll-mt-8 p-4 sm:px-5"
              >
                <Source
                  numero={source.position}
                  titre={source.title}
                  adresse={source.url}
                  site={source.site}
                  publiee={source.published_on}
                  extrait={source.excerpt}
                  mention={
                    source.state === "accepted"
                      ? "Retenue"
                      : source.state === "dismissed"
                        ? "Écartée"
                        : source.cited
                          ? "Citée dans la synthèse"
                          : "Non citée dans la synthèse"
                  }
                />
                {source.state === "proposed" && peutDecider ? (
                  <DecisionSource
                    projetId={projet.id}
                    sourceId={source.id}
                    numero={source.position}
                  />
                ) : null}
              </li>
            ))}
          </ol>

          {bilan.enAttente && recherche.propositionId ? (
            peutDecider ? (
              <EcarterSourcesRestantes
                projetId={projet.id}
                propositionId={recherche.propositionId}
                nombre={bilan.enAttente}
              />
            ) : (
              <p className="text-secondary mt-4 text-xs leading-relaxed">
                Seuls le porteur et les éditeurs du projet décident des sources proposées.
              </p>
            )
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="sources-retenues" className="border-app-line mt-12 border-t pt-10">
        <h2 id="sources-retenues" className="font-serif text-2xl leading-tight">
          Sources du projet
        </h2>
        {gardees.length ? (
          <>
            <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
              {LIVRABLE_RECHERCHE.avertissement}
            </p>
            <ul className="border-app-line mt-5 divide-y divide-[var(--app-line)] rounded-xl border">
              {gardees.map((source) => (
                <li key={source.id} className="p-4 sm:px-5">
                  <Source
                    titre={source.title}
                    adresse={source.url}
                    site={source.site}
                    publiee={source.published_on}
                    extrait={source.excerpt}
                    mention={STATUTS[source.status] ?? source.status}
                  />
                  <p className="text-secondary mt-2 text-xs leading-relaxed">
                    Collectée le {enJour(source.collected_at)}, pour la question « {source.question}{" "}
                    ».
                  </p>
                  {peutDecider ? (
                    <div className="mt-3">
                      <BoutonConfirme
                        action={supprimerSource}
                        champs={{ projet: projet.id, source: source.id }}
                        libelle="Retirer"
                        confirmation="Retirer la source"
                        discret
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {gardees.length >= SOURCES_RETENUES_MAX ? (
              <p className="text-secondary mt-4 text-xs leading-relaxed">
                Seules les {SOURCES_RETENUES_MAX} sources les plus récentes sont affichées.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-secondary mt-3 max-w-xl text-sm leading-relaxed text-pretty">
            {peutDecider
              ? "Les sources que vous retenez d'une recherche se rangent ici, avec leur adresse, leur extrait et la date de leur collecte."
              : "Les sources retenues par l'équipe apparaîtront ici."}
          </p>
        )}
      </section>
    </div>
  );
}

type Recherche = {
  etape: EtapeProposition;
  propositionId: string | null;
  /** La synthèse de la dernière recherche aboutie ; null s'il n'y en a pas. */
  synthese: string | null;
  /** La question posée, pour qui peut lire la demande. */
  question: string | null;
  /** La dernière demande a échoué faute de page exploitable. */
  sansSource: boolean;
  sources: SourceProposee[];
};

/**
 * Où en est la dernière demande de recherche, et la dernière recherche
 * aboutie avec ses sources.
 *
 * Lectures bornées, sous la RLS de l'appelant. Qui écrit le projet suit la
 * demande depuis sa tâche ; un lecteur ne lit que ce qui est proposé à
 * l'équipe. La synthèse reste lisible une fois ses sources décidées : elle
 * n'est rangée nulle part ailleurs.
 */
async function lireRecherche(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  peutDecider: boolean,
): Promise<Recherche> {
  let etape: EtapeProposition = { etape: "repos" };
  let sansSource = false;

  if (peutDecider) {
    const { data: tache } = await supabase
      .from("jobs")
      .select("id, state, reason")
      .eq("project_id", projetId)
      .eq("action", LIVRABLE_RECHERCHE.action)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: enCours } = tache
      ? await supabase
          .from("ai_suggestions")
          .select("id, content, state")
          .eq("job_id", tache.id)
          .maybeSingle()
      : { data: null };
    etape = etapeProposition(tache, enCours);
    // Le motif du worker distingue « rien trouvé » d'une panne : l'écran ne
    // dit « non trouvée » que dans le premier cas.
    sansSource = etape.etape === "echec" && /^Aucune source exploitable/.test(tache?.reason ?? "");
  }

  const { data: proposition } = await supabase
    .from("ai_suggestions")
    .select("id, content, job_id")
    .eq("project_id", projetId)
    .eq("action", LIVRABLE_RECHERCHE.action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!proposition) {
    return {
      etape,
      sansSource,
      propositionId: null,
      synthese: null,
      question: null,
      sources: [],
    };
  }

  const [{ data: sources }, { data: tache }] = await Promise.all([
    supabase
      .from("ai_suggestion_sources")
      .select("id, position, url, title, site, excerpt, published_on, cited, state")
      .eq("suggestion_id", proposition.id)
      .order("position")
      // Bornée comme la base borne le dépôt.
      .limit(LIVRABLE_RECHERCHE.sourcesMax),
    // La question vit sur la tâche, que seuls ceux qui la suivent lisent.
    peutDecider
      ? supabase.from("jobs").select("params").eq("id", proposition.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const parametres = tache?.params as { question?: unknown } | null | undefined;
  return {
    etape,
    sansSource,
    propositionId: proposition.id,
    synthese: proposition.content,
    question: typeof parametres?.question === "string" ? parametres.question : null,
    sources: sources ?? [],
  };
}

/**
 * Une source, proposée ou retenue : ce que la collecte a rendu, et rien
 * d'autre. Titre et extrait viennent du web : affichés comme du texte. Le
 * lien s'ouvre à part, sans rien transmettre de la page d'où il part.
 */
function Source({
  numero,
  titre,
  adresse,
  site,
  publiee,
  extrait,
  mention,
}: {
  numero?: number;
  titre: string;
  adresse: string;
  site: string;
  publiee: string | null;
  extrait: string;
  mention: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium">
        {numero ? <span className="text-gold">[{numero}] </span> : null}
        {titre}
      </p>
      <p className="text-secondary mt-1 text-xs leading-relaxed">
        {site}
        {" · "}
        {publiee ? `datée du ${enJour(publiee)}` : "date non indiquée"}
        {" · "}
        <span className="text-light">{mention}</span>
      </p>
      <blockquote className="border-app-line text-secondary mt-3 border-l-2 pl-3 text-xs leading-relaxed whitespace-pre-line">
        {extrait}
      </blockquote>
      <p className="mt-2 text-xs">
        <a
          href={adresse}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-gold hover:text-gold-bright break-all underline-offset-2 hover:underline"
        >
          Ouvrir la page
          <span className="sr-only">
            {" "}
            « {titre} » sur {site}, dans un nouvel onglet
          </span>
        </a>
      </p>
    </div>
  );
}
