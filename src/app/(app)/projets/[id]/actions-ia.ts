"use server";

import { revalidatePath } from "next/cache";

import { messageErreur, PITCH_MAX } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Assistant d'écriture : demandes de pitch.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités et appliquent ou écartent une proposition.
 * L'appel lui-même est fait par le worker. Les quantités, les droits et les
 * limites sont décidés par la base ; rien de ce que le navigateur envoie
 * n'est cru sur parole.
 */

export type Devis = {
  id: string;
  quantite: number;
  disponible: number;
  allocation: number;
};

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

export async function demanderDevisPitch(projetId: string): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: "logline",
    p_params: {},
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageErreur(error?.code) };
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
export async function lancerPitch(
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

  revalidatePath(`/projets/${projetId}`);
  return { ok: true };
}

export async function annulerPitch(
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
  revalidatePath(`/projets/${projetId}`);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/** Applique la proposition, telle quelle ou modifiée, au pitch du projet. */
export async function appliquerProposition(
  projetId: string,
  propositionId: string,
  texte: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const pitch = String(texte ?? "").trim();
  if (!pitch) {
    return { erreur: "Le pitch est vide : écartez la proposition, ou écrivez-le." };
  }
  if (pitch.length > PITCH_MAX) {
    return { erreur: `Le pitch ne peut pas dépasser ${PITCH_MAX} caractères.` };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_proposition", {
    p_suggestion_id: propositionId,
    p_content: pitch,
  });
  revalidatePath(`/projets/${projetId}`);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }

  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");
  return { ok: true };
}

export async function ecarterProposition(
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
  revalidatePath(`/projets/${projetId}`);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}
