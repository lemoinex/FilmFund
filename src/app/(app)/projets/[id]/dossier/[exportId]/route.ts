import { type NextRequest } from "next/server";

import {
  enTeteDeTelechargement,
  estFormatExport,
  FORMATS_EXPORT,
  lireFichier,
} from "@/lib/exports";
import { exigerAcces } from "@/lib/supabase/garde";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Une seule réponse pour tout refus — export absent, expiré, d'un autre
 * projet, ou hors de portée du compte : rien ne distingue un fichier
 * interdit d'un fichier qui n'existe pas.
 */
function introuvable(): Response {
  return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
}

/**
 * Téléchargement d'un dossier, en PDF ou en Word.
 *
 * Le fichier est rangé en base, pas dans le stockage : il ne se sert donc
 * pas par lien signé, mais par cette route, lue avec la session de
 * l'utilisateur. C'est la RLS qui décide — porteur, éditeurs et
 * administrateurs, mode privé compris ; la route ne fait que la relayer.
 */
export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ id: string; exportId: string }> },
): Promise<Response> {
  const { id, exportId } = await params;
  if (!UUID.test(id) || !UUID.test(exportId)) {
    return introuvable();
  }

  const supabase = await createClient();
  const garde = await exigerAcces(supabase);
  if ("erreur" in garde) {
    return introuvable();
  }

  const [{ data: dossier }, { data: projet }] = await Promise.all([
    supabase
      .from("project_exports")
      .select("file, format")
      .eq("id", exportId)
      .eq("project_id", id)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle(),
    supabase.from("projects").select("title").eq("id", id).maybeSingle(),
  ]);

  // Le format vient de la base, jamais de l'adresse : le fichier est servi
  // sous le type que ses propres octets confirment.
  const format = estFormatExport(dossier?.format) ? dossier.format : null;
  const fichier = format ? lireFichier(dossier?.file, format) : null;
  if (!format || !fichier || !projet) {
    return introuvable();
  }
  const type = FORMATS_EXPORT[format].type;

  // En flux : une réponse d'un bloc est plafonnée par l'hébergeur en deçà de
  // ce que la base admet pour un export.
  const flux = new Blob([fichier as BlobPart], { type }).stream();

  return new Response(flux, {
    headers: {
      "content-type": type,
      "content-length": String(fichier.byteLength),
      "content-disposition": enTeteDeTelechargement(projet.title, format),
      // Un dossier peut contenir le budget : il ne se garde dans aucun cache.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
