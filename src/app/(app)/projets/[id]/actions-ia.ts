"use server";

import { revalidatePath } from "next/cache";

import { estActionIa, LIVRABLES_IA, messageErreur, type ActionIa } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Assistant d'écriture : demandes de rédaction.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités et appliquent ou écartent une proposition.
 * L'appel lui-même est fait par le worker. Les quantités, les droits et les
 * limites sont décidés par la base ; rien de ce que le navigateur envoie
 * n'est cru sur parole.
 *
 * Le navigateur choisit un livrable du catalogue, et rien d'autre : le
 * profil, le modèle et le budget restent au worker. Une action hors
 * catalogue est refusée ici, avant tout appel.
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

/** Adresse de la rubrique où l'encart de ce livrable se tient. */
function pageDuLivrable(projetId: string, action: ActionIa): string {
  const { page } = LIVRABLES_IA[action];
  return page === "projet" ? `/projets/${projetId}` : `/projets/${projetId}/${page}`;
}

/**
 * Rafraîchit la rubrique du livrable, et le projet avec elle : son encart et
 * le texte qu'il remplacerait n'y sont pas toujours sur la même page.
 */
function revalider(projetId: string, action: ActionIa): void {
  revalidatePath(`/projets/${projetId}`);
  const page = pageDuLivrable(projetId, action);
  if (page !== `/projets/${projetId}`) {
    revalidatePath(page);
  }
}

export async function demanderDevis(
  projetId: string,
  action: string,
): Promise<{ devis: Devis } | Echec> {
  if (!UUID.test(projetId) || !estActionIa(action)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: action,
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
export async function lancerProposition(
  projetId: string,
  action: string,
  devisId: string,
  cle: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !estActionIa(action) || !UUID.test(devisId) || !UUID.test(cle)) {
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

  revalider(projetId, action);
  return { ok: true };
}

export async function annulerProposition(
  projetId: string,
  action: string,
  tacheId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !estActionIa(action) || !UUID.test(tacheId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("annuler_travail", { p_job_id: tacheId });
  // La page est rafraîchie même en cas de refus : la tâche a pu être prise
  // entre-temps, et l'écran doit le montrer.
  revalider(projetId, action);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/** Applique la proposition, telle quelle ou modifiée, là où son action l'inscrit. */
export async function appliquerProposition(
  projetId: string,
  action: string,
  propositionId: string,
  texte: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !estActionIa(action) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const livrable = LIVRABLES_IA[action];
  const contenu = String(texte ?? "").trim();
  if (!contenu) {
    return { erreur: "Le texte est vide : écartez la proposition, ou écrivez-le." };
  }
  if (contenu.length > livrable.longueurMax) {
    return {
      erreur: `Ce texte ne peut pas dépasser ${livrable.longueurMax} caractères.`,
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
  revalider(projetId, action);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }

  // Les listes montrent le score de maturité, que ce texte fait bouger.
  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");
  return { ok: true };
}

export async function ecarterProposition(
  projetId: string,
  action: string,
  propositionId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !estActionIa(action) || !UUID.test(propositionId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_proposition", {
    p_suggestion_id: propositionId,
  });
  revalider(projetId, action);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}
