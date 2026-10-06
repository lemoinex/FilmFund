/**
 * Vignette proposée par BOARD (lot K2) : ce que l'écran annonce, ce que ses
 * actions serveur vérifient, et ce que sert la route de l'image.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page, l'encart
 * et la route sont lus comme du texte : leur parcours complet se vérifie dans
 * le navigateur, et les droits eux-mêmes par les tests de la base et du
 * worker (lot K1).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  estActionIa,
  estActionStructuree,
  LIVRABLE_DECOUPAGE,
  LIVRABLE_MATERIEL,
  LIVRABLE_VIGNETTE,
  lireVignette,
  unitesImage,
  VIGNETTE_OCTETS_MAX,
} from "../src/lib/propositions.ts";
import { TAILLE_MAX_IMAGE } from "../worker/src/agents/board.ts";
import { PROFILS_BOARD } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/storyboard";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Un fichier tel que l'API le rend : `\x` suivi de ses octets en hexadécimal. */
const enHexa = (octets) => `\\x${Buffer.from(octets).toString("hex")}`;
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01];

describe("Vignette proposée : catalogue et accords", () => {
  it("l'écran propose exactement ce que BOARD sait produire, à part de tout le reste", () => {
    assert.deepEqual(Object.keys(PROFILS_BOARD), [LIVRABLE_VIGNETTE.action]);
    assert.equal(estActionIa(LIVRABLE_VIGNETTE.action), false);
    assert.equal(estActionStructuree(LIVRABLE_VIGNETTE.action), false);
    assert.notEqual(LIVRABLE_VIGNETTE.action, LIVRABLE_DECOUPAGE.action);
    assert.notEqual(LIVRABLE_VIGNETTE.action, LIVRABLE_MATERIEL.action);
  });

  it("dit ce qui est dessiné, à qui le dossier est transmis, et ce que vaut le dessin", () => {
    assert.match(LIVRABLE_VIGNETTE.description, /croquis à l'encre noire/);
    assert.match(LIVRABLE_VIGNETTE.description, /fournisseur d'images/);
    assert.match(LIVRABLE_VIGNETTE.avertissement, /ne décide ni du cadre ni de la mise en scène/);
    // Rien n'est remplacé en silence : l'écran le dit avant, en toutes lettres.
    assert.match(
      LIVRABLE_VIGNETTE.remplacement,
      /la remplacera, et l'image actuelle sera supprimée/,
    );
    // Aucune promesse que le style interdit.
    const textes = Object.values(LIVRABLE_VIGNETTE).join(" ");
    assert.doesNotMatch(textes, /couleur|photo|réaliste|3D/i);
  });

  it("compte en images, pas en unités texte", () => {
    assert.equal(unitesImage(1), "1 image");
    assert.equal(unitesImage(12), "12 images");
  });
});

describe("Vignette proposée : lecture du fichier", () => {
  it("lit un PNG rendu par l'API, octet pour octet", () => {
    assert.deepEqual([...lireVignette(enHexa(PNG))], PNG);
  });

  it("refuse tout ce qui n'est pas un PNG dans les bornes", () => {
    for (const [raison, valeur] of [
      ["un PDF", enHexa([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])],
      ["un JPEG", enHexa([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])],
      ["un SVG en texte", enHexa(Buffer.from("<svg onload=alert(1)>"))],
      ["une signature tronquée", enHexa(PNG.slice(0, 4))],
      ["une chaîne sans préfixe", Buffer.from(PNG).toString("hex")],
      ["un nombre impair de chiffres", `${enHexa(PNG)}0`],
      ["autre chose qu'une chaîne", PNG],
      ["rien", null],
      ["une chaîne vide", ""],
    ]) {
      assert.equal(lireVignette(valeur), null, raison);
    }
  });

  it("borne la taille comme la base et le worker", () => {
    assert.equal(VIGNETTE_OCTETS_MAX, TAILLE_MAX_IMAGE);
    const lourde = `\\x${Buffer.from(PNG).toString("hex")}${"00".repeat(VIGNETTE_OCTETS_MAX)}`;
    assert.equal(lireVignette(lourde), null);
  });
});

describe("Vignette proposée : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-image.ts`));
  const fonctions = source.split("\nexport async function ").slice(1);
  const corps = (nom) => {
    const fonction = fonctions.find((f) => f.startsWith(`${nom}(`));
    assert.ok(fonction, `${nom} introuvable`);
    return fonction;
  };

  it("les cinq actions attendues, et rien d'autre", () => {
    assert.deepEqual(
      fonctions.map((f) => f.slice(0, f.indexOf("("))),
      [
        "demanderDevisVignette",
        "lancerVignette",
        "annulerVignette",
        "accepterVignette",
        "ecarterVignette",
      ],
    );
  });

  it("chaque action contrôle chacun de ses identifiants et exige une session avant d'appeler la base", () => {
    for (const fonction of fonctions) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const signature = fonction.slice(0, fonction.indexOf("): Promise<"));
      const identifiants = [...signature.matchAll(/(\w+): string/g)].map((m) => m[1]);
      assert.ok(identifiants.length >= 2, `${nom} : lecture de la signature`);
      for (const identifiant of identifiants) {
        assert.ok(fonction.includes(`UUID.test(${identifiant})`), `${nom} : ${identifiant}`);
      }
      const controle = fonction.indexOf("UUID.test(");
      const garde = fonction.indexOf("await session()");
      const appel = fonction.search(/\.(rpc|from)\(/);
      assert.ok(garde > controle, `${nom} : la session suit le contrôle`);
      assert.ok(appel > garde, `${nom} : la base n'est appelée qu'après la garde`);
    }
    assert.match(source, /const garde = await exigerAcces\(supabase\);/);
  });

  it("le navigateur désigne une scène ; il ne choisit ni l'action, ni le modèle, ni le style, ni le nombre d'images", () => {
    assert.match(
      corps("demanderDevisVignette"),
      /p_action: ACTION,\s+p_params: \{ scene: sceneId \},/,
    );
    assert.match(source, /const ACTION = LIVRABLE_VIGNETTE\.action;/);
    assert.doesNotMatch(source, /modele|profil|style|qualite|taille|count|gpt-/i);
  });

  it("accepter relit le fichier sous la session, le dépose à un chemin tiré au sort, puis laisse la base décider", () => {
    const acceptation = corps("accepterVignette");
    const etapes = [
      'from("ai_suggestion_images")',
      "lireVignette(vignette.file)",
      "`${projetId}/scenes/${crypto.randomUUID()}.png`",
      '.upload(chemin, fichier, { contentType: "image/png", upsert: false })',
      'rpc("accepter_image_proposee"',
    ].map((etape) => {
      const position = acceptation.indexOf(etape);
      assert.ok(position >= 0, etape);
      return position;
    });
    assert.deepEqual(
      [...etapes].sort((a, b) => a - b),
      etapes,
      "dans cet ordre",
    );

    // Seule une vignette encore proposée se dépose ; le chemin ne vient jamais du navigateur.
    assert.match(
      acceptation,
      /vignette\?\.state === "proposed" \? lireVignette\(vignette\.file\) : null/,
    );
    assert.doesNotMatch(acceptation.slice(0, acceptation.indexOf("): Promise<")), /chemin|path/);
    // Si la base refuse, le fichier tout juste déposé est retiré.
    assert.match(acceptation, /if \(error\) \{\s+await supprimerImages\(supabase, \[chemin\]\);/);
    // L'ancienne image n'est supprimée qu'après l'accord de la base.
    assert.ok(
      acceptation.indexOf("supprimerImages(supabase, [ancienne])") >
        acceptation.indexOf('rpc("accepter_image_proposee"'),
    );
  });

  it("aucune action n'écrit le storyboard elle-même, n'appelle un fournisseur ni ne lit une clé", () => {
    assert.doesNotMatch(source, /from\("storyboard_scenes"\)/);
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|SECRET|service_role|\bfetch\(/i);
  });
});

describe("Vignette proposée : page, encart et route", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const lecture = sansCommentaires(lire(`${DOSSIER}/lecture-vignettes.ts`));
  const encart = lire(`${DOSSIER}/vignette-proposee.tsx`);
  const route = sansCommentaires(lire(`${DOSSIER}/vignettes/[imageId]/route.ts`));

  it("la page garde une seule boucle de rafraîchissement, pour le découpage et la vignette", () => {
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    assert.match(
      page,
      /\[\.\.\.assistant\.parScene\.values\(\), \.\.\.vignettes\.values\(\)\]\.some\(/,
    );
    assert.equal(page.match(/<VignetteProposee/g)?.length, 1);
  });

  it("la lecture est bornée, filtrée par projet et par action, et ne charge jamais un fichier", () => {
    assert.match(lecture, /\.eq\("action", LIVRABLE_VIGNETTE\.action\)/);
    assert.equal(lecture.match(/\.limit\(TACHES_LUES\)/g)?.length, 2);
    assert.equal(lecture.match(/\.eq\("project_id", projetId\)/g)?.length, 2);
    assert.match(lecture, /\.select\("id, suggestion_id, scene_id"\)/);
    assert.doesNotMatch(lecture, /\bfile\b/);
    assert.doesNotMatch(page, /"file"|\bfile,/);
  });

  it("un lecteur voit la vignette proposée sans suivre la demande ni en décider", () => {
    assert.match(
      lecture,
      /if \(peutDecider\) \{\s+const \{ data: taches \} = await supabase\s+\.from\("jobs"\)/,
    );
    assert.match(lecture, /\.eq\("state", "proposed"\)/);
    assert.match(encart, /if \(!peutDecider && !proposee\) \{\s+return null;/);
    assert.match(
      encart,
      /Seuls le porteur et les éditeurs du projet décident de la vignette proposée\./,
    );
    assert.match(encart, /\{peutDecider && auRepos && !demande \? \(/);
  });

  it("une image déjà en place ne se remplace qu'après un second clic, et l'écran le dit avant", () => {
    assert.match(encart, /\{aImage \? \(\s+<p[^>]*>\s+\{LIVRABLE_VIGNETTE\.remplacement\}/);
    assert.match(
      encart,
      /aImage\s+\? setConfirmation\(true\)\s+: executer\(\(\) => accepterVignette\(projetId, imageId\)\)/,
    );
    assert.match(encart, /"Remplacer l'image de la scène"/);
    assert.match(page, /aImage=\{aImage\}/);
  });

  it("l'encart montre la vignette par sa route, avec un équivalent textuel, sur fond blanc", () => {
    assert.match(
      encart,
      /src=\{`\/projets\/\$\{projetId\}\/storyboard\/vignettes\/\$\{imageId\}`\}/,
    );
    assert.match(
      encart,
      /alt=\{`Vignette proposée pour la scène \$\{numeroScene\} : \$\{titreScene\}`\}/,
    );
    assert.match(encart, /bg-white/);
    assert.match(encart, /\{LIVRABLE_VIGNETTE\.avertissement\}/);
    assert.match(encart, /unitesImage\(demande\.devis\.quantite\)/);
    assert.doesNotMatch(encart, /unitesTexte/);
  });

  it("la route sert la vignette sous la session, comme un PNG, sans la laisser en cache", () => {
    assert.match(
      route,
      /if \(!UUID\.test\(id\) \|\| !UUID\.test\(imageId\)\) \{\s+return introuvable\(\);/,
    );
    const garde = route.indexOf("exigerAcces(supabase)");
    const lectureFichier = route.indexOf('from("ai_suggestion_images")');
    assert.ok(garde > 0 && lectureFichier > garde, "la session précède la lecture");
    assert.match(route, /\.eq\("id", imageId\)\s+\.eq\("project_id", id\)/);
    // Le type servi est celui que les octets confirment, jamais celui de l'adresse.
    assert.match(
      route,
      /const fichier = lireVignette\(vignette\?\.file\);\s+if \(!fichier\) \{\s+return introuvable\(\);/,
    );
    assert.match(route, /"content-type": "image\/png"/);
    assert.match(route, /"cache-control": "private, no-store"/);
    assert.match(route, /"x-content-type-options": "nosniff"/);
    // Aucun rôle de service : c'est la RLS qui décide.
    assert.doesNotMatch(route, /SECRET|service_role/i);
  });
});
