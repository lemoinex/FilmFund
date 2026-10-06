"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  enNombre,
  libelleRecherche,
  LIVRABLE_CONTEXTE,
  LIVRABLE_RECHERCHE,
  MODES_RECHERCHE,
  unitesTexte,
  type ActionRecherche,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  annulerRecherche,
  demanderDevisRecherche,
  ecarterSource,
  ecarterSourcesRestantes,
  lancerRecherche,
  retenirSource,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-4 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";

type Issue = { erreur: string } | { ok: true };

/**
 * Demande d'une recherche : la question, le devis, la confirmation, le suivi.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape lue par la page, et ses boutons ne font qu'appeler des actions qui
 * revérifient chaque droit. Avant tout envoi, il dit ce qui quitte la
 * plateforme — la question, et elle seule — et la remontre telle qu'elle
 * partira.
 */
export function DemandeRecherche({
  projetId,
  etape,
  sansSource,
}: {
  projetId: string;
  etape: EtapeProposition;
  /** La dernière recherche a échoué faute de page exploitable, et pour cela seulement. */
  sansSource: boolean;
}) {
  const router = useRouter();
  const champ = useId();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");
  const [mode, setMode] = useState<ActionRecherche>(LIVRABLE_RECHERCHE.action);
  // Le devis affiché, la question telle qu'elle partira, et la clé de la
  // demande : la clé naît avec le devis et ne change plus, si bien qu'un
  // double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{
    devis: Devis;
    question: string;
    mode: ActionRecherche;
    cle: string;
  } | null>(null);

  const auRepos = etape.etape === "repos" || etape.etape === "echec";

  function executer(suite: () => Promise<Issue>, apres?: () => void) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        apres?.();
      }
      router.refresh();
    });
  }

  function obtenirDevis() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await demanderDevisRecherche(projetId, saisie, mode);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ ...resultat, mode, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="demande-recherche"
      className="border-app-line bg-surface mt-10 rounded-xl border p-5"
    >
      <h2 id="demande-recherche" className="text-sm font-medium">
        {LIVRABLE_RECHERCHE.titre}
      </h2>
      <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
        {LIVRABLE_RECHERCHE.description}
      </p>

      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          {sansSource
            ? `${LIVRABLE_RECHERCHE.introuvable} Le moteur n'a rendu aucune page exploitable pour cette question : reformulez-la.`
            : "La dernière recherche n'a pas abouti."}{" "}
          Les unités réservées ont été rendues.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <form
          className="mt-4"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            obtenirDevis();
          }}
        >
          <fieldset>
            <legend className="text-xs font-medium">Où chercher</legend>
            <div className="mt-2 space-y-2">
              {MODES_RECHERCHE.map((choix) => (
                <label key={choix.action} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${champ}-mode`}
                    value={choix.action}
                    checked={mode === choix.action}
                    onChange={() => setMode(choix.action)}
                    className="accent-gold mt-1"
                  />
                  <span>
                    {choix.libelle}
                    <span className="text-secondary block text-xs">{choix.aide}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {mode === LIVRABLE_CONTEXTE.action ? (
            <div className="border-app-line mt-4 rounded-lg border px-3 py-3">
              <p className="text-secondary text-xs leading-relaxed text-pretty">
                {LIVRABLE_CONTEXTE.description}
              </p>
              <p className="mt-3 text-xs font-medium">{LIVRABLE_CONTEXTE.perimetre}</p>
              <ul className="text-secondary mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {LIVRABLE_CONTEXTE.domaines.map((domaine) => (
                  <li key={domaine}>{domaine}</li>
                ))}
              </ul>
              <p className="text-light mt-3 text-xs leading-relaxed text-pretty">
                {LIVRABLE_CONTEXTE.reserve}
              </p>
            </div>
          ) : null}

          <label htmlFor={champ} className="mt-4 block text-xs font-medium">
            Votre question
          </label>
          <textarea
            id={champ}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            rows={3}
            minLength={LIVRABLE_RECHERCHE.questionMin}
            maxLength={LIVRABLE_RECHERCHE.questionMax}
            required
            aria-describedby={`${champ}-aide`}
            className="border-app-line focus:border-gold mt-2 block w-full rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none"
          />
          <p id={`${champ}-aide`} className="text-light mt-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_RECHERCHE.transmission}
          </p>
          <button type="submit" disabled={enCours} className={`${BOUTON_PRINCIPAL} mt-4`}>
            {enCours ? "Un instant…" : "Voir ce que coûte cette recherche"}
          </button>
        </form>
      ) : null}

      {auRepos && demande ? (
        <div className="mt-4">
          <p className="text-gold text-xs font-medium">{libelleRecherche(demande.mode)}</p>
          <p className="mt-2 text-xs font-medium">La question qui sera transmise</p>
          <p className="border-app-line mt-2 rounded-lg border px-3 py-2 text-sm leading-relaxed">
            {demande.question}
          </p>
          <p role="status" className="mt-3 text-sm leading-relaxed text-pretty">
            Cette recherche compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <p className="text-light mt-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_RECHERCHE.transmission}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerRecherche(projetId, demande.devis.id, demande.cle),
                  () => {
                    setDemande(null);
                    setSaisie("");
                  },
                )
              }
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : LIVRABLE_RECHERCHE.bouton}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => setDemande(null)}
              className={BOUTON_SECONDAIRE}
            >
              Modifier la question
            </button>
          </div>
        </div>
      ) : null}

      {etape.etape === "en_attente" ? (
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : la recherche attend d&apos;être lancée.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerRecherche(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-3`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          Recherche en cours : collecte des pages, puis synthèse…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          Cette recherche a été interrompue avant sa fin. Son issue est en cours de vérification ;
          les unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {etape.etape === "proposition" ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          Des sources attendent votre décision ci-dessous. Retenez-les ou écartez-les avant de
          lancer une autre recherche.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Retenir ou écarter une source proposée. Une source se retient telle que
 * collectée : rien ne s'y corrige.
 */
export function DecisionSource({
  projetId,
  sourceId,
  numero,
}: {
  projetId: string;
  sourceId: string;
  numero: number;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function executer(suite: () => Promise<Issue>) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      }
      router.refresh();
    });
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enCours}
          onClick={() => executer(() => retenirSource(projetId, sourceId))}
          className={BOUTON_PRINCIPAL}
        >
          {enCours ? "Un instant…" : "Retenir"}
          <span className="sr-only"> la source {numero}</span>
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => executer(() => ecarterSource(projetId, sourceId))}
          className={BOUTON_SECONDAIRE}
        >
          Écarter
          <span className="sr-only"> la source {numero}</span>
        </button>
      </div>
      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
    </div>
  );
}

/** Écarte d'un geste les sources qui attendent encore : rien de plus n'entre au projet. */
export function EcarterSourcesRestantes({
  projetId,
  propositionId,
  nombre,
}: {
  projetId: string;
  propositionId: string;
  nombre: number;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={enCours}
        onClick={() => {
          setErreur(null);
          demarrer(async () => {
            const resultat = await ecarterSourcesRestantes(projetId, propositionId);
            if ("erreur" in resultat) {
              setErreur(resultat.erreur);
            }
            router.refresh();
          });
        }}
        className={BOUTON_SECONDAIRE}
      >
        {enCours
          ? "Un instant…"
          : nombre > 1
            ? `Écarter les ${enNombre(nombre)} sources restantes`
            : "Écarter la source restante"}
      </button>
      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
    </div>
  );
}
