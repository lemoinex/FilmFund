/**
 * Épisodes d'une série (lot SE1), sans IA : ce que l'écran propose, lit et
 * annonce.
 *
 * Une seule saison par projet. Un épisode se repère par son numéro ; le
 * premier se présente comme le pilote. Les mêmes bornes sont en base — ici
 * pour répondre tout de suite, là parce que l'écran n'est pas le seul chemin.
 *
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 */

/** Formats dont un projet a des épisodes. Mêmes codes qu'en base. */
export const FORMATS_SERIE = ["serie", "web_serie"] as const;

export function estSerie(format: string | null | undefined): boolean {
  return (FORMATS_SERIE as readonly string[]).includes(format ?? "");
}

export const LONGUEURS_EPISODE = { title: 200, summary: 2000 } as const;
export const NUMERO_EPISODE = { min: 1, max: 500 } as const;
/** Bornes d'une durée, en minutes : celles de la durée d'un projet. */
export const DUREE_EPISODE = { min: 1, max: 1000 } as const;

/** Ce que l'écran dit, une fois, de ce qu'un épisode est ici. */
export const AIDE_EPISODES =
  "Une seule saison par projet. Chaque épisode a son numéro, que deux épisodes ne partagent pas ; l'épisode 1 est présenté comme le pilote.";

export type SaisieEpisode = {
  number: number;
  title: string;
  summary: string;
  duration_minutes: number | null;
};

type Erreur = { erreur: string };

/** Un nombre entier écrit en chiffres, dans ses bornes ; null si vide. */
function entier(valeur: unknown, min: number, max: number): number | null | "invalide" {
  const brut = typeof valeur === "string" ? valeur.trim() : "";
  if (!brut) {
    return null;
  }
  if (!/^\d+$/.test(brut)) {
    return "invalide";
  }
  const nombre = Number(brut);
  return nombre >= min && nombre <= max ? nombre : "invalide";
}

/** Un épisode, ramené à ce que la base attend. */
export function normaliserEpisode(
  saisie: Readonly<Record<string, unknown>>,
): { episode: SaisieEpisode } | Erreur {
  const number = entier(saisie.number, NUMERO_EPISODE.min, NUMERO_EPISODE.max);
  if (number === null || number === "invalide") {
    return {
      erreur: `Le numéro d'un épisode est un nombre entier, de ${NUMERO_EPISODE.min} à ${NUMERO_EPISODE.max}.`,
    };
  }

  const title = typeof saisie.title === "string" ? saisie.title.replace(/\s+/g, " ").trim() : "";
  if (!title) {
    return { erreur: "Donnez un titre à l'épisode." };
  }
  if ([...title].length > LONGUEURS_EPISODE.title || /[\u0000-\u001f\u007f-\u009f]/.test(title)) {
    return {
      erreur: `Le titre tient sur une ligne de ${LONGUEURS_EPISODE.title} caractères au plus.`,
    };
  }

  const summary =
    typeof saisie.summary === "string" ? saisie.summary.replace(/\r\n?/g, "\n").trim() : "";
  if (
    [...summary].length > LONGUEURS_EPISODE.summary ||
    /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(summary)
  ) {
    return {
      erreur: `Le résumé : ${LONGUEURS_EPISODE.summary} caractères au plus, sans caractère de contrôle.`,
    };
  }

  const duration_minutes = entier(saisie.duration_minutes, DUREE_EPISODE.min, DUREE_EPISODE.max);
  if (duration_minutes === "invalide") {
    return {
      erreur: `La durée se donne en minutes entières, de ${DUREE_EPISODE.min} à ${DUREE_EPISODE.max}.`,
    };
  }

  return { episode: { number, title, summary, duration_minutes } };
}

/**
 * Le numéro proposé pour un nouvel épisode : celui qui suit le plus grand.
 * Null si la saison est allée jusqu'à la borne — à l'équipe d'en choisir un.
 */
export function numeroSuivant(numeros: readonly number[]): number | null {
  const suivant = numeros.length ? Math.max(...numeros) + 1 : NUMERO_EPISODE.min;
  return suivant <= NUMERO_EPISODE.max ? suivant : null;
}

/** « Épisode 1 — pilote », « Épisode 2 ». */
export function libelleEpisode(numero: number): string {
  return numero === 1 ? "Épisode 1 — pilote" : `Épisode ${numero}`;
}

