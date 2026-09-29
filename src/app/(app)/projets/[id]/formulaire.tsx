"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { ETAPES, FORMATS } from "@/lib/projets";
import type { ProjectFormat, ProjectStage } from "@/lib/supabase/types";
import { mettreAJourProjet, type EtatProjet } from "../actions";

type Projet = {
  id: string;
  title: string;
  format: ProjectFormat;
  stage: ProjectStage;
  logline: string;
  synopsis: string;
};

export function FormulaireEdition({ projet }: { projet: Projet }) {
  const [etat, action, enCours] = useActionState<EtatProjet, FormData>(mettreAJourProjet, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={projet.id} />

      {etat?.erreur ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <Field label="Titre du projet" name="titre" required defaultValue={projet.title} />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="format" className="mb-2 block text-sm font-medium">
            Format
          </label>
          <select
            id="format"
            name="format"
            defaultValue={projet.format}
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
            defaultValue={projet.stage}
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
          Pitch
        </label>
        <textarea
          id="logline"
          name="logline"
          rows={3}
          maxLength={500}
          defaultValue={projet.logline}
          className="border-navy-line bg-navy focus:border-gold w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
        />
      </div>

      <div>
        <label htmlFor="synopsis" className="mb-2 block text-sm font-medium">
          Synopsis
        </label>
        <textarea
          id="synopsis"
          name="synopsis"
          rows={10}
          maxLength={20000}
          defaultValue={projet.synopsis}
          className="border-navy-line bg-navy focus:border-gold w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
        />
      </div>

      <SubmitButton enCours={enCours}>Enregistrer</SubmitButton>
    </form>
  );
}
