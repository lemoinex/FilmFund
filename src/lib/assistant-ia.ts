/**
 * L'Assistant IA d'un projet (lot AS1) : ce que l'assistant sait faire, rangé
 * par besoin, et l'écran où chaque demande se fait.
 *
 * Cette liste ne lance rien et ne décide de rien : elle mène à l'encart
 * existant, qui garde son devis, sa confirmation et ses contrôles. Elle ne
 * nomme aucun agent — l'équipe voit un assistant, pas onze. Un test vérifie
 * qu'elle couvre chaque action du catalogue (`propositions.ts`) et chaque
 * prix du barème, pour qu'un livrable ajouté n'y manque pas.
 *
 * Module pur, sans import : il est aussi chargé tel quel par les tests Node.
 */

/** Colonne du barème publié qui dit le prix d'une demande ; `image` : le quota d'images. */
export type TarifAssistant =
  | "logline"
  | "synopsis_short"
  | "synopsis_standard"
  | "synopsis_detailed"
  | "intention_note"
  | "direction_note"
  | "pitch_extended"
  | "pitch_oral"
  | "dramatic_analysis"
  | "character_list"
  | "episode_list"
  | "budget_plan"
  | "schedule_plan"
  | "shot_list"
  | "gear_list"
  | "research"
  | "cultural_context"
  | "treatment"
  | "bible"
  | "screenplay_per_sequence"
  | "dialogue_per_scene"
  | "text_edit_per_passage"
  | "image";

export type DemandeAssistant = {
  /** Action de la tâche, telle que la base et le worker la nomment. */
  action: string;
  /** Ce que l'assistant produit, nommé comme à l'écran. */
  libelle: string;
  /** Ce qu'il en fait, en une phrase : où le résultat atterrit, ou ce qu'il ne fait pas. */
  effet: string;
  /** Où la demande se fait, dit à l'équipe. */
  lieu: string;
  /** Chemin sous le projet, ancre comprise, de l'écran où la demande se fait. */
  chemin: string;
  tarif: TarifAssistant;
  /** `serie` : projets de série seulement ; `budget` : à qui gère le budget seulement. */
  reserve?: "serie" | "budget";
};

export type BesoinAssistant = {
  cle: string;
  titre: string;
  aide: string;
  demandes: readonly DemandeAssistant[];
};

/** Lieu commun aux demandes qui partent d'un passage sélectionné. */
const SOUS_L_EDITEUR = "Sous l'éditeur d'un document : ouvrez-le, puis sélectionnez le passage.";

