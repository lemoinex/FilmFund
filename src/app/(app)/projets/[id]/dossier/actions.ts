"use server";

import { revalidatePath } from "next/cache";

import { ORDRE_TYPES } from "@/lib/documents";
import {
  estFormatExport,
  FORMATS_EXPORT,
  messageErreurExport,
  normaliserDemande,
} from "@/lib/exports";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

/*
 * Dossier : demande d'export, en PDF ou en Word.
 *
 * Aucune de ces actions ne fabrique de fichier : elles demandent un devis et
 * réservent une unité. Le fichier est fabriqué par le worker. Les droits, les
 * quotas et le contenu du dossier sont décidés par la base ; rien de ce que
 * le navigateur envoie n'est cru sur parole.
 */

export type DevisExport = {
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

/**
 * Prépare un export. Si un dossier identique existe encore — mêmes sections,
 * même contenu, même format —, il est rendu tel quel : aucune unité n'est
 * engagée. Sinon, un devis est établi, que l'utilisateur confirme ou non.
 */
export async function preparerExport(
  projetId: string,
  sections: string[],
  documents: string[],
  format: unknown,
): Promise<{ devis: DevisExport } | { existant: string } | Echec> {
  if (!UUID.test(projetId) || !estFormatExport(format)) {
    return DEMANDE_INVALIDE;
  }
  const demande = normaliserDemande(sections, documents, ORDRE_TYPES);
  if (!demande) {
    return { erreur: "Cochez au moins une section à exporter." };
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { data: existant, error: recherche } = await acces.supabase.rpc("export_disponible", {
    p_project_id: projetId,
    p_params: demande,
    p_format: format,
  });
  if (recherche) {
    return { erreur: messageErreurExport(recherche.code) };
  }
  if (existant) {
    return { existant };
  }

  const { data, error } = await acces.supabase.rpc("creer_devis", {
    p_project_id: projetId,
    // Le format est l'action même : la base n'accepte que les siennes.
    p_action: FORMATS_EXPORT[format].action,
    p_params: demande,
  });
  const devis = data?.[0];
  if (error || !devis) {
    return { erreur: messageErreurExport(error?.code) };
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
 * Accepte le devis : l'unité est réservée et la tâche naît. La clé vient du
 * navigateur, qui la garde le temps de la demande : un double envoi renvoie
 * la même réservation au lieu d'en créer une seconde.
 */
export async function lancerExport(
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
    return { erreur: messageErreurExport(error.code) };
  }

  revalidatePath(`/projets/${projetId}/dossier`);
  return { ok: true };
}

export async function annulerExport(
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
  revalidatePath(`/projets/${projetId}/dossier`);
  if (error) {
    return { erreur: messageErreurExport(error.code) };
  }
  return { ok: true };
}
