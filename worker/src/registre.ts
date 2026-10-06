/**
 * Registre des agents, tenu d'après le coffre.
 *
 * Les clés des fournisseurs ne sont pas des variables d'environnement : elles
 * sont posées depuis l'écran Intégrations IA. Le registre est donc relu
 * pendant que le worker tourne — poser une clé met l'agent en service, la
 * retirer l'en sort, sans redéploiement.
 *
 * Deux fournisseurs, deux clés, indépendantes : celle d'Anthropic sert les
 * agents de texte, celle d'OpenAI le seul agent d'image. Retirer l'une ne
 * sort pas les agents de l'autre.
 *
 * Aucune clé ne quitte cette fermeture : ni journal, ni valeur de retour.
 * Seule sa présence est observable du dehors.
 */
import { executeursArc } from "./agents/arc.ts";
import { executeursBoard } from "./agents/board.ts";
import { executeursField } from "./agents/field.ts";
import { executeursFrame } from "./agents/frame.ts";
import { executeursGear } from "./agents/gear.ts";
import { executeursScript } from "./agents/script.ts";
import { executeursVoice } from "./agents/voice.ts";
import { executeursWeaver } from "./agents/weaver.ts";
import { lireCleFournisseur, type Base } from "./base.ts";
import type { Evenement, Registre } from "./boucle.ts";
import {
  creerFournisseurAnthropic,
  creerFournisseurImagesOpenAI,
  type Fournisseur,
  type FournisseurImages,
} from "./ia/passerelle.ts";

export type OptionsRegistre = {
  base: Base;
  journal: (evenement: Evenement) => void;
  /** Doublure des tests : à défaut, le vrai fournisseur Anthropic. */
  creerFournisseur?: (cleApi: string) => Fournisseur;
  /** Doublure des tests : à défaut, le vrai fournisseur d'images d'OpenAI. */
  creerFournisseurImages?: (cleApi: string) => FournisseurImages;
};

export function registreDesAgents({
  base,
  journal,
  creerFournisseur,
  creerFournisseurImages,
}: OptionsRegistre) {
  const creer = creerFournisseur ?? creerFournisseurAnthropic;
  const creerImages = creerFournisseurImages ?? creerFournisseurImagesOpenAI;
  let cleAnthropic: string | null = null;
  let cleOpenAI: string | null = null;
  let texte: Registre = {};
  let image: Registre = {};

  async function relire(): Promise<void> {
    const cle = await lireCleFournisseur(base, "anthropic");
    if (cle !== cleAnthropic) {
      cleAnthropic = cle;
      if (cle) {
        const fournisseur = creer(cle);
        texte = {
          ...executeursWeaver(base, fournisseur),
          ...executeursArc(base, fournisseur),
          ...executeursScript(base, fournisseur),
          ...executeursVoice(base, fournisseur),
          ...executeursField(base, fournisseur),
          ...executeursFrame(base, fournisseur),
          ...executeursGear(base, fournisseur),
        };
      } else {
        texte = {};
      }
      journal({
        niveau: "info",
        evenement: cle ? "cle_fournisseur_chargee" : "cle_fournisseur_retiree",
        fournisseur: "anthropic",
        actions: Object.keys(texte),
      });
    }

    const cleImages = await lireCleFournisseur(base, "openai");
    if (cleImages !== cleOpenAI) {
      cleOpenAI = cleImages;
      image = cleImages ? { ...executeursBoard(base, creerImages(cleImages)) } : {};
      journal({
        niveau: "info",
        evenement: cleImages ? "cle_fournisseur_chargee" : "cle_fournisseur_retiree",
        fournisseur: "openai",
        actions: Object.keys(image),
      });
    }
  }

  return { relire, lire: (): Registre => ({ ...texte, ...image }) };
}
