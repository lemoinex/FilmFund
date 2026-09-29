import type { createClient } from "@/lib/supabase/server";
import type { ProjectFormat, ProjectMemberRole, ProjectStage } from "@/lib/supabase/types";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

export type ResumeProjet = {
  id: string;
  title: string;
  format: ProjectFormat;
  stage: ProjectStage;
  logline: string;
  updated_at: string;
  /** Rôle de l'utilisateur quand le projet lui est partagé. */
  role: ProjectMemberRole | null;
};

export type MesProjets = {
  possedes: ResumeProjet[];
  partages: ResumeProjet[];
  /** Projets auxquels l'utilisateur n'a accès qu'en tant qu'administrateur. */
  autres: ResumeProjet[];
};

/**
 * Répartit les projets visibles de l'utilisateur.
 *
 * La RLS ne suffit plus à dire « mes projets » : elle rend aussi ceux où
 * l'utilisateur est membre et, pour un administrateur, tous les projets de
 * la plateforme. Sans `inclureAutres`, la requête se restreint d'emblée aux
 * projets possédés et partagés, pour qu'un tableau de bord d'administrateur
 * ne charge pas la plateforme entière.
 */
export async function chargerMesProjets(
  supabase: ClientServeur,
  utilisateurId: string,
  { inclureAutres = false, limite }: { inclureAutres?: boolean; limite?: number } = {},
): Promise<MesProjets> {
  const { data: adhesions } = await supabase
    .from("project_members")
    .select("project_id, role")
    .eq("user_id", utilisateurId);

  const roles = new Map((adhesions ?? []).map((a) => [a.project_id, a.role]));

  let requete = supabase
    .from("projects")
    .select("id, title, format, stage, logline, owner_id, updated_at")
    .order("updated_at", { ascending: false });

  if (!inclureAutres) {
    // Identifiants issus de la base : des UUID, sans risque d'injection dans le filtre.
    const partages = [...roles.keys()];
    requete = requete.or(
      partages.length
        ? `owner_id.eq.${utilisateurId},id.in.(${partages.join(",")})`
        : `owner_id.eq.${utilisateurId}`,
    );
  }

  if (limite) {
    requete = requete.limit(limite);
  }

  const { data: projets } = await requete;

  const resultat: MesProjets = { possedes: [], partages: [], autres: [] };

  for (const { owner_id, ...projet } of projets ?? []) {
    const role = roles.get(projet.id) ?? null;

    if (owner_id === utilisateurId) {
      resultat.possedes.push({ ...projet, role: null });
    } else if (role) {
      resultat.partages.push({ ...projet, role });
    } else {
      resultat.autres.push({ ...projet, role: null });
    }
  }

  return resultat;
}
