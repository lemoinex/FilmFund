/**
 * Un dossier en archive ZIP : un fichier Word par texte, un classeur Excel par
 * tableau.
 *
 * Même plan que le PDF et le Word (dossier.ts), découpé autrement : chaque
 * pièce sort dans le format où elle se retravaille. La présentation — synthèse
 * et fiche du projet — et chaque document sont rendus par le même dessin que
 * le Word (docx.ts) ; le budget, le plan de financement, le planning, le
 * découpage et le matériel repartent des données de la base, pour que leurs
 * nombres et leurs dates restent des nombres et des dates.
 *
 * Une pièce demandée mais vide est omise, comme dans un dossier : c'est le
 * plan qui en décide, et l'archive ne contient que ce qu'il a retenu.
 */
import JSZip from "jszip";

import { rendreDocx } from "./docx.ts";
import { libelle, type ContenuDossier, type Dossier, type Section } from "./dossier.ts";
import {
  ANGLES,
  CADRAGES,
  CATEGORIES_MATERIEL,
  DECORS,
  ETAPES,
  MOMENTS,
  MOUVEMENTS,
  POSTES,
  STATUTS_ETAPE,
  STATUTS_FINANCEMENT,
  TYPES_FINANCEMENT,
} from "./libelles.ts";
import { date, montant, nombre, rendreXlsx, texte, type FeuilleXlsx } from "./xlsx.ts";

/** Longueur retenue d'un titre dans un nom de fichier. */
const NOM_MAX = 60;

/**
 * Titre réduit à ce qu'un nom de fichier porte partout : minuscules sans
 * accent, chiffres et tirets. Aucun séparateur de dossier ne peut en sortir.
 */
export function nomSur(titre: string): string {
  return titre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NOM_MAX)
    .replace(/-+$/, "");
}

function feuilleBudget(budget: NonNullable<ContenuDossier["budget"]>): FeuilleXlsx {
  const total = budget.lignes.reduce((somme, ligne) => somme + Number(ligne.total), 0);
  return {
    nom: "Budget",
    colonnes: [
      { titre: "Poste", largeur: 34 },
      { titre: "Ligne", largeur: 40 },
      { titre: "Quantité", largeur: 12 },
      { titre: `Coût unitaire (${budget.devise})`, largeur: 22 },
      { titre: `Total (${budget.devise})`, largeur: 22 },
    ],
    lignes: [
      ...budget.lignes.map((ligne) => [
        texte(libelle(POSTES, ligne.poste)),
        texte(ligne.libelle),
        nombre(Number(ligne.quantite)),
        montant(Number(ligne.cout_unitaire)),
        montant(Number(ligne.total)),
      ]),
      [texte("Total", true), null, null, null, montant(total, true)],
    ],
  };
}

function feuilleFinancements(
  financements: NonNullable<ContenuDossier["financements"]>,
): FeuilleXlsx {
  const somme = (valeur: number | null) => (valeur === null ? null : montant(Number(valeur)));

  // Une somme par devise : additionner des francs CFA et des euros n'aurait
  // aucun sens. Rien de renseigné : pas de somme, plutôt qu'un zéro qui se
  // lirait comme un refus.
  const totaux = [...new Set(financements.map((f) => f.devise))].map((devise) => {
    const enDevise = financements.filter((f) => f.devise === devise);
    const total = (cle: "demande" | "accorde") =>
      enDevise.every((f) => f[cle] === null)
        ? null
        : montant(
            enDevise.reduce((cumul, f) => cumul + Number(f[cle] ?? 0), 0),
            true,
          );
    return [
      texte(`Total ${devise}`, true),
      null,
      null,
      null,
      texte(devise, true),
      total("demande"),
      total("accorde"),
      null,
    ];
  });

  return {
    nom: "Plan de financement",
    colonnes: [
      { titre: "Organisme", largeur: 30 },
      { titre: "Programme", largeur: 30 },
      { titre: "Type", largeur: 24 },
      { titre: "Statut", largeur: 14 },
      { titre: "Devise", largeur: 10 },
      { titre: "Demandé", largeur: 20 },
      { titre: "Accordé", largeur: 20 },
      { titre: "Échéance", largeur: 14 },
    ],
    lignes: [
      ...financements.map((f) => [
        texte(f.organisme),
        f.programme.trim() ? texte(f.programme) : null,
        texte(libelle(TYPES_FINANCEMENT, f.type)),
        texte(libelle(STATUTS_FINANCEMENT, f.statut)),
        texte(f.devise),
        somme(f.demande),
        somme(f.accorde),
        f.echeance ? date(f.echeance) : null,
      ]),
      ...totaux,
    ],
  };
}

