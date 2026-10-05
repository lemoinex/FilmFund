"use server";

import { revalidatePath } from "next/cache";

import { estPhase, lireDate, TITRE_ETAPE_MAX } from "@/lib/planning";
import { messageErreur, messageLotJalons } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de production : propositions de jalons de planning.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des jalons que le
 * worker a déposés. Les droits, les quantités et les bornes sont décidés par
 * la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours `schedule_plan` —,
 * ni le profil, ni le modèle, ni le budget de l'appel.
 */

const ACTION = "schedule_plan";

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

/**
 * Le planning vient de changer, ou peut avoir changé : sa page, le projet,
 * et les listes qui montrent l'avancement et le score de maturité.
 */
function revalider(projetId: string, planningModifie = false): void {
  revalidatePath(`/projets/${projetId}/planning`);
  if (planningModifie) {
    revalidatePath(`/projets/${projetId}`);
    revalidatePath("/projets");
    revalidatePath("/tableau-de-bord");
  }
}

export async function demanderDevisPlanning(projetId: string): Promise<{ devis: Devis } | Echec> {
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
export async function lancerPropositionPlanning(
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

export async function annulerPropositionPlanning(
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

/** Ce que l'équipe retient d'un jalon en l'acceptant, tel que saisi. */
export type SaisieJalon = { titre: string; phase: string; debut: string; echeance: string };

/**
 * Accepte un jalon : il entre au planning. Sans saisie, tel que proposé et
 * sans date ; avec, tel que l'équipe l'a corrigé et daté — les mêmes lectures
 * et les mêmes bornes que le formulaire du planning. L'agent ne propose
 * aucune date : celles-ci ne viennent que de l'équipe.
 */
export async function accepterJalonPropose(
  projetId: string,
  jalonId: string,
  saisie?: SaisieJalon,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(jalonId)) {
    return DEMANDE_INVALIDE;
  }

  let retenu: {
    p_title: string;
    p_phase: string;
    p_starts_on?: string;
    p_due_on?: string;
  } | null = null;
  if (saisie) {
    const titre = String(saisie.titre ?? "").trim();
    const phase = String(saisie.phase ?? "");
    const debutSaisi = String(saisie.debut ?? "").trim();
    const echeanceSaisie = String(saisie.echeance ?? "").trim();
    if (!titre) {
      return { erreur: "Donnez un intitulé à l'étape." };
    }
    if (titre.length > TITRE_ETAPE_MAX) {
      return { erreur: `L'intitulé ne peut pas dépasser ${TITRE_ETAPE_MAX} caractères.` };
    }
    if (!estPhase(phase)) {
      return { erreur: "Phase inconnue." };
    }
    const debut = debutSaisi ? lireDate(debutSaisi) : null;
    const echeance = echeanceSaisie ? lireDate(echeanceSaisie) : null;
    if ((debutSaisi && !debut) || (echeanceSaisie && !echeance)) {
      return { erreur: "Une des dates n'existe pas." };
    }
    if (debut && echeance && echeance < debut) {
      return { erreur: "L'échéance ne peut pas précéder le début." };
    }
    retenu = {
      p_title: titre,
      p_phase: phase,
      ...(debut ? { p_starts_on: debut } : {}),
      ...(echeance ? { p_due_on: echeance } : {}),
    };
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_jalon_propose", {
    p_line_id: jalonId,
    ...(retenu ?? {}),
  });
  revalider(projetId, true);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

export async function ecarterJalonPropose(
  projetId: string,
  jalonId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(jalonId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_jalon_propose", { p_line_id: jalonId });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte tous les jalons qui attendent encore, tels que proposés, sans date.
 *
 * Pas atomique : chaque jalon est accepté par la base, un à un, et ceux qui
 * sont entrés au planning y restent si un suivant est refusé. L'écran dit
 * alors combien sont passés, plutôt que d'annoncer un échec.
 */
export async function accepterJalonsRestants(
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
  const { data: jalons, error: lecture } = await acces.supabase
    .from("ai_suggestion_milestones")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position");
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!jalons?.length) {
    revalider(projetId);
    return { erreur: "Plus aucun jalon n'attend de décision." };
  }

  let acceptes = 0;
  for (const jalon of jalons) {
    const { error } = await acces.supabase.rpc("accepter_jalon_propose", { p_line_id: jalon.id });
    if (error) {
      break;
    }
    acceptes += 1;
  }

  revalider(projetId, acceptes > 0);
  const message = messageLotJalons(acceptes, jalons.length);
  return acceptes === jalons.length ? { ok: true, message } : { erreur: message };
}

/** Écarte tous les jalons qui attendent encore : rien de plus n'entre au planning. */
export async function ecarterJalonsRestants(
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