export const BESOINS_ASSISTANT: readonly BesoinAssistant[] = [
  {
    cle: "presenter",
    titre: "Présenter le projet",
    aide: "Les textes qui disent le film en quelques lignes ou en quelques pages.",
    demandes: [
      {
        action: "logline",
        libelle: "Pitch",
        effet: "La logline du projet, proposée à la place du pitch actuel.",
        lieu: "Onglet « Synthèse »",
        chemin: "#assistant-logline",
        tarif: "logline",
      },
      {
        action: "synopsis_short",
        libelle: "Synopsis court",
        effet: "Proposé pour la fiche du projet.",
        lieu: "Onglet « Fiche »",
        chemin: "/fiche#assistant-synopsis_short",
        tarif: "synopsis_short",
      },
      {
        action: "synopsis_standard",
        libelle: "Synopsis",
        effet: "Le récit du début au dénouement, proposé à la place du synopsis du projet.",
        lieu: "Onglet « Synthèse »",
        chemin: "#assistant-synopsis_standard",
        tarif: "synopsis_standard",
      },
      {
        action: "synopsis_detailed",
        libelle: "Synopsis détaillé",
        effet: "Dans un document versionné du projet, créé en brouillon s'il n'existe pas.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-synopsis_detailed",
        tarif: "synopsis_detailed",
      },
      {
        action: "intention_note",
        libelle: "Note d'intention",
        effet: "Dans un document versionné du projet, créé en brouillon s'il n'existe pas.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-intention_note",
        tarif: "intention_note",
      },
      {
        action: "direction_note",
        libelle: "Note de réalisation",
        effet: "Dans un document versionné du projet, créé en brouillon s'il n'existe pas.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-direction_note",
        tarif: "direction_note",
      },
      {
        action: "pitch_extended",
        libelle: "Pitch développé",
        effet: "Dans son propre document, à part du pitch du projet.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-pitch_extended",
        tarif: "pitch_extended",
      },
      {
        action: "pitch_oral",
        libelle: "Pitch oral",
        effet: "Dans son propre document ; la durée annoncée est une estimation.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-pitch_oral",
        tarif: "pitch_oral",
      },
    ],
  },
  {
    cle: "recit",
    titre: "Construire le récit",
    aide: "Les personnages, la structure et le scénario, écrit séquence par séquence.",
    demandes: [
      {
        action: "character_list",
        libelle: "Personnages",
        effet:
          "Des personnages à ajouter, acceptés ou écartés un à un ; aucun personnage saisi n'est réécrit.",
        lieu: "Assistant de création, étape « Personnages »",
        chemin: "/assistant/personnages#assistant-personnages",
        tarif: "character_list",
      },
      {
        action: "dramatic_analysis",
        libelle: "Analyse dramaturgique",
        effet: "Une lecture du projet, dans un document ; elle ne réécrit rien du projet.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-dramatic_analysis",
        tarif: "dramatic_analysis",
      },
      {
        action: "treatment",
        libelle: "Traitement",
        effet: "Dans un document versionné du projet, créé en brouillon s'il n'existe pas.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-treatment",
        tarif: "treatment",
      },
      {
        action: "bible",
        libelle: "Bible de série",
        effet: "Dans un document versionné du projet, créé en brouillon s'il n'existe pas.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-bible",
        tarif: "bible",
      },
      {
        action: "episode_list",
        libelle: "Épisodes",
        effet:
          "Des épisodes à ajouter à la saison — un titre et un résumé —, acceptés ou écartés un à un.",
        lieu: "Page des épisodes, depuis la « Fiche »",
        chemin: "/episodes#assistant-episodes",
        tarif: "episode_list",
        reserve: "serie",
      },
      {
        action: "screenplay",
        libelle: "Séquence de scénario",
        effet:
          "Une séquence par demande, que vous décrivez, ajoutée à la fin du scénario ; pour un épisode, la demande se fait sous son scénario.",
        lieu: "Onglet « Documents »",
        chemin: "/documents#assistant-screenplay",
        tarif: "screenplay_per_sequence",
      },
      {
        action: "dialogue",
        libelle: "Dialogues d'une scène",
        effet: "Les répliques de la scène sélectionnée dans le scénario, et elle seule.",
        lieu: SOUS_L_EDITEUR,
        chemin: "/documents",
        tarif: "dialogue_per_scene",
      },
    ],
  },
  {
    cle: "reprendre",
    titre: "Reprendre un texte",
    aide: "Quatre retouches d'un passage sélectionné, jamais d'un document entier.",
    demandes: [
      {
        action: "text_improve",
        libelle: "Améliorer un passage",
        effet: "Des phrases plus nettes, sans changer ce que dit le passage.",
        lieu: SOUS_L_EDITEUR,
        chemin: "/documents",
        tarif: "text_edit_per_passage",
      },
      {
        action: "text_shorten",
        libelle: "Raccourcir un passage",
        effet:
          "Le même propos, resserré ; l'écran montre les deux longueurs, sans garantir l'écart.",
        lieu: SOUS_L_EDITEUR,
        chemin: "/documents",
        tarif: "text_edit_per_passage",
      },
      {
        action: "text_expand",
        libelle: "Développer un passage",
        effet: "Le passage déplié, sans rien y ajouter d'étranger.",
        lieu: SOUS_L_EDITEUR,
        chemin: "/documents",
        tarif: "text_edit_per_passage",
      },
      {
        action: "text_correct",
        libelle: "Corriger un passage",
        effet: "Orthographe, grammaire et ponctuation seulement : le style ne change pas.",
        lieu: SOUS_L_EDITEUR,
        chemin: "/documents",
        tarif: "text_edit_per_passage",
      },
    ],
  },
  {
    cle: "documenter",
    titre: "Documenter",
    aide: "Des synthèses qui renvoient à leurs sources ; aucune source n'est vérifiée par la plateforme.",
    demandes: [
      {
        action: "research",
        libelle: "Recherche documentaire",
        effet:
          "Une synthèse sourcée de pages publiques ; seule votre question part chez un moteur externe.",
        lieu: "Onglet « Recherche »",
        chemin: "/recherche#demande-recherche",
        tarif: "research",
      },
      {
        action: "cultural_context",
        libelle: "Contexte historique et culturel",
        effet:
          "La même recherche, sur une liste fermée de revues, d'archives et d'institutions, pour l'Afrique centrale.",
        lieu: "Onglet « Recherche », choix « Où chercher »",
        chemin: "/recherche#demande-recherche",
        tarif: "cultural_context",
      },
    ],
  },
  {
    cle: "tournage",
    titre: "Préparer le tournage",
    aide: "Le découpage, le storyboard, le matériel et le planning.",
    demandes: [
      {
        action: "shot_list",
        libelle: "Découpage d'une scène",
        effet: "Les plans d'une scène du storyboard, acceptés ou écartés un à un.",
        lieu: "Onglet « Storyboard », volet « Découpage » de la scène",
        chemin: "/storyboard",
        tarif: "shot_list",
      },
      {
        action: "storyboard_image",
        libelle: "Vignette d'une scène",
        effet: "Un croquis à l'encre noire ; il ne remplace une image qu'avec votre accord.",
        lieu: "Onglet « Storyboard », carte de la scène",
        chemin: "/storyboard",
        tarif: "image",
      },
      {
        action: "gear_list",
        libelle: "Liste de matériel",
        effet:
          "Des équipements à ajouter, sans marque ni prix ; le besoin électrique reste calculé par la plateforme.",
        lieu: "Onglet « Matériel »",
        chemin: "/materiel#assistant-materiel",
        tarif: "gear_list",
      },
      {
        action: "schedule_plan",
        libelle: "Jalons de planning",
        effet:
          "Un titre, une phase et une durée par jalon, jamais de date : vous datez en acceptant.",
        lieu: "Onglet « Planning »",
        chemin: "/planning#assistant-planning",
        tarif: "schedule_plan",
      },
    ],
  },
  {
    cle: "chiffrer",
    titre: "Chiffrer",
    aide: "Des estimations à vérifier ; les totaux restent calculés par la plateforme.",
    demandes: [
      {
        action: "budget_plan",
        libelle: "Lignes de budget",
        effet:
          "Des lignes de dépense estimées, sans grille tarifaire, acceptées ou écartées une à une.",
        lieu: "Onglet « Budget »",
        chemin: "/budget#assistant-budget",
        tarif: "budget_plan",
        reserve: "budget",
      },
    ],
  },
];

