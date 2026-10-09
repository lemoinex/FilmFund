/**
 * Compatibilité d'une opportunité avec un projet (lots L5b et OP2), sans IA.
 *
 * Des règles lisibles, sur ce que le catalogue et le projet portent tous deux
 * dans un champ comparable : le type de projet, le pays, le genre, la durée
 * et le stade d'avancement. Rien d'autre n'est jugé — ni la thématique, ni la
 * langue, ni les exigences, ni le montant, que l'un des deux ne porte pas
 * ainsi.
 *
 * Le résultat est un décompte, pas une note : « 2 critères remplis sur 3 »,
 * avec ce qui n'a pas pu être évalué. C'est une aide à la décision ; il ne
 * dit rien de l'éligibilité réelle, que seule la source établit. Rien n'est
 * stocké : le calcul se refait à chaque affichage.
 *
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 */

/** Critères, dans l'ordre où l'écran les présente. */
export const CRITERES_COMPATIBILITE = {
  format: "Type de projet",
  pays: "Pays",
  genre: "Genre",
  duree: "Durée",
  stade: "Stade d'avancement",
} as const;

export type CodeCritereCompatibilite = keyof typeof CRITERES_COMPATIBILITE;

export const ORDRE_CRITERES_COMPATIBILITE = Object.keys(
  CRITERES_COMPATIBILITE,
) as CodeCritereCompatibilite[];

/**
 * - `rempli` : l'opportunité demande ce que le projet est.
 * - `non_rempli` : elle demande autre chose.
 * - `non_precise` : sa source ne dit rien de ce critère. Ce n'est pas « tous ».
 * - `non_renseigne` : elle le précise, mais le projet ne le dit pas encore.
 */
export type EtatCritere = "rempli" | "non_rempli" | "non_precise" | "non_renseigne";

export const ETATS_CRITERE: Readonly<Record<EtatCritere, string>> = {
  rempli: "Rempli",
  non_rempli: "Non rempli",
  non_precise: "Non précisé par l'opportunité",
  non_renseigne: "Non renseigné dans le projet",
};

/** Ce que l'écran dit, une fois, de ce que le calcul ne regarde pas. */
export const LIMITES_COMPATIBILITE =
  "Ce décompte compare cinq choses que le catalogue et votre projet disent tous deux : le type de projet, le pays, le genre, la durée et le stade d'avancement. Il ne juge ni la thématique, ni la langue, ni les exigences, qui se lisent sur la fiche de l'opportunité. C'est une aide pour trier, pas une garantie d'éligibilité : seule la source fait foi.";

/** Dit à côté du critère « Pays » : ce que la comparaison suppose. */
export const RESERVE_PAYS =
  "La comparaison porte sur les pays de production du projet. Une opportunité peut entendre par « pays éligibles » la nationalité ou la résidence de l'auteur : vérifiez-le sur la source.";

export type ProjetCompare = {
  format: string;
  genre: string | null;
  countries: readonly string[];
  /** Durée prévue, en minutes ; null si la fiche ne la dit pas. */
  duration_minutes: number | null;
  /** Étape actuelle du projet : toujours renseignée. */
  stage: string;
};

export type OpportuniteComparee = {
  formats: readonly string[];
  genres: readonly string[];
  countries: readonly string[];
  stages: readonly string[];
  /** Fourchette de durée admise, en minutes ; une borne nulle n'est pas dite. */
  duration_min_minutes: number | null;
  duration_max_minutes: number | null;
};

/** Durée admise par une opportunité : l'une des deux bornes au moins est dite. */
export type FourchetteDuree = { min: number | null; max: number | null };

