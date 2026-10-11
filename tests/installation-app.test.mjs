/**
 * Application installable et actualisation (mission du 11 octobre 2026).
 *
 * L'application installée ouvre le service en ligne : rien n'est embarqué.
 * Ces tests tiennent le manifest et ses icônes, l'adresse de version, la
 * règle qui décide d'un rechargement, l'association Android, et ce que le lot
 * s'interdit — service worker, cache hors ligne, empreinte inventée.
 *
 * Module pur et lecture de fichiers : ni base, ni serveur, ni navigateur. Une
 * installation réelle sur Windows ou Android n'est pas couverte ici.
 */
import { strict as assert } from "node:assert";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decider,
  DELAI_CALME_MS,
  DELAI_ENTRE_RAFRAICHISSEMENTS_MS,
  lireVersion,
  peutRafraichir,
  VERSION_LOCALE,
  versionDuBuild,
} from "../src/lib/actualisation.ts";
import {
  associationAndroid,
  COULEUR_APPLICATION,
  DEPART_APPLICATION,
  ICONE_APPLE,
  ICONES_APPLICATION,
  lireEmpreintes,
  NOM_APPLICATION,
  PAQUET_ANDROID,
  PERIMETRE_APPLICATION,
  VARIABLE_EMPREINTES,
} from "../src/lib/installation.ts";

const racine = new URL("../", import.meta.url);
const lire = (chemin) => readFileSync(new URL(chemin, racine), "utf8");
const existe = (chemin) => existsSync(new URL(chemin, racine));

/** Largeur et hauteur d'un PNG, lues de son en-tête. */
const dimensions = (chemin) => {
  const octets = readFileSync(new URL(chemin, racine));
  assert.equal(octets.subarray(1, 4).toString("latin1"), "PNG", chemin);
  return `${octets.readUInt32BE(16)}x${octets.readUInt32BE(20)}`;
};

const EMPREINTE = Array.from({ length: 32 }, (_, rang) =>
  rang.toString(16).padStart(2, "0").toUpperCase(),
).join(":");

describe("Installation : le manifest", () => {
  const source = lire("src/app/manifest.ts");

  it("décrit une fenêtre dédiée, sur tout le site, qui s'ouvre dans l'application", () => {
    assert.equal(NOM_APPLICATION, "FilmFund Africa");
    assert.equal(DEPART_APPLICATION, "/tableau-de-bord");
    assert.equal(PERIMETRE_APPLICATION, "/");
    assert.match(source, /display: "standalone"/);
    assert.match(source, /start_url: DEPART_APPLICATION/);
    assert.match(source, /scope: PERIMETRE_APPLICATION/);
    assert.match(source, /id: PERIMETRE_APPLICATION/);
    assert.match(source, /name: NOM_APPLICATION/);
  });

  it("porte la couleur de l'application, celle des jetons de style", () => {
    assert.match(lire("src/app/globals.css"), new RegExp(`--navy:\\s*${COULEUR_APPLICATION}`));
    assert.match(source, /theme_color: COULEUR_APPLICATION/);
  });

  it("offre les tailles requises, en icône ordinaire et en icône rognable", () => {
    for (const usage of ["any", "maskable"]) {
      const tailles = ICONES_APPLICATION.filter((icone) => icone.purpose === usage).map(
        (icone) => icone.sizes,
      );
      assert.deepEqual(tailles, ["192x192", "512x512"], usage);
    }
  });

  it("ne nomme que des icônes qui existent, à la taille annoncée", () => {
    for (const icone of ICONES_APPLICATION) {
      assert.equal(dimensions(`public${icone.src}`), icone.sizes, icone.src);
    }
    assert.equal(dimensions(`public${ICONE_APPLE}`), "180x180");
  });

  it("est relié par la mise en page racine, avec l'icône d'écran d'accueil", () => {
    const racineApp = lire("src/app/layout.tsx");
    assert.match(racineApp, /themeColor: COULEUR_APPLICATION/);
    assert.match(racineApp, /icons: \{ apple: ICONE_APPLE \}/);
    assert.match(racineApp, /applicationName: NOM_APPLICATION/);
  });
});

describe("Installation : le bouton", () => {
  const source = lire("src/components/installation.tsx");

  it("ne s'affiche que si le navigateur propose l'installation", () => {
    assert.match(source, /"beforeinstallprompt"/);
    assert.match(source, /if \(!invitation\) return null;/);
    assert.match(source, /"appinstalled"/);
  });

  it("est posé dans la coque de l'espace connecté", () => {
    assert.match(lire("src/app/(app)/layout.tsx"), /<BoutonInstallation \/>/);
  });
});

