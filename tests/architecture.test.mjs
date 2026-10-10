/**
 * Passerelle IA unique : le SDK d'un fournisseur n'est importé qu'à un seul
 * endroit, dans le worker, et sa clé n'est lue que là.
 *
 * Le lint porte la même règle (`eslint.config.mjs`) ; ce test la tient sans
 * dépendre de sa configuration, et lit aussi ce que le lint ne regarde pas :
 * les dépendances déclarées et les noms de variables d'environnement.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const PASSERELLE = "worker/src/ia/passerelle.ts";

/** Paquets dont la présence signale un appel direct à un fournisseur d'IA. */
const SDK_IA =
  /^(@anthropic-ai\/|openai$|openai\/|@google\/generative-ai|@google\/genai|@mistralai\/|cohere-ai|replicate$|ai$|@ai-sdk\/)/;

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) {
      if (entree.name !== "node_modules") {
        trouves.push(...fichiersDe(chemin));
      }
    } else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entree.name)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

function lire(chemin) {
  return readFileSync(join(RACINE, chemin), "utf8");
}

function importsIa(chemin) {
  return [...lire(chemin).matchAll(IMPORT)].map((m) => m[1]).filter((nom) => SDK_IA.test(nom));
}

const SOURCES = [...fichiersDe("src"), ...fichiersDe("worker/src")];

