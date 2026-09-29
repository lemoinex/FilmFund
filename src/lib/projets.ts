import type { ProjectFormat, ProjectStage } from "@/lib/supabase/types";

/** Libellés français des énumérations de la base. */

export const FORMATS: Record<ProjectFormat, string> = {
  long_metrage: "Long métrage",
  court_metrage: "Court métrage",
  documentaire: "Documentaire",
  serie: "Série",
  web_serie: "Web-série",
  animation: "Animation",
};

export const ETAPES: Record<ProjectStage, string> = {
  idee: "Idée",
  developpement: "Développement",
  ecriture: "Écriture",
  preproduction: "Préproduction",
  production: "Production",
  postproduction: "Postproduction",
  termine: "Terminé",
};

export const FORMATS_VALIDES = Object.keys(FORMATS) as ProjectFormat[];
export const ETAPES_VALIDES = Object.keys(ETAPES) as ProjectStage[];

export function estFormatValide(valeur: string): valeur is ProjectFormat {
  return (FORMATS_VALIDES as string[]).includes(valeur);
}

export function estEtapeValide(valeur: string): valeur is ProjectStage {
  return (ETAPES_VALIDES as string[]).includes(valeur);
}
