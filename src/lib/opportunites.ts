/**
 * Catalogue des opportunités de financement : ce que l'écran propose, lit et
 * annonce.
 *
 * Module pur, sans pile Supabase : libellés, bornes, lecture d'un formulaire
 * et statut présenté. Les mêmes bornes sont en base — ici pour répondre tout
 * de suite, là parce que l'écran n'est pas le seul chemin possible.
 *
 * Aucun import : ce module est aussi chargé tel quel par les tests Node. Les
 * formats et les genres d'un projet, tenus ailleurs, lui sont donc passés.
 */

/** Catégories, dans l'ordre où l'écran les propose. Mêmes codes qu'en base. */
export const CATEGORIES_OPPORTUNITE = {
  fonds: "Fonds",
  subvention: "Subvention",
  residence: "Résidence",
  festival: "Festival",
  laboratoire: "Laboratoire",
  atelier: "Atelier",
  coproduction: "Coproduction",
  bourse: "Bourse",
  forum_pitch: "Forum de pitch",
} as const;

export type CategorieOpportunite = keyof typeof CATEGORIES_OPPORTUNITE;

/**
 * Les cinq statuts du dépôt. Seuls « vérifiée » et « expirée » se lisent des
 * comptes ; une démonstration ne se lit que de l'administration.
 */
export const STATUTS_OPPORTUNITE = {
  non_verifie: "Non vérifiée",
  verifie: "Vérifiée",
  expire: "Expirée",
  introuvable: "Introuvable",
  demo: "Démonstration",
} as const;

export type StatutOpportunite = keyof typeof STATUTS_OPPORTUNITE;

/** Ce que chaque statut engage, dit à l'administrateur qui le choisit. */
export const AIDES_STATUT: Readonly<Record<StatutOpportunite, string>> = {
  non_verifie: "Saisie, pas encore confrontée à sa source. Invisible des comptes.",
  verifie:
    "Confrontée à sa source ce jour-là : exige l'adresse de la source, la date de collecte et l'extrait. Visible des comptes.",
  expire: "Vérifiée, puis close. Visible des comptes, présentée comme expirée.",
  introuvable: "La source ne répond plus ou ne dit plus cela. Invisible des comptes.",
  demo: "Exemple fictif. Jamais montré aux comptes : il ne doit pas passer pour réel.",
};

export const LONGUEURS_OPPORTUNITE = {
  name: 200,
  organization: 200,
  description: 5000,
  requirements: 5000,
  source_excerpt: 2000,
  adresse: 2000,
} as const;

export const MAX_PAYS_OPPORTUNITE = 60;
/** Montant le plus grand que la base range : douze chiffres avant la virgule. */
export const MONTANT_MAX = 999_999_999_999;

export type ValeursOpportunite = {
  name: string;
  organization: string;
  category: CategorieOpportunite;
  description: string;
  website: string | null;
  application_url: string | null;
  countries: string[];
  /** Codes des formats et des genres d'un projet, contrôlés contre leurs référentiels. */
  formats: string[];
  genres: string[];
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  opens_on: string | null;
  deadline: string | null;
  requirements: string;
  source_url: string | null;
  collected_on: string | null;
  source_excerpt: string;
  status: StatutOpportunite;
};

const texte = (valeur: unknown) => (typeof valeur === "string" ? valeur : "");

/** Une ligne : espaces resserrés, aucun caractère de contrôle. Null si elle en porte. */
function ligne(valeur: unknown): string | null {
  const net = texte(valeur).replace(/\s+/g, " ").trim();
  return /[\u0000-\u001f\u007f]/.test(net) ? null : net;
}

/** Un texte long : fins de ligne unifiées, aucun autre caractère de contrôle. */
function paragraphe(valeur: unknown): string | null {
  const net = texte(valeur).replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(net) ? null : net;
}

