/**
 * Export d'un projet, en PDF ou en Word : du contenu remis par la base au
 * fichier déposé.
 *
 * Aucun fournisseur n'est appelé et rien n'est facturé : ces exécuteurs n'ont
 * besoin d'aucune clé, et restent donc en service quel que soit l'état du
 * coffre. Ils ne lisent aucune table : la base leur remet le contenu des
 * seules sections demandées, pour la seule tâche qu'ils tiennent.
 *
 * Le format se lit dans l'action de la tâche (`pdf_export`, `docx_export`),
 * jamais dans ce que la base remet : un même dossier, composé une fois, est
 * ensuite rendu dans l'un ou l'autre format.
 */
import {
  codeDe,
  lireContexteExport,
  livrerExport,
  PARAMETRES_INVALIDES,
  type Base,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import { composerDossier, type Dossier } from "./dossier.ts";
import { rendreDocx } from "./docx.ts";
import { rendrePdf } from "./pdf.ts";

/** Borne de `livrer_export()` : au-delà, la base refuserait le fichier. */
export const TAILLE_MAX_EXPORT = 5 * 1024 * 1024;

/** Fichier rendu ; `pages` nul pour un format qui ne fige pas sa pagination. */
type Rendu = { fichier: Buffer; pages: number | null };

type Rendeur = (dossier: Dossier) => Promise<Rendu>;

const RENDEURS: Readonly<Record<string, Rendeur>> = {
  pdf_export: rendrePdf,
  docx_export: async (dossier) => ({ fichier: await rendreDocx(dossier), pages: null }),
};

function creerExecuteurExport(base: Base, rendre: Rendeur): Executeur {
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

    const { fichier, pages } = await rendre(dossier);
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
  return Object.fromEntries(
    Object.entries(RENDEURS).map(([action, rendre]) => [
      action,
      creerExecuteurExport(base, rendre),
    ]),
  );
}
