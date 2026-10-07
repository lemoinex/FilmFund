/**
 * Libellés français des énumérations de la base, tels que l'application les
 * affiche.
 *
 * Recopiés ici, et non importés : Railway ne déploie que le dossier
 * `worker/`, qui ne peut donc rien lire de `src/`. Un test d'architecture
 * vérifie qu'ils restent identiques à ceux de l'application — un dossier ne
 * doit pas nommer un poste autrement que l'écran.
 */

export const FORMATS: Readonly<Record<string, string>> = {
  long_metrage: "Long métrage",
  court_metrage: "Court métrage",
  documentaire: "Documentaire",
  serie: "Série",
  web_serie: "Web-série",
  animation: "Animation",
};

export const ETAPES: Readonly<Record<string, string>> = {
  idee: "Idée",
  developpement: "Développement",
  ecriture: "Écriture",
  preproduction: "Préproduction",
  production: "Production",
  postproduction: "Postproduction",
  termine: "Terminé",
};

export const GENRES: Readonly<Record<string, string>> = {
  drame: "Drame",
  comedie: "Comédie",
  comedie_dramatique: "Comédie dramatique",
  thriller: "Thriller",
  policier: "Policier",
  action: "Action",
  aventure: "Aventure",
  fantastique: "Fantastique",
  science_fiction: "Science-fiction",
  horreur: "Horreur",
  romance: "Romance",
  historique: "Historique",
  biopic: "Biopic",
  guerre: "Guerre",
  musical: "Musical",
  jeunesse: "Jeunesse",
  societe: "Société",
  portrait: "Portrait",
  nature: "Nature",
  autre: "Autre",
};

export const ROLES_PERSONNAGE: Readonly<Record<string, string>> = {
  principal: "Principal",
  secondaire: "Secondaire",
};

export const TYPES_DOCUMENT: Readonly<Record<string, string>> = {
  pitch_developpe: "Pitch développé",
  note_intention: "Note d'intention",
  note_realisation: "Note de réalisation",
  synopsis: "Synopsis détaillé",
  traitement: "Traitement",
  bible: "Bible de série",
  scenario: "Scénario",
  analyse: "Analyse dramaturgique",
  biographie: "Biographie et filmographie",
  lettre: "Lettre",
  pitch_oral: "Pitch oral",
  autre: "Autre document",
};

export const POSTES: Readonly<Record<string, string>> = {
  developpement: "Développement et écriture",
  droits: "Droits artistiques",
  equipe_technique: "Équipe technique",
  interpretation: "Interprétation",
  decors_costumes: "Décors, costumes et accessoires",
  materiel: "Matériel technique",
  transport_regie: "Transport, hébergement et régie",
  postproduction: "Postproduction",
  assurances_divers: "Assurances et frais divers",
  promotion_distribution: "Promotion et distribution",
  imprevus: "Imprévus",
};

export const TYPES_FINANCEMENT: Readonly<Record<string, string>> = {
  aide_publique: "Aide publique",
  coproduction: "Coproduction",
  preachat: "Préachat, diffusion",
  mecenat: "Mécénat, partenariat",
  financement_participatif: "Financement participatif",
  residence: "Résidence, atelier",
  autre: "Autre",
};

export const STATUTS_FINANCEMENT: Readonly<Record<string, string>> = {
  a_preparer: "À préparer",
  deposee: "Déposée",
  acceptee: "Acceptée",
  refusee: "Refusée",
};

export const STATUTS_ETAPE: Readonly<Record<string, string>> = {
  a_faire: "À faire",
  en_cours: "En cours",
  termine: "Terminé",
};

/** Décor d'une scène, en toutes lettres : l'abréviation reste à l'écran. */
export const DECORS: Readonly<Record<string, string>> = {
  int: "Intérieur",
  ext: "Extérieur",
  int_ext: "Intérieur / extérieur",
};

export const MOMENTS: Readonly<Record<string, string>> = {
  jour: "Jour",
  nuit: "Nuit",
  aube: "Aube",
  crepuscule: "Crépuscule",
};

export const CADRAGES: Readonly<Record<string, string>> = {
  plan_ensemble: "Plan d'ensemble",
  plan_large: "Plan large",
  plan_moyen: "Plan moyen",
  plan_americain: "Plan américain",
  plan_rapproche: "Plan rapproché",
  gros_plan: "Gros plan",
  tres_gros_plan: "Très gros plan",
  insert: "Insert",
  plan_sequence: "Plan-séquence",
};

export const ANGLES: Readonly<Record<string, string>> = {
  normal: "Normal",
  plongee: "Plongée",
  contre_plongee: "Contre-plongée",
};

export const MOUVEMENTS: Readonly<Record<string, string>> = {
  fixe: "Fixe",
  panoramique: "Panoramique",
  travelling: "Travelling",
  epaule: "À l'épaule",
  autre: "Autre",
};

export const CATEGORIES_MATERIEL: Readonly<Record<string, string>> = {
  image: "Image",
  lumiere: "Lumière",
  son: "Son",
  machinerie: "Machinerie",
  energie: "Énergie",
  regie: "Régie",
};
