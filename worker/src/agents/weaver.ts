/**
 * WEAVER : logline, synopsis court, standard, détaillé et note d'intention.
 *
 * L'agent ne connaît ni la clé d'API ni le SDK : il reçoit un fournisseur de
 * la passerelle. Les tests lui en donnent un factice, désigné comme tel.
 *
 * Un seul exécuteur sert les cinq actions : la provision, l'appel, le coût
 * confirmé et le dépôt de la proposition sont les mêmes. Deux choses
 * changent d'un livrable à l'autre, et elles seules : le message préparé pour
 * le fournisseur, et la lecture de sa réponse.
 *
 * La logline garde le contexte pauvre de `contexte_travail` : son profil,
 * figé en version 1, a été écrit pour ce que cette fonction rend. Les quatre
 * autres lisent `contexte_redaction`, qui porte la fiche du projet, ses
 * personnages, sa vision et ses documents finalisés.
 */
import {
  codeDe,
  confirmerCout,
  lireContexte,
  lireContexteRedaction,
  lireContexteRetouche,
  livrerProposition,
  PLAFOND_ATTEINT,
  provisionnerCout,
  type Base,
  type ContexteRedaction,
  type ContexteRetouche,
  type Fiche,
} from "../base.ts";
import { EchecConnu, type Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import {
  coutMicroDollars,
  enDollars,
  estimerJetons,
  PROFIL_LOGLINE,
  PROFILS_RETOUCHE,
  PROFILS_WEAVER,
  type Profil,
  type ProfilAppel,
} from "../ia/profils.ts";

/** Limite de la colonne `projects.logline`, tenue par le profil de la logline. */
const LOGLINE_MAX = PROFIL_LOGLINE.longueurMax;

/**
 * Ce qui est transmis au fournisseur pour une logline : la fiche du projet,
 * et rien d'autre. Les balises séparent la donnée des consignes du profil.
 */
export function composerFiche(fiche: Fiche): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  return [
    "<fiche>",
    `Titre : ${fiche.titre}`,
    `Format : ${lisible(fiche.format)}`,
    `Étape : ${lisible(fiche.etape)}`,
    `Logline actuelle : ${fiche.logline.trim() || "(aucune)"}`,
    `Synopsis : ${fiche.synopsis.trim() || "(aucun)"}`,
    "</fiche>",
  ].join("\n");
}

/** Valeur absente : dite comme telle, jamais devinée ni passée sous silence. */
const ABSENT = "(non renseigné)";

function champ(libelle: string, valeur: string | number | null | undefined): string {
  const texte = typeof valeur === "number" ? String(valeur) : (valeur ?? "").trim();
  return `${libelle} : ${texte || ABSENT}`;
}

/**
 * Ce qui est transmis au fournisseur pour un livrable rédigé, dans l'ordre
 * imposé : projet, contexte, personnages, vision, documents, puis l'objectif.
 * L'objectif vient en dernier, après la donnée, pour que la demande ne soit
 * pas noyée.
 */
