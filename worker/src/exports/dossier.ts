/**
 * Composition d'un dossier : du contenu remis par la base au plan du
 * document — page de garde, sections, textes et tableaux.
 *
 * Module pur : ni base, ni PDF. La mise en page (pdf.ts) ne décide de rien,
 * elle dessine ce que ce plan décrit ; c'est donc ici que se lit, et se
 * teste, ce qu'un dossier contient.
 */
import {
  ANGLES,
  CADRAGES,
  CATEGORIES_MATERIEL,
  DECORS,
  ETAPES,
  FORMATS,
  GENRES,
  MOMENTS,
  MOUVEMENTS,
  POSTES,
  ROLES_PERSONNAGE,
  STATUTS_ETAPE,
  STATUTS_FINANCEMENT,
  TYPES_DOCUMENT,
  TYPES_FINANCEMENT,
} from "./libelles.ts";
import { estMisEnForme } from "./mise-en-forme.ts";

/**
 * Ce que `contexte_export()` remet : de quoi dresser la page de garde
 * (`fiche`), puis les seules sections demandées.
 */
export type ContenuDossier = {
  demande: { sections: string[]; documents: string[] };
  fiche: { titre: string; format: string; etape: string };
  synthese?: { pitch: string; synopsis: string };
  /** La fiche de l'assistant de création, personnages compris. */
  fiche_projet?: {
    genre: string | null;
    /** Codes ISO 3166-1 ; le premier est le pays principal. */
    pays: string[];
    langues: string;
    duree: number | null;
    synopsis_court: string;
    theme: string;
    enjeux: string;
    vision: string;
    objectifs: string;
    public: string;
    personnages: { nom: string; role: string; description: string }[];
  };
  documents?: { type: string; titre: string; contenu: string }[];
  /** Nul : le budget du projet n'a pas été ouvert. */
  budget?: {
    devise: string;
    lignes: {
      poste: string;
      libelle: string;
      quantite: number;
      cout_unitaire: number;
      total: number;
    }[];
  } | null;
  financements?: {
    organisme: string;
    programme: string;
    type: string;
    statut: string;
    devise: string;
    demande: number | null;
    accorde: number | null;
    echeance: string | null;
  }[];
  planning?: {
    titre: string;
    phase: string;
    debut: string | null;
    fin: string | null;
    statut: string;
  }[];
  /** Les seules scènes qui ont des plans, dans l'ordre du film. */
  decoupage?: {
    titre: string;
    decor: string;
    lieu: string;
    moment: string;
    plans: {
      cadrage: string;
      focale: number | null;
      angle: string;
      mouvement: string;
      duree: number | null;
      description: string;
    }[];
  }[];
  /** La liste des équipements, sans aucun calcul électrique. */
  materiel?: {
    categorie: string;
    designation: string;
    quantite: number;
    /** En watts ; nulle quand elle n'est pas renseignée. */
    puissance: number | null;
  }[];
};

export type Colonne = {
  titre: string;
  /** Part de la largeur utile, entre 0 et 1. */
  largeur: number;
  alignement?: "gauche" | "droite";
};

export type Ligne = {
  cellules: string[];
  /** `groupe` : un poste et son sous-total ; `total` : la ligne de somme. */
  style?: "groupe" | "total";
};

export type Bloc =
  | { type: "intertitre"; texte: string }
  | { type: "texte"; texte: string }
  /** Le texte d'un document, dont les marqueurs se lisent comme une mise en forme. */
  | { type: "texte_mis_en_forme"; texte: string }
  | { type: "tableau"; colonnes: Colonne[]; lignes: Ligne[] };

/** Ce dont une section est tirée : une rubrique de la demande, ou un document. */
export type OrigineSection =
  | "synthese"
  | "fiche_projet"
  | "document"
  | "budget"
  | "financements"
  | "planning"
  | "decoupage"
  | "materiel";

export type Section = {
  /** De quoi ranger la section dans son fichier, quand le dossier sort en archive. */
  origine: OrigineSection;
  /** Au-dessus du titre : le type d'un document, par exemple. */
  surTitre?: string;
  titre: string;
  blocs: Bloc[];
};

/** Une section avant que le plan du dossier ne lui donne son origine. */
type Contenu = Omit<Section, "origine">;

export type Dossier = {
  titre: string;
  sousTitre: string;
  date: string;
  /** Vide : rien de ce qui a été demandé n'a de contenu. */
  sections: Section[];
};

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const JOUR = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// `fallback: "none"` : un code sans nom français reste un code, que l'on
// reconnaît, plutôt qu'un libellé inventé.
const PAYS = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });

const ABSENT = "—";

/** Libellé d'un code de la base ; un code inconnu reste lisible plutôt que de disparaître. */
export function libelle(table: Readonly<Record<string, string>>, code: string): string {
  return table[code] ?? code.replaceAll("_", " ");
}

