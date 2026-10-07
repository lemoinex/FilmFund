/**
 * Consultation du catalogue par les équipes (lot L5a) : ce que les filtres
 * lisent et retiennent, l'ordre de la liste, et ce que les pages lisent.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les pages sont lues comme du texte ; ce
 * qu'un compte lit réellement du catalogue est éprouvé contre la base par
 * tests/opportunites.test.mjs. Les opportunités d'ici sont FICTIVES.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { GENRES } from "../src/lib/fiche.ts";
import {
  ECHEANCES,
  echeanceDe,
  filtrerCatalogue,
  filtresActifs,
  LIMITE_CATALOGUE,
  lireFiltres,
  RECHERCHE_MAX,
  STATUTS_VISIBLES,
} from "../src/lib/opportunites.ts";
import { FORMATS } from "../src/lib/projets.ts";

const DOSSIER = "src/app/(app)/opportunites";
const MIGRATION = "supabase/migrations/20261006230000_opportunites.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const AUJOURDHUI = "2026-10-07";
const REFERENTIELS = { formats: FORMATS, genres: GENRES };
const filtres = (saisie = {}) => lireFiltres((champ) => saisie[champ], REFERENTIELS);

/** Une opportunité fictive, que chaque test décline. */
const fiche = (name, surcharge = {}) => ({
  name,
  organization: "Organisme fictif",
  category: "fonds",
  description: "",
  countries: [],
  formats: [],
  genres: [],
  deadline: null,
  status: "verifie",
  ...surcharge,
});
const noms = (liste) => liste.map((o) => o.name);

describe("Consultation : lecture des filtres", () => {
  it("sans rien dans l'adresse, aucun filtre n'est actif", () => {
    const lus = filtres();
    assert.deepEqual(lus, {
      texte: "",
      categorie: null,
      pays: null,
      format: null,
      genre: null,
      echeance: null,
    });
    assert.equal(filtresActifs(lus), false);
  });

  it("lit chaque filtre connu", () => {
    const lus = filtres({
      q: "  fonds   image ",
      categorie: "residence",
      pays: "cm",
      format: "documentaire",
      genre: "drame",
      echeance: "a_venir",
    });
    assert.deepEqual(lus, {
      texte: "fonds image",
      categorie: "residence",
      pays: "CM",
      format: "documentaire",
      genre: "drame",
      echeance: "a_venir",
    });
    assert.equal(filtresActifs(lus), true);
  });

  it("ignore une valeur inconnue plutôt que de la transmettre", () => {
    const lus = filtres({
      categorie: "inconnue",
      pays: "Cameroun",
      format: "toString",
      genre: "__proto__",
      echeance: "demain",
    });
    assert.equal(filtresActifs(lus), false);
  });

  it("ignore un paramètre répété, qui arrive en tableau", () => {
    const lus = filtres({ q: ["a", "b"], categorie: ["fonds", "bourse"], pays: ["CM"] });
    assert.equal(filtresActifs(lus), false);
  });

  it("borne la recherche et refuse un caractère de contrôle", () => {
    assert.equal(filtres({ q: "a".repeat(500) }).texte.length, RECHERCHE_MAX);
    assert.equal(filtres({ q: "fonds\u0000image" }).texte, "");
  });
});

describe("Consultation : où en est la date limite", () => {
  it("distingue à venir, non fournie et passée", () => {
    assert.equal(echeanceDe({ status: "verifie", deadline: "2026-10-07" }, AUJOURDHUI), "a_venir");
    assert.equal(echeanceDe({ status: "verifie", deadline: null }, AUJOURDHUI), "sans_date");
    assert.equal(echeanceDe({ status: "verifie", deadline: "2026-10-06" }, AUJOURDHUI), "passee");
  });

  it("une opportunité dite expirée l'est, quelle que soit sa date", () => {
    assert.equal(echeanceDe({ status: "expire", deadline: null }, AUJOURDHUI), "passee");
    assert.equal(echeanceDe({ status: "expire", deadline: "2099-01-01" }, AUJOURDHUI), "passee");
  });

  it("le filtre propose exactement ces trois cas", () => {
    assert.deepEqual(Object.keys(ECHEANCES), ["a_venir", "sans_date", "passee"]);
  });
});

