"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { connexion, type EtatFormulaire } from "../actions";

export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(connexion, null);

  return (
    <form action={action} className="space-y-5">
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}

      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="vous@exemple.com"
      />
      <Field
        label="Mot de passe"
        name="motDePasse"
        type="password"
        autoComplete="current-password"
        required
      />

      <SubmitButton enCours={enCours}>Se connecter</SubmitButton>
    </form>
  );
}