/** Une adresse HTTPS, ou null si le champ est vide ; « invalide » sinon. */
function adresse(valeur: unknown): string | null | "invalide" {
  const brute = texte(valeur).trim();
  if (!brute) {
    return null;
  }
  if (brute.length > LONGUEURS_OPPORTUNITE.adresse || /[\s\u0000-\u001f\u007f]/.test(brute)) {
    return "invalide";
  }
  try {
    const lue = new URL(brute);
    return lue.protocol === "https:" && lue.hostname.includes(".") && !lue.username && !lue.password
      ? brute
      : "invalide";
  } catch {
    return "invalide";
  }
}

/** Une date AAAA-MM-JJ du calendrier, ou null si le champ est vide ; « invalide » sinon. */
function jour(valeur: unknown): string | null | "invalide" {
  const brute = texte(valeur).trim();
  if (!brute) {
    return null;
  }
  const trouve = /^(\d{4})-(\d{2})-(\d{2})$/.exec(brute);
  if (!trouve) {
    return "invalide";
  }
  const [annee, mois, quantieme] = trouve.slice(1).map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, quantieme));
  return date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === quantieme
    ? brute
    : "invalide";
}

/** Un montant entier positif, espaces de groupement admis ; null si vide. */
function montant(valeur: unknown): number | null | "invalide" {
  const brut = texte(valeur).replace(/[\s  ]/g, "");
  if (!brut) {
    return null;
  }
  if (!/^\d+$/.test(brut)) {
    return "invalide";
  }
  const nombre = Number(brut);
  return nombre <= MONTANT_MAX ? nombre : "invalide";
}