describe("Passerelle IA unique", () => {
  it("le test parcourt bien l'application et le worker", () => {
    assert.ok(SOURCES.some((f) => f.startsWith("src/app/")));
    assert.ok(SOURCES.includes(PASSERELLE));
  });

  it("aucun fichier n'importe le SDK d'un fournisseur, sauf la passerelle", () => {
    const fautifs = SOURCES.filter((f) => f !== PASSERELLE && importsIa(f).length > 0);
    assert.deepEqual(fautifs, []);
  });

  it("la passerelle, elle, l'importe : la règle a bien quelque chose à garder", () => {
    assert.deepEqual(importsIa(PASSERELLE), ["@anthropic-ai/sdk"]);
  });

  it("l'application ne déclare aucun SDK d'IA ; le worker, un seul", () => {
    const dependances = (chemin) => {
      const paquet = JSON.parse(lire(chemin));
      return Object.keys({ ...paquet.dependencies, ...paquet.devDependencies });
    };
    assert.deepEqual(
      dependances("package.json").filter((nom) => SDK_IA.test(nom)),
      [],
    );
    assert.deepEqual(
      dependances("worker/package.json").filter((nom) => SDK_IA.test(nom)),
      ["@anthropic-ai/sdk"],
    );
  });

  it("aucune clé de fournisseur ne se lit dans l'environnement", () => {
    // Elles vivent dans le coffre depuis l'écran Intégrations IA. Une
    // variable d'environnement réapparue ouvrirait un second chemin, hors
    // de l'écran et de son journal.
    const lecteurs = SOURCES.filter((f) => /\b(ANTHROPIC|OPENAI)_API_KEY\b/.test(lire(f)));
    assert.deepEqual(lecteurs, []);
  });

  it("seul le worker sait demander une clé à la base", () => {
    // `definir_` et `retirer_cle_fournisseur` ne rendent aucune valeur : seule
    // `cle_fournisseur` déchiffre, et l'application n'y touche pas.
    const lecture = /(?:public\.|rpc\(\s*["'])cle_fournisseur\b/;
    const appelants = SOURCES.filter((f) => lecture.test(lire(f)));
    assert.deepEqual(appelants, ["worker/src/base.ts"]);
  });

  it("aucune variable exposée au navigateur ne porte une clé d'IA", () => {
    const exposees = /NEXT_PUBLIC_[A-Z0-9_]*(ANTHROPIC|OPENAI|CLAUDE|_AI_|IA_|API_KEY|SECRET)/;
    const fautifs = [...SOURCES, ".env.example"].filter((f) => exposees.test(lire(f)));
    assert.deepEqual(fautifs, []);
  });
});

/*
 * Pages 404. Les pages d'administration et les projets d'autrui répondent 404
 * pour ne pas révéler leur existence : rien, dans l'écran rendu, ne doit les
 * distinguer d'une adresse qui n'existe pas.
 *
 * Ces tests lisent le code ; ils ne remplacent pas le contrôle dans le
 * navigateur, seul à voir la réponse réellement servie.
 */
describe("Pages introuvables", () => {
  const PAGE_RACINE = "src/app/not-found.tsx";
  const PAGE_ESPACE = "src/app/(app)/not-found.tsx";
  const PAGES = [PAGE_ESPACE, PAGE_RACINE];
  const MIDDLEWARE = "src/lib/supabase/middleware.ts";
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("deux pages 404 : la racine, et l'espace connecté", () => {
    // Next rend le 404 d'un groupe de routes dans sa mise en page : sans page
    // propre à l'espace connecté, celle de la racine s'y imbriquerait.
    const pages = SOURCES.filter((f) => /(^|\/)not-found\.(tsx|ts|jsx|js)$/.test(f)).sort();
    assert.deepEqual(pages, PAGES);
  });

  it("elles portent un titre en français et se soustraient à l'indexation", () => {
    for (const page of PAGES) {
      const source = lire(page);
      assert.match(source, /title:\s*"Page introuvable/, page);
      assert.match(source, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/, page);
    }
  });

  it("elles ne disent rien des droits : rien qu'une page absente ne dirait", () => {
    for (const page of PAGES) {
      const affiche = sansCommentaires(lire(page));
      // `\b` : « endroit » n'est pas « droit ».
      assert.doesNotMatch(
        affiche,
        /\b(administr|autoris|réserv|droits?\b|acc[èe]s|permission|interdit)/i,
        page,
      );
      // Ni lecture de session : la page ne peut pas varier selon le compte.
      assert.doesNotMatch(affiche, /supabase|cookies\(|headers\(/, page);
    }
  });

  it("celle de l'espace connecté n'apporte que le contenu : la coque fournit le reste", () => {
    assert.doesNotMatch(sansCommentaires(lire(PAGE_ESPACE)), /<(main|header|footer)\b/);
    // Celle de la racine n'a que la mise en page racine autour d'elle.
    assert.match(sansCommentaires(lire(PAGE_RACINE)), /<main\b/);
  });

  it("l'administration est cachée avant d'atteindre ses pages", () => {
    // Une page qui répond 404 elle-même s'affiche dans la coque et sous son
    // propre titre d'onglet : le middleware doit l'avoir écartée avant.
    const garde = sansCommentaires(lire(MIDDLEWARE));
    assert.match(garde, /sousAdministration\(pathname\)/);
    assert.match(garde, /rpc\("is_admin"\)/);
    // Tout ce qui n'est pas un oui franc est un refus, panne comprise.
    assert.match(garde, /administrateur !== true/);
    assert.match(garde, /NextResponse\.rewrite\(/);

    // La cible ne peut être servie par aucune route : Next exclut du routage
    // les dossiers préfixés d'un tiret bas.
    const cible = /const ROUTE_INEXISTANTE = "(\/[^"]+)"/.exec(garde)?.[1];
    assert.match(cible ?? "", /^\/_[a-z]+$/);
    assert.deepEqual(
      SOURCES.filter((f) => f.startsWith(`src/app${cible}`)),
      [],
    );
  });

  it("chaque page d'administration garde son propre contrôle, en seconde ligne", () => {
    const pages = SOURCES.filter((f) => /^src\/app\/\(app\)\/administration\/.*page\.tsx$/.test(f));
    assert.ok(pages.length >= 3);
    const sansGarde = pages.filter((f) => {
      const source = sansCommentaires(lire(f));
      return !/rpc\("is_admin"\)/.test(source) || !/notFound\(\)/.test(source);
    });
    assert.deepEqual(sansGarde, []);
  });

  it("le middleware garde chaque rubrique de l'espace connecté", () => {
    // La coque revérifie la session, mais le middleware est seul à refuser
    // une action postée par un compte que le mode privé tient à l'écart, et
    // à mémoriser la destination d'un visiteur renvoyé à la connexion.
    const liste = /const ROUTES_PROTEGEES = \[([^\]]*)\]/.exec(lire(MIDDLEWARE))?.[1] ?? "";
    const gardees = [...liste.matchAll(/"(\/[^"]+)"/g)].map((m) => m[1]).sort();
    const rubriques = [
      ...new Set(
        SOURCES.map((f) => /^src\/app\/\(app\)\/([^/]+)\//.exec(f)?.[1])
          .filter(Boolean)
          .map((nom) => `/${nom}`),
      ),
    ].sort();
    assert.ok(rubriques.includes("/tableau-de-bord"));
    assert.deepEqual(gardees, rubriques);
  });

  it("la garde est branchée par le fichier que Next 16 attend, et par lui seul", () => {
    // Next 16 a renommé la convention : un `middleware.ts` y est déprécié, et
    // deux fichiers d'entrée feraient douter de celui qui garde. Un fichier
    // mal nommé ne serait pas exécuté du tout, et rien ne serait gardé.
    const entrees = SOURCES.filter((f) => /^src\/(middleware|proxy)\.(ts|js|mjs)$/.test(f));
    assert.deepEqual(entrees, ["src/proxy.ts"]);

    const entree = sansCommentaires(lire("src/proxy.ts"));
    assert.match(entree, /export async function proxy\(/);
    assert.match(entree, /return updateSession\(request\)/);
    // Le réglage du runtime y est refusé par Next : le proxy tourne sous Node.js.
    assert.doesNotMatch(entree, /\bruntime\b/);
    // Le filtre laisse passer toutes les pages : seuls les fichiers statiques sont écartés.
    assert.match(entree, /matcher:\s*\[/);
    assert.match(entree, /_next\/static\|_next\/image/);
  });
});

/*
 * Libellés du dossier PDF. Railway ne déploie que `worker/` : le worker ne
 * peut pas importer les libellés de l'application, il en tient une copie. Un
 * dossier ne doit pas nommer un poste autrement que l'écran.
 */
describe("Libellés du worker", () => {
  /** Table `code: "libellé"` déclarée dans un fichier de l'application. */
  function tableDe(fichier, nom, { imbriquee = false } = {}) {
    const source = lire(fichier);
    const debut = source.indexOf(`export const ${nom}`);
    assert.ok(debut >= 0, `${nom} introuvable dans ${fichier}`);
    // Jusqu'à l'accolade qui ferme la table, qu'elle finisse par « }; » ou
    // par « } as const; » : au-delà, la lecture prendrait la table suivante.
    const corps = source.slice(debut, source.indexOf("\n}", debut));
    const motif = imbriquee
      ? /^ {2}(\w+): \{\s*libelle: "([^"]*)"/gm
      : /^ {2}(\w+): "([^"]*)",?$/gm;
    return Object.fromEntries([...corps.matchAll(motif)].map((m) => [m[1], m[2]]));
  }

  it("le dossier nomme chaque chose comme l'écran", async () => {
    const worker = await import("../worker/src/exports/libelles.ts");
    const application = {
      FORMATS: tableDe("src/lib/projets.ts", "FORMATS"),
      ETAPES: tableDe("src/lib/projets.ts", "ETAPES"),
      TYPES_DOCUMENT: tableDe("src/lib/documents.ts", "TYPES_DOCUMENT", { imbriquee: true }),
      POSTES: tableDe("src/lib/budgets.ts", "POSTES"),
      TYPES_FINANCEMENT: tableDe("src/lib/financements.ts", "TYPES_FINANCEMENT"),
      STATUTS_FINANCEMENT: tableDe("src/lib/financements.ts", "STATUTS_FINANCEMENT"),
      STATUTS_ETAPE: tableDe("src/lib/planning.ts", "STATUTS_ETAPE"),
      GENRES: tableDe("src/lib/fiche.ts", "GENRES"),
      ROLES_PERSONNAGE: tableDe("src/lib/fiche.ts", "ROLES_PERSONNAGE"),
      CADRAGES: tableDe("src/lib/storyboard.ts", "CADRAGES"),
      MOMENTS: tableDe("src/lib/storyboard.ts", "MOMENTS"),
      ANGLES: tableDe("src/lib/decoupage.ts", "ANGLES"),
      MOUVEMENTS: tableDe("src/lib/decoupage.ts", "MOUVEMENTS"),
      CATEGORIES_MATERIEL: tableDe("src/lib/materiel.ts", "CATEGORIES_MATERIEL"),
    };
    // Un personnage n'a que deux rôles : son seuil de lecture est le sien.
    const minimum = { ROLES_PERSONNAGE: 2 };

    for (const [nom, attendu] of Object.entries(application)) {
      // La lecture a bien trouvé quelque chose : une table vide passerait
      // la comparaison sans rien prouver.
      assert.ok(
        Object.keys(attendu).length >= (minimum[nom] ?? 3),
        `${nom} : lecture de l'application`,
      );
      assert.deepEqual({ ...worker[nom] }, attendu, nom);
    }
  });

  it("le dossier écrit le décor d'une scène en toutes lettres, comme l'écran le nomme", async () => {
    const { DECORS } = await import("../worker/src/exports/libelles.ts");
    // À l'écran, chaque décor porte une abréviation et un libellé : le
    // dossier reprend le libellé.
    const source = lire("src/lib/storyboard.ts");
    const debut = source.indexOf("export const DECORS");
    const corps = source.slice(debut, source.indexOf("\n}", debut));
    const enApplication = Object.fromEntries(
      [...corps.matchAll(/^ {2}(\w+): \{ abrege: "[^"]*", libelle: "([^"]*)" \},?$/gm)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    assert.equal(Object.keys(enApplication).length, 3, "lecture de l'application");
    assert.deepEqual({ ...DECORS }, enApplication);
  });
});

/*
 * Sections d'un dossier PDF. L'écran valide une demande avant de demander un
 * devis ; la base la valide à l'exécution, et a le dernier mot. Les deux
 * listes doivent rester la même : une section proposée à l'écran mais
 * inconnue de la base ferait échouer la tâche après coup.
 */
describe("Sections des exports PDF", () => {
  it("l'écran propose exactement les sections que la base accepte", async () => {
    const { ORDRE_SECTIONS } = await import("../src/lib/exports.ts");
    // parametres_export() a été redéfinie depuis sa création : seule sa
    // dernière définition, dans l'ordre des migrations, a cours.
    const liste =
      readdirSync(join(RACINE, "supabase/migrations"))
        .sort()
        .map((fichier) => lire(`supabase/migrations/${fichier}`))
        .map((migration) => /v_sections <@ array\[([^\]]+)\]/.exec(migration)?.[1])
        .filter(Boolean)
        .at(-1) ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 5, "lecture des migrations");
    assert.deepEqual([...ORDRE_SECTIONS].sort(), [...enBase].sort());
  });

  it("le worker sait composer chaque section que l'écran propose", async () => {
    // Une section admise par la base mais ignorée du worker donnerait un
    // dossier où elle manque, sans erreur.
    const { ORDRE_SECTIONS } = await import("../src/lib/exports.ts");
    const composition = lire("worker/src/exports/dossier.ts");
    for (const section of ORDRE_SECTIONS) {
      assert.match(composition, new RegExp(`if \\(contenu\\.${section}\\) \\{`), section);
    }
  });

  // Ces deux gardes lisent le code : le parcours réel — onglet absent, page
  // et téléchargement en 404 pour un lecteur — se vérifie dans le navigateur.
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("la page du dossier suit la règle du budget, et ne lit jamais le fichier", () => {
    const page = sansCommentaires(lire("src/app/(app)/projets/[id]/dossier/page.tsx"));
    assert.match(page, /rpc\("peut_gerer_budget"/);
    assert.match(page, /if \(!projet \|\| !autorise\) \{\s*notFound\(\);/);
    // La liste n'a besoin que des métadonnées : le fichier, lui, ne voyage
    // qu'au téléchargement.
    const colonnes = /from\("project_exports"\)\s*\.select\("([^"]+)"\)/.exec(page)?.[1] ?? "";
    assert.ok(colonnes.length > 0, "lecture de la page");
    assert.doesNotMatch(colonnes, /\bfile\b/);
  });

  it("le téléchargement passe par la session, et ne se garde dans aucun cache", () => {
    const route = sansCommentaires(lire("src/app/(app)/projets/[id]/dossier/[exportId]/route.ts"));
    assert.match(route, /exigerAcces\(supabase\)/);
    // L'export demandé doit être celui du projet de l'adresse.
    assert.match(route, /\.eq\("id", exportId\)\s*\.eq\("project_id", id\)/);
    assert.match(route, /"cache-control": "private, no-store"/);
    assert.doesNotMatch(route, /SECRET|service_role/i);
  });
});

/*
 * Profil professionnel. Trois listes décrivent les mêmes champs : ce que
 * l'écran modifie, ce que la base admet, et ce que le journal sait nommer.
 * Un champ ajouté d'un côté seulement serait refusé après coup, ou
 * apparaîtrait au journal sous son nom de colonne.
 */
describe("Champs du profil", () => {
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("l'écran propose exactement les types de profil que la base admet", async () => {
    const { TYPES_PROFIL } = await import("../src/lib/profils.ts");
    const migration = lire("supabase/migrations/20261002201845_profil_professionnel.sql");
    const liste = /create type public\.profile_type as enum \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 3, "lecture de la migration");
    assert.deepEqual(Object.keys(TYPES_PROFIL), enBase);
  });

  it("l'écran borne chaque texte comme la base", async () => {
    const { LONGUEURS_PROFIL } = await import("../src/lib/profils.ts");
    const migrations = [
      "supabase/migrations/20260929092712_profiles_et_roles.sql",
      "supabase/migrations/20261002201845_profil_professionnel.sql",
    ]
      .map(lire)
      .join("\n");
    const enBase = Object.fromEntries(
      [...migrations.matchAll(/check \(char_length\((\w+)\) <= (\d+)/g)].map((m) => [
        m[1],
        Number(m[2]),
      ]),
    );

    assert.ok(Object.keys(enBase).length >= 5, "lecture des migrations");
    assert.deepEqual({ ...LONGUEURS_PROFIL }, enBase);
  });

  it("le journal sait nommer chaque champ que l'écran modifie", async () => {
    const { CHAMPS_MODIFIABLES: FORMULAIRE } = await import("../src/lib/profils.ts");
    // La photo ne passe pas par le formulaire, mais par ses propres actions.
    const CHAMPS_MODIFIABLES = [...FORMULAIRE, "avatar_path"];
    const journal = lire("src/lib/journal-administration.ts");
    const debut = journal.indexOf("const CHAMPS_PROFIL");
    assert.ok(debut >= 0, "CHAMPS_PROFIL introuvable");
    const corps = journal.slice(debut, journal.indexOf("\n};", debut));
    const nommes = [...corps.matchAll(/^ {2}(\w+): "[^"]+",?$/gm)].map((m) => m[1]);

    assert.ok(nommes.length >= 1, "lecture du journal");
    assert.deepEqual([...nommes].sort(), [...CHAMPS_MODIFIABLES].sort());
  });

  // Ces gardes lisent le code : le parcours réel se vérifie dans le navigateur.
  it("l'action ne modifie que le profil de la session, après validation", () => {
    const action = sansCommentaires(lire("src/app/(app)/profil/actions.ts"));
    assert.match(action, /exigerAcces\(supabase\)/);
    assert.match(action, /normaliserProfil\(/);
    assert.match(action, /\.update\(lecture\.profil\)\s*\.eq\("id", user\.id\)/);
    // Ni identifiant ni rôle ne viennent du formulaire.
    assert.doesNotMatch(action, /formData\.get\("(id|role)"\)/);
    assert.doesNotMatch(action, /SECRET|service_role/i);
  });

  it("la page ne lit que le profil de la session", () => {
    const page = sansCommentaires(lire("src/app/(app)/profil/page.tsx"));
    assert.match(page, /from\("profiles"\)\s*\.select\(\s*"[^"]+",?\s*\)\s*\.eq\("id", user\.id\)/);
  });

  it("la photo n'est rattachée qu'au profil de la session, après contrôle de ses octets", () => {
    const action = sansCommentaires(lire("src/app/(app)/profil/actions.ts"));
    const debut = action.indexOf("export async function definirPhoto");
    assert.ok(debut >= 0, "definirPhoto introuvable");
    const corps = action.slice(debut, action.indexOf("\nexport ", debut + 1));

    assert.match(corps, /exigerAcces\(supabase\)/);
    // Le dossier est celui du compte de la session.
    assert.match(corps, /estCheminPhotoDe\(chemin, user\.id\)/);
    // Les octets réels sont lus, et comparés à l'extension annoncée, avant
    // tout rattachement.
    const controle = corps.search(/extensionDesOctets\(octets\) !== extensionDuChemin\(chemin\)/);
    const rattachement = corps.search(
      /\.update\(\{ avatar_path: chemin \}\)\s*\.eq\("id", user\.id\)/,
    );
    assert.ok(controle > 0, "contrôle des octets introuvable");
    assert.ok(rattachement > controle, "le rattachement doit suivre le contrôle des octets");
    assert.doesNotMatch(action, /SECRET|service_role/i);
  });
});

/*
 * Formats des exports. L'écran choisit une action par format ; la base doit
 * l'admettre, et le worker savoir l'exécuter. Un format proposé à l'écran
 * sans l'un ou l'autre ferait échouer la demande, ou attendre la tâche à
 * jamais.
 */
describe("Formats des exports", () => {
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("la base admet chaque action d'export que l'écran propose", async () => {
    const { ACTIONS_EXPORT } = await import("../src/lib/exports.ts");
    // La dernière migration qui redéfinit la liste des actions et leur devis.
    const migration = lire("supabase/migrations/20261003162159_exports_zip.sql");
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 10, "lecture de la migration");
    for (const action of ACTIONS_EXPORT) {
      assert.ok(enBase.includes(action), action);
      assert.match(migration, new RegExp(`when [^\n]*'${action}'[^\n]*then`), `devis de ${action}`);
    }
  });

  it("le worker sait exécuter exactement les actions d'export de l'écran", async () => {
    const { ACTIONS_EXPORT } = await import("../src/lib/exports.ts");
    const { executeursExport } = await import("../worker/src/exports/executeur.ts");
    // La base n'est pas touchée : les exécuteurs ne la lisent qu'à l'exécution.
    assert.deepEqual(Object.keys(executeursExport({})).sort(), [...ACTIONS_EXPORT].sort());
  });

  it("la demande transmet son format à la base : export identique et devis", () => {
    const action = sansCommentaires(lire("src/app/(app)/projets/[id]/dossier/actions.ts"));
    assert.match(action, /estFormatExport\(format\)/);
    assert.match(action, /rpc\("export_disponible", \{[^}]*p_format: format,?\s*\}/);
    assert.match(action, /p_action: FORMATS_EXPORT\[format\]\.action/);
    assert.doesNotMatch(action, /p_action: "pdf_export"/);
  });

  it("la base range et contrôle chaque format que l'écran propose", async () => {
    const { FORMATS_EXPORT, ORDRE_FORMATS } = await import("../src/lib/exports.ts");
    const migration = lire("supabase/migrations/20261003162159_exports_zip.sql");

    const liste = /export_format check \(format in \(([^)]+)\)\)/.exec(migration)?.[1] ?? "";
    assert.deepEqual(
      [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]),
      [...ORDRE_FORMATS],
    );

    for (const format of ORDRE_FORMATS) {
      const { signature } = FORMATS_EXPORT[format];
      // La signature que l'application attend est celle que la base exige.
      const hexa = signature.map((octet) => octet.toString(16).padStart(2, "0")).join("");
      assert.ok(
        migration.includes(
          `when '${format}' then substring(file from 1 for ${signature.length}) = '\\x${hexa}'::bytea`,
        ),
        `signature de ${format}`,
      );
    }

    // Le format se déduit de l'action, et de rien d'autre, quand le worker dépose.
    const depot = migration.slice(
      migration.indexOf("create or replace function public.livrer_export"),
    );
    for (const format of ORDRE_FORMATS) {
      assert.ok(
        depot.includes(`when '${FORMATS_EXPORT[format].action}' then '${format}'`),
        `${FORMATS_EXPORT[format].action} dépose un ${format}`,
      );
    }
  });

  it("le téléchargement prend le format dans la base, jamais dans l'adresse", () => {
    const route = sansCommentaires(lire("src/app/(app)/projets/[id]/dossier/[exportId]/route.ts"));
    assert.match(route, /\.select\("file, format"\)/);
    assert.match(route, /lireFichier\(dossier\?\.file, format\)/);
    assert.doesNotMatch(route, /searchParams|nextUrl/);
  });
});

/*
 * Fiche du projet. L'écran propose des genres et borne des textes ; la base
 * a le dernier mot. Un genre proposé à l'écran mais inconnu de la base ferait
 * échouer l'enregistrement ; une borne plus large, de même.
 */
describe("Fiche du projet", () => {
  const MIGRATION = "supabase/migrations/20261003010956_fiche_projet.sql";

  it("l'écran propose exactement les genres que la base admet", async () => {
    const { GENRES } = await import("../src/lib/fiche.ts");
    const migration = lire(MIGRATION);
    const liste = /genre in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 10, "lecture de la migration");
    assert.deepEqual(Object.keys(GENRES), enBase);
  });

  it("l'écran borne chaque texte comme la base", async () => {
    const { LONGUEURS_FICHE, LONGUEURS_PERSONNAGE, MAX_PAYS, DUREE_MINUTES } =
      await import("../src/lib/fiche.ts");
    const migration = lire(MIGRATION);
    const bornes = Object.fromEntries(
      [
        ...migration.matchAll(/char_length\((?:btrim\()?(\w+)\)?\) (?:<=|between 1 and) (\d+)/g),
      ].map((m) => [m[1], Number(m[2])]),
    );

    assert.ok(Object.keys(bornes).length >= 9, "lecture de la migration");
    assert.deepEqual({ ...LONGUEURS_FICHE, ...LONGUEURS_PERSONNAGE }, bornes);
    assert.ok(migration.includes(`cardinality(countries) <= ${MAX_PAYS}`), "nombre de pays");
    assert.match(
      migration,
      new RegExp(`duration_minutes between ${DUREE_MINUTES.min} and ${DUREE_MINUTES.max}`),
    );
  });

  it("chaque personnage est protégé comme le storyboard : verrou, journal et droits par colonne", () => {
    const migration = lire(MIGRATION);
    assert.match(migration, /on public\.project_characters\s+as restrictive/);
    assert.match(migration, /execute function public\.journaliser_intervention_admin\(\)/);
    assert.match(
      migration,
      /revoke update on table public\.project_characters from authenticated;\s*grant update \(name, role, description, position\)/,
    );
  });
});

/*
 * Assistant de création. Chaque action vérifie elle-même qui l'appelle avant
 * d'écrire ; seuls le porteur et les éditeurs ouvrent ses étapes. La RLS a le
 * dernier mot : ces gardes lisent le code, le parcours réel se vérifie dans
 * le navigateur.
 */
describe("Assistant de création", () => {
  const DOSSIER = "src/app/(app)/projets/[id]/assistant";
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const actions = () => sansCommentaires(lire(`${DOSSIER}/actions.ts`));

  it("l'écran borne le titre et le pitch comme la base", async () => {
    const { TITRE_MAX, PITCH_MAX } = await import("../src/lib/assistant.ts");
    const migration = lire("supabase/migrations/20260929092713_projets_de_film.sql");
    assert.ok(migration.includes(`char_length(btrim(title)) between 1 and ${TITRE_MAX}`));
    assert.ok(migration.includes(`char_length(logline) <= ${PITCH_MAX}`));
  });

  it("chaque action vérifie la session avant d'écrire", () => {
    const corps = actions().split("\nexport async function ").slice(1);
    assert.equal(corps.length, 5, "lecture des actions");
    for (const fonction of corps) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const garde = fonction.indexOf("exigerAcces(supabase)");
      const ecriture = fonction.search(/\.(insert|update|delete)\(/);
      assert.ok(garde > 0, `${nom} : garde introuvable`);
      assert.ok(ecriture > garde, `${nom} : l'écriture doit suivre la garde`);
    }
    assert.doesNotMatch(actions(), /SECRET|service_role/i);
  });

  it("ni le porteur ni l'auteur ne viennent du formulaire", () => {
    assert.doesNotMatch(actions(), /formData\.get\("(owner_id|studio_id|created_by|project_id)"\)/);
    assert.match(actions(), /owner_id: garde\.user\.id/);
    assert.match(actions(), /created_by: garde\.user\.id/);
  });

  it("une modification que la RLS ignore est signalée, et non perdue en silence", () => {
    // Projet et personnage : une modification sans ligne touchée est un refus.
    assert.equal(actions().split("if (!data?.length) return { erreur: REFUS };").length - 1, 2);
  });

  it("seuls le porteur et les éditeurs ouvrent une étape", () => {
    const page = sansCommentaires(lire(`${DOSSIER}/[etape]/page.tsx`));
    assert.match(page, /rpc\("acces_au_projet", \{ p_project_id: id \}\)/);
    assert.match(
      page,
      /if \(!projet \|\| \(acces !== "owner" && acces !== "editor"\)\) \{\s*notFound\(\);/,
    );
  });
});

/*
 * Score de maturité. L'application calcule le score ; la base fournit les
 * pondérations et les faits, et a le dernier mot. Un critère connu de l'un et
 * pas de l'autre, ou un fait attendu que la base ne rend pas, donnerait un
 * score faux — ou aucun score, sans qu'aucun test de droits ne le voie.
 */
describe("Score de maturité", () => {
  const MIGRATION = "supabase/migrations/20261003131559_score_maturite.sql";

  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("l'application évalue exactement les critères que la base pondère", async () => {
    const { ORDRE_CRITERES } = await import("../src/lib/maturite.ts");
    const liste =
      /grant insert \(([^)]+)\) on table public\.readiness_weight_versions/.exec(
        lire(MIGRATION),
      )?.[1] ?? "";
    const enBase = [...liste.matchAll(/(\w+)/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 9, "lecture de la migration");
    assert.deepEqual([...ORDRE_CRITERES], enBase);
  });

  it("l'application attend exactement les faits que la base rend", async () => {
    const { FAITS_OUI_NON, FAITS_COMPTES } = await import("../src/lib/maturite.ts");
    const migration = lire(MIGRATION);
    const debut = migration.indexOf("create or replace function public.faits_maturite");
    assert.ok(debut >= 0, "faits_maturite introuvable");
    const corps = migration.slice(debut, migration.indexOf("$$;", debut));
    const enBase = [...corps.matchAll(/^ {4}'(\w+)', /gm)].map((m) => m[1]);

    assert.ok(enBase.length >= 20, "lecture de la migration");
    assert.deepEqual([...FAITS_OUI_NON, ...FAITS_COMPTES].sort(), [...enBase].sort());
  });

  // Ces gardes lisent le code : l'affichage réel — encart présent pour le
  // porteur, absent pour un lecteur — se vérifie dans le navigateur.
  it("le score suit la règle du budget, revérifiée là où il se calcule", () => {
    const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/maturite.tsx"));
    assert.match(encart, /rpc\("peut_gerer_budget", \{ p_project_id: projetId \}\)/);
    assert.match(encart, /if \(autorise !== true\) \{\s*return \{ etat: "interdit" \};/);
    // Les deux encarts ne rendent rien à qui n'y a pas droit.
    assert.equal(
      encart.split(/if \(chargement\.etat === "interdit"\) \{\s*return null;/).length - 1,
      2,
    );
    // Lecture sous la session de l'utilisateur : aucun rôle de service.
    assert.doesNotMatch(encart, /SECRET|service_role/i);
  });

  it("les pages ne montrent l'encart qu'à qui lit le budget", () => {
    const projet = sansCommentaires(lire("src/app/(app)/projets/[id]/page.tsx"));
    assert.match(
      projet,
      /\{peutGererBudget \? <MaturiteDuDossier projetId=\{projet\.id\} \/> : null\}/,
    );

    const tableauDeBord = sansCommentaires(lire("src/app/(app)/tableau-de-bord/page.tsx"));
    assert.match(
      tableauDeBord,
      /\{budgetAutorise \? <ScoreMaturite projetId=\{projet\.id\} \/> : null\}/,
    );
  });

  // Lot S2 : le score sur les listes, et la publication des pondérations.
  const MIGRATION_LISTE = "supabase/migrations/20261003144808_score_maturite_liste.sql";

  it("la lecture groupée suit la règle du budget, sans réécrire les faits", () => {
    const migration = lire(MIGRATION_LISTE);
    const debut = migration.indexOf("create or replace function public.faits_maturite_projets");
    assert.ok(debut >= 0, "faits_maturite_projets introuvable");
    const corps = migration.slice(debut, migration.indexOf("$$;", debut));

    assert.match(corps, /security invoker/);
    assert.match(corps, /select p\.id, public\.faits_maturite\(p\.id\)/);
    assert.match(corps, /and public\.peut_gerer_budget\(p\.id\)/);
  });

  it("le plafond des listes est le même en base et dans l'application", async () => {
    const { LIMITE_SCORES_LISTE } = await import("../src/lib/maturite.ts");
    const enBase = /cardinality\(p_project_ids\), 0\) > (\d+) then/.exec(
      lire(MIGRATION_LISTE),
    )?.[1];

    assert.ok(enBase, "lecture de la migration");
    assert.equal(LIMITE_SCORES_LISTE, Number(enBase));

    const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/maturite.tsx"));
    assert.match(encart, /projetIds\.slice\(0, LIMITE_SCORES_LISTE\)/);
  });

  it("les listes lisent les scores en lot, jamais projet par projet", () => {
    for (const page of [
      "src/app/(app)/projets/page.tsx",
      "src/app/(app)/tableau-de-bord/page.tsx",
    ]) {
      const source = sansCommentaires(lire(page));
      assert.match(source, /chargerScores\(/, page);
      assert.match(source, /<EtiquetteMaturite\s+score=\{scores\.get\(\w+\.id\)\}/, page);
      assert.doesNotMatch(source, /rpc\("faits_maturite/, page);
    }
    // Une carte sans score n'affiche rien : ni zéro, ni tiret.
    const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/maturite.tsx"));
    assert.match(encart, /if \(score === undefined\) \{\s*return null;/);
    assert.match(encart, /rpc\("faits_maturite_projets", \{ p_project_ids: demandes \}\)/);
  });

  it("la publication des pondérations revérifie le rôle et valide avant d'écrire", () => {
    const action = sansCommentaires(lire("src/app/(app)/administration/ponderations/actions.ts"));
    const etapes = [
      "exigerAcces(supabase)",
      'rpc("is_admin")',
      "lireValeursPonderations(",
      ".insert(lecture.valeurs)",
    ].map((etape) => action.indexOf(etape));

    assert.ok(
      etapes.every((position) => position >= 0),
      "une étape manque",
    );
    assert.deepEqual(
      etapes,
      [...etapes].sort((a, b) => a - b),
      "session, rôle, validation, puis écriture",
    );
    assert.match(action, /if \(!estAdministrateur\) \{\s*return \{ erreur: REFUS \};/);
    // Écriture sous la session de l'administrateur : aucun rôle de service.
    assert.doesNotMatch(action, /SECRET|service_role/i);
  });
});

/*
 * Rubriques d'un projet. Écrite à deux endroits, la liste des onglets avait
 * cessé d'être la même : le tableau de bord n'avait ni « Fiche » ni
 * « Dossier ». Elle n'existe plus qu'à un seul.
 */
describe("Rubriques d'un projet", () => {
  it("le tableau de bord emploie les onglets de la page du projet, sans réécrire la liste", () => {
    const tableauDeBord = lire("src/app/(app)/tableau-de-bord/page.tsx");
    assert.match(
      tableauDeBord,
      /<OngletsProjet\s+projetId=\{projet\.id\}\s+actif="projet"\s+budget=\{budgetAutorise === true\}\s+synthese="\/tableau-de-bord"\s+\/>/,
    );
    assert.doesNotMatch(tableauDeBord, /<Onglets\b/);
    assert.doesNotMatch(tableauDeBord, /libelle: "(Documents|Storyboard|Planning|Budget)"/);

    const onglets = lire("src/app/(app)/projets/[id]/onglets.tsx");
    assert.match(onglets, /ongletsDuProjet\(projetId, \{ budget, synthese \}\)/);
    assert.doesNotMatch(onglets, /libelle: "/);
  });
});

/*
 * Catalogue public. La vitrine lit la dernière version de chaque plan et du
 * barème : une version, pas la table. Que ce soit bien la dernière se vérifie
 * contre la base, dans la suite du catalogue.
 */
describe("Catalogue public", () => {
  it("la vitrine lit une version par plan et une version du barème, jamais une table entière", () => {
    const offre = lire("src/lib/offre.ts");

    // Les versions d'un plan n'arrivent qu'imbriquées dans leur plan, triées et limitées.
    assert.doesNotMatch(offre, /\.from\("plan_versions"\)/);
    assert.match(
      offre,
      /\.order\("version_number", \{ referencedTable: "plan_versions", ascending: false \}\)\s*\.limit\(1, \{ referencedTable: "plan_versions" \}\)/,
    );

    const lectures = offre.split('.from("text_unit_rate_versions")').slice(1);
    assert.equal(lectures.length, 1, "une seule lecture du barème");
    assert.match(
      lectures[0],
      /^\s*\.select\([^)]*\)\s*\.order\("version_number", \{ ascending: false \}\)\s*\.limit\(1\)/,
    );
  });
});

/*
 * Livrables ouverts par le lot X1. Plusieurs blocs ci-dessous relisent la
 * migration d'un lot antérieur pour vérifier qu'elle n'a rien retiré aux
 * livrables qui existaient alors : elle ne peut pas avoir « gardé » ceux-ci,
 * nés après elle. C'est le bloc « Livrables des agents », qui lit la dernière
 * migration, qui vérifie que la base les admet.
 */
const LIVRABLES_X1 = ["direction_note", "pitch_extended", "pitch_oral"];
const avantX1 = (profils) => Object.keys(profils).filter((a) => !LIVRABLES_X1.includes(a));

/*
 * Livrables de WEAVER. Un profil versionné noue une action de tâche à ses
 * consignes ; la base doit admettre cette action, la facturer, accepter la
 * proposition qu'elle produira et savoir où l'appliquer. Un profil sans l'un
 * ou l'autre ferait échouer la demande, ou perdre le texte au dépôt.
 */
describe("Livrables des agents", () => {
  // Le lot X1 a repris les quatre fonctions d'un coup ; le lot X2a a repris
  // les devis après lui. Ce sont ces migrations qui disent ce que la base
  // admet aujourd'hui.
  const DEVIS = "supabase/migrations/20261007230000_arc_personnages.sql";
  const CONTEXTE = "supabase/migrations/20261007210000_weaver_realisation_pitch.sql";
  const PROPOSITIONS = CONTEXTE;

  /** Corps de la fonction nommée, jusqu'à la suivante. */
  const corps = (migration, nom) => {
    const debut = migration.indexOf(`create or replace function public.${nom}`);
    assert.ok(debut >= 0, nom);
    const suite = migration.indexOf("create or replace function public.", debut + 1);
    return migration.slice(debut, suite === -1 ? undefined : suite);
  };

  it("la base admet chaque action de chaque agent et la facture au barème", async () => {
    const { PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    const devis = lire(DEVIS);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(devis)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 10, "lecture de la migration");
    for (const action of Object.keys(PROFILS_IA)) {
      assert.ok(enBase.includes(action), action);
      // Les livrables rédigés se facturent d'une ligne ; le scénario,
      // chiffré par séquence, s'écrit sur plusieurs.
      assert.ok(
        devis.includes(`when '${action}' then v_quantite := v_bareme.`) ||
          (action === "screenplay" &&
            /when 'screenplay' then\s+(--.*\s+)*v_quantite := v_bareme\.screenplay_per_sequence/.test(
              devis,
            )),
        `devis de ${action}`,
      );
    }
  });

  it("la base accepte au dépôt la longueur que chaque profil annonce", async () => {
    const { PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    const depot = corps(lire(PROPOSITIONS), "livrer_proposition");
    for (const [action, profil] of Object.entries(PROFILS_IA)) {
      assert.match(
        depot,
        new RegExp(`when '${action}' then\\s+v_max := ${profil.longueurMax};`),
        `borne de ${action}`,
      );
    }
  });

  it("la base sait où appliquer chaque action", async () => {
    const { PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    const acceptation = corps(lire(PROPOSITIONS), "accepter_proposition");
    for (const action of Object.keys(PROFILS_IA)) {
      assert.match(acceptation, new RegExp(`when '${action}' then v_max :=`), action);
    }
  });

  it("chaque agent expose exactement les actions de ses profils", async () => {
    const { executeursWeaver } = await import("../worker/src/agents/weaver.ts");
    const { executeursScript } = await import("../worker/src/agents/script.ts");
    const { executeursArc } = await import("../worker/src/agents/arc.ts");
    const {
      PROFILS_ARC,
      PROFILS_ARC_PERSONNAGES,
      PROFILS_IA,
      PROFILS_RETOUCHE,
      PROFILS_SCRIPT,
      PROFILS_SCRIPT_EPISODES,
      PROFILS_WEAVER,
    } = await import("../worker/src/ia/profils.ts");
    // Ni la base ni le fournisseur ne sont touchés : rien n'est appelé ici.
    const vide = async () => ({});
    // WEAVER sert ses rédactions, puis ses retouches, qui partent d'un passage.
    assert.deepEqual(Object.keys(executeursWeaver({}, vide)), [
      ...Object.keys(PROFILS_WEAVER),
      ...Object.keys(PROFILS_RETOUCHE),
    ]);
    // SCRIPT sert ses textes, puis ses épisodes, qui ne sont pas un texte.
    assert.deepEqual(Object.keys(executeursScript({}, vide)), [
      ...Object.keys(PROFILS_SCRIPT),
      ...Object.keys(PROFILS_SCRIPT_EPISODES),
    ]);
    // ARC sert ses textes, puis ses personnages, qui ne sont pas un texte.
    assert.deepEqual(Object.keys(executeursArc({}, vide)), [
      ...Object.keys(PROFILS_ARC),
      ...Object.keys(PROFILS_ARC_PERSONNAGES),
    ]);
    // Aucun profil n'est oublié par un agent, et aucun n'est servi deux fois.
    assert.deepEqual(
      [
        ...Object.keys(PROFILS_WEAVER),
        ...Object.keys(PROFILS_ARC),
        ...Object.keys(PROFILS_SCRIPT),
      ].sort(),
      Object.keys(PROFILS_IA).sort(),
    );
  });

  it("un scénario se demande une séquence à la fois, et s'ajoute au document", async () => {
    const { consigneDe } = await import("../src/lib/propositions.ts");
    const migration = lire(DEVIS);

    // Une séquence par tâche : en facturer davantage ferait payer ce que le
    // worker n'écrirait pas.
    const devis = corps(migration, "creer_devis");
    assert.match(devis, /parametre_entier\(v_parametres, 'sequences', 1\)/);

    // La description part chez le fournisseur : l'écran et la base la
    // bornent à la même longueur.
    const borne = /char_length\(btrim\(v_sequence\)\) not between 1 and (\d+)/.exec(devis)?.[1];
    assert.equal(Number(borne), consigneDe("screenplay")?.longueurMax);
    assert.match(devis, /jsonb_typeof\(v_parametres -> 'sequence'\) is distinct from 'string'/);

    // Le contexte joint la description et la fin du document cible. Lui seul
    // est écarté des documents finalisés : un autre scénario reste lu.
    const contexte = corps(lire(CONTEXTE), "contexte_redaction");
    assert.match(contexte, /'sequence', v_job\.params ->> 'sequence'/);
    assert.match(contexte, /'fin', right\(d\.content, \d+\)/);
    assert.match(contexte, /and d\.id is distinct from v_scenario/);
    assert.doesNotMatch(contexte, /d\.type <> 'scenario'/);

    // L'acceptation ajoute à la fin : ce qui précède reste en tête, intact.
    const acceptation = corps(lire(PROPOSITIONS), "accepter_proposition");
    assert.match(acceptation, /else v_ancien \|\| E'\\n\\n' \|\| v_final/);
    assert.match(acceptation, /char_length\(v_ancien\) \+ 2 \+ char_length\(v_final\) > 200000/);

    // Le navigateur ne choisit pas le nombre de séquences, et seul un
    // livrable qui en demande une reçoit une consigne.
    const actions = lire("src/app/(app)/projets/[id]/actions-ia.ts");
    // Une séquence peut désigner son épisode (lot SE3b) : rien d'autre ne s'y ajoute.
    assert.match(
      actions,
      /parametres = \{\s*sequences: 1,\s*sequence: texte,\s*\.\.\.\(episodeId \? \{ episode: episodeId \} : \{\}\),\s*\};/,
    );
    assert.match(actions, /lireConsigne\(consigne, attendue\.longueurMax\)/);
    for (const action of ["logline", "treatment", "bible", "dramatic_analysis"]) {
      assert.equal(consigneDe(action), null, action);
    }
  });

  it("chaque profil est versionné, plafonné, et visé plus court que sa borne", async () => {
    const { PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    for (const [action, profil] of Object.entries(PROFILS_IA)) {
      assert.match(profil.id, /^(weaver|arc|script)\.[a-z_]+@\d+$/, action);
      assert.ok(profil.jetonsMax > 0, action);
      assert.ok(
        profil.longueurCible < profil.longueurMax,
        `${action} : ${profil.longueurCible} visé pour ${profil.longueurMax} admis`,
      );
      // La longueur visée vient du profil, et se lit dans ses consignes.
      assert.ok(
        profil.systeme.includes(String(profil.longueurCible)) ||
          profil.systeme.includes(profil.longueurCible.toLocaleString("fr-FR")),
        `${action} : la consigne ne dit pas la longueur visée`,
      );
    }
  });
});

/*
 * VOICE (lot J2b-1) : les dialogues d'une scène. Le passage du scénario est
 * désigné par la demande et scellé par son empreinte ; la base le relit au
 * devis, à la préparation de l'appel et à l'acceptation. Un contrôle oublié
 * ferait remplacer le mauvais passage d'un scénario retouché entre-temps.
 */
describe("Dialogues de VOICE", () => {
  const MIGRATION = "supabase/migrations/20261005190000_voice_dialogues.sql";
  const corps = (nom) => {
    const migration = lire(MIGRATION);
    const debut = migration.indexOf(`create or replace function public.${nom}`);
    assert.ok(debut >= 0, nom);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };

  it("le passage est relu et contrôlé aux trois étapes", () => {
    for (const nom of ["creer_devis", "contexte_dialogue", "accepter_proposition"]) {
      assert.match(corps(nom), /public\.passage_du_scenario\(/, nom);
    }
    const passage = corps("passage_du_scenario");
    // Le document est celui du projet, et un scénario ; l'empreinte scelle le texte.
    assert.match(passage, /d\.project_id = p_project_id/);
    assert.match(passage, /d\.type = 'scenario'/);
    assert.match(passage, /md5\(v_passage\) <> \(p_params ->> 'empreinte'\)/);
    assert.match(passage, /v_longueur not between 1 and 6000/);
    // Interne : jamais appelable depuis l'API.
    assert.match(
      lire(MIGRATION),
      /revoke all on function public\.passage_du_scenario\(uuid, jsonb\) from public, anon, authenticated;/,
    );
    assert.doesNotMatch(lire(MIGRATION), /grant execute on function public\.passage_du_scenario/);
  });

  it("l'acceptation verrouille le document, puis ne remplace que le passage", () => {
    const acceptation = corps("accepter_proposition");
    const verrou = acceptation.indexOf("for update;", acceptation.indexOf("d.type = 'scenario'"));
    const controle = acceptation.indexOf("v_ancien := public.passage_du_scenario(");
    assert.ok(verrou >= 0 && controle > verrou, "le passage est relu après le verrou");
    assert.match(
      acceptation,
      /left\(d\.content, v_debut\) \|\| v_final \|\| substr\(d\.content, v_debut \+ v_longueur \+ 1\)/,
    );
    assert.match(acceptation, /using errcode = 'PR002';/);
  });

  it("la base borne la scène réécrite comme le profil, et une scène par demande", async () => {
    const { PROFILS_IA, PROFILS_VOICE } = await import("../worker/src/ia/profils.ts");
    const depot = corps("livrer_proposition");
    const acceptation = corps("accepter_proposition");
    for (const [action, profil] of Object.entries(PROFILS_VOICE)) {
      assert.match(depot, new RegExp(`when '${action}' then v_max := ${profil.longueurMax};`));
      assert.match(
        acceptation,
        new RegExp(`when '${action}' then v_max := ${profil.longueurMax};`),
      );
      assert.match(profil.id, /^voice\.[a-z_]+@\d+$/, action);
      // Tenu à part des encarts de texte : il part d'une sélection.
      assert.ok(!(action in PROFILS_IA), action);
    }
    assert.match(corps("creer_devis"), /parametre_entier\(v_parametres, 'scenes', 1\)/);
  });

  it("le devis repris garde chaque livrable déjà ouvert", async () => {
    const { PROFILS_FIELD, PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    const devis = corps("creer_devis");
    for (const action of [...avantX1(PROFILS_IA), ...Object.keys(PROFILS_FIELD)]) {
      assert.ok(devis.includes(`when '${action}' then`), action);
    }
    // Le scénario garde sa séquence unique et la borne de sa description.
    assert.match(devis, /parametre_entier\(v_parametres, 'sequences', 1\)/);
    assert.match(devis, /not between 1 and 1200/);
    // Les propositions de textes gardent leurs bornes et leurs atterrissages.
    const acceptation = corps("accepter_proposition");
    for (const action of avantX1(PROFILS_IA)) {
      assert.match(acceptation, new RegExp(`when '${action}' then v_max :=`), action);
    }
    assert.match(acceptation, /else v_ancien \|\| E'\\n\\n' \|\| v_final/);
  });

  it("le registre sert VOICE avec les autres agents", () => {
    const registre = lire("worker/src/registre.ts");
    assert.match(registre, /\.\.\.executeursVoice\(base, fournisseur\)/);
  });
});

/*
 * FIELD (lot J3b-1) : un livrable structuré. Son profil n'annonce pas une
 * longueur mais un schéma et un nombre de lignes ; la base doit admettre son
 * action, connaître les mêmes catégories et la même borne, sans quoi tout
 * dépôt serait refusé après un appel payé.
 */
describe("Livrables structurés", () => {
  const MIGRATION = "supabase/migrations/20261004160108_field_budget.sql";
  // Le planning reprend le devis après le budget : c'est lui qui fait foi.
  const PLANNING = "supabase/migrations/20261005170000_field_planning.sql";

  it("la base admet l'action de chaque profil structuré et la facture au barème", async () => {
    const { PROFILS_FIELD, PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    const migration = lire(PLANNING);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    for (const [action, profil] of Object.entries(PROFILS_FIELD)) {
      assert.ok(enBase.includes(action), action);
      assert.ok(migration.includes(`v_quantite := v_bareme.${action};`), `devis de ${action}`);
      assert.match(profil.id, /^field\.[a-z_]+@\d+$/, action);
      assert.ok(profil.jetonsMax > 0, action);
      // Un profil structuré n'est pas un texte : il ne doit pas se glisser
      // parmi ceux que l'écran des propositions compare aux siens.
      assert.ok(!(action in PROFILS_IA), action);
    }
    // La migration de FIELD reprend le devis : elle doit garder les autres.
    for (const action of avantX1(PROFILS_IA)) {
      assert.ok(enBase.includes(action), action);
    }
  });

  it("le schéma du budget ne connaît que les catégories de la base", async () => {
    const { CATEGORIES_BUDGET, PROFIL_BUDGET } = await import("../worker/src/ia/profils.ts");
    const budgets = lire("supabase/migrations/20260929210000_budgets.sql");
    const liste = /create type public\.budget_category as enum \(([^)]+)\)/.exec(budgets)?.[1];
    const enBase = [...(liste ?? "").matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length > 0, "lecture de la migration des budgets");
    assert.deepEqual([...CATEGORIES_BUDGET], enBase);
    assert.deepEqual(PROFIL_BUDGET.schema.properties.lines.items.properties.category.enum, enBase);
    // Chaque catégorie est expliquée au modèle par sa consigne.
    for (const categorie of enBase) {
      assert.ok(PROFIL_BUDGET.systeme.includes(categorie), categorie);
    }
  });

  it("le schéma est strict, et la borne du profil est celle de la base", async () => {
    const { PROFIL_BUDGET } = await import("../worker/src/ia/profils.ts");
    const { schema } = PROFIL_BUDGET;
    const ligne = schema.properties.lines.items;
    assert.equal(schema.additionalProperties, false);
    assert.equal(ligne.additionalProperties, false);
    assert.deepEqual(ligne.required, ["category", "label", "quantity", "unit_cost"]);

    assert.match(
      lire(MIGRATION),
      new RegExp(`v_nombre not between 1 and ${PROFIL_BUDGET.lignesMax} then`),
    );
    assert.ok(PROFIL_BUDGET.systeme.includes(String(PROFIL_BUDGET.lignesMax)));
  });

  it("le schéma du planning ne connaît que les phases de la base, et aucune date", async () => {
    const { PHASES_PLANNING, PROFIL_PLANNING } = await import("../worker/src/ia/profils.ts");
    const migration = lire(PLANNING);
    const { schema } = PROFIL_PLANNING;
    const jalon = schema.properties.lines.items;

    // Les phases admises au dépôt et à l'acceptation sont celles du profil.
    const listes = [...migration.matchAll(/in \(\s*('idee'[^)]+)\)/g)].map((m) =>
      [...m[1].matchAll(/'(\w+)'/g)].map((n) => n[1]),
    );
    assert.equal(listes.length, 2, "dépôt et acceptation");
    for (const liste of listes) {
      assert.deepEqual(liste, [...PHASES_PLANNING]);
    }
    assert.deepEqual(jalon.properties.phase.enum, [...PHASES_PLANNING]);
    assert.ok(!PHASES_PLANNING.includes("termine"));
    for (const phase of PHASES_PLANNING) {
      assert.ok(PROFIL_PLANNING.systeme.includes(phase), phase);
    }

    // Strict, et sans date : l'agent ne connaît pas le calendrier de l'équipe.
    assert.equal(schema.additionalProperties, false);
    assert.equal(jalon.additionalProperties, false);
    assert.deepEqual(jalon.required, ["title", "phase", "duration_days"]);
    assert.deepEqual(Object.keys(jalon.properties), ["title", "phase", "duration_days"]);
    assert.match(PROFIL_PLANNING.systeme, /Ne propose aucune date/);

    // La borne du profil est celle de la base.
    assert.match(
      migration,
      new RegExp(`v_nombre not between 1 and ${PROFIL_PLANNING.lignesMax} then`),
    );
    assert.ok(PROFIL_PLANNING.systeme.includes(String(PROFIL_PLANNING.lignesMax)));
    assert.match(migration, /duration_days between 1 and 730/);
  });

  it("les jalons proposés suivent les droits du planning, et le contexte ignore le budget", () => {
    const migration = lire(PLANNING);
    // Lus de toute l'équipe, comme le planning ; décidés par qui l'écrit.
    assert.match(
      migration,
      /on public\.ai_suggestion_milestones for select\s+to authenticated\s+using \(public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(
      migration,
      /not coalesce\(public\.peut_editer_contenu\(v_jalon\.project_id\), false\)/,
    );
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_milestones from anon, authenticated/,
    );

    const debut = migration.indexOf("create or replace function public.contexte_planning");
    const contexte = migration.slice(debut, migration.indexOf("$$;", debut));
    assert.ok(debut >= 0);
    assert.doesNotMatch(contexte, /budget/);
    assert.doesNotMatch(contexte, /project_documents/);
  });

  it("l'écran propose exactement les livrables structurés que le worker sait produire", async () => {
    const { LIVRABLES_STRUCTURES } = await import("../src/lib/propositions.ts");
    const { PROFILS_FIELD } = await import("../worker/src/ia/profils.ts");
    assert.deepEqual(Object.keys(LIVRABLES_STRUCTURES).sort(), Object.keys(PROFILS_FIELD).sort());
    // La borne de l'écran est celle du profil, donc celle de la base.
    for (const [action, profil] of Object.entries(PROFILS_FIELD)) {
      assert.equal(LIVRABLES_STRUCTURES[action].lignesMax, profil.lignesMax, action);
    }
  });

  it("FIELD expose exactement les actions de ses profils", async () => {
    const { executeursField } = await import("../worker/src/agents/field.ts");
    const { PROFILS_FIELD } = await import("../worker/src/ia/profils.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursField({}, vide)), Object.keys(PROFILS_FIELD));
  });
});

/*
 * Écrans des propositions (lot I2b). Le catalogue de l'écran, les profils du
 * worker et les bornes de la base décrivent les mêmes livrables : un écart
 * ferait proposer un livrable que le worker ne sait pas écrire, ou composer
 * un texte que la base refuserait d'appliquer.
 */
describe("Écrans des propositions", () => {
  const PAGES = {
    projet: "src/app/(app)/projets/[id]/page.tsx",
    fiche: "src/app/(app)/projets/[id]/fiche/page.tsx",
    documents: "src/app/(app)/projets/[id]/documents/page.tsx",
  };
  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("l'écran propose exactement les livrables que le worker sait écrire", async () => {
    const { ORDRE_LIVRABLES } = await import("../src/lib/propositions.ts");
    const { PROFILS_IA } = await import("../worker/src/ia/profils.ts");
    assert.deepEqual([...ORDRE_LIVRABLES].sort(), Object.keys(PROFILS_IA).sort());
  });

  it("la borne de l'écran est celle que la base applique à l'acceptation", async () => {
    const { LIVRABLES_IA, ORDRE_LIVRABLES } = await import("../src/lib/propositions.ts");
    const migration = lire("supabase/migrations/20261007210000_weaver_realisation_pitch.sql");
    const debut = migration.indexOf("create or replace function public.accepter_proposition");
    assert.ok(debut >= 0, "accepter_proposition introuvable");
    const acceptation = migration.slice(debut);

    for (const action of ORDRE_LIVRABLES) {
      assert.match(
        acceptation,
        new RegExp(`when '${action}' then v_max := ${LIVRABLES_IA[action].longueurMax};`),
        `borne de ${action}`,
      );
    }
  });

  it("la demande transmet le livrable à la base, après l'avoir validé", () => {
    const actions = sansCommentaires(lire("src/app/(app)/projets/[id]/actions-ia.ts"));
    assert.match(actions, /p_action: action/);
    assert.doesNotMatch(actions, /p_action: "logline"/);

    for (const nom of [
      "demanderDevis",
      "lancerProposition",
      "annulerProposition",
      "appliquerProposition",
      "ecarterProposition",
    ]) {
      const debut = actions.indexOf(`export async function ${nom}`);
      assert.ok(debut >= 0, nom);
      const suite = actions.indexOf("\nexport ", debut + 1);
      const corps = actions.slice(debut, suite === -1 ? undefined : suite);
      assert.match(corps, /estActionIa\(action\)/, `${nom} valide le livrable`);
      assert.match(corps, /exigerAcces|session\(\)/, `${nom} exige une session`);
    }
  });

  it("chaque rubrique porte les encarts de ses livrables", async () => {
    const { LIVRABLES_IA, ORDRE_LIVRABLES } = await import("../src/lib/propositions.ts");
    for (const action of ORDRE_LIVRABLES) {
      const page = LIVRABLES_IA[action].page;
      assert.ok(Object.hasOwn(PAGES, page), `${action} : rubrique ${page} inconnue`);
      assert.match(lire(PAGES[page]), new RegExp(`"${action}"`), `${action} dans ${page}`);
    }
  });

  it("aucune longueur de texte n'est écrite en dur dans l'encart", async () => {
    const { LIVRABLES_IA, ORDRE_LIVRABLES } = await import("../src/lib/propositions.ts");
    const encart = sansCommentaires(lire("src/app/(app)/projets/[id]/proposition.tsx"));
    assert.match(encart, /maxLength=\{livrable\.longueurMax\}/);
    assert.match(encart, /rows=\{livrable\.lignes\}/);
    for (const action of ORDRE_LIVRABLES) {
      assert.ok(
        !encart.includes(String(LIVRABLES_IA[action].longueurMax)),
        `${action} : sa longueur ne doit venir que du catalogue`,
      );
    }
  });

  it("l'encart n'est rendu qu'à qui peut engager les unités du studio", () => {
    for (const chemin of Object.values(PAGES)) {
      const page = sansCommentaires(lire(chemin));
      assert.match(page, /peutDemander \? \(/, chemin);
      // Appliquer reste au porteur et aux éditeurs, administrateur compris.
      assert.match(page, /peutAppliquer=\{(peutEditer|peutAppliquer)\}/, chemin);
    }
  });

  it("une seule boucle de rafraîchissement par rubrique", () => {
    const encart = lire("src/app/(app)/projets/[id]/proposition.tsx");
    // Le minuteur vit dans le composant que la page rend une fois.
    assert.match(encart, /export function RafraichissementPropositions/);
    assert.equal(encart.match(/setInterval/g)?.length, 1);
    for (const chemin of Object.values(PAGES)) {
      const page = lire(chemin);
      assert.equal(
        page.match(/<RafraichissementPropositions/g)?.length,
        1,
        `${chemin} : un seul rafraîchissement`,
      );
    }
  });

  it("la lecture des étapes reste bornée à une ligne par livrable", () => {
    const serveur = sansCommentaires(lire("src/lib/propositions-serveur.ts"));
    assert.match(serveur, /\.limit\(1\)/);
    assert.match(serveur, /\.maybeSingle\(\)/);
    // Rien n'est lu pour qui n'a pas le droit de demander.
    assert.match(serveur, /if \(!peutDemander\) \{\s*return etapes;/);
  });
});

/*
 * Découpage technique et matériel (lot J3c-1). L'écran borne ce que la base
 * borne ; les trois tables portent les protections du storyboard ; et le
 * besoin électrique sort d'un seul module, qui ne certifie rien.
 */
describe("Découpage et matériel", () => {
  const MIGRATION = "supabase/migrations/20261005210000_decoupage_materiel.sql";
  const TABLES = ["scene_shots", "project_gear", "project_power_settings"];

  const sansCommentaires = (source) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("l'écran borne les plans et le matériel comme la base", async () => {
    const decoupage = await import("../src/lib/decoupage.ts");
    const materiel = await import("../src/lib/materiel.ts");
    const migration = lire(MIGRATION);
    const bornes = Object.fromEntries(
      [...migration.matchAll(/check \((\w+) between (\d+) and (\d+)\)/g)].map((m) => [
        m[1],
        { min: Number(m[2]), max: Number(m[3]) },
      ]),
    );

    assert.deepEqual(bornes, {
      position: { min: 1, max: 1000 },
      focal_mm: { ...decoupage.FOCALE_MM },
      duration_seconds: { ...decoupage.DUREE_PLAN_SECONDES },
      quantity: { ...materiel.QUANTITE },
      unit_power_watts: { ...materiel.PUISSANCE_WATTS },
      voltage_volts: { ...materiel.TENSION_VOLTS },
      generator_margin_percent: { ...materiel.MARGE_POURCENT },
    });
    assert.ok(
      migration.includes(`char_length(description) <= ${decoupage.DESCRIPTION_PLAN_MAX}`),
      "description d'un plan",
    );
    assert.ok(
      migration.includes(`char_length(btrim(label)) between 1 and ${materiel.DESIGNATION_MAX}`),
      "désignation d'un équipement",
    );
    // Une position au-delà de la borne de la base ferait échouer un ajout.
    assert.ok(decoupage.PLANS_PAR_SCENE_MAX <= bornes.position.max);
  });

  it("les réglages par défaut de l'écran sont ceux de la base", async () => {
    const { REGLAGES_PAR_DEFAUT } = await import("../src/lib/materiel.ts");
    const migration = lire(MIGRATION);
    assert.ok(
      migration.includes(`voltage_volts integer not null default ${REGLAGES_PAR_DEFAUT.tension}`),
    );
    assert.ok(
      migration.includes(
        `generator_margin_percent integer not null default ${REGLAGES_PAR_DEFAUT.marge}`,
      ),
    );
  });

  it("l'écran propose les angles, mouvements et catégories que la base connaît", async () => {
    const { ANGLES, MOUVEMENTS } = await import("../src/lib/decoupage.ts");
    const { CATEGORIES_MATERIEL } = await import("../src/lib/materiel.ts");
    const migration = lire(MIGRATION);
    const valeurs = (type) => {
      const liste =
        new RegExp(`create type public\\.${type} as enum \\(([^)]+)\\)`).exec(migration)?.[1] ?? "";
      return [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    };

    assert.deepEqual(Object.keys(ANGLES), valeurs("shot_angle"));
    assert.deepEqual(Object.keys(MOUVEMENTS), valeurs("shot_movement"));
    assert.deepEqual(Object.keys(CATEGORIES_MATERIEL), valeurs("gear_category"));
  });

  it("chaque table est protégée comme le storyboard : verrou, journal et droits par colonne", () => {
    const migration = lire(MIGRATION);
    const journal = lire("src/lib/journal-administration.ts");
    for (const table of TABLES) {
      assert.match(
        migration,
        new RegExp(`alter table public\\.${table} enable row level security`),
      );
      assert.match(migration, new RegExp(`on public\\.${table}\\s+as restrictive`), table);
      assert.match(
        migration,
        new RegExp(
          `create trigger ${table}_journal_admin\\s+before insert or update or delete on public\\.${table}\\s+for each row\\s+execute function public\\.journaliser_intervention_admin\\(\\)`,
        ),
        table,
      );
      assert.match(
        migration,
        new RegExp(
          `revoke all on table public\\.${table} from anon;\\s*revoke update on table public\\.${table} from authenticated;\\s*grant update \\(`,
        ),
        table,
      );
      // Sans libellé, le journal d'administration afficherait le nom de la table.
      assert.match(journal, new RegExp(`^ {2}${table}: "[^"]+",$`, "m"), table);
    }
    // La fonction de déplacement ne donne aucun droit : elle suit la RLS.
    assert.match(migration, /function public\.deplacer_plan[\s\S]*?security invoker/);
    assert.doesNotMatch(migration, /^security definer/m);
  });

  it("chaque action vérifie la session avant d'écrire, et l'auteur ne vient pas du formulaire", () => {
    for (const [chemin, attendues] of [
      ["src/app/(app)/projets/[id]/storyboard/actions.ts", 8],
      ["src/app/(app)/projets/[id]/materiel/actions.ts", 4],
    ]) {
      const source = sansCommentaires(lire(chemin));
      const corps = source.split("\nexport async function ").slice(1);
      assert.equal(corps.length, attendues, `${chemin} : lecture des actions`);
      for (const fonction of corps) {
        const nom = fonction.slice(0, fonction.indexOf("("));
        const garde = fonction.indexOf("exigerAcces(supabase)");
        const ecriture = fonction.search(/\.(insert|update|delete|rpc)\(/);
        assert.ok(garde > 0, `${nom} : garde introuvable`);
        assert.ok(ecriture > garde, `${nom} : l'écriture doit suivre la garde`);
      }
      assert.doesNotMatch(source, /formData\.get\("(created_by|project_id|owner_id)"\)/);
      assert.doesNotMatch(source, /SECRET|service_role/i);
    }
  });

  it("le besoin électrique sort du module de calcul, et l'écran dit qu'il n'est pas une norme", () => {
    const page = sansCommentaires(lire("src/app/(app)/projets/[id]/materiel/page.tsx"));
    assert.match(page, /besoinElectrique\(liste, reglages\)/);
    // Aucune arithmétique sur les puissances dans la page : un second calcul
    // finirait par diverger du premier.
    assert.doesNotMatch(page, /unit_power_watts\s*[*/+]|[*/+]\s*\w+\.unit_power_watts/);
    assert.match(page, /ne\s+sont\s+pas\s+une\s+norme/);
    assert.match(page, /chef\s+électricien/);
    assert.match(page, /sans\s+puissance\s+renseignée/);

    // Un groupe électrogène saisi avec sa puissance gonflerait le besoin :
    // l'encart et la ligne le disent, d'après la même fonction.
    assert.equal(page.match(/energieDansLaCharge/g)?.length, 3);
    assert.equal(page.match(/fournit\s+le\s+courant/g)?.length, 2);

    // Le module de calcul n'importe rien : ni base, ni modèle.
    assert.doesNotMatch(lire("src/lib/materiel-calculs.ts"), /^import /m);
  });

  it("les plans s'ajoutent à la scène sans toucher à son cadrage principal", () => {
    const actions = sansCommentaires(lire("src/app/(app)/projets/[id]/storyboard/actions.ts"));
    const plans = actions.slice(actions.indexOf("function validerPlan"));
    assert.ok(plans.length > 500, "lecture des actions des plans");
    assert.doesNotMatch(plans, /from\("storyboard_scenes"\)/);
    assert.match(plans, /rpc\("deplacer_plan"/);

    const onglets = lire("src/lib/onglets-projet.ts");
    assert.match(
      onglets,
      /\{ cle: "materiel", libelle: "Matériel", href: `\$\{base\}\/materiel` \}/,
    );
  });
});

/*
 * FRAME (lot J3c-2a) : le découpage proposé d'une scène. Le profil, la base
 * et le worker décrivent les mêmes plans ; un écart ferait refuser un dépôt
 * après un appel payé.
 */
describe("Découpage proposé par FRAME", () => {
  const MIGRATION = "supabase/migrations/20261006010000_frame_decoupage.sql";
  const corps = (fonction) => {
    const migration = lire(MIGRATION);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };

  it("la base admet l'action de FRAME, la facture au barème et exige une scène du projet", async () => {
    const { PROFILS_FIELD, PROFILS_FRAME, PROFILS_IA, PROFILS_VOICE } =
      await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const devis = corps("creer_devis");

    for (const [action, profil] of Object.entries(PROFILS_FRAME)) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`v_quantite := v_bareme.${action};`), `devis de ${action}`);
      assert.match(profil.id, /^frame\.[a-z_]+@\d+$/, action);
      assert.ok(!(action in PROFILS_IA) && !(action in PROFILS_FIELD), action);
    }
    assert.match(
      devis,
      /s\.id = \(v_parametres ->> 'scene'\)::uuid and s\.project_id = p_project_id/,
    );

    // Le devis repris garde chaque livrable déjà ouvert, et ses gardes.
    for (const action of [
      ...avantX1(PROFILS_IA),
      ...Object.keys(PROFILS_FIELD),
      ...Object.keys(PROFILS_VOICE),
    ]) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`when '${action}' then`), action);
    }
    assert.match(devis, /parametre_entier\(v_parametres, 'sequences', 1\)/);
    assert.match(devis, /public\.passage_du_scenario\(p_project_id, v_parametres\) is null/);
    assert.match(devis, /Ouvrez d''abord le budget du projet/);
  });

  it("le schéma ne connaît que les cadrages, angles et mouvements de la base", async () => {
    const { ANGLES_PLAN, CADRAGES_PLAN, MOUVEMENTS_PLAN, PROFIL_DECOUPAGE } =
      await import("../worker/src/ia/profils.ts");
    const valeurs = (fichier, type) => {
      const liste =
        new RegExp(`create type public\\.${type} as enum \\(([^)]+)\\)`).exec(lire(fichier))?.[1] ??
        "";
      return [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    };
    const J3C1 = "supabase/migrations/20261005210000_decoupage_materiel.sql";

    assert.deepEqual(
      [...CADRAGES_PLAN],
      valeurs("supabase/migrations/20260930003828_storyboard.sql", "shot_type"),
    );
    assert.deepEqual([...ANGLES_PLAN], valeurs(J3C1, "shot_angle"));
    assert.deepEqual([...MOUVEMENTS_PLAN], valeurs(J3C1, "shot_movement"));

    const plan = PROFIL_DECOUPAGE.schema.properties.lines.items;
    assert.equal(PROFIL_DECOUPAGE.schema.additionalProperties, false);
    assert.equal(plan.additionalProperties, false);
    assert.deepEqual(plan.properties.shot.enum, [...CADRAGES_PLAN]);
    assert.deepEqual(plan.properties.angle.enum, [...ANGLES_PLAN]);
    assert.deepEqual(plan.properties.movement.enum, [...MOUVEMENTS_PLAN]);
    assert.deepEqual(Object.keys(plan.properties), [
      "shot",
      "focal_mm",
      "angle",
      "movement",
      "description",
      "duration_seconds",
    ]);
    // Chaque valeur est expliquée au modèle par sa consigne.
    for (const valeur of [...CADRAGES_PLAN, ...ANGLES_PLAN, ...MOUVEMENTS_PLAN]) {
      assert.ok(PROFIL_DECOUPAGE.systeme.includes(valeur), valeur);
    }

    // Le dépôt et l'acceptation admettent exactement ces listes.
    for (const fonction of ["livrer_proposition_decoupage", "accepter_plan_propose"]) {
      const texte = corps(fonction);
      for (const liste of [CADRAGES_PLAN, ANGLES_PLAN, MOUVEMENTS_PLAN]) {
        const enBase = [
          ...(new RegExp(`in \\(\\s*('${liste[0]}'[^)]+)\\)`).exec(texte)?.[1] ?? "").matchAll(
            /'(\w+)'/g,
          ),
        ].map((m) => m[1]);
        assert.deepEqual(enBase, [...liste], `${fonction} : ${liste[0]}`);
      }
    }
  });

  it("les bornes du profil, du worker et de la base sont les mêmes", async () => {
    const { PROFIL_DECOUPAGE } = await import("../worker/src/ia/profils.ts");
    const { DESCRIPTION_PLAN_MAX, DUREE_PLAN_SECONDES, FOCALE_MM } =
      await import("../src/lib/decoupage.ts");
    const migration = lire(MIGRATION);
    const agent = lire("worker/src/agents/frame.ts");

    assert.match(
      migration,
      new RegExp(`v_nombre not between 1 and ${PROFIL_DECOUPAGE.lignesMax} then`),
    );
    assert.ok(PROFIL_DECOUPAGE.systeme.includes(String(PROFIL_DECOUPAGE.lignesMax)));

    // Table fille, dépôt, acceptation et agent : les bornes d'un plan saisi.
    assert.ok(migration.includes(`check (focal_mm between ${FOCALE_MM.min} and ${FOCALE_MM.max})`));
    assert.ok(
      migration.includes(
        `check (duration_seconds between ${DUREE_PLAN_SECONDES.min} and ${DUREE_PLAN_SECONDES.max})`,
      ),
    );
    assert.equal(
      migration.split(
        `between 1 and (case v_cle when 'focal_mm' then ${FOCALE_MM.max} else ${DUREE_PLAN_SECONDES.max} end)`,
      ).length - 1,
      2,
      "dépôt et acceptation",
    );
    assert.equal(
      migration.split(`char_length(v_description) > ${DESCRIPTION_PLAN_MAX}`).length - 1,
      1,
    );
    assert.ok(agent.includes(`const FOCALE_MAX = ${FOCALE_MM.max};`));
    assert.ok(agent.includes(`const DUREE_MAX = ${DUREE_PLAN_SECONDES.max};`));
    assert.ok(agent.includes(`const DESCRIPTION_MAX = ${DESCRIPTION_PLAN_MAX};`));
  });

  it("FRAME lit le scénario et le concept, jamais le budget ni un autre document", () => {
    const contexte = corps("contexte_decoupage");
    assert.match(contexte, /d\.project_id = v_projet\.id and d\.type = 'scenario'/);
    assert.match(contexte, /left\(d\.content, 220000\)/);
    assert.match(contexte, /'pitch', v_projet\.logline/);
    assert.match(contexte, /'artistique', v_projet\.artistic_vision/);
    assert.doesNotMatch(contexte, /budget|project_members|profiles|project_fundings/);
    // Une seule lecture de document, bornée à un seul.
    assert.equal(contexte.match(/public\.project_documents/g)?.length, 1);
    assert.match(contexte, /limit 1/);
    // Scène disparue : rien ne part.
    assert.match(contexte, /if v_projet\.id is null or v_scene\.id is null then\s+return null;/);
  });

  it("les plans proposés suivent les droits du storyboard et ne s'écrivent que par fonctions", () => {
    const migration = lire(MIGRATION);
    assert.match(
      migration,
      /on public\.ai_suggestion_shots for select\s+to authenticated\s+using \(public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(migration, /on public\.ai_suggestion_shots\s+as restrictive/);
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_shots from anon, authenticated/,
    );
    assert.match(
      corps("plan_a_decider"),
      /\(public\.mode_prive\(\) and not public\.is_admin\(\)\)\s+or not coalesce\(public\.peut_editer_contenu\(v_plan\.project_id\), false\)/,
    );
    // Écarter la proposition d'un bloc écarte aussi les plans, sans oublier
    // les lignes de budget ni les jalons.
    const ecart = corps("ecarter_lignes_restantes");
    for (const table of [
      "ai_suggestion_budget_lines",
      "ai_suggestion_milestones",
      "ai_suggestion_shots",
    ]) {
      assert.ok(ecart.includes(`update public.${table}`), table);
    }
    // Chaque fonction security definer retire ses droits nommément.
    for (const signature of [
      "contexte_decoupage(uuid)",
      "livrer_proposition_decoupage(uuid, jsonb)",
      "accepter_plan_propose(uuid, jsonb)",
      "ecarter_plan_propose(uuid)",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated`,
        ),
        signature,
      );
    }
  });

  it("le registre sert FRAME, et le barème de l'écran connaît son prix", async () => {
    const { executeursFrame } = await import("../worker/src/agents/frame.ts");
    const { PROFILS_FRAME } = await import("../worker/src/ia/profils.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursFrame({}, vide)), Object.keys(PROFILS_FRAME));
    assert.match(lire("worker/src/registre.ts"), /\.\.\.executeursFrame\(base, fournisseur\)/);

    // Sans ces deux mentions, l'administration ne publierait plus de barème
    // et la vitrine tairait le prix.
    assert.match(lire("src/lib/plans.ts"), /cle: "shot_list"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.shot_list/);
    assert.match(
      lire("src/lib/offre.ts"),
      /schedule_plan, shot_list, gear_list, research, cultural_context, treatment/,
    );
  });
});

/*
 * GEAR (lot J3c-3) : la liste de matériel proposée. Le profil, la base et le
 * worker décrivent les mêmes équipements ; un écart ferait refuser un dépôt
 * après un appel payé. Et rien, nulle part, ne laisse le modèle rendre un
 * calcul.
 */
describe("Matériel proposé par GEAR", () => {
  const MIGRATION = "supabase/migrations/20261006120000_gear_materiel.sql";
  const corps = (fonction) => {
    const migration = lire(MIGRATION);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };

  it("la base admet l'action de GEAR et la facture au barème, sans rien retirer aux autres", async () => {
    const { PROFILS_FIELD, PROFILS_FRAME, PROFILS_GEAR, PROFILS_IA, PROFILS_VOICE } =
      await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const devis = corps("creer_devis");

    for (const [action, profil] of Object.entries(PROFILS_GEAR)) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`v_quantite := v_bareme.${action};`), `devis de ${action}`);
      assert.match(profil.id, /^gear\.[a-z_]+@\d+$/, action);
    }
    for (const action of [
      ...avantX1(PROFILS_IA),
      ...Object.keys(PROFILS_FIELD),
      ...Object.keys(PROFILS_VOICE),
      ...Object.keys(PROFILS_FRAME),
    ]) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`when '${action}' then`), action);
      assert.ok(!(action in PROFILS_GEAR), action);
    }
    // Les gardes des devis déjà ouverts sont toujours là.
    assert.match(devis, /parametre_entier\(v_parametres, 'sequences', 1\)/);
    assert.match(devis, /public\.passage_du_scenario\(p_project_id, v_parametres\) is null/);
    assert.match(devis, /Ouvrez d''abord le budget du projet/);
    assert.match(devis, /Désignez la scène du storyboard à découper\./);
  });

  it("le schéma ne connaît que les catégories de la base, et aucun champ de calcul", async () => {
    const { CATEGORIES_MATERIEL, PROFIL_MATERIEL } = await import("../worker/src/ia/profils.ts");
    const { CATEGORIES_MATERIEL: ECRAN } = await import("../src/lib/materiel.ts");
    const j3c1 = lire("supabase/migrations/20261005210000_decoupage_materiel.sql");
    const enBase = [
      .../create type public\.gear_category as enum \(([^)]+)\)/.exec(j3c1)[1].matchAll(/'(\w+)'/g),
    ].map((m) => m[1]);

    assert.deepEqual([...CATEGORIES_MATERIEL], enBase);
    assert.deepEqual(Object.keys(ECRAN), enBase);

    const ligne = PROFIL_MATERIEL.schema.properties.lines.items;
    assert.equal(PROFIL_MATERIEL.schema.additionalProperties, false);
    assert.equal(ligne.additionalProperties, false);
    assert.deepEqual(ligne.properties.category.enum, enBase);
    assert.deepEqual(Object.keys(ligne.properties), [
      "category",
      "label",
      "quantity",
      "unit_power_watts",
      "simultaneous",
    ]);
    // La puissance est facultative : l'agent peut ne pas s'avancer.
    assert.deepEqual(ligne.required, ["category", "label", "quantity", "simultaneous"]);
    for (const categorie of enBase) {
      assert.ok(PROFIL_MATERIEL.systeme.includes(categorie), categorie);
    }

    // Le dépôt et l'acceptation admettent exactement cette liste.
    for (const fonction of ["livrer_proposition_materiel", "accepter_materiel_propose"]) {
      const admises = [
        ...(/in \(('image'[^)]+)\)/.exec(corps(fonction))?.[1] ?? "").matchAll(/'(\w+)'/g),
      ].map((m) => m[1]);
      assert.deepEqual(admises, enBase, fonction);
    }
  });

  it("les bornes du profil, du worker, de l'écran et de la base sont les mêmes", async () => {
    const { PROFIL_MATERIEL } = await import("../worker/src/ia/profils.ts");
    const { DESIGNATION_MAX, PUISSANCE_WATTS, QUANTITE } = await import("../src/lib/materiel.ts");
    const migration = lire(MIGRATION);
    const agent = lire("worker/src/agents/gear.ts");

    assert.match(
      migration,
      new RegExp(`v_nombre not between 1 and ${PROFIL_MATERIEL.lignesMax} then`),
    );
    assert.ok(PROFIL_MATERIEL.systeme.includes(String(PROFIL_MATERIEL.lignesMax)));

    assert.ok(
      migration.includes(`check (quantity between ${QUANTITE.min} and ${QUANTITE.max})`),
      "quantité de la table",
    );
    assert.ok(
      migration.includes(
        `check (unit_power_watts between ${PUISSANCE_WATTS.min} and ${PUISSANCE_WATTS.max})`,
      ),
      "puissance de la table",
    );
    // Dépôt et acceptation : deux fois chaque borne.
    assert.equal(
      migration.split(`::numeric between ${QUANTITE.min} and ${QUANTITE.max}`).length - 1,
      2,
    );
    assert.equal(
      migration.split(`::numeric between ${PUISSANCE_WATTS.min} and ${PUISSANCE_WATTS.max}`)
        .length - 1,
      2,
    );
    assert.equal(migration.split(`between 1 and ${DESIGNATION_MAX}`).length - 1, 3);
    assert.ok(agent.includes(`const DESIGNATION_MAX = ${DESIGNATION_MAX};`));
    assert.ok(agent.includes(`const QUANTITE_MAX = ${QUANTITE.max};`));
    assert.ok(
      agent.includes(
        `const PUISSANCE_MAX = ${PUISSANCE_WATTS.max.toLocaleString("en").replaceAll(",", "_")};`,
      ),
    );
  });

  it("GEAR lit le storyboard, le découpage et le matériel, jamais le scénario ni le budget", () => {
    const contexte = corps("contexte_materiel");
    assert.match(contexte, /from public\.storyboard_scenes s/);
    assert.match(contexte, /from public\.scene_shots p/);
    assert.match(contexte, /from public\.project_gear g/);
    assert.doesNotMatch(contexte, /project_documents|budget|project_members|profiles|fundings/);
    // Chaque lecture est bornée.
    assert.equal(contexte.match(/limit \d+/g)?.length, 3);
    // Le découpage part sans ses descriptions : seuls ses besoins techniques.
    assert.doesNotMatch(contexte, /p\.description|t\.description/);
  });

  it("le matériel proposé suit les droits du matériel et ne s'écrit que par fonctions", () => {
    const migration = lire(MIGRATION);
    assert.match(
      migration,
      /on public\.ai_suggestion_gear for select\s+to authenticated\s+using \(public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(migration, /on public\.ai_suggestion_gear\s+as restrictive/);
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_gear from anon, authenticated/,
    );
    assert.match(
      corps("materiel_a_decider"),
      /\(public\.mode_prive\(\) and not public\.is_admin\(\)\)\s+or not coalesce\(public\.peut_editer_contenu\(v_ligne\.project_id\), false\)/,
    );
    const ecart = corps("ecarter_lignes_restantes");
    for (const table of [
      "ai_suggestion_budget_lines",
      "ai_suggestion_milestones",
      "ai_suggestion_shots",
      "ai_suggestion_gear",
    ]) {
      assert.ok(ecart.includes(`update public.${table}`), table);
    }
    for (const signature of [
      "contexte_materiel(uuid)",
      "livrer_proposition_materiel(uuid, jsonb)",
      "accepter_materiel_propose(uuid, jsonb)",
      "ecarter_materiel_propose(uuid)",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated`,
        ),
        signature,
      );
    }
  });

  it("le registre sert GEAR, et le barème de l'écran connaît son prix", async () => {
    const { executeursGear } = await import("../worker/src/agents/gear.ts");
    const { PROFILS_GEAR } = await import("../worker/src/ia/profils.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursGear({}, vide)), Object.keys(PROFILS_GEAR));
    assert.match(lire("worker/src/registre.ts"), /\.\.\.executeursGear\(base, fournisseur\)/);
    assert.match(lire("src/lib/plans.ts"), /cle: "gear_list"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.gear_list/);
  });
});

/*
 * Découpage et matériel dans les exports (lot J3c-4). Deux sections de plus,
 * sans rien retirer aux autres ; et, dans un dossier, aucun calcul électrique.
 */
describe("Découpage et matériel dans les exports", () => {
  const MIGRATION = "supabase/migrations/20261006140000_exports_decoupage_materiel.sql";
  const AVANT = "supabase/migrations/20261003031944_exports_fiche.sql";
  const corps = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable dans ${fichier}`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };

  it("la reprise des deux fonctions ne retire rien : seuls deux blocs s'ajoutent", () => {
    // parametres_export : la même, à la liste des sections près.
    const sansListe = (texte) => texte.replace(/array\[[^\]]+\]/, "array[…]");
    assert.equal(
      sansListe(corps(MIGRATION, "parametres_export")),
      sansListe(corps(AVANT, "parametres_export")),
    );

    // contenu_dossier : tout l'ancien corps, puis les deux blocs, puis le retour.
    const avant = corps(AVANT, "contenu_dossier");
    const apres = corps(MIGRATION, "contenu_dossier");
    const tronc = avant.slice(0, avant.lastIndexOf("  return v_contenu;"));
    assert.ok(tronc.length > 3000, "lecture de l'ancienne définition");
    assert.ok(apres.startsWith(tronc), "l'ancien corps est repris tel quel");
    const ajout = apres.slice(tronc.length);
    assert.match(ajout, /if 'decoupage' = any \(v_sections\) then/);
    assert.match(ajout, /if 'materiel' = any \(v_sections\) then/);
    assert.ok(ajout.trimEnd().endsWith("return v_contenu;\nend;"));
  });

  it("la fonction reste sous la RLS de l'appelant, et aucun droit n'est touché", () => {
    const migration = lire(MIGRATION);
    assert.doesNotMatch(migration, /^security definer/m);
    assert.doesNotMatch(migration, /^(grant|revoke|create policy|alter table|create table)/m);
  });

  it("le dossier ne porte aucun calcul électrique : ni la base, ni le worker n'en font", () => {
    const contenu = corps(MIGRATION, "contenu_dossier");
    const materiel = contenu.slice(contenu.indexOf("if 'materiel' = any"));
    // La liste, et rien d'autre : pas de somme, pas de réglages, pas de simultanéité.
    assert.doesNotMatch(materiel, /sum\(|project_power_settings|voltage|margin|simultaneous/);
    assert.match(materiel, /'puissance', g\.unit_power_watts/);

    for (const fichier of ["worker/src/exports/dossier.ts", "worker/src/exports/archive.ts"]) {
      const source = lire(fichier);
      const debut = source.search(/function (section|feuille)Materiel/);
      assert.ok(debut >= 0, fichier);
      const fonction = source.slice(debut, source.indexOf("\n}\n", debut));
      // Aucune addition ni multiplication sur une puissance ou une quantité.
      assert.doesNotMatch(fonction, /\.reduce\(/, fichier);
      assert.doesNotMatch(fonction, /puissance[^\n]*[*+] |quantite[^\n]*\* /, fichier);
      assert.doesNotMatch(fonction, /Total|intensit|tension|marge/i, fichier);
    }
  });

  it("l'archive range chaque nouvelle section dans son classeur", () => {
    const archive = lire("worker/src/exports/archive.ts");
    assert.match(archive, /chemin: "decoupage\.xlsx"/);
    assert.match(archive, /chemin: "materiel\.xlsx"/);
    assert.match(archive, /if \(decoupage && retenues\("decoupage"\)\.length\) \{/);
    assert.match(archive, /if \(materiel && retenues\("materiel"\)\.length\) \{/);
  });

  it("la page du dossier dit ce que chaque case apporterait, et ce qui n'y entre pas", () => {
    const page = lire("src/app/(app)/projets/[id]/dossier/page.tsx");
    assert.match(page, /sans le besoin électrique/);
    assert.match(page, /sans les images/);
    // Des comptes seulement : la page ne lit ni les plans ni le matériel.
    assert.match(page, /from\("scene_shots"\)\.select\("id", \{ count: "exact", head: true \}\)/);
    assert.match(page, /from\("project_gear"\)\.select\("id", \{ count: "exact", head: true \}\)/);
  });
});

/*
 * BOARD (lot K1) : la vignette d'une scène. Un second fournisseur entre dans
 * la passerelle, et lui seul ; le style tient au profil ; le worker ne reçoit
 * aucun droit sur le stockage ; rien ne remplace une image sans acceptation.
 */
describe("Vignettes de BOARD", () => {
  const MIGRATION = "supabase/migrations/20261006160000_board_images.sql";
  const corps = (fonction) => {
    const migration = lire(MIGRATION);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };

  it("seule la passerelle parle au réseau, et vers une seule adresse d'OpenAI", () => {
    const fichiers = [...fichiersDe("worker/src"), ...fichiersDe("src")];
    assert.ok(fichiers.length > 50, "lecture du dépôt");
    const appelants = fichiers.filter((fichier) => /\bfetch\(/.test(lire(fichier)));
    assert.deepEqual(appelants, [PASSERELLE]);
    const adresses = fichiers.filter((fichier) => /api\.openai\.com/.test(lire(fichier)));
    assert.deepEqual(adresses, [PASSERELLE]);

    const passerelle = lire(PASSERELLE);
    // Deux adresses en tout : celle-ci, et celle du moteur de recherche (lot L1).
    assert.equal(passerelle.match(/https?:\/\/[^\s"'`]+/g)?.length, 2, "deux adresses, pas plus");
    assert.match(
      passerelle,
      /const ADRESSE_IMAGES_OPENAI = "https:\/\/api\.openai\.com\/v1\/images\/generations";/,
    );
    // Ni redirection suivie, ni réessai, ni clé venue de l'environnement.
    assert.match(passerelle, /redirect: "error"/);
    assert.doesNotMatch(passerelle, /process\.env/);
    assert.doesNotMatch(passerelle, /for \(|while \(|retry|réessaie/i);
    // Aucune dépendance de plus : OpenAI est appelé sans son SDK.
    const dependances = JSON.parse(lire("worker/package.json")).dependencies;
    assert.ok(!Object.keys(dependances).some((nom) => /openai/i.test(nom)));
  });

  it("le style est écrit une fois, dans le profil, et l'agent l'envoie tel quel", async () => {
    const { PROFIL_VIGNETTE, PROFILS_BOARD } = await import("../worker/src/ia/profils.ts");
    assert.deepEqual(Object.keys(PROFILS_BOARD), ["storyboard_image"]);
    assert.match(PROFIL_VIGNETTE.id, /^board\.[a-z_]+@\d+$/);
    assert.match(PROFIL_VIGNETTE.style, /encre noire sur fond blanc/);
    assert.match(PROFIL_VIGNETTE.interdits, /aucune couleur/);
    assert.match(
      PROFIL_VIGNETTE.interdits,
      /Aucun photoréalisme, aucun rendu 3D, aucune peinture numérique/,
    );

    // L'agent ne réécrit ni ne complète le style : il l'encadre autour de la scène.
    const agent = lire("worker/src/agents/board.ts");
    assert.match(agent, /return \[\s+profil\.style,/);
    assert.match(agent, /profil\.interdits,\s+\]\.join\("\\n\\n"\);/);
    assert.doesNotMatch(agent, /couleur|photoréalis|aquarelle/i);
    // Ni le modèle, ni la taille, ni la qualité ne viennent d'ailleurs que du profil.
    const passerelle = lire(PASSERELLE);
    assert.match(passerelle, /model: profil\.modele,/);
    assert.match(passerelle, /size: profil\.taille,/);
    assert.match(passerelle, /quality: profil\.qualite,/);
    assert.match(passerelle, /n: 1,/);
  });

  it("la base admet le second fournisseur et l'action, sans rien retirer aux autres", async () => {
    const { PROFILS_FIELD, PROFILS_FRAME, PROFILS_GEAR, PROFILS_IA, PROFILS_VOICE } =
      await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    assert.match(migration, /check \(provider in \('anthropic', 'openai'\)\)/);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    assert.ok(enBase.includes("storyboard_image"));

    const devis = corps("creer_devis");
    // Une image, comptée sur le quota d'images, pour une scène de ce projet.
    assert.match(
      devis,
      /when 'storyboard_image' then[\s\S]*?v_unite := 'image';\s+v_quantite := 1;[\s\S]*?s\.project_id = p_project_id/,
    );
    for (const action of [
      ...avantX1(PROFILS_IA),
      ...Object.keys(PROFILS_FIELD),
      ...Object.keys(PROFILS_VOICE),
      ...Object.keys(PROFILS_FRAME),
      ...Object.keys(PROFILS_GEAR),
    ]) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`when '${action}' then`), action);
    }
    assert.match(devis, /Désignez la scène du storyboard à découper\./);
    assert.match(devis, /public\.passage_du_scenario\(p_project_id, v_parametres\) is null/);
  });

  it("le worker ne reçoit aucun droit sur le stockage ni sur le storyboard", () => {
    const migration = lire(MIGRATION);
    const accordes = [...migration.matchAll(/^grant [^;]+ to filmfund_worker;/gm)].map((m) => m[0]);
    assert.deepEqual(accordes, [
      "grant execute on function public.contexte_image(uuid) to filmfund_worker;",
      "grant execute on function public.livrer_proposition_image(uuid, bytea) to filmfund_worker;",
    ]);
    assert.doesNotMatch(corps("livrer_proposition_image"), /storage\.|storyboard_scenes set/);
    // BOARD ne lit ni le scénario, ni le budget, ni aucun document.
    assert.doesNotMatch(
      corps("contexte_image"),
      /project_documents|budget|project_members|profiles|fundings|logline|synopsis/,
    );
  });

  it("rien ne remplace l'image d'une scène sans une acceptation, que la base vérifie", () => {
    const migration = lire(MIGRATION);
    // Le seul endroit de la migration qui écrit l'image d'une scène.
    assert.equal(migration.match(/update public\.storyboard_scenes set image_path/g)?.length, 1);
    const acceptation = corps("accepter_image_proposee");
    assert.match(acceptation, /v_image := public\.image_a_decider\(p_image_id\);/);
    assert.match(acceptation, /p_path not like v_image\.project_id::text \|\| '\/scenes\/%'/);
    assert.match(acceptation, /or p_path like '%\/\.\.\/%'/);
    assert.match(acceptation, /o\.bucket_id = 'project-images' and o\.name = p_path/);
    assert.match(acceptation, /return v_ancienne;/);
    assert.match(
      corps("image_a_decider"),
      /\(public\.mode_prive\(\) and not public\.is_admin\(\)\)\s+or not coalesce\(public\.peut_editer_contenu\(v_image\.project_id\), false\)/,
    );
    // Lue de toute l'équipe, écrite par fonctions seulement, sous le verrou du mode privé.
    assert.match(migration, /on public\.ai_suggestion_images\s+as restrictive/);
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_images from anon, authenticated/,
    );
    assert.ok(corps("ecarter_lignes_restantes").includes("update public.ai_suggestion_images"));
  });

  it("le registre sert BOARD par sa propre clé, et les bornes du fichier sont celles de la base", async () => {
    const { executeursBoard, TAILLE_MAX_IMAGE } = await import("../worker/src/agents/board.ts");
    const { PROFILS_BOARD } = await import("../worker/src/ia/profils.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursBoard({}, vide)), Object.keys(PROFILS_BOARD));

    const registre = lire("worker/src/registre.ts");
    assert.match(registre, /lireCleFournisseur\(base, "openai"\)/);
    assert.match(registre, /executeursBoard\(base, creerImages\(cleImages\)\)/);
    // La clé d'Anthropic ne sert jamais le fournisseur d'images, ni l'inverse.
    assert.doesNotMatch(registre, /creerImages\(cle\)|creer\(cleImages\)/);

    const migration = lire(MIGRATION);
    assert.equal(migration.split(`between 8 and ${TAILLE_MAX_IMAGE}`).length - 1, 2);
    assert.equal(migration.split("'\\x89504e470d0a1a0a'::bytea").length - 1, 2);
  });
});

/*
 * SCOUT (lot L1) : la recherche sourcée. Un troisième fournisseur entre dans
 * la passerelle, et lui seul ; seule la question lui parvient ; le worker ne
 * visite aucune page ; la base ne se fie ni au site ni aux renvois annoncés,
 * et aucune source ne naît vérifiée.
 */
describe("Recherche de SCOUT", () => {
  const MIGRATION = "supabase/migrations/20261006180000_scout_recherche.sql";
  const corpsDans = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable dans ${fichier}`);
    return migration.slice(debut, migration.indexOf("\n$$;", debut));
  };
  const corps = (fonction) => corpsDans(MIGRATION, fonction);

  it("seule la passerelle nomme Perplexity, à une adresse fixe, et ne lui envoie que la question", () => {
    const fichiers = [...fichiersDe("worker/src"), ...fichiersDe("src")];
    const adresses = fichiers.filter((fichier) => /api\.perplexity\.ai/.test(lire(fichier)));
    assert.deepEqual(adresses, [PASSERELLE]);

    const passerelle = lire(PASSERELLE);
    assert.match(
      passerelle,
      /const ADRESSE_RECHERCHE_PERPLEXITY = "https:\/\/api\.perplexity\.ai\/search";/,
    );
    // Le corps de la requête : la question, deux bornes du profil, et la liste
    // de sites quand le profil en porte une (GRIOT). Rien d'autre.
    assert.match(
      passerelle,
      /body: JSON\.stringify\(\{\s+query: question,\s+max_results: profil\.collecte\.resultatsMax,\s+max_tokens_per_page: profil\.collecte\.jetonsParPage,\s+\.\.\.\(profil\.collecte\.domaines\s+\? \{ search_domain_filter: \[\.\.\.profil\.collecte\.domaines\] \}\s+: \{\}\),\s+\}\),/,
    );
    assert.equal(passerelle.match(/redirect: "error"/g)?.length, 2, "aucune redirection suivie");
    // Aucune dépendance de plus : Perplexity est appelé sans SDK.
    for (const paquet of ["worker/package.json", "package.json"]) {
      const dependances = JSON.parse(lire(paquet)).dependencies ?? {};
      assert.ok(!Object.keys(dependances).some((nom) => /perplexity/i.test(nom)), paquet);
    }
  });

  it("l'agent ne transmet au moteur que la question, et ne visite aucune page", () => {
    const agent = lire("worker/src/agents/scout.ts");
    // Un seul appel au moteur, dans la collecte que SCOUT, GRIOT et MATCH
    // partagent ; la question y arrive du contexte de la tâche.
    assert.equal(agent.match(/\bmoteur\(/g)?.length, 1);
    assert.match(agent, /collecte = await moteur\(\{ profil, question \}, signal\)/);
    assert.match(
      agent,
      /await collecter\(\s+base,\s+moteur,\s+profil,\s+travail\.attemptId,\s+contexte\.question,\s+signal,\s+\)/,
    );
    assert.doesNotMatch(agent, /\bfetch\(|node:https?|node:net|node:dns|undici/);
    // La requête est inscrite avant tout tri des pages, et le modèle n'est
    // appelé qu'avec des sources.
    assert.ok(
      agent.indexOf("await confirmerRecherche(base, attemptId, { requetes: 1") > 0 &&
        agent.indexOf("await confirmerRecherche(base, attemptId, { requetes: 1") <
          agent.indexOf("const sources = retenirSources("),
    );
    assert.match(agent, /if \(sources\.length === 0\) \{\s+throw new EchecConnu\(/);
    // Le coût de la synthèse passe par la mécanique commune, pas par une copie.
    assert.match(agent, /return creerExecuteur<string>\(base, fournisseur, \{/);
    assert.doesNotMatch(agent, /provisionnerCout|confirmerCout/);
  });

  it("SCOUT demande les deux clés ; le registre ne le sert pas avec une seule", () => {
    const registre = lire("worker/src/registre.ts");
    assert.match(registre, /lireCleFournisseur\(base, "perplexity"\)/);
    // SCOUT, GRIOT et MATCH naissent ensemble, des deux clés, ou pas du tout.
    assert.match(
      registre,
      /if \(cle && cleRecherche\) \{\s+const texteDeRecherche = creer\(cle\);\s+const moteur = creerRecherche\(cleRecherche\);\s+recherche = \{\s+\.\.\.executeursScout\(base, texteDeRecherche, moteur\),\s+\.\.\.executeursGriot\(base, texteDeRecherche, moteur\),\s+\.\.\.executeursMatch\(base, texteDeRecherche, moteur\),\s+\};\s+\} else \{\s+recherche = \{\};\s+\}/,
    );
  });

  it("les fonctions reprises le sont à l'identique, à leur seul ajout près", () => {
    const BOARD = "supabase/migrations/20261006160000_board_images.sql";
    const devis = corps("creer_devis");
    const ajout = devis.slice(
      devis.indexOf("    when 'research' then"),
      devis.indexOf("    when 'treatment' then"),
    );
    assert.match(ajout, /v_quantite := v_bareme\.research;/);
    assert.match(ajout, /char_length\(btrim\(v_question\)\) not between 10 and 500/);
    assert.match(ajout, /v_question ~ '\[\[:cntrl:\]\]'/);
    assert.equal(
      devis.replace(ajout, "").replace("  v_question text;\n", ""),
      corpsDans(BOARD, "creer_devis"),
    );

    const ecarter = corps("ecarter_lignes_restantes");
    const sixieme = ecarter.slice(
      ecarter.indexOf("\n  update public.ai_suggestion_sources"),
      ecarter.indexOf("  return null;"),
    );
    assert.equal(ecarter.replace(sixieme, ""), corpsDans(BOARD, "ecarter_lignes_restantes"));

    assert.equal(
      corps("definir_cle_fournisseur").replace(", 'perplexity')", ")"),
      corpsDans(
        "supabase/migrations/20261001124014_integrations_ia.sql",
        "definir_cle_fournisseur",
      ),
    );
  });

  it("la base admet l'action sans rien retirer aux autres, et le barème en connaît le prix", async () => {
    const profils = await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    for (const action of [
      ...avantX1(profils.PROFILS_IA),
      ...Object.keys(profils.PROFILS_FIELD),
      ...Object.keys(profils.PROFILS_VOICE),
      ...Object.keys(profils.PROFILS_FRAME),
      ...Object.keys(profils.PROFILS_GEAR),
      ...Object.keys(profils.PROFILS_BOARD),
      ...Object.keys(profils.PROFILS_SCOUT),
    ]) {
      assert.ok(enBase.includes(action), action);
    }
    assert.match(migration, /add column research integer not null default 3;/);
    assert.match(lire("src/lib/plans.ts"), /cle: "research"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.research/);

    // Le profil ne demande pas plus de sources que la base n'en accepte, et
    // la synthèse tient dans une proposition.
    const depot = corps("livrer_proposition_recherche");
    const max = Number(/v_nombre not between 1 and (\d+)/.exec(depot)?.[1]);
    assert.equal(max, 20);
    assert.ok(profils.PROFIL_RECHERCHE.collecte.resultatsMax <= max);
    assert.equal(profils.PROFIL_RECHERCHE.longueurMax, 20000);
    assert.match(depot, /char_length\(v_texte\) not between 1 and 20000/);
  });

  it("le worker ne reçoit que quatre fonctions, et ne lit du projet que de quoi situer la réponse", () => {
    const migration = lire(MIGRATION);
    const accordes = [...migration.matchAll(/^grant [^;]+\s+to filmfund_worker;/gm)].map((m) =>
      m[0].replace(/\s+/g, " "),
    );
    assert.deepEqual(accordes, [
      "grant execute on function public.provisionner_recherche(uuid, text, text, integer, numeric, numeric) to filmfund_worker;",
      "grant execute on function public.confirmer_recherche(uuid, integer, numeric) to filmfund_worker;",
      "grant execute on function public.contexte_recherche(uuid) to filmfund_worker;",
      "grant execute on function public.livrer_proposition_recherche(uuid, text, jsonb) to filmfund_worker;",
    ]);
    const contexte = corps("contexte_recherche");
    assert.match(contexte, /'question', btrim\(v_job\.params ->> 'question'\)/);
    assert.doesNotMatch(
      contexte,
      /v_projet\.(title|logline|synopsis|short_synopsis|theme|stakes|artistic_vision)|project_budgets|project_documents|project_characters|profiles|project_members/,
    );
  });

  it("la base tire le site de l'adresse et relit chaque renvoi : rien n'est pris sur parole", () => {
    const depot = corps("livrer_proposition_recherche");
    assert.match(
      depot,
      /lower\(substring\(t\.source ->> 'url' from '\^https:\/\/\(\[\^\/\?#:\]\+\)'\)\)/,
    );
    assert.match(depot, /position\('\[' \|\| t\.rang \|\| '\]' in v_texte\) > 0/);
    assert.match(depot, /v_collecte\.settled_at,/);
    assert.doesNotMatch(depot, /->> 'site'|->> 'cited'|->> 'collected_at'|->> 'state'/);
    // Pas de source sans collecte servie, pas d'adresse écrite par le modèle,
    // pas de renvoi hors de la collecte.
    assert.match(depot, /where s\.attempt_id = p_attempt_id and s\.requests >= 1;/);
    assert.match(depot, /v_texte ~\* '\(https\?:\/\/\|www\\\.\)'/);
    assert.match(depot, /v_renvois = 0 or v_renvoi_min < 1 or v_renvoi_max > v_nombre/);
  });

  it("aucune source ne naît vérifiée, et rien dans ce lot n'en vérifie une", () => {
    const migration = lire(MIGRATION);
    assert.match(migration, /status text not null default 'non_verifie',/);
    assert.match(
      corps("accepter_source_proposee"),
      /v_ligne\.collected_at, 'non_verifie', v_question,/,
    );
    // « verifie » n'apparaît qu'une fois hors des commentaires : dans la
    // liste des statuts admis. Aucune fonction ne l'écrit.
    const code = migration.replace(/^\s*--.*$/gm, "");
    assert.equal(code.match(/'verifie'/g)?.length, 1);
    assert.match(
      migration,
      /grant select, delete on table public\.project_sources to authenticated;/,
    );
    // L'organisme n'est pas connu : aucune colonne ne prétend le porter.
    assert.doesNotMatch(code, /organi[sz]/i);
  });

  it("le plafond du mois refuse la requête et la synthèse ensemble, et compte les deux", () => {
    assert.match(
      corps("provisionner_recherche"),
      /public\.depense_ia_du_mois\(\) \+ p_usd \+ p_reserve_usd > v_plafond/,
    );
    const depense = corps("depense_ia_du_mois");
    assert.match(depense, /from public\.provider_charges c/);
    assert.match(depense, /from public\.provider_search_charges c/);
    const agent = lire("worker/src/agents/scout.ts");
    assert.match(agent, /reserve: enDollars\(reserve\),/);
    assert.match(agent, /jetonsSortie: profil\.jetonsMax,/);
  });
});

/*
 * GRIOT (lot L3) : le contexte historique et culturel. Aucune mécanique
 * nouvelle : l'exécuteur, les tables et les coûts sont ceux de SCOUT. Ce qui
 * le distingue tient à son profil — une liste fermée de sites, des consignes
 * d'historien —, et la base ne lui ouvre que ce qu'elle ouvrait déjà.
 */
describe("Contexte de GRIOT", () => {
  const MIGRATION = "supabase/migrations/20261006220000_griot_contexte.sql";
  const SCOUT = "supabase/migrations/20261006180000_scout_recherche.sql";
  const corpsDans = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable dans ${fichier}`);
    return migration.slice(debut, migration.indexOf("\n$$;", debut));
  };

  it("les fonctions reprises le sont à l'identique, à la seule action admise près", () => {
    const devis = corpsDans(MIGRATION, "creer_devis");
    assert.equal(
      devis
        .replace("    when 'research', 'cultural_context' then\n", "    when 'research' then\n")
        .replace(
          "      v_quantite := case p_action\n        when 'cultural_context' then v_bareme.cultural_context\n        else v_bareme.research\n      end;\n",
          "      v_quantite := v_bareme.research;\n",
        ),
      corpsDans(SCOUT, "creer_devis"),
    );
    // La même question, aux mêmes bornes, pour les deux actions.
    assert.match(
      devis,
      /when 'research', 'cultural_context' then[\s\S]*?char_length\(btrim\(v_question\)\) not between 10 and 500/,
    );

    assert.equal(
      corpsDans(MIGRATION, "contexte_recherche").replace(
        "and j.action in ('research', 'cultural_context');",
        "and j.action = 'research';",
      ),
      corpsDans(SCOUT, "contexte_recherche"),
    );
    for (const fonction of ["provisionner_recherche", "livrer_proposition_recherche"]) {
      assert.equal(
        corpsDans(MIGRATION, fonction).replace(
          "if v_job.action not in ('research', 'cultural_context') then",
          "if v_job.action <> 'research' then",
        ),
        corpsDans(SCOUT, fonction),
        fonction,
      );
    }
  });

  it("la migration n'ouvre ni table, ni droit, ni politique : seulement une action et son prix", async () => {
    const profils = await import("../worker/src/ia/profils.ts");
    const code = lire(MIGRATION).replace(/^\s*--.*$/gm, "");
    assert.doesNotMatch(
      code,
      /create table|create policy|alter policy|drop policy|disable row level/i,
    );
    assert.doesNotMatch(code, /to filmfund_worker|grant execute|revoke /i);
    assert.deepEqual(
      [...code.matchAll(/^grant [^;]+;/gm)].map((m) => m[0].replace(/\s+/g, " ")),
      [
        "grant insert (cultural_context) on table public.text_unit_rate_versions to authenticated;",
        "grant select (cultural_context) on table public.text_unit_rate_versions to anon;",
      ],
    );
    assert.match(code, /add column cultural_context integer not null default 3;/);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(code)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    for (const action of [
      ...avantX1(profils.PROFILS_IA),
      ...Object.keys(profils.PROFILS_FIELD),
      ...Object.keys(profils.PROFILS_VOICE),
      ...Object.keys(profils.PROFILS_FRAME),
      ...Object.keys(profils.PROFILS_GEAR),
      ...Object.keys(profils.PROFILS_BOARD),
      ...Object.keys(profils.PROFILS_SCOUT),
      ...Object.keys(profils.PROFILS_GRIOT),
    ]) {
      assert.ok(enBase.includes(action), action);
    }
    assert.match(lire("src/lib/plans.ts"), /cle: "cultural_context"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.cultural_context/);
  });

  it("GRIOT n'a pas d'exécuteur à lui : celui de SCOUT, avec son profil", () => {
    const agent = lire("worker/src/agents/scout.ts");
    assert.match(
      agent,
      /Object\.entries\(PROFILS_GRIOT\)\.map\(\(\[action, profil\]\) => \[\s+action,\s+executeurRecherche\(base, fournisseur, moteur, profil\),\s+\]\)/,
    );
    assert.equal(agent.match(/function executeurRecherche\(/g)?.length, 1);
    // Ce que le moteur rend est recontrôlé contre la liste du profil.
    assert.match(
      agent,
      /retenirSources\(\s+collecte\.resultats,\s+profil\.collecte\.resultatsMax,\s+profil\.collecte\.domaines,\s+\)/,
    );
    assert.match(
      agent,
      /if \(domaines && !hoteAdmis\(new URL\(url\)\.hostname, domaines\)\) \{\s+continue;/,
    );
    assert.match(agent, /net === domaine \|\| net\.endsWith\(`\.\$\{domaine\}`\)/);
    // Aucun fichier d'agent de plus, aucune adresse de plus.
    assert.ok(!fichiersDe("worker/src/agents").some((fichier) => /griot/i.test(fichier)));
    assert.equal(lire(PASSERELLE).match(/https?:\/\/[^\s"'`]+/g)?.length, 2);
  });

  it("la liste des sites vit dans le profil ; ni la base, ni le navigateur ne la choisissent", () => {
    const code = lire(MIGRATION).replace(/^\s*--.*$/gm, "");
    assert.doesNotMatch(code, /persee|openedition|domaine|search_domain/i);
    for (const fichier of fichiersDe("src/app")) {
      assert.doesNotMatch(lire(fichier), /search_domain_filter|DOMAINES_CONTEXTE/, fichier);
    }
    const actions = lire("src/app/(app)/projets/[id]/recherche/actions-ia.ts");
    assert.doesNotMatch(actions.replace(/\/\*[\s\S]*?\*\//g, ""), /domaines|persee/i);
  });
});

/*
 * MATCH (lot L6a) : la veille des opportunités. Aucune collecte de plus,
 * aucune adresse de plus : celle de SCOUT. Ce qui lui est propre : une tâche
 * de l'administration, sans projet ni réservation, et un relevé dont
 * l'adresse et l'extrait viennent de la page, jamais du modèle. Rien de ce
 * qu'il propose ne naît vérifié.
 */
describe("Veille de MATCH", () => {
  const MIGRATION = "supabase/migrations/20261007120000_match_veille.sql";
  const corpsDans = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable dans ${fichier}`);
    return migration.slice(debut, migration.indexOf("\n$$;", debut));
  };
  const corps = (fonction) => corpsDans(MIGRATION, fonction);
  const sansCommentaires = (source) => source.replace(/^\s*--.*$/gm, "");

  it("MATCH n'a ni collecte ni appel à lui : ceux de SCOUT et de la mécanique commune", () => {
    const agent = lire("worker/src/agents/match.ts");
    assert.match(agent, /import \{ collecter \} from "\.\/scout\.ts";/);
    assert.match(
      agent,
      /await collecter\(\s+base,\s+moteur,\s+profil,\s+travail\.attemptId,\s+contexte\.question,\s+signal,\s+\)/,
    );
    assert.match(agent, /return creerExecuteur<OpportuniteRelevee\[\]>\(base, fournisseur, \{/);
    assert.doesNotMatch(agent, /\bmoteur\(/);
    assert.doesNotMatch(
      agent,
      /provisionnerCout|confirmerCout|provisionnerRecherche|confirmerRecherche/,
    );
    assert.doesNotMatch(agent, /\bfetch\(|node:https?|node:net|node:dns|undici/);
    // Aucune adresse de plus dans la passerelle.
    assert.equal(lire(PASSERELLE).match(/https?:\/\/[^\s"'`]+/g)?.length, 2);
    // Le message du modèle ne porte que la recherche et les pages.
    assert.doesNotMatch(agent, /projet\.|lireContexteRecherche|contexte_recherche/);
  });

  it("le profil ne demande pas plus que la base n'accepte, et ses catégories sont les siennes", async () => {
    const { CATEGORIES_OPPORTUNITE, PROFIL_VEILLE, PROFILS_MATCH } =
      await import("../worker/src/ia/profils.ts");
    const { executeursMatch } = await import("../worker/src/agents/match.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursMatch({}, vide, vide)), Object.keys(PROFILS_MATCH));

    const depot = corps("livrer_proposition_veille");
    assert.equal(
      Number(/if v_nombre > (\d+) then/.exec(depot)?.[1]),
      PROFIL_VEILLE.opportunitesMax,
    );
    assert.ok(
      PROFIL_VEILLE.collecte.resultatsMax <=
        Number(/v_pages not between 1 and (\d+)/.exec(depot)?.[1]),
    );

    const migration = lire(MIGRATION);
    const liste =
      /constraint opportunite_proposee_categorie check \(\s*category in \(([^)]+)\)/.exec(
        migration,
      )?.[1] ?? "";
    assert.deepEqual(
      [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]),
      [...CATEGORIES_OPPORTUNITE],
    );
    // Les bornes du worker sont celles de la base.
    const agent = lire("worker/src/agents/match.ts");
    assert.match(agent, /const NOM_MAX = 200;/);
    assert.match(agent, /const RESUME_MAX = 1500;/);
    assert.match(depot, /char_length\(btrim\(v_element ->> 'name'\)\) between 1 and 200/);
    assert.match(depot, /char_length\(btrim\(v_element ->> 'summary'\)\) between 1 and 1500/);
  });

  it("la provenance vient de la page désignée, et rien n'entre au catalogue vérifié", () => {
    const depot = sansCommentaires(corps("livrer_proposition_veille"));
    // L'adresse, le titre, l'extrait et la date sont lus dans la collecte.
    assert.match(
      depot,
      /s\.source ->> 'url',\s+btrim\(s\.source ->> 'title'\),\s+btrim\(s\.source ->> 'excerpt'\),\s+\(s\.source ->> 'published_on'\)::date,\s+v_collecte\.settled_at/,
    );
    assert.match(depot, /on s\.rang = \(t\.opportunite ->> 'source'\)::integer/);
    assert.doesNotMatch(depot, /t\.opportunite ->> '(url|source_url|excerpt|title)'/);
    // Pas de dépôt sans les deux coûts.
    assert.match(depot, /from public\.provider_charges c where c\.attempt_id = p_attempt_id/);
    assert.match(depot, /where s\.attempt_id = p_attempt_id and s\.requests >= 1/);

    const acceptation = sansCommentaires(corps("accepter_opportunite_proposee"));
    assert.match(acceptation, /v_ligne\.source_excerpt, 'non_verifie'\s+\)/);
    assert.doesNotMatch(acceptation, /'verifie'/);
    // Ni montant, ni date limite, ni pays n'entrent par la veille.
    assert.match(
      acceptation,
      /insert into public\.funding_opportunities \(\s+name, organization, category, description, source_url, collected_on, source_excerpt, status\s+\)/,
    );
    // La provenance ne se corrige pas à l'acceptation.
    assert.match(
      lire(MIGRATION),
      /create or replace function public\.accepter_opportunite_proposee\(\s+p_line_id uuid,\s+p_name text default null,\s+p_organization text default null,\s+p_category text default null\s+\)/,
    );
    for (const fonction of ["accepter_opportunite_proposee", "ecarter_opportunite_proposee"]) {
      assert.match(corps(fonction), /v_ligne := public\.opportunite_a_decider\(p_line_id\);/);
    }
    assert.match(
      sansCommentaires(corps("opportunite_a_decider")),
      /\(select auth\.uid\(\)\) is null or not public\.is_admin\(\)/,
    );
  });

  it("une veille est une tâche de l'administration : ni devis, ni réservation, ni projet", () => {
    const migration = sansCommentaires(lire(MIGRATION));
    const demande = sansCommentaires(corps("demander_veille"));
    assert.ok(
      demande.indexOf("not public.is_admin()") < demande.indexOf("insert into public.jobs"),
      "le rôle est vérifié avant toute écriture",
    );
    assert.match(demande, /insert into public\.jobs \(action, params, created_by\)/);
    assert.match(demande, /perform public\.journaliser\(\s+'veille_opportunites',/);
    assert.doesNotMatch(demande, /creer_devis|reservations|quotes/);
    // L'action n'entre pas aux devis : aucun compte ne l'engage sur un projet.
    assert.doesNotMatch(migration, /devis_action_connue/);
    assert.doesNotMatch(migration, /text_unit_rate_versions/);
    assert.match(
      migration,
      /\(reservation_id is null and studio_id is null and project_id is null\)\s+= \(action = 'opportunity_watch'\)/,
    );
    // Le worker revérifie le rôle de l'auteur, à la réclamation et au contexte.
    for (const fonction of ["reclamer_travail", "contexte_veille"]) {
      assert.match(
        corps(fonction),
        /select 1 from public\.profiles pr where pr\.id = v_job\.created_by and pr\.role = 'admin'/,
        fonction,
      );
    }
    // Aucune route ni composant ne nomme l'action hors de l'administration :
    // seuls son catalogue de libellés, celui des statistiques de
    // l'administration (lot Z3), et les types générés la connaissent.
    const ailleurs = fichiersDe("src").filter(
      (fichier) =>
        /opportunity_watch|demander_veille/.test(lire(fichier)) &&
        !fichier.includes("administration") &&
        !fichier.endsWith("lib/opportunites.ts") &&
        !fichier.endsWith("lib/statistiques.ts") &&
        !fichier.endsWith("database.types.ts"),
    );
    assert.deepEqual(ailleurs, []);
    // Les statistiques ne font que la nommer, et ne servent que l'administration.
    assert.doesNotMatch(lire("src/lib/statistiques.ts"), /demander_veille|\.rpc\(|^import /m);
    const lecteurs = fichiersDe("src").filter((fichier) =>
      /from "@\/lib\/statistiques"/.test(lire(fichier)),
    );
    assert.deepEqual(
      lecteurs.map((fichier) => fichier.replaceAll("\\", "/")),
      ["src/app/(app)/administration/statistiques/page.tsx"],
    );
  });

  it("les fonctions reprises le sont à l'identique, à leur seul ajout près", () => {
    const TACHES = "supabase/migrations/20261001061231_taches.sql";
    const net = (source) => sansCommentaires(source).replace(/\s+/g, " ").trim();

    assert.equal(
      net(corps("clore_travail")).replace(
        "if p_job.reservation_id is not null then perform public.regler_reservation( p_job.reservation_id, coalesce(p_consumed, case when p_state = 'succeeded' then v_quantite else 0 end) ); end if;",
        "perform public.regler_reservation( p_job.reservation_id, coalesce(p_consumed, case when p_state = 'succeeded' then v_quantite else 0 end) );",
      ),
      net(corpsDans(TACHES, "clore_travail")),
    );
    assert.equal(
      net(corps("reclamer_travail")).replace(
        "if v_job.project_id is null then if exists ( select 1 from public.profiles pr where pr.id = v_job.created_by and pr.role = 'admin' ) then exit; end if; elsif public.peut_engager_unites_pour(v_job.created_by, v_job.project_id) then exit; end if;",
        "if public.peut_engager_unites_pour(v_job.created_by, v_job.project_id) then exit; end if;",
      ),
      net(corpsDans("supabase/migrations/20261001072243_worker_connexion.sql", "reclamer_travail")),
    );
    assert.equal(
      net(corps("provisionner_recherche")).replace(
        "('research', 'cultural_context', 'opportunity_watch')",
        "('research', 'cultural_context')",
      ),
      net(
        corpsDans(
          "supabase/migrations/20261006220000_griot_contexte.sql",
          "provisionner_recherche",
        ),
      ),
    );
    assert.equal(
      net(corps("ecarter_lignes_restantes")).replace(
        " update public.ai_suggestion_opportunities set state = 'dismissed', decided_by = new.decided_by, decided_at = new.decided_at where suggestion_id = new.id and state = 'proposed';",
        "",
      ),
      net(
        corpsDans(
          "supabase/migrations/20261006180000_scout_recherche.sql",
          "ecarter_lignes_restantes",
        ),
      ),
    );
  });
});

/*
 * ARC (lot X2a) : les personnages proposés. Le profil, la base, le worker et
 * l'écran décrivent les mêmes personnages ; un écart ferait refuser un dépôt
 * après un appel payé. Et aucun chemin ne réécrit un personnage existant.
 */
describe("Personnages proposés par ARC", () => {
  const MIGRATION = "supabase/migrations/20261007230000_arc_personnages.sql";
  const X1 = "supabase/migrations/20261007210000_weaver_realisation_pitch.sql";
  const VEILLE = "supabase/migrations/20261007120000_match_veille.sql";
  const FICHE = "supabase/migrations/20261003010956_fiche_projet.sql";
  const corpsDans = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };
  const corps = (fonction) => corpsDans(MIGRATION, fonction);

  it("la base admet l'action d'ARC et la facture au barème, sans rien retirer aux autres", async () => {
    const profils = await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const devis = corps("creer_devis");

    for (const [action, profil] of Object.entries(profils.PROFILS_ARC_PERSONNAGES)) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`v_quantite := v_bareme.${action};`), `devis de ${action}`);
      assert.match(profil.id, /^arc\.[a-z_]+@\d+$/, action);
      assert.ok(!(action in profils.PROFILS_ARC), action);
    }
    for (const action of [
      ...Object.keys(profils.PROFILS_IA),
      ...Object.keys(profils.PROFILS_FIELD),
      ...Object.keys(profils.PROFILS_VOICE),
      ...Object.keys(profils.PROFILS_FRAME),
      ...Object.keys(profils.PROFILS_GEAR),
      ...Object.keys(profils.PROFILS_BOARD),
      ...Object.keys(profils.PROFILS_SCOUT),
      ...Object.keys(profils.PROFILS_GRIOT),
    ]) {
      assert.ok(enBase.includes(action), action);
      assert.ok(
        devis
          .split("\n")
          .some((ligne) => /^\s+when '/.test(ligne) && ligne.includes(`'${action}'`)),
        `devis de ${action}`,
      );
    }
    assert.match(migration, /add column character_list integer not null default 3;/);
    assert.match(migration, /alter column character_list drop default;/);
  });

  it("creer_devis n'a changé que d'un cas, et l'écartement que d'une table", () => {
    // Retirer le cas ajouté doit rendre, au mot près, la fonction du lot X1.
    const ajout =
      /    when 'character_list' then\n(?: {6}.*\n)+? {6}v_quantite := v_bareme\.character_list;\n/;
    const devis = corps("creer_devis");
    assert.match(devis, ajout);
    assert.equal(devis.replace(ajout, ""), corpsDans(X1, "creer_devis"));

    const huitieme =
      /\n\n {2}update public\.ai_suggestion_characters\n {2}set state = 'dismissed', decided_by = new\.decided_by, decided_at = new\.decided_at\n {2}where suggestion_id = new\.id and state = 'proposed';/;
    const ecart = corps("ecarter_lignes_restantes");
    assert.match(ecart, huitieme);
    assert.equal(ecart.replace(huitieme, ""), corpsDans(VEILLE, "ecarter_lignes_restantes"));
  });

  it("le schéma ne connaît que les rôles de la base, et les trois champs d'un personnage", async () => {
    const { PROFIL_PERSONNAGES, ROLES_PERSONNAGE } = await import("../worker/src/ia/profils.ts");
    const { ROLES_PERSONNAGE: ECRAN } = await import("../src/lib/fiche.ts");
    const enBase = [
      .../constraint personnage_role check \(role in \(([^)]+)\)\)/
        .exec(lire(FICHE))[1]
        .matchAll(/'(\w+)'/g),
    ].map((m) => m[1]);

    assert.deepEqual([...ROLES_PERSONNAGE], enBase);
    assert.deepEqual(Object.keys(ECRAN), enBase);

    const ligne = PROFIL_PERSONNAGES.schema.properties.lines.items;
    assert.equal(PROFIL_PERSONNAGES.schema.additionalProperties, false);
    assert.equal(ligne.additionalProperties, false);
    assert.deepEqual(ligne.properties.role.enum, enBase);
    assert.deepEqual(Object.keys(ligne.properties), ["name", "role", "description"]);
    assert.deepEqual(ligne.required, ["name", "role", "description"]);
    for (const role of enBase) {
      assert.ok(PROFIL_PERSONNAGES.systeme.includes(role), role);
    }

    // La table, le dépôt et l'acceptation admettent exactement cette liste.
    const listes = [...lire(MIGRATION).matchAll(/in \(('principal'[^)]+)\)/g)].map((m) =>
      [...m[1].matchAll(/'(\w+)'/g)].map((r) => r[1]),
    );
    assert.equal(listes.length, 3);
    for (const admis of listes) {
      assert.deepEqual(admis, enBase);
    }
  });

  it("les bornes du profil, du worker, de l'écran et de la base sont les mêmes", async () => {
    const { PROFIL_PERSONNAGES } = await import("../worker/src/ia/profils.ts");
    const { LIVRABLE_PERSONNAGES } = await import("../src/lib/propositions.ts");
    const { MAX_PERSONNAGES } = await import("../src/lib/fiche.ts");
    const migration = lire(MIGRATION);
    const fiche = lire(FICHE);
    const agent = lire("worker/src/agents/arc.ts");

    assert.equal(LIVRABLE_PERSONNAGES.lignesMax, PROFIL_PERSONNAGES.lignesMax);
    assert.equal(LIVRABLE_PERSONNAGES.action, "character_list");
    assert.match(
      migration,
      new RegExp(`v_nombre not between 1 and ${PROFIL_PERSONNAGES.lignesMax} then`),
    );
    assert.ok(PROFIL_PERSONNAGES.systeme.includes(String(PROFIL_PERSONNAGES.lignesMax)));

    // Le nom et la description d'un personnage proposé tiennent dans ceux
    // d'un personnage : mêmes longueurs, à la table, au dépôt, à l'acceptation.
    const nomMax = Number(/char_length\(btrim\(name\)\) between 1 and (\d+)/.exec(fiche)[1]);
    const descriptionMax = Number(/char_length\(description\) <= (\d+)/.exec(fiche)[1]);
    const fois = (borne) =>
      migration.match(new RegExp(`between 1 and ${borne}(?!\\d)`, "g"))?.length ?? 0;
    assert.equal(fois(nomMax), 3);
    assert.equal(fois(descriptionMax), 2);
    assert.ok(migration.includes(`char_length(v_retenu ->> 'description') <= ${descriptionMax}`));
    assert.ok(agent.includes(`const NOM_MAX = ${nomMax};`));
    assert.ok(agent.includes(`const DESCRIPTION_MAX = ${descriptionMax};`));
    assert.ok(PROFIL_PERSONNAGES.systeme.includes(`${nomMax} caractères`));
    assert.ok(PROFIL_PERSONNAGES.systeme.includes(`jamais plus de ${descriptionMax}`));

    // Cinquante personnages : la borne de l'écran, tenue par la base à
    // l'acceptation, au devis, et dans la lecture du contexte.
    assert.equal(MAX_PERSONNAGES, 50);
    assert.ok(
      corps("accepter_personnage_propose").includes(`if v_nombre >= ${MAX_PERSONNAGES} then`),
    );
    assert.match(corps("creer_devis"), new RegExp(`\\) >= ${MAX_PERSONNAGES} then`));
    assert.ok(corps("contexte_personnages").includes(`limit ${MAX_PERSONNAGES}`));
  });

  it("ARC lit le concept et les personnages saisis, jamais un document ni le budget", () => {
    const contexte = corps("contexte_personnages");
    assert.match(contexte, /from public\.project_characters c/);
    assert.match(contexte, /and j\.action = 'character_list'/);
    assert.doesNotMatch(
      contexte,
      /project_documents|budget|project_members|profiles|fundings|storyboard|scene_shots/,
    );
    assert.equal(contexte.match(/limit \d+/g)?.length, 1);
  });

  it("aucun chemin ne réécrit un personnage existant", () => {
    const migration = lire(MIGRATION);
    assert.doesNotMatch(
      migration,
      /update public\.project_characters|delete from public\.project_characters/,
    );
    assert.equal(migration.split("insert into public.project_characters").length - 1, 1);
    // Le personnage accepté prend la dernière place.
    assert.match(corps("accepter_personnage_propose"), /coalesce\(max\(c\.position\), -1\) \+ 1/);
    assert.match(lire("worker/src/ia/profils.ts"), /Tu ne modifies aucun personnage existant/);
  });

  it("les personnages proposés suivent les droits des personnages et ne s'écrivent que par fonctions", () => {
    const migration = lire(MIGRATION);
    assert.match(
      migration,
      /on public\.ai_suggestion_characters for select\s+to authenticated\s+using \(public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(migration, /on public\.ai_suggestion_characters\s+as restrictive/);
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_characters from anon, authenticated/,
    );
    assert.match(
      corps("personnage_a_decider"),
      /\(public\.mode_prive\(\) and not public\.is_admin\(\)\)\s+or not coalesce\(public\.peut_editer_contenu\(v_ligne\.project_id\), false\)/,
    );
    // PostgreSQL tronque un nom au-delà de 63 octets : deux politiques
    // finiraient par porter le même.
    for (const [, nom] of migration.matchAll(/create policy "([^"]+)"/g)) {
      assert.ok(Buffer.byteLength(nom) <= 63, nom);
    }
    const accordes = [...migration.matchAll(/^grant [^;]+ to filmfund_worker;/gm)].map((m) => m[0]);
    assert.deepEqual(accordes, [
      "grant execute on function public.contexte_personnages(uuid) to filmfund_worker;",
      "grant execute on function public.livrer_proposition_personnages(uuid, jsonb) to filmfund_worker;",
    ]);
    for (const signature of [
      "controler_personnage_propose()",
      "contexte_personnages(uuid)",
      "livrer_proposition_personnages(uuid, jsonb)",
      "clore_proposition_personnages(uuid)",
      "personnage_a_decider(uuid)",
      "accepter_personnage_propose(uuid, jsonb)",
      "ecarter_personnage_propose(uuid)",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated`,
        ),
        signature,
      );
    }
  });

  it("le registre sert ARC, et le barème de l'écran connaît son prix", async () => {
    const { executeursArc } = await import("../worker/src/agents/arc.ts");
    const { PROFILS_ARC, PROFILS_ARC_PERSONNAGES } = await import("../worker/src/ia/profils.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursArc({}, vide)), [
      ...Object.keys(PROFILS_ARC),
      ...Object.keys(PROFILS_ARC_PERSONNAGES),
    ]);
    assert.match(lire("worker/src/registre.ts"), /\.\.\.executeursArc\(base, fournisseur\)/);
    assert.match(lire("src/lib/plans.ts"), /cle: "character_list"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.character_list/);
    assert.match(
      lire("src/lib/offre.ts"),
      /dramatic_analysis, character_list, episode_list, budget_plan/,
    );
  });
});

/*
 * SCRIPT (lot SE2a) : les épisodes proposés. Le profil, la base, le worker et
 * l'écran décrivent les mêmes épisodes ; un écart ferait refuser un dépôt
 * après un appel payé. Et aucun chemin ne réécrit un épisode existant.
 */
describe("Épisodes proposés par SCRIPT", () => {
  const MIGRATION = "supabase/migrations/20261009180000_script_episodes.sql";
  const RETOUCHES = "supabase/migrations/20261008180000_weaver_retouches.sql";
  const PERSONNAGES = "supabase/migrations/20261007230000_arc_personnages.sql";
  const EPISODES = "supabase/migrations/20261009120000_episodes.sql";
  const corpsDans = (fichier, fonction) => {
    const migration = lire(fichier);
    const debut = migration.indexOf(`create or replace function public.${fonction}(`);
    assert.ok(debut >= 0, `${fonction} introuvable`);
    return migration.slice(debut, migration.indexOf("$$;", debut));
  };
  const corps = (fonction) => corpsDans(MIGRATION, fonction);

  it("la base admet l'action de SCRIPT et la facture au barème, sans rien retirer aux autres", async () => {
    const profils = await import("../worker/src/ia/profils.ts");
    const migration = lire(MIGRATION);
    const liste = /devis_action_connue check \(\s*action in \(([^)]+)\)/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    const avant = [
      .../devis_action_connue check \(\s*action in \(([^)]+)\)/
        .exec(lire(RETOUCHES))[1]
        .matchAll(/'(\w+)'/g),
    ].map((m) => m[1]);
    const devis = corps("creer_devis");

    for (const [action, profil] of Object.entries(profils.PROFILS_SCRIPT_EPISODES)) {
      assert.ok(enBase.includes(action), action);
      assert.ok(devis.includes(`v_quantite := v_bareme.${action};`), `devis de ${action}`);
      assert.match(profil.id, /^script\.[a-z_]+@\d+$/, action);
      assert.ok(!(action in profils.PROFILS_SCRIPT), action);
      assert.ok(!(action in profils.PROFILS_IA), action);
    }
    // Une action de plus, et les autres dans le même ordre.
    assert.deepEqual(
      enBase.filter((action) => action !== "episode_list"),
      avant,
    );
    assert.equal(enBase.length, avant.length + 1);
    assert.match(migration, /add column episode_list integer not null default 3;/);
    assert.match(migration, /alter column episode_list drop default;/);
    assert.match(
      migration,
      /grant insert \(episode_list\) on table public\.text_unit_rate_versions to authenticated;/,
    );
    assert.match(
      migration,
      /grant select \(episode_list\) on table public\.text_unit_rate_versions to anon;/,
    );
  });

  it("creer_devis n'a changé que d'un cas, le barème que d'une colonne, l'écartement que d'une table", () => {
    // Retirer le cas ajouté doit rendre, au mot près, la fonction du lot RT1.
    const ajout =
      /    when 'episode_list' then\n(?: {6}.*\n)+? {6}v_quantite := v_bareme\.episode_list;\n/;
    const devis = corps("creer_devis");
    assert.match(devis, ajout);
    assert.equal(devis.replace(ajout, ""), corpsDans(RETOUCHES, "creer_devis"));

    const contrainte = (fichier) =>
      /add constraint bareme_poids_positifs check \(([\s\S]*?)\n {2}\);/.exec(lire(fichier))[1];
    assert.equal(
      contrainte(MIGRATION).replace("    and episode_list >= 0\n", ""),
      contrainte(RETOUCHES),
    );

    const neuvieme =
      /\n\n {2}update public\.ai_suggestion_episodes\n {2}set state = 'dismissed', decided_by = new\.decided_by, decided_at = new\.decided_at\n {2}where suggestion_id = new\.id and state = 'proposed';/;
    const ecart = corps("ecarter_lignes_restantes");
    assert.match(ecart, neuvieme);
    assert.equal(ecart.replace(neuvieme, ""), corpsDans(PERSONNAGES, "ecarter_lignes_restantes"));
  });

  it("le schéma ne connaît que le titre et le résumé : ni numéro, ni durée", async () => {
    const { PROFIL_EPISODES } = await import("../worker/src/ia/profils.ts");
    const ligne = PROFIL_EPISODES.schema.properties.lines.items;
    assert.equal(PROFIL_EPISODES.schema.additionalProperties, false);
    assert.equal(ligne.additionalProperties, false);
    assert.deepEqual(Object.keys(ligne.properties), ["title", "summary"]);
    assert.deepEqual(ligne.required, ["title", "summary"]);
    assert.match(PROFIL_EPISODES.systeme, /Ne numérote pas les épisodes/);
    assert.match(PROFIL_EPISODES.systeme, /Ne propose aucune durée/);
    // La table non plus : le numéro naît à l'acceptation, la durée à la saisie.
    const table = /create table public\.ai_suggestion_episodes \(([\s\S]*?)\n\);/.exec(
      lire(MIGRATION),
    )[1];
    assert.doesNotMatch(table, /\bnumber\b|duration/);
  });

  it("les bornes du profil, du worker, de l'écran et de la base sont les mêmes", async () => {
    const { PROFIL_EPISODES } = await import("../worker/src/ia/profils.ts");
    const { LIVRABLE_EPISODES } = await import("../src/lib/propositions.ts");
    const { LONGUEURS_EPISODE, NUMERO_EPISODE } = await import("../src/lib/episodes.ts");
    const migration = lire(MIGRATION);
    const agent = lire("worker/src/agents/script.ts");

    assert.equal(LIVRABLE_EPISODES.lignesMax, PROFIL_EPISODES.lignesMax);
    assert.equal(LIVRABLE_EPISODES.action, "episode_list");
    assert.match(
      migration,
      new RegExp(`v_nombre not between 1 and ${PROFIL_EPISODES.lignesMax} then`),
    );
    assert.ok(PROFIL_EPISODES.systeme.includes(String(PROFIL_EPISODES.lignesMax)));

    // Le titre et le résumé d'un épisode proposé tiennent dans ceux d'un
    // épisode : mêmes longueurs, à la table, au dépôt, à l'acceptation.
    const fois = (borne) =>
      migration.match(new RegExp(`between 1 and ${borne}(?!\\d)`, "g"))?.length ?? 0;
    assert.equal(fois(LONGUEURS_EPISODE.title), 3);
    assert.equal(fois(LONGUEURS_EPISODE.summary), 2);
    assert.ok(
      migration.includes(`char_length(v_retenu ->> 'summary') <= ${LONGUEURS_EPISODE.summary}`),
    );
    assert.ok(agent.includes(`const TITRE_MAX = ${LONGUEURS_EPISODE.title};`));
    assert.ok(agent.includes(`const RESUME_MAX = ${LONGUEURS_EPISODE.summary};`));
    assert.ok(PROFIL_EPISODES.systeme.includes(`${LONGUEURS_EPISODE.title} caractères`));
    assert.ok(PROFIL_EPISODES.systeme.includes(`jamais plus de ${LONGUEURS_EPISODE.summary}`));

    // Le dernier numéro d'une saison : la borne de l'écran et de la table,
    // tenue par la base à l'acceptation et au devis.
    assert.match(lire(EPISODES), new RegExp(`number between 1 and ${NUMERO_EPISODE.max}\\)`));
    assert.ok(
      corps("accepter_episode_propose").includes(`if v_numero > ${NUMERO_EPISODE.max} then`),
    );
    assert.match(corps("creer_devis"), new RegExp(`\\) >= ${NUMERO_EPISODE.max} then`));
  });

  it("SCRIPT lit le concept, les personnages, les épisodes et la bible, jamais le scénario ni le budget", () => {
    const contexte = corps("contexte_episodes");
    assert.match(contexte, /and j\.action = 'episode_list'/);
    assert.match(contexte, /from public\.project_characters c/);
    assert.match(contexte, /from public\.project_episodes e/);
    // Un seul type de document part : la bible.
    assert.equal(contexte.match(/public\.project_documents/g).length, 1);
    assert.match(contexte, /where d\.project_id = v_projet\.id and d\.type = 'bible'/);
    assert.doesNotMatch(
      contexte,
      /budget|project_members|profiles|fundings|storyboard|scene_shots|scenario/,
    );
    // Trois lectures bornées : les personnages, les épisodes, la bible.
    assert.deepEqual(contexte.match(/limit \d+/g), ["limit 50", "limit 100", "limit 1"]);
    assert.match(contexte, /left\(d\.content, 20000\)/);
  });

  it("le contexte part dans l'ordre du dépôt : la donnée, puis l'objectif", () => {
    const agent = lire("worker/src/agents/script.ts");
    const rangs = [
      '"<projet>"',
      '"<contexte>"',
      '"<personnages>"',
      '"<episodes_deja_saisis>"',
      '"<vision>"',
      '"<bible_de_serie>"',
      "return [...blocs, objectif]",
    ].map((repere) => agent.indexOf(repere));
    assert.ok(
      rangs.every((rang, i) => rang >= 0 && (i === 0 || rang > rangs[i - 1])),
      rangs.join(", "),
    );
  });

  it("aucun chemin ne réécrit un épisode existant", () => {
    const migration = lire(MIGRATION);
    assert.doesNotMatch(
      migration,
      /update public\.project_episodes|delete from public\.project_episodes/,
    );
    assert.equal(migration.split("insert into public.project_episodes").length - 1, 1);
    // L'épisode accepté prend le numéro qui suit le plus grand.
    assert.match(corps("accepter_episode_propose"), /coalesce\(max\(e\.number\), 0\) \+ 1/);
    assert.match(lire("worker/src/ia/profils.ts"), /Tu ne modifies aucun épisode existant/);
  });

  it("les épisodes proposés suivent les droits des épisodes et ne s'écrivent que par fonctions", () => {
    const migration = lire(MIGRATION);
    assert.match(
      migration,
      /on public\.ai_suggestion_episodes for select\s+to authenticated\s+using \(public\.acces_au_projet\(project_id\) is not null or \(select public\.is_admin\(\)\)\)/,
    );
    assert.match(migration, /on public\.ai_suggestion_episodes\s+as restrictive/);
    assert.match(
      migration,
      /revoke all on table public\.ai_suggestion_episodes from anon, authenticated/,
    );
    assert.match(
      corps("episode_a_decider"),
      /\(public\.mode_prive\(\) and not public\.is_admin\(\)\)\s+or not coalesce\(public\.peut_editer_contenu\(v_ligne\.project_id\), false\)/,
    );
    for (const [, nom] of migration.matchAll(/create policy "([^"]+)"/g)) {
      assert.ok(Buffer.byteLength(nom) <= 63, nom);
    }
    const accordes = [...migration.matchAll(/^grant [^;]+ to filmfund_worker;/gm)].map((m) => m[0]);
    assert.deepEqual(accordes, [
      "grant execute on function public.contexte_episodes(uuid) to filmfund_worker;",
      "grant execute on function public.livrer_proposition_episodes(uuid, jsonb) to filmfund_worker;",
    ]);
    for (const signature of [
      "controler_episode_propose()",
      "contexte_episodes(uuid)",
      "livrer_proposition_episodes(uuid, jsonb)",
      "clore_proposition_episodes(uuid)",
      "episode_a_decider(uuid)",
      "accepter_episode_propose(uuid, jsonb)",
      "ecarter_episode_propose(uuid)",
    ]) {
      assert.match(
        migration,
        new RegExp(
          `revoke all on function public\\.${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated`,
        ),
        signature,
      );
    }
  });

  it("le registre sert SCRIPT, et le barème, la vitrine et les statistiques connaissent l'action", async () => {
    const { executeursScript } = await import("../worker/src/agents/script.ts");
    const { PROFILS_SCRIPT, PROFILS_SCRIPT_EPISODES } = await import("../worker/src/ia/profils.ts");
    const { LIBELLES_ACTION } = await import("../src/lib/statistiques.ts");
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursScript({}, vide)), [
      ...Object.keys(PROFILS_SCRIPT),
      ...Object.keys(PROFILS_SCRIPT_EPISODES),
    ]);
    assert.match(lire("worker/src/registre.ts"), /\.\.\.executeursScript\(base, fournisseur\)/);
    assert.match(lire("src/lib/plans.ts"), /cle: "episode_list"/);
    assert.match(lire("src/lib/offre.ts"), /bareme\.episode_list/);
    assert.match(lire("src/lib/offre.ts"), /character_list, episode_list, budget_plan/);
    assert.equal(LIBELLES_ACTION.episode_list, "Épisodes");
  });

  it("l'écran dira ce qui part chez le fournisseur, et que rien n'est modifié", async () => {
    const { LIVRABLE_EPISODES } = await import("../src/lib/propositions.ts");
    assert.match(LIVRABLE_EPISODES.description, /pitch, synopsis, thème, enjeux, vision/);
    assert.match(LIVRABLE_EPISODES.description, /épisodes déjà saisis/);
    assert.match(LIVRABLE_EPISODES.description, /bible de série si elle existe/);
    assert.match(LIVRABLE_EPISODES.description, /fournisseur d'IA/);
    assert.match(LIVRABLE_EPISODES.description, /Il n'en modifie aucun/);
    assert.match(LIVRABLE_EPISODES.avertissement, /relisez chaque résumé/);
    assert.match(LIVRABLE_EPISODES.avertissement, /numéro qui suit le dernier/);
    assert.match(LIVRABLE_EPISODES.avertissement, /durée reste à saisir/);
  });
});
