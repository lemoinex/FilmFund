/**
 * Fiche du projet et personnages : ce que l'assistant de création propose,
 * et ce qu'une saisie doit respecter. Module pur, testable sans pile
 * Supabase.
 *
 * Les bornes reprennent les contraintes de la migration fiche_projet, qui
 * ont le dernier mot ; un test d'architecture vérifie que les genres ne
 * s'écartent pas.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/** Genres, dans l'ordre où l'écran les propose. Mêmes codes qu'en base. */
export const GENRES = {
  drame: "Drame",
  comedie: "Comédie",
  comedie_dramatique: "Comédie dramatique",
  thriller: "Thriller",
  policier: "Policier",
  action: "Action",
  aventure: "Aventure",
  fantastique: "Fantastique",
  science_fiction: "Science-fiction",
  horreur: "Horreur",
  romance: "Romance",
  historique: "Historique",
  biopic: "Biopic",
  guerre: "Guerre",
  musical: "Musical",
  jeunesse: "Jeunesse",
  societe: "Société",
  portrait: "Portrait",
  nature: "Nature",
  autre: "Autre",
} as const;

export type Genre = keyof typeof GENRES;

export const ROLES_PERSONNAGE = {
  principal: "Principal",
  secondaire: "Secondaire",
} as const;

export type RolePersonnage = keyof typeof ROLES_PERSONNAGE;

/** Textes d'une ligne : aucun retour à la ligne. */
const TEXTES_COURTS = { languages: 200, theme: 300 } as const;

/** Textes longs : les retours à la ligne y sont admis. */
const TEXTES_LONGS = {
  short_synopsis: 1500,
  stakes: 5000,
  artistic_vision: 5000,
  goals: 3000,
  audience: 2000,
} as const;

export const LONGUEURS_FICHE = { ...TEXTES_COURTS, ...TEXTES_LONGS } as const;

export const MAX_PAYS = 10;
export const DUREE_MINUTES = { min: 1, max: 1000 } as const;

export const LONGUEURS_PERSONNAGE = { name: 120, description: 2000 } as const;

/** « 95 minutes », « 1 minute » : la durée telle que la fiche l'affiche. */
export function dureeEnClair(minutes: number): string {
  return `${minutes} ${minutes > 1 ? "minutes" : "minute"}`;
}

/**
 * Personnages par projet. Une borne de confort, pas de sécurité : la base ne
 * la tient qu'à l'acceptation d'un personnage proposé par l'assistant, où un
 * test d'architecture la compare à celle-ci.
 */
export const MAX_PERSONNAGES = 50;

const LIBELLES: Record<string, string> = {
  genre: "Le genre",
  countries: "Les pays de production",
  languages: "Les langues",
  duration_minutes: "La durée",
  short_synopsis: "Le synopsis court",
  theme: "Le thème",
  stakes: "Les enjeux",
  artistic_vision: "La vision artistique",
  goals: "Les objectifs",
  audience: "Le public cible",
  name: "Le nom",
  description: "La description",
};

/** Ce que la fiche enregistre, tel que la base l'attend. */
export type Fiche = {
  genre: Genre | null;
  countries: string[];
  languages: string;
  duration_minutes: number | null;
  short_synopsis: string;
  theme: string;
  stakes: string;
  artistic_vision: string;
  goals: string;
  audience: string;
};

export type ChampFiche = keyof Fiche;

export const CHAMPS_FICHE = [
  "genre",
  "countries",
  "languages",
  "duration_minutes",
  "short_synopsis",
  "theme",
  "stakes",
  "artistic_vision",
  "goals",
  "audience",
] as const satisfies readonly ChampFiche[];

type Resultat<T> = { valeur: T } | { erreur: string };

const compter = (texte: string) => [...texte].length;

const trop = (champ: string, max: number) => ({
  erreur: `${LIBELLES[champ]} ne peut pas dépasser ${max} caractères.`,
});

const interdit = (champ: string) => ({
  erreur: `${LIBELLES[champ]} contient des caractères non autorisés.`,
});

/** Texte d'une ligne : espaces repliés, extrémités coupées. */
function texteCourt(valeur: unknown, champ: string, max: number): Resultat<string> {
  if (typeof valeur !== "string") return interdit(champ);
  const texte = valeur.replace(/\s+/g, " ").trim();
  if (/[\u0000-\u001f\u007f-\u009f]/.test(texte)) return interdit(champ);
  return compter(texte) > max ? trop(champ, max) : { valeur: texte };
}

