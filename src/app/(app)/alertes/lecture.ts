import { calculerAlertes, LIMITES_ALERTES, SEUILS_ALERTES, type Alerte } from "@/lib/alertes";
import { calculerCompatibilite, estAEtudier } from "@/lib/compatibilite";
import type { ResumeProjet } from "@/lib/mes-projets";
import { echeanceDe, LIMITE_CATALOGUE, STATUTS_VISIBLES } from "@/lib/opportunites";
import { aujourdhui } from "@/lib/planning";
import type { createClient } from "@/lib/supabase/server";
import { jourApres } from "@/lib/tableau-de-bord";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

export type LectureAlertes = {
  alertes: Alerte[];
  jour: string;
  /** Une lecture a atteint sa borne : la liste peut être incomplète. */
  borneAtteinte: boolean;
};

/**
 * Ce que les alertes lisent, en une passe, pour les projets donnés — ceux que
 * l'utilisateur porte ou qu'on a partagés avec lui, jamais ceux que
 * l'administration lui rend visibles.
 *
 * Tout passe par sa RLS. Une candidature ne remonte que pour un projet dont
 * il gère le budget, parce que la base ne lui rend que celles-là ; son
 * montant n'est pas lu. Le catalogue est filtré comme sur les écrans des
 * équipes : jamais une démonstration, même pour un administrateur.
 */
export async function chargerAlertes(
  supabase: ClientServeur,
  projets: readonly ResumeProjet[],
): Promise<LectureAlertes> {
  const jour = aujourdhui();
  if (!projets.length) {
    return { alertes: [], jour, borneAtteinte: false };
  }

  const ids = projets.map((projet) => projet.id);
  const [
    { data: etapes },
    { data: candidatures },
    { data: fiches },
    { data: catalogue },
    { data: recentes },
  ] = await Promise.all([
    // Les étapes en retard comme celles qui approchent : toutes ont une
    // échéance avant la fin du délai.
    supabase
      .from("project_milestones")
      .select("project_id, title, due_on, status")
      .in("project_id", ids)
      .neq("status", "termine")
      .lte("due_on", jourApres(jour, SEUILS_ALERTES.etapeProche))
      .order("due_on")
      .limit(LIMITES_ALERTES.lignes),
    supabase
      .from("project_fundings")
      .select("id, project_id, funder, program, deadline, status")
      .in("project_id", ids)
      .eq("status", "a_preparer")
      .gte("deadline", jour)
      .lte("deadline", jourApres(jour, SEUILS_ALERTES.dossierIncomplet))
      .order("deadline")
      .limit(LIMITES_ALERTES.lignes),
    supabase.from("projects").select("id, format, genre, countries").in("id", ids),
    supabase
      .from("funding_opportunities")
      .select("id, name, organization, countries, formats, genres, deadline, status, verified_at")
      .in("status", STATUTS_VISIBLES)
      .gte("deadline", jour)
      .lte("deadline", jourApres(jour, SEUILS_ALERTES.opportuniteProche))
      .order("deadline")
      .limit(LIMITE_CATALOGUE),
    // Les opportunités devenues vérifiées dans le délai, quelle que soit
    // leur date limite : « vérifiée » seulement, une opportunité expirée
    // n'est pas une nouveauté.
    supabase
      .from("funding_opportunities")
      .select("id, name, organization, countries, formats, genres, deadline, status, verified_at")
      .eq("status", "verifie")
      .gte("verified_at", `${jourApres(jour, -SEUILS_ALERTES.opportuniteNouvelle)}T00:00:00Z`)
      .order("verified_at", { ascending: false })
      .limit(LIMITE_CATALOGUE),
  ]);

  // Les pièces des seules candidatures lues : cent identifiants au plus.
  const lues = candidatures ?? [];
  const { data: pieces } = lues.length
    ? await supabase
        .from("funding_documents")
        .select("funding_id, document:project_documents(status)")
        .in(
          "funding_id",
          lues.map((candidature) => candidature.id),
        )
    : { data: [] };

  // Même règle que l'onglet « Opportunités » du projet et le tableau de bord.
  // Une opportunité lue par les deux requêtes n'est gardée qu'une fois.
  const lignes = new Map(
    [...(catalogue ?? []), ...(recentes ?? [])].map((opportunite) => [opportunite.id, opportunite]),
  );
  const ouvertes = [...lignes.values()].filter(
    (opportunite) => echeanceDe(opportunite, jour) !== "passee",
  );
  const opportunites = (fiches ?? []).flatMap((fiche) =>
    ouvertes
      .filter((opportunite) => estAEtudier(calculerCompatibilite(fiche, opportunite)))
      .map((opportunite) => ({
        id: opportunite.id,
        projetId: fiche.id,
        name: opportunite.name,
        organization: opportunite.organization,
        deadline: opportunite.deadline,
        // Le jour en UTC : la base rend un instant, l'alerte compte en jours.
        verifieeLe: opportunite.verified_at?.slice(0, 10) ?? null,
      })),
  );

  const alertes = calculerAlertes(
    {
      titres: new Map(projets.map((projet) => [projet.id, projet.title])),
      etapes: etapes ?? [],
      candidatures: lues,
      pieces: (pieces ?? []).flatMap((piece) => {
        const document = Array.isArray(piece.document) ? piece.document[0] : piece.document;
        // Une pièce dont le document n'est pas lisible ne compte pas comme finalisée.
        return [{ funding_id: piece.funding_id, statut: document?.status ?? "illisible" }];
      }),
      opportunites,
    },
    jour,
  );

  return {
    alertes,
    jour,
    borneAtteinte:
      projets.length >= LIMITES_ALERTES.projets ||
      (etapes ?? []).length >= LIMITES_ALERTES.lignes ||
      lues.length >= LIMITES_ALERTES.lignes ||
      (catalogue ?? []).length >= LIMITE_CATALOGUE ||
      (recentes ?? []).length >= LIMITE_CATALOGUE,
  };
}