/** « CM, ga ; CG » → ["CM", "GA", "CG"], sans doublon ; null si un code n'en est pas un. */
export function lirePays(valeur: unknown): string[] | null {
  const codes = texte(valeur)
    .split(/[\s,;]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
  if (codes.some((code) => !/^[A-Z]{2}$/.test(code))) {
    return null;
  }
  const uniques = [...new Set(codes)];
  return uniques.length <= MAX_PAYS_OPPORTUNITE ? uniques : null;
}

/** Les valeurs cochées d'une liste fermée, dans l'ordre du référentiel ; null si l'une n'en est pas. */
function choix<Cle extends string>(
  valeurs: readonly unknown[],
  referentiel: Readonly<Record<Cle, string>>,
): Cle[] | null {
  if (valeurs.some((valeur) => typeof valeur !== "string" || !Object.hasOwn(referentiel, valeur))) {
    return null;
  }
  return (Object.keys(referentiel) as Cle[]).filter((cle) => valeurs.includes(cle));
}

/**
 * Lit et valide le formulaire d'une opportunité. `aujourdhui` est le jour
 * courant, AAAA-MM-JJ : une collecte ne peut pas être dans l'avenir.
 *
 * La règle qui compte : « vérifiée » exige la source, la date de collecte et
 * l'extrait. On ne dit pas d'une opportunité qu'elle est vérifiée sans dire
 * contre quoi.
 */
export function lireOpportunite(
  lire: (champ: string) => unknown,
  lireTous: (champ: string) => readonly unknown[],
  aujourdhui: string,
  referentiels: {
    formats: Readonly<Record<string, string>>;
    genres: Readonly<Record<string, string>>;
  },
): { valeurs: ValeursOpportunite } | { erreur: string } {
  const name = ligne(lire("name"));
  if (!name || name.length > LONGUEURS_OPPORTUNITE.name) {
    return {
      erreur: `Donnez un nom à l'opportunité, sur une ligne de ${LONGUEURS_OPPORTUNITE.name} caractères au plus.`,
    };
  }
  const organization = ligne(lire("organization"));
  if (!organization || organization.length > LONGUEURS_OPPORTUNITE.organization) {
    return {
      erreur: `Nommez l'organisme, sur une ligne de ${LONGUEURS_OPPORTUNITE.organization} caractères au plus.`,
    };
  }
  const category = texte(lire("category"));
  if (!Object.hasOwn(CATEGORIES_OPPORTUNITE, category)) {
    return { erreur: "Catégorie inconnue." };
  }
  const status = texte(lire("status"));
  if (!Object.hasOwn(STATUTS_OPPORTUNITE, status)) {
    return { erreur: "Statut inconnu." };
  }

  const longs = {
    description: paragraphe(lire("description")),
    requirements: paragraphe(lire("requirements")),
    source_excerpt: paragraphe(lire("source_excerpt")),
  };
  const libelles = {
    description: "La description",
    requirements: "Les exigences",
    source_excerpt: "L'extrait de la source",
  } as const;
  for (const champ of ["description", "requirements", "source_excerpt"] as const) {
    const valeur = longs[champ];
    if (valeur === null || valeur.length > LONGUEURS_OPPORTUNITE[champ]) {
      return {
        erreur: `${libelles[champ]} : ${LONGUEURS_OPPORTUNITE[champ]} caractères au plus, sans caractère de contrôle.`,
      };
    }
  }

  const adresses = {
    website: adresse(lire("website")),
    application_url: adresse(lire("application_url")),
    source_url: adresse(lire("source_url")),
  };
  const nomsAdresses = {
    website: "Le site de l'organisme",
    application_url: "La page de candidature",
    source_url: "L'adresse de la source",
  } as const;
  for (const champ of ["website", "application_url", "source_url"] as const) {
    if (adresses[champ] === "invalide") {
      return { erreur: `${nomsAdresses[champ]} : une adresse complète, en https://.` };
    }
  }

  const countries = lirePays(lire("countries"));
  if (countries === null) {
    return {
      erreur: `Pays éligibles : des codes à deux lettres séparés par des virgules (CM, GA, CG), ${MAX_PAYS_OPPORTUNITE} au plus.`,
    };
  }
  const formats = choix(lireTous("formats"), referentiels.formats);
  const genres = choix(lireTous("genres"), referentiels.genres);
  if (formats === null || genres === null) {
    return { erreur: "Type de projet ou genre inconnu." };
  }

  const budget_min = montant(lire("budget_min"));
  const budget_max = montant(lire("budget_max"));
  if (budget_min === "invalide" || budget_max === "invalide") {
    return { erreur: "Les montants sont des nombres entiers, sans décimale." };
  }
  if (budget_min !== null && budget_max !== null && budget_min > budget_max) {
    return { erreur: "Le montant minimal dépasse le montant maximal." };
  }
  const devise = texte(lire("currency")).trim().toUpperCase();
  if (devise && !/^[A-Z]{3}$/.test(devise)) {
    return { erreur: "La devise est un code à trois lettres : XAF, EUR, USD." };
  }
  if ((budget_min !== null || budget_max !== null) && !devise) {
    return { erreur: "Un montant ne va pas sans sa devise." };
  }

  const opens_on = jour(lire("opens_on"));
  const deadline = jour(lire("deadline"));
  const collected_on = jour(lire("collected_on"));
  if (opens_on === "invalide" || deadline === "invalide" || collected_on === "invalide") {
    return { erreur: "Les dates s'écrivent AAAA-MM-JJ." };
  }
  if (opens_on !== null && deadline !== null && opens_on > deadline) {
    return { erreur: "L'ouverture ne peut pas suivre la date limite." };
  }
  if (collected_on !== null && collected_on > aujourdhui) {
    return { erreur: "La date de collecte ne peut pas être dans l'avenir." };
  }

  const source_url = adresses.source_url as string | null;
  const source_excerpt = longs.source_excerpt as string;
  if (status === "verifie" && (!source_url || !collected_on || !source_excerpt)) {
    return {
      erreur:
        "Une opportunité ne se dit vérifiée qu'avec l'adresse de sa source, la date de collecte et l'extrait qui la fonde.",
    };
  }

  return {
    valeurs: {
      name,
      organization,
      category: category as CategorieOpportunite,
      description: longs.description as string,
      website: adresses.website as string | null,
      application_url: adresses.application_url as string | null,
      countries,
      formats,
      genres,
      budget_min,
      budget_max,
      currency: devise || null,
      opens_on,
      deadline,
      requirements: longs.requirements as string,
      source_url,
      collected_on,
      source_excerpt,
      status: status as StatutOpportunite,
    },
  };
}

/**
 * Le statut tel qu'il se présente aujourd'hui. Une opportunité vérifiée dont
 * la date limite est passée se présente comme expirée, sans que personne
 * n'ait à y toucher : la base garde ce qui a été constaté, l'écran dit ce
 * qu'il en est ce jour.
 */
export function statutPresente(
  opportunite: { status: string; deadline: string | null },
  aujourdhui: string,
): StatutOpportunite {
  const statut = Object.hasOwn(STATUTS_OPPORTUNITE, opportunite.status)
    ? (opportunite.status as StatutOpportunite)
    : "non_verifie";
  return statut === "verifie" && opportunite.deadline !== null && opportunite.deadline < aujourdhui
    ? "expire"
    : statut;
}

const NOMBRE = new Intl.NumberFormat("fr-FR");

/**
 * « De 5 000 000 à 20 000 000 XAF », « Jusqu'à 30 000 EUR », ou « Montant non
 * fourni. » — la formulation du dépôt pour ce qui n'a pas été renseigné.
 */
export function montantEnClair(opportunite: {
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
}): string {
  const { budget_min: min, budget_max: max, currency } = opportunite;
  if ((min === null && max === null) || !currency) {
    return "Montant non fourni.";
  }
  if (min !== null && max !== null) {
    return min === max
      ? `${NOMBRE.format(min)} ${currency}`
      : `De ${NOMBRE.format(min)} à ${NOMBRE.format(max)} ${currency}`;
  }
  return min !== null
    ? `À partir de ${NOMBRE.format(min)} ${currency}`
    : `Jusqu'à ${NOMBRE.format(max as number)} ${currency}`;
}

/** Le jour courant en UTC, AAAA-MM-JJ : la base compte de même. */
export function jourCourant(maintenant: Date = new Date()): string {
  return maintenant.toISOString().slice(0, 10);
}

/**
 * La veille des opportunités (agent MATCH) : ce que l'écran d'administration
 * en dit. Ses bornes sont celles de la base et du profil de l'agent ; un test
 * vérifie qu'elles s'accordent.
 */
export const LIVRABLE_VEILLE = {
  action: "opportunity_watch",
  titre: "Veille des opportunités",
  bouton: "Lancer la veille",
  description:
    "Décrivez ce que vous cherchez : un moteur de recherche collecte des pages publiques, puis l'assistant y relève les opportunités qu'elles annoncent, chacune avec sa page et un résumé de l'extrait.",
  /** Dit avant tout envoi : ce qui quitte la plateforme, et ce que cela coûte. */
  transmission:
    "Votre recherche, et elle seule, est transmise à un moteur de recherche externe. Chaque veille est un appel payant, compté dans la dépense d'IA du mois ; elle n'entame le quota d'aucun studio.",
  /** Dit à chaque affichage d'une opportunité proposée. */
  avertissement:
    "Rien de ce qui suit n'est vérifié. L'assistant n'a lu qu'un extrait de chaque page, pas la page entière : il peut être tronqué, ancien, ou décrire une édition close. Ouvrez la page avant d'accepter. Une opportunité acceptée entre au catalogue « non vérifiée » : les comptes ne la lisent pas tant que vous ne l'avez pas vérifiée et complétée.",
  /** Dit de ce que la veille ne propose pas. */
  limites:
    "La veille ne propose ni montant, ni date limite, ni pays, ni critère : ils se lisent sur la page et se saisissent dans la fiche.",
  questionMin: 10,
  questionMax: 500,
  /** Opportunités qu'une veille peut porter : la borne de la base. */
  opportunitesMax: 20,
} as const;

/** La recherche telle qu'elle partira : une ligne, bornée ; null si elle ne l'est pas. */
export function lireQuestionVeille(valeur: unknown): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const question = valeur.replace(/\s+/g, " ").trim();
  return question.length < LIVRABLE_VEILLE.questionMin ||
    question.length > LIVRABLE_VEILLE.questionMax ||
    /[\u0000-\u001f\u007f]/.test(question)
    ? null
    : question;
}

