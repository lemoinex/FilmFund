"use client";

import Link from "next/link";
import { useActionState } from "react";

import { Message } from "@/components/ui/form";
import { libelleEpisode } from "@/lib/episodes";

import { rattacherScenario, type EtatRattachement } from "../actions";

const CHAMP =
  "border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-3 py-2.5 text-sm transition-colors outline-none";

export type EpisodeRattachable = { id: string; number: number; title: string };

/**
 * À quel épisode ce scénario est rattaché, et de quoi le changer.
 *
 * Ne se montre que pour un scénario d'une série, à qui peut écrire le
 * document. La liste ne propose que les épisodes sans scénario, et celui du
 * document : la base refuse qu'un épisode en ait deux, l'écran ne l'offre pas.
 * Rattacher ne change ni le texte ni son historique : aucune version n'est
 * créée.
 */
export function RattachementEpisode({
  projetId,
  documentId,
  actuel,
  episodes,
}: {
  projetId: string;
  documentId: string;
  /** Épisode auquel le scénario est rattaché ; null s'il ne l'est à aucun. */
  actuel: EpisodeRattachable | null;
  /** Épisodes proposés : ceux sans scénario, et l'épisode actuel. */
  episodes: EpisodeRattachable[];
}) {
  const [etat, action, enCours] = useActionState<EtatRattachement, FormData>(
    rattacherScenario,
    null,
  );

  return (
    <section
      aria-labelledby="rattachement-episode"
      className="border-app-line mt-10 rounded-xl border p-5"
    >
      <h2 id="rattachement-episode" className="text-sm font-medium">
        Épisode de ce scénario
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
        {actuel ? (
          <>
            Ce scénario est celui de{" "}
            <Link
              href={`/projets/${projetId}/episodes#episode-${actuel.id}`}
              className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
            >
              {libelleEpisode(actuel.number)} : {actuel.title}
            </Link>
            .
          </>
        ) : (
          "Ce scénario n'est rattaché à aucun épisode."
        )}{" "}
        Le rattacher ne change ni son texte ni son historique.
      </p>

      {etat && "erreur" in etat ? (
        <div className="mt-4">
          <Message ton="erreur">{etat.erreur}</Message>
        </div>
      ) : null}
      {etat && "succes" in etat ? (
        <div className="mt-4">
          <Message ton="succes">{etat.succes}</Message>
        </div>
      ) : null}

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="projet" value={projetId} />
        <input type="hidden" name="document" value={documentId} />
        <div className="min-w-0 flex-1 basis-64">
          <label htmlFor="rattachement-choix" className="mb-1.5 block text-xs font-medium">
            Épisode
          </label>
          <select
            id="rattachement-choix"
            name="episode"
            // La liste repart de l'état enregistré après chaque changement.
            key={actuel?.id ?? "aucun"}
            defaultValue={actuel?.id ?? ""}
            className={CHAMP}
          >
            <option value="">Aucun épisode</option>
            {episodes.map((episode) => (
              <option key={episode.id} value={episode.id}>
                {libelleEpisode(episode.number)} : {episode.title}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={enCours}
          className="border-app-line hover:bg-surface-hover rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enCours ? "Un instant…" : "Enregistrer le rattachement"}
        </button>
      </form>
    </section>
  );
}
