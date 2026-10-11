"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { CHAMPS_FICHE_PERSONNAGE } from "@/lib/fiche";
import {
  enNombre,
  LIVRABLE_FICHE_PERSONNAGE,
  unitesTexte,
  type ChampFichePropose,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  accepterChampPropose,
  annulerPropositionFiche,
  demanderDevisFiche,
  ecarterChampPropose,
  lancerPropositionFiche,
} from "./actions-fiche";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-light-muted hover:text-light hover:bg-navy-soft rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-navy-line bg-navy focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

/** Le champ de la fiche qu'une ligne propose, par le nom que lit l'agent. */
const CHAMPS_PAR_NOM: Readonly<Record<string, { libelle: string; max: number; ligne: boolean }>> = {
  age: CHAMPS_FICHE_PERSONNAGE[0],
  occupation: CHAMPS_FICHE_PERSONNAGE[1],
  apparence: CHAMPS_FICHE_PERSONNAGE[2],
  objectif: CHAMPS_FICHE_PERSONNAGE[3],
  obstacle: CHAMPS_FICHE_PERSONNAGE[4],
  arc: CHAMPS_FICHE_PERSONNAGE[5],
  traits: CHAMPS_FICHE_PERSONNAGE[6],
  liens: CHAMPS_FICHE_PERSONNAGE[7],
};

/**
 * Fiche d'un personnage demandée à l'assistant : devis, confirmation, suivi,
 * puis champs à accepter — tels quels ou corrigés — ou à écarter, un à un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les lignes lues par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Il ne désigne qu'un personnage ;
 * la base décide de ses champs vides, et n'en remplace jamais un rempli.
 *
 * L'assistant de création n'existe que pour le porteur et les éditeurs : qui
 * voit cet encart peut en décider.
 */
export function FicheProposee({
  projetId,
  personnageId,
  nom,
  etape,
  champs,
}: {
  projetId: string;
  personnageId: string;
  nom: string;
  etape: EtapeProposition;
  champs: readonly ChampFichePropose[];
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché, et la clé qui rend un double envoi sans effet.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  const [enSaisie, setEnSaisie] = useState<string | null>(null);
  const [corrige, setCorrige] = useState("");

  const auRepos = etape.etape === "repos" || etape.etape === "echec";
  const aDecider = champs.filter((champ) => champ.state === "proposed");

  function executer(action: () => Promise<{ ok: true } | { erreur: string }>, apres?: () => void) {
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

  function obtenirDevis() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await demanderDevisFiche(projetId, personnageId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-label={`${LIVRABLE_FICHE_PERSONNAGE.titre} : ${nom}`}
      className="border-navy-line mt-4 border-t pt-4"
    >
      <h3 className="text-sm font-medium">{LIVRABLE_FICHE_PERSONNAGE.titre}</h3>

      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-3 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <>
          <p className="text-light-muted mt-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_FICHE_PERSONNAGE.description}
          </p>
          <button
            type="button"
            onClick={obtenirDevis}
            disabled={enCours}
            className={`${BOUTON_SECONDAIRE} mt-3`}
          >
            {enCours ? "Un instant…" : LIVRABLE_FICHE_PERSONNAGE.bouton}
            <span className="sr-only"> pour {nom}</span>
          </button>
        </>
      ) : null}

      {auRepos && demande ? (
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Cette proposition compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerPropositionFiche(projetId, demande.devis.id, demande.cle),
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
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : la fiche attend d&apos;être préparée.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerPropositionFiche(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-3`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          Fiche en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {etape.etape === "proposition" && aDecider.length ? (
        <div className="mt-3">
          <p className="text-light-muted text-xs leading-relaxed text-pretty">
            {LIVRABLE_FICHE_PERSONNAGE.avertissement}
          </p>
          <ul className="mt-3 space-y-3">
            {aDecider.map((champ) => {
              const regle = CHAMPS_PAR_NOM[champ.field];
              const libelle = regle?.libelle ?? champ.field;
              const id = `champ-propose-${champ.id}`;
              return (
                <li key={champ.id} className="border-navy-line rounded-lg border p-4">
                  <p className="text-light-muted text-xs">{libelle}</p>
                  {enSaisie === champ.id ? (
                    <>
                      <label htmlFor={id} className="sr-only">
                        {libelle} de {nom}, à corriger
                      </label>
                      {regle?.ligne ? (
                        <input
                          id={id}
                          type="text"
                          value={corrige}
                          maxLength={regle.max}
                          onChange={(evenement) => setCorrige(evenement.target.value)}
                          className={CHAMP}
                        />
                      ) : (
                        <textarea
                          id={id}
                          rows={4}
                          value={corrige}
                          maxLength={regle?.max}
                          onChange={(evenement) => setCorrige(evenement.target.value)}
                          className={`${CHAMP} resize-y leading-relaxed`}
                        />
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm leading-relaxed text-pretty break-words whitespace-pre-line">
                      {champ.value}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() =>
                        executer(
                          () =>
                            accepterChampPropose(
                              projetId,
                              champ.id,
                              enSaisie === champ.id ? corrige : undefined,
                            ),
                          () => setEnSaisie(null),
                        )
                      }
                      className={BOUTON_PRINCIPAL}
                    >
                      {enSaisie === champ.id ? "Accepter ma correction" : "Accepter"}
                      <span className="sr-only">
                        {" "}
                        : {libelle} de {nom}
                      </span>
                    </button>
                    {enSaisie === champ.id ? (
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => setEnSaisie(null)}
                        className={BOUTON_DISCRET}
                      >
                        Annuler la correction
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => {
                          setCorrige(champ.value);
                          setEnSaisie(champ.id);
                        }}
                        className={BOUTON_DISCRET}
                      >
                        Corriger
                        <span className="sr-only">
                          {" "}
                          : {libelle} de {nom}
                        </span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => executer(() => ecarterChampPropose(projetId, champ.id))}
                      className={BOUTON_DISCRET}
                    >
                      Écarter
                      <span className="sr-only">
                        {" "}
                        : {libelle} de {nom}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