/**
 * Ce qu'un administrateur corrige en acceptant : le nom, l'organisme et la
 * catégorie. La provenance ne se corrige pas. Erreur lisible si une valeur
 * sort des bornes — la base les recontrôle.
 */
export function lireCorrection(
  nom: unknown,
  organisme: unknown,
  categorie: unknown,
): { name: string; organization: string; category: CategorieOpportunite } | { erreur: string } {
  const name = typeof nom === "string" ? nom.replace(/\s+/g, " ").trim() : "";
  const organization = typeof organisme === "string" ? organisme.replace(/\s+/g, " ").trim() : "";
  if (name.length < 1 || name.length > LONGUEURS_OPPORTUNITE.name) {
    return { erreur: "Donnez le nom de l'opportunité." };
  }
  if (organization.length < 1 || organization.length > LONGUEURS_OPPORTUNITE.organization) {
    return {
      erreur:
        "Indiquez l'organisme, tel que la page le nomme : la veille ne l'a pas trouvé, et il ne se déduit pas du site.",
    };
  }
  if (typeof categorie !== "string" || !Object.hasOwn(CATEGORIES_OPPORTUNITE, categorie)) {
    return { erreur: "Choisissez une catégorie." };
  }
  if (/[\u0000-\u001f\u007f]/.test(name + organization)) {
    return { erreur: "Le nom et l'organisme tiennent sur une ligne." };
  }
  return { name, organization, category: categorie as CategorieOpportunite };
}

