/**
 * Mise en forme des documents (lot ED2a) : la lecture des marqueurs, leur
 * pose par la barre d'outils, et les pages qui rendent le texte.
 *
 * La règle est un module pur. Les pages sont lues comme du texte ; leur rendu
 * complet se vérifie dans le navigateur. AUCUN APPEL À UN FOURNISSEUR.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AIDE_MISE_EN_FORME,
  appliquerMarque,
  estMisEnForme,
  lireMiseEnForme,
  lireSegments,
  MARQUES,
  TYPES_SANS_MISE_EN_FORME,
} from "../src/lib/mise-en-forme.ts";

const DOSSIER = "src/app/(app)/projets/[id]/documents";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

/** Les segments d'une ligne, en clair : « [g:texte] », « [i:texte] » ou le texte. */
const segmentsEnClair = (segments) =>
  segments.map((s) => (s.gras ? `[g:${s.texte}]` : s.italique ? `[i:${s.texte}]` : s.texte));

/** Les blocs d'un texte, en clair. */
const blocsEnClair = (texte) =>
  lireMiseEnForme(texte).map((bloc) => {
    if (bloc.type === "titre") {
      return `h${bloc.niveau} ${segmentsEnClair(bloc.segments).join("")}`;
    }
    if (bloc.type === "liste") {
      return `ul ${bloc.elements.map((e) => segmentsEnClair(e).join("")).join(" | ")}`;
    }
    return `p ${bloc.lignes.map((l) => segmentsEnClair(l).join("")).join(" / ")}`;
  });

/** Pose une marque sur le passage entre « [ » et « ] », et rend le résultat de la même façon. */
const poser = (dessin, marque) => {
  const debut = dessin.indexOf("[");
  const fin = dessin.indexOf("]") - 1;
  const texte = dessin.replace("[", "").replace("]", "");
  const rendu = appliquerMarque({ texte, debut, fin }, marque);
  return `${rendu.texte.slice(0, rendu.debut)}[${rendu.texte.slice(rendu.debut, rendu.fin)}]${rendu.texte.slice(rendu.fin)}`;
};

describe("Mise en forme : gras et italique d'une ligne", () => {
  it("lit un passage en gras et un passage en italique", () => {
    assert.deepEqual(segmentsEnClair(lireSegments("Un **mot** et *un autre*.")), [
      "Un ",
      "[g:mot]",
      " et ",
      "[i:un autre]",
      ".",
    ]);
  });

  it("laisse en texte un marqueur qui n'est pas refermé", () => {
    assert.deepEqual(segmentsEnClair(lireSegments("Un **mot sans fin")), ["Un **mot sans fin"]);
    assert.deepEqual(segmentsEnClair(lireSegments("3 * 4 = 12")), ["3 * 4 = 12"]);
  });

  it("laisse en texte un marqueur qui entoure du vide ou des blancs", () => {
    assert.deepEqual(segmentsEnClair(lireSegments("rien **** ici")), ["rien **** ici"]);
    assert.deepEqual(segmentsEnClair(lireSegments("ni * là * non plus")), ["ni * là * non plus"]);
    assert.deepEqual(segmentsEnClair(lireSegments("ni ** là ** non plus")), [
      "ni ** là ** non plus",
    ]);
  });

  it("ne perd aucun caractère hors des marqueurs lus", () => {
    for (const ligne of ["***trois***", "a*b*c**d**e*", "**a* b**", "* ** *** ****"]) {
      const lus = lireSegments(ligne);
      const rendu = lus
        .map((s) => (s.gras ? `**${s.texte}**` : s.italique ? `*${s.texte}*` : s.texte))
        .join("");
      assert.equal(rendu, ligne);
    }
  });

  it("ne lit pas de balise : un chevron reste un caractère", () => {
    const [seul] = lireSegments("<script>alert(1)</script>");
    assert.equal(seul.texte, "<script>alert(1)</script>");
    assert.equal(seul.gras || seul.italique, false);
  });
});

