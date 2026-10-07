/**
 * Alertes internes (lot W1) : ce qui, dans les projets de l'utilisateur,
 * demande une action. Module pur, sans import : il est aussi chargé tel quel
 * par les tests Node.
 *
 * Rien n'est stocké. Une alerte est calculée à la lecture, sur des données
 * réelles, et disparaît quand sa cause disparaît : il n'y a donc ni « lu »,
 * ni « non lu », ni historique.
 */

/**
 * Seuils, en jours. Ce sont des choix du lot, pas une norme : l'écran les
 * dit là où l'alerte s'affiche.
 */
export const SEUILS_ALERTES = {
  etapeProche: 7,
  candidatureProche: 14,
  opportuniteProche: 14,
  dossierIncomplet: 30,
} as const;

/** Natures d'alerte, de la plus pressante à la moins pressante. */
export const NATURES_ALERTE = {
  etape_en_retard: "Étape en retard",
  dossier_incomplet: "Dossier incomplet",
  candidature_proche: "Candidature à déposer",
  opportunite_proche: "Opportunité bientôt close",
  etape_proche: "Étape à venir",
} as const;

export type NatureAlerte = keyof typeof NATURES_ALERTE;

/** La règle de chaque nature, dite telle qu'elle est calculée. */
export const REGLES_ALERTE: Readonly<Record<NatureAlerte, string>> = {
  etape_en_retard: "Une étape du planning non terminée, dont l'échéance est passée.",
  dossier_incomplet: `Une candidature « à préparer » dont la date limite tombe dans les ${SEUILS_ALERTES.dossierIncomplet} jours, sans pièce jointe ou avec une pièce qui n'est pas finalisée.`,
  candidature_proche: `Une candidature « à préparer », pièces finalisées, dont la date limite tombe dans les ${SEUILS_ALERTES.candidatureProche} jours.`,
  opportunite_proche: `Une opportunité à étudier pour l'un de vos projets, dont la date limite tombe dans les ${SEUILS_ALERTES.opportuniteProche} jours.`,
  etape_proche: `Une étape du planning non terminée, dont l'échéance tombe dans les ${SEUILS_ALERTES.etapeProche} jours.`,
};

/** Ce que l'écran dit de l'ensemble, une fois. */
export const PRINCIPE_ALERTES =
  "Les alertes sont calculées à chaque lecture, sur vos projets et ceux de vos équipes. Rien n'est enregistré : une alerte disparaît quand sa cause disparaît. Les délais retenus sont un choix de la plateforme, pas une norme.";

/** Lectures bornées : au-delà, la page le dit. */
export const LIMITES_ALERTES = { projets: 100, lignes: 100 } as const;

/** Alertes montrées sur le tableau de bord : un aperçu, la rubrique a la liste. */
export const ALERTES_PRESENTEES = 3;

export type Alerte = {
  nature: NatureAlerte;
  /** Le jour dont l'alerte parle, AAAA-MM-JJ. */
  jour: string;
  titre: string;
  /** Ce qui la précise : un retard, un délai, ce qui manque. */
  detail: string;
  projetId: string;
  projet: string;
  href: string;
};

export type DonneesAlertes = {
  /** Titre de chaque projet, par identifiant. */
  titres: ReadonlyMap<string, string>;
  etapes: readonly {
    project_id: string;
    title: string;
    due_on: string | null;
    status: string;
  }[];
  /** Candidatures que la base rend à l'utilisateur : jamais leur montant. */
  candidatures: readonly {
    id: string;
    project_id: string;
    funder: string;
    program: string | null;
    deadline: string | null;
    status: string;
  }[];
  /** Pièces jointes aux candidatures, avec le statut de leur document. */
  pieces: readonly { funding_id: string; statut: string }[];
  /** Opportunités déjà reconnues « à étudier » pour un projet donné. */
  opportunites: readonly {
    id: string;
    projetId: string;
    name: string;
    organization: string;
    deadline: string | null;
  }[];
};

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const ORDRE_NATURES = Object.keys(NATURES_ALERTE) as NatureAlerte[];

/** Jours de `depuis` à `jusqua`, tous deux AAAA-MM-JJ ; négatif si `jusqua` est avant. */
export function joursEntre(depuis: string, jusqua: string): number {
  return Math.round(
    (Date.parse(`${jusqua}T00:00:00Z`) - Date.parse(`${depuis}T00:00:00Z`)) / 86_400_000,
  );
}

/** « aujourd'hui », « demain », « dans 5 jours ». */
export function delaiEnClair(jours: number): string {
  if (jours === 0) {
    return "aujourd'hui";
  }
  return jours === 1 ? "demain" : `dans ${jours} jours`;
}

/** « depuis hier », « depuis 5 jours ». */
function retardEnClair(jours: number): string {
  return jours === 1 ? "en retard depuis hier" : `en retard depuis ${jours} jours`;
}

/** Le jour est lisible, et tombe d'aujourd'hui à `seuil` jours, bornes comprises. */
function dansLeDelai(jour: string | null, aujourdhui: string, seuil: number): jour is string {
  if (jour === null || !JOUR.test(jour)) {
    return false;
  }
  const ecart = joursEntre(aujourdhui, jour);
  return ecart >= 0 && ecart <= seuil;
}