function nombre(valeur: number | null): string {
  return valeur === null ? ABSENT : NOMBRE.format(Number(valeur));
}

/** « 12 mars 2027 » ; le premier du mois s'écrit « 1er », ce que `Intl` ne fait pas. */
function enJour(date: Date): string {
  return JOUR.format(date).replace(/^1 /, "1er ");
}

/** D'après une date de la base (`2027-03-12`). */
function jour(date: string): string {
  return enJour(new Date(`${date}T00:00:00Z`));
}

function periode(debut: string | null, fin: string | null): string {
  if (debut && fin) {
    return debut === fin ? jour(debut) : `${jour(debut)} – ${jour(fin)}`;
  }
  if (debut) {
    return `à partir du ${jour(debut)}`;
  }
  return fin ? `jusqu'au ${jour(fin)}` : ABSENT;
}

function sectionSynthese(synthese: NonNullable<ContenuDossier["synthese"]>): Contenu | null {
  const blocs: Bloc[] = [];
  if (synthese.pitch.trim()) {
    blocs.push({ type: "intertitre", texte: "Pitch" }, { type: "texte", texte: synthese.pitch });
  }
  if (synthese.synopsis.trim()) {
    blocs.push(
      { type: "intertitre", texte: "Synopsis" },
      { type: "texte", texte: synthese.synopsis },
    );
  }
  return blocs.length ? { titre: "Synthèse", blocs } : null;
}

/**
 * La fiche, dans l'ordre de l'assistant de création : repères, concept,
 * personnages, enjeux, vision, objectifs, public. Le format et l'étape n'y
 * figurent pas : la page de garde les porte déjà.
 */
function sectionFiche(fiche: NonNullable<ContenuDossier["fiche_projet"]>): Contenu | null {
  const blocs: Bloc[] = [];

  // Comme à l'écran : le premier pays n'est dit principal que s'il y en a d'autres.
  const pays = fiche.pays.map((code, rang) => {
    const nom = PAYS.of(code) ?? code;
    return rang === 0 && fiche.pays.length > 1 ? `${nom} (principal)` : nom;
  });
  const reperes: Ligne[] = [
    ["Genre", fiche.genre ? libelle(GENRES, fiche.genre) : ""],
    ["Durée", fiche.duree ? `${fiche.duree} ${fiche.duree > 1 ? "minutes" : "minute"}` : ""],
    ["Pays de production", pays.join(", ")],
    ["Langues", fiche.langues.trim()],
  ]
    .filter(([, valeur]) => valeur)
    .map((cellules) => ({ cellules }));
  if (reperes.length) {
    blocs.push({
      type: "tableau",
      colonnes: [
        { titre: "Repère", largeur: 0.3 },
        { titre: "Détail", largeur: 0.7 },
      ],
      lignes: reperes,
    });
  }

  const texte = (titre: string, contenu: string) => {
    if (contenu.trim()) {
      blocs.push({ type: "intertitre", texte: titre }, { type: "texte", texte: contenu });
    }
  };

  texte("Synopsis court", fiche.synopsis_court);
  texte("Thème", fiche.theme);
  if (fiche.personnages.length) {
    blocs.push(
      { type: "intertitre", texte: "Personnages" },
      {
        type: "tableau",
        colonnes: [
          { titre: "Nom", largeur: 0.24 },
          { titre: "Rôle", largeur: 0.16 },
          { titre: "Description", largeur: 0.6 },
        ],
        lignes: fiche.personnages.map((personnage) => ({
          cellules: [
            personnage.nom,
            libelle(ROLES_PERSONNAGE, personnage.role),
            personnage.description,
          ],
        })),
      },
    );
  }
  texte("Enjeux", fiche.enjeux);
  texte("Vision artistique", fiche.vision);
  texte("Objectifs", fiche.objectifs);
  texte("Public cible", fiche.public);

  return blocs.length ? { titre: "Fiche du projet", blocs } : null;
}

