/**
 * Registre des agents, tenu d'après le coffre.
 *
 * Les clés des fournisseurs ne sont pas des variables d'environnement : elles
 * sont posées depuis l'écran Intégrations IA. Le registre est donc relu
 * pendant que le worker tourne — poser une clé met l'agent en service, la
 * retirer l'en sort, sans redéploiement.
 *
 * La clé ne quitte jamais cette fermeture : ni journal, ni valeur de retour.
 * Seule sa présence est observable du dehors.
 */
import { executeursArc } from "./agents/arc.ts";
import { executeursField } from "./agents/field.ts";
import { executeursScript } from "./agents/script.ts";
import { executeursWeaver } from "./agents/weaver.ts";
import { lireCleFournisseur, type Base } from "./base.ts";
import type { Evenement, Registre } from "./boucle.ts";
import { creerFournisseurAnthropic, type Fournisseur } from "./ia/passerelle.ts";

export type OptionsRegistre = {
  base: Base;
  journal: (evenement: Evenement) => void;
  /** Doublure des tests : à défaut, le vrai fournisseur Anthropic. */
  creerFournisseur?: (cleApi: string) => Fournisseur;
};

export function registreDesAgents({ base, journal, creerFournisseur }: OptionsRegistre) {
  const creer = creerFournisseur ?? creerFournisseurAnthropic;
  let cleAnthropic: string | null = null;
  let registre: Registre = {};

  async function relire(): Promise<void> {
    const cle = await lireCleFournisseur(base, "anthropic");
    if (cle === cleAnthropic) {
      return;
    }
    cleAnthropic = cle;
    if (cle) {
      const fournisseur = creer(cle);
      registre = {
        ...executeursWeaver(base, fournisseur),
        ...executeursArc(base, fournisseur),
        ...executeursScript(base, fournisseur),
        ...executeursField(base, fournisseur),
      };
    } else {
      registre = {};
    }
    journal({
      niveau: "info",
      evenement: cle ? "cle_fournisseur_chargee" : "cle_fournisseur_retiree",
      fournisseur: "anthropic",
      actions: Object.keys(registre),
    });
  }

  return { relire, lire: (): Registre => registre };
}
