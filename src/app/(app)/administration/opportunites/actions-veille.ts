"use server";

import { revalidatePath } from "next/cache";

import {
  lireCorrection,
  lireQuestionVeille,
  LIVRABLE_VEILLE,
  messageVeille,
} from "@/lib/opportunites";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Veille des opportunités : la demande, puis la décision, opportunité par
 * opportunité.
 *
 * Aucune de ces actions n'appelle un moteur de recherche ni un fournisseur
 * d'IA : elles demandent une veille à la base, qui en crée la tâche, puis
 * acceptent ou écartent ce que le worker a déposé. Le rôle est vérifié ici,
 * puis de nouveau par chaque fonction de la base ; rien de ce que le
 * navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le moteur, ni le modèle, ni le nombre de
 * pages : il écrit ce qu'il cherche. À l'acceptation, il ne corrige que le
 * nom, l'organisme et la catégorie — jamais la page, la date de la collecte
 * ni l'extrait, et l'opportunité naît toujours « non vérifiée ».
 */

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function administration() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return garde;
  }
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    return { erreur: messageVeille("42501") };
  }
  return { supabase };
}

function revalider(): void {
  revalidatePath("/administration/opportunites");
  revalidatePath("/administration/journal");
}

/**
 * La recherche telle qu'elle partira, sans rien envoyer : l'écran la remontre
 * avant la confirmation.
 */
export async function preparerVeille(saisie: string): Promise<{ question: string } | Echec> {
  const question = lireQuestionVeille(saisie);
  if (question === null) {
    return {
      erreur: `Décrivez ce que vous cherchez sur une ligne, en ${LIVRABLE_VEILLE.questionMin} à ${LIVRABLE_VEILLE.questionMax} caractères.`,
    };
  }
  const acces = await administration();
  return "erreur" in acces ? acces : { question };
}

/** Demande la veille : la tâche naît en base, et la demande est journalisée. */
export async function lancerVeille(saisie: string): Promise<{ ok: true } | Echec> {
  const question = lireQuestionVeille(saisie);
  if (question === null) {
    return DEMANDE_INVALIDE;
  }
  const acces = await administration();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("demander_veille", { p_question: question });
  revalider();
  if (error) {
    return { erreur: messageVeille(error.code) };
  }
  return { ok: true };
}

export async function annulerVeille(tacheId: string): Promise<{ ok: true } | Echec> {
  if (!UUID.test(tacheId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await administration();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("annuler_travail", { p_job_id: tacheId });
  // La page est rafraîchie même en cas de refus : la tâche a pu être prise
  // entre-temps, et l'écran doit le montrer.
  revalider();
  if (error) {
    return { erreur: messageVeille(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte une opportunité proposée : elle entre au catalogue « non
 * vérifiée », sous le nom, l'organisme et la catégorie relus ici.
 */
export async function accepterOpportunite(
  ligneId: string,
  saisie: { nom: string; organisme: string; categorie: string },
): Promise<{ ok: true; fiche: string | null } | Echec> {
  if (!UUID.test(ligneId)) {
    return DEMANDE_INVALIDE;
  }
  const correction = lireCorrection(saisie?.nom, saisie?.organisme, saisie?.categorie);
  if ("erreur" in correction) {
    return correction;
  }
  const acces = await administration();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("accepter_opportunite_proposee", {
    p_line_id: ligneId,
    p_name: correction.name,
    p_organization: correction.organization,
    p_category: correction.category,
  });
  revalider();
  if (error) {
    return { erreur: messageVeille(error.code) };
  }
  return { ok: true, fiche: data?.opportunity_id ?? null };
}

/** Écarte une opportunité proposée : rien n'entre au catalogue. */
export async function ecarterOpportunite(ligneId: string): Promise<{ ok: true } | Echec> {
  if (!UUID.test(ligneId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await administration();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_opportunite_proposee", {
    p_line_id: ligneId,
  });
  revalider();
  if (error) {
    return { erreur: messageVeille(error.code) };
  }
  return { ok: true };
}
