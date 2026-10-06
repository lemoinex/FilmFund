"use client";

import { startTransition, useActionState, type FormEvent } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { GENRES } from "@/lib/fiche";
import {
  AIDES_STATUT,
  CATEGORIES_OPPORTUNITE,
  LONGUEURS_OPPORTUNITE,
  STATUTS_OPPORTUNITE,
  type StatutOpportunite,
} from "@/lib/opportunites";
import { FORMATS } from "@/lib/projets";

import { enregistrerOpportunite, type EtatOpportunite } from "./actions";

/** Une opportunité telle que le formulaire la reprend pour la modifier. */
export type OpportuniteEditable = {
  id: string;
  name: string;
  organization: string;
  category: string;
  description: string;
  website: string | null;
  application_url: string | null;
  countries: string[];
  formats: string[];
  genres: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  opens_on: string | null;
  deadline: string | null;
  requirements: string;
  source_url: string | null;
  collected_on: string | null;
  source_excerpt: string;
  status: string;
};

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

function Zone({
  label,
  name,
  id,
  max,
  aide,
  defaultValue,
}: {
  label: string;
  name: string;
  id: string;
  max: number;
  aide?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
        <span className="text-light-muted font-normal"> (facultatif)</span>
      </label>
      <textarea
        id={id}
        name={name}
        rows={4}
        maxLength={max}
        defaultValue={defaultValue}
        aria-describedby={aide ? `${id}-aide` : undefined}
        className={CHAMP}
      />
      {aide ? (
        <p id={`${id}-aide`} className="text-light-muted mt-2 text-xs leading-relaxed">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

function Cases({
  legende,
  name,
  prefixe,
  choix,
  coches,
}: {
  legende: string;
  name: string;
  prefixe: string;
  choix: Readonly<Record<string, string>>;
  coches: readonly string[];
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">
        {legende}
        <span className="text-light-muted font-normal"> (aucune case : non précisé)</span>
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {Object.entries(choix).map(([code, libelle]) => (
          <label key={code} htmlFor={`${prefixe}-${name}-${code}`} className="text-sm">
            <input
              id={`${prefixe}-${name}-${code}`}
              type="checkbox"
              name={name}
              value={code}
              defaultChecked={coches.includes(code)}
              className="accent-gold mr-2"
            />
            {libelle}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Ajout ou modification d'une opportunité. Le statut se choisit ici, avec ce
 * qu'il engage : « vérifiée » exige la source, la date de collecte et
 * l'extrait — le serveur et la base le revérifient.
 */
export function FormulaireOpportunite({ opportunite }: { opportunite?: OpportuniteEditable }) {
  const [etat, action, enCours] = useActionState<EtatOpportunite, FormData>(
    enregistrerOpportunite,
    null,
  );
  const p = opportunite ? `opportunite-${opportunite.id}` : "opportunite-nouvelle";
  const statut = (opportunite?.status ?? "non_verifie") as StatutOpportunite;

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
    <form onSubmit={envoyer} className="space-y-6">
      {opportunite ? <input type="hidden" name="id" value={opportunite.id} /> : null}
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Nom de l'opportunité"
          name="name"
          id={`${p}-name`}
          required
          maxLength={LONGUEURS_OPPORTUNITE.name}
          defaultValue={opportunite?.name}
        />
        <Field
          label="Organisme"
          name="organization"
          id={`${p}-organization`}
          required
          maxLength={LONGUEURS_OPPORTUNITE.organization}
          defaultValue={opportunite?.organization}
        />
        <div>
          <label htmlFor={`${p}-category`} className="mb-2 block text-sm font-medium">
            Catégorie
          </label>
          <select
            id={`${p}-category`}
            name="category"
            required
            defaultValue={opportunite?.category ?? "fonds"}
            className={CHAMP}
          >
            {Object.entries(CATEGORIES_OPPORTUNITE).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Pays éligibles"
          name="countries"
          id={`${p}-countries`}
          aide="Codes à deux lettres, séparés par des virgules : CM, GA, CG. Vide : non précisé."
          defaultValue={opportunite?.countries.join(", ")}
        />
      </div>

      <Zone
        label="Description"
        name="description"
        id={`${p}-description`}
        max={LONGUEURS_OPPORTUNITE.description}
        defaultValue={opportunite?.description}
      />

      <Cases
        legende="Types de projet"
        name="formats"
        prefixe={p}
        choix={FORMATS}
        coches={opportunite?.formats ?? []}
      />
      <Cases
        legende="Genres"
        name="genres"
        prefixe={p}
        choix={GENRES}
        coches={opportunite?.genres ?? []}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Montant minimal"
          name="budget_min"
          id={`${p}-budget_min`}
          inputMode="numeric"
          defaultValue={opportunite?.budget_min?.toString()}
        />
        <Field
          label="Montant maximal"
          name="budget_max"
          id={`${p}-budget_max`}
          inputMode="numeric"
          defaultValue={opportunite?.budget_max?.toString()}
        />
        <Field
          label="Devise"
          name="currency"
          id={`${p}-currency`}
          maxLength={3}
          aide="Trois lettres : XAF, EUR, USD. Obligatoire avec un montant."
          defaultValue={opportunite?.currency ?? undefined}
        />
        <Field
          label="Ouverture"
          name="opens_on"
          id={`${p}-opens_on`}
          type="date"
          defaultValue={opportunite?.opens_on ?? undefined}
        />
        <Field
          label="Date limite"
          name="deadline"
          id={`${p}-deadline`}
          type="date"
          aide="Passée cette date, l'opportunité se présente comme expirée."
          defaultValue={opportunite?.deadline ?? undefined}
        />
      </div>

      <Zone
        label="Exigences"
        name="requirements"
        id={`${p}-requirements`}
        max={LONGUEURS_OPPORTUNITE.requirements}
        aide="Conditions d'éligibilité et pièces demandées, telles que la source les donne."
        defaultValue={opportunite?.requirements}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Site de l'organisme"
          name="website"
          id={`${p}-website`}
          type="url"
          placeholder="https://"
          defaultValue={opportunite?.website ?? undefined}
        />
        <Field
          label="Page de candidature"
          name="application_url"
          id={`${p}-application_url`}
          type="url"
          placeholder="https://"
          defaultValue={opportunite?.application_url ?? undefined}
        />
      </div>

      <fieldset className="border-navy-line space-y-4 rounded-xl border p-4 sm:p-5">
        <legend className="px-2 text-sm font-medium">Provenance</legend>
        <p className="text-light-muted text-xs leading-relaxed text-pretty">
          D&apos;où vient ce qui précède, et de quand. Sans ces trois champs, une opportunité ne
          peut pas être dite vérifiée.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Adresse de la source"
            name="source_url"
            id={`${p}-source_url`}
            type="url"
            placeholder="https://"
            defaultValue={opportunite?.source_url ?? undefined}
          />
          <Field
            label="Date de collecte"
            name="collected_on"
            id={`${p}-collected_on`}
            type="date"
            aide="Le jour où la source a été lue."
            defaultValue={opportunite?.collected_on ?? undefined}
          />
        </div>
        <Zone
          label="Extrait de la source"
          name="source_excerpt"
          id={`${p}-source_excerpt`}
          max={LONGUEURS_OPPORTUNITE.source_excerpt}
          aide="Le passage qui fonde le montant, la date limite ou les critères, recopié tel quel."
          defaultValue={opportunite?.source_excerpt}
        />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Statut</legend>
        <div className="space-y-2">
          {(Object.keys(STATUTS_OPPORTUNITE) as StatutOpportunite[]).map((code) => (
            <label key={code} htmlFor={`${p}-status-${code}`} className="flex items-start gap-2">
              <input
                id={`${p}-status-${code}`}
                type="radio"
                name="status"
                value={code}
                defaultChecked={statut === code}
                className="accent-gold mt-1"
              />
              <span className="text-sm">
                {STATUTS_OPPORTUNITE[code]}
                <span className="text-light-muted block text-xs leading-relaxed">
                  {AIDES_STATUT[code]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>
          {opportunite ? "Enregistrer l'opportunité" : "Ajouter au catalogue"}
        </SubmitButton>
      </div>
    </form>
  );
}
