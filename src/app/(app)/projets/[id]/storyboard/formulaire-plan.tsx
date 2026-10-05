"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  ANGLES,
  DESCRIPTION_PLAN_MAX,
  DUREE_PLAN_SECONDES,
  FOCALE_MM,
  MOUVEMENTS,
} from "@/lib/decoupage";
import { CADRAGES } from "@/lib/storyboard";
import type { ShotAngle, ShotMovement, ShotType } from "@/lib/supabase/types";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import { ajouterPlan, modifierPlan, type EtatPlan } from "./actions";

const CLASSES_CHAMP =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type PlanEditable = {
  id: string;
  shot: ShotType;
  focal_mm: number | null;
  angle: ShotAngle;
  movement: ShotMovement;
  description: string;
  duration_seconds: number | null;
};

/**
 * Ajout ou modification d'un plan dans une scène.
 *
 * Envoi par `action`, comme pour les scènes : à l'ajout, le formulaire se
 * vide pour le plan suivant ; à la modification, l'action redirige.
 */
export function FormulairePlan({
  projetId,
  sceneId,
  plan,
  cadrageParDefaut,
}: {
  projetId: string;
  sceneId: string;
  plan?: PlanEditable;
  /** Cadrage principal de la scène, proposé pour son premier plan. */
  cadrageParDefaut?: ShotType | null;
}) {
  const [etat, action, enCours] = useActionState<EtatPlan, FormData>(
    plan ? modifierPlan : ajouterPlan,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  // Identifiants préfixés : chaque scène de la page porte son formulaire.
  const p = plan ? `plan-${plan.id}` : `nouveau-plan-${sceneId}`;

  return (
    <form ref={formulaire} action={action} className="space-y-4">
      <input type="hidden" name="projet" value={projetId} />
      <input type="hidden" name="scene" value={sceneId} />
      {plan ? <input type="hidden" name="plan" value={plan.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div>
        <label htmlFor={`${p}-cadrage`} className="mb-2 block text-sm font-medium">
          Cadrage
        </label>
        <select
          id={`${p}-cadrage`}
          name="cadrage"
          required
          defaultValue={plan?.shot ?? cadrageParDefaut ?? ""}
          className={CLASSES_CHAMP}
        >
          <option value="" disabled>
            Choisir
          </option>
          {Object.entries(CADRAGES).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${p}-angle`} className="mb-2 block text-sm font-medium">
            Angle
          </label>
          <select
            id={`${p}-angle`}
            name="angle"
            defaultValue={plan?.angle ?? "normal"}
            className={CLASSES_CHAMP}
          >
            {Object.entries(ANGLES).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${p}-mouvement`} className="mb-2 block text-sm font-medium">
            Mouvement
          </label>
          <select
            id={`${p}-mouvement`}
            name="mouvement"
            defaultValue={plan?.movement ?? "fixe"}
            className={CLASSES_CHAMP}
          >
            {Object.entries(MOUVEMENTS).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Focale, en mm"
          name="focale"
          id={`${p}-focale`}
          inputMode="numeric"
          maxLength={String(FOCALE_MM.max).length}
          defaultValue={plan?.focal_mm?.toString()}
          placeholder="35"
        />
        <Field
          label="Durée, en s"
          name="duree"
          id={`${p}-duree`}
          inputMode="numeric"
          maxLength={String(DUREE_PLAN_SECONDES.max).length}
          defaultValue={plan?.duration_seconds?.toString()}
          placeholder="8"
        />
      </div>

      <div>
        <label htmlFor={`${p}-description`} className="mb-2 block text-sm font-medium">
          Ce que montre le plan <span className="text-secondary font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-description`}
          name="description"
          rows={2}
          maxLength={DESCRIPTION_PLAN_MAX}
          defaultValue={plan?.description}
          className={`${CLASSES_CHAMP} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-44">
          <SubmitButton enCours={enCours}>
            {plan ? "Enregistrer le plan" : "Ajouter le plan"}
          </SubmitButton>
        </div>
        {plan ? (
          <Link
            href={`/projets/${projetId}/storyboard?decoupage=${sceneId}#scene-${sceneId}`}
            className="text-secondary hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
