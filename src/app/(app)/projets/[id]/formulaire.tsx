"use client";

import { useActionState, useState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { ETAPES, FORMATS } from "@/lib/projets";
import type { ProjectFormat, ProjectStage } from "@/lib/supabase/types";
import { mettreAJourProjet, supprimerProjet, type EtatProjet } from "../actions";

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
  const [confirmation, setConfirmation] = useState(false);

  return (
    <div className="space-y-12">
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

      <section className="border-navy-line rounded-xl border border-dashed p-5">
        <h2 className="text-sm font-medium">Supprimer ce projet</h2>
        <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
          La suppression est définitive et emporte tout le contenu du projet.
        </p>

        {confirmation ? (
          <form action={supprimerProjet} className="mt-4 flex flex-wrap gap-3">
            <input type="hidden" name="id" value={projet.id} />
            <button
              type="submit"
              className="rounded-full bg-red-500/90 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              onClick={() => setConfirmation(false)}
              className="border-navy-line hover:bg-navy-soft rounded-full border px-5 py-2.5 text-sm transition-colors"
            >
              Annuler
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmation(true)}
            className="mt-4 rounded-full border border-red-400/40 px-5 py-2.5 text-sm text-red-200 transition-colors hover:bg-red-400/10"
          >
            Supprimer le projet
          </button>
        )}
      </section>
    </div>
  );
}
