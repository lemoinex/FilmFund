/**
 * Passerelle IA : le seul fichier du dépôt qui importe le SDK d'un
 * fournisseur d'IA. Une règle de lint et un test d'architecture refusent
 * tout autre import : aucun agent, aucune route, aucun composant n'appelle
 * un fournisseur sans passer par ici.
 *
 * La clé d'API vient du coffre de la base, lue par le registre des agents,
 * jamais du dépôt ni de l'environnement ; elle n'est ni journalisée ni
 * renvoyée.
 */
import Anthropic from "@anthropic-ai/sdk";

import { EchecConnu } from "../executeurs.ts";
import type { ProfilAppel, UsageModele } from "./profils.ts";

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
