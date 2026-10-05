/**
 * VOICE : les dialogues d'une scène.
 *
 * L'agent réécrit les répliques d'un passage du scénario, désigné par la
 * demande. Il ne reçoit pas le scénario entier : la scène, ce qui la
 * précède, et les personnages. La base relit le passage et vérifie qu'il est
 * toujours celui qui a été désigné ; s'il a changé, rien ne part chez le
 * fournisseur.
 *
 * La mécanique de l'appel est celle de WEAVER : provision, appel, coût
 * confirmé, dépôt. Seul son contexte lui est propre.
 */
import {
  lireContexteDialogue,
  livrerProposition,
  type Base,
  type ContexteDialogue,
} from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import { PROFILS_VOICE } from "../ia/profils.ts";

import { creerExecuteur, lireTexte } from "./weaver.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

/**
 * Ce qui est transmis au fournisseur pour une scène : le projet, ses
 * personnages, ce qui précède la scène, la scène, puis l'objectif — en
 * dernier, après la donnée, pour que la demande ne soit pas noyée.
 */
export function composerContexteDialogue(contexte: ContexteDialogue, objectif: string): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  const { projet, personnages } = contexte;
  const blocs = [
    [
      "<projet>",
      champ("Titre", projet.titre),
      champ("Format", lisible(projet.format)),
      champ("Genre", projet.genre && lisible(projet.genre)),
      champ("Pays de production", projet.pays?.join(", ")),
      champ("Langues", projet.langues),
      "</projet>",
    ].join("\n"),
    [
      "<contexte>",
      champ("Pitch", contexte.contexte.pitch),
      champ("Synopsis court", contexte.contexte.synopsis_court),
      champ("Thème", contexte.contexte.theme),
      champ("Enjeux", contexte.contexte.enjeux),
      "</contexte>",
    ].join("\n"),
    [
      "<personnages>",
      ...(personnages.length
        ? personnages.map((personnage) =>
            [
              `- ${personnage.nom} (${lisible(personnage.role)})`,
              personnage.description.trim() ? `  ${personnage.description.trim()}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
        : [ABSENT]),
      "</personnages>",
    ].join("\n"),
    [
      "<ce_qui_precede>",
      contexte.avant.trim() || "(rien : cette scène ouvre le scénario)",
      "</ce_qui_precede>",
    ].join("\n"),
    ["<scene>", contexte.scene, "</scene>"].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/** Ce que VOICE sait exécuter, avec ce fournisseur. */
export function executeursVoice(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_VOICE).map(([action, profil]) => [
      action,
      creerExecuteur<string>(base, fournisseur, {
        profil,
        preparer: async (attemptId) => {
          const contexte = await lireContexteDialogue(base, attemptId);
          return contexte ? composerContexteDialogue(contexte, profil.objectif ?? "") : null;
        },
        lire: (texte) => lireTexte(texte, profil.longueurMax),
        deposer: (attemptId, texte) => livrerProposition(base, attemptId, texte),
        inexploitable: "La réponse du fournisseur n'est pas une scène exploitable.",
      }),
    ]),
  );
}