function sectionBudget(budget: NonNullable<ContenuDossier["budget"]>): Contenu | null {
  if (budget.lignes.length === 0) {
    return null;
  }

  // Les lignes arrivent triées par poste : chaque poste ouvre un groupe,
  // coiffé de son sous-total.
  const lignes: Ligne[] = [];
  let total = 0;
  for (const poste of new Set(budget.lignes.map((l) => l.poste))) {
    const duPoste = budget.lignes.filter((l) => l.poste === poste);
    const sousTotal = duPoste.reduce((somme, l) => somme + Number(l.total), 0);
    total += sousTotal;
    lignes.push({ cellules: [libelle(POSTES, poste), "", "", nombre(sousTotal)], style: "groupe" });
    for (const ligne of duPoste) {
      lignes.push({
        cellules: [
          ligne.libelle,
          nombre(ligne.quantite),
          nombre(ligne.cout_unitaire),
          nombre(ligne.total),
        ],
      });
    }
  }
  lignes.push({ cellules: ["Total", "", "", nombre(total)], style: "total" });

  return {
    titre: "Budget prévisionnel",
    blocs: [
      { type: "texte", texte: `Montants en ${budget.devise}.` },
      {
        type: "tableau",
        colonnes: [
          { titre: "Poste et ligne", largeur: 0.46 },
          { titre: "Quantité", largeur: 0.14, alignement: "droite" },
          { titre: "Coût unitaire", largeur: 0.2, alignement: "droite" },
          { titre: "Total", largeur: 0.2, alignement: "droite" },
        ],
        lignes,
      },
    ],
  };
}

