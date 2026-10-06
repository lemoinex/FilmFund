"use server";

import { revalidatePath } from "next/cache";

import {
  DESCRIPTION_PLAN_MAX,
  DUREE_PLAN_SECONDES,
  estAngle,
  estMouvement,
  FOCALE_MM,
  PLANS_PAR_SCENE_MAX,
} from "@/lib/decoupage";
import { lireEntier } from "@/lib/materiel-calculs";
import { LIVRABLE_DECOUPAGE, messageErreur, messageLotPlans } from "@/lib/propositions";
import { estCadrage } from "@/lib/storyboard";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de découpage : propositions de plans pour une scène.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des plans que le
 * worker a déposés. Les droits, les quantités et les bornes sont décidés par
 * la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours le découpage —,
 * ni le profil, ni le modèle, ni le budget de l'appel, ni ce que l'agent
 * lit : il désigne une scène, que la base vérifie.
 */

const ACTION = LIVRABLE_DECOUPAGE.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };
const SCENE_PLEINE: Echec = {
  erreur: `Une scène compte ${PLANS_PAR_SCENE_MAX} plans au plus : supprimez-en avant d'en accepter d'autres.`,
};

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/storyboard`);
}

/**
 * Places libres dans la scène d'un plan proposé, sous la RLS de l'appelant.
 * Null si le plan est introuvable ou illisible : la base dira pourquoi.
 */
async function placesLibres(
  supabase: ClientServeur,
  projetId: string,
  planId: string,
): Promise<number | null> {
  const { data: plan } = await supabase
    .from("ai_suggestion_shots")
    .select("scene_id")
    .eq("id", planId)
    .eq("project_id", projetId)
    .maybeSingle();
  if (!plan) {
    return null;
  }
  const { count } = await supabase
    .from("scene_shots")
    .select("id", { count: "exact", head: true })
    .eq("scene_id", plan.scene_id);
  return PLANS_PAR_SCENE_MAX - (count ?? 0);
}

export async function demanderDevisDecoupage(
  projetId: string,
  sceneId: string,
): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(sceneId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: ACTION,
    p_params: { scene: sceneId },
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
export async function lancerPropositionDecoupage(
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

export async function annulerPropositionDecoupage(
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

/** Ce que l'équipe retient d'un plan en le corrigeant, tel que saisi. */
export type SaisiePlan = {
  cadrage: string;
  angle: string;
  mouvement: string;
  focale: string;
  duree: string;
  description: string;
};

/**
 * Accepte un plan : il s'ajoute à la fin de sa scène. Sans saisie, tel que
 * proposé ; avec, tel que l'équipe l'a corrigé — les mêmes lectures et les
 * mêmes bornes que le formulaire d'un plan saisi à la main.
 */
export async function accepterPlanPropose(
  projetId: string,
  planId: string,
  saisie?: SaisiePlan,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(planId)) {
    return DEMANDE_INVALIDE;
  }

  let corrige: {
    shot: string;
    focal_mm: number | null;
    angle: string;
    movement: string;
    description: string;
    duration_seconds: number | null;
  } | null = null;
  if (saisie) {
    const cadrage = String(saisie.cadrage ?? "");
    const angle = String(saisie.angle ?? "");
    const mouvement = String(saisie.mouvement ?? "");
    // Une description proposée tient sur une ligne : corrigée, elle le reste.
    const description = String(saisie.description ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const focale = lireEntier(String(saisie.focale ?? ""), FOCALE_MM);
    const duree = lireEntier(String(saisie.duree ?? ""), DUREE_PLAN_SECONDES);
    if (!estCadrage(cadrage)) {
      return { erreur: "Choisissez le cadrage du plan." };
    }
    if (!estAngle(angle) || !estMouvement(mouvement)) {
      return { erreur: "Angle ou mouvement inconnu." };
    }
    if (focale === "invalide") {
      return {
        erreur: `La focale est un nombre entier de millimètres, de ${FOCALE_MM.min} à ${FOCALE_MM.max}.`,
      };
    }
    if (duree === "invalide") {
      return {
        erreur: `La durée est un nombre entier de secondes, de ${DUREE_PLAN_SECONDES.min} à ${DUREE_PLAN_SECONDES.max}.`,
      };
    }
    if (description.length > DESCRIPTION_PLAN_MAX) {
      return {
        erreur: `La description ne peut pas dépasser ${DESCRIPTION_PLAN_MAX} caractères.`,
      };
    }
    corrige = {
      shot: cadrage,
      focal_mm: focale,
      angle,
      movement: mouvement,
      description,
      duration_seconds: duree,
    };
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const libres = await placesLibres(acces.supabase, projetId, planId);
  if (libres !== null && libres < 1) {
    return SCENE_PLEINE;
  }

  const { error } = await acces.supabase.rpc("accepter_plan_propose", {
    p_line_id: planId,
    ...(corrige ? { p_corrige: corrige } : {}),
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

export async function ecarterPlanPropose(
  projetId: string,
  planId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(planId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_plan_propose", { p_line_id: planId });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte tous les plans qui attendent encore, tels que proposés.
 *
 * Pas atomique : chaque plan est accepté par la base, un à un, et ceux qui
 * sont entrés dans le découpage y restent si un suivant est refusé. L'écran
 * dit alors combien sont passés, plutôt que d'annoncer un échec.
 */
export async function accepterPlansRestants(
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
  const { data: plans, error: lecture } = await acces.supabase
    .from("ai_suggestion_shots")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position")
    .limit(LIVRABLE_DECOUPAGE.lignesMax);
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!plans?.length) {
    revalider(projetId);
    return { erreur: "Plus aucun plan n'attend de décision." };
  }

  const libres = await placesLibres(acces.supabase, projetId, plans[0].id);
  if (libres !== null && libres < plans.length) {
    return SCENE_PLEINE;
  }

  let acceptes = 0;
  for (const plan of plans) {
    const { error } = await acces.supabase.rpc("accepter_plan_propose", { p_line_id: plan.id });
    if (error) {
      break;
    }
    acceptes += 1;
  }

  revalider(projetId);
  const message = messageLotPlans(acceptes, plans.length);
  return acceptes === plans.length ? { ok: true, message } : { erreur: message };
}

/** Écarte tous les plans qui attendent encore : rien de plus n'entre dans le découpage. */
export async function ecarterPlansRestants(
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