/** Codes que la base rend à une demande ou à une décision de veille. */
export const ERREURS_VEILLE = {
  refus: "42501",
  invalide: "22023",
  clesAbsentes: "55000",
  dejaEnCours: "VE001",
  limiteDuJour: "VE002",
  doublon: "23505",
  horsCatalogue: "23514",
  dejaDecidee: "PR001",
  tacheDejaPrise: "TR002",
} as const;

/** Message lisible pour une erreur de la base ; générique si elle est inconnue. */
export function messageVeille(code: string | undefined): string {
  switch (code) {
    case ERREURS_VEILLE.refus:
      return "Action réservée à l'administration.";
    case ERREURS_VEILLE.invalide:
      return "Cette saisie n'est pas admise telle quelle : vérifiez sa longueur, et qu'elle tient sur une ligne.";
    case ERREURS_VEILLE.clesAbsentes:
      return "La veille demande les clés d'Anthropic et de Perplexity : posez-les depuis Intégrations IA.";
    case ERREURS_VEILLE.dejaEnCours:
      return "Une veille est déjà en cours : attendez son résultat.";
    case ERREURS_VEILLE.limiteDuJour:
      return "Vous avez atteint la limite de veilles pour vingt-quatre heures.";
    case ERREURS_VEILLE.doublon:
      return "Cette opportunité est déjà au catalogue, sous ce nom et cet organisme : modifiez sa fiche, ou écartez cette proposition.";
    case ERREURS_VEILLE.horsCatalogue:
      return "Le catalogue refuse cette opportunité telle quelle : vérifiez sa catégorie.";
    case ERREURS_VEILLE.dejaDecidee:
      return "Cette opportunité a déjà été acceptée ou écartée.";
    case ERREURS_VEILLE.tacheDejaPrise:
      return "La veille est déjà en cours : elle ne s'annule plus.";
    default:
      return "La demande n'a pas abouti. Réessayez dans un instant.";
  }
}

