/**
 * Exports d'un projet, en PDF, en Word ou en archive ZIP : ce que l'écran
 * propose, où en est une demande, et comment un fichier se nomme. Module pur,
 * testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/**
 * Sections d'un dossier, hors documents, dans l'ordre où le dossier les
 * présente. Mêmes codes que `parametres_export()` en base, qui a le dernier
 * mot ; un test d'architecture vérifie qu'ils ne s'écartent pas.
 */
export const SECTIONS = {
  synthese: { libelle: "Synthèse" },
  fiche_projet: { libelle: "Fiche du projet" },
  budget: { libelle: "Budget prévisionnel" },
  financements: { libelle: "Plan de financement" },
  planning: { libelle: "Planning" },
  decoupage: { libelle: "Découpage technique" },
  materiel: { libelle: "Matériel" },
} as const;

export type SectionExport = keyof typeof SECTIONS;

export const ORDRE_SECTIONS = Object.keys(SECTIONS) as SectionExport[];

/**
 * Sections qui ouvrent le dossier, avant les documents : ce qui présente le
 * projet. Les tableaux — budget, financements, planning, découpage,
 * matériel — le ferment.
 */
export const SECTIONS_D_OUVERTURE: readonly SectionExport[] = ["synthese", "fiche_projet"];

/**
 * Formats d'un dossier. Le format est l'action même de la tâche — la base
 * n'en connaît pas d'autre — et la signature, les premiers octets que tout
 * fichier de ce format présente : « %PDF- », ou « PK\x03\x04 » pour une
 * archive — un DOCX en est une, comme un ZIP. Un test d'architecture vérifie
 * que la base admet ces actions.
 */
