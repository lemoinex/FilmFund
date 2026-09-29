import type { BudgetCategory } from "@/lib/supabase/types";

/** Postes budgétaires, dans l'ordre d'un devis de film. */
export const POSTES: Record<BudgetCategory, string> = {
  developpement: "Développement et écriture",
  droits: "Droits artistiques",
  equipe_technique: "Équipe technique",
  interpretation: "Interprétation",
  decors_costumes: "Décors, costumes et accessoires",
  materiel: "Matériel technique",
  transport_regie: "Transport, hébergement et régie",
  postproduction: "Postproduction",
  assurances_divers: "Assurances et frais divers",
  promotion_distribution: "Promotion et distribution",
  imprevus: "Imprévus",
};

export const ORDRE_POSTES = Object.keys(POSTES) as BudgetCategory[];

export function estPosteValide(valeur: string): valeur is BudgetCategory {
  return Object.hasOwn(POSTES, valeur);
}

/**
 * Devises proposées, codes ISO 4217.
 *
 * Les monnaies des principaux pays de production du continent, plus l'euro
 * et le dollar, dans lesquels se négocient la plupart des coproductions et
 * des financements internationaux. La base accepte tout code ISO bien
 * formé : allonger cette liste ne demande pas de migration.
 */
export const DEVISES: Record<string, string> = {
  XOF: "Franc CFA (UEMOA) — XOF",
  XAF: "Franc CFA (CEMAC) — XAF",
  NGN: "Naira nigérian — NGN",
  GHS: "Cedi ghanéen — GHS",
  KES: "Shilling kényan — KES",
  ZAR: "Rand sud-africain — ZAR",
  MAD: "Dirham marocain — MAD",
  TND: "Dinar tunisien — TND",
  DZD: "Dinar algérien — DZD",
  EGP: "Livre égyptienne — EGP",
  CDF: "Franc congolais — CDF",
  RWF: "Franc rwandais — RWF",
  ETB: "Birr éthiopien — ETB",
  GNF: "Franc guinéen — GNF",
  EUR: "Euro — EUR",
  USD: "Dollar américain — USD",
};

export function estDeviseValide(valeur: string): boolean {
  return Object.hasOwn(DEVISES, valeur);
}

export const LIBELLE_MAX = 200;

/*
 * Plafonds alignés sur les colonnes : numeric(14, 2) pour un coût unitaire,
 * numeric(12, 2) pour une quantité. Au-delà, la base refuserait la ligne
 * avec une erreur technique ; mieux vaut un message clair avant.
 */
const CHIFFRES_MAX_MONTANT = 12;
const CHIFFRES_MAX_QUANTITE = 10;

/**
 * Lit un nombre saisi à la française : « 1 500 000 », « 12,5 ».
 *
 * Les espaces (y compris insécables, que colle un tableur) séparent les
 * milliers ; la virgule ou le point marque les décimales, deux au plus.
 * « 1.500.000 » est refusé plutôt que deviné : selon l'habitude de qui
 * saisit, le point sépare les milliers ou les décimales, et une erreur d'un
 * facteur mille sur un budget ne se rattrape pas.
 */
function lireNombre(saisie: string, chiffresMax: number): number | null {
  const normalise = saisie.replace(/[\s  ]/g, "").replace(",", ".");
  const motif = new RegExp(`^\\d{1,${chiffresMax}}(\\.\\d{1,2})?$`);
  return motif.test(normalise) ? Number(normalise) : null;
}

export function lireMontant(saisie: string): number | null {
  return lireNombre(saisie, CHIFFRES_MAX_MONTANT);
}

export function lireQuantite(saisie: string): number | null {
  const quantite = lireNombre(saisie, CHIFFRES_MAX_QUANTITE);
  return quantite !== null && quantite > 0 ? quantite : null;
}

/** Montant en centimes : les sommes se font en entiers, sans dérive d'arrondi. */
export function enCentimes(montant: number | string): number {
  return Math.round(Number(montant) * 100);
}

export function formaterMontant(centimes: number, devise: string): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: devise }).format(
    centimes / 100,
  );
}

/** Valeur à réafficher dans un champ : sans séparateur, virgule décimale. */
export function montantPourSaisie(montant: number | string | null): string {
  if (montant === null) return "";
  return String(Number(montant)).replace(".", ",");
}
