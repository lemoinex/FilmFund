import type { FundingKind, FundingStatus } from "@/lib/supabase/types";

export const TYPES_FINANCEMENT: Record<FundingKind, string> = {
  aide_publique: "Aide publique",
  coproduction: "Coproduction",
  preachat: "Préachat, diffusion",
  mecenat: "Mécénat, partenariat",
  financement_participatif: "Financement participatif",
  residence: "Résidence, atelier",
  autre: "Autre",
};

/** Dans l'ordre de la vie d'une candidature. */
export const STATUTS_FINANCEMENT: Record<FundingStatus, string> = {
  a_preparer: "À préparer",
  deposee: "Déposée",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

export const ORDRE_STATUTS = Object.keys(STATUTS_FINANCEMENT) as FundingStatus[];

export const ORGANISME_MAX = 200;
export const PROGRAMME_MAX = 200;
export const NOTES_FINANCEMENT_MAX = 2000;

export function estTypeFinancement(valeur: string): valeur is FundingKind {
  return Object.hasOwn(TYPES_FINANCEMENT, valeur);
}

export function estStatutFinancement(valeur: string): valeur is FundingStatus {
  return Object.hasOwn(STATUTS_FINANCEMENT, valeur);
}

export { calculerPlanFinancement, joursAvant } from "./financements-calculs";
