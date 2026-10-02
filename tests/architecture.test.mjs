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
    const corps = source.slice(debut, source.indexOf("\n};", debut));
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
    };

    for (const [nom, attendu] of Object.entries(application)) {
      // La lecture a bien trouvé quelque chose : une table vide passerait
      // la comparaison sans rien prouver.
      assert.ok(Object.keys(attendu).length >= 3, `${nom} : lecture de l'application`);
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
    const migration = lire("supabase/migrations/20261002181851_exports_pdf.sql");
    const liste = /v_sections <@ array\[([^\]]+)\]/.exec(migration)?.[1] ?? "";
    const enBase = [...liste.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    assert.ok(enBase.length >= 4, "lecture de la migration");
    assert.deepEqual([...ORDRE_SECTIONS].sort(), [...enBase].sort());
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