/**
 * Texte long : fins de ligne ramenées à « \n », extrémités coupées. Ni
 * tabulation, ni autre caractère de contrôle qu'un retour à la ligne.
 */
function texteLong(valeur: unknown, champ: string, max: number): Resultat<string> {
  if (typeof valeur !== "string") return interdit(champ);
  const texte = valeur.replace(/\r\n?/g, "\n").trim();
  if (/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(texte)) return interdit(champ);
  return compter(texte) > max ? trop(champ, max) : { valeur: texte };
}

function lireChamp(
  champ: ChampFiche,
  valeur: unknown,
  codesPays: readonly string[],
): Resultat<Fiche[ChampFiche]> {
  switch (champ) {
    case "genre":
      if (valeur === "" || valeur === null) return { valeur: null };
      return typeof valeur === "string" && Object.hasOwn(GENRES, valeur)
        ? { valeur: valeur as Genre }
        : { erreur: "Genre inconnu." };
    case "countries": {
      if (!Array.isArray(valeur) || !valeur.every((code) => typeof code === "string")) {
        return { erreur: "Pays inconnu." };
      }
      // Dans l'ordre de saisie, sans doublon : le premier reste le principal.
      const pays = [...new Set(valeur.filter(Boolean))];
      if (!pays.every((code) => codesPays.includes(code))) return { erreur: "Pays inconnu." };
      return pays.length > MAX_PAYS
        ? { erreur: `${MAX_PAYS} pays de production au plus.` }
        : { valeur: pays };
    }
    case "duration_minutes": {
      if (valeur === "" || valeur === null) return { valeur: null };
      const texte = typeof valeur === "number" ? String(valeur) : valeur;
      if (typeof texte !== "string" || !/^\d{1,4}$/.test(texte.trim())) {
        return { erreur: "La durée s'indique en minutes, par un nombre entier." };
      }
      const minutes = Number(texte.trim());
      return minutes >= DUREE_MINUTES.min && minutes <= DUREE_MINUTES.max
        ? { valeur: minutes }
        : { erreur: `La durée va de ${DUREE_MINUTES.min} à ${DUREE_MINUTES.max} minutes.` };
    }
    case "languages":
    case "theme":
      return texteCourt(valeur, champ, TEXTES_COURTS[champ]);
    default:
      return texteLong(valeur, champ, TEXTES_LONGS[champ]);
  }
}

/**
 * Champs de la fiche, ramenés à ce que la base attend. Seuls les champs
 * demandés sont lus : une étape de l'assistant n'enregistre que les siens.
 * Une erreur au premier champ refusé.
 */
export function normaliserFiche(
  saisie: Readonly<Record<string, unknown>>,
  champs: readonly ChampFiche[],
  codesPays: readonly string[],
): { fiche: Partial<Fiche> } | { erreur: string } {
  const fiche: Partial<Fiche> = {};
  for (const champ of champs) {
    if (!(CHAMPS_FICHE as readonly string[]).includes(champ)) {
      return { erreur: "Champ inconnu." };
    }
    const lu = lireChamp(champ, saisie[champ], codesPays);
    if ("erreur" in lu) return lu;
    (fiche as Record<string, unknown>)[champ] = lu.valeur;
  }
  return { fiche };
}

export type SaisiePersonnage = { name: string; role: RolePersonnage; description: string };

/** Un personnage, ramené à ce que la base attend. */
export function normaliserPersonnage(
  saisie: Readonly<Record<string, unknown>>,
): { personnage: SaisiePersonnage } | { erreur: string } {
  const nom = texteCourt(saisie.name, "name", LONGUEURS_PERSONNAGE.name);
  if ("erreur" in nom) return nom;
  if (!nom.valeur) return { erreur: "Donnez un nom au personnage." };

  const role = saisie.role;
  if (typeof role !== "string" || !Object.hasOwn(ROLES_PERSONNAGE, role)) {
    return { erreur: "Rôle de personnage inconnu." };
  }

  const description = texteLong(
    saisie.description,
    "description",
    LONGUEURS_PERSONNAGE.description,
  );
  if ("erreur" in description) return description;

  return {
    personnage: { name: nom.valeur, role: role as RolePersonnage, description: description.valeur },
  };
}
