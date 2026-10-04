"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  enCentimes,
  formaterMontant,
  montantPourSaisie,
  ORDRE_POSTES,
  POSTES,
  LIBELLE_MAX,
} from "@/lib/budgets";
import {
  bilanLignes,
  enNombre,
  LIVRABLES_STRUCTURES,
  nombreLignes,
  unitesTexte,
  type EtapeProposition,
  type LigneProposee,
} from "@/lib/propositions";
import type { BudgetCategory } from "@/lib/supabase/types";

import type { Devis } from "../actions-ia";
import {
  accepterLigneProposee,
  accepterLignesRestantes,
  annulerPropositionBudget,
  demanderDevisBudget,
  ecarterLigneProposee,
  ecarterLignesRestantes,
  lancerPropositionBudget,
  type SaisieLigne,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-light-muted hover:text-light hover:bg-navy-soft rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-navy-line bg-navy focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

const LIVRABLE = LIVRABLES_STRUCTURES.budget_plan;
const nombreFr = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

const libellePoste = (poste: string) => POSTES[poste as BudgetCategory] ?? poste;

/**
 * Demande de lignes de budget à l'assistant : devis, confirmation, suivi,
 * puis lignes à accepter, corriger ou écarter une à une.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les lignes lues par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Rien n'entre au budget sans une
 * acceptation.
 */
export function LignesProposees({
  projetId,
  devise,
  etape,
  lignes,
}: {
  projetId: string;
  devise: string;
  etape: EtapeProposition;
  /** Lignes de la proposition en cours ; vide hors de l'étape « proposition ». */
  lignes: LigneProposee[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  const [enCorrection, setEnCorrection] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const proposition = etape.etape === "proposition" ? etape : null;
  const bilan = bilanLignes(lignes);
  const montant = (centimes: number) => formaterMontant(centimes, devise);

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
      const resultat = await demanderDevisBudget(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-budget"
      className="border-navy-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-budget" className="text-sm font-medium">
        Assistant de production : {LIVRABLE.titre.toLowerCase()}
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
        {LIVRABLE.description} Rien n&apos;entre au budget sans votre accord, ligne par ligne.
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

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {(etape.etape === "repos" || etape.etape === "echec") && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : LIVRABLE.bouton}
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
                  () => lancerPropositionBudget(projetId, demande.devis.id, demande.cle),
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
            Demande enregistrée : les lignes attendent d&apos;être préparées.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerPropositionBudget(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Lignes en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-light-muted mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty">
            {LIVRABLE.avertissement}
          </p>

          <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed tabular-nums">
            {nombreLignes(bilan.enAttente)} à décider, pour {montant(bilan.totalEnAttenteCentimes)}
            {bilan.acceptees ? ` · ${nombreLignes(bilan.acceptees)} au budget` : ""}
            {bilan.ecartees ? ` · ${nombreLignes(bilan.ecartees)} hors budget` : ""}
          </p>

          <ul className="border-navy-line mt-4 divide-y divide-[var(--navy-line)] rounded-xl border">
            {lignes.map((ligne) => (
              <li key={ligne.id} className="p-4 sm:px-5">
                {ligne.state !== "proposed" ? (
                  <LigneDecidee ligne={ligne} montant={montant} />
                ) : ligne.id === enCorrection ? (
                  <Correction
                    ligne={ligne}
                    devise={devise}
                    enCours={enCours}
                    onAnnuler={() => setEnCorrection(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterLigneProposee(projetId, ligne.id, saisie),
                        () => setEnCorrection(null),
                      )
                    }
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <Apercu ligne={ligne} montant={montant} />
                    <div className="flex w-full flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => executer(() => accepterLigneProposee(projetId, ligne.id))}
                        className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Accepter
                        <span className="sr-only"> la ligne {ligne.label}</span>
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => {
                          setConfirmation(false);
                          setEnCorrection(ligne.id);
                        }}
                        className={BOUTON_DISCRET}
                      >
                        Corriger
                        <span className="sr-only"> la ligne {ligne.label}</span>
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => executer(() => ecarterLigneProposee(projetId, ligne.id))}
                        className={BOUTON_DISCRET}
                      >
                        Écarter
                        <span className="sr-only"> la ligne {ligne.label}</span>
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {bilan.enAttente > 0 ? (
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
                        () => accepterLignesRestantes(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours ? "Un instant…" : `Ajouter ${nombreLignes(bilan.enAttente)} au budget`}
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
                      setEnCorrection(null);
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
                      executer(() => ecarterLignesRestantes(projetId, proposition.propositionId))
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

function Apercu({
  ligne,
  montant,
}: {
  ligne: LigneProposee;
  montant: (centimes: number) => string;
}) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-gold text-xs font-medium">{libellePoste(ligne.category)}</p>
        <p className="mt-1 text-sm font-medium break-words">{ligne.label}</p>
        <p className="text-light-muted mt-1 text-xs tabular-nums">
          {nombreFr.format(ligne.quantity)} × {montant(enCentimes(ligne.unit_cost))}
        </p>
      </div>
      <p className="text-right text-sm tabular-nums">
        {montant(Math.round(Number(ligne.quantity) * Number(ligne.unit_cost) * 100))}
      </p>
    </>
  );
}

function LigneDecidee({
  ligne,
  montant,
}: {
  ligne: LigneProposee;
  montant: (centimes: number) => string;
}) {
  const acceptee = ligne.state === "accepted";
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 opacity-70">
      <Apercu ligne={ligne} montant={montant} />
      <p
        className={`w-full text-right text-xs ${acceptee ? "text-gold-bright" : "text-light-muted"}`}
      >
        {/* Les montants ci-dessus restent ceux de la proposition : une ligne
            corrigée avant d'être acceptée se lit dans le budget lui-même. */}
        {acceptee ? "Ajoutée au budget, telle quelle ou corrigée" : "Écartée"}
      </p>
    </div>
  );
}

/** Correction d'une ligne avant de l'accepter : les mêmes champs que le budget. */
function Correction({
  ligne,
  devise,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  ligne: LigneProposee;
  devise: string;
  enCours: boolean;
  onAccepter: (saisie: SaisieLigne) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieLigne>({
    poste: ligne.category,
    libelle: ligne.label,
    quantite: montantPourSaisie(ligne.quantity),
    cout: montantPourSaisie(ligne.unit_cost),
  });
  const champ = (nom: keyof SaisieLigne) => ({
    value: saisie[nom],
    onChange: (evenement: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setSaisie((actuelle) => ({ ...actuelle, [nom]: evenement.target.value })),
  });
  const id = `correction-${ligne.id}`;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-poste`} className="text-light-muted block text-xs">
          Poste
        </label>
        <select id={`${id}-poste`} className={CHAMP} {...champ("poste")}>
          {ORDRE_POSTES.map((poste) => (
            <option key={poste} value={poste}>
              {POSTES[poste]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-libelle`} className="text-light-muted block text-xs">
          Dépense
        </label>
        <input
          id={`${id}-libelle`}
          type="text"
          required
          maxLength={LIBELLE_MAX}
          className={CHAMP}
          {...champ("libelle")}
        />
      </div>
      <div>
        <label htmlFor={`${id}-quantite`} className="text-light-muted block text-xs">
          Quantité
        </label>
        <input
          id={`${id}-quantite`}
          type="text"
          inputMode="decimal"
          required
          className={CHAMP}
          {...champ("quantite")}
        />
      </div>
      <div>
        <label htmlFor={`${id}-cout`} className="text-light-muted block text-xs">
          Coût unitaire ({devise})
        </label>
        <input
          id={`${id}-cout`}
          type="text"
          inputMode="decimal"
          required
          className={CHAMP}
          {...champ("cout")}
        />
      </div>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Accepter cette ligne"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}
