"use server";

import { revalidatePath } from "next/cache";

import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Retire une source retenue du projet. C'est la seule écriture directe sur
 * les sources : la RLS la réserve à qui écrit le projet, et la base refuse
 * tout ajout comme toute correction — une source ne se réécrit pas.
 */
export async function supprimerSource(formData: FormData) {
  const projetId = String(formData.get("projet") ?? "");
  const sourceId = String(formData.get("source") ?? "");
  if (!UUID.test(projetId) || !UUID.test(sourceId)) return;

  const supabase = await createClient();
  if ("erreur" in (await exigerAcces(supabase))) {
    return;
  }

  await supabase.from("project_sources").delete().eq("id", sourceId).eq("project_id", projetId);

  revalidatePath(`/projets/${projetId}/recherche`);
}
