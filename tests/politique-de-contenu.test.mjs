/**
 * Politique de contenu : ce que la page publie, et où elle se trouve.
 *
 * Un texte publié engage. Ces tests refusent qu'il annonce une protection qui
 * n'est pas en service, ou qu'il parte avec un champ resté à compléter.
 * Module pur et lecture de fichiers : ni base, ni serveur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { CONTACT_POLITIQUE_CONTENU, getLegalDocument } from "../src/lib/legal-content.ts";

const politique = getLegalDocument("politique-de-contenu");

/** Tout le texte du document, à plat. */
const texte = politique.sections
  .flatMap((section) => [
    section.title,
    ...section.blocks.flatMap((bloc) => {
      if (bloc.type === "paragraph") return [bloc.text];
      if (bloc.type === "list") return bloc.items;
      return bloc.fields.flatMap((champ) => [champ.label ?? "", champ.value]);
    }),
  ])
  .join("\n");

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

describe("Politique de contenu : le texte publié", () => {
  it("porte son titre, sa date et ses sept sections", () => {
    assert.equal(politique.title, "Politique de contenu et de protection des comptes");
    assert.equal(politique.updatedAt, "11 octobre 2026");
    assert.deepEqual(
      politique.sections.map((section) => section.id),
      [
        "objet",
        "contenus-interdits",
        "responsabilite",
        "signalement",
        "mots-de-passe",
        "compromission",
        "evolution",
      ],
    );
  });

  it("ne laisse aucun champ à compléter", () => {
    assert.doesNotMatch(texte, /[[\]]/);
  });

  it("nomme FilmFund Africa, et personne d'autre, comme modérateur", () => {
    assert.match(texte, /FilmFund Africa peut retirer un contenu ou suspendre un compte/);
    assert.doesNotMatch(texte, /ElMan/);
  });

  it("donne l'adresse de signalement et de réexamen", () => {
    assert.equal(CONTACT_POLITIQUE_CONTENU, "cedrichervex@gmail.com");
    assert.ok(texte.includes(CONTACT_POLITIQUE_CONTENU));
    assert.match(texte, /demander un réexamen en écrivant à la même adresse/);
  });

  it("n'annonce pas le refus des mots de passe divulgués, qui n'est pas en service", () => {
    assert.doesNotMatch(texte, /divulgu|fuites? de données|base de contrôle|refuse/i);
  });

  it("n'annonce que les mesures qui existent", () => {
    assert.doesNotMatch(texte, /visibilité|certaines fonctionnalités|révoquer|sessions/i);
  });

  it("ne promet aucune notification des changements", () => {
    assert.doesNotMatch(texte, /communiquées|notifi/i);
    assert.match(texte, /date de dernière mise à jour figure en tête de page/);
  });
});

describe("Politique de contenu : la page et ses liens", () => {
  it("a sa page, qui lit le document par son adresse", () => {
    const page = lire("src/app/politique-de-contenu/page.tsx");
    assert.match(page, /getLegalDocument\("politique-de-contenu"\)/);
    assert.match(page, /LegalDocumentPage/);
  });

  for (const chemin of [
    "src/components/landing/footer.tsx",
    "src/app/(auth)/layout.tsx",
    "src/app/(auth)/inscription/page.tsx",
    "src/app/not-found.tsx",
  ]) {
    it(`est liée depuis ${chemin}, à côté des deux autres pages légales`, () => {
      const source = lire(chemin);
      assert.match(source, /href: "\/politique-de-contenu"|href="\/politique-de-contenu"/);
      assert.match(source, /\/confidentialite/);
      assert.match(source, /\/mentions-legales/);
    });
  }
});
