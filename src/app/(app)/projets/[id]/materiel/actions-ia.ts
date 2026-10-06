"use server";

import { revalidatePath } from "next/cache";

import {
  DESIGNATION_MAX,
  EQUIPEMENTS_MAX,
  estCategorieMateriel,
  PUISSANCE_WATTS,
  QUANTITE,
} from "@/lib/materiel";
import { lireEntier } from "@/lib/materiel-calculs";
import { LIVRABLE_MATERIEL, messageErreur, messageLotEquipements } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

import type { Devis } from "../actions-ia";

/*
 * Assistant matériel : propositions d'équipements.
 *
 * Aucune de ces actions n'appelle un fournisseur d'IA : elles demandent un
 * devis, réservent des unités, puis acceptent ou écartent des lignes que le
 * worker a déposées. Les droits, les quantités et les bornes sont décidés par
 * la base ; rien de ce que le navigateur envoie n'est cru sur parole.
 *
 * Le navigateur ne choisit ni le livrable — c'est toujours la liste de
 * matériel —, ni le profil, ni le modèle, ni le budget de l'appel.
 */

const ACTION = LIVRABLE_MATERIEL.action;

type Echec = { erreur: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEMANDE_INVALIDE: Echec = { erreur: "Demande invalide." };
const LISTE_PLEINE: Echec = {
  erreur: `Une liste de matériel compte ${EQUIPEMENTS_MAX} lignes au plus : regroupez-en ou supprimez-en avant d'en accepter d'autres.`,
};

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

async function session() {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  return "erreur" in garde ? garde : { supabase };
}

function revalider(projetId: string): void {
  revalidatePath(`/projets/${projetId}/materiel`);
}

/** Places libres dans la liste du projet, sous la RLS de l'appelant. */
async function placesLibres(supabase: ClientServeur, projetId: string): Promise<number> {
  const { count } = await supabase
    .from("project_gear")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projetId);
  return EQUIPEMENTS_MAX - (count ?? 0);
}

export async function demanderDevisMateriel(projetId: string): Promise<{ devis: Devis } | Echec> {
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
export async function lancerPropositionMateriel(
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

export async function annulerPropositionMateriel(
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

/** Ce que l'équipe retient d'un équipement en le corrigeant, tel que saisi. */
export type SaisieEquipement = {
  categorie: string;
  designation: string;
  quantite: string;
  puissance: string;
  simultane: boolean;
};

/**
 * Accepte un équipement : il entre au matériel. Sans saisie, tel que proposé ;
 * avec, tel que l'équipe l'a corrigé — les mêmes lectures et les mêmes bornes
 * que le formulaire d'un équipement saisi à la main.
 */
export async function accepterEquipementPropose(
  projetId: string,
  equipementId: string,
  saisie?: SaisieEquipement,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(equipementId)) {
    return DEMANDE_INVALIDE;
  }

  let corrige: {
    category: string;
    label: string;
    quantity: number;
    unit_power_watts: number | null;
    simultaneous: boolean;
  } | null = null;
  if (saisie) {
    const categorie = String(saisie.categorie ?? "");
    const designation = String(saisie.designation ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const quantite = lireEntier(String(saisie.quantite ?? ""), QUANTITE);
    const puissance = lireEntier(String(saisie.puissance ?? ""), PUISSANCE_WATTS);
    if (!estCategorieMateriel(categorie)) {
      return { erreur: "Catégorie inconnue." };
    }
    if (!designation) {
      return { erreur: "Donnez une désignation à l'équipement." };
    }
    if (designation.length > DESIGNATION_MAX) {
      return {
        erreur: `La désignation tient sur une ligne de ${DESIGNATION_MAX} caractères au plus.`,
      };
    }
    if (quantite === null || quantite === "invalide") {
      return {
        erreur: `La quantité est un nombre entier, de ${QUANTITE.min} à ${QUANTITE.max}.`,
      };
    }
    if (puissance === "invalide") {
      return {
        erreur: `La puissance est un nombre entier de watts, de ${PUISSANCE_WATTS.min} à ${PUISSANCE_WATTS.max}.`,
      };
    }
    corrige = {
      category: categorie,
      label: designation,
      quantity: quantite,
      unit_power_watts: puissance,
      simultaneous: saisie.simultane === true,
    };
  }

  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  if ((await placesLibres(acces.supabase, projetId)) < 1) {
    return LISTE_PLEINE;
  }

  const { error } = await acces.supabase.rpc("accepter_materiel_propose", {
    p_line_id: equipementId,
    ...(corrige ? { p_corrige: corrige } : {}),
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

export async function ecarterEquipementPropose(
  projetId: string,
  equipementId: string,
): Promise<{ ok: true } | Echec> {
  if (!UUID.test(projetId) || !UUID.test(equipementId)) {
    return DEMANDE_INVALIDE;
  }
  const acces = await session();
  if ("erreur" in acces) {
    return acces;
  }

  const { error } = await acces.supabase.rpc("ecarter_materiel_propose", {
    p_line_id: equipementId,
  });
  revalider(projetId);
  if (error) {
    return { erreur: messageErreur(error.code) };
  }
  return { ok: true };
}

/**
 * Accepte tous les équipements qui attendent encore, tels que proposés.
 *
 * Pas atomique : chaque ligne est acceptée par la base, une à une, et celles
 * qui sont entrées au matériel y restent si une suivante est refusée. L'écran
 * dit alors combien sont passées, plutôt que d'annoncer un échec.
 */
export async function accepterEquipementsRestants(
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
  const { data: equipements, error: lecture } = await acces.supabase
    .from("ai_suggestion_gear")
    .select("id")
    .eq("project_id", projetId)
    .eq("suggestion_id", propositionId)
    .eq("state", "proposed")
    .order("position")
    .limit(LIVRABLE_MATERIEL.lignesMax);
  if (lecture) {
    return { erreur: messageErreur(lecture.code) };
  }
  if (!equipements?.length) {
    revalider(projetId);
    return { erreur: "Plus aucun équipement n'attend de décision." };
  }

  if ((await placesLibres(acces.supabase, projetId)) < equipements.length) {
    return LISTE_PLEINE;
  }

  let acceptes = 0;
  for (const equipement of equipements) {
    const { error } = await acces.supabase.rpc("accepter_materiel_propose", {
      p_line_id: equipement.id,
    });
    if (error) {
      break;
    }
    acceptes += 1;
  }

  revalider(projetId);
  const message = messageLotEquipements(acceptes, equipements.length);
  return acceptes === equipements.length ? { ok: true, message } : { erreur: message };
}

/** Écarte tous les équipements qui attendent encore : rien de plus n'entre au matériel. */
export async function ecarterEquipementsRestants(
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