export type CritereCompare = {
  code: CodeCritereCompatibilite;
  etat: EtatCritere;
  /** Codes que l'opportunité admet ; vide si elle ne précise rien. */
  admis: string[];
  /** Codes du projet ; vide s'il ne le dit pas. */
  duProjet: string[];
  /** Codes communs : ce qui fait que le critère est rempli. */
  communs: string[];
  /**
   * Durée seulement : la fourchette demandée. Une durée ne se compare pas
   * comme une liste de codes — `admis` reste alors vide, et `duProjet` porte
   * la durée du projet, en minutes.
   */
  fourchette?: FourchetteDuree;
};

export type Compatibilite = {
  criteres: CritereCompare[];
  /** Critères remplis. */
  remplis: number;
  /** Critères que l'opportunité demande et que le projet contredit. */
  nonRemplis: number;
  /** Critères jugés : remplis et non remplis. */
  evalues: number;
  /** Critères restés sans réponse : c'est l'incertitude du décompte. */
  nonEvalues: number;
};

function comparer(
  code: CodeCritereCompatibilite,
  admis: readonly string[],
  duProjet: readonly string[],
): CritereCompare {
  const communs = duProjet.filter((valeur) => admis.includes(valeur));
  const etat: EtatCritere = !admis.length
    ? "non_precise"
    : !duProjet.length
      ? "non_renseigne"
      : communs.length
        ? "rempli"
        : "non_rempli";
  return { code, etat, admis: [...admis], duProjet: [...duProjet], communs };
}

/**
 * La durée du projet tombe-t-elle dans la fourchette demandée ? Les bornes
 * sont comprises : « de 52 à 90 minutes » admet 52 comme 90.
 */
function comparerDuree(fourchette: FourchetteDuree, duree: number | null): CritereCompare {
  const precise = fourchette.min !== null || fourchette.max !== null;
  const dedans =
    duree !== null &&
    (fourchette.min === null || duree >= fourchette.min) &&
    (fourchette.max === null || duree <= fourchette.max);
  const etat: EtatCritere = !precise
    ? "non_precise"
    : duree === null
      ? "non_renseigne"
      : dedans
        ? "rempli"
        : "non_rempli";
  const duProjet = duree === null ? [] : [String(duree)];
  return {
    code: "duree",
    etat,
    admis: [],
    duProjet,
    communs: etat === "rempli" ? [...duProjet] : [],
    ...(precise ? { fourchette: { ...fourchette } } : {}),
  };
}

/**
 * Compare un projet à une opportunité, critère par critère.
 *
 * Pays : un seul pays de production commun suffit — une coproduction se
 * présente au titre de l'un de ses pays. Stade : l'étape actuelle du projet,
 * toujours renseignée — ce critère n'est jamais « non renseigné ».
 */
export function calculerCompatibilite(
  projet: ProjetCompare,
  opportunite: OpportuniteComparee,
): Compatibilite {
  const criteres = [
    comparer("format", opportunite.formats, projet.format ? [projet.format] : []),
    comparer("pays", opportunite.countries, projet.countries),
    comparer("genre", opportunite.genres, projet.genre ? [projet.genre] : []),
    comparerDuree(
      { min: opportunite.duration_min_minutes, max: opportunite.duration_max_minutes },
      projet.duration_minutes,
    ),
    comparer("stade", opportunite.stages, projet.stage ? [projet.stage] : []),
  ];
  const remplis = criteres.filter((critere) => critere.etat === "rempli").length;
  const nonRemplis = criteres.filter((critere) => critere.etat === "non_rempli").length;

  return {
    criteres,
    remplis,
    nonRemplis,
    evalues: remplis + nonRemplis,
    nonEvalues: criteres.length - remplis - nonRemplis,
  };
}

/**
 * Le décompte en une phrase : « 2 critères remplis sur 3 évalués, 1 non
 * évalué. » Aucun pourcentage : cinq critères n'en font pas une mesure.
 */
