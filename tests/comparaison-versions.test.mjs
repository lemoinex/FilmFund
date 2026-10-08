/**
 * Comparaison de deux versions d'un document (lot ED1) : le calcul, ce que
 * la page lit, et ce que la base rend à chacun.
 *
 * Le calcul est un module pur. La page est lue comme du texte ; son rendu
 * complet se vérifie dans le navigateur. AUCUN APPEL À UN FOURNISSEUR.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  bilanComparaison,
  bilanEnClair,
  comparerTextes,
  CONTEXTE_COMPARAISON,
  LIMITE_COMPARAISON,
  lireVersionsComparees,
  replierInchange,
} from "../src/lib/comparaison.ts";
import { creerCompte, creerProjet, faireEntrer } from "./helpers.mjs";

const DOSSIER = "src/app/(app)/projets/[id]/documents/[documentId]";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

/** Les lignes d'une comparaison, en clair : « = texte », « - texte », « + texte », « ~ … ». */
const enClair = (ancien, recent) => {
  const comparaison = comparerTextes(ancien, recent);
  assert.equal(comparaison.tropLong, false);
  return comparaison.lignes.map((ligne) => {
    if (ligne.type === "modifie") {
      return `~ ${ligne.segments
        .map((s) =>
          s.type === "egal" ? s.texte : s.type === "retire" ? `[-${s.texte}]` : `[+${s.texte}]`,
        )
        .join("")}`;
    }
    return `${{ egal: "=", retire: "-", ajoute: "+" }[ligne.type]} ${ligne.texte}`;
  });
};

/** Le texte récent, reconstruit depuis la comparaison : rien ne doit se perdre. */
const recoller = (lignes, garder) =>
  lignes
    .filter((ligne) => ligne.type !== garder)
    .map((ligne) =>
      ligne.type === "modifie"
        ? ligne.segments
            .filter((s) => s.type !== garder)
            .map((s) => s.texte)
            .join("")
        : ligne.texte,
    )
    .join("\n");

