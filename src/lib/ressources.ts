/**
 * Ressources : la bibliothèque de guides, de modèles, de checklists et de
 * références de la plateforme. Ce fichier en est la source unique — contenus
 * versionnés, relus avant chaque publication ; aucune base, aucun appel
 * externe, aucune génération.
 *
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 *
 * Trois règles que des tests tiennent :
 *   - un contenu n'est que du texte, rendu comme tel — aucune syntaxe n'est
 *     interprétée, donc aucun balisage ne peut s'y glisser ;
 *   - une ressource est un brouillon tant qu'elle n'a pas été validée : elle
 *     ne se montre alors qu'à l'administration, sous son étiquette ;
 *   - rien n'est inventé : ni lien, ni fichier, ni fonds, ni échéance. Une
 *     référence externe porte une adresse `https`, sa source et le jour où le
 *     lien a été vérifié ; un modèle téléchargeable n'existe que si son
 *     fichier existe.
 */

export const CATEGORIES_RESSOURCE = {
  ecriture: "Écriture et développement",
  dossier: "Dossier et financement",
  preproduction: "Préproduction",
  plateforme: "Utilisation de FilmFund Africa",
} as const;

export type CategorieRessource = keyof typeof CATEGORIES_RESSOURCE;

export const TYPES_RESSOURCE = {
  guide: "Guide",
  modele: "Modèle",
  checklist: "Checklist",
  reference: "Référence externe",
} as const;

export type TypeRessource = keyof typeof TYPES_RESSOURCE;

export const STATUTS_RESSOURCE = {
  brouillon: "Brouillon",
  publie: "Publié",
} as const;

export type StatutRessource = keyof typeof STATUTS_RESSOURCE;

/** Ce que l'écran dit de la rubrique, une fois, sous son titre. */
export const INTRODUCTION_RESSOURCES =
  "Guides, modèles et références pour développer votre projet et préparer votre dossier.";

/** Ce que la rubrique n'est pas, dit à l'écran pour qu'on ne s'y trompe pas. */
export const LIMITES_RESSOURCES =
  "Ces contenus sont généraux : ils ne remplacent ni le règlement d'un appel, ni un conseil juridique ou financier adapté à votre projet. Pour un appel précis, sa source seule fait foi.";

/** Dit sur chaque brouillon : il n'a pas été validé, et ne se montre qu'à l'administration. */
export const AVERTISSEMENT_BROUILLON =
  "Brouillon en attente de validation : visible de l'administration seulement.";

/** Longueur d'une recherche : au-delà, le texte est coupé. */
export const RECHERCHE_RESSOURCES_MAX = 100;

/** Bloc de contenu : du texte, une liste, ou des points à vérifier. */
export type BlocRessource =
  | { type: "paragraphe"; texte: string }
  | { type: "liste"; elements: readonly string[] }
  | { type: "points"; elements: readonly string[] };

export type SectionRessource = {
  /** Identifiant stable, indépendant de la position : sert d'ancre et de clé. */
  id: string;
  titre: string;
  blocs: readonly BlocRessource[];
};

/** Référence hors de la plateforme : jamais relevée par programme. */
export type LienRessource = {
  url: string;
  /** L'organisme ou l'auteur qui publie la page. */
  source: string;
  /** Le jour, AAAA-MM-JJ, où quelqu'un a ouvert le lien pour la dernière fois. */
  verifieLe: string;
};

export type Ressource = {
  /** Identifiant stable : il fait l'adresse de la ressource. */
  slug: string;
  titre: string;
  description: string;
  categorie: CategorieRessource;
  type: TypeRessource;
  statut: StatutRessource;
  langue: "fr";
  /** Le jour, AAAA-MM-JJ, de la dernière révision ; nul tant qu'elle n'est pas publiée. */
  misAJourLe: string | null;
  /** Qui l'a écrite, quand on le sait. */
  auteur?: string;
  /** Contenu lu sur la plateforme ; absent pour une référence externe. */
  sections?: readonly SectionRessource[];
  /** Référence externe ; absente pour un contenu lu sur la plateforme. */
  lien?: LienRessource;
};

