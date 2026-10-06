/**
 * Écran d'administration des opportunités (lot L4) : ce que le formulaire
 * accepte, ce que l'écran annonce, et ce que ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions, la page et le formulaire
 * sont lus comme du texte ; les droits eux-mêmes sont éprouvés contre la base
 * par tests/opportunites.test.mjs.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { GENRES } from "../src/lib/fiche.ts";
import { descriptionDe } from "../src/lib/journal-administration.ts";
import {
  AIDES_STATUT,
  CATEGORIES_OPPORTUNITE,
  jourCourant,
  lireOpportunite,
  lirePays,
  LONGUEURS_OPPORTUNITE,
  montantEnClair,
  STATUTS_OPPORTUNITE,
  statutPresente,
} from "../src/lib/opportunites.ts";
import { FORMATS } from "../src/lib/projets.ts";

const DOSSIER = "src/app/(app)/administration/opportunites";
const MIGRATION = "supabase/migrations/20261006230000_opportunites.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const AUJOURDHUI = "2026-10-06";
const REFERENTIELS = { formats: FORMATS, genres: GENRES };

/** Un formulaire complet et valide, que chaque test décline. */
const SAISIE = {
  name: "  Fonds   Image ",
  organization: "Organisation fictive",
  category: "fonds",
  description: "Soutien au développement.\r\nSecond paragraphe.",
  website: "https://exemple.org/",
  application_url: "https://exemple.org/candidater",
  countries: "cm, GA ; cg",
  formats: ["documentaire", "long_metrage"],
  genres: ["drame"],
  budget_min: "5 000 000",
  budget_max: "20 000 000",
  currency: "xaf",
  opens_on: "2026-09-01",
  deadline: "2026-12-31",
  requirements: "Être établi dans un pays éligible.",
  source_url: "https://exemple.org/appel",
  collected_on: "2026-10-01",
  source_excerpt: "Le fonds accorde de 5 à 20 millions.",
  status: "verifie",
};

const lu = (surcharge = {}) => {
  const saisie = { ...SAISIE, ...surcharge };
  return lireOpportunite(
    (champ) => saisie[champ],
    (champ) => (Array.isArray(saisie[champ]) ? saisie[champ] : []),
    AUJOURDHUI,
    REFERENTIELS,
  );
};

