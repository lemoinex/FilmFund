import {
  etapeProposition,
  LIVRABLE_FICHE_PERSONNAGE,
  type ChampFichePropose,
  type EtapeProposition,
} from "@/lib/propositions";
import type { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

/** Où en est la fiche demandée pour un personnage, et ses champs à décider. */
export type FicheVue = { etape: EtapeProposition; champs: ChampFichePropose[] };

/** Demandes de fiche lues pour un projet, des plus récentes aux plus anciennes. */
const DEMANDES_LUES_MAX = 100;

/**
 * La dernière demande de fiche de chaque personnage, et les champs de sa
 * proposition s'ils attendent encore une décision.
 *
 * Trois lectures bornées, sous la RLS de l'appelant. Des tâches, seuls
 * l'état et le personnage désigné sont lus — jamais le reste des paramètres.
 */
export async function lireFiches(
  supabase: ClientServeur,
  projetId: string,
): Promise<Map<string, FicheVue>> {
  const { data: taches } = await supabase
    .from("jobs")
    .select("id, state, personnage:params->>character")
    .eq("project_id", projetId)
    .eq("action", LIVRABLE_FICHE_PERSONNAGE.action)
    .order("created_at", { ascending: false })
    .limit(DEMANDES_LUES_MAX);

  // La plus récente d'abord : la première vue pour un personnage est la sienne.
  const dernieres = new Map<string, { id: string; state: string }>();
  for (const tache of taches ?? []) {
    if (typeof tache.personnage === "string" && !dernieres.has(tache.personnage)) {
      dernieres.set(tache.personnage, { id: tache.id, state: tache.state });
    }
  }
  if (!dernieres.size) {
    return new Map();
  }

  const { data: propositions } = await supabase
    .from("ai_suggestions")
    .select("id, job_id, content, state")
    .eq("project_id", projetId)
    .in(
      "job_id",
      [...dernieres.values()].map((tache) => tache.id),
    );
  const parTache = new Map(
    (propositions ?? []).map((proposition) => [proposition.job_id, proposition]),
  );

  const ouvertes = (propositions ?? []).filter((proposition) => proposition.state === "proposed");
  const { data: champs } = ouvertes.length
    ? await supabase
        .from("ai_suggestion_character_fields")
        .select("id, suggestion_id, position, field, value, state, character_id")
        .in(
          "suggestion_id",
          ouvertes.map((proposition) => proposition.id),
        )
        .order("position")
        // Bornée comme la base borne le dépôt : huit champs par proposition.
        .limit(ouvertes.length * LIVRABLE_FICHE_PERSONNAGE.lignesMax)
    : { data: [] };

  const fiches = new Map<string, FicheVue>();
  for (const [personnageId, tache] of dernieres) {
    const proposition = parTache.get(tache.id) ?? null;
    fiches.set(personnageId, {
      etape: etapeProposition(tache, proposition),
      champs: (champs ?? []).filter((champ) => champ.suggestion_id === proposition?.id),
    });
  }
  return fiches;
}
