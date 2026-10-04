/**
 * Lecture serveur des propositions de l'assistant : la dernière tâche de
 * chaque livrable sur un projet, et la proposition qui en est née.
 *
 * Séparé de `propositions.ts`, qui reste pur — sans alias ni pile Supabase —
 * pour que les tests Node le chargent tel quel.
 *
 * Une requête par livrable, bornée à une ligne : les pages n'en demandent
 * jamais plus de deux, et chercher « la dernière par action » en une seule
 * requête coûterait soit une lecture non bornée, soit une vue de plus.
 */
import { etapeProposition, type ActionIa, type EtapeProposition } from "@/lib/propositions";
import type { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const REPOS: EtapeProposition = { etape: "repos" };

/**
 * Étape de chaque livrable demandé. Toutes au repos si l'appelant n'a pas le
 * droit d'engager les unités du studio : la base le refuserait de toute
 * façon, et l'écran n'a pas à montrer une demande en cours à un lecteur.
 */
export async function lireEtapes(
  client: Client,
  projetId: string,
  actions: readonly ActionIa[],
  peutDemander: boolean,
): Promise<Map<ActionIa, EtapeProposition>> {
  const etapes = new Map<ActionIa, EtapeProposition>(actions.map((action) => [action, REPOS]));
  if (!peutDemander) {
    return etapes;
  }

  const taches = await Promise.all(
    actions.map(async (action) => {
      const { data } = await client
        .from("jobs")
        .select("id, state")
        .eq("project_id", projetId)
        .eq("action", action)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { action, tache: data };
    }),
  );

  const identifiants = taches.flatMap(({ tache }) => (tache ? [tache.id] : []));
  const { data: propositions } = identifiants.length
    ? await client
        .from("ai_suggestions")
        .select("id, job_id, content, state")
        .in("job_id", identifiants)
    : { data: null };

  for (const { action, tache } of taches) {
    const proposition = propositions?.find((p) => p.job_id === tache?.id) ?? null;
    etapes.set(action, etapeProposition(tache, proposition));
  }
  return etapes;
}

/** Vrai si l'une des étapes attend encore : la page se rafraîchit alors d'elle-même. */
export function attenteEnCours(etapes: Iterable<EtapeProposition>): boolean {
  for (const etape of etapes) {
    if (etape.etape === "en_attente" || etape.etape === "en_cours") {
      return true;
    }
  }
  return false;
}
