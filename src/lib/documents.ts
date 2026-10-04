import type { DocumentStatus, DocumentType } from "@/lib/supabase/types";

/** Types de documents, dans l'ordre où un dossier de film les présente. */
export const TYPES_DOCUMENT: Record<DocumentType, { libelle: string; description: string }> = {
  note_intention: {
    libelle: "Note d'intention",
    description: "Pourquoi ce film, pourquoi vous, pourquoi maintenant.",
  },
  synopsis: {
    libelle: "Synopsis détaillé",
    description: "Le récit déroulé séquence par séquence, du début au dénouement.",
  },
  traitement: {
    libelle: "Traitement",
    description: "Le récit développé, scène après scène, sans dialogues.",
  },
  bible: {
    libelle: "Bible de série",
    description: "Le concept, l'univers, les personnages et l'arc de la saison.",
  },
  scenario: {
    libelle: "Scénario",
    description: "Le texte du film, dialogues compris.",
  },
  analyse: {
    libelle: "Analyse dramaturgique",
    description: "La structure du récit, les arcs, ce qui tient et ce qui manque.",
  },
  biographie: {
    libelle: "Biographie et filmographie",
    description: "Le parcours de l'auteur ou de l'équipe.",
  },
  lettre: {
    libelle: "Lettre",
    description: "Lettre de motivation, d'engagement ou de soutien.",
  },
  autre: {
    libelle: "Autre document",
    description: "Tout autre texte utile au projet.",
  },
};

export const ORDRE_TYPES = Object.keys(TYPES_DOCUMENT) as DocumentType[];

export const STATUTS_DOCUMENT: Record<DocumentStatus, string> = {
  brouillon: "Brouillon",
  en_relecture: "En relecture",
  finalise: "Finalisé",
};

export const TITRE_DOCUMENT_MAX = 200;
/** Aligné sur la contrainte `document_contenu_longueur` de la base. */
export const CONTENU_DOCUMENT_MAX = 200000;

export function estTypeDocument(valeur: string): valeur is DocumentType {
  return Object.hasOwn(TYPES_DOCUMENT, valeur);
}

export function estStatutDocument(valeur: string): valeur is DocumentStatus {
  return Object.hasOwn(STATUTS_DOCUMENT, valeur);
}

export function compterMots(texte: string): number {
  const nettoye = texte.trim();
  return nettoye ? nettoye.split(/\s+/).length : 0;
}

export function libelleMots(mots: number): string {
  return mots ? `${mots} mot${mots > 1 ? "s" : ""}` : "Vide";
}