describe("Comparaison : le calcul", () => {
  it("deux textes identiques n'ont aucune différence", () => {
    assert.deepEqual(enClair("Un.\nDeux.", "Un.\nDeux."), ["= Un.", "= Deux."]);
    const bilan = bilanComparaison(comparerTextes("Un.", "Un.").lignes);
    assert.deepEqual(bilan, { ajoutees: 0, retirees: 0, modifiees: 0, identiques: true });
    assert.equal(bilanEnClair(bilan), "Les deux versions ont le même texte.");
  });

  it("dit les lignes ajoutées et retirées, à leur place", () => {
    assert.deepEqual(enClair("Un.\nTrois.", "Un.\nDeux.\nTrois."), [
      "= Un.",
      "+ Deux.",
      "= Trois.",
    ]);
    assert.deepEqual(enClair("Un.\nDeux.\nTrois.", "Un.\nTrois."), [
      "= Un.",
      "- Deux.",
      "= Trois.",
    ]);
    assert.deepEqual(enClair("", "Un."), ["- ", "+ Un."]);
  });

  it("une ligne récrite se lit mot par mot", () => {
    assert.deepEqual(enClair("Awa refuse de partir.", "Awa accepte de partir."), [
      "~ Awa [-refuse][+accepte] de partir.",
    ]);
    assert.deepEqual(
      enClair(
        "Titre\nElle regarde le fleuve.\nFin",
        "Titre\nElle regarde longtemps le fleuve.\nFin",
      ),
      ["= Titre", "~ Elle regarde [+longtemps ]le fleuve.", "= Fin"],
    );
  });

  it("deux lignes sans un mot en commun restent retirée et ajoutée", () => {
    assert.deepEqual(enClair("Le fleuve.", "Une pirogue !"), ["- Le fleuve.", "+ Une pirogue !"]);
  });

  it("des retraits et des ajouts en nombres différents ne sont pas appariés", () => {
    assert.deepEqual(enClair("A\nB\nC", "A\nX\nY\nZ\nC"), [
      "= A",
      "- B",
      "+ X",
      "+ Y",
      "+ Z",
      "= C",
    ]);
  });

  it("rien ne se perd : l'ancien et le récent se recollent depuis la comparaison", () => {
    const ancien = "Scène 1\n\nAwa attend sur la berge.\nLe passeur arrive.\n\nScène 2\nNuit.";
    const recent =
      "Scène 1\n\nAwa attend, seule, sur la berge.\n\nScène 2\nNuit noire.\nElle part.";
    const { lignes } = comparerTextes(ancien, recent);
    assert.equal(recoller(lignes, "ajoute"), ancien);
    assert.equal(recoller(lignes, "retire"), recent);
  });

  it("des fins de ligne mêlées ne font pas une différence", () => {
    assert.deepEqual(enClair("Un.\r\nDeux.\rTrois.", "Un.\nDeux.\nTrois."), [
      "= Un.",
      "= Deux.",
      "= Trois.",
    ]);
  });

  it("compte les lignes ajoutées, retirées et modifiées, et le dit en une phrase", () => {
    const { lignes } = comparerTextes("A\nB b\nM\nC\nD", "A\nB c\nM\nD\nE\nF");
    const bilan = bilanComparaison(lignes);
    assert.deepEqual(bilan, { ajoutees: 2, retirees: 1, modifiees: 1, identiques: false });
    assert.equal(bilanEnClair(bilan), "2 lignes ajoutées, 1 ligne retirée, 1 ligne modifiée.");
    assert.equal(
      bilanEnClair({ ajoutees: 1, retirees: 0, modifiees: 0, identiques: false }),
      "1 ligne ajoutée.",
    );
  });

  it("renonce au-delà de sa borne, sans rien comparer", () => {
    const a = Array.from({ length: 30 }, (_, i) => `a${i}`).join("\n");
    const b = Array.from({ length: 30 }, (_, i) => `b${i}`).join("\n");
    assert.deepEqual(comparerTextes(a, b, 899), { tropLong: true });
    assert.equal(comparerTextes(a, b, 900).tropLong, false);
    assert.equal(LIMITE_COMPARAISON, 4_000_000);
  });

  it("deux longs textes qui ne diffèrent que d'une ligne se comparent, quelle que soit leur taille", () => {
    const lignes = Array.from({ length: 20_000 }, (_, i) => `Ligne ${i}`);
    const recent = [...lignes];
    recent[10_000] = "Ligne récrite";
    const comparaison = comparerTextes(lignes.join("\n"), recent.join("\n"));
    assert.equal(comparaison.tropLong, false);
    assert.deepEqual(bilanComparaison(comparaison.lignes), {
      ajoutees: 0,
      retirees: 0,
      modifiees: 1,
      identiques: false,
    });
  });
});

describe("Comparaison : le repli du texte inchangé", () => {
  const texte = (n, modifiee) =>
    Array.from({ length: n }, (_, i) => (i === modifiee ? "Ligne récrite ici" : `Ligne ${i}`)).join(
      "\n",
    );

  it("garde trois lignes autour d'une modification, et replie le reste en le comptant", () => {
    assert.equal(CONTEXTE_COMPARAISON, 3);
    const { lignes } = comparerTextes(
      texte(20, -1),
      texte(20, 10).replace("Ligne récrite ici", "Ligne 10 bis"),
    );
    const groupes = replierInchange(lignes);
    assert.deepEqual(
      groupes.map((g) => (g.type === "repli" ? `repli ${g.nombre}` : `lignes ${g.lignes.length}`)),
      ["repli 7", "lignes 7", "repli 6"],
    );
    // Rien ne disparaît : le total des lignes est conservé.
    assert.equal(
      groupes.reduce((n, g) => n + (g.type === "repli" ? g.nombre : g.lignes.length), 0),
      lignes.length,
    );
  });

  it("ne replie pas une ligne seule, ni deux textes identiques", () => {
    const { lignes } = comparerTextes("A\nB\nC\nD\nE\nF\nG\nH\nI", "A x\nB\nC\nD\nE\nF\nG\nH\nI x");
    // Entre les deux contextes, une seule ligne : elle reste affichée.
    const coupe = comparerTextes("A\nB\nC\nD\nE\nF\nG\nH", "A x\nB\nC\nD\nE\nF\nG\nH x").lignes;
    assert.deepEqual(
      replierInchange(coupe).map((g) => g.type),
      ["lignes"],
    );
    assert.equal(replierInchange(lignes).filter((g) => g.type === "repli").length, 0);
    const identiques = comparerTextes(texte(40, -1), texte(40, -1)).lignes;
    assert.deepEqual(
      replierInchange(identiques).map((g) => g.type),
      ["lignes"],
    );
    assert.deepEqual(replierInchange([]), []);
  });
});

