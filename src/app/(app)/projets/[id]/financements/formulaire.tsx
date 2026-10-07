"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";
import { DEVISES, montantPourSaisie } from "@/lib/budgets";
import {
  NOTES_FINANCEMENT_MAX,
  ORGANISME_MAX,
  PROGRAMME_MAX,
  STATUTS_FINANCEMENT,
  TYPES_FINANCEMENT,
  type CandidaturePreremplie,
} from "@/lib/financements";
import type { FundingKind, FundingStatus } from "@/lib/supabase/types";

import { ajouterCandidature, modifierCandidature, type EtatCandidature } from "./actions";

const CLASSES_CHAMP =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none [color-scheme:dark]";

export type CandidatureEditable = {
  id: string;
  funder: string;
  program: string;
  kind: FundingKind;
  status: FundingStatus;
  currency: string;
  amount_requested: number | null;
  amount_granted: number | null;
  deadline: string | null;
  notes: string;
};

/**
 * Ajout ou modification d'une candidature.
 *
 * Le statut, le montant accordé et les pièces du dossier ne se renseignent
 * qu'à la modification : à la création, une candidature est « à préparer »
 * et rien ne lui a encore été accordé.
 *
 * `prerempli` : valeurs reprises d'une opportunité du catalogue. Elles ne
 * font que remplir les champs ; rien n'est enregistré avant l'envoi.
 */
export function FormulaireCandidature({
  projetId,
  deviseParDefaut,
  candidature,
  prerempli,
  documents = [],
  pieces = [],
}: {
  projetId: string;
  deviseParDefaut?: string;
  candidature?: CandidatureEditable;
  prerempli?: CandidaturePreremplie;
  documents?: { id: string; title: string }[];
  pieces?: string[];
}) {
  const [etat, action, enCours] = useActionState<EtatCandidature, FormData>(
    candidature ? modifierCandidature : ajouterCandidature,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  const p = candidature ? `candidature-${candidature.id}` : "nouvelle-candidature";
  const devise = candidature?.currency ?? prerempli?.currency ?? deviseParDefaut ?? "";
  // Une opportunité sans équivalent exact laisse le type à choisir : le
  // formulaire ne propose alors aucune valeur par défaut.
  const typeAChoisir = !candidature && prerempli !== undefined && prerempli.kind === null;

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {candidature ? <input type="hidden" name="candidature" value={candidature.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Organisme"
          name="organisme"
          id={`${p}-organisme`}
          required
          maxLength={ORGANISME_MAX}
          defaultValue={candidature?.funder ?? prerempli?.funder}
          placeholder="Fonds, chaîne, coproducteur…"
        />
        <Field
          label="Programme"
          name="programme"
          id={`${p}-programme`}
          maxLength={PROGRAMME_MAX}
          defaultValue={candidature?.program ?? prerempli?.program}
          placeholder="Aide à l'écriture, au développement…"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor={`${p}-type`} className="mb-2 block text-sm font-medium">
            Type
          </label>
          <select
            id={`${p}-type`}
            name="type"
            required={typeAChoisir}
            defaultValue={
              candidature?.kind ?? (typeAChoisir ? "" : (prerempli?.kind ?? "aide_publique"))
            }
            className={CLASSES_CHAMP}
          >
            {typeAChoisir ? (
              <option value="" disabled>
                Choisissez
              </option>
            ) : null}
            {Object.entries(TYPES_FINANCEMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${p}-devise`} className="mb-2 block text-sm font-medium">
            Devise
          </label>
          <select
            id={`${p}-devise`}
            name="devise"
            required
            defaultValue={devise}
            className={CLASSES_CHAMP}
          >
            {devise ? null : (
              <option value="" disabled>
                Choisissez
              </option>
            )}
            {Object.entries(DEVISES).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${p}-date_limite`} className="mb-2 block text-sm font-medium">
            Date limite <span className="text-secondary font-normal">(facultatif)</span>
          </label>
          <input
            id={`${p}-date_limite`}
            name="date_limite"
            type="date"
            defaultValue={candidature?.deadline ?? prerempli?.deadline ?? ""}
            className={CLASSES_CHAMP}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Montant demandé"
          name="montant"
          id={`${p}-montant`}
          inputMode="decimal"
          defaultValue={candidature ? montantPourSaisie(candidature.amount_requested) : undefined}
          placeholder="5 000 000"
        />
        {candidature ? (
          <Field
            label="Montant accordé"
            name="montant_accorde"
            id={`${p}-montant_accorde`}
            inputMode="decimal"
            defaultValue={montantPourSaisie(candidature.amount_granted)}
            aide="À renseigner une fois la réponse connue."
          />
        ) : null}
      </div>

      {candidature ? (
        <div>
          <label htmlFor={`${p}-statut`} className="mb-2 block text-sm font-medium">
            Statut
          </label>
          <select
            id={`${p}-statut`}
            name="statut"
            defaultValue={candidature.status}
            className={`${CLASSES_CHAMP} sm:max-w-xs`}
          >
            {Object.entries(STATUTS_FINANCEMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {candidature ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Pièces du dossier</legend>
          {documents.length ? (
            <ul className="border-app-line space-y-1 rounded-lg border p-3">
              {documents.map((document) => (
                <li key={document.id}>
                  <label className="hover:bg-surface-hover flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      name="pieces"
                      value={document.id}
                      defaultChecked={pieces.includes(document.id)}
                      className="accent-gold size-4"
                    />
                    {document.title}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-secondary text-sm">
              Aucun document dans ce projet. Rédigez-les dans l&apos;onglet Documents, puis
              rattachez-les ici.
            </p>
          )}
        </fieldset>
      ) : null}

      <div>
        <label htmlFor={`${p}-notes`} className="mb-2 block text-sm font-medium">
          Notes <span className="text-secondary font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-notes`}
          name="notes"
          rows={3}
          maxLength={NOTES_FINANCEMENT_MAX}
          defaultValue={candidature?.notes ?? prerempli?.notes}
          className={`${CLASSES_CHAMP} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {candidature ? "Enregistrer la candidature" : "Ajouter la candidature"}
          </SubmitButton>
        </div>
        {candidature ? (
          <Link
            href={`/projets/${projetId}/financements#candidature-${candidature.id}`}
            className="text-secondary hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
