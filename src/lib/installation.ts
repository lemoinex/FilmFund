/**
 * Installation de l'application : ce que le manifest et l'enveloppe Android
 * disent d'elle. Module pur, lu par le manifest, la route d'association et
 * les tests.
 *
 * L'application installée n'embarque rien : elle ouvre le service en ligne.
 */

export const NOM_APPLICATION = "FilmFund Africa";

/** Le bleu nuit de `globals.css` (`--navy`) : barre de titre et écran de lancement. */
export const COULEUR_APPLICATION = "#10141c";

/**
 * Page d'ouverture de l'application installée. Sans session, la garde des
 * routes renvoie à la connexion puis y ramène.
 */
export const DEPART_APPLICATION = "/tableau-de-bord";

/** Tout le site : un lien interne ne doit pas sortir de la fenêtre installée. */
export const PERIMETRE_APPLICATION = "/";

export const ICONES_APPLICATION = [
  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
  { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
] as const;

export const ICONE_APPLE = "/icons/apple-touch-icon.png";

/**
 * Identifiant du paquet Android. **Il ne se change plus après une première
 * distribution** : un autre identifiant serait une autre application.
 */
export const PAQUET_ANDROID = "app.vercel.filmfund.twa";

/**
 * Nom de la variable qui porte les empreintes SHA-256 du certificat de
 * signature Android, séparées par des virgules. Une empreinte est publique :
 * ce n'est pas un secret, mais elle doit être celle du certificat réel.
 */
export const VARIABLE_EMPREINTES = "ANDROID_CERT_SHA256";

const EMPREINTE = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * Empreintes lues de la variable d'environnement. Tout ou rien : une seule
 * valeur mal formée, et aucune n'est retenue — une association à moitié
 * fausse ne doit pas être publiée.
 */
export function lireEmpreintes(valeur: string | undefined): string[] {
  const lues = (valeur ?? "")
    .split(/[\s,]+/)
    .map((empreinte) => empreinte.trim().toUpperCase())
    .filter(Boolean);
  return lues.length > 0 && lues.every((empreinte) => EMPREINTE.test(empreinte))
    ? [...new Set(lues)]
    : [];
}

/** Corps de `/.well-known/assetlinks.json` : le site reconnaît ce paquet, signé par ce certificat. */
export function associationAndroid(empreintes: string[]) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: PAQUET_ANDROID,
        sha256_cert_fingerprints: empreintes,
      },
    },
  ];
}
