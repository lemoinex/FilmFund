/**
 * BOARD : vignettes du storyboard.
 *
 * Il dessine une scène à la fois — une image par demande —, que l'équipe
 * accepte ou écarte. Croquis à l'encre noire sur fond blanc, et rien
 * d'autre : la contrainte tient au profil, que cet agent ne fait que
 * reprendre. Plans, focales et annotations restent des données du
 * découpage : rien n'en est écrit dans l'image.
 *
 * La mécanique est celle des autres agents — provision, appel, coût
 * confirmé, dépôt —, mais le fournisseur n'est pas le même et ce qu'il rend
 * est un fichier : elle est donc écrite ici, plutôt que pliée dans celle des
 * textes.
 */
import {
  codeDe,
  confirmerCout,
  lireContexteImage,
  livrerPropositionImage,
  PLAFOND_ATTEINT,
  provisionnerCout,
  type Base,
  type ContexteImage,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import type { FournisseurImages } from "../ia/passerelle.ts";
import {
  coutMicroDollars,
  enDollars,
  estimerJetons,
  PROFILS_BOARD,
  type ProfilImage,
} from "../ia/profils.ts";

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

/** Signature d'un fichier PNG, et la borne de la base au dépôt. */
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024;

/** Longueur retenue de la vision artistique dans une demande d'image. */
const VISION_MAX = 1500;

const lisible = (code: string) => code.replaceAll("_", " ");

function champ(libelle: string, valeur: string | null | undefined): string {
  return `${libelle} : ${(valeur ?? "").trim() || ABSENT}`;
}

/**
 * Ce qui est demandé au fournisseur : le style d'abord, imposé par le
 * profil, puis la scène, puis de nouveau ce que l'image ne doit pas
 * contenir — une consigne redite en fin de demande pèse davantage.
 */
export function composerConsigne(contexte: ContexteImage, profil: ProfilImage): string {
  const { projet, scene, plans } = contexte;
  return [
    profil.style,
    [
      "<scene>",
      champ("Intitulé", scene.titre),
      champ("Décor", lisible(scene.decor)),
      champ("Lieu", scene.lieu),
      champ("Moment", scene.moment),
      champ("Cadrage principal", scene.cadrage && lisible(scene.cadrage)),
      champ("Ce que l'on voit", scene.description),
      "</scene>",
    ].join("\n"),
    [
      "<plans>",
      ...(plans.length
        ? plans.map(
            (plan) =>
              `- ${lisible(plan.cadrage)}, ${lisible(plan.angle)} : ${plan.description.trim() || ABSENT}`,
          )
        : ["(aucun plan décrit)"]),
      "</plans>",
    ].join("\n"),
    [
      "<projet>",
      champ("Genre", projet.genre && lisible(projet.genre)),
      // L'ambiance, pas le récit : un extrait borné de la vision artistique.
      champ("Vision artistique", projet.vision.slice(0, VISION_MAX)),
      "</projet>",
    ].join("\n"),
    profil.interdits,
  ].join("\n\n");
}

/** Vrai pour un fichier PNG dans les bornes de la base. */
export function estVignetteValide(image: Buffer): boolean {
  return (
    image.length >= SIGNATURE_PNG.length &&
    image.length <= TAILLE_MAX_IMAGE &&
    image.subarray(0, SIGNATURE_PNG.length).equals(SIGNATURE_PNG)
  );
}

function executeurVignette(
  base: Base,
  fournisseur: FournisseurImages,
  profil: ProfilImage,
): Executeur {
  return async (travail, signal) => {
    const contexte = await lireContexteImage(base, travail.attemptId);
    if (contexte === null) {
      throw new EchecConnu("La scène de cette tâche n'est plus accessible.");
    }
    const consigne = composerConsigne(contexte, profil);

    // Provision au pire : toute la consigne, et le plafond du profil pour
    // l'image — un plafond choisi, pas une mesure.
    const pire = [
      {
        modele: profil.modele,
        jetonsEntree: estimerJetons(consigne),
        jetonsSortie: profil.jetonsImageMax,
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

    let reponse;
    try {
      reponse = await fournisseur({ profil, consigne }, signal);
    } catch (erreur) {
      // Requête refusée : ni traitée ni facturée. Le coût est soldé à zéro,
      // sans quoi la provision pèserait sur le plafond du mois.
      if (erreur instanceof EchecConnu && erreur.sansFrais) {
        await confirmerCout(base, travail.attemptId, {
          modele: profil.modele,
          jetonsEntree: 0,
          jetonsSortie: 0,
          dollars: "0.000000",
          repli: false,
        });
      }
      throw erreur;
    }

    // La dépense a eu lieu, quelle que soit la suite : elle est inscrite
    // avant tout contrôle du fichier. Sans usage rapporté, le montant est
    // laissé à rapprocher plutôt qu'inventé.
    const cout = reponse.usages ? coutMicroDollars(reponse.usages) : null;
    await confirmerCout(base, travail.attemptId, {
      modele: reponse.modeleServi,
      jetonsEntree: (reponse.usages ?? []).reduce((total, u) => total + u.jetonsEntree, 0),
      jetonsSortie: (reponse.usages ?? []).reduce((total, u) => total + u.jetonsSortie, 0),
      dollars: cout === null ? null : enDollars(cout),
      repli: false,
    });

    if (!estVignetteValide(reponse.image)) {
      throw new EchecConnu("La réponse du fournisseur n'est pas une image exploitable.");
    }

    await livrerPropositionImage(base, travail.attemptId, reponse.image);
    return {};
  };
}

/**
 * Fabrique de l'exécuteur de chaque action de BOARD. Un profil sans fabrique
 * ne serait servi par personne : un test d'architecture les tient accordés.
 */
const FABRIQUES: Readonly<
  Record<string, (base: Base, fournisseur: FournisseurImages, profil: ProfilImage) => Executeur>
> = {
  storyboard_image: executeurVignette,
};

/** Ce que BOARD sait exécuter, avec ce fournisseur d'images. */
export function executeursBoard(
  base: Base,
  fournisseur: FournisseurImages,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_BOARD).flatMap(([action, profil]) =>
      FABRIQUES[action] ? [[action, FABRIQUES[action](base, fournisseur, profil)]] : [],
    ),
  );
}