function feuillePlanning(planning: NonNullable<ContenuDossier["planning"]>): FeuilleXlsx {
  return {
    nom: "Planning",
    colonnes: [
      { titre: "Étape", largeur: 40 },
      { titre: "Phase", largeur: 20 },
      { titre: "Début", largeur: 14 },
      { titre: "Fin", largeur: 14 },
      { titre: "Statut", largeur: 14 },
    ],
    lignes: planning.map((etape) => [
      texte(etape.titre),
      texte(libelle(ETAPES, etape.phase)),
      etape.debut ? date(etape.debut) : null,
      etape.fin ? date(etape.fin) : null,
      texte(libelle(STATUTS_ETAPE, etape.statut)),
    ]),
  };
}

/** La saison : numéro et durée restent des nombres, pour trier et sommer. */
function feuilleEpisodes(episodes: NonNullable<ContenuDossier["episodes"]>): FeuilleXlsx {
  return {
    nom: "Épisodes",
    colonnes: [
      { titre: "Épisode", largeur: 10 },
      { titre: "Titre", largeur: 40 },
      { titre: "Durée (min)", largeur: 12 },
      { titre: "Résumé", largeur: 80 },
    ],
    lignes: episodes.map((episode) => [
      nombre(Number(episode.numero)),
      texte(episode.titre),
      episode.duree === null ? null : nombre(Number(episode.duree)),
      texte(episode.resume),
    ]),
  };
}

/** Une ligne par plan : la scène est redite sur chacune, pour trier et filtrer. */
function feuilleDecoupage(decoupage: NonNullable<ContenuDossier["decoupage"]>): FeuilleXlsx {
  return {
    nom: "Découpage",
    colonnes: [
      { titre: "Scène", largeur: 8 },
      { titre: "Intitulé", largeur: 30 },
      { titre: "Décor", largeur: 20 },
      { titre: "Lieu", largeur: 24 },
      { titre: "Moment", largeur: 12 },
      { titre: "Plan", largeur: 8 },
      { titre: "Cadrage", largeur: 18 },
      { titre: "Focale (mm)", largeur: 12 },
      { titre: "Angle", largeur: 16 },
      { titre: "Mouvement", largeur: 16 },
      { titre: "Durée (s)", largeur: 10 },
      { titre: "Ce que montre le plan", largeur: 60 },
    ],
    lignes: decoupage.flatMap((scene, rang) =>
      (scene.plans ?? []).map((plan, numero) => [
        nombre(rang + 1),
        texte(scene.titre),
        texte(libelle(DECORS, scene.decor)),
        texte(scene.lieu),
        texte(libelle(MOMENTS, scene.moment)),
        nombre(numero + 1),
        texte(libelle(CADRAGES, plan.cadrage)),
        plan.focale === null ? null : nombre(Number(plan.focale)),
        texte(libelle(ANGLES, plan.angle)),
        texte(libelle(MOUVEMENTS, plan.mouvement)),
        plan.duree === null ? null : nombre(Number(plan.duree)),
        texte(plan.description),
      ]),
    ),
  };
}