describe("Mise en forme : titres, paragraphes et listes", () => {
  it("découpe un texte en blocs", () => {
    const texte = [
      "# Note d'intention",
      "",
      "Premier paragraphe,",
      "sur deux lignes.",
      "",
      "## Pourquoi ce film",
      "- la **mémoire**",
      "- le fleuve",
      "Suite sans ligne vide.",
    ].join("\n");
    assert.deepEqual(blocsEnClair(texte), [
      "h1 Note d'intention",
      "p Premier paragraphe, / sur deux lignes.",
      "h2 Pourquoi ce film",
      "ul la [g:mémoire] | le fleuve",
      "p Suite sans ligne vide.",
    ]);
  });

  it("exige une espace après le marqueur de ligne, et du texte derrière", () => {
    assert.deepEqual(blocsEnClair("#Titre collé\n-tiret collé\n# \n- "), [
      "p #Titre collé / -tiret collé / #  / - ",
    ]);
  });

  it("ne lit pas de troisième niveau de titre", () => {
    assert.deepEqual(blocsEnClair("### Trois"), ["p ### Trois"]);
  });

  it("sépare deux listes par une ligne vide", () => {
    assert.deepEqual(blocsEnClair("- a\n- b\n\n- c"), ["ul a | b", "ul c"]);
  });

  it("lit de la même façon les fins de ligne Windows", () => {
    assert.deepEqual(blocsEnClair("# Titre\r\n\r\nTexte\r\n- un\r\n- deux"), [
      "h1 Titre",
      "p Texte",
      "ul un | deux",
    ]);
  });

  it("rend une liste vide pour un texte vide", () => {
    assert.deepEqual(lireMiseEnForme(""), []);
    assert.deepEqual(lireMiseEnForme("\n\n  \n"), []);
  });
});

describe("Mise en forme : la barre d'outils", () => {
  it("entoure la sélection de gras, et la garde sélectionnée", () => {
    assert.equal(poser("Un [mot] ici", "gras"), "Un **[mot]** ici");
    assert.equal(poser("Un [mot] ici", "italique"), "Un *[mot]* ici");
  });

  it("retire la marque qui entoure déjà la sélection", () => {
    assert.equal(poser("Un **[mot]** ici", "gras"), "Un [mot] ici");
    assert.equal(poser("Un *[mot]* ici", "italique"), "Un [mot] ici");
  });

  it("ne prend pas un gras pour un italique à retirer", () => {
    assert.equal(poser("Un **[mot]** ici", "italique"), "Un ***[mot]*** ici");
  });

  it("sans sélection, pose les marqueurs et place le curseur entre eux", () => {
    assert.equal(poser("Un [] ici", "gras"), "Un **[]** ici");
  });

  it("pose un titre en tête de la ligne du curseur", () => {
    assert.equal(poser("Avant\nLa li[]gne\nAprès", "titre"), "Avant\n[# La ligne]\nAprès");
  });

  it("remplace une autre marque de ligne au lieu de l'empiler", () => {
    assert.equal(poser("# Ti[]tre", "sous_titre"), "[## Titre]");
    assert.equal(poser("## Ti[]tre", "titre"), "[# Titre]");
    assert.equal(poser("- élé[]ment", "titre"), "[# élément]");
  });

  it("retire la marque de ligne quand toutes les lignes la portent", () => {
    assert.equal(poser("- u[n\n- de]ux", "liste"), "[un\ndeux]");
    assert.equal(poser("# Ti[]tre", "titre"), "[Titre]");
  });

  it("pose la liste sur chaque ligne touchée, même si l'une la porte déjà", () => {
    assert.equal(poser("u[n\n- deux\ntr]ois", "liste"), "[- un\n- deux\n- trois]");
  });

  it("ne touche à rien hors des lignes sélectionnées", () => {
    const rendu = appliquerMarque({ texte: "a\nb\nc", debut: 2, fin: 3 }, "liste");
    assert.equal(rendu.texte, "a\n- b\nc");
  });

  it("ramène dans le texte une sélection qui en sort", () => {
    const rendu = appliquerMarque({ texte: "abc", debut: 99, fin: -4 }, "gras");
    assert.equal(rendu.texte, "**abc**");
  });

  it("ce que la barre pose, la lecture le reconnaît", () => {
    assert.deepEqual(
      blocsEnClair(appliquerMarque({ texte: "Titre", debut: 0, fin: 0 }, "titre").texte),
      ["h1 Titre"],
    );
    assert.deepEqual(
      blocsEnClair(appliquerMarque({ texte: "Titre", debut: 0, fin: 0 }, "sous_titre").texte),
      ["h2 Titre"],
    );
    assert.deepEqual(
      blocsEnClair(appliquerMarque({ texte: "un\ndeux", debut: 0, fin: 7 }, "liste").texte),
      ["ul un | deux"],
    );
    assert.deepEqual(
      blocsEnClair(appliquerMarque({ texte: "mot", debut: 0, fin: 3 }, "gras").texte),
      ["p [g:mot]"],
    );
    assert.deepEqual(
      blocsEnClair(appliquerMarque({ texte: "mot", debut: 0, fin: 3 }, "italique").texte),
      ["p [i:mot]"],
    );
  });

  it("propose cinq marques, chacune nommée", () => {
    assert.deepEqual(Object.keys(MARQUES), ["titre", "sous_titre", "liste", "gras", "italique"]);
    for (const marque of Object.values(MARQUES)) {
      assert.ok(marque.libelle.length > 0);
    }
  });
});

