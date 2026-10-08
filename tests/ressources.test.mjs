/**
 * Rubrique « Ressources » : ce que la bibliothèque contient, ce qu'un lecteur
 * en voit, et ce que ses pages lisent.
 *
 * Module pur, sans base ni serveur : les contenus viennent du dépôt. Les pages
 * sont lues comme du texte ; leur rendu complet se vérifie dans le navigateur.
 * AUCUN APPEL À UN FOURNISSEUR, aucune génération.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  actionDe,
  AVERTISSEMENT_BROUILLON,
  CATEGORIES_RESSOURCE,
  estLienSur,
  filtrerRessources,
  filtresRessourcesActifs,
  INTRODUCTION_RESSOURCES,
  LIMITES_RESSOURCES,
  lireFiltresRessources,
  nombreRessources,
  RECHERCHE_RESSOURCES_MAX,
  RESSOURCES,
  ressourcesVisibles,
  STATUTS_RESSOURCE,
  trouverRessource,
  TYPES_RESSOURCE,
} from "../src/lib/ressources.ts";

const DOSSIER = "src/app/(app)/ressources";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/** Ressource d'essai : publiée, lisible sur la plateforme. */
const essai = (surcharge = {}) => ({
  slug: "essai",
  titre: "Structurer un synopsis",
  description: "Ce qui distingue un synopsis d'un résumé.",
  categorie: "ecriture",
  type: "guide",
  statut: "publie",
  langue: "fr",
  misAJourLe: "2026-10-08",
  sections: [{ id: "a", titre: "Titre", blocs: [{ type: "paragraphe", texte: "Texte." }] }],
  ...surcharge,
});

