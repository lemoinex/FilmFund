"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { inscription, type EtatFormulaire } from "../actions";

export function FormulaireInscription() {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(inscription, null);

  return (
    <form action={action} className="space-y-5">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "message" in etat ? <Message ton="succes">{etat.message}</Message> : null}

      <Field
        label="Nom ou nom d'usage"
        name="nom"
        autoComplete="name"
        placeholder="Awa Diop"
        aide="Affiché dans votre espace et auprès de vos collaborateurs."
      />
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
        autoComplete="new-password"
        required
        aide="Au moins 8 caractères, mêlant lettres et chiffres."
      />

      <SubmitButton enCours={enCours}>Créer mon compte</SubmitButton>
    </form>
  );
}
