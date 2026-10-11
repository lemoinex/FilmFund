/**
 * Un personnage, tel qu'un agent le lit dans son message.
 *
 * Une seule écriture pour WEAVER, SCRIPT, VOICE et ARC : le nom et le rôle,
 * la description, puis les champs remplis de la fiche détaillée (lot PF1).
 * La base ne transmet pas un champ vide, et rien n'est écrit pour lui : un
 * personnage sans fiche détaillée s'écrit exactement comme avant ce lot.
 */
import type { Personnage } from "../base.ts";

/** Champs de la fiche détaillée, dans l'ordre où un agent les lit. */
const CHAMPS_FICHE = [
  ["age", "Âge"],
  ["occupation", "Occupation"],
  ["apparence", "Apparence physique"],
  ["objectif", "Objectif"],
  ["obstacle", "Obstacle"],
  ["arc", "Arc"],
  ["traits", "Traits"],
  ["liens", "Liens"],
] as const satisfies readonly (readonly [keyof Personnage, string])[];

const lisible = (code: string) => code.replaceAll("_", " ");

export function ecrirePersonnage(personnage: Personnage): string {
  const description = personnage.description.trim();
  return [
    `- ${personnage.nom} (${lisible(personnage.role)})`,
    description ? `  ${description}` : null,
    ...CHAMPS_FICHE.map(([cle, libelle]) => {
      const valeur = personnage[cle]?.trim();
      return valeur ? `  ${libelle} : ${valeur}` : null;
    }),
  ]
    .filter(Boolean)
    .join("\n");
}
