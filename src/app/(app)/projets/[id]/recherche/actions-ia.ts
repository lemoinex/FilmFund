"use server";

import { revalidatePath } from "next/cache";

import {
  estActionRecherche,
  LIVRABLE_RECHERCHE,
  lireQuestion,
  messageErreur,
} from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Recherche documentaire : la question, puis les sources.
 *
 * Aucune de ces actions n'appelle un moteur de recherche ni un fournisseur
 * d'IA : elles demandent un devis, réservent des unités, puis retiennent ou
 * écartent des sources que le worker a déposées. Les droits, le quota et les
 * bornes sont décidés par la base ; rien de ce que le navigateur envoie n'est
 * cru sur parole.
 *
 * Le navigateur ne choisit ni le moteur, ni le modèle, ni le nombre de pages,
 * ni les sites consultés : il pose une question, que la base contrôle de
 * nouveau, et dit laquelle des deux recherches il veut — une valeur prise
 * dans une liste fermée, que cette action revérifie.
 *
 * Une source se retient telle que collectée : aucune action ne la corrige ni
 * ne change son statut. Vérifier une source n'est pas ouvert.
 */

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/recherche`);
}

export async function demanderDevisRecherche(
  projetId: string,
  saisie: string,
  mode: string,
): Promise<{ devis: Devis; question: string } | Echec> {
  if (!UUID.test(projetId) || !estActionRecherche(mode)) {
    return DEMANDE_INVALIDE;
  }
  const question = lireQuestion(saisie);
  if (question === null) {
    return {
      erreur: `Posez votre question sur une ligne, en ${LIVRABLE_RECHERCHE.questionMin} à ${LIVRABLE_RECHERCHE.questionMax} caractères.`,
    };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: mode,
    p_params: { question },
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageErreur(error?.code) };
  }

  return {
    // La question telle qu'elle partira : l'écran la remontre avant la confirmation.
    question,
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
export async function lancerRecherche(
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

export async function annulerRecherche(
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

/** Retient une source : elle entre au projet telle que collectée, « non vérifiée ». */
export async function retenirSource(
  projetId: string,
  sourceId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(sourceId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_source_proposee", {
    p_line_id: sourceId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/** Écarte une source : rien n'entre au projet. */
export async function ecarterSource(
  projetId: string,
  sourceId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(sourceId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_source_proposee", {
    p_line_id: sourceId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/** Écarte toutes les sources qui attendent encore : rien de plus n'entre au projet. */
export async function ecarterSourcesRestantes(
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
