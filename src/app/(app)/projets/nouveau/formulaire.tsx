"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { ETAPES, FORMATS } from "@/lib/projets";
import { creerProjet, type EtatProjet } from "../actions";

export function FormulaireProjet() {
  const [etat, action, enCours] = useActionState<EtatProjet, FormData>(creerProjet, null);

  return (
    <form action={action} className="space-y-5">
      {etat?.erreur ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <Field label="Titre du projet" name="titre" required placeholder="Lumière de l'Océan" />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="format" className="mb-2 block text-sm font-medium">
            Format
          </label>
          <select
            id="format"
            name="format"
            defaultValue="long_metrage"
            className="border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none"
          >
            {Object.entries(FORMATS).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="etape" className="mb-2 block text-sm font-medium">
            Étape
          </label>
          <select
            id="etape"
            name="etape"
            defaultValue="idee"
            className="border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none"
          >
            {Object.entries(ETAPES).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="logline" className="mb-2 block text-sm font-medium">
          Pitch <span className="text-light-muted font-normal">(facultatif)</span>
        </label>
        <textarea
          id="logline"
          name="logline"
          rows={3}
          maxLength={500}
          placeholder="Une phrase qui résume le film."
          aria-describedby="logline-aide"
          className="border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
        />
        <p id="logline-aide" className="text-light-muted mt-2 text-xs leading-relaxed">
          500 caractères maximum. Modifiable à tout moment.
        </p>
      </div>

      <SubmitButton enCours={enCours}>Créer le projet</SubmitButton>
    </form>
  );
}
