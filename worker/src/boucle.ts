/**
 * Boucle du worker : réclamer une tâche, la marquer soumise, l'exécuter,
 * conclure — en prolongeant le bail tant que le travail dure.
 *
 * Les garanties viennent de la base (lot H1) ; la boucle les respecte :
 *   - rien n'est envoyé au fournisseur avant que l'essai soit marqué soumis ;
 *   - une issue inconnue n'est jamais conclue ici : le bail expire, la base
 *     met la tâche « à rapprocher » ;
 *   - un bail perdu interrompt l'exécuteur.
 */
import {
  marquerSoumise,
  prolongerBail,
  reclamer,
  recupererExpires,
  terminer,
  type Base,
} from "./base.ts";
import { EchecConnu, type Executeur } from "./executeurs.ts";

/**
 * Entrée de journal. Jamais de contenu d'œuvre, de paramètres ni de secret :
 * des identifiants, des états et des durées seulement.
 */
export type Evenement = {
  niveau: "info" | "alerte" | "erreur";
  evenement: string;
  [cle: string]: unknown;
};

export type Registre = Readonly<Record<string, Executeur>>;

export type OptionsWorker = {
  base: Base;
  /** Identifiant du worker, inscrit sur les tâches qu'il prend. */
  nom: string;
  /**
   * Ce que le worker sait faire. Une fonction quand le registre change en
   * cours de route — la clé d'un fournisseur peut être posée ou retirée
   * pendant que le worker tourne : il est alors relu à chaque tour.
   */
  executeurs: Registre | (() => Registre);
  journal: (evenement: Evenement) => void;
  /** Attente quand la file est vide. */
  attenteMs?: number;
  /** Fréquence de prolongation du bail, qui dure cinq minutes en base. */
  battementMs?: number;
  /** Fréquence de récupération des baux expirés. */
  recuperationMs?: number;
};

const ATTENTE_MS = 5_000;
const BATTEMENT_MS = 60_000;
const RECUPERATION_MS = 60_000;
const ATTENTE_MAX_MS = 60_000;

const messageDe = (erreur: unknown) => (erreur instanceof Error ? erreur.message : String(erreur));

/** Attend, ou rend la main dès que l'arrêt est demandé. */
function attendre(ms: number, arret: AbortSignal): Promise<void> {
  return new Promise((resoudre) => {
    if (arret.aborted) {
      resoudre();
      return;
    }
    const fin = () => {
      clearTimeout(minuterie);
      arret.removeEventListener("abort", fin);
      resoudre();
    };
    const minuterie = setTimeout(fin, ms);
    arret.addEventListener("abort", fin);
  });
}

/**
 * Réclame une tâche et la mène à son terme. Renvoie faux si la file ne
 * contient rien que ce worker sache exécuter.
 */
export async function traiterUnTravail(options: OptionsWorker): Promise<boolean> {
  const { base, nom, journal } = options;
  const executeurs =
    typeof options.executeurs === "function" ? options.executeurs() : options.executeurs;
  const actions = Object.keys(executeurs);
  if (actions.length === 0) {
    return false;
  }

  const travail = await reclamer(base, nom, actions);
  if (!travail) {
    return false;
  }
  const repere = { tache: travail.jobId, action: travail.action, essai: travail.attemptNumber };
  journal({ niveau: "info", evenement: "tache_reclamee", ...repere });

  const perte = new AbortController();
  const battement = setInterval(() => {
    prolongerBail(base, travail.attemptId).then(
      (garde) => {
        if (!garde) {
          perte.abort();
        }
      },
      (erreur) =>
        journal({
          niveau: "alerte",
          evenement: "prolongation_impossible",
          ...repere,
          message: messageDe(erreur),
        }),
    );
  }, options.battementMs ?? BATTEMENT_MS);

  try {
    if (!(await marquerSoumise(base, travail.attemptId))) {
      journal({ niveau: "alerte", evenement: "bail_perdu_avant_envoi", ...repere });
      return true;
    }

    const debut = Date.now();
    let consomme: number | null;
    try {
      const issue = await executeurs[travail.action](travail, perte.signal);
      consomme = issue.consomme ?? null;
    } catch (erreur) {
      if (erreur instanceof EchecConnu) {
        const conclu = await terminer(
          base,
          travail.attemptId,
          false,
          erreur.consomme ?? null,
          erreur.message,
        );
        journal({
          niveau: "alerte",
          evenement: conclu ? "essai_echoue" : "essai_perdu",
          ...repere,
          message: erreur.message,
          // Ce que le fournisseur a répondu : sans cela, une requête refusée
          // resterait indéchiffrable. Journal du worker seulement.
          ...(erreur.detail ? { detail: erreur.detail } : {}),
        });
      } else {
        // Issue inconnue : ne rien conclure. Le bail n'est plus prolongé ; à
        // son expiration, la base mettra la tâche « à rapprocher ».
        journal({
          niveau: "erreur",
          evenement: "issue_inconnue",
          ...repere,
          message: messageDe(erreur),
        });
      }
      return true;
    }

    const conclu = await terminer(base, travail.attemptId, true, consomme, null);
    journal({
      niveau: conclu ? "info" : "alerte",
      evenement: conclu ? "tache_reussie" : "essai_perdu",
      ...repere,
      dureeMs: Date.now() - debut,
    });
    return true;
  } finally {
    clearInterval(battement);
  }
}

/**
 * Tourne jusqu'à l'arrêt demandé. La tâche en cours est menée à son terme
 * avant de rendre la main ; si le processus est tué avant, son bail expire
 * et la base décide de son sort.
 */
export async function demarrerWorker(options: OptionsWorker, arret: AbortSignal): Promise<void> {
  const { base, journal } = options;
  const attenteMs = options.attenteMs ?? ATTENTE_MS;
  const recuperationMs = options.recuperationMs ?? RECUPERATION_MS;
  let prochaineRecuperation = 0;
  let echecs = 0;

  while (!arret.aborted) {
    try {
      if (Date.now() >= prochaineRecuperation) {
        const nombre = await recupererExpires(base);
        if (nombre > 0) {
          journal({ niveau: "alerte", evenement: "baux_expires_recuperes", nombre });
        }
        prochaineRecuperation = Date.now() + recuperationMs;
      }

      const traite = await traiterUnTravail(options);
      echecs = 0;
      if (!traite) {
        await attendre(attenteMs, arret);
      }
    } catch (erreur) {
      // Base injoignable, par exemple : on patiente de plus en plus, sans
      // jamais abandonner.
      echecs += 1;
      journal({
        niveau: "erreur",
        evenement: "boucle_en_echec",
        echecs,
        message: messageDe(erreur),
      });
      await attendre(Math.min(attenteMs * 2 ** echecs, ATTENTE_MAX_MS), arret);
    }
  }

  journal({ niveau: "info", evenement: "worker_arrete" });
}
