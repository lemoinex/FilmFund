"use client";

import { useActionState, useState } from "react";

import { Message, SubmitButton } from "@/components/ui/form";
import { bilanPlafond, enDollars, lirePlafond, PLAFOND_USD } from "@/lib/plafond-ia";

import { definirPlafond, type EtatIntegration } from "./actions";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm tabular-nums transition-colors outline-none";

/**
 * Changement du plafond mensuel.
 *
 * Rien n'est décidé ici : le montant est relu et borné par l'action serveur,
 * et la base n'admet l'écriture que d'un administrateur, qu'elle journalise.
 * Ce composant ne fait que prévenir, avant l'envoi, de ce qu'un plafond trop
 * bas entraînerait.
 */
export function FormulairePlafond({ depense, plafond }: { depense: number; plafond: number }) {
  const [etat, agir, enCours] = useActionState<EtatIntegration, FormData>(definirPlafond, null);
  const [saisie, setSaisie] = useState(String(plafond).replace(".", ","));

  const lu = lirePlafond(saisie);
  const tropBas = "plafond" in lu && bilanPlafond(depense, lu.plafond).atteint;

  return (
    <div className="space-y-4">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <form action={agir} className="space-y-4">
        <div>
          <label htmlFor="plafond-ia" className="mb-2 block text-sm font-medium">
            Plafond mensuel, en dollars
          </label>
          <input
            id="plafond-ia"
            name="plafond"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required
            maxLength={7}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            aria-describedby="plafond-ia-aide"
            className={`${CHAMP} sm:max-w-40`}
          />
          <p id="plafond-ia-aide" className="text-light-muted mt-2 text-xs leading-relaxed">
            De {PLAFOND_USD.min} à {PLAFOND_USD.max} dollars, deux décimales au plus. La borne de{" "}
            {PLAFOND_USD.max} dollars est un garde-fou de cet écran, pas une limite du fournisseur.
          </p>
          {tropBas ? (
            <p role="status" className="mt-2 text-xs leading-relaxed text-red-200">
              Ce plafond ne dépasse pas la dépense du mois ({enDollars(depense)}) : toute nouvelle
              demande serait refusée jusqu&apos;à la remise à zéro.
            </p>
          ) : null}
        </div>
        <div className="w-full sm:w-auto sm:max-w-xs">
          <SubmitButton enCours={enCours}>Changer le plafond</SubmitButton>
        </div>
      </form>
    </div>
  );
}