function sectionFinancements(
  financements: NonNullable<ContenuDossier["financements"]>,
): Contenu | null {
  if (financements.length === 0) {
    return null;
  }

  const montant = (valeur: number | null, devise: string) =>
    valeur === null ? ABSENT : `${nombre(valeur)} ${devise}`;

  const lignes: Ligne[] = financements.map((f) => ({
    cellules: [
      [
        f.programme.trim() ? `${f.organisme} — ${f.programme}` : f.organisme,
        f.echeance ? `Échéance : ${jour(f.echeance)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      libelle(TYPES_FINANCEMENT, f.type),
      libelle(STATUTS_FINANCEMENT, f.statut),
      montant(f.demande, f.devise),
      montant(f.accorde, f.devise),
    ],
  }));

  // Une somme par devise : additionner des francs CFA et des euros n'aurait
  // aucun sens.
  for (const devise of new Set(financements.map((f) => f.devise))) {
    const enDevise = financements.filter((f) => f.devise === devise);
    // Rien de renseigné : pas de somme, plutôt qu'un zéro qui se lirait
    // comme un refus.
    const somme = (cle: "demande" | "accorde") =>
      enDevise.every((f) => f[cle] === null)
        ? null
        : enDevise.reduce((total, f) => total + Number(f[cle] ?? 0), 0);
    lignes.push({
      cellules: [
        `Total ${devise}`,
        "",
        "",
        montant(somme("demande"), devise),
        montant(somme("accorde"), devise),
      ],
      style: "total",
    });
  }

  return {
    titre: "Plan de financement",
    blocs: [
      {
        type: "tableau",
        colonnes: [
          { titre: "Organisme et programme", largeur: 0.34 },
          { titre: "Type", largeur: 0.17 },
          { titre: "Statut", largeur: 0.13 },
          { titre: "Demandé", largeur: 0.18, alignement: "droite" },
          { titre: "Accordé", largeur: 0.18, alignement: "droite" },
        ],
        lignes,
      },
    ],
  };
}

function sectionPlanning(planning: NonNullable<ContenuDossier["planning"]>): Contenu | null {
  if (planning.length === 0) {
    return null;
  }
  return {
    titre: "Planning",
    blocs: [
      {
        type: "tableau",
        colonnes: [
          { titre: "Étape", largeur: 0.38 },
          { titre: "Phase", largeur: 0.18 },
          { titre: "Période", largeur: 0.3 },
          { titre: "Statut", largeur: 0.14 },
        ],
        lignes: planning.map((etape) => ({
          cellules: [
            etape.titre,
            libelle(ETAPES, etape.phase),
            periode(etape.debut, etape.fin),
            libelle(STATUTS_ETAPE, etape.statut),
          ],
        })),
      },
    ],
  };
}

/** « Extérieur · Berge · Aube » ; sans lieu renseigné, le décor et le moment. */
export function enteteScene(scene: { decor: string; lieu: string; moment: string }): string {
  return [libelle(DECORS, scene.decor), scene.lieu.trim(), libelle(MOMENTS, scene.moment)]
    .filter(Boolean)
    .join(" · ");
}

/** « 45 s », « 1 min 05 s » : comme l'écran du découpage. */
function dureePlan(secondes: number | null): string {
  if (secondes === null) {
    return ABSENT;
  }
  if (secondes < 60) {
    return `${secondes} s`;
  }
  const reste = secondes % 60;
  const minutes = Math.floor(secondes / 60);
  return reste ? `${minutes} min ${String(reste).padStart(2, "0")} s` : `${minutes} min`;
}

/**
 * Le découpage, scène par scène : son en-tête, puis le tableau de ses plans.
 * Une scène sans plan n'arrive pas jusqu'ici : la base ne la rend pas.
 */
function sectionDecoupage(decoupage: NonNullable<ContenuDossier["decoupage"]>): Contenu | null {
  const blocs: Bloc[] = [];
  decoupage.forEach((scene, rang) => {
    if (!scene.plans?.length) {
      return;
    }
    blocs.push(
      { type: "intertitre", texte: `Scène ${rang + 1} — ${scene.titre}` },
      { type: "texte", texte: enteteScene(scene) },
      {
        type: "tableau",
        colonnes: [
          { titre: "Plan", largeur: 0.07, alignement: "droite" },
          { titre: "Cadrage", largeur: 0.17 },
          { titre: "Focale", largeur: 0.1, alignement: "droite" },
          { titre: "Angle et mouvement", largeur: 0.2 },
          { titre: "Durée", largeur: 0.1, alignement: "droite" },
          { titre: "Ce que montre le plan", largeur: 0.36 },
        ],
        lignes: scene.plans.map((plan, numero) => ({
          cellules: [
            String(numero + 1),
            libelle(CADRAGES, plan.cadrage),
            plan.focale === null ? ABSENT : `${plan.focale} mm`,
            `${libelle(ANGLES, plan.angle)}, ${libelle(MOUVEMENTS, plan.mouvement).toLowerCase()}`,
            dureePlan(plan.duree),
            plan.description.trim() || ABSENT,
          ],
        })),
      },
    );
  });
  return blocs.length ? { titre: "Découpage technique", blocs } : null;
}

/**
 * Le matériel, rangé par catégorie. Aucune somme : ni charge, ni intensité,
 * ni groupe conseillé — un chiffrage électrique non certifié n'a pas sa place
 * dans un dossier, et le calcul est celui de l'application, pas du worker.
 */
function sectionMateriel(materiel: NonNullable<ContenuDossier["materiel"]>): Contenu | null {
  if (materiel.length === 0) {
    return null;
  }
  // Les lignes arrivent triées par catégorie : chacune ouvre un groupe.
  const lignes: Ligne[] = [];
  for (const categorie of new Set(materiel.map((ligne) => ligne.categorie))) {
    lignes.push({ cellules: [libelle(CATEGORIES_MATERIEL, categorie), "", ""], style: "groupe" });
    for (const ligne of materiel.filter((l) => l.categorie === categorie)) {
      lignes.push({
        cellules: [
          ligne.designation,
          nombre(ligne.quantite),
          ligne.puissance === null ? ABSENT : `${nombre(ligne.puissance)} W`,
        ],
      });
    }
  }
  return {
    titre: "Matériel",
    blocs: [
      {
        type: "tableau",
        colonnes: [
          { titre: "Catégorie et équipement", largeur: 0.6 },
          { titre: "Quantité", largeur: 0.15, alignement: "droite" },
          { titre: "Puissance unitaire", largeur: 0.25, alignement: "droite" },
        ],
        lignes,
      },
    ],
  };
}

/**
 * Plan du dossier. Une section demandée mais vide est omise, sans mention :
 * un dossier envoyé à un fonds n'a pas à dire ce qui lui manque. C'est à
 * l'appelant de refuser un dossier sans aucune section.
 */
export function composerDossier(contenu: ContenuDossier, etabliLe: Date): Dossier {
  const sections: Section[] = [];
  const ajouter = (origine: OrigineSection, section: Contenu | null) => {
    if (section) {
      sections.push({ origine, ...section });
    }
  };

  if (contenu.synthese) {
    ajouter("synthese", sectionSynthese(contenu.synthese));
  }
  if (contenu.fiche_projet) {
    ajouter("fiche_projet", sectionFiche(contenu.fiche_projet));
  }
  for (const document of contenu.documents ?? []) {
    if (document.contenu.trim()) {
      ajouter("document", {
        surTitre: libelle(TYPES_DOCUMENT, document.type),
        titre: document.titre,
        // Seul le texte d'un document porte des marqueurs, et pas celui d'un
        // scénario : les champs de la fiche restent du texte brut.
        blocs: [
          {
            type: estMisEnForme(document.type) ? "texte_mis_en_forme" : "texte",
            texte: document.contenu,
          },
        ],
      });
    }
  }
  if (contenu.budget) {
    ajouter("budget", sectionBudget(contenu.budget));
  }
  if (contenu.financements) {
    ajouter("financements", sectionFinancements(contenu.financements));
  }
  if (contenu.planning) {
    ajouter("planning", sectionPlanning(contenu.planning));
  }
  if (contenu.decoupage) {
    ajouter("decoupage", sectionDecoupage(contenu.decoupage));
  }
  if (contenu.materiel) {
    ajouter("materiel", sectionMateriel(contenu.materiel));
  }

  return {
    titre: contenu.fiche.titre,
    sousTitre: `${libelle(FORMATS, contenu.fiche.format)} · ${libelle(ETAPES, contenu.fiche.etape)}`,
    date: `Dossier établi le ${enJour(etabliLe)}`,
    sections,
  };
}