describe("Actualisation : la version du build", () => {
  it("est le commit déployé, jamais un horodatage", () => {
    const avant = { ...process.env };
    try {
      delete process.env.VERCEL_GIT_COMMIT_SHA;
      delete process.env.VERCEL_DEPLOYMENT_ID;
      assert.equal(versionDuBuild(), VERSION_LOCALE);
      process.env.VERCEL_DEPLOYMENT_ID = "dpl_abc";
      assert.equal(versionDuBuild(), "dpl_abc");
      process.env.VERCEL_GIT_COMMIT_SHA = "ac197df";
      assert.equal(versionDuBuild(), "ac197df");
      assert.equal(versionDuBuild(), versionDuBuild());
    } finally {
      process.env = avant;
    }
    assert.doesNotMatch(lire("src/lib/actualisation.ts"), /Date\.now|new Date/);
  });

  it("est servie sans cache, sans session et sans rien d'autre", () => {
    const route = lire("src/app/api/version/route.ts");
    assert.match(route, /dynamic = "force-dynamic"/);
    assert.match(route, /"Cache-Control": "no-store, max-age=0"/);
    assert.match(route, /\{ version: versionDuBuild\(\) \}/);
    assert.doesNotMatch(route, /supabase|cookies|process\.env/);
  });

  it("n'est lue que si la réponse en porte une lisible", () => {
    assert.equal(lireVersion({ version: "ac197df" }), "ac197df");
    for (const corps of [
      null,
      "ac197df",
      {},
      { version: 3 },
      { version: "" },
      { version: "a b" },
    ]) {
      assert.equal(lireVersion(corps), null);
    }
  });
});

describe("Actualisation : quand recharger", () => {
  const etat = (autres = {}) => ({
    chargee: "v1",
    lue: "v2",
    saisie: false,
    dernierGeste: 0,
    maintenant: 10 * DELAI_CALME_MS,
    dejaRechargeePour: null,
    enLigne: true,
    ...autres,
  });

  it("ne fait rien tant que la version est la même", () => {
    assert.equal(decider(etat({ lue: "v1" })), "rien");
    assert.equal(decider(etat({ lue: null })), "rien");
  });

  it("recharge pour une version nouvelle, à un moment calme", () => {
    assert.equal(decider(etat()), "recharger");
  });

  it("attend pendant une saisie, quel que soit le temps écoulé", () => {
    assert.equal(decider(etat({ saisie: true })), "attendre");
  });

  it("attend juste après un clic ou une frappe : une opération peut être en cours", () => {
    const maintenant = 10 * DELAI_CALME_MS;
    assert.equal(decider(etat({ maintenant, dernierGeste: maintenant - 1 })), "attendre");
    assert.equal(
      decider(etat({ maintenant, dernierGeste: maintenant - DELAI_CALME_MS })),
      "recharger",
    );
  });

  it("attend hors connexion : recharger ne mènerait nulle part", () => {
    assert.equal(decider(etat({ enLigne: false })), "attendre");
  });

  it("ne recharge pas deux fois pour la même version : pas de boucle", () => {
    assert.equal(decider(etat({ dejaRechargeePour: "v2" })), "proposer");
    assert.equal(decider(etat({ dejaRechargeePour: "v1" })), "recharger");
  });

  it("ne recharge jamais un poste de développement", () => {
    assert.equal(decider(etat({ chargee: VERSION_LOCALE })), "rien");
    assert.equal(decider(etat({ lue: VERSION_LOCALE })), "rien");
  });
});

describe("Actualisation : les données de la page", () => {
  const etat = (autres = {}) => ({
    saisie: false,
    enLigne: true,
    dernierRafraichissement: 0,
    maintenant: DELAI_ENTRE_RAFRAICHISSEMENTS_MS,
    ...autres,
  });

  it("se relisent au retour, sans rafale", () => {
    assert.equal(peutRafraichir(etat()), true);
    assert.equal(peutRafraichir(etat({ maintenant: DELAI_ENTRE_RAFRAICHISSEMENTS_MS - 1 })), false);
  });

  it("ne remplacent jamais une saisie en cours, et ne se lisent pas hors connexion", () => {
    assert.equal(peutRafraichir(etat({ saisie: true })), false);
    assert.equal(peutRafraichir(etat({ enLigne: false })), false);
  });
});

