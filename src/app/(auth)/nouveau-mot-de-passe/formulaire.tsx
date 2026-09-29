"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { definirNouveauMotDePasse, type EtatFormulaire } from "../actions";

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(
    definirNouveauMotDePasse,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <Field
        label="Nouveau mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="new-password"
        required
        aide="Au moins 8 caractères, mêlant lettres et chiffres."
      />
      <Field
        label="Confirmer le mot de passe"
        name="confirmation"
        type="password"
        autoComplete="new-password"
        required
      />

      <SubmitButton enCours={enCours}>Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}
