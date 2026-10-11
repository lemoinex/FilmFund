import type { MetadataRoute } from "next";

import {
  COULEUR_APPLICATION,
  DEPART_APPLICATION,
  ICONES_APPLICATION,
  NOM_APPLICATION,
  PERIMETRE_APPLICATION,
} from "@/lib/installation";

/**
 * Manifest de l'application installable, servi à `/manifest.webmanifest`.
 *
 * Il ne décrit qu'une icône et une fenêtre : l'application installée ouvre le
 * service en ligne, rien n'est embarqué ni mis en cache hors ligne.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: PERIMETRE_APPLICATION,
    name: NOM_APPLICATION,
    short_name: "FilmFund",
    description:
      "Développement et préparation de projets cinématographiques et audiovisuels africains.",
    lang: "fr",
    start_url: DEPART_APPLICATION,
    scope: PERIMETRE_APPLICATION,
    display: "standalone",
    background_color: COULEUR_APPLICATION,
    theme_color: COULEUR_APPLICATION,
    icons: ICONES_APPLICATION.map((icone) => ({ ...icone })),
  };
}
