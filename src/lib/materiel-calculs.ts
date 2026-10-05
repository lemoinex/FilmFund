/**
 * Besoin électrique d'un tournage, d'après le matériel saisi.
 *
 * Les calculs sont faits ici, par la plateforme, jamais par un modèle : trois
 * opérations, dont l'écran affiche les formules. Rien n'est une norme — ni la
 * tension par défaut, ni la marge —, et l'écran le dit.
 *
 * Module pur, sans import : il est chargé tel quel par les tests Node.
 */

export type EquipementCalcule = {
  quantity: number;
  /** En watts ; nulle quand la puissance n'est pas renseignée. */
  unit_power_watts: number | null;
  simultaneous: boolean;
};

export type ReglagesElectriques = {
  /** En volts, en monophasé. */
  tension: number;
  /** Marge du groupe électrogène, en pour cent. */
  marge: number;
};

export type BesoinElectrique = {
  /** Somme de toutes les puissances renseignées, en watts. */
  installee: number;
  /** Part qui tourne en même temps, en watts. */
  simultanee: number;
  /** Intensité de la charge simultanée sous la tension du projet, en ampères. */
  intensite: number;
  /** Puissance de groupe électrogène conseillée, marge comprise, en watts. */
  groupe: number;
  /** Équipements dont la puissance n'est pas renseignée : absents du calcul. */
  sansPuissance: number;
};

/** Puissance d'une ligne : quantité × puissance unitaire ; nulle si inconnue. */
export function puissanceLigne(equipement: EquipementCalcule): number | null {
  return equipement.unit_power_watts === null
    ? null
    : equipement.quantity * equipement.unit_power_watts;
}

/**
 * Charge simultanée, intensité et groupe conseillé.
 *
 *   charge simultanée = somme des quantités × puissances des équipements
 *                       marqués « en même temps que les autres »
 *   intensité         = charge simultanée ÷ tension
 *   groupe conseillé  = charge simultanée × (1 + marge ÷ 100)
 *
 * L'intensité suppose une alimentation monophasée et ne tient compte d'aucun
 * facteur de puissance : c'est un ordre de grandeur.
 */
export function besoinElectrique(
  equipements: readonly EquipementCalcule[],
  { tension, marge }: ReglagesElectriques,
): BesoinElectrique {
  let installee = 0;
  let simultanee = 0;
  let sansPuissance = 0;

  for (const equipement of equipements) {
    const puissance = puissanceLigne(equipement);
    if (puissance === null) {
      sansPuissance += 1;
      continue;
    }
    installee += puissance;
    if (equipement.simultaneous) {
      simultanee += puissance;
    }
  }

  return {
    installee,
    simultanee,
    intensite: tension > 0 ? simultanee / tension : 0,
    groupe: simultanee * (1 + marge / 100),
    sansPuissance,
  };
}

const ENTIER = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « 650 W » en dessous du kilowatt, « 2,6 kW » au-delà. */
export function formaterPuissance(watts: number): string {
  return watts < 1000 ? `${ENTIER.format(watts)} W` : `${DECIMAL.format(watts / 1000)} kW`;
}

/** « 11,3 A ». */
export function formaterIntensite(amperes: number): string {
  return `${DECIMAL.format(amperes)} A`;
}

/**
 * Entier saisi dans un champ facultatif.
 *
 * Vide : `null`. Autre chose qu'un entier positif écrit en chiffres, ou hors
 * bornes : `"invalide"` — « 12,5 » et « 1e3 » ne sont pas arrondis en silence.
 */
export function lireEntier(
  saisie: string,
  { min, max }: { min: number; max: number },
): number | null | "invalide" {
  const texte = saisie.trim();
  if (!texte) {
    return null;
  }
  if (!/^\d{1,9}$/.test(texte)) {
    return "invalide";
  }
  const valeur = Number(texte);
  return valeur >= min && valeur <= max ? valeur : "invalide";
}