/** La liste, sans somme : aucun calcul électrique n'entre dans un dossier. */
function feuilleMateriel(materiel: NonNullable<ContenuDossier["materiel"]>): FeuilleXlsx {
  return {
    nom: "Matériel",
    colonnes: [
      { titre: "Catégorie", largeur: 16 },
      { titre: "Équipement", largeur: 60 },
      { titre: "Quantité", largeur: 10 },
      { titre: "Puissance unitaire (W)", largeur: 22 },
    ],
    lignes: materiel.map((ligne) => [
      texte(libelle(CATEGORIES_MATERIEL, ligne.categorie)),
      texte(ligne.designation),
      nombre(Number(ligne.quantite)),
      ligne.puissance === null ? null : nombre(Number(ligne.puissance)),
    ]),
  };
}

/** Fichier d'une archive : son chemin, et de quoi le fabriquer. */
type Piece = { chemin: string; fabriquer: () => Promise<Buffer> };

/**
 * Plan de l'archive, dans l'ordre d'un dossier : la présentation, les
 * documents, puis les tableaux. Seules les sections que le plan du dossier a
 * retenues y entrent.
 */
function pieces(dossier: Dossier, contenu: ContenuDossier): Piece[] {
  const retenues = (origine: Section["origine"]) =>
    dossier.sections.filter((section) => section.origine === origine);
  const word = (sections: Section[]) => () => rendreDocx({ ...dossier, sections });
  const liste: Piece[] = [];

  const presentation = [...retenues("synthese"), ...retenues("fiche_projet")];
  if (presentation.length) {
    liste.push({ chemin: "presentation.docx", fabriquer: word(presentation) });
  }

  // Numérotés dans l'ordre du dossier : deux documents de même titre ne se
  // recouvrent pas, et l'ordre se lit dans le dossier ouvert.
  retenues("document").forEach((section, rang) => {
    const numero = String(rang + 1).padStart(2, "0");
    const nom = [numero, nomSur(section.surTitre ?? ""), nomSur(section.titre)]
      .filter(Boolean)
      .join("-");
    liste.push({ chemin: `documents/${nom}.docx`, fabriquer: word([section]) });
  });

  const { episodes, budget, financements, planning, decoupage, materiel } = contenu;
  if (episodes && retenues("episodes").length) {
    liste.push({ chemin: "episodes.xlsx", fabriquer: () => rendreXlsx(feuilleEpisodes(episodes)) });
  }
  if (budget && retenues("budget").length) {
    liste.push({ chemin: "budget.xlsx", fabriquer: () => rendreXlsx(feuilleBudget(budget)) });
  }
  if (financements && retenues("financements").length) {
    liste.push({
      chemin: "plan-de-financement.xlsx",
      fabriquer: () => rendreXlsx(feuilleFinancements(financements)),
    });
  }
  if (planning && retenues("planning").length) {
    liste.push({ chemin: "planning.xlsx", fabriquer: () => rendreXlsx(feuillePlanning(planning)) });
  }
  if (decoupage && retenues("decoupage").length) {
    liste.push({
      chemin: "decoupage.xlsx",
      fabriquer: () => rendreXlsx(feuilleDecoupage(decoupage)),
    });
  }
  if (materiel && retenues("materiel").length) {
    liste.push({ chemin: "materiel.xlsx", fabriquer: () => rendreXlsx(feuilleMateriel(materiel)) });
  }

  return liste;
}

/**
 * Fabrique l'archive. Les fichiers Word et Excel sont déjà des archives
 * compressées : ils y sont rangés tels quels.
 */
export async function rendreArchive(dossier: Dossier, contenu: ContenuDossier): Promise<Buffer> {
  const archive = new JSZip();
  for (const piece of pieces(dossier, contenu)) {
    archive.file(piece.chemin, await piece.fabriquer());
  }
  return archive.generateAsync({ type: "nodebuffer", compression: "STORE" });
}
