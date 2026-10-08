/**
 * Plafond mensuel des dépenses d'IA : ce que l'écran de l'administration lit,
 * compte et admet. Module pur, testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 *
 * Les montants se comptent en centimes entiers : additionner des flottants
 * finit par afficher un centime de trop.
 */

const MONTANT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Bornes de saisie du plafond, en dollars. La borne haute est un choix du lot
 * Y1, décidé avec l'utilisateur le 8 octobre 2026 : un garde-fou contre une
 * faute de frappe, pas une limite de la base.
 */
export const PLAFOND_USD = { min: 0, max: 50 } as const;

/**
 * Reste, en dollars, sous lequel l'écran prévient. Un choix du lot : avant
 * chaque appel, le worker réserve le coût du pire cas, et une réserve qui
 * dépasse le reste fait refuser la demande.
 */
export const RESTE_BAS_USD = 1;

const enCentimes = (dollars: number) => Math.round(dollars * 100);

/** « 4,72 $ » : toujours deux décimales, à la française. */
export function enDollars(dollars: number): string {
  return `${MONTANT.format(dollars)} $`;
}

/**
 * Lit le plafond saisi : un nombre de dollars, deux décimales au plus, la
 * virgule ou le point pour séparateur. Rien d'autre — ni signe, ni espace
 * intérieur, ni notation scientifique.
 */
export function lirePlafond(saisie: unknown): { plafond: number } | { erreur: string } {
  const texte = typeof saisie === "string" ? saisie.trim() : "";
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(texte)) {
    return {
      erreur: "Saisissez un montant en dollars, avec deux décimales au plus : 10 ou 12,50.",
    };
  }
  const plafond = Number(texte.replace(",", "."));
  if (plafond < PLAFOND_USD.min || plafond > PLAFOND_USD.max) {
    return {
      erreur: `Le plafond se règle de ${PLAFOND_USD.min} à ${PLAFOND_USD.max} dollars depuis cet écran.`,
    };
  }
  return { plafond };
}

export type BilanPlafond = {
  depense: number;
  plafond: number;
  /** Ce qui reste sous le plafond ; jamais négatif. */
  reste: number;
  /** La dépense a rejoint ou dépassé le plafond : toute demande est refusée. */
  atteint: boolean;
  /** Il reste quelque chose, mais peu : une demande coûteuse serait refusée. */
  bas: boolean;
};

/**
 * Où en est le mois. La dépense est arrondie au centime supérieur : l'écran ne
 * doit pas montrer un reste que le worker, qui compte au micro-dollar, n'a
 * déjà plus.
 */
export function bilanPlafond(depense: number, plafond: number): BilanPlafond {
  const depenseCentimes = Math.ceil(Math.round(depense * 1_000_000) / 10_000);
  const plafondCentimes = enCentimes(plafond);
  const resteCentimes = Math.max(plafondCentimes - depenseCentimes, 0);
  return {
    depense: depenseCentimes / 100,
    plafond: plafondCentimes / 100,
    reste: resteCentimes / 100,
    atteint: resteCentimes === 0,
    bas: resteCentimes > 0 && resteCentimes < enCentimes(RESTE_BAS_USD),
  };
}

/** « 1 novembre » : le jour, en UTC, où la dépense du mois repart de zéro. */
export function remiseAZero(maintenant: Date): string {
  const suivant = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() + 1, 1));
  return JOUR.format(suivant).replace(/^1 /, "1er ");
}

/** Ce que l'écran dit après un changement : le plafond, et ce qu'il entraîne. */
export function messagePlafondChange(plafond: number, depense: number): string {
  const bilan = bilanPlafond(depense, plafond);
  const base = `Plafond mensuel fixé à ${enDollars(bilan.plafond)}.`;
  return bilan.atteint
    ? `${base} Il ne dépasse pas la dépense du mois : toute nouvelle demande sera refusée jusqu'à la remise à zéro.`
    : `${base} Il reste ${enDollars(bilan.reste)} pour ce mois.`;
}