describe("Opportunités : lecture du formulaire", () => {
  it("rend des valeurs nettes : espaces resserrés, codes en majuscules, montants en nombres", () => {
    assert.deepEqual(lu(), {
      valeurs: {
        name: "Fonds Image",
        organization: "Organisation fictive",
        category: "fonds",
        description: "Soutien au développement.\nSecond paragraphe.",
        website: "https://exemple.org/",
        application_url: "https://exemple.org/candidater",
        countries: ["CM", "GA", "CG"],
        // Dans l'ordre du référentiel, quel que soit celui des cases cochées.
        formats: ["long_metrage", "documentaire"],
        genres: ["drame"],
        budget_min: 5000000,
        budget_max: 20000000,
        currency: "XAF",
        opens_on: "2026-09-01",
        deadline: "2026-12-31",
        requirements: "Être établi dans un pays éligible.",
        source_url: "https://exemple.org/appel",
        collected_on: "2026-10-01",
        source_excerpt: "Le fonds accorde de 5 à 20 millions.",
        status: "verifie",
      },
    });
  });

  it("ce que la source ne dit pas reste vide, et non inventé", () => {
    const { valeurs } = lu({
      description: "",
      website: "",
      application_url: "",
      countries: "",
      formats: [],
      genres: [],
      budget_min: "",
      budget_max: "",
      currency: "",
      opens_on: "",
      deadline: "",
      requirements: "",
      source_url: "",
      collected_on: "",
      source_excerpt: "",
      status: "non_verifie",
    });
    assert.deepEqual(
      [valeurs.website, valeurs.budget_min, valeurs.budget_max, valeurs.currency, valeurs.deadline],
      [null, null, null, null, null],
    );
    assert.deepEqual([valeurs.countries, valeurs.formats, valeurs.genres], [[], [], []]);
    assert.equal(valeurs.status, "non_verifie");
  });

  it("« vérifiée » exige la source, la date de collecte et l'extrait", () => {
    for (const [raison, surcharge] of [
      ["sans source", { source_url: "" }],
      ["sans date de collecte", { collected_on: "" }],
      ["sans extrait", { source_excerpt: "   " }],
    ]) {
      const resultat = lu(surcharge);
      assert.ok("erreur" in resultat, raison);
      assert.match(resultat.erreur, /ne se dit vérifiée qu'avec l'adresse de sa source/, raison);
    }
    // Les quatre autres statuts s'enregistrent sans source.
    for (const status of ["non_verifie", "expire", "introuvable", "demo"]) {
      assert.ok(
        "valeurs" in lu({ status, source_url: "", collected_on: "", source_excerpt: "" }),
        status,
      );
    }
  });

  it("refuse tout ce que la base refuserait, en nommant le champ", () => {
    for (const [raison, surcharge, attendu] of [
      ["nom vide", { name: "   " }, /Donnez un nom/],
      ["nom trop long", { name: "a".repeat(201) }, /Donnez un nom/],
      ["organisme vide", { organization: "" }, /Nommez l'organisme/],
      ["catégorie inconnue", { category: "loterie" }, /Catégorie inconnue/],
      ["statut inconnu", { status: "certifie" }, /Statut inconnu/],
      ["description trop longue", { description: "a".repeat(5001) }, /La description/],
      ["extrait trop long", { source_excerpt: "a".repeat(2001) }, /L'extrait de la source/],
      ["site en clair", { website: "http://exemple.org/" }, /Le site de l'organisme/],
      ["source sans protocole", { source_url: "exemple.org/appel" }, /L'adresse de la source/],
      [
        "candidature avec identifiants",
        { application_url: "https://a:b@exemple.org/" },
        /La page de candidature/,
      ],
      ["adresse avec espace", { website: "https://exemple.org/a b" }, /Le site de l'organisme/],
      ["pays en toutes lettres", { countries: "Cameroun" }, /Pays éligibles/],
      ["format inconnu", { formats: ["clip"] }, /Type de projet ou genre inconnu/],
      ["genre inconnu", { genres: ["western"] }, /Type de projet ou genre inconnu/],
      ["montant décimal", { budget_min: "5000,50" }, /nombres entiers/],
      ["montant négatif", { budget_max: "-5" }, /nombres entiers/],
      ["montant démesuré", { budget_max: "9".repeat(13) }, /nombres entiers/],
      ["minimum au-dessus du maximum", { budget_min: "30000000" }, /dépasse le montant maximal/],
      ["devise en toutes lettres", { currency: "francs" }, /code à trois lettres/],
      ["montant sans devise", { currency: "" }, /ne va pas sans sa devise/],
      ["date hors calendrier", { deadline: "2026-02-30" }, /AAAA-MM-JJ/],
      ["date à la française", { opens_on: "01/09/2026" }, /AAAA-MM-JJ/],
      [
        "ouverture après la date limite",
        { opens_on: "2027-01-01" },
        /ne peut pas suivre la date limite/,
      ],
      ["collecte dans l'avenir", { collected_on: "2026-10-07" }, /ne peut pas être dans l'avenir/],
      ["caractère de contrôle dans le nom", { name: "Fonds\u0007Image" }, /Donnez un nom/],
    ]) {
      const resultat = lu(surcharge);
      assert.ok("erreur" in resultat, raison);
      assert.match(resultat.erreur, attendu, raison);
    }
    // La collecte du jour même est admise.
    assert.ok("valeurs" in lu({ collected_on: AUJOURDHUI }));
  });

  it("lit des codes de pays, sans doublon, et refuse le reste", () => {
    assert.deepEqual(lirePays("cm, GA;cg  CM"), ["CM", "GA", "CG"]);
    assert.deepEqual(lirePays(""), []);
    assert.equal(lirePays("Cameroun"), null);
    assert.equal(lirePays("CMR"), null);
    assert.equal(lirePays("C1"), null);
  });
});

describe("Opportunités : ce que l'écran annonce", () => {
  it("une opportunité vérifiée dont la date limite est passée se présente comme expirée", () => {
    assert.equal(
      statutPresente({ status: "verifie", deadline: "2026-10-05" }, AUJOURDHUI),
      "expire",
    );
    // Le jour même, elle est encore ouverte.
    assert.equal(
      statutPresente({ status: "verifie", deadline: AUJOURDHUI }, AUJOURDHUI),
      "verifie",
    );
    assert.equal(statutPresente({ status: "verifie", deadline: null }, AUJOURDHUI), "verifie");
    // Une date passée ne fait pas d'une opportunité non vérifiée une opportunité visible.
    for (const status of ["non_verifie", "introuvable", "demo"]) {
      assert.equal(statutPresente({ status, deadline: "2020-01-01" }, AUJOURDHUI), status);
    }
    // Un statut inconnu ne se présente jamais comme vérifié.
    assert.equal(statutPresente({ status: "certifie", deadline: null }, AUJOURDHUI), "non_verifie");
    assert.equal(jourCourant(new Date("2026-10-06T23:59:59Z")), "2026-10-06");
  });

  it("dit un montant tel qu'il est renseigné, et « non fourni » sinon", () => {
    const montant = (budget_min, budget_max, currency = "XAF") =>
      montantEnClair({ budget_min, budget_max, currency }).replace(/[  ]/g, " ");
    assert.equal(montant(5000000, 20000000), "De 5 000 000 à 20 000 000 XAF");
    assert.equal(montant(5000000, 5000000), "5 000 000 XAF");
    assert.equal(montant(5000000, null), "À partir de 5 000 000 XAF");
    assert.equal(montant(null, 30000, "EUR"), "Jusqu'à 30 000 EUR");
    assert.equal(montant(null, null), "Montant non fourni.");
    assert.equal(montant(5000000, null, null), "Montant non fourni.");
  });

  it("les référentiels de l'écran sont ceux de la base", () => {
    const migration = lire(MIGRATION);
    const liste = (contrainte) =>
      [
        ...new RegExp(`constraint ${contrainte} check \\(([\\s\\S]*?)\\n  \\)`)
          .exec(migration)[1]
          .matchAll(/'([a-z_]+)'/g),
      ].map((m) => m[1]);
    assert.deepEqual(liste("opportunite_categorie_connue"), Object.keys(CATEGORIES_OPPORTUNITE));
    assert.deepEqual(liste("opportunite_statut_connu"), Object.keys(STATUTS_OPPORTUNITE));
    assert.deepEqual(liste("opportunite_genres"), Object.keys(GENRES));
    assert.deepEqual(Object.keys(AIDES_STATUT), Object.keys(STATUTS_OPPORTUNITE));
    // Les bornes des textes.
    assert.match(migration, /char_length\(btrim\(name\)\) between 1 and 200/);
    assert.match(migration, /char_length\(description\) <= 5000/);
    assert.match(migration, /char_length\(source_excerpt\) <= 2000/);
    assert.deepEqual(
      [
        LONGUEURS_OPPORTUNITE.name,
        LONGUEURS_OPPORTUNITE.description,
        LONGUEURS_OPPORTUNITE.source_excerpt,
      ],
      [200, 5000, 2000],
    );
  });

  it("chaque statut dit ce qu'il engage ; une démonstration ne passe pas pour réelle", () => {
    assert.match(
      AIDES_STATUT.verifie,
      /exige l'adresse de la source, la date de collecte et l'extrait/,
    );
    assert.match(AIDES_STATUT.demo, /Jamais montré aux comptes/);
    assert.match(AIDES_STATUT.non_verifie, /Invisible des comptes/);
    assert.match(AIDES_STATUT.introuvable, /Invisible des comptes/);
    assert.match(AIDES_STATUT.expire, /présentée comme expirée/);
  });

  it("le journal met chaque écriture en mots, avec le changement de statut", () => {
    const annuaire = { comptes: new Map(), projets: new Map() };
    const entree = (details) => ({
      id: 1,
      created_at: "2026-10-06T00:00:00Z",
      actor_id: "a",
      action: "opportunite",
      project_id: null,
      details,
    });
    assert.equal(
      descriptionDe(
        entree({ operation: "ajout", nom: "Fonds Image", organisme: "OIF", statut: "non_verifie" }),
        annuaire,
      ),
      "a ajouté au catalogue l'opportunité « Fonds Image » de OIF (non vérifiée)",
    );
    assert.equal(
      descriptionDe(
        entree({
          operation: "modification",
          nom: "Fonds Image",
          organisme: "OIF",
          statut: "verifie",
          ancien_statut: "non_verifie",
        }),
        annuaire,
      ),
      "a modifié l'opportunité « Fonds Image » de OIF : non vérifiée → vérifiée",
    );
    assert.equal(
      descriptionDe(
        entree({ operation: "retrait", nom: "Fonds Image", organisme: "OIF", statut: "expire" }),
        annuaire,
      ),
      "a retiré du catalogue l'opportunité « Fonds Image » de OIF (expirée)",
    );
    // Détails incomplets : une phrase lisible, sans « undefined ».
    assert.doesNotMatch(descriptionDe(entree({}), annuaire), /undefined|null/);
  });
});

describe("Opportunités : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions.ts`));

  it("le rôle est vérifié avant toute écriture, et l'identifiant contrôlé", () => {
    assert.match(source, /^"use server";/);
    for (const nomAction of ["enregistrerOpportunite", "supprimerOpportunite"]) {
      const debut = source.indexOf(`export async function ${nomAction}(`);
      assert.ok(debut >= 0, nomAction);
      const corps = source.slice(debut, source.indexOf("\n}\n", debut));
      const garde = corps.indexOf("await exigerAcces(supabase)");
      const role = corps.indexOf('supabase.rpc("is_admin")');
      const ecriture = corps.indexOf('.from("funding_opportunities")');
      assert.ok(
        garde >= 0 && role > garde && ecriture > role,
        `${nomAction} : session, rôle, puis écriture`,
      );
      assert.match(corps, /if \(!estAdministrateur\) \{/, nomAction);
      assert.match(corps, /UUID\.test\(id\)/, nomAction);
    }
  });

  it("chaque valeur passe par la lecture commune ; ni auteur ni date ne viennent du formulaire", () => {
    assert.match(
      source,
      /lireOpportunite\(\s+\(champ\) => formData\.get\(champ\),\s+\(champ\) => formData\.getAll\(champ\),\s+jourCourant\(\),\s+\{ formats: FORMATS, genres: GENRES \},\s+\)/,
    );
    assert.match(source, /\.update\(valeurs\)\s+\.eq\("id", id\)/);
    assert.match(source, /\.insert\(valeurs\)/);
    // Ce qui s'écrit est ce que la lecture a rendu, et rien d'autre du formulaire.
    assert.match(
      source,
      /const valeurs = \{ \.\.\.lecture\.valeurs, formats: lecture\.valeurs\.formats as ProjectFormat\[\] \};/,
    );
    assert.doesNotMatch(source, /fromEntries|\.(insert|update)\(formData/);
    assert.doesNotMatch(source, /created_by|updated_by|created_at|updated_at/);
    // Aucune écriture au journal depuis l'écran : la base l'inscrit elle-même.
    assert.doesNotMatch(source, /admin_audit_log|journaliser/);
    assert.doesNotMatch(source, /fetch\(|process\.env|service_role/);
    assert.match(source, /revalidatePath\("\/administration\/journal"\)/);
  });
});

describe("Opportunités : page et formulaire", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const formulaire = sansCommentaires(lire(`${DOSSIER}/formulaire.tsx`));

  it("la page n'existe que pour l'administration, et sa lecture est bornée", () => {
    assert.doesNotMatch(lire(`${DOSSIER}/page.tsx`), /^"use client";/);
    assert.match(page, /if \(!user\) \{\s+redirect\("\/connexion"\);/);
    assert.match(page, /if \(!estAdministrateur\) \{\s+notFound\(\);/);
    assert.ok(page.indexOf("notFound();") < page.indexOf('.from("funding_opportunities")'));
    assert.match(
      page,
      /\.order\("updated_at", \{ ascending: false \}\)\s+\.limit\(LIMITE_OPPORTUNITES\)/,
    );
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(lire("src/app/(app)/navigation.tsx"), /href: "\/administration\/opportunites"/);
  });

  it("ce qui manque est dit comme non fourni, et un catalogue vide n'affiche rien de fictif", () => {
    assert.ok((page.match(/"Information non fournie\."/g) ?? []).length >= 5);
    assert.match(page, /\{montantEnClair\(opportunite\)\}/);
    assert.match(page, /la plateforme n&apos;affiche aucune opportunité fictive/);
    assert.match(page, /sans rien compléter de mémoire/);
    // Le statut affiché est celui du jour, et l'écran dit quand la date l'a fait expirer.
    assert.match(page, /const statut = statutPresente\(opportunite, aujourdhui\);/);
    assert.match(page, /expireeParSaDate \? " — date limite passée" : ""/);
    // La source s'ouvre à part, sans transmettre la page d'origine.
    assert.match(page, /target="_blank"\s+rel="noopener noreferrer nofollow"/);
    assert.match(page, /lue le \$\{enJour\(opportunite\.collected_on\)\}/);
    for (const fichier of [page, formulaire]) {
      assert.doesNotMatch(fichier, /dangerouslySetInnerHTML/);
      assert.doesNotMatch(fichier, /garanti|certifi|officiel/i);
    }
  });

  it("le formulaire dit ce que chaque statut engage, et tient ses bornes du module", () => {
    assert.match(lire(`${DOSSIER}/formulaire.tsx`), /^"use client";/);
    assert.match(formulaire, /\{AIDES_STATUT\[code\]\}/);
    assert.match(formulaire, /<legend className="px-2 text-sm font-medium">Provenance<\/legend>/);
    assert.match(
      formulaire,
      /Sans ces trois champs, une opportunité ne\s+peut pas être dite vérifiée\./,
    );
    assert.match(formulaire, /recopié tel quel/);
    assert.match(formulaire, /maxLength=\{LONGUEURS_OPPORTUNITE\.name\}/);
    assert.doesNotMatch(formulaire, /maxLength=\{\d{2,}\}/);
    // Par défaut, une opportunité naît non vérifiée.
    assert.match(formulaire, /opportunite\?\.status \?\? "non_verifie"/);
    // Une saisie refusée n'est pas effacée.
    assert.match(
      formulaire,
      /evenement\.preventDefault\(\);\s+const donnees = new FormData\(evenement\.currentTarget\);\s+startTransition\(\(\) => action\(donnees\)\);/,
    );
    // Chaque case et chaque bouton radio a son étiquette.
    assert.match(formulaire, /htmlFor=\{`\$\{prefixe\}-\$\{name\}-\$\{code\}`\}/);
    assert.match(formulaire, /htmlFor=\{`\$\{p\}-status-\$\{code\}`\}/);
  });
});