/**
 * Les besoins tels qu'un projet les montre : sans ce qui ne le concerne pas.
 * Une entrée réservée au budget ne se montre qu'à qui le gère — la proposer à
 * un autre ne mènerait qu'à une page introuvable ; un besoin vidé disparaît.
 */
export function besoinsDuProjet(contexte: { serie: boolean; budget: boolean }): BesoinAssistant[] {
  return BESOINS_ASSISTANT.map((besoin) => ({
    ...besoin,
    demandes: besoin.demandes.filter(
      (demande) =>
        (demande.reserve !== "serie" || contexte.serie) &&
        (demande.reserve !== "budget" || contexte.budget),
    ),
  })).filter((besoin) => besoin.demandes.length > 0);
}

/** Adresse de l'écran où une demande se fait, pour ce projet. */
export function destinationAssistant(projetId: string, demande: DemandeAssistant): string {
  return `/projets/${projetId}${demande.chemin}`;
}

/** Adresse de la page « Assistant IA » d'un projet. */
export function pageAssistant(projetId: string): string {
  return `/projets/${projetId}/assistant-ia`;
}

/** « 26 demandes » : le décompte de ce que la page liste. */
export function decompteDemandes(besoins: readonly BesoinAssistant[]): string {
  const nombre = besoins.reduce((total, besoin) => total + besoin.demandes.length, 0);
  return `${nombre} demande${nombre > 1 ? "s" : ""}`;
}