/** Étape de la veille que l'écran affiche. */
export type EtapeVeille =
  | { etape: "repos" }
  /** En file : annulable. */
  | { etape: "en_attente"; tacheId: string }
  | { etape: "en_cours" }
  /** Interrompue après l'envoi : issue inconnue. */
  | { etape: "a_rapprocher" }
  | { etape: "echec"; motif: string | null }
  /** Terminée sans rien relever : la phrase de la base le dit. */
  | { etape: "sans_resultat"; texte: string };

/**
 * Étape affichée, d'après la dernière veille et sa proposition. Une veille
 * réussie ramène au repos : ses opportunités, s'il y en a, se lisent plus bas.
 * Un état inconnu aussi — mieux vaut laisser redemander que d'afficher une
 * attente sans fin.
 */
export function etapeVeille(
  tache: { id: string; state: string; reason: string | null } | null | undefined,
  proposition: { content: string; state: string; lignes: number } | null | undefined,
): EtapeVeille {
  if (!tache) {
    return { etape: "repos" };
  }
  switch (tache.state) {
    case "queued":
      return { etape: "en_attente", tacheId: tache.id };
    case "running":
      return { etape: "en_cours" };
    case "awaiting_reconciliation":
      return { etape: "a_rapprocher" };
    case "failed":
      return { etape: "echec", motif: tache.reason };
    case "succeeded":
      return proposition && proposition.lignes === 0
        ? { etape: "sans_resultat", texte: proposition.content }
        : { etape: "repos" };
    default:
      return { etape: "repos" };
  }
}

/** Clé de comparaison d'une opportunité : son nom chez son organisme, comme en base. */
export function cleOpportunite(nom: string, organisme: string): string {
  return `${nom.trim().toLowerCase()}\u0000${organisme.trim().toLowerCase()}`;
}

/**
 * Consultation du catalogue par les équipes (lot L5a) : ce que l'écran lit,
 * ce qu'il filtre et dans quel ordre il le présente.
 *
 * L'écran des équipes ne montre que ce qu'un compte lit. La RLS le garantit
 * aux comptes ; un administrateur, lui, lit tout — la page filtre donc aussi
 * sur ces statuts, sans quoi il y verrait une démonstration.
 */
export const STATUTS_VISIBLES = ["verifie", "expire"] as const;

/** Opportunités lues pour la consultation : au-delà, la page le dit. */
export const LIMITE_CATALOGUE = 200;

/** Longueur d'une recherche : assez pour un nom de fonds, pas pour un texte. */
export const RECHERCHE_MAX = 100;

/** Où en est la date limite, le jour de la lecture. */
export const ECHEANCES = {
  a_venir: "Date limite à venir",
  sans_date: "Date limite non fournie",
  passee: "Expirées",
} as const;

export type Echeance = keyof typeof ECHEANCES;

/**
 * Une opportunité sans date limite n'est pas « ouverte » : la source ne le
 * dit pas. Elle a sa propre case.
 */
export function echeanceDe(
  opportunite: { status: string; deadline: string | null },
  aujourdhui: string,
): Echeance {
  if (statutPresente(opportunite, aujourdhui) === "expire") {
    return "passee";
  }
  return opportunite.deadline === null ? "sans_date" : "a_venir";
}

export type FiltresCatalogue = {
  /** Mots cherchés dans le nom, l'organisme et la description ; vide : aucun. */
  texte: string;
  categorie: CategorieOpportunite | null;
  pays: string | null;
  format: string | null;
  genre: string | null;
  echeance: Echeance | null;
};

/**
 * Lit les filtres d'une adresse. Une valeur inconnue est ignorée plutôt que
 * refusée : une adresse recopiée de travers montre le catalogue, pas une
 * erreur. Rien de ce qui est lu ici ne part dans une requête : le filtrage
 * se fait sur les lignes déjà lues.
 */