describe("Comparaison : les numéros lus d'une adresse", () => {
  it("rend toujours l'ancienne puis la récente, d'où que l'on vienne", () => {
    assert.deepEqual(lireVersionsComparees("3", "5"), { ancienne: 3, recente: 5 });
    assert.deepEqual(lireVersionsComparees("5", "3"), { ancienne: 3, recente: 5 });
  });

  it("refuse tout ce qui n'est pas deux entiers positifs distincts", () => {
    for (const [de, a] of [
      ["3", "3"],
      ["0", "2"],
      ["-1", "2"],
      ["1.5", "2"],
      ["1e2", "2"],
      ["03", "2"],
      [" 3", "2"],
      ["3", undefined],
      [undefined, undefined],
      [3, 2],
      ["actuelle", "2"],
      ["1", "99999999999"],
      ["1 or 1=1", "2"],
    ]) {
      assert.equal(lireVersionsComparees(de, a), null, `${de} / ${a}`);
    }
  });
});

describe("Comparaison : ce que la base rend à chacun", () => {
  let porteur;
  let lecteur;
  let etranger;
  let projet;
  let documentId;

  /** La lecture de la page, telle quelle. */
  const versions = (compte, numeros) =>
    compte.client
      .from("project_document_versions")
      .select("version_number, title, content, created_at, created_by")
      .eq("document_id", documentId)
      .eq("project_id", projet.id)
      .in("version_number", numeros);

  before(async () => {
    porteur = await creerCompte("comparaison-porteur");
    lecteur = await creerCompte("comparaison-lecteur");
    etranger = await creerCompte("comparaison-etranger");
    projet = await creerProjet(porteur, "Projet de la comparaison");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { data: document, error } = await porteur.client
      .from("project_documents")
      .insert({
        project_id: projet.id,
        type: "synopsis",
        title: "Synopsis",
        content: "Awa refuse de partir.\nLe fleuve monte.",
        created_by: porteur.id,
      })
      .select("id")
      .single();
    assert.ifError(error);
    documentId = document.id;
    const { error: seconde } = await porteur.client
      .from("project_documents")
      .update({
        title: "Synopsis, deuxième jet",
        content: "Awa accepte de partir.\nLe fleuve monte.\nNuit.",
      })
      .eq("id", documentId);
    assert.ifError(seconde);
  });

  it("le porteur et un lecteur lisent les deux versions, et la comparaison dit ce qui a changé", async () => {
    for (const compte of [porteur, lecteur]) {
      const { data, error } = await versions(compte, [1, 2]);
      assert.ifError(error);
      assert.equal(data.length, 2);
      const ancienne = data.find((v) => v.version_number === 1);
      const recente = data.find((v) => v.version_number === 2);
      assert.notEqual(ancienne.title, recente.title);
      const { lignes } = comparerTextes(ancienne.content, recente.content);
      assert.equal(bilanEnClair(bilanComparaison(lignes)), "1 ligne ajoutée, 1 ligne modifiée.");
    }
  });

  it("un compte étranger au projet ne lit aucune des deux versions", async () => {
    const { data } = await versions(etranger, [1, 2]);
    assert.deepEqual(data ?? [], []);
  });

  it("une version qui n'existe pas ne revient pas : la page n'aura qu'une des deux", async () => {
    const { data } = await versions(porteur, [1, 99]);
    assert.deepEqual(
      data.map((v) => v.version_number),
      [1],
    );
  });
});

