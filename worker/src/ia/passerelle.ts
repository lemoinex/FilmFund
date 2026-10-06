/**
 * Passerelle IA : le seul fichier du dépôt qui importe le SDK d'un
 * fournisseur d'IA, et le seul qui en nomme l'adresse. Une règle de lint et
 * un test d'architecture refusent tout autre import : aucun agent, aucune
 * route, aucun composant n'appelle un fournisseur sans passer par ici.
 *
 * Trois fournisseurs : Anthropic pour le texte, par son SDK ; OpenAI pour
 * l'image et Perplexity pour la recherche, chacun par une requête HTTPS
 * écrite ici — une seule adresse, fixe, sans dépendance de plus.
 *
 * La clé d'API vient du coffre de la base, lue par le registre des agents,
 * jamais du dépôt ni de l'environnement ; elle n'est ni journalisée ni
 * renvoyée.
 */
import Anthropic from "@anthropic-ai/sdk";

import { EchecConnu } from "../executeurs.ts";
import type { ProfilAppel, ProfilImage, ProfilRecherche, UsageModele } from "./profils.ts";

export type DemandeIA = {
  profil: ProfilAppel;
  /** Contenu du tour utilisateur : le contexte du projet, mis en forme par l'agent. */
  message: string;
};

export type ReponseIA = {
  texte: string;
  /** Fin normale, refus de sécurité, réponse tronquée, ou autre arrêt. */
  arret: "fin" | "refus" | "tronque" | "autre";
  modeleServi: string;
  /** Vrai si un modèle de repli a répondu à la place du modèle demandé. */
  repli: boolean;
  /** Ce que le fournisseur facture, par modèle : la base du coût confirmé. */
  usages: UsageModele[];
};

/**
 * Interroge un fournisseur. Deux façons d'échouer, que la boucle du worker
 * traite différemment :
 *   - `EchecConnu` : le fournisseur a répondu par une erreur — rien n'a été
 *     produit ;
 *   - toute autre erreur : coupure, délai dépassé, interruption — on ne sait
 *     pas ce qu'il a fait, et rien ne doit être relancé à l'aveugle.
 */
export type Fournisseur = (demande: DemandeIA, signal: AbortSignal) => Promise<ReponseIA>;

/** Trois minutes : au-delà, l'issue est tenue pour inconnue. */
const DELAI_MS = 180_000;

export function creerFournisseurAnthropic(cleApi: string): Fournisseur {
  /*
   * Aucun réessai automatique : le SDK relancerait de lui-même après une
   * coupure, au risque de faire travailler — et facturer — le fournisseur
   * deux fois. La reprise est décidée par la base : une seule, et seulement
   * après un échec établi.
   */
  const client = new Anthropic({ apiKey: cleApi, maxRetries: 0, timeout: DELAI_MS });

  return async ({ profil, message }, signal) => {
    let reponse: Anthropic.Beta.Messages.BetaMessage;
    try {
      reponse = await client.beta.messages.create(
        {
          model: profil.modele,
          max_tokens: profil.jetonsMax,
          // Sur un refus de sécurité, Anthropic rejoue la demande sur le
          // modèle de repli qu'il recommande, dans le même appel.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          // Un profil structuré contraint la réponse à son schéma ; le worker
          // et la base la contrôlent encore, le schéma ne bornant ni les
          // nombres ni les longueurs.
          output_config: {
            effort: profil.effort,
            ...(profil.schema ? { format: { type: "json_schema", schema: profil.schema } } : {}),
          },
          system: profil.systeme,
          messages: [{ role: "user", content: message }],
        },
        { signal },
      );
    } catch (erreur) {
      // Interruption, coupure ou délai : issue inconnue, on laisse remonter.
      // À tester avant APIError, dont elles héritent.
      if (
        erreur instanceof Anthropic.APIUserAbortError ||
        erreur instanceof Anthropic.APIConnectionError
      ) {
        throw erreur;
      }
      // Le fournisseur a répondu par une erreur : rien n'a été produit. Le
      // message ne reprend pas son texte, lu ensuite par l'équipe du projet ;
      // le détail part au journal du worker, que seul l'exploitant lit. Sans
      // lui, une requête refusée resterait indéchiffrable.
      if (erreur instanceof Anthropic.APIError) {
        throw new EchecConnu(`Le fournisseur a répondu par une erreur (${erreur.status}).`, {
          detail: erreur.message,
          // 4xx : la requête est refusée, donc ni traitée ni facturée. Un 429
          // ou un 5xx peut survenir après un début de traitement.
          sansFrais:
            typeof erreur.status === "number" && erreur.status >= 400 && erreur.status < 429,
        });
      }
      throw erreur;
    }

    const texte = reponse.content
      .flatMap((bloc) => (bloc.type === "text" ? [bloc.text] : []))
      .join("");

    // Le détail par tentative fait foi pour la facturation ; à défaut, le
    // total de la réponse, imputé au modèle qui l'a produite.
    const iterations = (reponse.usage.iterations ?? []).flatMap((entree) =>
      entree.type === "message" || entree.type === "fallback_message" ? [entree] : [],
    );
    const usages: UsageModele[] = iterations.length
      ? iterations.map((entree) => ({
          modele: entree.model ?? reponse.model,
          jetonsEntree:
            entree.input_tokens +
            entree.cache_creation_input_tokens +
            entree.cache_read_input_tokens,
          jetonsSortie: entree.output_tokens,
        }))
      : [
          {
            modele: reponse.model,
            jetonsEntree:
              reponse.usage.input_tokens +
              (reponse.usage.cache_creation_input_tokens ?? 0) +
              (reponse.usage.cache_read_input_tokens ?? 0),
            jetonsSortie: reponse.usage.output_tokens,
          },
        ];

    return {
      texte,
      arret:
        reponse.stop_reason === "end_turn"
          ? "fin"
          : reponse.stop_reason === "refusal"
            ? "refus"
            : reponse.stop_reason === "max_tokens"
              ? "tronque"
              : "autre",
      modeleServi: reponse.model,
      repli: iterations.some((entree) => entree.type === "fallback_message"),
      usages,
    };
  };
}

