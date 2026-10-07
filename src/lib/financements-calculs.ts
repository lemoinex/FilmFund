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

/**
 * Catégories d'opportunité qui ont leur équivalent exact parmi les types de
 * financement. Un « fonds » peut être public ou privé : le reprendre comme
 * « aide publique » serait le deviner.
 */
const TYPE_DE_CATEGORIE: Readonly<Record<string, "residence" | "coproduction">> = {
  residence: "residence",
  coproduction: "coproduction",
};

const jourLong = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

export type CandidaturePreremplie = {
  funder: string;
  program: string;
  /** Nul : le type reste à choisir. */
  kind: "residence" | "coproduction" | null;
  /** Nul : la devise de l'opportunité n'est pas de celles du budget. */
  currency: string | null;
  deadline: string | null;
  notes: string;
};

/**
 * Ce qu'une candidature reprend d'une opportunité du catalogue (lot U1).
 *
 * Seulement ce qui se reprend sans rien inventer : l'organisme, le nom, la
 * date limite encore à venir, la devise si le budget la connaît, et la source
 * dans les notes. Le montant ne se reprend pas — celui d'une opportunité est
 * celui de l'aide, pas ce que le projet demande.
 *
 * Rien n'est écrit ici : ces valeurs remplissent un formulaire, que l'équipe
 * relit et envoie.
 */
export function preremplirCandidature(
  opportunite: {
    name: string;
    organization: string;
    category: string;
    currency: string | null;
    deadline: string | null;
    source_url: string | null;
    collected_on: string | null;
  },
  devisesConnues: readonly string[],
  aujourdhui: string,
): CandidaturePreremplie {
  const source = opportunite.source_url
    ? ` Source : ${opportunite.source_url}${
        opportunite.collected_on
          ? `, lue le ${jourLong.format(new Date(`${opportunite.collected_on}T00:00:00Z`))}`
          : ""
      }.`
    : "";

  return {
    funder: opportunite.organization.trim().slice(0, 200),
    program: opportunite.name.trim().slice(0, 200),
    kind: Object.hasOwn(TYPE_DE_CATEGORIE, opportunite.category)
      ? TYPE_DE_CATEGORIE[opportunite.category]
      : null,
    currency:
      opportunite.currency && devisesConnues.includes(opportunite.currency)
        ? opportunite.currency
        : null,
    deadline:
      opportunite.deadline !== null && opportunite.deadline >= aujourdhui
        ? opportunite.deadline
        : null,
    notes: `Reprise du catalogue des opportunités.${source}`.slice(0, 2000),
  };
}