describe("Comparaison : la page et ses accès", () => {
  const page = lire(`${DOSSIER}/comparaison/page.tsx`);
  const historique = lire(`${DOSSIER}/historique.tsx`);
  const version = lire(`${DOSSIER}/versions/[numero]/page.tsx`);

  it("la page ne fait que lire, sous la RLS de l'appelant", () => {
    assert.doesNotMatch(page, /"use client"|"use server"|\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(page, /service_role|SERVICE_ROLE|createAdminClient|<form|<button/);
    assert.deepEqual(
      [...page.matchAll(/\.from\("(\w+)"\)/g)].map((m) => m[1]),
      ["project_document_versions", "project_documents"],
    );
    assert.deepEqual(
      [...page.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
      ["equipe_du_projet"],
    );
    // Les deux versions sont cherchées dans ce document, de ce projet.
    assert.match(
      page,
      /\.eq\("document_id", documentId\)\s+\.eq\("project_id", id\)\s+\.in\("version_number", \[numeros\.ancienne, numeros\.recente\]\)/,
    );
  });

  it("une adresse mal formée, une version absente ou un projet inaccessible donnent la même page introuvable", () => {
    assert.match(
      page,
      /const numeros = lireVersionsComparees\(premier\(parametres\.de\), premier\(parametres\.a\)\);\s+if \(!numeros\) \{\s+notFound\(\);/,
    );
    assert.match(page, /if \(!ancienne \|\| !recente \|\| !document\) \{\s+notFound\(\);/);
    assert.ok(
      page.indexOf("notFound();") < page.indexOf("createClient()"),
      "l'adresse est lue avant la base",
    );
    // Aucun squelette de chargement : il ferait répondre 200 à une page absente.
    assert.ok(!existsSync(new URL(`../${DOSSIER}/comparaison/loading.tsx`, import.meta.url)));
    assert.ok(!existsSync(new URL(`../${DOSSIER}/loading.tsx`, import.meta.url)));
  });

  it("le texte comparé s'affiche comme du texte, et un changement ne tient pas à la seule couleur", () => {
    assert.doesNotMatch(page, /dangerouslySetInnerHTML|innerHTML/);
    assert.match(page, /\{segment\.texte\}/);
    assert.match(page, /\{ligne\.texte\}/);
    // Un élément sémantique, un style et un libellé pour chaque sens.
    assert.match(
      page,
      /<del className="text-red-200 line-through">\s+<span className="sr-only"> retiré : <\/span>/,
    );
    assert.match(
      page,
      /<ins className="[^"]*underline[^"]*">\s+<span className="sr-only"> ajouté : <\/span>/,
    );
    assert.match(page, /\{retire \? "−" : "\+"\}/);
    assert.match(page, /<span className="text-red-200 line-through">texte retiré<\/span>/);
  });

  it("la page dit le sens de lecture, le titre, le bilan, et les cas où il n'y a rien à montrer", () => {
    assert.match(page, /toujours lu de la plus ancienne à la plus récente/);
    assert.match(page, /ancienne\.title !== recente\.title/);
    assert.match(page, /Le titre n&apos;a pas changé\./);
    assert.match(page, /\{bilanEnClair\(bilan\)\}/);
    assert.match(page, /\{bilan\.identiques \? null : \(/);
    assert.match(page, /trop différentes pour être comparées ligne à ligne ici/);
    assert.match(page, /\{groupe\.nombre\} lignes inchangées/);
  });

  it("l'historique propose la comparaison à la précédente, sauf pour la première version", () => {
    assert.match(historique, /const precedente = liste\[index \+ 1\];/);
    assert.match(historique, /\{precedente \? \(/);
    assert.match(
      historique,
      /comparaison\?de=\$\{precedente\.version_number\}&a=\$\{version\.version_number\}/,
    );
    assert.match(historique, /Comparer à la précédente/);
    // L'historique ne charge toujours pas le texte des versions.
    assert.match(
      historique,
      /\.select\("id, version_number, created_at, created_by, restored_from"\)/,
    );
  });

  it("la page d'une version propose la comparaison à la version actuelle, sauf si elle l'est", () => {
    assert.match(version, /derniere && derniere\.version_number !== version\.version_number/);
    assert.match(
      version,
      /comparaison\?de=\$\{version\.version_number\}&a=\$\{derniere\.version_number\}/,
    );
    assert.match(version, /Comparer à la version actuelle/);
    assert.match(version, /\.order\("version_number", \{ ascending: false \}\)\s+\.limit\(1\)/);
    // La restauration est inchangée.
    assert.match(
      version,
      /<FormulaireRestauration projetId=\{id\} documentId=\{documentId\} versionId=\{version\.id\} \/>/,
    );
  });
});
