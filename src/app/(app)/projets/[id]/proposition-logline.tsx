"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { enNombre, PITCH_MAX, unitesTexte, type EtapePitch } from "@/lib/propositions";

import {
  annulerPitch,
  appliquerProposition,
  demanderDevisPitch,
  ecarterProposition,
  lancerPitch,
  type Devis,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Rythme de rafraîchissement tant que la proposition se prépare. */
const RAFRAICHISSEMENT_MS = 3000;

/**
 * Demande de pitch à l'assistant d'écriture : devis, confirmation, suivi,
 * puis proposition à comparer, modifier, appliquer ou écarter.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape calculée par la page, et ses boutons ne font qu'appeler des
 * actions qui revérifient chaque droit.
 */
export function PropositionLogline({
  projetId,
  pitchActuel,
  etape,
  peutAppliquer,
}: {
  projetId: string;
  pitchActuel: string;
  etape: EtapePitch;
  /** Porteur et éditeurs : un administrateur hors de l'équipe peut demander et écarter, pas appliquer. */
  peutAppliquer: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);

  const proposition = etape.etape === "proposition" ? etape : null;
  const [texte, setTexte] = useState(proposition?.texte ?? "");
  // Une nouvelle proposition remplace le texte en cours d'édition :
  // ajustement pendant le rendu, sans rendu intermédiaire incohérent.
  const [propositionConnue, setPropositionConnue] = useState(proposition?.propositionId ?? null);
  if ((proposition?.propositionId ?? null) !== propositionConnue) {
    setPropositionConnue(proposition?.propositionId ?? null);
    setTexte(proposition?.texte ?? "");
  }

  const enPreparation = etape.etape === "en_attente" || etape.etape === "en_cours";
  useEffect(() => {
    if (!enPreparation) {
      return;
    }
    const minuterie = setInterval(() => router.refresh(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [enPreparation, router]);

  function executer(action: () => Promise<{ erreur: string } | object>, apres?: () => void) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await action();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        apres?.();
      }
      router.refresh();
    });
  }

  function demanderDevis() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await demanderDevisPitch(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-pitch"
      className="border-navy-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-pitch" className="text-sm font-medium">
        Assistant d&apos;écriture : proposition de pitch
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
        L&apos;assistant rédige une proposition à partir de la fiche du projet — titre, format,
        étape, synopsis et pitch actuel —, transmise pour cela à notre fournisseur d&apos;IA. Rien
        n&apos;est remplacé sans votre accord.
      </p>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. L&apos;unité réservée a été rendue.
        </p>
      ) : null}

      {(etape.etape === "repos" || etape.etape === "echec") && !demande ? (
        <button
          type="button"
          onClick={demanderDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : "Proposer un pitch"}
        </button>
      ) : null}

      {(etape.etape === "repos" || etape.etape === "echec") && demande ? (
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
                  () => lancerPitch(projetId, demande.devis.id, demande.cle),
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

      {etape.etape === "en_attente" ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : la proposition attend d&apos;être rédigée.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerPitch(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Proposition en cours de rédaction…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-light-muted mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ;
          l&apos;unité reste réservée d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-light-muted text-xs tracking-wide uppercase">Pitch actuel</h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty">
                {pitchActuel || <span className="text-light-muted">Pas encore de pitch.</span>}
              </p>
            </div>
            <div>
              <label
                htmlFor="proposition-pitch"
                className="text-light-muted block text-xs tracking-wide uppercase"
              >
                {peutAppliquer ? "Proposition, modifiable" : "Proposition"}
              </label>
              <textarea
                id="proposition-pitch"
                rows={7}
                maxLength={PITCH_MAX}
                readOnly={!peutAppliquer}
                value={texte}
                onChange={(evenement) => setTexte(evenement.target.value)}
                aria-describedby="proposition-pitch-longueur"
                className="border-navy-line bg-navy focus:border-gold mt-2 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
              />
              <p id="proposition-pitch-longueur" className="text-light-muted mt-1 text-xs">
                {texte.length} / {PITCH_MAX} caractères
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {peutAppliquer ? (
              <button
                type="button"
                disabled={enCours || !texte.trim()}
                onClick={() =>
                  executer(() => appliquerProposition(projetId, proposition.propositionId, texte))
                }
                className={BOUTON_PRINCIPAL}
              >
                {enCours ? "Un instant…" : "Utiliser cette proposition"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(() => ecarterProposition(projetId, proposition.propositionId))
              }
              className={BOUTON_SECONDAIRE}
            >
              Écarter
            </button>
          </div>
          {peutAppliquer ? null : (
            <p className="text-light-muted mt-3 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet peuvent appliquer une proposition.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
