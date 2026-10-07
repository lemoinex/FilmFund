"use server";

import { revalidatePath } from "next/cache";

import { MAX_PERSONNAGES, normaliserPersonnage, type SaisiePersonnage } from "@/lib/fiche";
import {
  ERREURS_BASE,
  LIVRABLE_PERSONNAGES,
  messageErreur,
  messageLotPersonnages,
} from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de dramaturgie : propositions de personnages.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des personnages que
 * le worker a déposés. Les droits, les quantités et les bornes sont décidés
 * par la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours la liste de
 * personnages —, ni le profil, ni le modèle, ni le budget de l'appel.
 *
 * Aucune action d'ici ne modifie un personnage existant : accepter en ajoute
 * un, à la fin de la liste.
 */

const ACTION = LIVRABLE_PERSONNAGES.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };
const LISTE_PLEINE: Echec = {
  erreur: `Un projet compte ${MAX_PERSONNAGES} personnages au plus : retirez-en avant d'en accepter d'autres.`,
};

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/assistant/personnages`);
  revalidatePath(`/projets/${projetId}/fiche`);
}

/** Places libres dans la liste du projet, sous la RLS de l'appelant. */
async function placesLibres(supabase: ClientServeur, projetId: string): Promise<number> {
  const { count } = await supabase
    .from("project_characters")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projetId);
  return MAX_PERSONNAGES - (count ?? 0);
}

/**
 * La base dit elle-même qu'une liste est pleine, par deux codes selon le
 * moment : au devis, avant toute dépense, et à l'acceptation.
 */
function messageDe(code: string | undefined, message: string | undefined): string {
  if (code === ERREURS_BASE.listePleine || (code === "55000" && message?.includes("personnages"))) {
    return LISTE_PLEINE.erreur;
  }
  return messageErreur(code);
}

export async function demanderDevisPersonnages(
  projetId: string,
): Promise<{ devis: Devis } | Echec> {
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
export async function lancerPropositionPersonnages(
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

export async function annulerPropositionPersonnages(
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

/** Ce que l'équipe retient d'un personnage en le corrigeant, tel que saisi. */
export type SaisiePersonnagePropose = { nom: string; role: string; description: string };

/**
 * Accepte un personnage : il entre au projet, à la fin de la liste. Sans
 * saisie, tel que proposé ; avec, tel que l'équipe l'a corrigé — les mêmes
 * lectures et les mêmes bornes que le formulaire d'un personnage saisi à la
 * main.
 */
export async function accepterPersonnagePropose(
  projetId: string,
  personnageId: string,
  saisie?: SaisiePersonnagePropose,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(personnageId)) {
    return DEMANDE_INVALIDE;
  }

  let corrige: SaisiePersonnage | null = null;
  if (saisie) {
    const lu = normaliserPersonnage({
      name: saisie.nom,
      role: saisie.role,
      description: saisie.description,
    });
    if ("erreur" in lu) {
      return lu;
    }
    corrige = lu.personnage;
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  if ((await placesLibres(acces.supabase, projetId)) < 1) {
    return LISTE_PLEINE;
  }

  const { error } = await acces.supabase.rpc("accepter_personnage_propose", {
    p_line_id: personnageId,
    ...(corrige ? { p_corrige: corrige } : {}),
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageDe(error.code, error.message) };
  }
  return { ok: true };
}

export async function ecarterPersonnagePropose(
  projetId: string,
  personnageId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(personnageId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_personnage_propose", {
    p_line_id: personnageId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte tous les personnages qui attendent encore, tels que proposés.
 *
 * Pas atomique : chacun est accepté par la base, un à un, et ceux qui sont
 * entrés au projet y restent si un suivant est refusé. L'écran dit alors
 * combien sont passés, plutôt que d'annoncer un échec.
 */
export async function accepterPersonnagesRestants(
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
  const { data: personnages, error: lecture } = await acces.supabase
    .from("ai_suggestion_characters")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position")
    .limit(LIVRABLE_PERSONNAGES.lignesMax);
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!personnages?.length) {
    revalider(projetId);
    return { erreur: "Plus aucun personnage n'attend de décision." };
  }

  if ((await placesLibres(acces.supabase, projetId)) < personnages.length) {
    return LISTE_PLEINE;
  }

  let acceptes = 0;
  for (const personnage of personnages) {
    const { error } = await acces.supabase.rpc("accepter_personnage_propose", {
      p_line_id: personnage.id,
    });
    if (error) {
      break;
    }
    acceptes += 1;
  }

  revalider(projetId);
  const message = messageLotPersonnages(acceptes, personnages.length);
  return acceptes === personnages.length ? { ok: true, message } : { erreur: message };
}

/** Écarte tous les personnages qui attendent encore : aucun de plus n'entre au projet. */
export async function ecarterPersonnagesRestants(
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
