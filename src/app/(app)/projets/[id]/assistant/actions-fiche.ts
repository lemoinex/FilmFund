"use server";

import { revalidatePath } from "next/cache";

import { CHAMPS_FICHE_PERSONNAGE } from "@/lib/fiche";
import { LIVRABLE_FICHE_PERSONNAGE, messageErreur } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de dramaturgie : la fiche d'un personnage proposée (lot PF3b).
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des champs que le
 * worker a déposés. Les droits, le prix et les bornes sont décidés par la
 * base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours la fiche —, ni le
 * profil, ni le modèle, ni le budget de l'appel : il désigne un personnage,
 * que la base relit dans le projet.
 *
 * Aucune action d'ici n'écrase un champ : la base ne propose que pour les
 * champs vides, et refuse d'en accepter un qui ne l'est plus.
 */

const ACTION = LIVRABLE_FICHE_PERSONNAGE.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

/** Longueur d'un champ corrigé : la plus grande borne de la fiche, que la base affine. */
const CORRECTION_MAX = Math.max(...CHAMPS_FICHE_PERSONNAGE.map(({ max }) => max));

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/assistant/personnages`);
  revalidatePath(`/projets/${projetId}/fiche`);
  revalidatePath(`/projets/${projetId}/assistant-ia`);
}

/**
 * Ce que la base refuse, dit en clair. Les codes `PF001` et `PF002` sont ceux
 * du lot PF3a ; un refus au devis porte `55000`, et son motif se reconnaît à
 * son texte.
 */
function messageDe(code: string | undefined, message: string | undefined): string {
  if (code === "PF001") {
    return "Ce personnage a été retiré du projet : sa fiche ne peut plus être complétée.";
  }
  if (code === "PF002") {
    return "Ce champ a été rempli depuis la demande : rien n'a été remplacé. Vous pouvez écarter la proposition.";
  }
  if (code === "55000" && message?.includes("documentaire")) {
    return LIVRABLE_FICHE_PERSONNAGE.refusDocumentaire;
  }
  if (code === "55000" && message?.includes("complète")) {
    return "La fiche de ce personnage est déjà complète : il ne reste aucun champ à proposer.";
  }
  if (code === "22023") {
    return "Ce texte n'est pas admis pour ce champ : vide, trop long, ou sur plusieurs lignes là où une seule est attendue.";
  }
  return messageErreur(code);
}

export async function demanderDevisFiche(
  projetId: string,
  personnageId: string,
): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(personnageId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: ACTION,
    p_params: { character: personnageId },
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
export async function lancerPropositionFiche(
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

export async function annulerPropositionFiche(
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

/**
 * Accepte un champ : il entre dans la fiche s'il y est encore vide. Sans
 * correction, tel que proposé ; avec, tel que l'équipe l'a réécrit — la base
 * le borne selon le champ.
 */
export async function accepterChampPropose(
  projetId: string,
  champId: string,
  corrige?: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(champId)) {
    return DEMANDE_INVALIDE;
  }
  if (corrige !== undefined && (typeof corrige !== "string" || corrige.length > CORRECTION_MAX)) {
    return { erreur: messageDe("22023", undefined) };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_champ_propose", {
    p_line_id: champId,
    ...(corrige === undefined ? {} : { p_corrige: corrige }),
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageDe(error.code, error.message) };
  }
  return { ok: true };
}

export async function ecarterChampPropose(
  projetId: string,
  champId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(champId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_champ_propose", { p_line_id: champId });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}