/** « 26 minutes », « 1 minute » ; null si la durée n'est pas dite. */
export function dureeEpisode(minutes: number | null): string | null {
  return minutes === null ? null : `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

/** « Aucun épisode », « Un épisode », « 8 épisodes ». */
export function decompteEpisodes(nombre: number): string {
  return nombre > 1 ? `${nombre} épisodes` : nombre === 1 ? "Un épisode" : "Aucun épisode";
}

/** Codes que la base rend à une écriture d'épisode. */
export const ERREURS_EPISODE = {
  refus: "42501",
  doublon: "23505",
  horsSerie: "SE001",
  formatAvecEpisodes: "SE002",
} as const;

/** Message lisible pour une erreur de la base ; générique si elle est inconnue. */
export function messageEpisode(code: string | undefined): string {
  switch (code) {
    case ERREURS_EPISODE.refus:
      return "Vous n'avez pas le droit de modifier ce projet.";
    case ERREURS_EPISODE.doublon:
      return "Un épisode porte déjà ce numéro : choisissez-en un autre, ou modifiez celui-là.";
    case ERREURS_EPISODE.horsSerie:
      return "Les épisodes sont réservés aux projets de série ou de web-série.";
    case ERREURS_EPISODE.formatAvecEpisodes:
      return "Ce projet a des épisodes : retirez-les avant de changer son format.";
    default:
      return "L'enregistrement a échoué. Réessayez dans un instant.";
  }
}

/**
 * Le scénario d'un épisode (lot SE3a) : un document de type « scénario »,
 * rattaché à son épisode. Un épisode en a un au plus, et un scénario sans
 * épisode reste possible — c'est celui d'un film, ou d'une série commencée
 * avant ce lot.
 */

/** « Scénario — épisode 3 » : le titre d'un scénario créé depuis son épisode. */
export function titreScenarioEpisode(numero: number): string {
  return `Scénario — épisode ${numero}`;
}

/** Codes que la base rend à un rattachement. */
export const ERREURS_SCENARIO = {
  refus: "42501",
  dejaRattache: "23505",
  autreProjet: "SE003",
  pasUnScenario: "23514",
} as const;

/** Message lisible pour un rattachement refusé ; générique si le code est inconnu. */
export function messageScenario(code: string | undefined): string {
  switch (code) {
    case ERREURS_SCENARIO.refus:
      return "Vous n'avez pas le droit de modifier les documents de ce projet.";
    case ERREURS_SCENARIO.dejaRattache:
      return "Cet épisode a déjà son scénario : ouvrez-le depuis la page des épisodes, ou détachez-le d'abord.";
    case ERREURS_SCENARIO.autreProjet:
      return "Cet épisode n'est pas un épisode de ce projet.";
    case ERREURS_SCENARIO.pasUnScenario:
      return "Seul un scénario se rattache à un épisode : détachez ce document de son épisode avant de changer son type.";
    default:
      return "L'enregistrement a échoué. Réessayez dans un instant.";
  }
}

/*
 * La scène d'un épisode (lot SE5) : une scène du storyboard peut dire de quel
 * épisode elle fait partie. L'assistant de découpage lit alors le scénario de
 * cet épisode, et aucun autre.
 */

/** Refus de la base quand l'épisode désigné n'est pas un épisode du projet de la scène. */
export const ERREUR_EPISODE_DE_SCENE = "SE005";

export const MESSAGE_EPISODE_DE_SCENE = "Cet épisode n'est pas un épisode de ce projet.";

/** Dit sous le choix de l'épisode, dans le formulaire d'une scène. */
export const AIDE_EPISODE_DE_SCENE =
  "L'assistant de découpage lit le scénario de cet épisode, et lui seul. Sans épisode, il lit le scénario qui n'est rattaché à aucun épisode.";

/**
 * Dit avant une demande de découpage, quand la scène est celle d'un épisode
 * qui n'a pas encore de scénario : l'assistant ne se rabat sur aucun autre.
 */
export const SANS_SCENARIO_D_EPISODE =
  "L'épisode de cette scène n'a pas de scénario enregistré : l'assistant travaillera d'après la description de la scène et le concept, jamais d'après le scénario d'un autre épisode.";

/** « Épisode 2 : La dette » — l'épisode d'une scène, tel que sa carte le dit. */
export function episodeDeScene(episode: { number: number; title: string }): string {
  return `${libelleEpisode(episode.number)} : ${episode.title}`;
}
