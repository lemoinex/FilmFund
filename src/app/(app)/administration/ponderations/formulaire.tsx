"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  CRITERES,
  ORDRE_CRITERES,
  TOTAL_PONDERATIONS,
  totalSaisi,
  type Ponderations,
} from "@/lib/maturite";

import { publierVersionPonderations, type EtatPonderations } from "./actions";

/** « Total : 95 points — il en manque 5. » Le serveur revalide de toute façon. */
function descriptionTotal(total: number | null): string {
  if (total === null) {
    return "Total : saisissez un nombre entier dans chaque champ.";
  }
  if (total === TOTAL_PONDERATIONS) {
    return `Total : ${total} points.`;
  }
  const ecart = Math.abs(TOTAL_PONDERATIONS - total);
  return total < TOTAL_PONDERATIONS
    ? `Total : ${total} points — il en manque ${ecart}.`
    : `Total : ${total} points — ${ecart} de trop.`;
}

/**
 * Publication d'une nouvelle version des pondérations, préremplie avec la
 * version en vigueur. Le total se lit pendant la saisie.
 */
export function FormulairePonderations({
  valeurs,
  prochaineVersion,
}: {
  valeurs: Ponderations;
  prochaineVersion: number;
}) {
  const [etat, action, enCours] = useActionState<EtatPonderations, FormData>(
    publierVersionPonderations,
    null,
  );
  const [total, setTotal] = useState<number | null>(() => totalSaisi((code) => valeurs[code]));

  function suivreTotal(evenement: FormEvent<HTMLFormElement>) {
    const donnees = new FormData(evenement.currentTarget);
    setTotal(totalSaisi((code) => donnees.get(code)));
  }

  /*
   * Envoi déclenché à la main, et non par `action={action}` : après une
   * action de formulaire, React réinitialise ses champs, et une saisie
   * refusée serait effacée.
   */
  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    startTransition(() => action(donnees));
  }

  return (
    <form onSubmit={envoyer} onInput={suivreTotal} className="space-y-5">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ORDRE_CRITERES.map((code) => (
          <Field
            key={code}
            label={CRITERES[code]}
            name={code}
            id={`ponderation-${code}`}
            inputMode="numeric"
            required
            maxLength={3}
            defaultValue={String(valeurs[code])}
          />
        ))}
      </div>

      <p
        aria-live="polite"
        className={`text-sm tabular-nums ${total === TOTAL_PONDERATIONS ? "text-secondary" : "text-red-200"}`}
      >
        {descriptionTotal(total)}
      </p>

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>Publier la version {prochaineVersion}</SubmitButton>
      </div>
    </form>
  );
}