export const FORMATS_EXPORT = {
  pdf: {
    libelle: "PDF",
    detail: "Mis en page, prêt à envoyer",
    action: "pdf_export",
    extension: "pdf",
    type: "application/pdf",
    signature: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  docx: {
    libelle: "Word",
    detail: "À retoucher dans un traitement de texte",
    action: "docx_export",
    extension: "docx",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
  zip: {
    libelle: "ZIP",
    detail: "Un fichier Word par texte, un classeur Excel par tableau",
    action: "zip_export",
    extension: "zip",
    type: "application/zip",
    signature: [0x50, 0x4b, 0x03, 0x04],
  },
} as const;

export type FormatExport = keyof typeof FORMATS_EXPORT;

export const ORDRE_FORMATS = Object.keys(FORMATS_EXPORT) as FormatExport[];

/** Actions de la base qui fabriquent un dossier, tous formats confondus. */
export const ACTIONS_EXPORT = ORDRE_FORMATS.map((format) => FORMATS_EXPORT[format].action);

export function estFormatExport(valeur: unknown): valeur is FormatExport {
  return typeof valeur === "string" && Object.hasOwn(FORMATS_EXPORT, valeur);
}

/** Demande d'export, telle que la base l'attend. */
export type DemandeExport = { sections: string[]; documents: string[] };

function listeDeTextes(valeur: unknown): string[] | null {
  return Array.isArray(valeur) && valeur.every((element) => typeof element === "string")
    ? valeur
    : null;
}

/**
 * Forme canonique d'une demande — listes triées, sans doublon —, comme
 * `parametres_export()`. Nul si elle est mal formée, désigne une section ou
 * un type de document inconnu, ou ne demande rien.
 */
export function normaliserDemande(
  sections: unknown,
  documents: unknown,
  typesDeDocument: readonly string[],
): DemandeExport | null {
  const sectionsLues = listeDeTextes(sections);
  const documentsLus = listeDeTextes(documents);
  if (!sectionsLues || !documentsLus) {
    return null;
  }
  if (
    !sectionsLues.every((section) => Object.hasOwn(SECTIONS, section)) ||
    !documentsLus.every((type) => typesDeDocument.includes(type))
  ) {
    return null;
  }

  const demande = {
    sections: [...new Set(sectionsLues)].sort(),
    documents: [...new Set(documentsLus)].sort(),
  };
  return demande.sections.length + demande.documents.length > 0 ? demande : null;
}

/**
 * Ce qu'une demande contient, en clair et dans l'ordre du dossier :
 * « Synthèse, Fiche du projet, Note d'intention, Budget prévisionnel ».
 */
export function libelleDemande(
  demande: unknown,
  libellesDocuments: Readonly<Record<string, string>>,
): string {
  const lue = (demande ?? {}) as { sections?: unknown; documents?: unknown };
  const sections = listeDeTextes(lue.sections) ?? [];
  const documents = listeDeTextes(lue.documents) ?? [];
  const demandees = (ouverture: boolean) =>
    ORDRE_SECTIONS.filter(
      (section) =>
        SECTIONS_D_OUVERTURE.includes(section) === ouverture && sections.includes(section),
    ).map((section) => SECTIONS[section].libelle);
  const parties = [
    ...demandees(true),
    ...Object.keys(libellesDocuments)
      .filter((type) => documents.includes(type))
      .map((type) => libellesDocuments[type]),
    ...demandees(false),
  ];
  return parties.join(", ") || "Dossier";
}

/** Ce que la page du dossier lit de la fiche, pour dire ce que sa case apporterait. */
export type ApercuFiche = {
  genre: string | null;
  countries: readonly string[];
  languages: string;
  duration_minutes: number | null;
  short_synopsis: string;
  theme: string;
  stakes: string;
  artistic_vision: string;
  goals: string;
  audience: string;
};

const ENUMERATION = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

/**
 * Ce que la fiche apporterait au dossier, dans l'ordre de l'assistant :
 * « Repères, concept, 2 personnages, vision et public ». Nul si elle est
 * vide : le dossier omettrait la section, la case reste donc décochée.
 */
export function detailFiche(fiche: ApercuFiche, personnages: number): string | null {
  const parties = [
    fiche.genre || fiche.countries.length || fiche.languages.trim() || fiche.duration_minutes
      ? "repères"
      : "",
    fiche.short_synopsis.trim() || fiche.theme.trim() ? "concept" : "",
    personnages > 0 ? `${personnages} ${personnages > 1 ? "personnages" : "personnage"}` : "",
    fiche.stakes.trim() ? "enjeux" : "",
    fiche.artistic_vision.trim() ? "vision" : "",
    fiche.goals.trim() ? "objectifs" : "",
    fiche.audience.trim() ? "public" : "",
  ].filter(Boolean);
  if (parties.length === 0) {
    return null;
  }
  const texte = ENUMERATION.format(parties);
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export type TacheExport = { id: string; state: string; reason: string | null } | null;

export type EtapeExport =
  /** Rien en cours : une demande peut être faite. */
  | { etape: "repos" }
  /** La dernière demande a échoué ; l'unité a été rendue. */
  | { etape: "echec"; motif: string | null }
  /** En file : annulable. */
  | { etape: "en_attente"; tacheId: string }
  | { etape: "en_cours" }
  /** Interrompue après son envoi : issue à établir, unité toujours réservée. */
  | { etape: "a_rapprocher" };

/**
 * Étape affichée, d'après la dernière tâche d'export du projet. Une tâche
 * réussie ramène au repos : son fichier figure dans la liste. Un état
 * inconnu aussi : mieux vaut laisser redemander que d'afficher une attente
 * sans fin.
 */
export function etapeExport(tache: TacheExport): EtapeExport {
  switch (tache?.state) {
    case "queued":
      return { etape: "en_attente", tacheId: tache.id };
    case "running":
      return { etape: "en_cours" };
    case "awaiting_reconciliation":
      return { etape: "a_rapprocher" };
    case "failed":
      return { etape: "echec", motif: tache.reason };
    default:
      return { etape: "repos" };
  }
}

/** Codes d'erreur de la base que l'écran traduit. */
export const ERREURS_EXPORT = {
  quota: "53400",
  devisPerime: "DV001",
  cleEnConflit: "DV002",
  devisDejaAccepte: "DV003",
  debit: "DV005",
  refus: "42501",
  tacheDejaPrise: "TR002",
  demandeInvalide: "22023",
} as const;

/** Message lisible pour une erreur de la base ; générique si elle est inconnue. */
export function messageErreurExport(code: string | undefined): string {
  switch (code) {
    case ERREURS_EXPORT.quota:
      return "Le quota d'exports de ce studio est épuisé pour la période en cours.";
    case ERREURS_EXPORT.devisPerime:
      return "Cette demande n'est plus valable : préparez le dossier à nouveau.";
    case ERREURS_EXPORT.cleEnConflit:
    case ERREURS_EXPORT.devisDejaAccepte:
      return "Cette demande a déjà été enregistrée.";
    case ERREURS_EXPORT.debit:
      return "Trop de demandes en une minute : patientez un instant.";
    case ERREURS_EXPORT.refus:
      return "Vous n'avez pas le droit d'exporter le dossier de ce projet.";
    case ERREURS_EXPORT.tacheDejaPrise:
      return "Le dossier est déjà en cours de fabrication : la demande ne s'annule plus.";
    case ERREURS_EXPORT.demandeInvalide:
      return "Cochez au moins une section à exporter.";
    default:
      return "La demande n'a pas abouti. Réessayez dans un instant.";
  }
}

const NOMBRE = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

/** « 312 Ko », « 1,2 Mo ». */
export function poids(octets: number): string {
  if (octets < 1024 * 1024) {
    return `${NOMBRE.format(Math.max(1, Math.round(octets / 1024)))} Ko`;
  }
  return `${NOMBRE.format(octets / (1024 * 1024))} Mo`;
}

/** « 1 page », « 12 pages ». */
export function pages(nombre: number): string {
  return `${nombre} ${nombre > 1 ? "pages" : "page"}`;
}

/** « 1 export », « 3 exports » : PDF et Word puisent dans le même quota. */
export function nombreExports(nombre: number): string {
  return `${NOMBRE.format(nombre)} ${nombre > 1 ? "exports" : "export"}`;
}

const NOM_MAX = 60;

/**
 * Nom du fichier téléchargé, d'après le titre du projet : lettres sans
 * accent, chiffres et tirets seulement. Un en-tête HTTP n'admet pas
 * davantage, et un titre peut contenir n'importe quoi.
 */
export function nomDeFichier(titre: string, format: FormatExport = "pdf"): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, NOM_MAX)
    .replace(/-+$/, "");
  return `dossier-${base || "projet"}.${FORMATS_EXPORT[format].extension}`;
}

/**
 * En-tête `Content-Disposition` d'un téléchargement. Deux noms : l'un réduit
 * à l'ASCII, que tout navigateur comprend ; l'autre, encodé selon la RFC
 * 5987, qui garde les lettres du titre — ɛ, ɔ, ŋ comprises.
 */
export function enTeteDeTelechargement(titre: string, format: FormatExport = "pdf"): string {
  const lisible = titre
    // Ce qu'un nom de fichier n'admet pas, sous Windows comme ailleurs.
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();
  const extension = FORMATS_EXPORT[format].extension;
  const encode = encodeURIComponent(`Dossier - ${lisible || "Projet"}.${extension}`).replace(
    /['()*!]/g,
    (caractere) => `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${nomDeFichier(titre, format)}"; filename*=UTF-8''${encode}`;
}

/** « 2 octobre 2026 » ; le premier du mois s'écrit « 1er », ce que `Intl` ne fait pas. */
export function premierDuMois(date: string): string {
  return date.replace(/^1 /, "1er ");
}

/**
 * Lit un fichier tel que l'API le rend : un `bytea` écrit en hexadécimal,
 * précédé de `\x`. Nul s'il n'a pas cette forme, ou ne présente pas la
 * signature du format attendu.
 */
export function lireFichier(valeur: unknown, format: FormatExport = "pdf"): Uint8Array | null {
  if (typeof valeur !== "string" || !/^\\x(?:[0-9a-f]{2})+$/i.test(valeur)) {
    return null;
  }
  const octets = new Uint8Array((valeur.length - 2) / 2);
  for (let i = 0; i < octets.length; i += 1) {
    octets[i] = Number.parseInt(valeur.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return FORMATS_EXPORT[format].signature.every((octet, i) => octets[i] === octet) ? octets : null;
}
