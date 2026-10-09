"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  estEtape,
  etapeDe,
  etapeSuivante,
  lirePitch,
  lireTitre,
  type CleEtape,
} from "@/lib/assistant";
import { ERREURS_EPISODE, messageEpisode } from "@/lib/episodes";
import {
  MAX_PERSONNAGES,
  normaliserFiche,
  normaliserPersonnage,
  type ChampFiche,
  type Fiche,
} from "@/lib/fiche";
import { LIMITE_DU_PLAN } from "@/lib/plans";
import { CODES_PAYS } from "@/lib/profils";
import { estEtapeValide, estFormatValide } from "@/lib/projets";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";
import type { Database, ProjectFormat, ProjectStage } from "@/lib/supabase/types";

/*
 * Assistant de création. Chaque étape n'écrit que ses propres champs, validés
 * ici ; la RLS des projets et des personnages décide qui écrit : porteur et
 * éditeurs. Aucun rôle de service.
 */

export type EtatEtape = { erreur: string } | null;
export type EtatPersonnage = { erreur: string } | null;

const REFUS = "Vous n'avez pas le droit de modifier ce projet.";
const ECHEC = "L'enregistrement a échoué. Réessayez dans un instant.";

type ModificationProjet = Database["public"]["Tables"]["projects"]["Update"];
type Erreur = { erreur: string };

/** Valeurs de la fiche telles que le formulaire les envoie. */
function saisieFiche(formData: FormData, champs: readonly ChampFiche[]) {
  return Object.fromEntries(
    champs.map((champ) => [
      champ,
      // Plusieurs pays : un champ par pays, dans l'ordre choisi.
      champ === "countries"
        ? formData.getAll(champ).map(String)
        : String(formData.get(champ) ?? ""),
    ]),
  );
}

function lireFiche(etape: CleEtape, formData: FormData): { fiche: Partial<Fiche> } | Erreur {
  const { champs } = etapeDe(etape);
  return normaliserFiche(saisieFiche(formData, champs), champs, CODES_PAYS);
}

/** Informations générales : le titre, le format et l'étape s'ajoutent à la fiche. */
function lireInformations(
  formData: FormData,
):
  | { donnees: Partial<Fiche> & { title: string; format: ProjectFormat; stage: ProjectStage } }
  | Erreur {
  const lue = lireFiche("informations", formData);
  if ("erreur" in lue) return lue;
  const titre = lireTitre(formData.get("title"));
  if ("erreur" in titre) return titre;
  const format = String(formData.get("format") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!estFormatValide(format)) return { erreur: "Format de projet inconnu." };
  if (!estEtapeValide(stage)) return { erreur: "Étape de production inconnue." };
  return { donnees: { ...lue.fiche, title: titre.titre, format, stage } };
}

/** Champs d'une étape, ramenés à ce que la base attend ; le concept porte aussi le pitch. */
function lireEtape(etape: CleEtape, formData: FormData): { donnees: ModificationProjet } | Erreur {
  if (etape === "informations") return lireInformations(formData);

  const lue = lireFiche(etape, formData);
  if ("erreur" in lue) return lue;

  if (etape === "concept") {
    const pitch = lirePitch(formData.get("logline"));
    if ("erreur" in pitch) return pitch;
    return { donnees: { ...lue.fiche, logline: pitch.pitch } };
  }
  return { donnees: lue.fiche };
}

/** Première étape d'un projet qui n'existe pas encore : elle le crée. */
export async function creerProjetAssiste(
  _etatPrecedent: EtatEtape,
  formData: FormData,
): Promise<EtatEtape> {
  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const saisie = lireInformations(formData);
  if ("erreur" in saisie) return saisie;

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...saisie.donnees, owner_id: garde.user.id })
    .select("id")
    .single();

  if (error?.code === LIMITE_DU_PLAN) {
    return {
      erreur:
        "Le plan de votre studio ne permet pas de créer un projet de plus. Un administrateur peut changer votre plan.",
    };
  }
  if (error || !data) {
    return { erreur: "La création du projet a échoué. Réessayez dans un instant." };
  }

  revalidatePath("/projets");
  revalidatePath("/tableau-de-bord");
  redirect(`/projets/${data.id}/assistant/${etapeSuivante("informations")}`);
}

