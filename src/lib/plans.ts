/**
 * Plans commerciaux : libellés et bornes des valeurs d'un plan, partagés par
 * l'écran d'administration et son action serveur.
 *
 * Les valeurs elles-mêmes vivent en base, versionnées (plan_versions) :
 * aucune n'est fixée ici. Module pur, testable sans pile Supabase.
 */

/** Code d'erreur levé par la base quand une limite du plan est atteinte. */
export const LIMITE_DU_PLAN = "53400";

export const CHAMPS_PLAN = [
  { cle: "max_projects", libelle: "Projets", unite: "projets", min: 0, max: 100_000 },
  // Le propriétaire du studio compte parmi ses membres.
  { cle: "max_members", libelle: "Membres du studio", unite: "membres", min: 1, max: 10_000 },
  { cle: "storage_mb", libelle: "Stockage (Mo)", unite: "Mo", min: 0, max: 10_000_000 },
  {
    cle: "text_units_per_month",
    libelle: "Unités texte par mois",
    unite: "unités",
    min: 0,
    max: 10_000_000,
  },
  {
    cle: "images_per_month",
    libelle: "Images générées par mois",
    unite: "images",
    min: 0,
    max: 10_000_000,
  },
  {
    cle: "pdf_exports_per_month",
    libelle: "Exports PDF par mois",
    unite: "exports",
    min: 0,
    max: 10_000_000,
  },
  {
    cle: "price_xaf_per_month",
    libelle: "Prix mensuel (XAF)",
    unite: "XAF",
    min: 0,
    max: 100_000_000,
  },
] as const;

export type CleChampPlan = (typeof CHAMPS_PLAN)[number]["cle"];

export type ValeursPlan = Record<CleChampPlan, number>;

const NOMBRE = new Intl.NumberFormat("fr-FR");

/**
 * Lit et valide les valeurs d'un formulaire de plan. Entiers seulement : les
 * espaces de groupement (« 20 000 ») sont acceptés, les décimales non.
 */
export function lireValeursPlan(
  lire: (cle: string) => unknown,
): { valeurs: ValeursPlan } | { erreur: string } {
  const valeurs = {} as ValeursPlan;

  for (const champ of CHAMPS_PLAN) {
    const brut = String(lire(champ.cle) ?? "").replace(/[\s  ]/g, "");
    if (!/^\d+$/.test(brut)) {
      return { erreur: `${champ.libelle} : saisissez un nombre entier.` };
    }
    const valeur = Number(brut);
    if (valeur < champ.min || valeur > champ.max) {
      return {
        erreur: `${champ.libelle} : la valeur doit être comprise entre ${NOMBRE.format(champ.min)} et ${NOMBRE.format(champ.max)}.`,
      };
    }
    valeurs[champ.cle] = valeur;
  }

  return { valeurs };
}

/** Valeur lisible, avec son unité : « 20 000 XAF », « 2 Go », « 100 Mo ». */
export function formaterValeurPlan(cle: CleChampPlan, valeur: number): string {
  if (cle === "storage_mb" && valeur >= 1024) {
    const go = valeur / 1024;
    return `${NOMBRE.format(Number.isInteger(go) ? go : Math.round(go * 10) / 10)} Go`;
  }
  const champ = CHAMPS_PLAN.find((c) => c.cle === cle);
  return `${NOMBRE.format(valeur)} ${champ?.unite ?? ""}`.trim();
}