describe("Actualisation : le composant", () => {
  const source = lire("src/components/actualisation.tsx");
  const compter = (texte, motif) => texte.split(motif).length - 1;

  it("est monté à la racine, avec la version du build qui rend la page", () => {
    assert.match(lire("src/app/layout.tsx"), /<Actualisation version=\{versionDuBuild\(\)\} \/>/);
  });

  it("retire chaque écouteur et chaque minuterie qu'il pose", () => {
    assert.equal(compter(source, ".addEventListener("), compter(source, ".removeEventListener("));
    assert.equal(compter(source, ".setInterval("), compter(source, ".clearInterval("));
    for (const composant of [source, lire("src/components/installation.tsx")]) {
      assert.equal(
        compter(composant, ".addEventListener("),
        compter(composant, ".removeEventListener("),
      );
    }
  });

  it("ne recharge que sur la décision de la règle, ou sur un clic de l'utilisateur", () => {
    assert.equal(compter(source, "window.location.reload()"), 2);
    assert.match(source, /decision === "recharger" && etat\.lue/);
    assert.match(source, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  });

  it("lit la version sans cache, et relit les données par la règle", () => {
    assert.match(source, /fetch\("\/api\/version", \{ cache: "no-store" \}\)/);
    assert.match(source, /peutRafraichir\(/);
    assert.match(source, /router\.refresh\(\)/);
  });

  it("dit l'absence de réseau sans annoncer que tout est à jour", () => {
    assert.match(source, /Hors connexion : ce qui est affiché peut ne plus être à jour/);
    assert.match(source, /role="status"/);
  });

  it("ne vide aucun stockage du navigateur", () => {
    assert.doesNotMatch(source, /localStorage|\.clear\(\)|removeItem|indexedDB/);
  });
});

describe("Ce que le lot s'interdit : service worker et cache hors ligne", () => {
  it("aucun service worker n'est enregistré, ni servi", () => {
    const sources = readdirSync(new URL("src/", racine), { recursive: true })
      .map((chemin) => String(chemin).replaceAll("\\", "/"))
      .filter((chemin) => /\.(ts|tsx)$/.test(chemin));
    for (const chemin of sources) {
      assert.doesNotMatch(lire(`src/${chemin}`), /serviceWorker|caches\.open|workbox/, chemin);
    }
    for (const fichier of ["public/sw.js", "public/service-worker.js"]) {
      assert.equal(existe(fichier), false, fichier);
    }
  });
});

describe("Garde des routes : les adresses de l'application installée", () => {
  const filtre = (() => {
    const lu = /matcher:\s*\[[\s\S]*?"(\/\(\(\?![^"]+)"/.exec(lire("src/proxy.ts"));
    assert.ok(lu, "filtre du proxy introuvable");
    return new RegExp(`^${lu[1].replaceAll("\\\\", "\\")}$`);
  })();

  it("laisse passer sans garde la version, le manifest, l'association et les icônes", () => {
    for (const adresse of [
      "/api/version",
      "/manifest.webmanifest",
      "/.well-known/assetlinks.json",
      "/icons/icon-512.png",
    ]) {
      assert.equal(filtre.test(adresse), false, adresse);
    }
  });

  it("garde toujours les pages, y compris une adresse voisine", () => {
    for (const adresse of [
      "/",
      "/tableau-de-bord",
      "/projets/abc",
      "/api/version/autre",
      "/connexion",
    ]) {
      assert.equal(filtre.test(adresse), true, adresse);
    }
  });
});

describe("Android : l'association entre le site et l'application", () => {
  it("ne retient que des empreintes SHA-256 bien formées, toutes ou aucune", () => {
    assert.deepEqual(lireEmpreintes(EMPREINTE), [EMPREINTE]);
    assert.deepEqual(lireEmpreintes(` ${EMPREINTE.toLowerCase()} , ${EMPREINTE}`), [EMPREINTE]);
    for (const valeur of [
      undefined,
      "",
      "abc",
      EMPREINTE.slice(3),
      `${EMPREINTE},pas-une-empreinte`,
    ]) {
      assert.deepEqual(lireEmpreintes(valeur), []);
    }
  });

  it("déclare le paquet exact et les empreintes reçues", () => {
    const [lien] = associationAndroid([EMPREINTE]);
    assert.deepEqual(lien.relation, ["delegate_permission/common.handle_all_urls"]);
    assert.deepEqual(lien.target, {
      namespace: "android_app",
      package_name: PAQUET_ANDROID,
      sha256_cert_fingerprints: [EMPREINTE],
    });
  });

  it("répond comme une page absente tant qu'aucune empreinte réelle n'est posée", () => {
    const route = lire("src/app/.well-known/assetlinks.json/route.ts");
    assert.match(route, /lireEmpreintes\(process\.env\[VARIABLE_EMPREINTES\]\)/);
    assert.match(
      route,
      /if \(empreintes\.length === 0\) \{\s*return new NextResponse\(null, \{ status: 404 \}\);/,
    );
    assert.equal(VARIABLE_EMPREINTES, "ANDROID_CERT_SHA256");
  });

  it("aucun fichier d'association n'est publié en dur, et le modèle n'est pas déployable", () => {
    assert.equal(existe("public/.well-known/assetlinks.json"), false);
    const modele = JSON.parse(lire("android/assetlinks.modele.json"));
    assert.equal(modele[0].target.package_name, PAQUET_ANDROID);
    assert.deepEqual(lireEmpreintes(modele[0].target.sha256_cert_fingerprints.join(",")), []);
    assert.doesNotMatch(lire("src/lib/installation.ts"), /(?:[0-9A-F]{2}:){31}[0-9A-F]{2}"/);
  });
});

describe("Android : la configuration de l'enveloppe", () => {
  const enveloppe = JSON.parse(lire("android/twa-manifest.json"));

  it("ouvre le service en ligne, sous le même nom et la même adresse de départ", () => {
    assert.equal(enveloppe.packageId, PAQUET_ANDROID);
    assert.equal(enveloppe.host, "filmfund.vercel.app");
    assert.equal(enveloppe.name, NOM_APPLICATION);
    assert.equal(enveloppe.startUrl, DEPART_APPLICATION);
    assert.equal(enveloppe.themeColor, COULEUR_APPLICATION);
    // Trois réglages que l'outil exige : sans eux, le projet Android ne se compile pas.
    assert.equal(enveloppe.appVersion, "1.0.0");
    assert.equal(enveloppe.minSdkVersion, 24);
    assert.equal(enveloppe.splashScreenFadeOutDuration, 300);
    assert.equal(enveloppe.webManifestUrl, "https://filmfund.vercel.app/manifest.webmanifest");
  });

  it("ne demande aucune permission, et ne porte aucun secret", () => {
    assert.equal(enveloppe.enableNotifications, false);
    assert.deepEqual(enveloppe.features, {});
    assert.deepEqual(Object.keys(enveloppe.signingKey).sort(), ["alias", "path"]);
    assert.doesNotMatch(JSON.stringify(enveloppe), /password|storepass|keypass/i);
  });

  it("la clé de signature et les paquets fabriqués restent hors de Git", () => {
    const ignores = lire(".gitignore");
    for (const motif of ["*.keystore", "*.jks", "android/*.apk", "android/*.aab"]) {
      assert.ok(ignores.split("\n").includes(motif), motif);
    }
  });
});

describe("Marque : le symbole du site", () => {
  it("le symbole de l'en-tête et l'icône d'onglet existent, à leur taille", () => {
    assert.equal(dimensions("public/images/logo-symbole.png"), "256x256");
    assert.equal(dimensions("src/app/icon.png"), "96x96");
  });

  it("l'icône d'onglet est un fichier .ico à trois tailles", () => {
    const ico = readFileSync(new URL("src/app/favicon.ico", racine));
    assert.equal(ico.readUInt16LE(0), 0);
    assert.equal(ico.readUInt16LE(2), 1);
    assert.equal(ico.readUInt16LE(4), 3);
    assert.deepEqual(
      [0, 1, 2].map((rang) => ico.readUInt8(6 + 16 * rang)),
      [16, 32, 48],
    );
  });

  it("le symbole accompagne le nom partout où la marque s'affiche, sans le redire", () => {
    assert.match(lire("src/components/logo.tsx"), /src="\/images\/logo-symbole\.png" alt=""/);
    for (const chemin of [
      "src/app/(app)/layout.tsx",
      "src/app/(auth)/layout.tsx",
      "src/app/not-found.tsx",
      "src/components/landing/footer.tsx",
      "src/components/landing/navbar.tsx",
      "src/components/landing/dashboard-mockup.tsx",
    ]) {
      assert.match(lire(chemin), /<LogoFilmFund className="size-\d" \/>/, chemin);
    }
  });
});