/** Une étape d'un projet existant : ses champs, puis l'étape suivante. */
export async function enregistrerEtape(
  _etatPrecedent: EtatEtape,
  formData: FormData,
): Promise<EtatEtape> {
  const projetId = String(formData.get("projet") ?? "");
  const etape = formData.get("etape");
  // Les personnages s'enregistrent un par un : leur étape n'a rien à écrire.
  if (!projetId || !estEtape(etape) || etape === "personnages") {
    return { erreur: "Étape introuvable." };
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const saisie = lireEtape(etape, formData);
  if ("erreur" in saisie) return saisie;

  const { data, error } = await supabase
    .from("projects")
    .update(saisie.donnees)
    .eq("id", projetId)
    .select("id");

  if (error) {
    // Un projet qui a des épisodes ne quitte pas le format série : la base le
    // refuse, et l'écran dit pourquoi plutôt qu'un échec sans motif.
    return {
      erreur:
        error.code === ERREURS_EPISODE.formatAvecEpisodes ? messageEpisode(error.code) : ECHEC,
    };
  }
  // La RLS ne lève pas d'erreur sur une modification interdite : elle ne
  // touche aucune ligne. Sans ce contrôle, la saisie serait perdue en silence.
  if (!data?.length) return { erreur: REFUS };

  revalidatePath(`/projets/${projetId}`);
  revalidatePath(`/projets/${projetId}/fiche`);
  if (etape === "informations") {
    revalidatePath("/projets");
    revalidatePath("/tableau-de-bord");
  }

  const suivante = etapeSuivante(etape);
  redirect(
    suivante
      ? `/projets/${projetId}/assistant/${suivante}`
      : `/projets/${projetId}/fiche?assistant=termine`,
  );
}

function lirePersonnage(formData: FormData) {
  return normaliserPersonnage({
    name: String(formData.get("name") ?? ""),
    role: String(formData.get("role") ?? ""),
    description: String(formData.get("description") ?? ""),
  });
}

function revaliderPersonnages(projetId: string) {
  revalidatePath(`/projets/${projetId}/assistant/personnages`);
  revalidatePath(`/projets/${projetId}/fiche`);
}

export async function ajouterPersonnage(
  _etatPrecedent: EtatPersonnage,
  formData: FormData,
): Promise<EtatPersonnage> {
  const projetId = String(formData.get("projet") ?? "");
  if (!projetId) return { erreur: "Projet introuvable." };

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const lu = lirePersonnage(formData);
  if ("erreur" in lu) return lu;

  // Borne de confort, non de sécurité : la base n'en fixe pas.
  const { count } = await supabase
    .from("project_characters")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projetId);
  if ((count ?? 0) >= MAX_PERSONNAGES) {
    return { erreur: `${MAX_PERSONNAGES} personnages au plus par projet.` };
  }

  // Le nouveau personnage prend la dernière place.
  const { data: dernier } = await supabase
    .from("project_characters")
    .select("position")
    .eq("project_id", projetId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("project_characters").insert({
    ...lu.personnage,
    project_id: projetId,
    position: (dernier?.position ?? -1) + 1,
    created_by: garde.user.id,
  });

  if (error) {
    return { erreur: error.code === "42501" ? REFUS : "L'ajout du personnage a échoué." };
  }

  revaliderPersonnages(projetId);
  return null;
}

export async function modifierPersonnage(
  _etatPrecedent: EtatPersonnage,
  formData: FormData,
): Promise<EtatPersonnage> {
  const projetId = String(formData.get("projet") ?? "");
  const personnageId = String(formData.get("personnage") ?? "");
  if (!projetId || !personnageId) return { erreur: "Personnage introuvable." };

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) return garde;

  const lu = lirePersonnage(formData);
  if ("erreur" in lu) return lu;

  const { data, error } = await supabase
    .from("project_characters")
    .update(lu.personnage)
    .eq("id", personnageId)
    .eq("project_id", projetId)
    .select("id");

  if (error) return { erreur: ECHEC };
  if (!data?.length) return { erreur: REFUS };

  revaliderPersonnages(projetId);
  redirect(`/projets/${projetId}/assistant/personnages#personnage-${personnageId}`);
}

export async function supprimerPersonnage(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const personnageId = String(formData.get("personnage") ?? "");
  if (!projetId || !personnageId) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) return;

  // La RLS a le dernier mot : sans droit, aucune ligne n'est touchée.
  await supabase
    .from("project_characters")
    .delete()
    .eq("id", personnageId)
    .eq("project_id", projetId);

  revaliderPersonnages(projetId);
}
