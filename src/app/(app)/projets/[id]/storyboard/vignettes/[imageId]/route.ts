import { type NextRequest } from "next/server";

import { lireVignette } from "@/lib/propositions";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une seule réponse pour tout refus — vignette absente, d'un autre projet, ou
 * hors de portée du compte : rien ne distingue une image interdite d'une
 * image qui n'existe pas.
 */
function introuvable(): Response {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

/**
 * Lecture d'une vignette proposée par l'assistant.
 *
 * Tant qu'elle n'est pas acceptée, la vignette est rangée en base, pas dans
 * le stockage : elle ne se sert donc pas par lien signé, mais par cette
 * route, lue avec la session de l'utilisateur. C'est la RLS qui décide —
 * l'équipe du projet et les administrateurs, mode privé compris ; la route ne
 * fait que la relayer.
 */
export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string; imageId: string }> },
): Promise<Response> {
  const { id, imageId } = await params;
  if (!UUID.test(id) || !UUID.test(imageId)) {
    return introuvable();
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return introuvable();
  }

  const { data: vignette } = await supabase
    .from("ai_suggestion_images")
    .select("file")
    .eq("id", imageId)
    .eq("project_id", id)
    .maybeSingle();

  // Le type servi est celui que les octets confirment : un PNG, ou rien.
  const fichier = lireVignette(vignette?.file);
  if (!fichier) {
    return introuvable();
  }

  return new Response(new Blob([fichier as BlobPart], { type: "image/png" }).stream(), {
    headers: {
      "content-type": "image/png",
      "content-length": String(fichier.byteLength),
      // L'image d'un projet privé : elle ne se garde dans aucun cache partagé.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
