/**
 * Plans commerciaux et barème des unités texte : libellés et bornes des
 * valeurs, partagés par l'écran d'administration et ses actions serveur.
 *
 * Les valeurs elles-mêmes vivent en base, versionnées (plan_versions,
 * text_unit_rate_versions) : aucune n'est fixée ici. Module pur, testable
 * sans pile Supabase.
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

/**
 * Barème des unités texte : ce que coûte chaque livrable généré. Versionné en
 * base (text_unit_rate_versions), comme les plans.
 */
export const CHAMPS_BAREME = [
  { cle: "logline", libelle: "Logline", unite: "unités", min: 0, max: 1_000 },
  { cle: "synopsis_short", libelle: "Synopsis court", unite: "unités", min: 0, max: 1_000 },
  { cle: "synopsis_standard", libelle: "Synopsis standard", unite: "unités", min: 0, max: 1_000 },
  { cle: "synopsis_detailed", libelle: "Synopsis détaillé", unite: "unités", min: 0, max: 1_000 },
  { cle: "intention_note", libelle: "Note d'intention", unite: "unités", min: 0, max: 1_000 },
  { cle: "treatment", libelle: "Traitement", unite: "unités", min: 0, max: 1_000 },
  { cle: "bible", libelle: "Bible", unite: "unités", min: 0, max: 1_000 },
  {
    cle: "screenplay_per_sequence",
    libelle: "Scénario, par séquence",
    unite: "unités",
    min: 0,
    max: 1_000,
  },
  {
    cle: "dialogue_per_scene",
    libelle: "Dialogues, par scène",
    unite: "unités",
    min: 0,
    max: 1_000,
  },
] as const;

export type CleChampBareme = (typeof CHAMPS_BAREME)[number]["cle"];

export type ValeursBareme = Record<CleChampBareme, number>;

const NOMBRE = new Intl.NumberFormat("fr-FR");

type ChampEntier = { cle: string; libelle: string; min: number; max: number };

/**
 * Lit et valide des valeurs entières de formulaire : les espaces de
 * groupement (« 20 000 ») sont acceptés, les décimales non.
 */
function lireEntiers<Champ extends ChampEntier>(
  champs: readonly Champ[],
  lire: (cle: string) => unknown,
): { valeurs: Record<Champ["cle"], number> } | { erreur: string } {
  const valeurs = {} as Record<Champ["cle"], number>;

  for (const champ of champs) {
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
    valeurs[champ.cle as Champ["cle"]] = valeur;
  }

  return { valeurs };
}

/** Lit et valide les valeurs d'un formulaire de plan. */
export function lireValeursPlan(
  lire: (cle: string) => unknown,
): { valeurs: ValeursPlan } | { erreur: string } {
  return lireEntiers(CHAMPS_PLAN, lire);
}

/** Lit et valide les valeurs d'un formulaire de barème. */
export function lireValeursBareme(
  lire: (cle: string) => unknown,
): { valeurs: ValeursBareme } | { erreur: string } {
  return lireEntiers(CHAMPS_BAREME, lire);
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