export function decompteEnClair(compatibilite: Compatibilite): string {
  const { remplis, evalues, nonEvalues } = compatibilite;
  const incertitude =
    nonEvalues === 0
      ? ""
      : nonEvalues === 1
        ? " ; 1 critère non évalué"
        : ` ; ${nonEvalues} critères non évalués`;
  if (evalues === 0) {
    return "Aucun critère n'a pu être évalué.";
  }
  const base =
    remplis <= 1
      ? `${remplis} critère rempli sur ${evalues} évalué${evalues > 1 ? "s" : ""}`
      : `${remplis} critères remplis sur ${evalues} évalués`;
  return `${base}${incertitude}.`;
}

const enMinutes = (nombre: number) => `${nombre} minute${nombre > 1 ? "s" : ""}`;

/** « de 52 à 90 minutes », « au moins 52 minutes », « au plus 90 minutes ». */
function fourchetteEnClair({ min, max }: FourchetteDuree): string {
  if (min !== null && max !== null) {
    return min === max ? enMinutes(min) : `de ${min} à ${enMinutes(max)}`;
  }
  return min !== null ? `au moins ${enMinutes(min)}` : `au plus ${enMinutes(max ?? 0)}`;
}

/**
 * La raison d'un critère, en clair. `nommer` rend le libellé d'un code — un
 * pays, un format, un genre, un stade —, tenu ailleurs ; la durée se dit en
 * minutes, sans lui.
 */
export function raisonCritere(critere: CritereCompare, nommer: (code: string) => string): string {
  if (critere.fourchette) {
    const demande = `Demandé : ${fourchetteEnClair(critere.fourchette)}.`;
    return critere.etat === "non_renseigne"
      ? `${demande} Votre projet ne le dit pas encore : complétez sa fiche.`
      : `${demande} Votre projet : ${enMinutes(Number(critere.duProjet[0]))}.`;
  }
  const liste = (codes: readonly string[]) => codes.map(nommer).join(", ");
  switch (critere.etat) {
    case "rempli":
      return `Demandé : ${liste(critere.admis)}. Votre projet : ${liste(critere.communs)}.`;
    case "non_rempli":
      return `Demandé : ${liste(critere.admis)}. Votre projet : ${liste(critere.duProjet)}.`;
    case "non_renseigne":
      return `Demandé : ${liste(critere.admis)}. Votre projet ne le dit pas encore : complétez sa fiche.`;
    default:
      return "L'opportunité ne le précise pas. Information non fournie.";
  }
}

/**
 * Ordre de présentation : d'abord ce que rien ne contredit, puis ce qui
 * remplit le plus de critères, puis ce qui laisse le moins d'inconnu. L'ordre
 * reçu départage le reste — la liste arrive déjà triée par date limite.
 *
 * Une opportunité que rien ne contredit et que rien ne confirme passe avant
 * une opportunité contredite : l'inconnu se vérifie, le contraire non.
 */
export function classerParCompatibilite<Ligne extends { compatibilite: Compatibilite }>(
  lignes: readonly Ligne[],
): Ligne[] {
  return lignes
    .map((ligne, rang) => ({ ligne, rang }))
    .sort((a, b) => {
      const [x, y] = [a.ligne.compatibilite, b.ligne.compatibilite];
      return (
        x.nonRemplis - y.nonRemplis ||
        y.remplis - x.remplis ||
        x.nonEvalues - y.nonEvalues ||
        a.rang - b.rang
      );
    })
    .map(({ ligne }) => ligne);
}

/**
 * « À étudier » : au moins un critère rempli, aucun contredit. Ce n'est pas
 * « compatible » — cinq critères ne font pas une éligibilité —, c'est ce qui
 * mérite d'être ouvert en premier.
 */
export function estAEtudier(compatibilite: Compatibilite): boolean {
  return compatibilite.remplis > 0 && compatibilite.nonRemplis === 0;
}

/** La règle, dite là où le mot s'affiche. */
export const REGLE_A_ETUDIER =
  "« À étudier » : au moins un critère rempli parmi le type de projet, le pays, le genre, la durée et le stade d'avancement, et aucun contredit par la fiche du projet. Ce n'est pas une garantie d'éligibilité : seule la source fait foi.";
