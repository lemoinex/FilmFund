/**
 * Mise en mots des entrées du journal d'administration.
 *
 * Module pur, sans accès à la base : les noms des comptes et les titres des
 * projets lui sont fournis. Il reste ainsi testable sans pile Supabase.
 */

export type EntreeJournal = {
  id: number;
  created_at: string;
  actor_id: string | null;
  action: string;
  project_id: string | null;
  details: unknown;
};

/** Noms connus des comptes, titres des projets et noms des plans, par identifiant. */
export type Annuaire = {
  comptes: ReadonlyMap<string, string>;
  projets: ReadonlyMap<string, string>;
  plans?: ReadonlyMap<string, string>;
};

const ROLES: Record<string, string> = {
  member: "membre",
  admin: "administrateur",
};

const CHAMPS_PROFIL: Record<string, string> = {
  display_name: "nom affiché",
};

const TABLES: Record<string, string> = {
  project_members: "l'équipe",
  project_invitations: "les invitations",
  project_budgets: "le budget",
  budget_lines: "les lignes de budget",
  project_documents: "les documents",
  storyboard_scenes: "le storyboard",
  project_milestones: "le planning",
  project_fundings: "les financements",
  funding_documents: "les pièces de candidature",
  reservations: "les réservations d'unités",
  jobs: "les tâches",
};

const TABLES_STUDIO: Record<string, string> = {
  studios: "un studio",
  studio_members: "les membres d'un studio",
};

// Tournures sans accord : l'auteur peut être n'importe qui.
const OPERATIONS: Record<string, string> = {
  insert: "a fait un ajout dans",
  update: "a fait une modification dans",
  delete: "a fait une suppression dans",
};

function champ(details: unknown, cle: string): unknown {
  return details && typeof details === "object" && !Array.isArray(details)
    ? (details as Record<string, unknown>)[cle]
    : undefined;
}

function texte(details: unknown, cle: string): string | undefined {
  const valeur = champ(details, cle);
  return typeof valeur === "string" ? valeur : undefined;
}

/** Nom d'un compte ; un compte supprimé depuis garde une trace lisible. */
function nomDuCompte(id: string | undefined, annuaire: Annuaire): string {
  if (!id) {
    return "un compte inconnu";
  }
  return annuaire.comptes.get(id) ?? "un compte supprimé";
}

/** Nom d'un plan tel que la base le donne ; à défaut, son code. */
function nomDuPlan(code: string | undefined, annuaire: Annuaire): string {
  if (!code) {
    return "inconnu";
  }
  return annuaire.plans?.get(code) ?? code;
}

/** « de » élidé devant une voyelle : « d'Aïcha », « d'un compte supprimé ». */
function de(nom: string): string {
  return /^[aeiouyàâäéèêëîïôöùûüÿœæ]/iu.test(nom) ? `d'${nom}` : `de ${nom}`;
}

/**
 * Auteur de l'action. Sans auteur, l'action vient d'une requête SQL directe
 * ou de la clé secrète, que l'application n'emploie pas : c'est l'exploitant
 * de la plateforme, pas un compte de l'application.
 */
export function auteurDe(entree: EntreeJournal, annuaire: Annuaire): string {
  return entree.actor_id
    ? nomDuCompte(entree.actor_id, annuaire)
    : "L'exploitant (hors application)";
}

/** Phrase décrivant l'action, sans son auteur. */
export function descriptionDe(entree: EntreeJournal, annuaire: Annuaire): string {
  const { details } = entree;

  switch (entree.action) {
    case "changement_role": {
      const ancien = ROLES[texte(details, "ancien_role") ?? ""] ?? "inconnu";
      const nouveau = ROLES[texte(details, "nouveau_role") ?? ""] ?? "inconnu";
      return `a changé le rôle ${de(nomDuCompte(texte(details, "compte"), annuaire))} : ${ancien} → ${nouveau}`;
    }

    case "modification_profil": {
      const champs = champ(details, "champs");
      const libelles = Array.isArray(champs)
        ? champs.map((c) => CHAMPS_PROFIL[String(c)] ?? String(c)).join(", ")
        : "";
      return `a modifié le profil ${de(nomDuCompte(texte(details, "compte"), annuaire))}${libelles ? ` (${libelles})` : ""}`;
    }

    case "mode_prive":
      return champ(details, "actif") === true
        ? "a activé le mode privé"
        : "a désactivé le mode privé";

    case "suppression_projet":
      return `a supprimé le projet « ${texte(details, "titre") ?? "sans titre"} »`;

    case "intervention_contenu": {
      const table = TABLES[texte(details, "table") ?? ""] ?? "le contenu";
      const operation = OPERATIONS[texte(details, "operation") ?? ""] ?? "a écrit dans";
      const titre = entree.project_id ? annuaire.projets.get(entree.project_id) : undefined;
      return titre
        ? `${operation} ${table} du projet « ${titre} »`
        : `${operation} ${table} d'un projet supprimé depuis`;
    }

    case "intervention_studio": {
      const table = TABLES_STUDIO[texte(details, "table") ?? ""] ?? "un studio";
      const operation = OPERATIONS[texte(details, "operation") ?? ""] ?? "a écrit dans";
      const compte = texte(details, "compte");
      return `${operation} ${table}${compte ? ` (compte : ${nomDuCompte(compte, annuaire)})` : ""}`;
    }

    case "publication_plan": {
      const version = champ(details, "version");
      return `a publié la version ${typeof version === "number" ? version : "?"} du plan ${nomDuPlan(texte(details, "plan"), annuaire)}`;
    }

    case "publication_bareme": {
      const version = champ(details, "version");
      return `a publié la version ${typeof version === "number" ? version : "?"} du barème des unités texte`;
    }

    case "rapprochement_travail": {
      const issue =
        champ(details, "succes") === true
          ? "réussie"
          : champ(details, "succes") === false
            ? "échouée"
            : "d'issue inconnue";
      const titre = entree.project_id ? annuaire.projets.get(entree.project_id) : undefined;
      const projet = titre ? `du projet « ${titre} »` : "d'un projet supprimé depuis";
      return `a rapproché une tâche ${projet} : ${issue}`;
    }

    case "changement_plan_studio": {
      const compte = texte(details, "compte");
      const studio = compte
        ? `du studio personnel ${de(nomDuCompte(compte, annuaire))}`
        : "d'un studio";
      return `a changé le plan ${studio} : ${nomDuPlan(texte(details, "ancien_plan"), annuaire)} → ${nomDuPlan(texte(details, "nouveau_plan"), annuaire)}`;
    }

    default:
      return "a effectué une action non répertoriée";
  }
}
