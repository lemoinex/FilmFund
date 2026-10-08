/**
 * Coûts de l'IA : ce que l'écran de l'administration regroupe et met en mots,
 * à partir de la lecture agrégée de la base. Module pur, testable sans pile
 * Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 *
 * Les montants s'additionnent en micro-dollars entiers, l'unité des
 * registres : additionner des flottants finit par afficher un centime de
 * trop.
 */

const NOMBRE = new Intl.NumberFormat("fr-FR");
const MONTANT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const MOIS = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });

/** Les onze agents de la V1 : le préfixe d'un profil nomme le sien. */
const AGENTS = [
  "weaver",
  "script",
  "voice",
  "scout",
  "griot",
  "arc",
  "frame",
  "gear",
  "board",
  "field",
  "match",
] as const;

/** Ligne de la base, ramenée à des nombres : un mois, un profil, un modèle. */
export type LigneCout = {
  mois: string;
  fournisseur: string;
  profil: string;
  /** Null pour une recherche : facturée à la requête, sans modèle. */
  modele: string | null;
  appels: number;
  nonSoldes: number;
  aRapprocher: number;
  sansCout: number;
  replis: number;
  jetonsEntree: number;
  jetonsSortie: number;
  requetes: number;
  /** Micro-dollars comptés au plafond : le coût confirmé, la réserve sinon. */
  compte: number;
  /** Part de `compte` qui n'est qu'une réserve : issue inconnue, ou tarif inconnu. */
  dontReserve: number;
};

export type Totaux = Pick<
  LigneCout,
  "appels" | "nonSoldes" | "aRapprocher" | "sansCout" | "replis" | "compte" | "dontReserve"
>;

export type CoutsAgent = Totaux & { agent: string; lignes: LigneCout[] };
export type CoutsMois = Totaux & { mois: string; agents: CoutsAgent[] };

const enMicros = (dollars: unknown) => Math.round(Number(dollars) * 1_000_000);
const entier = (valeur: unknown) => Math.trunc(Number(valeur)) || 0;

/** « WEAVER », d'après « weaver.logline@1 » ; « Autre » si le préfixe n'est pas un agent. */
export function agentDe(profil: string): string {
  const prefixe = profil.split(".")[0] ?? "";
  return (AGENTS as readonly string[]).includes(prefixe) ? prefixe.toUpperCase() : "Autre";
}

/**
 * Ramène les lignes de la base à des nombres. Une ligne sans mois ni profil
 * lisibles est écartée plutôt que devinée.
 */
export function lireLignes(brut: unknown): LigneCout[] {
  if (!Array.isArray(brut)) {
    return [];
  }
  const lignes: LigneCout[] = [];
  for (const ligne of brut as Record<string, unknown>[]) {
    if (
      typeof ligne?.mois !== "string" ||
      !/^\d{4}-\d{2}-01$/.test(ligne.mois) ||
      typeof ligne.profil !== "string" ||
      typeof ligne.fournisseur !== "string"
    ) {
      continue;
    }
    lignes.push({
      mois: ligne.mois,
      fournisseur: ligne.fournisseur,
      profil: ligne.profil,
      modele: typeof ligne.modele === "string" ? ligne.modele : null,
      appels: entier(ligne.appels),
      nonSoldes: entier(ligne.non_soldes),
      aRapprocher: entier(ligne.a_rapprocher),
      sansCout: entier(ligne.sans_cout),
      replis: entier(ligne.replis),
      jetonsEntree: entier(ligne.jetons_entree),
      jetonsSortie: entier(ligne.jetons_sortie),
      requetes: entier(ligne.requetes),
      compte: enMicros(ligne.compte),
      dontReserve: enMicros(ligne.dont_reserve),
    });
  }
  return lignes;
}

function totaliser(lignes: readonly Totaux[]): Totaux {
  const total: Totaux = {
    appels: 0,
    nonSoldes: 0,
    aRapprocher: 0,
    sansCout: 0,
    replis: 0,
    compte: 0,
    dontReserve: 0,
  };
  for (const ligne of lignes) {
    total.appels += ligne.appels;
    total.nonSoldes += ligne.nonSoldes;
    total.aRapprocher += ligne.aRapprocher;
    total.sansCout += ligne.sansCout;
    total.replis += ligne.replis;
    total.compte += ligne.compte;
    total.dontReserve += ligne.dontReserve;
  }
  return total;
}