/**
 * Les alertes, la plus pressante d'abord : par nature, puis par date.
 *
 * Une candidature ne donne qu'une alerte : « dossier incomplet » tant qu'il
 * l'est, « à déposer » une fois ses pièces finalisées. Une étape en retard
 * n'est pas aussi « à venir ». Une date limite passée n'alerte plus : le
 * planning et les financements le disent déjà.
 */
export function calculerAlertes(donnees: DonneesAlertes, aujourdhui: string): Alerte[] {
  const titre = (projetId: string) => donnees.titres.get(projetId) ?? "";
  const alertes: Alerte[] = [];

  for (const etape of donnees.etapes) {
    if (etape.status === "termine" || etape.due_on === null || !JOUR.test(etape.due_on)) {
      continue;
    }
    const ecart = joursEntre(aujourdhui, etape.due_on);
    if (ecart < 0) {
      alertes.push({
        nature: "etape_en_retard",
        jour: etape.due_on,
        titre: etape.title,
        detail: retardEnClair(-ecart),
        projetId: etape.project_id,
        projet: titre(etape.project_id),
        href: `/projets/${etape.project_id}/planning`,
      });
    } else if (ecart <= SEUILS_ALERTES.etapeProche) {
      alertes.push({
        nature: "etape_proche",
        jour: etape.due_on,
        titre: etape.title,
        detail: delaiEnClair(ecart),
        projetId: etape.project_id,
        projet: titre(etape.project_id),
        href: `/projets/${etape.project_id}/planning`,
      });
    }
  }

  const piecesPar = new Map<string, string[]>();
  for (const piece of donnees.pieces) {
    piecesPar.set(piece.funding_id, [...(piecesPar.get(piece.funding_id) ?? []), piece.statut]);
  }

  for (const candidature of donnees.candidatures) {
    if (candidature.status !== "a_preparer") {
      continue;
    }
    const nom = candidature.program
      ? `${candidature.funder} — ${candidature.program}`
      : candidature.funder;
    const commun = {
      titre: nom,
      projetId: candidature.project_id,
      projet: titre(candidature.project_id),
      href: `/projets/${candidature.project_id}/financements`,
    };
    const pieces = piecesPar.get(candidature.id) ?? [];
    const nonFinalisees = pieces.filter((statut) => statut !== "finalise").length;
    const incomplet = pieces.length === 0 || nonFinalisees > 0;

    if (
      incomplet &&
      dansLeDelai(candidature.deadline, aujourdhui, SEUILS_ALERTES.dossierIncomplet)
    ) {
      const manque =
        pieces.length === 0
          ? "aucune pièce jointe"
          : nonFinalisees === 1
            ? "1 pièce non finalisée"
            : `${nonFinalisees} pièces non finalisées`;
      alertes.push({
        ...commun,
        nature: "dossier_incomplet",
        jour: candidature.deadline,
        detail: `${manque} · date limite ${delaiEnClair(joursEntre(aujourdhui, candidature.deadline))}`,
      });
    } else if (
      !incomplet &&
      dansLeDelai(candidature.deadline, aujourdhui, SEUILS_ALERTES.candidatureProche)
    ) {
      alertes.push({
        ...commun,
        nature: "candidature_proche",
        jour: candidature.deadline,
        detail: `pièces finalisées · date limite ${delaiEnClair(joursEntre(aujourdhui, candidature.deadline))}`,
      });
    }
  }

  for (const opportunite of donnees.opportunites) {
    if (dansLeDelai(opportunite.deadline, aujourdhui, SEUILS_ALERTES.opportuniteProche)) {
      alertes.push({
        nature: "opportunite_proche",
        jour: opportunite.deadline,
        titre: opportunite.name,
        detail: `${opportunite.organization} · date limite ${delaiEnClair(joursEntre(aujourdhui, opportunite.deadline))}`,
        projetId: opportunite.projetId,
        projet: titre(opportunite.projetId),
        href: `/opportunites/${opportunite.id}`,
      });
    }
  }

  return alertes
    .map((alerte, rang) => ({ alerte, rang }))
    .sort(
      (a, b) =>
        ORDRE_NATURES.indexOf(a.alerte.nature) - ORDRE_NATURES.indexOf(b.alerte.nature) ||
        a.alerte.jour.localeCompare(b.alerte.jour) ||
        a.rang - b.rang,
    )
    .map(({ alerte }) => alerte);
}

/** Les alertes regroupées par projet, dans l'ordre où le premier projet apparaît. */
export function grouperParProjet(
  alertes: readonly Alerte[],
): { projetId: string; projet: string; alertes: Alerte[] }[] {
  const groupes = new Map<string, { projetId: string; projet: string; alertes: Alerte[] }>();
  for (const alerte of alertes) {
    const groupe = groupes.get(alerte.projetId) ?? {
      projetId: alerte.projetId,
      projet: alerte.projet,
      alertes: [],
    };
    groupe.alertes.push(alerte);
    groupes.set(alerte.projetId, groupe);
  }
  return [...groupes.values()];
}

/** « 1 alerte », « 4 alertes ». */
export function nombreEnClair(nombre: number): string {
  return nombre === 1 ? "1 alerte" : `${nombre} alertes`;
}
