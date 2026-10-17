/**
 * Conditions générales d'utilisation, et ce qu'aucune page légale ne promet.
 *
 * Le document remis par l'utilisateur le 11 octobre 2026 portait sept
 * engagements sans rien derrière dans l'application. Ils ont été retirés avec
 * son accord ; ces tests refusent leur retour dans les quatre pages. Y
 * ajouter un engagement, c'est d'abord livrer ce qu'il décrit.
 * Module pur et lecture de fichiers : ni base, ni serveur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  ADMINISTRATEURS,
  CONTACT_POLITIQUE_CONTENU,
  CONTACT_ROMARIC,
  getLegalDocument,
  SIEGE_EDITEUR,
  TELEPHONE_EDITEUR,
} from "../src/lib/legal-content.ts";

const PAGES = [
  "mentions-legales",
  "conditions-utilisation",
  "confidentialite",
  "politique-de-contenu",
];

const texteDe = (section) =>
  [
    section.title,
    ...section.blocks.flatMap((bloc) => {
      if (bloc.type === "paragraph") return [bloc.text];
      if (bloc.type === "list") return bloc.items;
      return bloc.fields.flatMap((champ) => [champ.label ?? "", champ.value]);
    }),
  ].join("\n");

const texteDuDocument = (slug) => getLegalDocument(slug).sections.map(texteDe).join("\n");

const cgu = getLegalDocument("conditions-utilisation");
const article = (id) => texteDe(cgu.sections.find((candidate) => candidate.id === id));

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

describe("Conditions générales d'utilisation : le texte publié", () => {
  it("portent leur titre, leur date et leurs douze articles", () => {
    assert.equal(cgu.title, "Conditions générales d'utilisation");
    assert.equal(cgu.updatedAt, "17 octobre 2026");
    assert.equal(cgu.sections.length, 12);
    cgu.sections.forEach((section, rang) => {
      assert.ok(section.title.startsWith(`Article ${rang + 1} — `), section.title);
    });
  });

  it("disent que l'accès est restreint aux comptes préenregistrés", () => {
    assert.match(
      article("acces"),
      /les inscriptions publiques et l'ajout libre de membres sont désactivés/,
    );
  });

  it("n'annoncent que la suspension d'un compte, pas sa suppression", () => {
    assert.match(article("acces"), /peut suspendre un compte en cas de violation des CGU/);
    assert.doesNotMatch(article("acces"), /supprimer un compte/);
  });

  it("nomment les deux administrateurs", () => {
    for (const administrateur of ADMINISTRATEURS) {
      assert.ok(article("roles").includes(administrateur.nom), administrateur.nom);
    }
  });

  it("nomment les trois fournisseurs d'IA et disent qu'une proposition se décide", () => {
    const service = article("service");
    for (const nom of ["Anthropic", "OpenAI", "Perplexity"]) {
      assert.ok(service.includes(nom), nom);
    }
    assert.match(service, /chacune est acceptée ou écartée explicitement/);
    assert.match(service, /peuvent contenir des erreurs/);
    assert.match(service, /ne garantit l'obtention d'aucun financement/);
  });

  it("disent le plafond mensuel, la seule limite de l'assistant qui existe", () => {
    assert.match(article("disponibilite"), /plafond mensuel de dépenses/);
    assert.match(
      article("disponibilite"),
      /les fonctions manuelles du Service restent disponibles/,
    );
  });

  it("laissent à l'utilisateur ses droits, et à confirmer l'usage des fournisseurs", () => {
    const propriete = article("propriete");
    assert.match(propriete, /conserve l'intégralité des droits/);
    assert.match(propriete, /pèse 5 Mo au plus et se conserve 30 jours/);
    assert.match(propriete, /\[À CONFIRMER SELON LEURS CONDITIONS CONTRACTUELLES\]/);
  });

  it("disent le droit applicable et les tribunaux compétents", () => {
    assert.match(article("droit-applicable"), /régies par le droit camerounais/);
    assert.match(article("droit-applicable"), /tribunaux compétents de Yaoundé/);
  });

  it("donnent le siège, les deux adresses et le téléphone de l'éditeur", () => {
    const contact = cgu.sections
      .find((candidate) => candidate.id === "contact")
      .blocks.find((bloc) => bloc.type === "fields");
    assert.deepEqual(contact.fields, [
      { label: "Siège", value: SIEGE_EDITEUR },
      { label: "Contact", value: `${CONTACT_POLITIQUE_CONTENU} / ${CONTACT_ROMARIC}` },
      { label: "Téléphone", value: TELEPHONE_EDITEUR },
    ]);
  });
});

describe("Pages légales : les engagements que rien ne tient", () => {
  const INTERDITS = [
    [
      "applications Android et Windows",
      /Android|APK|Windows|\.exe|\.msi|applications installables/i,
    ],
    [
      "mode maintenance et arrêt d'urgence de l'IA",
      /arrêt d'urgence|fermer temporairement les opérations/i,
    ],
    ["vitrine modifiable par l'administration", /landing|modification des textes et images/i],
    ["double authentification", /2FA|authentification forte|double authentification/i],
    ["notification des changements", /par e-mail|sont informés|est notifiée|après notification/i],
    ["suppression à la clôture d'un compte", /clôture d'un compte|supprimés sous/i],
    ["clés en variables d'environnement", /variables d'environnement/i],
  ];

  for (const slug of PAGES) {
    for (const [nom, motif] of INTERDITS) {
      it(`${slug} : pas de « ${nom} »`, () => {
        assert.doesNotMatch(texteDuDocument(slug), motif);
      });
    }
  }
});

describe("Conditions générales d'utilisation : la page et ses liens", () => {
  it("ont leur page, qui lit le document par son adresse", () => {
    const page = lire("src/app/conditions-utilisation/page.tsx");
    assert.match(page, /getLegalDocument\("conditions-utilisation"\)/);
    assert.match(page, /LegalDocumentPage/);
  });

  for (const chemin of [
    "src/components/landing/footer.tsx",
    "src/app/(auth)/layout.tsx",
    "src/app/(auth)/inscription/page.tsx",
    "src/app/not-found.tsx",
  ]) {
    it(`sont liées depuis ${chemin}, avec les trois autres pages légales`, () => {
      const source = lire(chemin);
      for (const adresse of [
        "/conditions-utilisation",
        "/mentions-legales",
        "/confidentialite",
        "/politique-de-contenu",
      ]) {
        assert.ok(source.includes(`"${adresse}"`), adresse);
      }
    });
  }
});
