import {
  ACTIONS_ASSISTANT,
  ceQuiAttend,
  dernieresParCible,
  TACHES_LUES_MAX,
  type Attente,
  type TacheLue,
} from "@/lib/assistant-ia";
import type { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

export type LectureAttentes = {
  attentes: Attente[];
  /** La lecture des tâches a atteint sa borne : la liste peut être incomplète. */
  borneAtteinte: boolean;
};

const uniques = (valeurs: (string | null)[]): string[] => [
  ...new Set(valeurs.filter((valeur): valeur is string => valeur !== null)),
];

/**
 * Ce qui attend sur un projet, lu sous la RLS de l'appelant.
 *
 * Des tâches, la page ne lit que l'action, l'état, la date et la cible — la
 * scène, le document ou l'épisode : jamais le reste des paramètres, qui porte
 * ce que l'équipe a écrit. Des propositions, elle ne lit que l'existence :
 * jamais leur contenu. Les cibles ne sont relues que si une tâche en désigne.
 */
export async function chargerAttentes(
  supabase: ClientServeur,
  projetId: string,
  contexte: { peutDemander: boolean; budget: boolean },
): Promise<LectureAttentes> {
  const { data } = await supabase
    .from("jobs")
    .select(
      "id, action, state, created_at, scene:params->>scene, document:params->>document, episode:params->>episode",
    )
    .eq("project_id", projetId)
    .in("action", ACTIONS_ASSISTANT)
    .order("created_at", { ascending: false })
    .limit(TACHES_LUES_MAX);

  const taches = (data ?? []) as TacheLue[];
  const dernieres = dernieresParCible(taches);
  const reussies = dernieres.filter((tache) => tache.state === "succeeded");

  const scenes = uniques(dernieres.map((tache) => tache.scene));
  const documents = uniques(dernieres.map((tache) => tache.document));
  const episodes = uniques(
    dernieres.map((tache) => (tache.action === "screenplay" ? tache.episode : null)),
  );

  const [
    { data: propositions },
    { data: scenesLues },
    { data: documentsLus },
    { data: scenariosLus },
  ] = await Promise.all([
    reussies.length
      ? supabase
          .from("ai_suggestions")
          .select("job_id")
          .eq("project_id", projetId)
          .eq("state", "proposed")
          .in(
            "job_id",
            reussies.map((tache) => tache.id),
          )
      : { data: [] },
    scenes.length
      ? supabase
          .from("storyboard_scenes")
          .select("id, title")
          .eq("project_id", projetId)
          .in("id", scenes)
      : { data: [] },
    documents.length
      ? supabase
          .from("project_documents")
          .select("id, title")
          .eq("project_id", projetId)
          .in("id", documents)
      : { data: [] },
    episodes.length
      ? supabase
          .from("project_documents")
          .select("id, title, episode_id")
          .eq("project_id", projetId)
          .eq("type", "scenario")
          .in("episode_id", episodes)
      : { data: [] },
  ]);

  const attentes = ceQuiAttend(
    taches,
    new Set((propositions ?? []).map((proposition) => proposition.job_id)),
    {
      scenes: new Map((scenesLues ?? []).map((scene) => [scene.id, scene.title])),
      documents: new Map((documentsLus ?? []).map((document) => [document.id, document.title])),
      scenarios: new Map(
        (scenariosLus ?? []).flatMap((document) =>
          document.episode_id
            ? [[document.episode_id, { id: document.id, titre: document.title }] as const]
            : [],
        ),
      ),
    },
    contexte,
  );

  return { attentes, borneAtteinte: taches.length >= TACHES_LUES_MAX };
}
