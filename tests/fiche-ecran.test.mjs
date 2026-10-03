/**
 * Fiche du projet et personnages (lot R1) : ce qu'une saisie doit respecter.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les droits ont leur propre suite.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CHAMPS_FICHE,
  DUREE_MINUTES,
  GENRES,
  LONGUEURS_FICHE,
  LONGUEURS_PERSONNAGE,
  MAX_PAYS,
  normaliserFiche,
  normaliserPersonnage,
  ROLES_PERSONNAGE,
} from "../src/lib/fiche.ts";

const PAYS = ["CM", "SN", "CI", "FR", "BE", "GA", "CG", "CD", "BJ", "TG", "ML", "BF"];

const lire = (saisie, champs = Object.keys(saisie)) => normaliserFiche(saisie, champs, PAYS);

describe("Fiche : champs", () => {
  it("ne lit que les champs demandés", () => {
    const { fiche } = lire({ theme: "La mer", genre: "drame" }, ["theme"]);
    assert.deepEqual(fiche, { theme: "La mer" });
  });

  it("refuse un champ inconnu, comme le titre ou le porteur", () => {
    for (const champ of ["title", "owner_id", "studio_id", "toString"]) {
      assert.equal(lire({ [champ]: "x" }, [champ]).erreur, "Champ inconnu.", champ);
    }
  });

  it("accepte un genre connu, ou aucun", () => {
    assert.deepEqual(lire({ genre: "comedie_dramatique" }).fiche, { genre: "comedie_dramatique" });
    assert.deepEqual(lire({ genre: "" }).fiche, { genre: null });
    for (const genre of ["Drame", "western", "toString", 3]) {
      assert.equal(lire({ genre }).erreur, "Genre inconnu.", String(genre));
    }
  });

  it("garde les pays dans l'ordre, sans doublon, le premier étant le principal", () => {
    assert.deepEqual(lire({ countries: ["SN", "CM", "SN", ""] }).fiche, {
      countries: ["SN", "CM"],
    });
    assert.deepEqual(lire({ countries: [] }).fiche, { countries: [] });
  });

  it("refuse un pays inconnu, une valeur qui n'est pas une liste, ou trop de pays", () => {
    assert.equal(lire({ countries: ["cm"] }).erreur, "Pays inconnu.");
    assert.equal(lire({ countries: ["XX"] }).erreur, "Pays inconnu.");
    assert.equal(lire({ countries: "CM" }).erreur, "Pays inconnu.");
    assert.equal(lire({ countries: [3] }).erreur, "Pays inconnu.");
    assert.match(lire({ countries: PAYS.slice(0, MAX_PAYS + 1) }).erreur, /10 pays/);
    assert.deepEqual(lire({ countries: PAYS.slice(0, MAX_PAYS) }).fiche.countries.length, MAX_PAYS);
  });

  it("lit une durée en minutes entières, dans ses bornes", () => {
    assert.deepEqual(lire({ duration_minutes: " 95 " }).fiche, { duration_minutes: 95 });
    assert.deepEqual(lire({ duration_minutes: 26 }).fiche, { duration_minutes: 26 });
    assert.deepEqual(lire({ duration_minutes: "" }).fiche, { duration_minutes: null });
    for (const duree of ["0", "1001", "1,5", "-3", "90 min", "1e3", "12345"]) {
      assert.ok("erreur" in lire({ duration_minutes: duree }), duree);
    }
    assert.deepEqual(DUREE_MINUTES, { min: 1, max: 1000 });
  });

  it("replie les espaces d'un texte d'une ligne", () => {
    assert.deepEqual(lire({ languages: "  Français,\n ewondo  " }).fiche, {
      languages: "Français, ewondo",
    });
  });

  it("garde les retours à la ligne d'un texte long, et normalise leurs fins", () => {
    assert.deepEqual(lire({ stakes: " Premier.\r\n\r\nSecond.\rFin. " }).fiche, {
      stakes: "Premier.\n\nSecond.\nFin.",
    });
  });

  it("refuse un caractère de contrôle, ou une tabulation dans un texte long", () => {
    assert.match(lire({ theme: "La\u0000mer" }).erreur, /non autorisés/);
    assert.match(lire({ goals: "Festival\tFespaco" }).erreur, /non autorisés/);
    assert.match(lire({ audience: "Jeune\u0085public" }).erreur, /non autorisés/);
  });

  it("borne chaque texte, à la borne près, en caractères", () => {
    for (const [champ, max] of Object.entries(LONGUEURS_FICHE)) {
      assert.ok("fiche" in lire({ [champ]: "é".repeat(max) }), champ);
      assert.match(
        lire({ [champ]: "é".repeat(max + 1) }).erreur ?? "",
        new RegExp(`${max}`),
        champ,
      );
    }
    // 300 emojis : 600 unités UTF-16, mais 300 caractères pour la base.
    assert.ok("fiche" in lire({ theme: "🎬".repeat(300) }));
  });

  it("couvre les dix champs de la fiche", () => {
    assert.equal(CHAMPS_FICHE.length, 10);
    const toutes = Object.fromEntries(CHAMPS_FICHE.map((champ) => [champ, ""]));
    toutes.countries = [];
    assert.deepEqual(lire(toutes).fiche, {
      genre: null,
      countries: [],
      languages: "",
      duration_minutes: null,
      short_synopsis: "",
      theme: "",
      stakes: "",
      artistic_vision: "",
      goals: "",
      audience: "",
    });
  });
});

describe("Fiche : personnages", () => {
  it("accepte un personnage complet", () => {
    assert.deepEqual(
      normaliserPersonnage({
        name: "  Ɛyɔ  ",
        role: "principal",
        description: "Pêcheuse.\nTêtue.",
      }),
      { personnage: { name: "Ɛyɔ", role: "principal", description: "Pêcheuse.\nTêtue." } },
    );
    assert.deepEqual(Object.keys(ROLES_PERSONNAGE), ["principal", "secondaire"]);
  });

  it("exige un nom, et un rôle connu", () => {
    assert.match(
      normaliserPersonnage({ name: "  ", role: "principal", description: "" }).erreur,
      /nom/,
    );
    assert.match(
      normaliserPersonnage({ name: "Awa", role: "figurant", description: "" }).erreur,
      /Rôle/,
    );
    assert.match(
      normaliserPersonnage({ name: "Awa", role: "toString", description: "" }).erreur,
      /Rôle/,
    );
  });

  it("borne le nom et la description", () => {
    const max = LONGUEURS_PERSONNAGE;
    assert.ok(
      "personnage" in
        normaliserPersonnage({
          name: "a".repeat(max.name),
          role: "secondaire",
          description: "d".repeat(max.description),
        }),
    );
    assert.match(
      normaliserPersonnage({ name: "a".repeat(max.name + 1), role: "secondaire", description: "" })
        .erreur,
      /120/,
    );
    assert.match(
      normaliserPersonnage({
        name: "Awa",
        role: "secondaire",
        description: "d".repeat(max.description + 1),
      }).erreur,
      /2000/,
    );
  });

  it("refuse ce qui n'est pas du texte", () => {
    for (const saisie of [
      {},
      { name: 3, role: "principal", description: "" },
      { name: "Awa", role: "principal" },
    ]) {
      assert.ok("erreur" in normaliserPersonnage(saisie), JSON.stringify(saisie));
    }
  });
});

describe("Fiche : genres", () => {
  it("propose vingt genres, chacun nommé", () => {
    assert.equal(Object.keys(GENRES).length, 20);
    for (const libelle of Object.values(GENRES)) {
      assert.match(libelle, /^[A-ZÀ-Ý]/);
    }
  });
});
