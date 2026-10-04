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
  note_intention: "Note d'intention",
  synopsis: "Synopsis détaillé",
  traitement: "Traitement",
  bible: "Bible de série",
  scenario: "Scénario",
  biographie: "Biographie et filmographie",
  lettre: "Lettre",
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
