"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import {
  estRetouche,
  LIVRABLE_DIALOGUE,
  LIVRABLES_RETOUCHE,
  localiserPassage,
  messageErreur,
  messageErreurRetouche,
  MOTS_PASSAGE_DOCUMENT,
  RETOUCHE,
} from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../../actions-ia";

/*
 * Assistant de dialogues : les répliques d'une scène du scénario.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent une unité, puis appliquent ou écartent la scène que le
 * worker a déposée. Les droits et les bornes sont décidés par la base.
 *
 * Le navigateur n'envoie que le texte qu'il a sélectionné. C'est ici que le
 * passage est retrouvé dans le document enregistré, puis désigné à la base
 * par sa position, sa longueur et son empreinte : aucune de ces trois
 * valeurs ne vient du navigateur. La base relit ensuite le passage elle-même
 * — au devis, avant l'appel et à l'acceptation — et refuse s'il a changé.
 */

const ACTION = LIVRABLE_DIALOGUE.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

/** Le document vient de changer, ou peut avoir changé : sa page, et la liste des documents. */
function revalider(projetId: string, documentId: string, documentModifie = false): void {
  revalidatePath(`/projets/${projetId}/documents/${documentId}`);
  if (documentModifie) {
    revalidatePath(`/projets/${projetId}/documents`);
    revalidatePath(`/projets/${projetId}`);
  }
}

export async function demanderDevisDialogue(
  projetId: string,
  documentId: string,
  selection: string,
): Promise<{ devis: Devis; passage: string } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(documentId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  // Le document enregistré, lu sous la RLS de l'appelant : c'est dans ce
  // texte-là, et non dans ce que le navigateur affiche, que le passage est
  // cherché.
  const { data: document } = await acces.supabase
    .from("project_documents")
    .select("content, type")
    .eq("id", documentId)
    .eq("project_id", projetId)
    .maybeSingle();
  if (!document || document.type !== "scenario") {
    return { erreur: "Ce document n'est pas un scénario." };
  }

  const localise = localiserPassage(document.content, selection);
  if ("erreur" in localise) {
    return localise;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: ACTION,
    p_params: {
      scenes: 1,
      document: documentId,
      debut: localise.debut,
      longueur: localise.longueur,
      empreinte: createHash("md5").update(localise.passage, "utf8").digest("hex"),
    },
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
    passage: localise.passage,
  };
}

/**
 * Accepte le devis : l'unité est réservée et la tâche naît. La clé vient du
 * navigateur, qui la garde le temps de la demande : un double envoi renvoie
 * la même réservation au lieu d'en créer une seconde.
 */
export async function lancerDialogue(
  projetId: string,
  documentId: string,
  devisId: string,
  cle: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(documentId) || !UUID.test(devisId) || !UUID.test(cle)) {
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

  revalider(projetId, documentId);
  return { ok: true };
}

export async function annulerDialogue(
  projetId: string,
  documentId: string,
  tacheId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(documentId) || !UUID.test(tacheId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("annuler_travail", { p_job_id: tacheId });
  // La page est rafraîchie même en cas de refus : la tâche a pu être prise
  // entre-temps, et l'écran doit le montrer.
  revalider(projetId, documentId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Applique la scène réécrite, telle quelle ou retouchée : la base remplace
 * le passage désigné à la demande, et lui seul — ou refuse s'il a changé.
 */
export async function appliquerDialogue(
  projetId: string,
  documentId: string,
  propositionId: string,
  texte: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(documentId) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const contenu = String(texte ?? "").trim();
  if (!contenu) {
    return { erreur: "La scène est vide : écartez la proposition, ou écrivez-la." };
  }
  if (contenu.length > LIVRABLE_DIALOGUE.longueurMax) {
    return {
      erreur: `Cette scène ne peut pas dépasser ${LIVRABLE_DIALOGUE.longueurMax} caractères.`,
    };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_proposition", {
    p_suggestion_id: propositionId,
    p_content: contenu,
  });
  revalider(projetId, documentId, true);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

export async function ecarterDialogue(
  projetId: string,
  documentId: string,
  propositionId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(documentId) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_proposition", {
    p_suggestion_id: propositionId,
  });
  revalider(projetId, documentId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/*
 * Retouches d'un passage (lot RT2) : améliorer, raccourcir, développer,
 * corriger. Même parcours que les dialogues, sur un document de tout type.
 * Lancer, annuler et écarter passent par les actions ci-dessus, qui ne
 * dépendent pas du livrable ; seuls le devis et l'acceptation ont les leurs.
 */

export async function demanderDevisRetouche(
  projetId: string,
  documentId: string,
  action: string,
  selection: string,
): Promise<{ devis: Devis; passage: string } | Echec> {
  // L'action vient du navigateur : elle n'est admise que si elle est l'une des
  // quatre retouches du catalogue.
  if (
    !UUID.test(projetId) ||
    !UUID.test(documentId) ||
    typeof action !== "string" ||
    !estRetouche(action)
  ) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  // Le document enregistré, lu sous la RLS de l'appelant : c'est dans ce
  // texte-là, et non dans ce que le navigateur affiche, que le passage est
  // cherché.
  const { data: document } = await acces.supabase
    .from("project_documents")
    .select("content")
    .eq("id", documentId)
    .eq("project_id", projetId)
    .maybeSingle();
  if (!document) {
    return { erreur: "Document introuvable." };
  }

  const localise = localiserPassage(
    document.content,
    selection,
    RETOUCHE.passageMax,
    MOTS_PASSAGE_DOCUMENT,
  );
  if ("erreur" in localise) {
    return localise;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: action,
    p_params: {
      document: documentId,
      debut: localise.debut,
      longueur: localise.longueur,
      empreinte: createHash("md5").update(localise.passage, "utf8").digest("hex"),
    },
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageErreurRetouche(error?.code) };
  }

  return {
    devis: {
      id: devis.quote_id,
      quantite: devis.quantity,
      disponible: devis.available,
      allocation: devis.allowance,
    },
    passage: localise.passage,
  };
}

/**
 * Applique le passage retouché, tel quel ou repris à la main : la base
 * remplace le passage désigné à la demande, et lui seul — ou refuse s'il a
 * changé. La borne dite ici est celle de la retouche ; la base la tient.
 */
export async function appliquerRetouche(
  projetId: string,
  documentId: string,
  propositionId: string,
  action: string,
  texte: string,
): Promise<{ ok: true } | Echec> {
  if (
    !UUID.test(projetId) ||
    !UUID.test(documentId) ||
    !UUID.test(propositionId) ||
    typeof action !== "string" ||
    !estRetouche(action)
  ) {
    return DEMANDE_INVALIDE;
  }
  const contenu = String(texte ?? "").trim();
  if (!contenu) {
    return { erreur: "Le passage est vide : écartez la proposition, ou écrivez-le." };
  }
  const max = LIVRABLES_RETOUCHE[action].longueurMax;
  if (contenu.length > max) {
    return { erreur: `Ce passage ne peut pas dépasser ${max} caractères.` };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("accepter_proposition", {
    p_suggestion_id: propositionId,
    p_content: contenu,
  });
  revalider(projetId, documentId, true);
  if (error) {
    return { erreur: messageErreurRetouche(error.code) };
  }
  return { ok: true };
}
