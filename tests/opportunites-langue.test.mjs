/**
 * Langue, durée et stade d'une opportunité (lot OP2) : le filtre par langue,
 * ce que le catalogue en dit, et l'accord des bornes entre l'écran, la fiche
 * d'un projet et la base.
 *
 * Les règles sont un module pur ; les pages, le formulaire et la migration
 * sont lus comme du texte. Aucune base, aucun fournisseur. Les opportunités
 * d'ici sont FICTIVES.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { DUREE_MINUTES, GENRES } from "../src/lib/fiche.ts";
import {
  DUREE_OPPORTUNITE,
  dureeEnClair,
  filtrerParLangue,
  LANGUES_OPPORTUNITE,
  languesDuCatalogue,
  lireFiltreLangue,
  lireFiltres,
} from "../src/lib/opportunites.ts";
import { ETAPES, FORMATS } from "../src/lib/projets.ts";

const MIGRATION = "supabase/migrations/20261009000000_opportunites_langue_duree_stade.sql";
const LISTE = "src/app/(app)/opportunites/(liste)";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentairesSql = (source) => source.replace(/^\s*--.*$/gm, "");

const fiche = (name, languages) => ({ name, languages });
const noms = (liste) => liste.map((o) => o.name);
const CATALOGUE = [
  fiche("Sans précision", []),
  fiche("Francophone", ["fr"]),
  fiche("Bilingue", ["fr", "en"]),
  fiche("Lusophone", ["pt"]),
];

describe("Langue : le référentiel", () => {
  it("cinq langues, et aucune autre", () => {
    assert.deepEqual(LANGUES_OPPORTUNITE, {
      fr: "Français",
      en: "Anglais",
      pt: "Portugais",
      ar: "Arabe",
      es: "Espagnol",
    });
  });

  it("la base tient la même liste que l'écran", () => {
    const migration = sansCommentairesSql(lire(MIGRATION));
    const liste = /languages <@ array\[([^\]]+)\]::text\[\]/.exec(migration)[1];
    assert.deepEqual(
      liste.split(",").map((code) => code.trim().replaceAll("'", "")),
      Object.keys(LANGUES_OPPORTUNITE),
    );
  });
});

describe("Langue : lecture de l'adresse", () => {
  const filtre = (saisie = {}) => lireFiltreLangue((champ) => saisie[champ]);

  it("sans rien dans l'adresse, le filtre est inactif", () => {
    assert.equal(filtre(), null);
    assert.equal(filtre({ langue: "" }), null);
  });

  it("lit un code du référentiel, casse et espaces mis à part", () => {
    assert.equal(filtre({ langue: "fr" }), "fr");
    assert.equal(filtre({ langue: " EN " }), "en");
  });

  it("une valeur inconnue est ignorée plutôt que refusée", () => {
    for (const valeur of ["sw", "français", "fr,en", "toString", "__proto__", ["fr"], 12, null]) {
      assert.equal(filtre({ langue: valeur }), null, String(valeur));
    }
  });

  it("le filtre est tenu à part : la lecture commune ne le connaît pas", () => {
    const lus = lireFiltres((champ) => ({ langue: "fr" })[champ], {
      formats: FORMATS,
      genres: GENRES,
    });
    assert.deepEqual(Object.keys(lus), [
      "texte",
      "categorie",
      "pays",
      "format",
      "genre",
      "echeance",
    ]);
  });
});

describe("Langue : ce que le filtre retient", () => {
  it("inactif, il rend tout, dans l'ordre reçu, sans toucher à la liste", () => {
    const rendues = filtrerParLangue(CATALOGUE, null);
    assert.deepEqual(noms(rendues), noms(CATALOGUE));
    assert.notEqual(rendues, CATALOGUE);
  });

  it("ne retient que les opportunités qui demandent cette langue", () => {
    assert.deepEqual(noms(filtrerParLangue(CATALOGUE, "fr")), ["Francophone", "Bilingue"]);
    assert.deepEqual(noms(filtrerParLangue(CATALOGUE, "en")), ["Bilingue"]);
    assert.deepEqual(noms(filtrerParLangue(CATALOGUE, "ar")), []);
  });

  it("une opportunité qui ne dit rien de la langue n'est jamais retenue : « non précisé » n'est pas « toutes »", () => {
    for (const langue of Object.keys(LANGUES_OPPORTUNITE)) {
      assert.ok(!noms(filtrerParLangue(CATALOGUE, langue)).includes("Sans précision"), langue);
    }
  });

  it("ne propose que les langues qu'une opportunité demande, dans l'ordre du référentiel", () => {
    assert.deepEqual(languesDuCatalogue(CATALOGUE), ["fr", "en", "pt"]);
    assert.deepEqual(languesDuCatalogue([fiche("Sans précision", [])]), []);
    // Un code que le référentiel ne connaît pas n'est pas proposé.
    assert.deepEqual(languesDuCatalogue([fiche("Ancienne", ["sw", "es"])]), ["es"]);
  });
});

describe("Langue : page et formulaire du catalogue", () => {
  const page = lire(`${LISTE}/page.tsx`);
  const formulaire = lire(`${LISTE}/filtres.tsx`);

  it("la page applique le filtre sur les lignes lues, en dernier, sans rien ajouter à la requête", () => {
    assert.match(page, /const langue = lireFiltreLangue\(\(champ\) => parametres\[champ\]\);/);
    assert.match(page, /const affichees = filtrerParLangue\(retenues, langue\);/);
    assert.doesNotMatch(page, /\.(contains|overlaps|cs|ov)\(/);
    // La liste affichée est bien celle que le filtre a rendue.
    assert.match(page, /\{affichees\.map\(\(opportunite\) => \{/);
    assert.doesNotMatch(page, /\{retenues\.map\(/);
  });

  it("un filtre par langue actif se dit, et se retire avec les autres", () => {
    assert.match(page, /const filtree = actifs \|\| langue !== null;/);
    assert.match(page, /actifs=\{filtree\}/);
    assert.match(
      page,
      /\{filtree \? ` sur \$\{catalogue\.length\}, d'après vos filtres\.` : "\."\}/,
    );
  });

  it("la page lit les langues du catalogue, et dit ce que le filtre écarte", () => {
    assert.match(page, /genres, languages, budget_min/);
    assert.match(page, /const langues = languesDuCatalogue\(catalogue\);/);
    assert.match(page, /du genre ou de la langue\s+n&apos;y figurent pas/);
  });

  it("le formulaire ne propose la langue que si le catalogue en demande une", () => {
    assert.match(formulaire, /\{langues\.length \? \(\s+<Choix\s+nom="langue"/);
    assert.match(formulaire, /libelle="Langue demandée"/);
    assert.match(formulaire, /LANGUES_OPPORTUNITE\[code\]/);
    assert.doesNotMatch(formulaire, /"use client"/);
  });
});

describe("Durée : ce que le catalogue en dit", () => {
  const duree = (min, max) =>
    dureeEnClair({ duration_min_minutes: min, duration_max_minutes: max });

  it("une fourchette, une borne seule, ou rien", () => {
    assert.equal(duree(52, 90), "De 52 à 90 minutes");
    assert.equal(duree(52, null), "Au moins 52 minutes");
    assert.equal(duree(null, 30), "Au plus 30 minutes");
    assert.equal(duree(26, 26), "26 minutes");
    assert.equal(duree(null, 1), "Au plus 1 minute");
    // Rien de dit : à l'écran de l'écrire, pas à la règle de l'inventer.
    assert.equal(duree(null, null), null);
  });

  it("les bornes sont celles de la durée d'un projet, à l'écran comme en base", () => {
    assert.deepEqual({ ...DUREE_OPPORTUNITE }, { ...DUREE_MINUTES });
    const migration = sansCommentairesSql(lire(MIGRATION));
    for (const colonne of ["duration_min_minutes", "duration_max_minutes"]) {
      assert.match(
        migration,
        new RegExp(`${colonne} between ${DUREE_OPPORTUNITE.min} and ${DUREE_OPPORTUNITE.max}\\)`),
        colonne,
      );
    }
    assert.match(migration, /duration_min_minutes <= duration_max_minutes/);
  });
});

describe("Langue, durée, stade : la migration", () => {
  const migration = sansCommentairesSql(lire(MIGRATION));

  it("quatre colonnes, vides par défaut : « non précisé », jamais « tout »", () => {
    assert.match(migration, /add column languages text\[\] not null default '\{\}'/);
    assert.match(migration, /add column stages public\.project_stage\[\] not null default '\{\}'/);
    assert.match(migration, /add column duration_min_minutes integer,/);
    assert.match(migration, /add column duration_max_minutes integer,/);
  });

  it("les stades sont ceux d'un projet : l'énumération de la base, sans seconde liste", () => {
    assert.match(migration, /stages public\.project_stage\[\]/);
    assert.ok(Object.keys(ETAPES).length >= 1);
  });

  it("l'écriture est accordée pour ces quatre colonnes, et rien d'autre ne change", () => {
    for (const droit of ["insert", "update"]) {
      assert.match(
        migration,
        new RegExp(
          `grant ${droit} \\(languages, stages, duration_min_minutes, duration_max_minutes\\)\\s+on table public\\.funding_opportunities to authenticated;`,
        ),
        droit,
      );
    }
    assert.doesNotMatch(migration, /policy|security definer|\banon\b|drop |disable row level/i);
  });
});

describe("Langue, durée, stade : administration et fiche", () => {
  const formulaire = lire("src/app/(app)/administration/opportunites/formulaire.tsx");
  const administration = lire("src/app/(app)/administration/opportunites/page.tsx");
  const ficheOpportunite = lire("src/app/(app)/opportunites/[opportuniteId]/page.tsx");

  it("le formulaire saisit les quatre champs, depuis les référentiels", () => {
    assert.match(formulaire, /name="stages"\s+prefixe=\{p\}\s+choix=\{ETAPES\}/);
    assert.match(formulaire, /name="languages"\s+prefixe=\{p\}\s+choix=\{LANGUES_OPPORTUNITE\}/);
    assert.match(formulaire, /name="duration_min_minutes"/);
    assert.match(formulaire, /name="duration_max_minutes"/);
    // Une case non cochée veut dire « non précisé » : la légende le dit déjà.
    assert.match(formulaire, /aucune case : non précisé/);
    assert.match(formulaire, /Vide : non précisé\./);
  });

  it("le formulaire reprend ce qui a été saisi pour le modifier", () => {
    assert.match(formulaire, /coches=\{opportunite\?\.stages \?\? \[\]\}/);
    assert.match(formulaire, /coches=\{opportunite\?\.languages \?\? \[\]\}/);
    assert.match(
      formulaire,
      /defaultValue=\{opportunite\?\.duration_min_minutes\?\.toString\(\)\}/,
    );
    assert.match(
      formulaire,
      /defaultValue=\{opportunite\?\.duration_max_minutes\?\.toString\(\)\}/,
    );
    assert.match(
      administration,
      /genres, languages, stages, duration_min_minutes, duration_max_minutes, budget_min/,
    );
  });

  it("l'administration et la fiche disent ce que la source ne précise pas", () => {
    for (const [nom, source, absent] of [
      ["administration", administration, '"Information non fournie."'],
      ["fiche", ficheOpportunite, "NON_FOURNIE"],
    ]) {
      assert.ok(source.includes(`{dureeEnClair(opportunite) ?? ${absent}}`), `${nom} : durée`);
      assert.match(source, /libelles\(opportunite\.stages, ETAPES\)/, `${nom} : stades`);
      assert.match(
        source,
        /libelles\(opportunite\.languages, LANGUES_OPPORTUNITE\)/,
        `${nom} : langues`,
      );
    }
    assert.match(
      ficheOpportunite,
      /genres, languages, stages, duration_min_minutes, duration_max_minutes, budget_min/,
    );
  });
});
