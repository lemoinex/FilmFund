import { ETAPES } from "@/lib/projets";
import type { MilestoneStatus, ProjectStage } from "@/lib/supabase/types";

export const STATUTS_ETAPE: Record<MilestoneStatus, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
};

/**
 * Action proposée pour faire avancer une étape, selon son statut.
 * Un seul bouton, qui dit ce qu'il fait, plutôt qu'une liste à dérouler.
 */
export const ETAPE_SUIVANTE: Record<MilestoneStatus, { statut: MilestoneStatus; libelle: string }> =
  {
    a_faire: { statut: "en_cours", libelle: "Commencer" },
    en_cours: { statut: "termine", libelle: "Terminer" },
    termine: { statut: "a_faire", libelle: "Rouvrir" },
  };

/**
 * Phases proposées pour une étape : celles du projet, sauf « Terminé », qui
 * décrit un projet achevé et non une période de travail.
 */
export const PHASES = (Object.keys(ETAPES) as ProjectStage[]).filter((e) => e !== "termine");

export const TITRE_ETAPE_MAX = 200;
export const NOTES_ETAPE_MAX = 2000;

export function estStatutEtape(valeur: string): valeur is MilestoneStatus {
  return Object.hasOwn(STATUTS_ETAPE, valeur);
}

export function estPhase(valeur: string): valeur is ProjectStage {
  return (PHASES as string[]).includes(valeur);
}

export {
  aujourdhui,
  calculerAvancement,
  comparerEtapes,
  estEnRetard,
  formaterJour,
  formaterPeriode,
  lireDate,
} from "./planning-calculs";
