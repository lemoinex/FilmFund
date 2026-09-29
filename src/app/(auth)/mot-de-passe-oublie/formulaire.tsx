"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { demanderReinitialisation, type EtatFormulaire } from "../actions";

export function FormulaireDemande({ lienInvalide }: { lienInvalide?: boolean }) {
  const [etat, action, enCours] = useActionState<EtatFormulaire, FormData>(
    demanderReinitialisation,
    null,
  );

  return (
    <form action={action} className="space-y-5">
      {lienInvalide && !etat ? (
        <Message ton="erreur">
          Ce lien de réinitialisation n&apos;est plus valable. Demandez-en un nouveau.
        </Message>
      ) : null}

      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "message" in etat ? <Message ton="succes">{etat.message}</Message> : null}

      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="vous@exemple.com"
      />

      <SubmitButton enCours={enCours}>Recevoir le lien</SubmitButton>
    </form>
  );
}