export function composerContexte(contexte: ContexteRedaction, objectif: string): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  const { projet, personnages, vision, documents } = contexte;
  const blocs = [
    [
      "<projet>",
      champ("Titre", projet.titre),
      champ("Format", lisible(projet.format)),
      champ("Étape", lisible(projet.etape)),
      champ("Genre", projet.genre && lisible(projet.genre)),
      champ("Pays de production", projet.pays?.join(", ")),
      champ("Langues", projet.langues),
      champ("Durée en minutes", projet.duree),
      "</projet>",
    ].join("\n"),
    [
      "<contexte>",
      champ("Pitch", contexte.contexte.pitch),
      champ("Synopsis court", contexte.contexte.synopsis_court),
      champ("Synopsis", contexte.contexte.synopsis),
      champ("Thème", contexte.contexte.theme),
      champ("Enjeux", contexte.contexte.enjeux),
      "</contexte>",
    ].join("\n"),
    [
      "<personnages>",
      ...(personnages.length
        ? personnages.map((personnage) =>
            [
              `- ${personnage.nom} (${lisible(personnage.role)})`,
              personnage.description.trim() ? `  ${personnage.description.trim()}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          )
        : [ABSENT]),
      "</personnages>",
    ].join("\n"),
    [
      "<vision>",
      champ("Vision artistique", vision.artistique),
      champ("Objectifs", vision.objectifs),
      champ("Public cible", vision.public),
      "</vision>",
    ].join("\n"),
    [
      "<documents>",
      ...(documents.length
        ? documents.map((document) =>
            [
              `<document type="${lisible(document.type)}">`,
              document.titre,
              "",
              document.contenu,
              "</document>",
            ].join("\n"),
          )
        : [ABSENT]),
      "</documents>",
    ].join("\n"),
  ];

  // Une séquence de scénario, et elle seule, porte deux blocs de plus : les
  // autres livrables gardent le message pour lequel leur profil a été écrit.
  if (contexte.sequence !== undefined) {
    const { scenario } = contexte;
    blocs.push(
      [
        "<scenario_deja_ecrit>",
        ...(scenario?.fin.trim()
          ? [
              `Longueur écrite : ${scenario.longueur} caractères. En voici la fin :`,
              "",
              scenario.fin,
            ]
          : ["(rien encore : cette séquence ouvre le scénario)"]),
        "</scenario_deja_ecrit>",
      ].join("\n"),
      [
        "<sequence_a_ecrire>",
        (contexte.sequence ?? "").trim() || ABSENT,
        "</sequence_a_ecrire>",
      ].join("\n"),
    );
  }
  return [...blocs, objectif].join("\n\n");
}

/**
 * Remet la réponse en une logline : un seul paragraphe, sans les guillemets
 * dont un modèle l'entoure parfois. Null si ce n'en est pas une.
 */
export function lireLogline(texte: string): string | null {
  const nette = texte
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[«"“]\s*/, "")
    .replace(/\s*[»"”]$/, "")
    .trim();
  return nette.length >= 1 && nette.length <= LOGLINE_MAX ? nette : null;
}

/**
 * Remet la réponse en un texte de plusieurs paragraphes : fins de ligne
 * normalisées, lignes vides en trop resserrées, caractères de contrôle
 * refusés — la base les refuserait au dépôt. Null si le texte est vide ou
 * trop long pour l'action.
 */
export function lireTexte(texte: string, max: number): string | null {
  const net = texte
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (net.length < 1 || net.length > max) {
    return null;
  }
  // Caractères de contrôle que la base refuse au dépôt, saut de ligne et
  // tabulation exceptés.
  return /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(net) ? null : net;
}

/**
 * Un livrable : son profil, la préparation de son message, la lecture de sa
 * réponse et son dépôt. Un texte ou une donnée structurée : ce qui en sort
 * n'importe pas à la mécanique de l'appel.
 */
export type Livrable<T> = {
  profil: ProfilAppel;
  /** Message pour le fournisseur ; null si le projet n'est plus accessible. */
  preparer: (attemptId: string) => Promise<string | null>;
  /** Null : la réponse n'est pas exploitable, rien ne sera déposé. */
  lire: (texte: string) => T | null;
  /** Dépose la proposition et conclut l'essai. */
  deposer: (attemptId: string, valeur: T) => Promise<unknown>;
  /** Motif inscrit sur la tâche quand la réponse n'est pas exploitable. */
  inexploitable: string;
};

/**
 * Exécuteur d'un livrable : provision, appel, coût confirmé, dépôt. Les
 * agents ne recopient pas cette mécanique — le coût d'un appel ne doit se
 * compter qu'à un seul endroit.
 */
export function creerExecuteur<T>(
  base: Base,
  fournisseur: Fournisseur,
  livrable: Livrable<T>,
): Executeur {
  const { profil } = livrable;
  return async (travail, signal) => {
    const message = await livrable.preparer(travail.attemptId);
    if (message === null) {
      throw new EchecConnu("Le projet de cette tâche n'est plus accessible.");
    }

    // Provision au pire : toute l'entrée, et le plafond de sortie.
    const pire = [
      {
        modele: profil.modele,
        jetonsEntree: estimerJetons(profil.systeme + message),
        jetonsSortie: profil.jetonsMax,
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
      reponse = await fournisseur({ profil, message }, signal);
    } catch (erreur) {
      // Requête refusée : le fournisseur ne l'a ni traitée ni facturée. Le
      // coût est soldé à zéro, sans quoi la provision pèserait sur le plafond
      // du mois pour un appel qui n'a rien coûté.
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
    // avant tout contrôle de la réponse.
    const cout = coutMicroDollars(reponse.usages);
    await confirmerCout(base, travail.attemptId, {
      modele: reponse.modeleServi,
      jetonsEntree: reponse.usages.reduce((total, u) => total + u.jetonsEntree, 0),
      jetonsSortie: reponse.usages.reduce((total, u) => total + u.jetonsSortie, 0),
      dollars: cout === null ? null : enDollars(cout),
      repli: reponse.repli,
    });

    if (reponse.arret === "refus") {
      throw new EchecConnu("Le fournisseur a décliné cette demande.");
    }
    if (reponse.arret !== "fin") {
      throw new EchecConnu("La réponse du fournisseur est incomplète.");
    }
    const valeur = livrable.lire(reponse.texte);
    if (valeur === null) {
      throw new EchecConnu(livrable.inexploitable);
    }

    await livrable.deposer(travail.attemptId, valeur);
    return {};
  };
}

/**
 * Exécuteurs d'un jeu de profils, avec ce fournisseur.
 *
 * La mécanique d'une rédaction ne dépend pas de l'agent : seule la logline
 * s'écarte, par son contexte pauvre et sa lecture d'une phrase. Les agents
 * qui écrivent du texte long — SCRIPT, et ceux qui suivront — reprennent
 * cette fabrique plutôt que d'en recopier une.
 */
export function executeursDeProfils(
  base: Base,
  fournisseur: Fournisseur,
  profils: Readonly<Record<string, Profil>>,
): Readonly<Record<string, Executeur>> {
  const commun = {
    deposer: (attemptId: string, texte: string) => livrerProposition(base, attemptId, texte),
    inexploitable: "La réponse du fournisseur n'est pas un texte exploitable.",
  };
  const livrable = (action: string, profil: Profil): Livrable<string> =>
    action === "logline"
      ? {
          ...commun,
          profil,
          preparer: async (attemptId) => {
            const fiche = await lireContexte(base, attemptId);
            return fiche ? composerFiche(fiche) : null;
          },
          lire: (texte) => lireLogline(texte),
        }
      : {
          ...commun,
          profil,
          preparer: async (attemptId) => {
            const contexte = await lireContexteRedaction(base, attemptId);
            return contexte ? composerContexte(contexte, profil.objectif ?? "") : null;
          },
          lire: (texte) => lireTexte(texte, profil.longueurMax),
        };

  return Object.fromEntries(
    Object.entries(profils).map(([action, profil]) => [
      action,
      creerExecuteur(base, fournisseur, livrable(action, profil)),
    ]),
  );
}

/**
 * Ce qui est transmis au fournisseur pour une retouche : quelques repères du
 * projet, le document, ce qui entoure le passage, le passage, puis l'objectif
 * — en dernier, après la donnée. Ni personnages, ni vision, ni budget : une
 * retouche travaille le texte qu'on lui donne.
 */
export function composerContexteRetouche(contexte: ContexteRetouche, objectif: string): string {
  const lisible = (code: string) => code.replaceAll("_", " ");
  const champ = (libelle: string, valeur: string | null | undefined) =>
    `${libelle} : ${(valeur ?? "").trim() || "(non renseigné)"}`;
  const { projet, document } = contexte;
  const blocs = [
    [
      "<projet>",
      champ("Titre", projet.titre),
      champ("Format", lisible(projet.format)),
      champ("Genre", projet.genre && lisible(projet.genre)),
      champ("Langues", projet.langues),
      champ("Pitch", contexte.contexte.pitch),
      "</projet>",
    ].join("\n"),
    [
      "<document>",
      champ("Type", lisible(document.type)),
      champ("Titre", document.titre),
      "</document>",
    ].join("\n"),
    [
      "<ce_qui_precede>",
      contexte.avant.trim() || "(rien : ce passage ouvre le document)",
      "</ce_qui_precede>",
    ].join("\n"),
    [
      "<ce_qui_suit>",
      contexte.apres.trim() || "(rien : ce passage clôt le document)",
      "</ce_qui_suit>",
    ].join("\n"),
    ["<passage>", contexte.passage, "</passage>"].join("\n"),
  ];
  return [...blocs, objectif].join("\n\n");
}

/** Les retouches d'un passage : même mécanique d'appel, un autre contexte. */
function executeursRetouches(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return Object.fromEntries(
    Object.entries(PROFILS_RETOUCHE).map(([action, profil]) => [
      action,
      creerExecuteur<string>(base, fournisseur, {
        profil,
        preparer: async (attemptId) => {
          const contexte = await lireContexteRetouche(base, attemptId);
          return contexte ? composerContexteRetouche(contexte, profil.objectif ?? "") : null;
        },
        lire: (texte) => lireTexte(texte, profil.longueurMax),
        deposer: (attemptId, texte) => livrerProposition(base, attemptId, texte),
        inexploitable: "La réponse du fournisseur n'est pas un passage exploitable.",
      }),
    ]),
  );
}

/** Ce que WEAVER sait exécuter, avec ce fournisseur : ses rédactions et ses retouches. */
export function executeursWeaver(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return {
    ...executeursDeProfils(base, fournisseur, PROFILS_WEAVER),
    ...executeursRetouches(base, fournisseur),
  };
}
