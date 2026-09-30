"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";
import { NOTES_ETAPE_MAX, PHASES, STATUTS_ETAPE, TITRE_ETAPE_MAX } from "@/lib/planning";
import { ETAPES } from "@/lib/projets";
import type { MilestoneStatus, ProjectStage } from "@/lib/supabase/types";

import { ajouterEtape, modifierEtape, type EtatEtape } from "./actions";

const CLASSES_CHAMP =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none [color-scheme:dark]";

export type EtapeEditable = {
  id: string;
  title: string;
  phase: ProjectStage;
  starts_on: string | null;
  due_on: string | null;
  status: MilestoneStatus;
  notes: string;
};

/**
 * Ajout ou modification d'une étape.
 *
 * Envoi par `action` : à l'ajout, la réinitialisation qui suit l'action vide
 * le formulaire pour l'étape suivante ; à la modification, l'action redirige
 * et le formulaire disparaît.
 */
export function FormulaireEtape({
  projetId,
  etape,
  phaseParDefaut = "developpement",
}: {
  projetId: string;
  etape?: EtapeEditable;
  phaseParDefaut?: ProjectStage;
}) {
  const [etat, action, enCours] = useActionState<EtatEtape, FormData>(
    etape ? modifierEtape : ajouterEtape,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  const p = etape ? `etape-${etape.id}` : "nouvelle-etape";

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {etape ? <input type="hidden" name="etape" value={etape.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <Field
        label="Intitulé"
        name="titre"
        id={`${p}-titre`}
        required
        maxLength={TITRE_ETAPE_MAX}
        defaultValue={etape?.title}
        placeholder="Dépôt du dossier au fonds d'aide"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor={`${p}-phase`} className="mb-2 block text-sm font-medium">
            Phase
          </label>
          <select
            id={`${p}-phase`}
            name="phase"
            defaultValue={etape?.phase ?? phaseParDefaut}
            className={CLASSES_CHAMP}
          >
            {PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {ETAPES[phase]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${p}-debut`} className="mb-2 block text-sm font-medium">
            Début <span className="text-secondary font-normal">(facultatif)</span>
          </label>
          <input
            id={`${p}-debut`}
            name="debut"
            type="date"
            defaultValue={etape?.starts_on ?? ""}
            className={CLASSES_CHAMP}
          />
        </div>

        <div>
          <label htmlFor={`${p}-echeance`} className="mb-2 block text-sm font-medium">
            Échéance <span className="text-secondary font-normal">(facultatif)</span>
          </label>
          <input
            id={`${p}-echeance`}
            name="echeance"
            type="date"
            defaultValue={etape?.due_on ?? ""}
            className={CLASSES_CHAMP}
          />
        </div>
      </div>

      {etape ? (
        <div>
          <label htmlFor={`${p}-statut`} className="mb-2 block text-sm font-medium">
            Statut
          </label>
          <select
            id={`${p}-statut`}
            name="statut"
            defaultValue={etape.status}
            className={`${CLASSES_CHAMP} sm:max-w-xs`}
          >
            {Object.entries(STATUTS_ETAPE).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor={`${p}-notes`} className="mb-2 block text-sm font-medium">
          Notes <span className="text-secondary font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-notes`}
          name="notes"
          rows={3}
          maxLength={NOTES_ETAPE_MAX}
          defaultValue={etape?.notes}
          className={`${CLASSES_CHAMP} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {etape ? "Enregistrer l'étape" : "Ajouter l'étape"}
          </SubmitButton>
        </div>
        {etape ? (
          <Link
            href={`/projets/${projetId}/planning#etape-${etape.id}`}
            className="text-secondary hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
