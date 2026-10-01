/**
 * WEAVER : logline, synopsis et note d'intention. Ce lot n'ouvre que la
 * logline.
 *
 * L'agent ne connaît ni la clé d'API ni le SDK : il reçoit un fournisseur de
 * la passerelle. Les tests lui en donnent un factice, désigné comme tel.
 */
import {
  codeDe,
  confirmerCout,
  lireContexte,
  livrerProposition,
  PLAFOND_ATTEINT,
  provisionnerCout,
  type Base,
  type Fiche,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import {
  coutMicroDollars,
  enDollars,
  estimerJetons,
  PROFIL_LOGLINE,
  type Profil,
} from "../ia/profils.ts";

/** Limite de la colonne `projects.logline`. */
const LOGLINE_MAX = 500;

/**
 * Ce qui est transmis au fournisseur : la fiche du projet, et rien d'autre.
 * Les balises séparent la donnée des consignes du profil.
 */
export function composerFiche(fiche: Fiche): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  return [
    "<fiche>",
    `Titre : ${fiche.titre}`,
    `Format : ${lisible(fiche.format)}`,
    `Étape : ${lisible(fiche.etape)}`,
    `Logline actuelle : ${fiche.logline.trim() || "(aucune)"}`,
    `Synopsis : ${fiche.synopsis.trim() || "(aucun)"}`,
    "</fiche>",
  ].join("\n");
}

/**
 * Remet la réponse en une logline : un seul paragraphe, sans les guillemets
 * dont un modèle l'entoure parfois. Null si ce n'en est pas une.
 */
export function lireLogline(texte: string): string | null {
  const nette = texte
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[«"“]\s*/, "")
    .replace(/\s*[»"”]$/, "")
    .trim();
  return nette.length >= 1 && nette.length <= LOGLINE_MAX ? nette : null;
}

function creerExecuteurLogline(base: Base, fournisseur: Fournisseur, profil: Profil): Executeur {
  return async (travail, signal) => {
    const fiche = await lireContexte(base, travail.attemptId);
    if (!fiche) {
      throw new EchecConnu("Le projet de cette tâche n'est plus accessible.");
    }
    const message = composerFiche(fiche);

    // Provision au pire : toute l'entrée, et le plafond de sortie.
    const pire = [
      {
        modele: profil.modele,
        jetonsEntree: estimerJetons(profil.systeme + message),
        jetonsSortie: profil.jetonsMax,
      },
    ];
    try {
      await provisionnerCout(base, travail.attemptId, {
        fournisseur: profil.fournisseur,
        modele: profil.modele,
        profil: profil.id,
        jetonsEntree: pire[0].jetonsEntree,
        jetonsSortie: pire[0].jetonsSortie,
        dollars: enDollars(coutMicroDollars(pire) ?? 0),
      });
    } catch (erreur) {
      if (codeDe(erreur) === PLAFOND_ATTEINT) {
        throw new EchecConnu("Plafond mensuel des dépenses d'IA atteint.");
      }
      throw erreur;
    }

    const reponse = await fournisseur({ profil, message }, signal);

    // La dépense a eu lieu, quelle que soit la suite : elle est inscrite
    // avant tout contrôle de la réponse.
    const cout = coutMicroDollars(reponse.usages);
    await confirmerCout(base, travail.attemptId, {
      modele: reponse.modeleServi,
      jetonsEntree: reponse.usages.reduce((total, u) => total + u.jetonsEntree, 0),
      jetonsSortie: reponse.usages.reduce((total, u) => total + u.jetonsSortie, 0),
      dollars: cout === null ? null : enDollars(cout),
      repli: reponse.repli,
    });

    if (reponse.arret === "refus") {
      throw new EchecConnu("Le fournisseur a décliné cette demande.");
    }
    if (reponse.arret !== "fin") {
      throw new EchecConnu("La réponse du fournisseur est incomplète.");
    }
    const logline = lireLogline(reponse.texte);
    if (!logline) {
      throw new EchecConnu("La réponse du fournisseur n'est pas une logline exploitable.");
    }

    await livrerProposition(base, travail.attemptId, logline);
    return {};
  };
}

/** Ce que WEAVER sait exécuter, avec ce fournisseur. */
export function executeursWeaver(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return { logline: creerExecuteurLogline(base, fournisseur, PROFIL_LOGLINE) };
}
