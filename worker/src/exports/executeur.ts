/**
 * Export PDF d'un projet : du contenu remis par la base au fichier déposé.
 *
 * Aucun fournisseur n'est appelé et rien n'est facturé : cet exécuteur n'a
 * besoin d'aucune clé, et reste donc en service quel que soit l'état du
 * coffre. Il ne lit aucune table : la base lui remet le contenu des seules
 * sections demandées, pour la seule tâche qu'il tient.
 */
import {
  codeDe,
  lireContexteExport,
  livrerExport,
  PARAMETRES_INVALIDES,
  type Base,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import { composerDossier } from "./dossier.ts";
import { rendrePdf } from "./pdf.ts";

/** Borne de `livrer_export()` : au-delà, la base refuserait le fichier. */
export const TAILLE_MAX_EXPORT = 5 * 1024 * 1024;

function creerExecuteurExport(base: Base): Executeur {
  return async (travail, signal) => {
    let contexte;
    try {
      contexte = await lireContexteExport(base, travail.attemptId);
    } catch (erreur) {
      if (codeDe(erreur) === PARAMETRES_INVALIDES) {
        throw new EchecConnu("La demande d'export ne désigne aucune section connue.");
      }
      throw erreur;
    }
    if (!contexte) {
      throw new EchecConnu("Le projet de cette tâche n'est plus accessible.");
    }

    const dossier = composerDossier(contexte.contenu, new Date());
    // Rien à mettre en page : mieux vaut rendre l'unité qu'un dossier réduit
    // à sa page de garde.
    if (dossier.sections.length === 0) {
      throw new EchecConnu("Aucune des sections demandées n'a de contenu à exporter.");
    }

    const { fichier, pages } = await rendrePdf(dossier);
    if (fichier.length > TAILLE_MAX_EXPORT) {
      throw new EchecConnu("Le dossier dépasse la taille maximale d'un export.");
    }
    // Bail perdu pendant la mise en page : la tâche n'est plus à nous, la
    // base a déjà décidé de son sort.
    if (signal.aborted) {
      return {};
    }

    await livrerExport(base, travail.attemptId, fichier, pages, contexte.empreinte);
    return {};
  };
}

/** Ce que le worker sait exporter. */
export function executeursExport(base: Base): Readonly<Record<string, Executeur>> {
  return { pdf_export: creerExecuteurExport(base) };
}