describe("Mise en forme : le scénario garde son texte brut", () => {
  it("n'applique aucune mise en forme à un scénario", () => {
    assert.equal(estMisEnForme("scenario"), false);
    for (const type of ["note_intention", "synopsis", "traitement", "bible", "autre"]) {
      assert.equal(estMisEnForme(type), true, type);
    }
  });

  it("ne nomme que des types de document qui existent", () => {
    const genere = lire("src/lib/supabase/database.types.ts");
    const liste = /document_type: \[([^\]]+)\]/.exec(genere);
    assert.ok(liste, "liste des types de document introuvable dans les types générés");
    const types = [...liste[1].matchAll(/"([a-z_]+)"/g)].map((trouve) => trouve[1]);
    assert.ok(TYPES_SANS_MISE_EN_FORME.length > 0);
    for (const type of TYPES_SANS_MISE_EN_FORME) {
      assert.ok(types.includes(type), type);
    }
  });
});

describe("Mise en forme : les écrans", () => {
  const composant = lire("src/components/texte-mis-en-forme.tsx");
  const editeur = lire(`${DOSSIER}/formulaires.tsx`);
  const pageDocument = lire(`${DOSSIER}/[documentId]/page.tsx`);
  const pageVersion = lire(`${DOSSIER}/[documentId]/versions/[numero]/page.tsx`);
  const pageComparaison = lire(`${DOSSIER}/[documentId]/comparaison/page.tsx`);

  it("le rendu n'injecte jamais de HTML", () => {
    assert.doesNotMatch(composant, /dangerouslySetInnerHTML/);
    assert.doesNotMatch(composant, /"use client"/);
  });

  it("le rendu laisse tel quel le texte d'un type sans mise en forme", () => {
    assert.match(composant, /if \(!estMisEnForme\(type\)\)/);
    assert.match(composant, /whitespace-pre-line/);
  });

  it("la page d'un document rend son texte selon son type", () => {
    assert.match(
      pageDocument,
      /<TexteMisEnForme texte=\{document\.content\} type=\{document\.type\}/,
    );
  });

  it("une version se lit comme son document : la page en demande le type", () => {
    assert.match(pageVersion, /\.select\("id, title, content, type"\)/);
    assert.match(
      pageVersion,
      /<TexteMisEnForme texte=\{version\.content\} type=\{document\.type\}/,
    );
  });

  it("la comparaison de versions continue de montrer le texte brut", () => {
    assert.doesNotMatch(pageComparaison, /TexteMisEnForme|mise-en-forme/);
  });

  it("l'éditeur ne montre ni barre ni aperçu pour un scénario, et le dit", () => {
    assert.match(editeur, /const misEnForme = estMisEnForme\(type\);/);
    assert.match(editeur, /\{misEnForme \? <BarreOutils /);
    assert.match(editeur, /Un scénario garde son texte tel qu/);
  });

  it("l'éditeur dit que les marqueurs restent dans le texte", () => {
    assert.match(editeur, /\{AIDE_MISE_EN_FORME\}/);
    assert.match(AIDE_MISE_EN_FORME, /Ces marqueurs restent dans le texte\./);
    for (const marqueur of ["« # »", "« ## »", "« - »", "**gras**", "*italique*"]) {
      assert.ok(AIDE_MISE_EN_FORME.includes(marqueur), marqueur);
    }
  });

  it("l'aperçu rend le texte saisi, pas le texte enregistré", () => {
    assert.match(editeur, /<TexteMisEnForme texte=\{contenu\} type=\{type\} \/>/);
  });

  it("la barre d'outils n'envoie pas le formulaire", () => {
    const barre = lire(`${DOSSIER}/barre-outils.tsx`);
    assert.match(barre, /role="toolbar"/);
    assert.match(barre, /type="button"/);
    assert.doesNotMatch(barre, /type="submit"/);
  });
});
