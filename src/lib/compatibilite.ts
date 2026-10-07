/**
 * Compatibilité d'une opportunité avec un projet (lot L5b), sans IA.
 *
 * Des règles lisibles, sur ce que le catalogue et le projet portent tous deux
 * dans un champ comparable : le type de projet, le pays et le genre. Rien
 * d'autre n'est jugé — ni la durée, ni le stade, ni la thématique, ni la
 * langue, ni les exigences, que le catalogue ne porte pas ainsi.
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
  "Ce décompte compare trois choses que le catalogue et votre projet disent tous deux : le type de projet, le pays et le genre. Il ne juge ni la durée, ni le stade d'avancement, ni la thématique, ni la langue, ni les exigences, qui se lisent sur la fiche de l'opportunité. C'est une aide pour trier, pas une garantie d'éligibilité : seule la source fait foi.";

/** Dit à côté du critère « Pays » : ce que la comparaison suppose. */
export const RESERVE_PAYS =
  "La comparaison porte sur les pays de production du projet. Une opportunité peut entendre par « pays éligibles » la nationalité ou la résidence de l'auteur : vérifiez-le sur la source.";

export type ProjetCompare = {
  format: string;
  genre: string | null;
  countries: readonly string[];
};

export type OpportuniteComparee = {
  formats: readonly string[];
  genres: readonly string[];
  countries: readonly string[];
};

export type CritereCompare = {
  code: CodeCritereCompatibilite;
  etat: EtatCritere;
  /** Codes que l'opportunité admet ; vide si elle ne précise rien. */
  admis: string[];
  /** Codes du projet ; vide s'il ne le dit pas. */
  duProjet: string[];
  /** Codes communs : ce qui fait que le critère est rempli. */
  communs: string[];
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
 * Compare un projet à une opportunité, critère par critère.
 *
 * Pays : un seul pays de production commun suffit — une coproduction se
 * présente au titre de l'un de ses pays.
 */
export function calculerCompatibilite(
  projet: ProjetCompare,
  opportunite: OpportuniteComparee,
): Compatibilite {
  const criteres = [
    comparer("format", opportunite.formats, projet.format ? [projet.format] : []),
    comparer("pays", opportunite.countries, projet.countries),
    comparer("genre", opportunite.genres, projet.genre ? [projet.genre] : []),
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
 * évalué. » Aucun pourcentage : trois critères n'en font pas une mesure.
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

/**
 * La raison d'un critère, en clair. `nommer` rend le libellé d'un code — un
 * pays, un format, un genre —, tenu ailleurs.
 */
export function raisonCritere(critere: CritereCompare, nommer: (code: string) => string): string {
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
