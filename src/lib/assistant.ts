/**
 * Assistant de création : ses étapes, leur ordre, et les champs que chacune
 * enregistre. Module pur, testable sans pile Supabase.
 *
 * Le projet naît à la première étape ; chacune des suivantes complète sa
 * fiche (lot R1). Une étape n'enregistre que ses propres champs : rien de ce
 * qu'une autre a saisi n'est réécrit.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node. L'import de type s'efface à l'exécution.
 */

import type { ChampFiche } from "./fiche";

export type Etape = {
  cle: string;
  /** Court, pour la barre de progression. */
  libelle: string;
  titre: string;
  /** Ce que l'étape demande, en une phrase. */
  aide: string;
  /** Champs de la fiche que l'étape enregistre. */
  champs: readonly ChampFiche[];
};

export const ETAPES_ASSISTANT = [
  {
    cle: "informations",
    libelle: "Informations",
    titre: "Informations générales",
    aide: "Le titre, le format et les repères du film. Seul le titre est obligatoire.",
    champs: ["genre", "countries", "languages", "duration_minutes"],
  },
  {
    cle: "concept",
    libelle: "Concept",
    titre: "Concept",
    aide: "Le film en quelques phrases : son pitch, son histoire en bref, son thème.",
    champs: ["short_synopsis", "theme"],
  },
  {
    cle: "personnages",
    libelle: "Personnages",
    titre: "Personnages",
    aide: "Qui porte l'histoire ? Les principaux d'abord, puis ceux qui les entourent.",
    champs: [],
  },
  {
    cle: "enjeux",
    libelle: "Enjeux",
    titre: "Enjeux",
    aide: "Ce que vos personnages risquent, ce qu'ils peuvent gagner ou perdre.",
    champs: ["stakes"],
  },
  {
    cle: "vision",
    libelle: "Vision",
    titre: "Vision artistique",
    aide: "Comment vous voulez filmer cette histoire : ton, images, sons, références.",
    champs: ["artistic_vision"],
  },
  {
    cle: "objectifs",
    libelle: "Objectifs",
    titre: "Objectifs",
    aide: "Où va ce film : festivals visés, financements recherchés, diffusion espérée.",
    champs: ["goals"],
  },
  {
    cle: "public",
    libelle: "Public",
    titre: "Public cible",
    aide: "À qui ce film s'adresse, et pourquoi il le touchera.",
    champs: ["audience"],
  },
] as const satisfies readonly Etape[];

export type CleEtape = (typeof ETAPES_ASSISTANT)[number]["cle"];

export function estEtape(valeur: unknown): valeur is CleEtape {
  return ETAPES_ASSISTANT.some((etape) => etape.cle === valeur);
}

export function etapeDe(cle: CleEtape): (typeof ETAPES_ASSISTANT)[number] {
  return ETAPES_ASSISTANT.find((etape) => etape.cle === cle)!;
}

/** Étape suivante ; nulle après la dernière, qui mène à la fiche. */
export function etapeSuivante(cle: CleEtape): CleEtape | null {
  const rang = ETAPES_ASSISTANT.findIndex((etape) => etape.cle === cle);
  return ETAPES_ASSISTANT[rang + 1]?.cle ?? null;
}

/** Étape précédente ; nulle pour la première. */
export function etapePrecedente(cle: CleEtape): CleEtape | null {
  const rang = ETAPES_ASSISTANT.findIndex((etape) => etape.cle === cle);
  return rang > 0 ? ETAPES_ASSISTANT[rang - 1].cle : null;
}

/** « Étape 2 sur 7 ». */
export function progression(cle: CleEtape): { rang: number; total: number } {
  return {
    rang: ETAPES_ASSISTANT.findIndex((etape) => etape.cle === cle) + 1,
    total: ETAPES_ASSISTANT.length,
  };
}

/** Bornes des champs du projet que l'assistant saisit aussi, comme en base. */
export const TITRE_MAX = 200;
export const PITCH_MAX = 500;

/** Titre du projet : espaces repliés ; une erreur s'il est vide ou trop long. */
export function lireTitre(valeur: unknown): { titre: string } | { erreur: string } {
  const titre = typeof valeur === "string" ? valeur.replace(/\s+/g, " ").trim() : "";
  if (!titre) return { erreur: "Donnez un titre à votre projet." };
  if ([...titre].length > TITRE_MAX) {
    return { erreur: `Le titre ne peut pas dépasser ${TITRE_MAX} caractères.` };
  }
  return { titre };
}

/**
 * Pitch : facultatif. Seules les extrémités sont coupées, comme à la création
 * rapide : un pitch déjà écrit sur deux lignes reste tel quel.
 */
export function lirePitch(valeur: unknown): { pitch: string } | { erreur: string } {
  const pitch = typeof valeur === "string" ? valeur.replace(/\r\n?/g, "\n").trim() : "";
  if ([...pitch].length > PITCH_MAX) {
    return { erreur: `Le pitch ne peut pas dépasser ${PITCH_MAX} caractères.` };
  }
  return { pitch };
}
