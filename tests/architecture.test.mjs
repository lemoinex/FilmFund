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
 * Livrables de WEAVER. Un profil versionné noue une action de tâche à ses
 * consignes ; la base doit admettre cette action, la facturer, accepter la
 * proposition qu'elle produira et savoir où l'appliquer. Un profil sans l'un
 * ou l'autre ferait échouer la demande, ou perdre le texte au dépôt.
 */
describe("Livrables des agents", () => {
  // Le devis a été repris en dernier par le planning de FIELD ; le contexte,
  // par le correctif du lot J2a ; le dépôt et l'acceptation datent de sa
  // première migration.
  const DEVIS = "supabase/migrations/20261005170000_field_planning.sql";
  const CONTEXTE = "supabase/migrations/20261005150000_scenario_contexte.sql";
  const PROPOSITIONS = "supabase/migrations/20261005130000_script_scenario.sql";

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
    const { PROFILS_ARC, PROFILS_IA, PROFILS_SCRIPT, PROFILS_WEAVER } =
      await import("../worker/src/ia/profils.ts");
    // Ni la base ni le fournisseur ne sont touchés : rien n'est appelé ici.
    const vide = async () => ({});
    assert.deepEqual(Object.keys(executeursWeaver({}, vide)), Object.keys(PROFILS_WEAVER));
    assert.deepEqual(Object.keys(executeursScript({}, vide)), Object.keys(PROFILS_SCRIPT));
    assert.deepEqual(Object.keys(executeursArc({}, vide)), Object.keys(PROFILS_ARC));
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
    assert.match(actions, /parametres = \{ sequences: 1, sequence: texte \}/);
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
    for (const action of [...Object.keys(PROFILS_IA), ...Object.keys(PROFILS_FIELD)]) {
      assert.ok(devis.includes(`when '${action}' then`), action);
    }
    // Le scénario garde sa séquence unique et la borne de sa description.
    assert.match(devis, /parametre_entier\(v_parametres, 'sequences', 1\)/);
    assert.match(devis, /not between 1 and 1200/);
    // Les propositions de textes gardent leurs bornes et leurs atterrissages.
    const acceptation = corps("accepter_proposition");
    for (const action of Object.keys(PROFILS_IA)) {
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
    for (const action of Object.keys(PROFILS_IA)) {
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
    const migration = lire("supabase/migrations/20261005130000_script_scenario.sql");
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
      ...Object.keys(PROFILS_IA),
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
    assert.match(lire("src/lib/offre.ts"), /schedule_plan, shot_list, gear_list, treatment/);
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
      ...Object.keys(PROFILS_IA),
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
