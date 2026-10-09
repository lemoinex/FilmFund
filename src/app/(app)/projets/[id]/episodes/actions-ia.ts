"use server";

import { revalidatePath } from "next/cache";

import { ERREURS_EPISODE, messageEpisode, normaliserEpisode, NUMERO_EPISODE } from "@/lib/episodes";
import {
  ERREURS_BASE,
  LIVRABLE_EPISODES,
  messageErreur,
  messageLotEpisodes,
} from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant d'écriture : propositions d'épisodes pour une série.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des épisodes que le
 * worker a déposés. Les droits, les quantités et les bornes sont décidés par
 * la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours la liste
 * d'épisodes —, ni le profil, ni le modèle, ni le budget de l'appel, ni le
 * numéro d'un épisode accepté : la base lui donne celui qui suit le plus grand.
 *
 * Aucune action d'ici ne modifie un épisode existant : accepter en ajoute un.
 */

const ACTION = LIVRABLE_EPISODES.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };
const SAISON_PLEINE: Echec = {
  erreur: `Le dernier numéro d'épisode admis est ${NUMERO_EPISODE.max} : cette saison n'en reçoit plus.`,
};

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/episodes`);
  revalidatePath(`/projets/${projetId}/fiche`);
}

/** Numéros encore libres après le plus grand de la saison, sous la RLS de l'appelant. */
async function numerosLibres(supabase: ClientServeur, projetId: string): Promise<number> {
  const { data } = await supabase
    .from("project_episodes")
    .select("number")
    .eq("project_id", projetId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return NUMERO_EPISODE.max - (data?.number ?? 0);
}

/**
 * La base dit elle-même ce qu'elle refuse : un projet qui n'est pas une
 * série, au devis comme à l'acceptation, et une saison arrivée à son dernier
 * numéro. Son message n'est jamais rendu tel quel.
 */
function messageDe(code: string | undefined, message: string | undefined): string {
  if (code === ERREURS_BASE.listePleine || (code === "55000" && message?.includes("numéro"))) {
    return SAISON_PLEINE.erreur;
  }
  if (code === ERREURS_EPISODE.horsSerie || (code === "55000" && message?.includes("série"))) {
    return messageEpisode(ERREURS_EPISODE.horsSerie);
  }
  return messageErreur(code);
}

export async function demanderDevisEpisodes(projetId: string): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: ACTION,
    p_params: {},
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageDe(error?.code, error?.message) };
  }

  return {
    devis: {
      id: devis.quote_id,
      quantite: devis.quantity,
      disponible: devis.available,
      allocation: devis.allowance,
    },
  };
}

/**
 * Accepte le devis : les unités sont réservées et la tâche naît. La clé vient
 * du navigateur, qui la garde le temps de la demande : un double envoi
 * renvoie la même réservation au lieu d'en créer une seconde.
 */
export async function lancerPropositionEpisodes(
  projetId: string,
  devisId: string,
  cle: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(devisId) || !UUID.test(cle)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_devis", {
    p_quote_id: devisId,
    p_idempotency_key: cle,
  });
  if (error) {
    return { erreur: messageErreur(error.code) };
  }

  revalider(projetId);
  return { ok: true };
}

export async function annulerPropositionEpisodes(
  projetId: string,
  tacheId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(tacheId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("annuler_travail", { p_job_id: tacheId });
  // La page est rafraîchie même en cas de refus : la tâche a pu être prise
  // entre-temps, et l'écran doit le montrer.
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/** Ce que l'équipe retient d'un épisode en le corrigeant, tel que saisi. */
export type SaisieEpisodePropose = { titre: string; resume: string };

/**
 * Accepte un épisode : il entre dans la saison, sous le numéro qui suit le
 * plus grand. Sans saisie, tel que proposé ; avec, tel que l'équipe l'a
 * corrigé — les mêmes lectures et les mêmes bornes que le formulaire d'un
 * épisode saisi à la main.
 */
export async function accepterEpisodePropose(
  projetId: string,
  episodeId: string,
  saisie?: SaisieEpisodePropose,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(episodeId)) {
    return DEMANDE_INVALIDE;
  }

  let corrige: { title: string; summary: string } | null = null;
  if (saisie) {
    // Le numéro n'est pas saisi : la base le donne. Celui-ci ne sert qu'à
    // passer la lecture commune, et ne part nulle part.
    const lu = normaliserEpisode({
      number: String(NUMERO_EPISODE.min),
      title: saisie.titre,
      summary: saisie.resume,
      duration_minutes: "",
    });
    if ("erreur" in lu) {
      return lu;
    }
    corrige = { title: lu.episode.title, summary: lu.episode.summary };
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  if ((await numerosLibres(acces.supabase, projetId)) < 1) {
    return SAISON_PLEINE;
  }

  const { error } = await acces.supabase.rpc("accepter_episode_propose", {
    p_line_id: episodeId,
    ...(corrige ? { p_corrige: corrige } : {}),
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageDe(error.code, error.message) };
  }
  return { ok: true };
}

export async function ecarterEpisodePropose(
  projetId: string,
  episodeId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(episodeId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_episode_propose", {
    p_line_id: episodeId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte tous les épisodes qui attendent encore, tels que proposés, dans
 * l'ordre où l'assistant les a rendus : c'est l'ordre de leurs numéros.
 *
 * Pas atomique : chacun est accepté par la base, un à un, et ceux qui sont
 * entrés dans la saison y restent si un suivant est refusé. L'écran dit alors
 * combien sont passés, plutôt que d'annoncer un échec.
 */
export async function accepterEpisodesRestants(
  projetId: string,
  propositionId: string,
): Promise<{ ok: true; message: string } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  // Lus sous la RLS de l'appelant : il n'accepte que ce qu'il a le droit de lire.
  const { data: episodes, error: lecture } = await acces.supabase
    .from("ai_suggestion_episodes")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position")
    .limit(LIVRABLE_EPISODES.lignesMax);
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!episodes?.length) {
    revalider(projetId);
    return { erreur: "Plus aucun épisode n'attend de décision." };
  }

  if ((await numerosLibres(acces.supabase, projetId)) < episodes.length) {
    return SAISON_PLEINE;
  }

  let acceptes = 0;
  for (const episode of episodes) {
    const { error } = await acces.supabase.rpc("accepter_episode_propose", {
      p_line_id: episode.id,
    });
    if (error) {
      break;
    }
    acceptes += 1;
  }

  revalider(projetId);
  const message = messageLotEpisodes(acceptes, episodes.length);
  return acceptes === episodes.length ? { ok: true, message } : { erreur: message };
}

/** Écarte tous les épisodes qui attendent encore : aucun de plus n'entre dans la saison. */
export async function ecarterEpisodesRestants(
  projetId: string,
  propositionId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_proposition", {
    p_suggestion_id: propositionId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}
