/**
 * Statistiques d'usage : ce que l'écran de l'administration range et nomme, à
 * partir des comptages de la base. Module pur, testable sans pile Supabase.
 *
 * Aucun import : ce module est aussi chargé tel quel par les tests Node.
 *
 * Rien n'est calculé au-delà d'une addition : ni taux, ni moyenne, ni
 * tendance. Sur aussi peu de données, un pourcentage ferait croire à une
 * mesure.
 */

const NOMBRE = new Intl.NumberFormat("fr-FR");

/** Ce que l'écran dit de ces chiffres, une fois, en tête. */
export const PRINCIPE_STATISTIQUES =
  "Des comptages, calculés à chaque lecture sur les données réelles : ni nom, ni titre, ni contenu, ni montant. Avec très peu de comptes, un comptage peut désigner quelqu'un — « anonyme » ne veut alors plus dire grand-chose.";

/** Ce que l'IA sait produire, par action de tâche, nommé comme à l'écran. */
export const LIBELLES_ACTION: Readonly<Record<string, string>> = {
  logline: "Pitch",
  synopsis_short: "Synopsis court",
  synopsis_standard: "Synopsis",
  synopsis_detailed: "Synopsis détaillé",
  intention_note: "Note d'intention",
  direction_note: "Note de réalisation",
  pitch_extended: "Pitch développé",
  pitch_oral: "Pitch oral",
  dramatic_analysis: "Analyse dramaturgique",
  character_list: "Personnages",
  episode_list: "Épisodes",
  treatment: "Traitement",
  bible: "Bible",
  screenplay: "Séquence de scénario",
  dialogue: "Dialogues d'une scène",
  text_improve: "Retouche : améliorer",
  text_shorten: "Retouche : raccourcir",
  text_expand: "Retouche : développer",
  text_correct: "Retouche : corriger",
  budget_plan: "Lignes de budget",
  schedule_plan: "Jalons de planning",
  shot_list: "Découpage d'une scène",
  gear_list: "Liste de matériel",
  storyboard_image: "Vignette de storyboard",
  research: "Recherche documentaire",
  cultural_context: "Contexte historique et culturel",
  opportunity_watch: "Veille des opportunités",
  pdf_export: "Export PDF",
  docx_export: "Export Word",
  zip_export: "Export ZIP",
};

/** États d'une demande, dans l'ordre où l'écran les présente. */
export const ETATS_DEMANDE: Readonly<Record<string, string>> = {
  succeeded: "Réussies",
  failed: "Échouées",
  cancelled: "Annulées",
  queued: "En attente",
  running: "En cours",
  awaiting_reconciliation: "À rapprocher",
};

/** États d'une proposition, dans l'ordre où l'écran les présente. */
export const ETATS_PROPOSITION: Readonly<Record<string, string>> = {
  accepted: "Acceptées",
  dismissed: "Écartées",
  proposed: "À décider",
};

/** Ce que les projets contiennent, compté sans rien en lire. */
export const LIBELLES_CONTENU: Readonly<Record<string, string>> = {
  personnages: "Personnages",
  scenes: "Scènes de storyboard",
  plans: "Plans de découpage",
  equipements: "Équipements",
  candidatures: "Candidatures de financement",
  membres_equipe: "Membres d'équipe",
};

export type Comptage = { domaine: string; cle: string; detail: string | null; nombre: number };

/** Une clé, son total, et ce total réparti par détail. */
export type Croisement = { cle: string; total: number; details: Readonly<Record<string, number>> };

/**
 * Ramène les lignes de la base à des comptages. Une ligne sans domaine, sans
 * clé ou au nombre illisible est écartée plutôt que devinée.
 */
export function lireComptages(brut: unknown): Comptage[] {
  if (!Array.isArray(brut)) {
    return [];
  }
  const comptages: Comptage[] = [];
  for (const ligne of brut as Record<string, unknown>[]) {
    const nombre = Number(ligne?.nombre);
    if (
      typeof ligne?.domaine !== "string" ||
      typeof ligne.cle !== "string" ||
      !Number.isInteger(nombre) ||
      nombre < 0
    ) {
      continue;
    }
    comptages.push({
      domaine: ligne.domaine,
      cle: ligne.cle,
      detail: typeof ligne.detail === "string" ? ligne.detail : null,
      nombre,
    });
  }
  return comptages;
}

/** Le nombre d'une clé dans un domaine ; zéro si la base n'en dit rien. */
export function nombreDe(comptages: readonly Comptage[], domaine: string, cle: string): number {
  let total = 0;
  for (const comptage of comptages) {
    if (comptage.domaine === domaine && comptage.cle === cle) {
      total += comptage.nombre;
    }
  }
  return total;
}

/**
 * Un domaine, clé par clé, du plus nombreux au moins nombreux ; à égalité,
 * par ordre alphabétique, pour que l'écran ne bouge pas d'une lecture à
 * l'autre.
 */
export function croiser(comptages: readonly Comptage[], domaine: string): Croisement[] {
  const parCle = new Map<string, { total: number; details: Record<string, number> }>();
  for (const comptage of comptages) {
    if (comptage.domaine !== domaine) {
      continue;
    }
    const entree = parCle.get(comptage.cle) ?? { total: 0, details: {} };
    entree.total += comptage.nombre;
    if (comptage.detail !== null) {
      entree.details[comptage.detail] = (entree.details[comptage.detail] ?? 0) + comptage.nombre;
    }
    parCle.set(comptage.cle, entree);
  }
  return [...parCle]
    .map(([cle, entree]) => ({ cle, ...entree }))
    .sort((a, b) => b.total - a.total || a.cle.localeCompare(b.cle, "fr"));
}

/** Le total d'un domaine. */
export function totalDe(comptages: readonly Comptage[], domaine: string): number {
  return croiser(comptages, domaine).reduce((total, entree) => total + entree.total, 0);
}

/** Le libellé d'un code, ou le code lui-même : un code inconnu reste visible. */
export function libelle(table: Readonly<Record<string, string>>, code: string): string {
  return Object.hasOwn(table, code) ? table[code] : code;
}

/** « 1 500 » : un nombre à la française. */
export function enNombre(nombre: number): string {
  return NOMBRE.format(nombre);
}
