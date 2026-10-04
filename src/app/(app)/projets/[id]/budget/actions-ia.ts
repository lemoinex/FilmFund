"use server";

import { revalidatePath } from "next/cache";

import { estPosteValide, LIBELLE_MAX, lireMontant, lireQuantite } from "@/lib/budgets";
import { messageErreur, messageLot } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant de production : propositions de lignes de budget.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des lignes que le
 * worker a déposées. Les droits, les quantités et les bornes sont décidés
 * par la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours `budget_plan` —,
 * ni le profil, ni le modèle, ni le budget de l'appel.
 */

const ACTION = "budget_plan";

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

/**
 * Le budget vient de changer, ou peut avoir changé : sa page, le projet, et
 * les listes qui montrent le score de maturité, que le budget fait bouger.
 */
function revalider(projetId: string, budgetModifie = false): void {
  revalidatePath(`/projets/${projetId}/budget`);
  if (budgetModifie) {
    revalidatePath(`/projets/${projetId}`);
    revalidatePath("/projets");
    revalidatePath("/tableau-de-bord");
  }
}

export async function demanderDevisBudget(projetId: string): Promise<{ devis: Devis } | Echec> {
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
export async function lancerPropositionBudget(
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

export async function annulerPropositionBudget(
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

/** Ce que l'équipe a corrigé d'une ligne avant de l'accepter, tel que saisi. */
export type SaisieLigne = { poste: string; libelle: string; quantite: string; cout: string };

/**
 * Accepte une ligne : elle entre au budget. Sans saisie, telle que proposée ;
 * avec, telle que l'équipe l'a corrigée — les mêmes lectures et les mêmes
 * bornes que le formulaire du budget.
 */
export async function accepterLigneProposee(
  projetId: string,
  ligneId: string,
  saisie?: SaisieLigne,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(ligneId)) {
    return DEMANDE_INVALIDE;
  }

  let corrections: {
    p_category: string;
    p_label: string;
    p_quantity: number;
    p_unit_cost: number;
  } | null = null;
  if (saisie) {
    const poste = String(saisie.poste ?? "");
    const libelle = String(saisie.libelle ?? "").trim();
    if (!estPosteValide(poste)) {
      return { erreur: "Poste budgétaire inconnu." };
    }
    if (!libelle) {
      return { erreur: "Décrivez la dépense." };
    }
    if (libelle.length > LIBELLE_MAX) {
      return { erreur: `La description ne peut pas dépasser ${LIBELLE_MAX} caractères.` };
    }
    const quantite = lireQuantite(String(saisie.quantite ?? "").trim());
    if (quantite === null) {
      return { erreur: "La quantité doit être un nombre positif, deux décimales au plus." };
    }
    const cout = lireMontant(String(saisie.cout ?? "").trim());
    if (cout === null) {
      return {
        erreur:
          "Coût unitaire illisible. Écrivez-le sans point pour les milliers, par exemple 1 500 000 ou 12,50.",
      };
    }
    corrections = { p_category: poste, p_label: libelle, p_quantity: quantite, p_unit_cost: cout };
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_ligne_budget", {
    p_line_id: ligneId,
    ...(corrections ?? {}),
  });
  revalider(projetId, true);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

export async function ecarterLigneProposee(
  projetId: string,
  ligneId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(ligneId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_ligne_budget", { p_line_id: ligneId });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte toutes les lignes qui attendent encore, telles que proposées.
 *
 * Pas atomique : chaque ligne est acceptée par la base, une à une, et celles
 * qui sont entrées au budget y restent si une suivante est refusée. L'écran
 * dit alors combien sont passées, plutôt que d'annoncer un échec.
 */
export async function accepterLignesRestantes(
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

  // Lues sous la RLS de l'appelant : il n'accepte que ce qu'il a le droit de lire.
  const { data: lignes, error: lecture } = await acces.supabase
    .from("ai_suggestion_budget_lines")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position");
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!lignes?.length) {
    revalider(projetId);
    return { erreur: "Plus aucune ligne n'attend de décision." };
  }

  let acceptees = 0;
  for (const ligne of lignes) {
    const { error } = await acces.supabase.rpc("accepter_ligne_budget", { p_line_id: ligne.id });
    if (error) {
      break;
    }
    acceptees += 1;
  }

  revalider(projetId, acceptees > 0);
  const message = messageLot(acceptees, lignes.length);
  return acceptees === lignes.length ? { ok: true, message } : { erreur: message };
}

/** Écarte toutes les lignes qui attendent encore : rien de plus n'entre au budget. */
export async function ecarterLignesRestantes(
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