export type DemandeImage = {
  profil: ProfilImage;
  /** Ce qu'il faut dessiner : le style du profil, puis la scène, mis en forme par l'agent. */
  consigne: string;
};

export type ReponseImage = {
  /** Le fichier, tel que le fournisseur l'a rendu : contrôlé par l'agent, puis par la base. */
  image: Buffer;
  modeleServi: string;
  /** Ce que le fournisseur facture ; null s'il ne l'a pas rapporté : coût à rapprocher. */
  usages: UsageModele[] | null;
};

/** Mêmes deux façons d'échouer que `Fournisseur`. */
export type FournisseurImages = (
  demande: DemandeImage,
  signal: AbortSignal,
) => Promise<ReponseImage>;

/** La seule adresse d'OpenAI que le worker connaisse. */
const ADRESSE_IMAGES_OPENAI = "https://api.openai.com/v1/images/generations";

/**
 * Taille maximale de la réponse : une image de 5 Mo encodée en base64, et
 * de la marge. Au-delà, la réponse n'est pas lue.
 */
const REPONSE_IMAGE_MAX = 12 * 1024 * 1024;

/**
 * Vrai si le corps d'une erreur d'OpenAI dit que le compte n'a plus de
 * crédits. Seuls le type et le code de l'erreur sont lus — jamais son
 * message, qui peut changer. Un corps illisible ne dit rien : le doute reste.
 */
function estRefusFauteDeCredits(corps: string): boolean {
  let erreur: { type?: unknown; code?: unknown } | undefined;
  try {
    erreur = (JSON.parse(corps) as { error?: { type?: unknown; code?: unknown } } | null)?.error;
  } catch {
    return false;
  }
  return (
    erreur?.type === "insufficient_quota" ||
    erreur?.code === "insufficient_quota" ||
    erreur?.code === "credit_balance_exhausted"
  );
}

