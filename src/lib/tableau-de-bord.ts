/**
 * Tableau de bord (lot T1) : les chiffres et les échéances qu'il annonce.
 *
 * Chaque chiffre est compté sur des données réelles, lues sous la RLS de
 * l'utilisateur ; rien n'est stocké ni estimé. Module pur, sans import : il
 * est aussi chargé tel quel par les tests Node.
 */

/** Projets comptés et parcourus : au-delà, la page le dit. Comme le score de maturité. */
export const LIMITE_PROJETS_COMPTES = 100;

/** Projets présentés : celui mis en avant, et les autres récents. */
export const PROJETS_PRESENTES = 5;

/** Opportunités montrées sur le tableau de bord : un aperçu, l'onglet a la liste. */
export const OPPORTUNITES_PRESENTEES = 3;

/** Échéances listées, et horizon du chiffre « dans les 30 jours ». */
export const ECHEANCES_PRESENTEES = 5;
export const HORIZON_ECHEANCES_JOURS = 30;

/** Lignes lues par nature d'échéance : bien plus qu'il n'en faut pour cinq lignes. */
export const LIMITE_LECTURE_ECHEANCES = 100;

/** Natures d'échéance, dans l'ordre qui départage deux échéances du même jour. */
export const NATURES_ECHEANCE = {
  etape: "Étape du planning",
  candidature: "Candidature de financement",
  opportunite: "Date limite d'une opportunité",
} as const;

export type NatureEcheance = keyof typeof NATURES_ECHEANCE;

export type Echeance = {
  nature: NatureEcheance;
  /** AAAA-MM-JJ. */
  jour: string;
  titre: string;
  /** Le projet, ou l'organisme d'une opportunité. */
  contexte: string;
  href: string;
};

const ORDRE_NATURES = Object.keys(NATURES_ECHEANCE) as NatureEcheance[];

/** Le jour situé `jours` après `aujourdhui`, AAAA-MM-JJ, en UTC. */
export function jourApres(aujourdhui: string, jours: number): string {
  const date = new Date(`${aujourdhui}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + jours);
  return date.toISOString().slice(0, 10);
}

/**
 * Les échéances à venir, la plus proche d'abord. Une échéance passée n'en
 * est plus une : le planning dit déjà ce qui est en retard.
 */
export function echeancesAVenir(echeances: readonly Echeance[], aujourdhui: string): Echeance[] {
  return echeances
    .filter((echeance) => /^\d{4}-\d{2}-\d{2}$/.test(echeance.jour) && echeance.jour >= aujourdhui)
    .map((echeance, rang) => ({ echeance, rang }))
    .sort(
      (a, b) =>
        a.echeance.jour.localeCompare(b.echeance.jour) ||
        ORDRE_NATURES.indexOf(a.echeance.nature) - ORDRE_NATURES.indexOf(b.echeance.nature) ||
        a.rang - b.rang,
    )
    .map(({ echeance }) => echeance);
}

/** Nombre d'échéances d'ici `jours` jours, le dernier jour compris. */
export function compterDansHorizon(
  echeances: readonly Echeance[],
  aujourdhui: string,
  jours: number = HORIZON_ECHEANCES_JOURS,
): number {
  const limite = jourApres(aujourdhui, jours);
  return echeancesAVenir(echeances, aujourdhui).filter((echeance) => echeance.jour <= limite)
    .length;
}

/** « 100 et plus » quand la borne est atteinte : le compte exact n'a pas été lu. */
export function nombreBorne(nombre: number, borne: number): string {
  return nombre >= borne ? `${borne} et plus` : String(nombre);
}
