/**
 * Score de maturité d'un projet : ce qui est renseigné, critère par critère,
 * et ce qu'il reste à faire. Module pur, testable sans pile Supabase.
 *
 * Le score ne juge pas la qualité de l'écriture : il compte ce que le projet
 * contient. La base fournit les faits (`faits_maturite()`) et les
 * pondérations (`readiness_weight_versions`), qui ont le dernier mot ; le
 * calcul se fait ici, et rien n'est stocké.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/**
 * Critères, dans l'ordre où le score les présente. Mêmes codes que les
 * colonnes de `readiness_weight_versions` ; un test d'architecture vérifie
 * qu'ils ne s'écartent pas.
 */
export const CRITERES = {
  concept: "Concept",
  narrative: "Narration",
  characters: "Personnages",
  artistic_vision: "Vision artistique",
  feasibility: "Faisabilité",
  budget: "Budget",
  financing: "Plan de financement",
  market: "Potentiel marché",
  dossier: "Dossier",
} as const;

export type CodeCritere = keyof typeof CRITERES;

export const ORDRE_CRITERES = Object.keys(CRITERES) as CodeCritere[];

/** Points de chaque critère, sur un total de 100. */
export type Ponderations = Record<CodeCritere, number>;

/** Oui/non remis par `faits_maturite()`. */
export const FAITS_OUI_NON = [
  "pitch",
  "synopsis_court",
  "theme",
  "genre",
  "synopsis",
  "vision",
  "duree",
  "pays",
  "langues",
  "public",
  "objectifs",
  "budget_ouvert",
] as const;

/** Compteurs remis par `faits_maturite()`. */
export const FAITS_COMPTES = [
  "personnages",
  "personnages_principaux",
  "personnages_decrits",
  "recits",
  "recits_finalises",
  "notes_intention",
  "notes_intention_finalisees",
  "documents_finalises",
  "presentations",
  "etapes_datees",
  "lignes_budget",
  "postes_budget",
  "candidatures",
  "candidatures_chiffrees",
] as const;

/** Ce qui est renseigné dans un projet : ni texte, ni montant, ni identité. */
export type FaitsMaturite = Record<(typeof FAITS_OUI_NON)[number], boolean> &
  Record<(typeof FAITS_COMPTES)[number], number>;

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

const estCompte = (valeur: unknown): valeur is number =>
  typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0;

/**
 * Lit les faits tels que la base les rend. Nul s'ils n'ont pas la forme
 * attendue : mieux vaut ne pas afficher de score qu'en afficher un faux.
 */
export function lireFaits(valeur: unknown): FaitsMaturite | null {
  if (!estObjet(valeur)) {
    return null;
  }
  if (
    !FAITS_OUI_NON.every((cle) => typeof valeur[cle] === "boolean") ||
    !FAITS_COMPTES.every((cle) => estCompte(valeur[cle]))
  ) {
    return null;
  }
  return Object.fromEntries(
    [...FAITS_OUI_NON, ...FAITS_COMPTES].map((cle) => [cle, valeur[cle]]),
  ) as FaitsMaturite;
}

/**
 * Lit une version des pondérations. Nul si un critère manque, si un poids
 * n'est pas un entier positif, ou si le total n'est pas 100.
 */
export function lirePonderations(valeur: unknown): { version: number; poids: Ponderations } | null {
  if (!estObjet(valeur) || !estCompte(valeur.version_number) || valeur.version_number < 1) {
    return null;
  }
  if (!ORDRE_CRITERES.every((code) => estCompte(valeur[code]))) {
    return null;
  }
  const poids = Object.fromEntries(
    ORDRE_CRITERES.map((code) => [code, valeur[code]]),
  ) as Ponderations;
  const total = ORDRE_CRITERES.reduce((somme, code) => somme + poids[code], 0);
  return total === 100 ? { version: valeur.version_number, poids } : null;
}

/** Un élément attendu d'un critère, et ce qu'il reste à faire s'il manque. */
type Element = { present: boolean; manque: string };