export function lireFiltres(
  lire: (champ: string) => unknown,
  referentiels: {
    formats: Readonly<Record<string, string>>;
    genres: Readonly<Record<string, string>>;
  },
): FiltresCatalogue {
  const connu = (valeur: unknown, referentiel: Readonly<Record<string, string>>) =>
    typeof valeur === "string" && Object.hasOwn(referentiel, valeur) ? valeur : null;
  const recherche = ligne(lire("q")) ?? "";
  const pays = texte(lire("pays")).trim().toUpperCase();

  return {
    texte: recherche.slice(0, RECHERCHE_MAX),
    categorie: connu(lire("categorie"), CATEGORIES_OPPORTUNITE) as CategorieOpportunite | null,
    pays: /^[A-Z]{2}$/.test(pays) ? pays : null,
    format: connu(lire("format"), referentiels.formats),
    genre: connu(lire("genre"), referentiels.genres),
    echeance: connu(lire("echeance"), ECHEANCES) as Echeance | null,
  };
}

/** Vrai si un filtre au moins restreint la liste. */
export function filtresActifs(filtres: FiltresCatalogue): boolean {
  return Boolean(
    filtres.texte ||
    filtres.categorie ||
    filtres.pays ||
    filtres.format ||
    filtres.genre ||
    filtres.echeance,
  );
}

/** Minuscules, sans accent : « Résidence » se trouve en cherchant « residence ». */
const sansAccent = (valeur: string) => valeur.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const RANG_ECHEANCE: Readonly<Record<Echeance, number>> = { a_venir: 0, sans_date: 1, passee: 2 };

/**
 * Les opportunités que les filtres retiennent, la date limite la plus proche
 * d'abord, puis celles sans date, puis les expirées.
 *
 * Un filtre ne retient que les opportunités qui précisent ce qu'il cherche :
 * une liste de pays vide veut dire « non précisé », pas « tous les pays ». La
 * retenir ferait dire à la source ce qu'elle ne dit pas.
 */
export function filtrerCatalogue<
  Opportunite extends {
    name: string;
    organization: string;
    category: string;
    description: string;
    countries: readonly string[];
    formats: readonly string[];
    genres: readonly string[];
    deadline: string | null;
    status: string;
  },
>(catalogue: readonly Opportunite[], filtres: FiltresCatalogue, aujourdhui: string): Opportunite[] {
  const mots = sansAccent(filtres.texte).split(" ").filter(Boolean);

  return catalogue
    .filter((opportunite) => {
      if (filtres.categorie && opportunite.category !== filtres.categorie) {
        return false;
      }
      if (filtres.pays && !opportunite.countries.includes(filtres.pays)) {
        return false;
      }
      if (filtres.format && !opportunite.formats.includes(filtres.format)) {
        return false;
      }
      if (filtres.genre && !opportunite.genres.includes(filtres.genre)) {
        return false;
      }
      if (filtres.echeance && echeanceDe(opportunite, aujourdhui) !== filtres.echeance) {
        return false;
      }
      if (!mots.length) {
        return true;
      }
      const contenu = sansAccent(
        `${opportunite.name} ${opportunite.organization} ${opportunite.description}`,
      );
      return mots.every((mot) => contenu.includes(mot));
    })
    .map((opportunite, rang) => ({ opportunite, rang }))
    .sort((a, b) => {
      const ecart =
        RANG_ECHEANCE[echeanceDe(a.opportunite, aujourdhui)] -
        RANG_ECHEANCE[echeanceDe(b.opportunite, aujourdhui)];
      if (ecart !== 0) {
        return ecart;
      }
      const [limiteA, limiteB] = [a.opportunite.deadline, b.opportunite.deadline];
      if (limiteA !== null && limiteB !== null && limiteA !== limiteB) {
        return limiteA < limiteB ? -1 : 1;
      }
      return a.rang - b.rang;
    })
    .map(({ opportunite }) => opportunite);
}
