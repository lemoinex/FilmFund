import { NextResponse } from "next/server";

import { associationAndroid, lireEmpreintes, VARIABLE_EMPREINTES } from "@/lib/installation";

// Lue à l'exécution : poser l'empreinte ne demande aucun changement de code.
export const dynamic = "force-dynamic";

/**
 * Association entre le site et l'application Android (Digital Asset Links).
 *
 * Tant qu'aucune empreinte réelle n'est posée, l'adresse répond comme une
 * page absente : un fichier d'exemple publié passerait pour une association
 * valide. Avec une empreinte, elle dit que le site reconnaît le paquet signé
 * par ce certificat.
 */
export function GET() {
  const empreintes = lireEmpreintes(process.env[VARIABLE_EMPREINTES]);

  if (empreintes.length === 0) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.json(associationAndroid(empreintes), {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
