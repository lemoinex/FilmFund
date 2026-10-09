"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { LONGUEURS_EPISODE } from "@/lib/episodes";
import {
  bilanEpisodes,
  cleDeNom,
  enNombre,
  LIVRABLE_EPISODES,
  nombreEpisodes,
  unitesTexte,
  type EpisodePropose,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  accepterEpisodePropose,
  accepterEpisodesRestants,
  annulerPropositionEpisodes,
  demanderDevisEpisodes,
  ecarterEpisodePropose,
  ecarterEpisodesRestants,
  lancerPropositionEpisodes,
  type SaisieEpisodePropose,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-light-muted hover:text-light hover:bg-navy-soft rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-navy-line bg-navy focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

/**
 * Demande d'épisodes à l'assistant : devis, confirmation, suivi, puis épisodes
 * à accepter — tels quels ou corrigés — ou à écarter, un à un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les lignes lues par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Aucun épisode n'entre dans la
 * saison sans une acceptation, et aucun épisode existant n'est modifié.
 *
 * La page des épisodes se lit de toute l'équipe : un lecteur lit ce qui est
 * proposé, sans bouton — `peutDecider` vient de la fonction que la RLS
 * applique, pas d'un choix de l'écran.
 */
export function EpisodesProposes({
  projetId,
  etape,
  episodes,
  titresExistants,
  peutDecider,
}: {
  projetId: string;
  etape: EtapeProposition;
  /** Lignes de la proposition en cours ; vide hors de l'étape « proposition ». */
  episodes: EpisodePropose[];
  /** Titres des épisodes déjà dans la saison, pour signaler un homonyme sans rien refuser. */
  titresExistants: string[];
  peutDecider: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  const [enSaisie, setEnSaisie] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const proposition = etape.etape === "proposition" ? etape : null;
  const bilan = bilanEpisodes(episodes);
  const auRepos = peutDecider && (etape.etape === "repos" || etape.etape === "echec");
  const dejaLa = new Set(titresExistants.map(cleDeNom));

  function executer(
    suite: () => Promise<{ erreur: string } | { ok: true; message?: string }>,
    apres?: () => void,
  ) {
    setErreur(null);
    setSucces(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        if (resultat.message) {
          setSucces(resultat.message);
        }
        apres?.();
      }
      router.refresh();
    });
  }

  function obtenirDevis() {
    setErreur(null);
    setSucces(null);
    demarrer(async () => {
      const resultat = await demanderDevisEpisodes(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-episodes"
      className="border-navy-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-episodes" className="text-sm font-medium">
        {LIVRABLE_EPISODES.titre}
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
        {peutDecider
          ? `${LIVRABLE_EPISODES.description} Aucun n'entre dans la saison sans votre accord, un à un.`
          : "Ce que l'assistant a proposé à l'équipe. Aucun de ces épisodes n'est dans la saison tant que le porteur ou un éditeur ne l'a pas accepté."}
      </p>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
      {succes ? (
        <div className="mt-4">
          <Message ton="succes">{succes}</Message>
        </div>
      ) : null}

      {peutDecider && etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : LIVRABLE_EPISODES.bouton}
        </button>
      ) : null}

      {auRepos && demande ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Cette proposition compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerPropositionEpisodes(projetId, demande.devis.id, demande.cle),
                  () => setDemande(null),
                )
              }
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : "Confirmer la demande"}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => setDemande(null)}
              className={BOUTON_SECONDAIRE}
            >
              Renoncer
            </button>
          </div>
        </div>
      ) : null}

      {peutDecider && etape.etape === "en_attente" ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : les épisodes attendent d&apos;être préparés.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerPropositionEpisodes(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {peutDecider && etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Épisodes en cours de préparation…
        </p>
      ) : null}

      {peutDecider && etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-light-muted mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty">
            {LIVRABLE_EPISODES.avertissement}
          </p>

          <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed tabular-nums">
            {nombreEpisodes(bilan.enAttente)} à décider
            {bilan.acceptes ? ` · ${nombreEpisodes(bilan.acceptes)} dans la saison` : ""}
            {bilan.ecartes ? ` · ${nombreEpisodes(bilan.ecartes)} hors saison` : ""}
          </p>

          <ol className="border-navy-line mt-4 divide-y divide-[var(--navy-line)] rounded-xl border">
            {episodes.map((episode) => (
              <li key={episode.id} className="p-4 sm:px-5">
                {episode.state !== "proposed" ? (
                  <div className="opacity-70">
                    <Apercu episode={episode} />
                    <p
                      className={`mt-1 text-right text-xs ${episode.state === "accepted" ? "text-gold-bright" : "text-light-muted"}`}
                    >
                      {/* Ce qui précède reste ce que l'assistant a proposé : un
                          épisode corrigé se lit dans la saison elle-même. */}
                      {episode.state === "accepted"
                        ? "Ajouté à la saison, tel quel ou corrigé"
                        : "Écarté"}
                    </p>
                  </div>
                ) : peutDecider && episode.id === enSaisie ? (
                  <Correction
                    episode={episode}
                    enCours={enCours}
                    onAnnuler={() => setEnSaisie(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterEpisodePropose(projetId, episode.id, saisie),
                        () => setEnSaisie(null),
                      )
                    }
                  />
                ) : (
                  <>
                    <Apercu episode={episode} />
                    {dejaLa.has(cleDeNom(episode.title)) ? (
                      <p className="text-gold-bright mt-2 text-xs leading-relaxed">
                        Un épisode de la saison porte déjà ce titre : l&apos;accepter en ajouterait
                        un second, sans toucher au premier.
                      </p>
                    ) : null}
                    {peutDecider ? (
                      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() =>
                            executer(() => accepterEpisodePropose(projetId, episode.id))
                          }
                          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Accepter
                          <span className="sr-only"> {episode.title}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => {
                            setConfirmation(false);
                            setEnSaisie(episode.id);
                          }}
                          className={BOUTON_DISCRET}
                        >
                          Corriger
                          <span className="sr-only"> {episode.title}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() =>
                            executer(() => ecarterEpisodePropose(projetId, episode.id))
                          }
                          className={BOUTON_DISCRET}
                        >
                          Écarter
                          <span className="sr-only"> {episode.title}</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ol>

          {peutDecider && bilan.enAttente > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {confirmation ? (
                <>
                  <button
                    type="button"
                    // Le focus passe sur la confirmation : au clavier, l'action
                    // reste à portée sans chercher le bouton qui vient d'apparaître.
                    autoFocus
                    disabled={enCours}
                    onClick={() =>
                      executer(
                        () => accepterEpisodesRestants(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours
                      ? "Un instant…"
                      : `Ajouter ${nombreEpisodes(bilan.enAttente)} à la saison`}
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => setConfirmation(false)}
                    className={BOUTON_SECONDAIRE}
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => {
                      setEnSaisie(null);
                      setConfirmation(true);
                    }}
                    className={BOUTON_PRINCIPAL}
                  >
                    Tout accepter
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      executer(() => ecarterEpisodesRestants(projetId, proposition.propositionId))
                    }
                    className={BOUTON_SECONDAIRE}
                  >
                    Écarter le reste
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** L'épisode tel que l'assistant l'a proposé : du texte, jamais du balisage. */
function Apercu({ episode }: { episode: EpisodePropose }) {
  return (
    <div className="min-w-0">
      <h3 className="min-w-0 font-serif text-lg leading-snug break-words">{episode.title}</h3>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty break-words whitespace-pre-line">
        {episode.summary}
      </p>
    </div>
  );
}

/** Correction d'un épisode proposé avant de l'accepter : le titre et le résumé d'un épisode saisi. */
function Correction({
  episode,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  episode: EpisodePropose;
  enCours: boolean;
  onAccepter: (saisie: SaisieEpisodePropose) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieEpisodePropose>({
    titre: episode.title,
    resume: episode.summary,
  });
  const id = `correction-${episode.id}`;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-1 gap-4"
    >
      <div>
        <label htmlFor={`${id}-titre`} className="text-light-muted block text-xs">
          Titre
        </label>
        <input
          id={`${id}-titre`}
          type="text"
          required
          maxLength={LONGUEURS_EPISODE.title}
          value={saisie.titre}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, titre: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-resume`} className="text-light-muted block text-xs">
          Résumé
        </label>
        <textarea
          id={`${id}-resume`}
          rows={5}
          maxLength={LONGUEURS_EPISODE.summary}
          value={saisie.resume}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, resume: evenement.target.value }))
          }
          className={`${CHAMP} resize-y leading-relaxed`}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Ajouter à la saison"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}