const parCout = (a: { compte: number }, b: { compte: number }) => b.compte - a.compte;

/**
 * Regroupe par mois, puis par agent : les mois du plus récent au plus ancien,
 * les agents et leurs lignes du plus coûteux au moins coûteux.
 */
export function regrouper(lignes: readonly LigneCout[]): CoutsMois[] {
  const mois = new Map<string, Map<string, LigneCout[]>>();
  for (const ligne of lignes) {
    const agents = mois.get(ligne.mois) ?? new Map<string, LigneCout[]>();
    const agent = agentDe(ligne.profil);
    agents.set(agent, [...(agents.get(agent) ?? []), ligne]);
    mois.set(ligne.mois, agents);
  }

  return [...mois]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([cle, agents]) => {
      const parAgent = [...agents]
        .map(([agent, siennes]) => ({
          agent,
          ...totaliser(siennes),
          lignes: [...siennes].sort(parCout),
        }))
        .sort(parCout);
      return { mois: cle, ...totaliser(parAgent), agents: parAgent };
    });
}

/** Premier jour, en UTC, du mois de cette date : la clé d'un mois de la base. */
export function moisCourant(maintenant: Date): string {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** « octobre 2026 », d'après « 2026-10-01 ». */
export function moisEnClair(mois: string): string {
  return MOIS.format(new Date(`${mois}T00:00:00Z`));
}

/**
 * Montant en dollars, à deux décimales. Un montant non nul que l'arrondi
 * ramènerait à zéro est dit « moins de 0,01 $ » : zéro voudrait dire gratuit.
 */
export function enDollars(micros: number): string {
  if (micros > 0 && micros < 5_000) {
    return `moins de ${MONTANT.format(0.01)} $`;
  }
  return `${MONTANT.format(micros / 1_000_000)} $`;
}

/** « 1 500 » : un nombre à la française. */
export function enNombre(nombre: number): string {
  return NOMBRE.format(nombre);
}

/** « 1 appel », « 12 appels ». */
export function nombreAppels(nombre: number): string {
  return `${enNombre(nombre)} ${nombre > 1 ? "appels" : "appel"}`;
}

/**
 * Ce qu'une ligne a consommé, dans l'unité de son fournisseur : des jetons
 * pour un modèle, des requêtes pour une recherche.
 */
export function volumeDe(ligne: LigneCout): string {
  if (ligne.modele === null) {
    return `${enNombre(ligne.requetes)} ${ligne.requetes > 1 ? "requêtes" : "requête"}`;
  }
  return `${enNombre(ligne.jetonsEntree)} jetons lus, ${enNombre(ligne.jetonsSortie)} écrits`;
}

/**
 * Ce qui empêche de lire un montant comme un coût acquis, en clair. Vide
 * quand tous les appels sont soldés à un montant connu.
 */
export function reserves(totaux: Totaux): string[] {
  const notes: string[] = [];
  if (totaux.nonSoldes > 0) {
    notes.push(
      `${nombreAppels(totaux.nonSoldes)} sans issue connue, ${totaux.nonSoldes > 1 ? "comptés" : "compté"} à ${totaux.nonSoldes > 1 ? "leur" : "sa"} réserve`,
    );
  }
  if (totaux.aRapprocher > 0) {
    notes.push(`${nombreAppels(totaux.aRapprocher)} au tarif inconnu, à rapprocher de la facture`);
  }
  if (totaux.replis > 0) {
    notes.push(
      `${nombreAppels(totaux.replis)} ${totaux.replis > 1 ? "servis" : "servi"} par un modèle de repli`,
    );
  }
  if (totaux.sansCout > 0) {
    notes.push(
      `${nombreAppels(totaux.sansCout)} ${totaux.sansCout > 1 ? "refusés" : "refusé"} par le fournisseur, sans coût`,
    );
  }
  return notes;
}
