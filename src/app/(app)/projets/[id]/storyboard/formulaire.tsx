"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  CADRAGES,
  DECORS,
  DESCRIPTION_SCENE_MAX,
  LIEU_MAX,
  MOMENTS,
  TITRE_SCENE_MAX,
} from "@/lib/storyboard";
import type { SceneSetting, SceneTime, ShotType } from "@/lib/supabase/types";

import { ajouterScene, modifierScene, type EtatScene } from "./actions";

const CLASSES_CHAMP =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type SceneEditable = {
  id: string;
  title: string;
  setting: SceneSetting;
  location: string;
  time_of_day: SceneTime;
  shot: ShotType | null;
  description: string;
};

/**
 * Ajout ou modification d'une scène.
 *
 * Champs non contrôlés et envoi par `action` : à l'ajout, la réinitialisation
 * du formulaire après l'action est voulue — il se vide pour la scène
 * suivante. À la modification, l'action redirige vers le storyboard et le
 * formulaire disparaît : la réinitialisation n'a pas le temps de tromper.
 */
export function FormulaireScene({ projetId, scene }: { projetId: string; scene?: SceneEditable }) {
  const [etat, action, enCours] = useActionState<EtatScene, FormData>(
    scene ? modifierScene : ajouterScene,
    null,
  );

  // Identifiants préfixés : le formulaire d'ajout et celui d'une scène en
  // cours de modification coexistent sur la page.
  const p = scene ? `scene-${scene.id}` : "nouvelle-scene";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {scene ? <input type="hidden" name="scene" value={scene.id} /> : null}

      {etat?.erreur ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <Field
        label="Intitulé"
        name="titre"
        id={`${p}-titre`}
        required
        maxLength={TITRE_SCENE_MAX}
        defaultValue={scene?.title}
        placeholder="Le départ des pêcheurs"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr_auto]">
        <div>
          <label htmlFor={`${p}-decor`} className="mb-2 block text-sm font-medium">
            Décor
          </label>
          <select
            id={`${p}-decor`}
            name="decor"
            defaultValue={scene?.setting ?? "int"}
            className={CLASSES_CHAMP}
          >
            {Object.entries(DECORS).map(([valeur, { abrege, libelle }]) => (
              <option key={valeur} value={valeur}>
                {abrege} — {libelle}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Lieu"
          name="lieu"
          id={`${p}-lieu`}
          maxLength={LIEU_MAX}
          defaultValue={scene?.location}
          placeholder="Berges du Niger"
        />

        <div>
          <label htmlFor={`${p}-moment`} className="mb-2 block text-sm font-medium">
            Moment
          </label>
          <select
            id={`${p}-moment`}
            name="moment"
            defaultValue={scene?.time_of_day ?? "jour"}
            className={CLASSES_CHAMP}
          >
            {Object.entries(MOMENTS).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${p}-cadrage`} className="mb-2 block text-sm font-medium">
          Cadrage <span className="text-secondary font-normal">(facultatif)</span>
        </label>
        <select
          id={`${p}-cadrage`}
          name="cadrage"
          defaultValue={scene?.shot ?? ""}
          className={CLASSES_CHAMP}
        >
          <option value="">Non précisé</option>
          {Object.entries(CADRAGES).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${p}-description`} className="mb-2 block text-sm font-medium">
          Description <span className="text-secondary font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-description`}
          name="description"
          rows={4}
          maxLength={DESCRIPTION_SCENE_MAX}
          defaultValue={scene?.description}
          placeholder="Ce que l'on voit, ce que l'on entend."
          className={`${CLASSES_CHAMP} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {scene ? "Enregistrer la scène" : "Ajouter la scène"}
          </SubmitButton>
        </div>
        {scene ? (
          <Link
            href={`/projets/${projetId}/storyboard#scene-${scene.id}`}
            className="text-secondary hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
