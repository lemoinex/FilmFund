import { NextResponse } from "next/server";

import { versionDuBuild } from "@/lib/actualisation";

// Lue à chaque appel : une réponse figée au build ne dirait jamais qu'un
// déploiement plus récent est en service.
export const dynamic = "force-dynamic";

/**
 * Version du build en service : le commit déployé, et rien d'autre. Publique,
 * sans session ni secret ; jamais mise en cache.
 */
export function GET() {
  return NextResponse.json(
    { version: versionDuBuild() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