describe("Ressources : la bibliothèque du dépôt", () => {
  it("porte les quatre catégories et les quatre types de la spécification", () => {
    assert.deepEqual(Object.keys(CATEGORIES_RESSOURCE), [
      "ecriture",
      "dossier",
      "preproduction",
      "plateforme",
    ]);
    assert.deepEqual(Object.keys(TYPES_RESSOURCE), ["guide", "modele", "checklist", "reference"]);
    assert.deepEqual(Object.keys(STATUTS_RESSOURCE), ["brouillon", "publie"]);
    assert.equal(
      INTRODUCTION_RESSOURCES,
      "Guides, modèles et références pour développer votre projet et préparer votre dossier.",
    );
  });

  it("chaque ressource a une adresse stable et unique, une catégorie, un type et un statut connus", () => {
    assert.ok(RESSOURCES.length >= 5);
    const slugs = RESSOURCES.map((r) => r.slug);
    assert.equal(new Set(slugs).size, slugs.length, "aucun slug en double");
    for (const ressource of RESSOURCES) {
      assert.match(ressource.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/, ressource.slug);
      assert.ok(Object.hasOwn(CATEGORIES_RESSOURCE, ressource.categorie), ressource.slug);
      assert.ok(Object.hasOwn(TYPES_RESSOURCE, ressource.type), ressource.slug);
      assert.ok(Object.hasOwn(STATUTS_RESSOURCE, ressource.statut), ressource.slug);
      assert.equal(ressource.langue, "fr", ressource.slug);
      assert.ok(ressource.titre.trim().length >= 5, ressource.slug);
      assert.ok(ressource.description.trim().length >= 20, ressource.slug);
    }
  });

  it("une ressource est soit lue ici, soit une référence externe, jamais les deux ni aucune", () => {
    for (const ressource of RESSOURCES) {
      const interne = (ressource.sections?.length ?? 0) > 0;
      const externe = ressource.lien !== undefined;
      assert.notEqual(interne, externe, ressource.slug);
      assert.equal(externe, ressource.type === "reference", ressource.slug);
      assert.ok(actionDe(ressource), `${ressource.slug} : une action existe`);
    }
  });

  it("aucun lien ni fichier inventé : une référence est en https, sourcée et datée ; un modèle a son fichier", () => {
    for (const ressource of RESSOURCES) {
      if (ressource.lien) {
        assert.ok(estLienSur(ressource.lien.url), ressource.slug);
        assert.ok(ressource.lien.source.trim().length > 0, ressource.slug);
        assert.match(ressource.lien.verifieLe, JOUR, ressource.slug);
      }
      // Aucun champ de téléchargement n'existe : un modèle, s'il en vient un,
      // se lit ici comme un guide. Ajouter un fichier demandera de le prouver.
      assert.ok(!("fichier" in ressource), ressource.slug);
    }
    // Le contenu n'écrit aucune adresse : un lien ne se glisse pas dans un texte.
    const textes = JSON.stringify(RESSOURCES.map((r) => r.sections ?? []));
    assert.doesNotMatch(textes, /https?:\/\/|www\./);
  });

  it("une ressource publiée est datée ; un brouillon ne l'est pas, et rien n'est publié d'office", () => {
    for (const ressource of RESSOURCES) {
      if (ressource.statut === "publie") {
        assert.match(ressource.misAJourLe ?? "", JOUR, ressource.slug);
      } else {
        assert.equal(ressource.misAJourLe, null, ressource.slug);
      }
    }
    // Les cinq contenus de départ attendent une validation : la publication
    // est une décision, pas un effet du lot.
    const brouillons = RESSOURCES.filter((r) => r.statut === "brouillon").map((r) => r.slug);
    for (const slug of [
      "rediger-une-logline",
      "structurer-un-synopsis",
      "preparer-une-note-d-intention",
      "pieces-d-un-dossier-de-candidature",
      "checklist-de-preproduction",
    ]) {
      assert.ok(brouillons.includes(slug), slug);
    }
  });

  it("le contenu n'est que du texte : ni balise, ni syntaxe, ni section vide ou en double", () => {
    for (const ressource of RESSOURCES) {
      const ids = (ressource.sections ?? []).map((s) => s.id);
      assert.equal(new Set(ids).size, ids.length, `${ressource.slug} : sections uniques`);
      for (const section of ressource.sections ?? []) {
        assert.match(section.id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${ressource.slug}/${section.id}`);
        assert.ok(section.titre.trim().length > 0);
        assert.ok(section.blocs.length > 0, `${ressource.slug}/${section.id}`);
        for (const bloc of section.blocs) {
          const textes = bloc.type === "paragraphe" ? [bloc.texte] : bloc.elements;
          assert.ok(["paragraphe", "liste", "points"].includes(bloc.type));
          assert.ok(textes.length > 0);
          assert.equal(new Set(textes).size, textes.length, "aucun élément en double");
          for (const texte of textes) {
            assert.ok(texte.trim().length > 0);
            assert.doesNotMatch(texte, /<[a-z/!]|\*\*|\]\(|^#|\n/i, texte.slice(0, 40));
          }
        }
      }
    }
  });

  it("ne promet ni fonds, ni montant, ni échéance, ni éligibilité", () => {
    const tout = JSON.stringify(RESSOURCES);
    assert.doesNotMatch(tout, /\d[\d\s.,]*(€|\$|XAF|FCFA|euros|dollars)/i);
    assert.doesNotMatch(tout, /vous êtes éligible|garanti|sera financé|date limite : \d/i);
    assert.match(LIMITES_RESSOURCES, /ne remplacent ni le règlement d'un appel/);
    assert.match(LIMITES_RESSOURCES, /sa source seule fait foi/);
  });
});

describe("Ressources : ce qu'un lecteur voit", () => {
  const liste = [
    essai({ slug: "z-publie", titre: "Zèbre" }),
    essai({ slug: "brouillon", titre: "Abricot", statut: "brouillon", misAJourLe: null }),
    essai({ slug: "a-publie", titre: "Écriture" }),
  ];

  it("un compte ne voit que le publié ; l'administration voit aussi les brouillons, après", () => {
    assert.deepEqual(
      ressourcesVisibles(false, liste).map((r) => r.slug),
      ["a-publie", "z-publie"],
    );
    assert.deepEqual(
      ressourcesVisibles(true, liste).map((r) => r.slug),
      ["a-publie", "z-publie", "brouillon"],
    );
  });

  it("un brouillon n'a pas d'adresse pour un compte ordinaire", () => {
    assert.equal(trouverRessource("brouillon", false, liste), null);
    assert.equal(trouverRessource("brouillon", true, liste)?.slug, "brouillon");
    assert.equal(trouverRessource("a-publie", false, liste)?.slug, "a-publie");
    assert.equal(trouverRessource("inconnue", true, liste), null);
    assert.equal(trouverRessource("../a-publie", true, liste), null);
  });

  it("au départ, un compte ordinaire ne voit rien : aucun contenu n'est publié d'office", () => {
    assert.deepEqual(ressourcesVisibles(false), []);
    assert.equal(ressourcesVisibles(true).length, RESSOURCES.length);
    for (const ressource of RESSOURCES) {
      assert.equal(trouverRessource(ressource.slug, false), null, ressource.slug);
    }
  });

  it("l'action d'une carte existe seulement si sa destination existe", () => {
    assert.deepEqual(actionDe(essai()), { libelle: "Lire", externe: false });
    const reference = essai({
      type: "reference",
      sections: undefined,
      lien: { url: "https://exemple.org/guide", source: "Organisme", verifieLe: "2026-10-08" },
    });
    assert.deepEqual(actionDe(reference), { libelle: "Consulter la source", externe: true });
    assert.equal(actionDe(essai({ sections: [] })), null);
    assert.equal(actionDe(essai({ sections: undefined })), null);
    assert.equal(
      actionDe({ ...reference, lien: { ...reference.lien, url: "javascript:alert(1)" } }),
      null,
    );
  });

  it("n'admet qu'une adresse https pour une référence externe", () => {
    assert.ok(estLienSur("https://exemple.org/page"));
    for (const url of [
      "http://exemple.org",
      "javascript:alert(1)",
      "data:text/html,x",
      "ftp://exemple.org",
      "//exemple.org",
      "exemple.org",
      "https://localhost",
      "",
    ]) {
      assert.equal(estLienSur(url), false, url);
    }
  });
});

describe("Ressources : recherche et filtres", () => {
  const liste = [
    essai({ slug: "synopsis" }),
    essai({
      slug: "dossier",
      titre: "Vérifier les pièces d'un dossier",
      description: "Les points à contrôler avant le dépôt.",
      categorie: "dossier",
      type: "checklist",
    }),
  ];
  const filtres = (champs) => lireFiltresRessources((champ) => champs[champ]);

  it("lit les filtres d'une adresse, et ignore ce qu'il ne connaît pas", () => {
    assert.deepEqual(filtres({ q: "  synopsis   court ", categorie: "ecriture", type: "guide" }), {
      texte: "synopsis court",
      categorie: "ecriture",
      type: "guide",
    });
    assert.deepEqual(filtres({ categorie: "finance", type: "video", q: 12 }), {
      texte: "",
      categorie: null,
      type: null,
    });
    // Un paramètre répété : le premier seulement.
    assert.equal(filtres({ categorie: ["dossier", "ecriture"] }).categorie, "dossier");
    assert.equal(filtres({ categorie: "constructor" }).categorie, null);
    assert.equal(filtres({ q: "a".repeat(500) }).texte.length, RECHERCHE_RESSOURCES_MAX);
  });

  it("dit si un filtre restreint la liste", () => {
    assert.equal(filtresRessourcesActifs(filtres({})), false);
    assert.equal(filtresRessourcesActifs(filtres({ q: "x" })), true);
    assert.equal(filtresRessourcesActifs(filtres({ type: "guide" })), true);
  });

  it("cherche dans le titre et la description, sans casse ni accents, tous les mots", () => {
    const trouve = (champs) => filtrerRessources(liste, filtres(champs)).map((r) => r.slug);
    assert.deepEqual(trouve({}), ["synopsis", "dossier"]);
    assert.deepEqual(trouve({ q: "SYNOPSIS" }), ["synopsis"]);
    assert.deepEqual(trouve({ q: "resume" }), ["synopsis"]);
    assert.deepEqual(trouve({ q: "pieces depot" }), ["dossier"]);
    assert.deepEqual(trouve({ q: "synopsis depot" }), []);
    assert.deepEqual(trouve({ categorie: "dossier" }), ["dossier"]);
    assert.deepEqual(trouve({ type: "guide" }), ["synopsis"]);
    assert.deepEqual(trouve({ categorie: "dossier", type: "guide" }), []);
    assert.deepEqual(trouve({ categorie: "preproduction" }), []);
  });

  it("accorde le décompte", () => {
    assert.equal(nombreRessources(0), "Aucune ressource");
    assert.equal(nombreRessources(1), "1 ressource");
    assert.equal(nombreRessources(4), "4 ressources");
  });
});

describe("Ressources : pages et navigation", () => {
  const liste = lire(`${DOSSIER}/(liste)/page.tsx`);
  const filtres = lire(`${DOSSIER}/(liste)/filtres.tsx`);
  const detail = lire(`${DOSSIER}/[slug]/page.tsx`);
  const module_ = lire("src/lib/ressources.ts");
  const navigation = lire("src/app/(app)/navigation.tsx");

  it("les deux pages exigent une session, et ne lisent que le rôle", () => {
    for (const [nom, page] of [
      ["liste", liste],
      ["détail", detail],
    ]) {
      assert.match(page, /if \(!user\) \{\s+redirect\("\/connexion"\);/, nom);
      assert.deepEqual(
        [...page.matchAll(/\.rpc\("(\w+)"/g)].map((m) => m[1]),
        ["is_admin"],
        nom,
      );
      assert.doesNotMatch(page, /\.from\(|service_role|SERVICE_ROLE|createAdminClient/, nom);
      assert.doesNotMatch(page, /"use client"|"use server"|fetch\(/, nom);
      // Le rôle n'ouvre les brouillons que s'il vaut exactement vrai.
      assert.match(page, /estAdministrateur === true/, nom);
    }
  });

  it("la rubrique ne génère rien et n'appelle personne : ni IA, ni devis, ni réseau", () => {
    for (const source of [liste, filtres, detail, module_]) {
      assert.doesNotMatch(source, /creer_devis|accepter_devis|LIVRABLES_IA|propositions|worker/);
      assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|supabase\.storage/);
    }
    assert.doesNotMatch(module_, /^import /m);
  });

  it("un brouillon ou une adresse inconnue donnent la même page introuvable", () => {
    assert.match(detail, /trouverRessource\(slug, estAdministrateur === true\)/);
    assert.match(detail, /if \(!ressource\) \{\s+notFound\(\);/);
    // Aucun squelette ne couvre le détail : il ferait répondre 200 à une page absente.
    assert.ok(existsSync(new URL(`../${DOSSIER}/(liste)/loading.tsx`, import.meta.url)));
    assert.ok(!existsSync(new URL(`../${DOSSIER}/loading.tsx`, import.meta.url)));
    assert.ok(!existsSync(new URL(`../${DOSSIER}/[slug]/loading.tsx`, import.meta.url)));
  });

  it("le contenu s'affiche comme du texte, et un lien externe ne s'ouvre que s'il est sûr", () => {
    for (const page of [liste, detail]) {
      assert.doesNotMatch(page, /dangerouslySetInnerHTML|innerHTML/);
    }
    assert.match(detail, /\{bloc\.texte\}/);
    assert.match(
      detail,
      /ressource\.lien && estLienSur\(ressource\.lien\.url\) \? ressource\.lien : null/,
    );
    assert.match(detail, /target="_blank"\s+rel="noopener noreferrer"/);
    assert.match(detail, /la page a pu\s+changer depuis/);
    // La liste ne propose une action que si elle existe.
    assert.match(liste, /const action = actionDe\(ressource\);/);
    assert.match(liste, /\{action \? \(/);
  });

  it("la liste dit son introduction, ses limites, l'état vide et la recherche sans résultat", () => {
    assert.match(liste, /\{INTRODUCTION_RESSOURCES\}/);
    assert.match(liste, /\{LIMITES_RESSOURCES\}/);
    assert.match(liste, /Aucune ressource n&apos;est encore publiée\./);
    assert.match(liste, /n&apos;affiche aucun contenu qui n&apos;a pas été validé/);
    assert.match(liste, /Aucune ressource ne correspond à cette recherche\./);
    assert.match(liste, /\{nombreRessources\(retenues\.length\)\}/);
    assert.match(detail, /\{LIMITES_RESSOURCES\}/);
  });

  it("un brouillon porte son étiquette, sur la carte comme sur sa page", () => {
    assert.match(AVERTISSEMENT_BROUILLON, /visible de l'administration seulement/);
    for (const page of [liste, detail]) {
      assert.match(
        page,
        /\{STATUTS_RESSOURCE\[ressource\.statut\]\} — \{AVERTISSEMENT_BROUILLON\}/,
      );
    }
  });

  it("les filtres sont un formulaire en GET, accessible, sans requête à chaque frappe", () => {
    assert.match(filtres, /<form method="get" action="\/ressources" role="search"/);
    assert.doesNotMatch(filtres, /"use client"|onChange|useState|useEffect/);
    for (const champ of ["q", "categorie", "type"]) {
      assert.ok(filtres.includes(`name="${champ}"`) || filtres.includes(`nom="${champ}"`), champ);
    }
    assert.match(filtres, /<label htmlFor="filtre-q"/);
    assert.match(filtres, /<label htmlFor=\{id\}/);
    assert.match(filtres, /maxLength=\{RECHERCHE_RESSOURCES_MAX\}/);
    assert.match(filtres, /Object\.entries\(CATEGORIES_RESSOURCE\)/);
    assert.match(filtres, /Object\.entries\(TYPES_RESSOURCE\)/);
  });

  it("la rubrique est dans le menu de tous les comptes, une seule fois, et n'est plus annoncée", () => {
    const debut = navigation.indexOf("const RUBRIQUES: Rubrique[]");
    const rubriques = navigation.slice(debut, navigation.indexOf("\n];", debut));
    assert.match(rubriques, /libelle: "Ressources", icone: \w+, href: "\/ressources"/);
    assert.equal(navigation.split('"/ressources"').length - 1, 1);
    // Les autres rubriques sont inchangées : l'assistant reste annoncé, sans page.
    assert.match(rubriques, /\{ libelle: "Assistant IA", icone: \w+ \},/);
  });

  it("la spécification de la rubrique est versionnée", () => {
    const spec = lire("docs/product/Claude_Code_Ressources_FilmFund_Africa.md");
    assert.match(spec, /Rubrique « Ressources » de FilmFund Africa/);
    assert.match(spec, /ne les publie pas automatiquement/);
  });
});
