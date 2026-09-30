/**
 * Plan de financement : ce que les candidatures couvrent du budget.
 *
 * Aucun import de valeur : ce module est chargé tel quel par les tests Node.
 */
import type { FundingStatus } from "@/lib/supabase/types";

type Candidature = {
  status: FundingStatus;
  currency: string;
  amount_requested: number | string | null;
  amount_granted: number | string | null;
};

export type PlanFinancement = {
  /** Montants acquis (candidatures acceptées), en centimes, devise du budget. */
  acquis: number;
  /** Montants demandés en attente de réponse, en centimes, devise du budget. */
  enAttente: number;
  /** Budget restant à financer après les montants acquis ; jamais négatif. */
  resteAFinancer: number | null;
  /** Part du budget couverte par les montants acquis, en %, plafonnée à 100. */
  couverture: number | null;
  /** Candidatures acceptées sans montant saisi : comptées, mais pas chiffrées. */
  accepteesSansMontant: number;
  /**
   * Candidatures dans une autre devise que le budget. Elles ne sont pas
   * additionnées : une conversion supposerait un taux que personne n'a
   * fixé, et un total faux vaut moins qu'un total partiel annoncé comme tel.
   */
  autresDevises: number;
};

function centimes(montant: number | string | null): number {
  return montant === null ? 0 : Math.round(Number(montant) * 100);
}

export function calculerPlanFinancement(
  candidatures: Candidature[],
  budget: { totalCentimes: number; devise: string } | null,
): PlanFinancement {
  const devise = budget?.devise ?? null;
  const memeDevise = candidatures.filter((c) => devise !== null && c.currency === devise);

  const acquis = memeDevise
    .filter((c) => c.status === "acceptee")
    .reduce((somme, c) => somme + centimes(c.amount_granted), 0);

  const enAttente = memeDevise
    .filter((c) => c.status === "deposee")
    .reduce((somme, c) => somme + centimes(c.amount_requested), 0);

  const accepteesSansMontant = candidatures.filter(
    (c) => c.status === "acceptee" && c.amount_granted === null,
  ).length;

  const autresDevises = devise
    ? candidatures.filter((c) => c.currency !== devise && c.status !== "refusee").length
    : 0;

  const total = budget?.totalCentimes ?? 0;

  return {
    acquis,
    enAttente,
    resteAFinancer: budget && total > 0 ? Math.max(0, total - acquis) : null,
    couverture: budget && total > 0 ? Math.min(100, Math.round((acquis / total) * 100)) : null,
    accepteesSansMontant,
    autresDevises,
  };
}

/** Jours restants avant une date limite (AAAA-MM-JJ) ; négatif si dépassée. */
export function joursAvant(dateLimite: string, aujourdhui: string): number {
  const jour = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.parse(`${dateLimite}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / jour,
  );
}
