/**
 * SCOUT : recherche documentaire sourcée.
 *
 * Deux temps, deux fournisseurs. Le moteur de recherche collecte des pages —
 * adresse, titre, extrait, date — et ne rédige rien ; le modèle de texte ne
 * reçoit que ces extraits, et rend une synthèse dont chaque renvoi « [n] »
 * désigne l'un d'eux. Seule la question part chez le moteur : rien d'autre
 * du projet.
 *
 * Le worker ne visite aucune page rendue. Il ne peut donc rien vérifier :
 * toute source naît « non vérifiée », et l'équipe en décide une à une.
 *
 * La mécanique de la synthèse est celle de WEAVER : provision, appel, coût
 * confirmé, dépôt. Trois choses lui sont propres : la collecte et son coût,
 * le tri des pages rendues, et la lecture de la synthèse — contrôlés ici
 * avant de l'être encore par la base.
 */
import {
  codeDe,
  confirmerRecherche,
  lireContexteRecherche,
  livrerPropositionRecherche,
  PLAFOND_ATTEINT,
  provisionnerRecherche,
  type Base,
  type ContexteRecherche,
  type SourceCollectee,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import type { Fournisseur, FournisseurRecherche, ResultatRecherche } from "../ia/passerelle.ts";
import {
  coutMicroDollars,
  enDollars,
  estimerJetons,
  PROFILS_GRIOT,
  PROFILS_SCOUT,
  type ProfilAppel,
  type ProfilRecherche,
} from "../ia/profils.ts";

import { creerExecuteur, lireTexte } from "./weaver.ts";

/** Bornes d'une source, telles que la base les contrôle au dépôt. */
const ADRESSE_MAX = 2000;
const TITRE_MAX = 300;
const EXTRAIT_MAX = 2000;

/** Valeur absente : dite comme telle, jamais devinée. */
const ABSENT = "(non renseigné)";

const lisible = (code: string) => code.replaceAll("_", " ");

/**
 * L'adresse d'une page, telle qu'elle peut être montrée à l'équipe ; null si
 * elle ne le peut pas. HTTPS seulement, vers un nom de domaine public : ni
 * identifiant glissé dans l'adresse, ni port, ni adresse IP, ni nom interne.
 * Le worker ne s'y connecte jamais — ce contrôle protège qui cliquera.
 */
export function adresseAdmise(brute: string): string | null {
  if (brute.length > ADRESSE_MAX || /[\s\u0000-\u001f\u007f]/.test(brute)) {
    return null;
  }
  let adresse: URL;
  try {
    adresse = new URL(brute);
  } catch {
    return null;
  }
  const hote = adresse.hostname.toLowerCase();
  if (
    adresse.protocol !== "https:" ||
    adresse.username !== "" ||
    adresse.password !== "" ||
    adresse.port !== "" ||
    !hote.includes(".") ||
    hote.startsWith("[") ||
    /^[0-9.]+$/.test(hote) ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/.test(hote)
  ) {
    return null;
  }
  // Le fragment ne désigne pas une autre page : deux adresses qui n'en
  // diffèrent que par lui sont la même source.
  adresse.hash = "";
  const nette = adresse.href;
  return nette.length <= ADRESSE_MAX ? nette : null;
}

/** Texte sur une ligne, sans caractère de contrôle, coupé à `max`. */
function surUneLigne(texte: string, max: number): string {
  return texte
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** « 2026-03-14 » si la date annoncée se lit comme un jour du calendrier ; null sinon. */
export function lireDate(brute: string | null): string | null {
  const trouve = brute?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!trouve) {
    return null;
  }
  const [, annee, mois, jour] = trouve.map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois - 1 &&
    date.getUTCDate() === jour
    ? `${trouve[1]}-${trouve[2]}-${trouve[3]}`
    : null;
}

/**
 * Vrai si l'hôte est l'un des sites admis, ou l'un de leurs sous-domaines.
 * « evil-persee.fr » n'est pas « persee.fr » : la comparaison se fait au
 * point près.
 */
export function hoteAdmis(hote: string, domaines: readonly string[]): boolean {
  const net = hote.toLowerCase();
  return domaines.some((domaine) => net === domaine || net.endsWith(`.${domaine}`));
}

/**
 * Retient les pages exploitables, dans l'ordre du moteur : adresse admise,
 * extrait non vide, une seule fois chacune, `max` au plus. Une page écartée
 * ne fait pas échouer la collecte — elle n'y figure pas, voilà tout.
 *
 * Avec `domaines`, seules les pages de ces sites passent : le moteur est
 * censé s'y tenir, mais ce qu'il rend n'est pas cru sur parole.
 */
export function retenirSources(
  resultats: readonly ResultatRecherche[],
  max: number,
  domaines?: readonly string[],
): SourceCollectee[] {
  const sources: SourceCollectee[] = [];
  const vues = new Set<string>();
  for (const resultat of resultats) {
    if (sources.length >= max) {
      break;
    }
    const url = adresseAdmise(resultat.adresse.trim());
    if (url === null || vues.has(url)) {
      continue;
    }
    if (domaines && !hoteAdmis(new URL(url).hostname, domaines)) {
      continue;
    }
    // L'extrait garde ses sauts de ligne ; le reste des caractères de
    // contrôle n'a rien à y faire.
    const excerpt = resultat.extrait
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, EXTRAIT_MAX)
      .trim();
    if (!excerpt) {
      continue;
    }
    vues.add(url);
    sources.push({
      url,
      // Sans titre, le site le remplace : il est vrai, lui.
      title: surUneLigne(resultat.titre, TITRE_MAX) || new URL(url).hostname,
      excerpt,
      published_on: lireDate(resultat.date),
    });
  }
  return sources;
}

