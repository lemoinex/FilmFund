/**
 * Exécuteurs : ce que le worker sait faire, par action.
 *
 * Le worker ne réclame que les tâches dont l'action a un exécuteur. Le
 * registre de production est assemblé au démarrage (index.ts) : il reste
 * vide tant que la clé du fournisseur d'IA n'est pas configurée — aucune
 * tâche n'est alors prise, et rien n'est simulé. Les tests fournissent leurs
 * propres exécuteurs et fournisseurs, factices et désignés comme tels.
 */

/** Tâche réclamée, telle que la base la remet au worker. */
export type Travail = {
  jobId: string;
  attemptId: string;
  attemptNumber: number;
  action: string;
  params: unknown;
  projectId: string;
  studioId: string;
};

/** Issue d'un travail réussi. Sans précision, toute la réservation est consommée. */
export type Issue = { consomme?: number };

/**
 * Exécute une tâche. Le signal s'interrompt quand le bail est perdu : le
 * travail ne nous appartient plus, il faut s'arrêter.
 *
 * Deux façons d'échouer, à ne pas confondre :
 *   - lever `EchecConnu` : le fournisseur a répondu que rien n'a été
 *     produit. L'essai est clos comme échoué, et la tâche repart une fois ;
 *   - lever toute autre erreur : on ne sait pas ce que le fournisseur a
 *     fait (coupure, délai dépassé). Rien n'est conclu : le bail expirera
 *     et la tâche attendra un rapprochement, sans relance à l'aveugle.
 */
export type Executeur = (travail: Travail, signal: AbortSignal) => Promise<Issue>;

/** Longueur retenue du détail : de quoi comprendre, pas de quoi tout recopier. */
const DETAIL_MAX = 300;

/** Le fournisseur a répondu, sans ambiguïté, que le travail a échoué. */
export class EchecConnu extends Error {
  /** Unités malgré tout consommées, en cas de livraison partielle. */
  readonly consomme: number | undefined;

  /**
   * Ce que le fournisseur a répondu, pour le journal du worker — que seul
   * l'exploitant lit. Le `message`, lui, est repris en base et lu par
   * l'équipe du projet : il reste général.
   */
  readonly detail: string | undefined;

  /**
   * Vrai quand le fournisseur a refusé la requête sans rien produire : il ne
   * la facture pas, et la provision doit être soldée à zéro plutôt que de
   * peser sur le plafond du mois.
   */
  readonly sansFrais: boolean;

  constructor(
    message: string,
    options: { consomme?: number; detail?: string; sansFrais?: boolean } = {},
  ) {
    super(message);
    this.name = "EchecConnu";
    this.consomme = options.consomme;
    this.detail = options.detail?.slice(0, DETAIL_MAX);
    this.sansFrais = options.sansFrais ?? false;
  }
}
