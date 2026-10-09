"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { DUREE_EPISODE, LONGUEURS_EPISODE, NUMERO_EPISODE } from "@/lib/episodes";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import { ajouterEpisode, modifierEpisode, type EtatEpisode } from "./actions";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type EpisodeEditable = {
  id: string;
  number: number;
  title: string;
  summary: string;
  duration_minutes: number | null;
};

/**
 * Ajout ou modification d'un épisode.
 *
 * Envoi par `action` : à l'ajout, la réinitialisation du formulaire après
 * l'action est voulue — il se vide pour l'épisode suivant, et la page le
 * rend avec le numéro d'après. À la modification, l'action redirige vers la
 * liste et le formulaire disparaît.
 */
export function FormulaireEpisode({
  projetId,
  episode,
  numeroPropose,
}: {
  projetId: string;
  episode?: EpisodeEditable;
  /** Numéro proposé à l'ajout ; null si la saison est allée jusqu'à la borne. */
  numeroPropose?: number | null;
}) {
  const [etat, action, enCours] = useActionState<EtatEpisode, FormData>(
    episode ? modifierEpisode : ajouterEpisode,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  // Identifiants préfixés : le formulaire d'ajout et celui d'un épisode en
  // cours de modification coexistent sur la page.
  const p = episode ? `episode-${episode.id}` : "nouvel-episode";

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {episode ? <input type="hidden" name="episode" value={episode.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[8rem_1fr]">
        <Field
          label="Numéro"
          name="number"
          id={`${p}-numero`}
          required
          inputMode="numeric"
          maxLength={String(NUMERO_EPISODE.max).length}
          defaultValue={(episode?.number ?? numeroPropose)?.toString()}
        />
        <Field
          label="Titre"
          name="title"
          id={`${p}-titre`}
          required
          maxLength={LONGUEURS_EPISODE.title}
          defaultValue={episode?.title}
        />
      </div>

      <div>
        <label htmlFor={`${p}-resume`} className="mb-2 block text-sm font-medium">
          Résumé <span className="text-light-muted font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-resume`}
          name="summary"
          rows={4}
          maxLength={LONGUEURS_EPISODE.summary}
          defaultValue={episode?.summary}
          placeholder="Ce qui se passe dans l'épisode, et où il laisse le récit."
          aria-describedby={`${p}-resume-aide`}
          className={`${CHAMP} resize-y leading-relaxed`}
        />
        <p id={`${p}-resume-aide`} className="text-light-muted mt-2 text-xs">
          {LONGUEURS_EPISODE.summary} caractères maximum.
        </p>
      </div>

      <div className="sm:max-w-56">
        <Field
          label="Durée"
          name="duration_minutes"
          id={`${p}-duree`}
          inputMode="numeric"
          maxLength={String(DUREE_EPISODE.max).length}
          aide={`En minutes, de ${DUREE_EPISODE.min} à ${DUREE_EPISODE.max}. Facultatif.`}
          defaultValue={episode?.duration_minutes?.toString()}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {episode ? "Enregistrer l'épisode" : "Ajouter l'épisode"}
          </SubmitButton>
        </div>
        {episode ? (
          <Link
            href={`/projets/${projetId}/episodes#episode-${episode.id}`}
            className="text-light-muted hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
