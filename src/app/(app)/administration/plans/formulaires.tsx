"use client";

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { CHAMPS_BAREME, CHAMPS_PLAN, type ValeursBareme, type ValeursPlan } from "@/lib/plans";

import {
  changerPlanStudio,
  publierVersionBareme,
  publierVersionPlan,
  type EtatPlan,
} from "./actions";

/*
 * Envoi déclenché à la main, et non par `action={action}` : après une action
 * de formulaire, React réinitialise ses champs. Une liste déroulante
 * reviendrait à sa valeur initiale — l'ancien plan — et un second clic
 * annulerait en silence le changement ; une saisie refusée serait effacée.
 */
function envoyer(action: (donnees: FormData) => void) {
  return (evenement: FormEvent<HTMLFormElement>) => {
    evenement.preventDefault();
    const donnees = new FormData(evenement.currentTarget);
    startTransition(() => action(donnees));
  };
}

/**
 * Publication d'une nouvelle version, préremplie avec la version en cours :
 * commune aux plans et au barème, qui ne diffèrent que par leurs champs et
 * leur action.
 */
function FormulaireVersion<Cle extends string>({
  champs,
  valeurs,
  prochaineVersion,
  prefixe,
  publier,
  children,
}: {
  champs: readonly { cle: Cle; libelle: string }[];
  valeurs: Record<Cle, number>;
  prochaineVersion: number;
  /** Préfixe des identifiants de champ, unique dans la page. */
  prefixe: string;
  publier: (etat: EtatPlan, donnees: FormData) => Promise<EtatPlan>;
  children?: ReactNode;
}) {
  const [etat, action, enCours] = useActionState<EtatPlan, FormData>(publier, null);

  return (
    <form onSubmit={envoyer(action)} className="space-y-5">
      {children}

      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {champs.map((champ) => (
          <Field
            key={champ.cle}
            label={champ.libelle}
            name={champ.cle}
            id={`${prefixe}-${champ.cle}`}
            inputMode="numeric"
            required
            defaultValue={String(valeurs[champ.cle])}
          />
        ))}
      </div>

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>Publier la version {prochaineVersion}</SubmitButton>
      </div>
    </form>
  );
}

export function FormulaireVersionPlan({
  plan,
  valeurs,
  prochaineVersion,
}: {
  plan: string;
  valeurs: ValeursPlan;
  prochaineVersion: number;
}) {
  return (
    <FormulaireVersion
      champs={CHAMPS_PLAN}
      valeurs={valeurs}
      prochaineVersion={prochaineVersion}
      prefixe={plan}
      publier={publierVersionPlan}
    >
      <input type="hidden" name="plan" value={plan} />
    </FormulaireVersion>
  );
}

export function FormulaireVersionBareme({
  valeurs,
  prochaineVersion,
}: {
  valeurs: ValeursBareme;
  prochaineVersion: number;
}) {
  return (
    <FormulaireVersion
      champs={CHAMPS_BAREME}
      valeurs={valeurs}
      prochaineVersion={prochaineVersion}
      prefixe="bareme"
      publier={publierVersionBareme}
    />
  );
}

/** Changement du plan d'un studio, effectif aussitôt. */
export function FormulairePlanStudio({
  studio,
  planActuel,
  plans,
  libelleStudio,
}: {
  studio: string;
  planActuel: string;
  plans: { code: string; name: string }[];
  libelleStudio: string;
}) {
  const [etat, action, enCours] = useActionState<EtatPlan, FormData>(changerPlanStudio, null);
  const [choix, setChoix] = useState(planActuel);
  // Suit le plan réel quand la page se rafraîchit : ajustement pendant le
  // rendu, sans rendu intermédiaire incohérent.
  const [planConnu, setPlanConnu] = useState(planActuel);
  if (planActuel !== planConnu) {
    setPlanConnu(planActuel);
    setChoix(planActuel);
  }
  const id = `plan-${studio}`;

  return (
    <form onSubmit={envoyer(action)} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="studio" value={studio} />
      <label htmlFor={id} className="sr-only">
        Plan de {libelleStudio}
      </label>
      <select
        id={id}
        name="plan"
        value={choix}
        onChange={(e) => setChoix(e.target.value)}
        className="border-app-line bg-app focus:border-gold rounded-lg border px-3 py-2 text-sm transition-colors outline-none"
      >
        {plans.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="w-auto">
        <SubmitButton enCours={enCours}>Changer</SubmitButton>
      </div>
      {etat && "erreur" in etat ? (
        <div className="w-full">
          <Message ton="erreur">{etat.erreur}</Message>
        </div>
      ) : null}
      {etat && "succes" in etat ? (
        <div className="w-full">
          <Message ton="succes">{etat.succes}</Message>
        </div>
      ) : null}
    </form>
  );
}