/*
 * Les cinq premiers contenus sont des BROUILLONS, rédigés pour la plateforme
 * le 8 octobre 2026 et proposés à la validation : aucun n'était écrit dans la
 * spécification d'origine. Publier, c'est passer `statut` à « publie » et
 * dater `misAJourLe`, après relecture.
 */
export const RESSOURCES: readonly Ressource[] = [
  {
    slug: "rediger-une-logline",
    titre: "Comprendre et rédiger une logline",
    description:
      "Ce qu'une logline doit dire en une ou deux phrases, et une méthode pour écrire la vôtre.",
    categorie: "ecriture",
    type: "guide",
    statut: "brouillon",
    langue: "fr",
    misAJourLe: null,
    auteur: "FilmFund Africa",
    sections: [
      {
        id: "a-quoi-elle-sert",
        titre: "À quoi sert une logline",
        blocs: [
          {
            type: "paragraphe",
            texte:
              "La logline est la première chose qu'un lecteur, un producteur ou un comité lit de votre projet. En une ou deux phrases, elle doit lui permettre de comprendre de quoi parle le film et de vouloir en savoir plus. Ce n'est ni un slogan d'affiche, ni un résumé : c'est la promesse du récit.",
          },
          {
            type: "paragraphe",
            texte:
              "Sur la plateforme, la logline s'appelle « pitch ». C'est le même texte : celui qui ouvre la fiche de votre projet et vos dossiers.",
          },
        ],
      },
      {
        id: "ce-qu-elle-contient",
        titre: "Ce qu'elle contient",
        blocs: [
          {
            type: "liste",
            elements: [
              "Un personnage, désigné par ce qui le caractérise plutôt que par son nom : « une pêcheuse », « un instituteur à la retraite ».",
              "Ce qui lui arrive : l'événement qui met le récit en marche.",
              "Ce qu'il veut, et ce qui s'y oppose.",
              "L'enjeu : ce qu'il perd s'il échoue.",
            ],
          },
          {
            type: "paragraphe",
            texte:
              "Pour un documentaire, les mêmes éléments valent : qui l'on suit, dans quelle situation, face à quoi, et ce qui se joue.",
          },
        ],
      },
      {
        id: "methode",
        titre: "Une méthode en quatre temps",
        blocs: [
          {
            type: "points",
            elements: [
              "Écrivez une version longue, sans vous censurer : cinq ou six phrases.",
              "Soulignez le personnage, l'événement, l'obstacle et l'enjeu. S'il en manque un, le récit n'est pas encore assez précis.",
              "Réduisez à une ou deux phrases, en gardant ces quatre éléments.",
              "Lisez-la à quelqu'un qui ne connaît pas le projet, et demandez-lui de vous raconter le film. Ce qu'il raconte est ce que votre logline dit vraiment.",
            ],
          },
        ],
      },
      {
        id: "a-eviter",
        titre: "Ce qu'il vaut mieux éviter",
        blocs: [
          {
            type: "liste",
            elements: [
              "Les questions rhétoriques : « Parviendra-t-elle à… ? ». Dites ce qui se joue, pas que la question se pose.",
              "Les adjectifs de vente : « bouleversant », « haletant ». Le lecteur en jugera.",
              "Le thème à la place du récit : « un film sur l'exil » ne dit pas ce qui se passe.",
              "La fin : une logline ouvre le récit, elle ne le conclut pas.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "structurer-un-synopsis",
    titre: "Structurer un synopsis",
    description:
      "Ce qui distingue un synopsis d'un résumé, ce qu'il doit couvrir, et dans quel ordre l'écrire.",
    categorie: "ecriture",
    type: "guide",
    statut: "brouillon",
    langue: "fr",
    misAJourLe: null,
    auteur: "FilmFund Africa",
    sections: [
      {
        id: "definition",
        titre: "Ce qu'est un synopsis",
        blocs: [
          {
            type: "paragraphe",
            texte:
              "Le synopsis raconte le film du début à la fin, au présent, dans l'ordre où le spectateur le découvrira. À la différence d'une logline ou d'une quatrième de couverture, il dit comment l'histoire se termine : celui qui le lit doit pouvoir juger le récit entier.",
          },
          {
            type: "paragraphe",
            texte:
              "Sa longueur dépend de ce qu'on vous demande. La plateforme en distingue trois : un synopsis court, de quelques lignes ; un synopsis d'une page environ ; un synopsis détaillé, de plusieurs pages. Lisez toujours ce que l'appel ou l'interlocuteur attend avant d'écrire.",
          },
        ],
      },
      {
        id: "ce-qu-il-couvre",
        titre: "Ce qu'il doit couvrir",
        blocs: [
          {
            type: "liste",
            elements: [
              "La situation de départ : qui, où, quand, et ce qui fait l'équilibre que le récit va rompre.",
              "L'élément déclencheur : ce qui oblige le personnage à agir.",
              "La progression : les obstacles, dans l'ordre, et ce que chacun change.",
              "La bascule : le moment où le personnage ne peut plus revenir en arrière.",
              "Le dénouement : comment cela finit, et ce que le personnage a gagné ou perdu.",
            ],
          },
        ],
      },
      {
        id: "ecriture",
        titre: "Comment l'écrire",
        blocs: [
          {
            type: "points",
            elements: [
              "Écrivez au présent et à la troisième personne.",
              "Nommez les personnages principaux à leur première apparition, avec ce qui les caractérise.",
              "Racontez des actions et leurs conséquences, pas des intentions d'auteur : celles-ci ont leur place dans la note d'intention.",
              "Gardez un fil : si un passage peut être retiré sans que la suite devienne incompréhensible, il n'a sans doute pas sa place dans un synopsis.",
              "Dites la fin.",
            ],
          },
        ],
      },
      {
        id: "relecture",
        titre: "Avant de l'envoyer",
        blocs: [
          {
            type: "points",
            elements: [
              "La logline et le synopsis racontent-ils le même film ?",
              "Chaque personnage nommé joue-t-il un rôle dans la suite ?",
              "Le lecteur comprend-il pourquoi le récit commence à ce moment-là, et pas avant ?",
              "La longueur est-elle celle qu'on vous a demandée ?",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "preparer-une-note-d-intention",
    titre: "Préparer une note d'intention",
    description:
      "Ce que la note d'intention ajoute au synopsis, les questions auxquelles elle répond, et comment la construire.",
    categorie: "ecriture",
    type: "guide",
    statut: "brouillon",
    langue: "fr",
    misAJourLe: null,
    auteur: "FilmFund Africa",
    sections: [
      {
        id: "son-role",
        titre: "Son rôle dans un dossier",
        blocs: [
          {
            type: "paragraphe",
            texte:
              "Le synopsis dit ce que le film raconte. La note d'intention dit pourquoi vous voulez le faire, pourquoi vous, et pourquoi maintenant. C'est le seul texte du dossier écrit à la première personne : le lecteur doit y entendre quelqu'un.",
          },
          {
            type: "paragraphe",
            texte:
              "Elle ne se confond pas avec la note de réalisation, qui dit comment le film sera fait — le regard, l'image, le son, le rythme. Certains appels demandent l'une, l'autre, ou les deux : vérifiez ce qui est attendu.",
          },
        ],
      },
      {
        id: "questions",
        titre: "Les questions auxquelles elle répond",
        blocs: [
          {
            type: "liste",
            elements: [
              "D'où vient ce projet ? Un fait, une rencontre, une image, une question qui ne vous quitte pas.",
              "Quel est votre lien avec le sujet ? Ce qui vous autorise, ou vous oblige, à le traiter.",
              "Que voulez-vous que le spectateur éprouve ou comprenne ?",
              "Pourquoi ce film doit-il exister aujourd'hui ?",
              "Qu'est-ce qui le distingue de ce qui a déjà été fait sur ce sujet ?",
            ],
          },
        ],
      },
      {
        id: "construction",
        titre: "Comment la construire",
        blocs: [
          {
            type: "points",
            elements: [
              "Commencez par ce qui est concret : une scène vécue, un lieu, une personne. Les idées générales viennent ensuite.",
              "Écrivez à la première personne, sans vous excuser ni vous vanter.",
              "Tenez-vous à une ou deux pages, sauf consigne contraire.",
              "Ne racontez pas le film une seconde fois : renvoyez au synopsis.",
              "Relisez en retirant chaque phrase qui pourrait figurer dans la note d'un autre projet.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "pieces-d-un-dossier-de-candidature",
    titre: "Vérifier les pièces d'un dossier de candidature",
    description:
      "Les points à contrôler avant de déposer un dossier, du règlement de l'appel jusqu'à l'envoi.",
    categorie: "dossier",
    type: "checklist",
    statut: "brouillon",
    langue: "fr",
    misAJourLe: null,
    auteur: "FilmFund Africa",
    sections: [
      {
        id: "avant-de-commencer",
        titre: "Avant de commencer",
        blocs: [
          {
            type: "paragraphe",
            texte:
              "Chaque appel a ses propres règles : pièces exigées, formats, longueurs, langue, mode de dépôt. Cette liste ne les remplace pas. Elle vous aide à ne rien oublier une fois le règlement lu.",
          },
          {
            type: "points",
            elements: [
              "J'ai lu le règlement en entier, sur le site de l'organisme, à sa version en vigueur.",
              "Mon projet répond aux conditions d'éligibilité qu'il énonce.",
              "J'ai noté la date et l'heure limites, avec leur fuseau horaire.",
              "Je sais comment le dossier se dépose, et j'ai créé le compte nécessaire s'il en faut un.",
            ],
          },
        ],
      },
      {
        id: "les-textes",
        titre: "Les textes",
        blocs: [
          {
            type: "points",
            elements: [
              "Chaque texte demandé est présent, à la longueur demandée.",
              "La logline, le synopsis et la note d'intention racontent le même projet : mêmes noms, mêmes lieux, même titre.",
              "Les textes sont dans la langue demandée.",
              "Chaque document est finalisé, relu, et porte le titre du projet et mon nom.",
            ],
          },
        ],
      },
      {
        id: "les-chiffres",
        titre: "Le budget et le plan de financement",
        blocs: [
          {
            type: "points",
            elements: [
              "Le budget est dans la devise demandée, et son total est le même partout où il est cité.",
              "Le plan de financement distingue ce qui est acquis de ce qui est demandé ou recherché.",
              "Le montant demandé à cet organisme respecte les plafonds de son règlement.",
              "Les justificatifs des financements déjà acquis sont joints s'ils sont exigés.",
            ],
          },
        ],
      },
      {
        id: "les-pieces-administratives",
        titre: "Les pièces administratives",
        blocs: [
          {
            type: "points",
            elements: [
              "Les pièces d'identité et les documents de la structure porteuse sont à jour.",
              "Les droits nécessaires sont établis : cession de droits d'auteur, option sur une œuvre adaptée, autorisations.",
              "Les lettres d'engagement ou de soutien sont signées et datées.",
              "Les formulaires de l'organisme sont remplis sur sa dernière version.",
            ],
          },
        ],
      },
      {
        id: "avant-l-envoi",
        titre: "Avant l'envoi",
        blocs: [
          {
            type: "points",
            elements: [
              "Les fichiers sont au format et au poids acceptés, et nommés comme le règlement le demande.",
              "J'ai ouvert chaque fichier une dernière fois pour vérifier qu'il s'affiche correctement.",
              "Je dépose avant le dernier jour : un dépôt en ligne peut échouer dans les dernières heures.",
              "J'ai conservé une copie du dossier déposé et l'accusé de réception.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "checklist-de-preproduction",
    titre: "Préparer une checklist de préproduction",
    description:
      "Les points à vérifier entre la fin de l'écriture et le premier jour de tournage, par domaine.",
    categorie: "preproduction",
    type: "checklist",
    statut: "brouillon",
    langue: "fr",
    misAJourLe: null,
    auteur: "FilmFund Africa",
    sections: [
      {
        id: "comment-s-en-servir",
        titre: "Comment s'en servir",
        blocs: [
          {
            type: "paragraphe",
            texte:
              "La préproduction transforme un scénario en plan de travail. Cette liste couvre les points les plus courants ; adaptez-la à la taille de votre tournage, à votre pays et aux règles qui s'y appliquent. Elle ne remplace ni un directeur de production, ni les obligations légales locales.",
          },
        ],
      },
      {
        id: "scenario-et-decoupage",
        titre: "Scénario et découpage",
        blocs: [
          {
            type: "points",
            elements: [
              "La version du scénario qui sera tournée est arrêtée, datée et partagée avec l'équipe.",
              "Le dépouillement est fait : décors, personnages, accessoires, costumes, véhicules, effets.",
              "Le découpage technique est prêt pour les scènes qui le demandent.",
              "Le storyboard existe pour les scènes complexes.",
            ],
          },
        ],
      },
      {
        id: "equipe-et-interpretes",
        titre: "Équipe et interprètes",
        blocs: [
          {
            type: "points",
            elements: [
              "Les chefs de poste sont engagés, et leurs dates confirmées par écrit.",
              "La distribution est arrêtée, avec les contrats ou accords signés.",
              "Les autorisations nécessaires pour les mineurs sont obtenues.",
              "Chacun sait qui décide de quoi sur le plateau.",
            ],
          },
        ],
      },
      {
        id: "decors-et-autorisations",
        titre: "Décors et autorisations",
        blocs: [
          {
            type: "points",
            elements: [
              "Les repérages sont faits, avec des photos et les contraintes de chaque lieu : accès, bruit, lumière, électricité.",
              "Les autorisations de tournage sont demandées, puis obtenues par écrit.",
              "Les accords des propriétaires et des riverains concernés sont signés.",
              "Une solution de repli existe pour les décors extérieurs.",
            ],
          },
        ],
      },
      {
        id: "materiel-et-energie",
        titre: "Matériel et énergie",
        blocs: [
          {
            type: "points",
            elements: [
              "La liste du matériel est arrêtée par les chefs de poste, et réservée.",
              "Le besoin électrique de chaque décor est estimé, et la source de courant prévue.",
              "Les supports d'enregistrement et les sauvegardes sont prévus, avec qui s'en charge.",
              "Le matériel est essayé avant le premier jour.",
            ],
          },
        ],
      },
      {
        id: "budget-et-planning",
        titre: "Budget et planning",
        blocs: [
          {
            type: "points",
            elements: [
              "Le budget est à jour, avec une ligne d'imprévus.",
              "Le plan de travail est établi, jour par jour, et tient compte des disponibilités de chacun.",
              "Le transport, l'hébergement et les repas sont organisés.",
              "Les assurances nécessaires sont souscrites.",
            ],
          },
        ],
      },
      {
        id: "la-veille",
        titre: "La veille du premier jour",
        blocs: [
          {
            type: "points",
            elements: [
              "La feuille de service est envoyée à toute l'équipe.",
              "Les contacts d'urgence et le point de rendez-vous sont connus de tous.",
              "Les documents à avoir sur place — autorisations, contrats, assurances — sont rassemblés.",
            ],
          },
        ],
      },
    ],
  },
];

/** Adresse sûre pour une référence externe : `https`, et rien d'autre. */
export function estLienSur(url: string): boolean {
  try {
    const adresse = new URL(url);
    return adresse.protocol === "https:" && adresse.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Ce qu'un lecteur voit : les ressources publiées, et les brouillons pour
 * l'administration seule. Publiées d'abord, puis par titre.
 */
export function ressourcesVisibles(
  administrateur: boolean,
  ressources: readonly Ressource[] = RESSOURCES,
): Ressource[] {
  const ordre = new Intl.Collator("fr");
  return ressources
    .filter((ressource) => ressource.statut === "publie" || administrateur)
    .sort(
      (a, b) =>
        Number(a.statut !== "publie") - Number(b.statut !== "publie") ||
        ordre.compare(a.titre, b.titre),
    );
}

/** La ressource de cette adresse, si ce lecteur peut la voir. */
export function trouverRessource(
  slug: string,
  administrateur: boolean,
  ressources: readonly Ressource[] = RESSOURCES,
): Ressource | null {
  return ressourcesVisibles(administrateur, ressources).find((r) => r.slug === slug) ?? null;
}

export type FiltresRessources = {
  /** Mots cherchés dans le titre et la description ; vide : aucun. */
  texte: string;
  categorie: CategorieRessource | null;
  type: TypeRessource | null;
};

const enTexte = (valeur: unknown) =>
  (Array.isArray(valeur) ? valeur[0] : valeur) as unknown as string | undefined;

/**
 * Lit les filtres d'une adresse. Une valeur inconnue est ignorée plutôt que
 * refusée : une adresse recopiée de travers montre la bibliothèque, pas une
 * erreur.
 */
export function lireFiltresRessources(lire: (champ: string) => unknown): FiltresRessources {
  const connu = <T extends string>(valeur: unknown, table: Readonly<Record<T, string>>) => {
    const code = enTexte(valeur);
    return typeof code === "string" && Object.hasOwn(table, code) ? (code as T) : null;
  };
  const recherche = enTexte(lire("q"));
  return {
    texte:
      typeof recherche === "string"
        ? recherche.replace(/\s+/g, " ").trim().slice(0, RECHERCHE_RESSOURCES_MAX)
        : "",
    categorie: connu(lire("categorie"), CATEGORIES_RESSOURCE),
    type: connu(lire("type"), TYPES_RESSOURCE),
  };
}

/** Vrai si un filtre au moins restreint la liste. */
export function filtresRessourcesActifs(filtres: FiltresRessources): boolean {
  return filtres.texte !== "" || filtres.categorie !== null || filtres.type !== null;
}

/** Sans casse ni accents : « synopsis » trouve « Synopsis », « resume » trouve « résumé ». */
function replier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Les ressources qui répondent aux filtres. La recherche porte sur le titre
 * et la description ; chaque mot doit s'y trouver.
 */
export function filtrerRessources(
  ressources: readonly Ressource[],
  filtres: FiltresRessources,
): Ressource[] {
  const mots = replier(filtres.texte).split(" ").filter(Boolean);
  return ressources.filter((ressource) => {
    if (filtres.categorie !== null && ressource.categorie !== filtres.categorie) {
      return false;
    }
    if (filtres.type !== null && ressource.type !== filtres.type) {
      return false;
    }
    const ou = replier(`${ressource.titre} ${ressource.description}`);
    return mots.every((mot) => ou.includes(mot));
  });
}

/** Ce que la carte propose : lire ici, ou ouvrir la source. Jamais un bouton sans destination. */
export function actionDe(ressource: Ressource): { libelle: string; externe: boolean } | null {
  if (ressource.sections?.length) {
    return { libelle: "Lire", externe: false };
  }
  if (ressource.lien && estLienSur(ressource.lien.url)) {
    return { libelle: "Consulter la source", externe: true };
  }
  return null;
}

/** « 1 ressource », « 4 ressources ». */
export function nombreRessources(nombre: number): string {
  return nombre === 0 ? "Aucune ressource" : nombre === 1 ? "1 ressource" : `${nombre} ressources`;
}
