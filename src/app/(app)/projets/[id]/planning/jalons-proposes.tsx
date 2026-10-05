"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { PHASES, TITRE_ETAPE_MAX } from "@/lib/planning";
import { ETAPES } from "@/lib/projets";
import {
  bilanJalons,
  dureeEnJours,
  echeanceProposee,
  enNombre,
  LIVRABLES_STRUCTURES,
  nombreJalons,
  unitesTexte,
  type EtapeProposition,
  type JalonPropose,
} from "@/lib/propositions";
import type { ProjectStage } from "@/lib/supabase/types";

import type { Devis } from "../actions-ia";
import {
  accepterJalonPropose,
  accepterJalonsRestants,
  annulerPropositionPlanning,
  demanderDevisPlanning,
  ecarterJalonPropose,
  ecarterJalonsRestants,
  lancerPropositionPlanning,
  type SaisieJalon,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-secondary hover:text-light hover:bg-surface-hover rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-app-line bg-app focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none [color-scheme:dark]";

const LIVRABLE = LIVRABLES_STRUCTURES.schedule_plan;

const libellePhase = (phase: string) => ETAPES[phase as ProjectStage] ?? phase;

/**
 * Demande de jalons de planning à l'assistant : devis, confirmation, suivi,
 * puis jalons à accepter — datés par l'équipe — ou à écarter, un à un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les jalons lus par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Rien n'entre au planning sans
 * une acceptation.
 *
 * Le planning se lit de toute l'équipe : un lecteur voit les jalons proposés,
 * sans pouvoir en demander ni en décider.
 */
export function JalonsProposes({
  projetId,
  etape,
  jalons,
  peutDecider,
}: {
  projetId: string;
  etape: EtapeProposition;
  /** Jalons de la proposition en cours ; vide hors de l'étape « proposition ». */
  jalons: JalonPropose[];
  /** Qui écrit le planning : porteur, éditeurs, administrateurs. */
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
  const bilan = bilanJalons(jalons);
  const auRepos = etape.etape === "repos" || etape.etape === "echec";

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
      const resultat = await demanderDevisPlanning(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-planning"
      className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-planning" className="text-sm font-medium">
        Assistant de production : {LIVRABLE.titre.toLowerCase()}
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
        {LIVRABLE.description} Rien n&apos;entre au planning sans accord, jalon par jalon.
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
        <p role="status" className="text-secondary mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {peutDecider && auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : LIVRABLE.bouton}
        </button>
      ) : null}

      {peutDecider && auRepos && demande ? (
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
                  () => lancerPropositionPlanning(projetId, demande.devis.id, demande.cle),
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
            Demande enregistrée : les jalons attendent d&apos;être préparés.
          </p>
          {peutDecider ? (
            <button
              type="button"
              disabled={enCours}
              onClick={() => executer(() => annulerPropositionPlanning(projetId, etape.tacheId))}
              className={`${BOUTON_SECONDAIRE} mt-4`}
            >
              Annuler la demande
            </button>
          ) : null}
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Jalons en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty">
            {LIVRABLE.avertissement}
          </p>

          <p role="status" className="text-secondary mt-4 text-sm leading-relaxed tabular-nums">
            {nombreJalons(bilan.enAttente)} à décider
            {bilan.acceptes ? ` · ${nombreJalons(bilan.acceptes)} au planning` : ""}
            {bilan.ecartes ? ` · ${nombreJalons(bilan.ecartes)} hors planning` : ""}
          </p>

          <ol className="border-app-line mt-4 divide-y divide-[var(--app-line)] rounded-xl border">
            {jalons.map((jalon) => (
              <li key={jalon.id} className="p-4 sm:px-5">
                {jalon.state !== "proposed" ? (
                  <JalonDecide jalon={jalon} />
                ) : jalon.id === enSaisie && peutDecider ? (
                  <Acceptation
                    jalon={jalon}
                    enCours={enCours}
                    onAnnuler={() => setEnSaisie(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterJalonPropose(projetId, jalon.id, saisie),
                        () => setEnSaisie(null),
                      )
                    }
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <Apercu jalon={jalon} />
                    {peutDecider ? (
                      <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => {
                            setConfirmation(false);
                            setEnSaisie(jalon.id);
                          }}
                          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Dater et accepter
                          <span className="sr-only"> le jalon {jalon.title}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => executer(() => ecarterJalonPropose(projetId, jalon.id))}
                          className={BOUTON_DISCRET}
                        >
                          Écarter
                          <span className="sr-only"> le jalon {jalon.title}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
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
                        () => accepterJalonsRestants(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours
                      ? "Un instant…"
                      : `Ajouter ${nombreJalons(bilan.enAttente)} au planning, sans date`}
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
                      executer(() => ecarterJalonsRestants(projetId, proposition.propositionId))
                    }
                    className={BOUTON_SECONDAIRE}
                  >
                    Écarter le reste
                  </button>
                </>
              )}
            </div>
          ) : null}
          {peutDecider ? null : (
            <p className="text-secondary mt-4 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet décident des jalons proposés.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Apercu({ jalon }: { jalon: JalonPropose }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-gold text-xs font-medium">{libellePhase(jalon.phase)}</p>
      <p className="mt-1 text-sm font-medium break-words">{jalon.title}</p>
      <p className="text-secondary mt-1 text-xs tabular-nums">
        Durée estimée : {dureeEnJours(jalon.duration_days)}
      </p>
    </div>
  );
}

function JalonDecide({ jalon }: { jalon: JalonPropose }) {
  const accepte = jalon.state === "accepted";
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 opacity-70">
      <Apercu jalon={jalon} />
      <p className={`w-full text-right text-xs ${accepte ? "text-gold-bright" : "text-secondary"}`}>
        {/* Ce qui précède reste ce que l'assistant a proposé : un jalon
            corrigé ou daté à l'acceptation se lit dans le planning lui-même. */}
        {accepte ? "Ajouté au planning, tel quel ou corrigé" : "Écarté"}
      </p>
    </div>
  );
}

/**
 * Acceptation d'un jalon : l'équipe le date, et le corrige au besoin. Les
 * dates sont facultatives ; dès qu'un début est saisi, l'échéance est
 * proposée d'après la durée estimée, et reste modifiable.
 */
function Acceptation({
  jalon,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  jalon: JalonPropose;
  enCours: boolean;
  onAccepter: (saisie: SaisieJalon) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieJalon>({
    titre: jalon.title,
    phase: jalon.phase,
    debut: "",
    echeance: "",
  });
  // Tant que l'équipe n'a pas touché à l'échéance, elle suit le début.
  const [echeanceLibre, setEcheanceLibre] = useState(false);
  const id = `acceptation-${jalon.id}`;

  function changerDebut(debut: string) {
    setSaisie((actuelle) => ({
      ...actuelle,
      debut,
      echeance: echeanceLibre
        ? actuelle.echeance
        : (echeanceProposee(debut, jalon.duration_days) ?? ""),
    }));
  }

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-titre`} className="text-secondary block text-xs">
          Intitulé
        </label>
        <input
          id={`${id}-titre`}
          type="text"
          required
          maxLength={TITRE_ETAPE_MAX}
          value={saisie.titre}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, titre: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-phase`} className="text-secondary block text-xs">
          Phase
        </label>
        <select
          id={`${id}-phase`}
          value={saisie.phase}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, phase: evenement.target.value }))
          }
          className={CHAMP}
        >
          {PHASES.map((phase) => (
            <option key={phase} value={phase}>
              {ETAPES[phase]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-debut`} className="text-secondary block text-xs">
          Début (facultatif)
        </label>
        <input
          id={`${id}-debut`}
          type="date"
          value={saisie.debut}
          onChange={(evenement) => changerDebut(evenement.target.value)}
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-echeance`} className="text-secondary block text-xs">
          Échéance (facultatif)
        </label>
        <input
          id={`${id}-echeance`}
          type="date"
          value={saisie.echeance}
          aria-describedby={`${id}-duree`}
          onChange={(evenement) => {
            setEcheanceLibre(true);
            setSaisie((actuelle) => ({ ...actuelle, echeance: evenement.target.value }));
          }}
          className={CHAMP}
        />
      </div>
      <p id={`${id}-duree`} className="text-secondary text-xs leading-relaxed sm:col-span-2">
        Durée estimée par l&apos;assistant : {dureeEnJours(jalon.duration_days)}. L&apos;échéance
        suit le début tant que vous ne la changez pas ; sans date, la durée est gardée dans les
        notes du jalon.
      </p>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Ajouter au planning"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}