describe("Consultation : ce que les filtres retiennent", () => {
  const catalogue = [
    fiche("Sans précision"),
    fiche("Cameroun documentaire", {
      countries: ["CM", "GA"],
      formats: ["documentaire"],
      genres: ["societe"],
      deadline: "2026-12-31",
    }),
    fiche("Résidence d'écriture", {
      category: "residence",
      organization: "Atelier fictif",
      description: "Trois semaines pour un scénario de long métrage.",
      countries: ["SN"],
      formats: ["long_metrage"],
      deadline: "2026-11-15",
    }),
    fiche("Close", { countries: ["CM"], deadline: "2026-01-31" }),
  ];
  const retenues = (saisie) => noms(filtrerCatalogue(catalogue, filtres(saisie), AUJOURDHUI));

  it("sans filtre : tout, la date limite la plus proche d'abord, les expirées en dernier", () => {
    assert.deepEqual(retenues({}), [
      "Résidence d'écriture",
      "Cameroun documentaire",
      "Sans précision",
      "Close",
    ]);
  });

  it("une liste de pays vide veut dire « non précisé », pas « tous les pays »", () => {
    // Retenir « Sans précision » ferait dire à sa source ce qu'elle ne dit pas.
    assert.deepEqual(retenues({ pays: "CM" }), ["Cameroun documentaire", "Close"]);
    assert.deepEqual(retenues({ format: "documentaire" }), ["Cameroun documentaire"]);
    assert.deepEqual(retenues({ genre: "societe" }), ["Cameroun documentaire"]);
  });

  it("les filtres se cumulent", () => {
    assert.deepEqual(retenues({ pays: "CM", echeance: "a_venir" }), ["Cameroun documentaire"]);
    assert.deepEqual(retenues({ pays: "CM", echeance: "passee" }), ["Close"]);
    assert.deepEqual(retenues({ pays: "SN", format: "documentaire" }), []);
  });

  it("filtre par type et par état de la date limite", () => {
    assert.deepEqual(retenues({ categorie: "residence" }), ["Résidence d'écriture"]);
    assert.deepEqual(retenues({ echeance: "sans_date" }), ["Sans précision"]);
  });

  it("cherche dans le nom, l'organisme et la description, sans casse ni accent", () => {
    assert.deepEqual(retenues({ q: "RESIDENCE" }), ["Résidence d'écriture"]);
    assert.deepEqual(retenues({ q: "atelier" }), ["Résidence d'écriture"]);
    assert.deepEqual(retenues({ q: "scenario metrage" }), ["Résidence d'écriture"]);
    assert.deepEqual(retenues({ q: "scenario cameroun" }), []);
  });

  it("ne modifie pas le catalogue reçu", () => {
    const avant = noms(catalogue);
    filtrerCatalogue(catalogue, filtres({}), AUJOURDHUI);
    assert.deepEqual(noms(catalogue), avant);
  });
});

describe("Consultation : ce que les pages lisent", () => {
  // La liste vit dans un groupe de routes : son squelette de chargement ne
  // couvre pas la fiche, qui doit pouvoir répondre par un vrai 404.
  const liste = sansCommentaires(lire(`${DOSSIER}/(liste)/page.tsx`));
  const detail = sansCommentaires(lire(`${DOSSIER}/[opportuniteId]/page.tsx`));

  it("les statuts montrés aux équipes sont ceux que la politique leur ouvre", () => {
    const politique =
      /using \(status in \(([^)]+)\) or \(select public\.is_admin\(\)\)\)/.exec(
        lire(MIGRATION),
      )?.[1] ?? "";
    const ouverts = [...politique.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual([...STATUTS_VISIBLES].sort(), ouverts);
  });

  it("chaque page redit ce filtre : un administrateur n'y lit pas une démonstration", () => {
    for (const page of [liste, detail]) {
      assert.match(page, /\.from\("funding_opportunities"\)/);
      assert.match(page, /\.in\("status", STATUTS_VISIBLES\)/);
    }
  });

  it("chaque page vérifie la session avant de lire", () => {
    for (const page of [liste, detail]) {
      const session = page.indexOf("auth.getUser()");
      assert.ok(session > -1 && session < page.indexOf('.from("funding_opportunities")'));
      assert.match(page, /redirect\("\/connexion"\)/);
    }
  });

  it("la liste est bornée, et le dit quand la borne est atteinte", () => {
    assert.match(liste, /\.limit\(LIMITE_CATALOGUE\)/);
    assert.match(liste, /catalogue\.length >= LIMITE_CATALOGUE/);
    assert.ok(LIMITE_CATALOGUE <= 200);
  });

  it("aucun filtre ne part dans la requête : la saisie ne touche que les lignes lues", () => {
    assert.doesNotMatch(liste, /\.(ilike|like|or|textSearch|filter)\(/);
    assert.match(liste, /filtrerCatalogue\(catalogue, filtres, aujourdhui\)/);
  });

  it("aucun squelette de chargement ne couvre la fiche : il ferait répondre 200 à une page absente", () => {
    assert.equal(existsSync(new URL(`../${DOSSIER}/loading.tsx`, import.meta.url)), false);
    assert.equal(
      existsSync(new URL(`../${DOSSIER}/[opportuniteId]/loading.tsx`, import.meta.url)),
      false,
    );
    assert.equal(
      existsSync(
        new URL("../src/app/(app)/projets/[id]/opportunites/loading.tsx", import.meta.url),
      ),
      false,
    );
  });

  it("la fiche refuse un identifiant mal formé et répond 404 à ce qui n'est pas lisible", () => {
    assert.match(detail, /!UUID\.test\(opportuniteId\)[\s\S]*?notFound\(\)/);
    assert.match(detail, /\.maybeSingle\(\)[\s\S]*?if \(!opportunite\) \{\s*notFound\(\)/);
  });

  it("ce que la source ne dit pas s'affiche comme non fourni, et un catalogue vide n'invente rien", () => {
    assert.match(detail, /const NON_FOURNIE = "Information non fournie\."/);
    assert.match(liste, /Information non fournie\./);
    assert.match(liste, /aucune opportunité fictive/);
  });

  it("la fiche montre la source, le jour de sa lecture et l'extrait", () => {
    for (const colonne of ["source_url", "collected_on", "source_excerpt"]) {
      assert.match(detail, new RegExp(`opportunite\\.${colonne}`));
    }
    assert.match(detail, /Rien ne garantit qu&apos;elle n&apos;a pas changé depuis\./);
  });

  it("un lien venu du catalogue s'ouvre sans céder la page d'origine", () => {
    assert.match(detail, /rel="noopener noreferrer nofollow"/);
    assert.doesNotMatch(liste + detail, /dangerouslySetInnerHTML/);
  });

  it("aucune promesse : ni score, ni garantie, ni paiement", () => {
    assert.doesNotMatch(liste + detail, /garanti[es]?\b(?! qu)|compatib|score|%/i);
  });
});