export function creerFournisseurImagesOpenAI(cleApi: string): FournisseurImages {
  return async ({ profil, consigne }, signal) => {
    /*
     * Aucun réessai, aucune redirection suivie : une seule requête, vers une
     * seule adresse. Une coupure ou un délai dépassé laisse l'issue inconnue,
     * et remonte tel quel — la reprise est décidée par la base.
     */
    const reponse = await fetch(ADRESSE_IMAGES_OPENAI, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(DELAI_MS)]),
      headers: { authorization: `Bearer ${cleApi}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: profil.modele,
        prompt: consigne,
        n: 1,
        size: profil.taille,
        quality: profil.qualite,
        output_format: "png",
        background: "opaque",
      }),
    });

    if (!reponse.ok) {
      // Le fournisseur a répondu par une erreur : rien n'a été produit. Son
      // texte part au journal du worker, jamais sur la tâche.
      const detail = (await reponse.text().catch(() => "")).slice(0, 2000);
      // Compte sans crédits : OpenAI le dit par un 429, comme une limite de
      // débit, mais n'a rien traité. Sans cette distinction, la provision de
      // chaque refus pèserait sur le plafond du mois sans avoir rien coûté.
      const sansCredits = reponse.status === 429 && estRefusFauteDeCredits(detail);
      throw new EchecConnu(
        sansCredits
          ? "Le compte du fournisseur n'a plus de crédits : rien n'a été produit ni facturé."
          : `Le fournisseur a répondu par une erreur (${reponse.status}).`,
        {
          detail,
          // 4xx : la requête est refusée, donc ni traitée ni facturée. Un
          // autre 429 ou un 5xx peut survenir après un début de traitement.
          sansFrais: sansCredits || (reponse.status >= 400 && reponse.status < 429),
        },
      );
    }

    const annonce = Number(reponse.headers.get("content-length") ?? 0);
    if (annonce > REPONSE_IMAGE_MAX) {
      throw new EchecConnu("La réponse du fournisseur dépasse la taille admise.");
    }
    const brut = Buffer.from(await reponse.arrayBuffer());
    if (brut.length > REPONSE_IMAGE_MAX) {
      throw new EchecConnu("La réponse du fournisseur dépasse la taille admise.");
    }

    let corps: {
      data?: { b64_json?: unknown }[];
      usage?: { input_tokens?: unknown; output_tokens?: unknown };
    };
    try {
      corps = JSON.parse(brut.toString("utf8"));
    } catch {
      throw new EchecConnu("La réponse du fournisseur est illisible.");
    }
    const encodee = corps.data?.[0]?.b64_json;
    if (typeof encodee !== "string" || !encodee) {
      throw new EchecConnu("La réponse du fournisseur ne contient aucune image.");
    }

    const entree = corps.usage?.input_tokens;
    const sortie = corps.usage?.output_tokens;
    return {
      image: Buffer.from(encodee, "base64"),
      modeleServi: profil.modele,
      usages:
        typeof entree === "number" && typeof sortie === "number"
          ? [{ modele: profil.modele, jetonsEntree: entree, jetonsSortie: sortie }]
          : null,
    };
  };
}

export type DemandeRecherche = {
  profil: ProfilRecherche;
  /** La question, et elle seule : rien d'autre du projet ne part chez le moteur. */
  question: string;
};

/** Une page rendue par le moteur, telle quelle : contrôlée par l'agent, puis par la base. */
export type ResultatRecherche = {
  titre: string;
  adresse: string;
  extrait: string;
  date: string | null;
};

export type ReponseRecherche = { resultats: ResultatRecherche[] };

/** Mêmes deux façons d'échouer que `Fournisseur`. */
export type FournisseurRecherche = (
  demande: DemandeRecherche,
  signal: AbortSignal,
) => Promise<ReponseRecherche>;

/** La seule adresse de Perplexity que le worker connaisse. */
const ADRESSE_RECHERCHE_PERPLEXITY = "https://api.perplexity.ai/search";

/** Une minute : une recherche ne rédige rien, elle n'a pas à durer. */
const DELAI_RECHERCHE_MS = 60_000;

/** Taille maximale de la réponse : au-delà, elle n'est pas lue. */
const REPONSE_RECHERCHE_MAX = 2 * 1024 * 1024;

export function creerFournisseurRecherchePerplexity(cleApi: string): FournisseurRecherche {
  return async ({ profil, question }, signal) => {
    /*
     * Aucun réessai, aucune redirection suivie : une seule requête, vers une
     * seule adresse. Le worker ne visite aucune des pages rendues. Une
     * coupure ou un délai dépassé laisse l'issue inconnue, et remonte tel
     * quel — la reprise est décidée par la base.
     */
    const reponse = await fetch(ADRESSE_RECHERCHE_PERPLEXITY, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(DELAI_RECHERCHE_MS)]),
      headers: { authorization: `Bearer ${cleApi}`, "content-type": "application/json" },
      body: JSON.stringify({
        query: question,
        max_results: profil.collecte.resultatsMax,
        max_tokens_per_page: profil.collecte.jetonsParPage,
      }),
    });

    if (!reponse.ok) {
      // Le moteur a répondu par une erreur : rien n'a été collecté. Son texte
      // part au journal du worker, jamais sur la tâche.
      const detail = (await reponse.text().catch(() => "")).slice(0, 2000);
      throw new EchecConnu(`Le fournisseur a répondu par une erreur (${reponse.status}).`, {
        detail,
        // Perplexity facture les requêtes servies, et dit ne pas facturer un
        // 429 : tout refus 4xx est sans frais. Un 5xx reste douteux.
        sansFrais: reponse.status >= 400 && reponse.status < 500,
      });
    }

    const annonce = Number(reponse.headers.get("content-length") ?? 0);
    if (annonce > REPONSE_RECHERCHE_MAX) {
      throw new EchecConnu("La réponse du fournisseur dépasse la taille admise.");
    }
    const brut = Buffer.from(await reponse.arrayBuffer());
    if (brut.length > REPONSE_RECHERCHE_MAX) {
      throw new EchecConnu("La réponse du fournisseur dépasse la taille admise.");
    }

    let corps: { results?: unknown } | null;
    try {
      corps = JSON.parse(brut.toString("utf8"));
    } catch {
      throw new EchecConnu("La réponse du fournisseur est illisible.");
    }
    if (!Array.isArray(corps?.results)) {
      throw new EchecConnu("La réponse du fournisseur ne contient aucune liste de résultats.");
    }

    // Seules les entrées bien formées passent ; leur contenu, lui, reste à
    // contrôler.
    const resultats = (corps.results as unknown[]).flatMap((entree): ResultatRecherche[] => {
      const { title, url, snippet, date } = (entree ?? {}) as Record<string, unknown>;
      return typeof title === "string" && typeof url === "string" && typeof snippet === "string"
        ? [
            {
              titre: title,
              adresse: url,
              extrait: snippet,
              date: typeof date === "string" ? date : null,
            },
          ]
        : [];
    });
    return { resultats };
  };
}
