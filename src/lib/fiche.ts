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

/**
 * Fiche détaillée d'un personnage (lot PF1) : huit champs facultatifs, à côté
 * de la description. Les bornes sont celles de la base ; l'âge et
 * l'occupation tiennent sur une ligne, les autres admettent des retours à la
 * ligne. L'ordre est celui de l'écran, et celui où un agent les lit.
 */
export const CHAMPS_FICHE_PERSONNAGE = [
  { cle: "age", libelle: "Âge", max: 60, ligne: true, aide: "« La quarantaine », « 17 ans »." },
  {
    cle: "occupation",
    libelle: "Occupation",
    max: 160,
    ligne: true,
    aide: "Son métier, son statut, sa place parmi les siens.",
  },
  {
    cle: "appearance",
    libelle: "Apparence physique",
    max: 600,
    ligne: false,
    aide: "Ce qu'on voit de lui à l'image.",
  },
  { cle: "goal", libelle: "Objectif", max: 600, ligne: false, aide: "Ce qu'il veut." },
  {
    cle: "obstacle",
    libelle: "Obstacle",
    max: 600,
    ligne: false,
    aide: "Ce qui s'y oppose, en lui ou hors de lui.",
  },
  { cle: "arc", libelle: "Arc", max: 800, ligne: false, aide: "D'où il part, où il arrive." },
  {
    cle: "traits",
    libelle: "Traits",
    max: 600,
    ligne: false,
    aide: "Son caractère, sa manière d'être et de parler.",
  },
  {
    cle: "relations",
    libelle: "Liens",
    max: 600,
    ligne: false,
    aide: "Ce qui le lie aux autres personnages.",
  },
] as const;

export type ChampFichePersonnage = (typeof CHAMPS_FICHE_PERSONNAGE)[number]["cle"];

export type FichePersonnage = Record<ChampFichePersonnage, string>;

/**
 * Dit avant la saisie, pour un documentaire : la fiche décrit une personne
 * réelle, et ce qui s'y écrit part chez l'assistant avec le reste du dossier.
 */
export const AVERTISSEMENT_PERSONNE_REELLE =
  "Dans un documentaire, un personnage est une personne réelle. Ce que vous écrivez ici d'elle est transmis à l'assistant avec le reste du dossier, à chaque demande : n'y mettez que ce qu'elle a accepté de voir écrit.";

/**
 * La fiche détaillée d'un personnage, ramenée à ce que la base attend. Un
 * champ absent de la saisie vaut vide : le formulaire les porte tous.
 */
export function normaliserFichePersonnage(
  saisie: Readonly<Record<string, unknown>>,
): { fiche: FichePersonnage } | { erreur: string } {
  const fiche = {} as FichePersonnage;
  for (const { cle, libelle, max, ligne } of CHAMPS_FICHE_PERSONNAGE) {
    const valeur = saisie[cle] ?? "";
    if (typeof valeur !== "string") {
      return { erreur: `${libelle} : valeur non autorisée.` };
    }
    const texte = ligne
      ? valeur.replace(/\s+/g, " ").trim()
      : valeur.replace(/\r\n?/g, "\n").trim();
    // Une ligne : aucun caractère de contrôle. Un texte long : le seul retour à la ligne.
    const interdits = ligne
      ? /[\u0000-\u001f\u007f-\u009f]/
      : /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/;
    if (interdits.test(texte)) {
      return { erreur: `${libelle} contient des caractères non autorisés.` };
    }
    if (compter(texte) > max) {
      return { erreur: `${libelle} ne peut pas dépasser ${max} caractères.` };
    }
    fiche[cle] = texte;
  }
  return { fiche };
}

/** Les champs remplis d'une fiche détaillée, dans l'ordre de l'écran. */
export function fichePersonnageRemplie(
  personnage: Readonly<Partial<Record<ChampFichePersonnage, string | null>>>,
): { cle: ChampFichePersonnage; libelle: string; valeur: string }[] {
  return CHAMPS_FICHE_PERSONNAGE.flatMap(({ cle, libelle }) => {
    const valeur = personnage[cle]?.trim();
    return valeur ? [{ cle, libelle, valeur }] : [];
  });
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