/**
 * Ce que chaque critère attend. Tous les éléments d'un critère pèsent
 * autant : le critère rapporte la part de ceux qui sont présents.
 */
function elementsDe(faits: FaitsMaturite): Record<CodeCritere, Element[]> {
  return {
    concept: [
      { present: faits.pitch, manque: "Rédiger le pitch" },
      { present: faits.synopsis_court, manque: "Rédiger le synopsis court" },
      { present: faits.theme, manque: "Indiquer le thème" },
      { present: faits.genre, manque: "Choisir un genre" },
    ],
    narrative: [
      { present: faits.synopsis, manque: "Rédiger le synopsis" },
      { present: faits.recits > 0, manque: "Ajouter un traitement ou un scénario" },
      { present: faits.recits_finalises > 0, manque: "Finaliser le traitement ou le scénario" },
    ],
    characters: [
      { present: faits.personnages > 0, manque: "Ajouter au moins un personnage" },
      { present: faits.personnages_principaux > 0, manque: "Désigner un personnage principal" },
      {
        present: faits.personnages > 0 && faits.personnages_decrits >= faits.personnages,
        manque: "Décrire chaque personnage",
      },
    ],
    artistic_vision: [
      { present: faits.vision, manque: "Rédiger la vision artistique" },
      { present: faits.notes_intention > 0, manque: "Ajouter une note d'intention" },
      { present: faits.notes_intention_finalisees > 0, manque: "Finaliser la note d'intention" },
    ],
    feasibility: [
      { present: faits.duree, manque: "Indiquer la durée" },
      { present: faits.pays, manque: "Indiquer les pays de production" },
      { present: faits.langues, manque: "Indiquer les langues" },
      { present: faits.etapes_datees > 0, manque: "Dater au moins une étape du planning" },
    ],
    budget: [
      { present: faits.budget_ouvert, manque: "Ouvrir le budget" },
      { present: faits.lignes_budget > 0, manque: "Ajouter des lignes de budget" },
      { present: faits.postes_budget >= 2, manque: "Couvrir plusieurs postes du budget" },
    ],
    financing: [
      { present: faits.candidatures > 0, manque: "Ajouter une candidature de financement" },
      { present: faits.candidatures_chiffrees > 0, manque: "Indiquer un montant demandé" },
    ],
    market: [
      { present: faits.public, manque: "Décrire le public cible" },
      { present: faits.objectifs, manque: "Indiquer les objectifs du projet" },
    ],
    dossier: [
      { present: faits.documents_finalises > 0, manque: "Finaliser au moins un document" },
      { present: faits.presentations > 0, manque: "Ajouter une biographie ou une lettre" },
    ],
  };
}

export type CritereEvalue = {
  code: CodeCritere;
  libelle: string;
  /** Points obtenus, entiers, de 0 au maximum. */
  points: number;
  /** Poids du critère dans la version des pondérations. */
  maximum: number;
  /** Ce qu'il reste à faire pour ce critère, dans l'ordre. */
  manques: string[];
};

export type Maturite = {
  /** Somme des points des critères : 100 quand rien ne manque. */
  total: number;
  criteres: CritereEvalue[];
};

/**
 * Score d'un projet. Un critère de poids nul n'est pas évalué : il ne
 * rapporte rien, et ne réclame rien.
 */
export function calculerMaturite(faits: FaitsMaturite, poids: Ponderations): Maturite {
  const elements = elementsDe(faits);
  const criteres = ORDRE_CRITERES.filter((code) => poids[code] > 0).map((code): CritereEvalue => {
    const attendus = elements[code];
    const presents = attendus.filter((element) => element.present).length;
    return {
      code,
      libelle: CRITERES[code],
      points: Math.round((poids[code] * presents) / attendus.length),
      maximum: poids[code],
      manques: attendus.filter((element) => !element.present).map((element) => element.manque),
    };
  });

  return { total: criteres.reduce((somme, critere) => somme + critere.points, 0), criteres };
}
