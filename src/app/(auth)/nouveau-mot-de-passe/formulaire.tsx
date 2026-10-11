"use client";

import { useActionState } from "react";

import { PasswordField } from "@/components/ui/champ-mot-de-passe";
import { Message, SubmitButton } from "@/components/ui/form";
import { definirNouveauMotDePasse, type EtatFormulaire } from "../actions";

export function FormulaireNouveauMotDePasse() {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(
    definirNouveauMotDePasse,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <PasswordField
        label="Nouveau mot de passe"
        name="motDePasse"
        autoComplete="new-password"
        aide="Au moins 8 caractères, mêlant lettres et chiffres."
      />
      <PasswordField
        label="Confirmer le mot de passe"
        name="confirmation"
        autoComplete="new-password"
      />

      <SubmitButton enCours={enCours}>Enregistrer le mot de passe</SubmitButton>
    </form>
  );
}