/**
 * Ce qui est transmis au modèle : la question, de quoi situer la réponse,
 * les sources numérotées, puis l'objectif — en dernier, après la donnée.
 * Les adresses n'y figurent pas : le modèle n'a pas à en écrire, seulement à
 * renvoyer aux numéros.
 */
export function composerDossierRecherche(
  contexte: ContexteRecherche,
  sources: readonly SourceCollectee[],
  objectif: string,
): string {
  const { projet } = contexte;
  const blocs = [
    ["<question>", contexte.question, "</question>"].join("\n"),
    [
      "<projet>",
      `Format : ${lisible(projet.format)}`,
      `Genre : ${projet.genre ? lisible(projet.genre) : ABSENT}`,
      `Pays de production : ${projet.pays?.length ? projet.pays.join(", ") : ABSENT}`,
      "</projet>",
    ].join("\n"),
    [
      "<sources>",
      ...sources.map((source, rang) =>
        [
          `[${rang + 1}] ${source.title}`,
          `Site : ${new URL(source.url).hostname}`,
          `Date : ${source.published_on ?? "non indiquée"}`,
          "Extrait :",
          source.excerpt,
        ].join("\n"),
      ),
      "</sources>",
    ].join("\n\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/**
 * La synthèse, si elle tient ses deux engagements ; null sinon. Chaque renvoi
 * « [n] » désigne une source collectée, et il y en a au moins un ; aucune
 * adresse n'est écrite par le modèle. Une synthèse qui cite une source
 * absente de la collecte ne se dépose pas : la corriger serait la réécrire.
 */
export function lireSynthese(texte: string, sources: number, max: number): string | null {
  const net = lireTexte(texte, max);
  if (net === null || /(https?:\/\/|www\.)/i.test(net)) {
    return null;
  }
  const renvois = [...net.matchAll(/\[(\d{1,4})\]/g)].map((trouve) => Number(trouve[1]));
  if (renvois.length === 0 || renvois.some((numero) => numero < 1 || numero > sources)) {
    return null;
  }
  return net;
}

/**
 * Longueur du pire message : toutes les sources demandées, chacune à ses
 * bornes, et la question à la sienne. Sert à réserver le coût de la synthèse
 * avant la collecte, quand le message n'existe pas encore.
 */
function longueurPire(profil: ProfilCollecte): number {
  return (
    profil.systeme.length +
    profil.objectif.length +
    1_000 +
    profil.collecte.resultatsMax * (TITRE_MAX + EXTRAIT_MAX + 400)
  );
}

/** Ce qu'il faut d'un profil pour collecter : sa collecte, et de quoi réserver l'appel qui suit. */
export type ProfilCollecte = ProfilAppel & Pick<ProfilRecherche, "objectif" | "collecte">;

/**
 * La collecte d'un essai : provision, requête au moteur, coût confirmé, tri
 * des pages. Une recherche et une veille la partagent — le coût d'une requête
 * ne se compte qu'ici.
 */
export async function collecter(
  base: Base,
  moteur: FournisseurRecherche,
  profil: ProfilCollecte,
  attemptId: string,
  question: string,
  signal: AbortSignal,
): Promise<SourceCollectee[]> {
  // Provision de la requête, avec en réserve le pire coût de l'appel au
  // modèle : le plafond du mois refuse l'ensemble maintenant, pas après la
  // collecte.
  const frais = profil.collecte.microDollarsParRequete;
  const reserve =
    coutMicroDollars([
      {
        modele: profil.modele,
        jetonsEntree: estimerJetons("x".repeat(longueurPire(profil))),
        jetonsSortie: profil.jetonsMax,
      },
    ]) ?? 0;
  try {
    await provisionnerRecherche(base, attemptId, {
      fournisseur: profil.collecte.fournisseur,
      profil: profil.id,
      requetes: 1,
      dollars: enDollars(frais),
      reserve: enDollars(reserve),
    });
  } catch (erreur) {
    if (codeDe(erreur) === PLAFOND_ATTEINT) {
      throw new EchecConnu("Plafond mensuel des dépenses d'IA atteint.");
    }
    throw erreur;
  }

  let collecte;
  try {
    collecte = await moteur({ profil, question }, signal);
  } catch (erreur) {
    // Requête refusée : ni servie ni facturée. La recherche est soldée à
    // zéro, sans quoi sa provision pèserait sur le plafond du mois.
    if (erreur instanceof EchecConnu && erreur.sansFrais) {
      await confirmerRecherche(base, attemptId, { requetes: 0, dollars: "0.000000" });
    }
    throw erreur;
  }

  // La requête a été servie, quelle que soit la suite : elle est inscrite
  // avant tout tri des pages.
  await confirmerRecherche(base, attemptId, { requetes: 1, dollars: enDollars(frais) });

  const sources = retenirSources(
    collecte.resultats,
    profil.collecte.resultatsMax,
    profil.collecte.domaines,
  );
  if (sources.length === 0) {
    throw new EchecConnu("Aucune source exploitable n'a été trouvée pour cette question.");
  }
  return sources;
}

function executeurRecherche(
  base: Base,
  fournisseur: Fournisseur,
  moteur: FournisseurRecherche,
  profil: ProfilRecherche,
): Executeur {
  return async (travail, signal) => {
    const contexte = await lireContexteRecherche(base, travail.attemptId);
    if (contexte === null) {
      throw new EchecConnu("Le projet de cette tâche n'est plus accessible.");
    }

    const sources = await collecter(
      base,
      moteur,
      profil,
      travail.attemptId,
      contexte.question,
      signal,
    );

    // La synthèse : même mécanique que tout texte, sur ces sources-là.
    return creerExecuteur<string>(base, fournisseur, {
      profil,
      preparer: async () => composerDossierRecherche(contexte, sources, profil.objectif),
      lire: (texte) => lireSynthese(texte, sources.length, profil.longueurMax),
      deposer: (attemptId, synthese) =>
        livrerPropositionRecherche(base, attemptId, synthese, sources),
      inexploitable:
        "La réponse du fournisseur n'est pas une synthèse exploitable : elle cite une source absente de la collecte, ou n'en cite aucune.",
    })(travail, signal);
  };
}

/**
 * Fabrique de l'exécuteur de chaque action de SCOUT. Un profil sans fabrique
 * ne serait servi par personne : un test d'architecture les tient accordés.
 */
const FABRIQUES: Readonly<
  Record<
    string,
    (
      base: Base,
      fournisseur: Fournisseur,
      moteur: FournisseurRecherche,
      profil: ProfilRecherche,
    ) => Executeur
  >
> = {
  research: executeurRecherche,
};

/** Ce que SCOUT sait exécuter, avec ce modèle de texte et ce moteur de recherche. */
export function executeursScout(
  base: Base,
  fournisseur: Fournisseur,
  moteur: FournisseurRecherche,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_SCOUT).flatMap(([action, profil]) =>
      FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, moteur, profil)]] : [],
    ),
  );
}

/**
 * Ce que GRIOT sait exécuter. Même exécuteur que SCOUT, sans copie : seuls
 * ses profils diffèrent — une collecte restreinte à une liste de sites, et
 * des consignes d'historien.
 */
export function executeursGriot(
  base: Base,
  fournisseur: Fournisseur,
  moteur: FournisseurRecherche,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_GRIOT).map(([action, profil]) => [
      action,
      executeurRecherche(base, fournisseur, moteur, profil),
    ]),
  );
}
