/**
 * Page de profil (lot Q1) : ce que l'écran propose et valide.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Le cloisonnement des profils a sa propre suite.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CHAMPS_MODIFIABLES,
  CODES_PAYS,
  listerPays,
  LONGUEURS_PROFIL,
  normaliserProfil,
  salutation,
  TYPES_PROFIL,
} from "../src/lib/profils.ts";

/** Saisie complète et valide, telle que le formulaire l'envoie. */
const saisie = (autres = {}) => ({
  display_name: "Awa Diop",
  first_name: "Awa",
  last_name: "Diop",
  country: "SN",
  city: "Dakar",
  profession: "Scénariste",
  profile_type: "AUTHOR",
  ...autres,
});

describe("Profil : saisie", () => {
  it("accepte une saisie complète, sans rien y changer", () => {
    assert.deepEqual(normaliserProfil(saisie()), { profil: saisie() });
  });

  it("ne renvoie que les champs modifiables, jamais le rôle", () => {
    const { profil } = normaliserProfil(saisie({ role: "admin", id: "x" }));
    assert.deepEqual(Object.keys(profil).sort(), [...CHAMPS_MODIFIABLES].sort());
    assert.ok(!("role" in profil));
  });

  it("replie les espaces et coupe les extrémités", () => {
    const { profil } = normaliserProfil(
      saisie({ first_name: "  Awa \t Marie\n", city: " Saint-Louis  " }),
    );
    assert.equal(profil.first_name, "Awa Marie");
    assert.equal(profil.city, "Saint-Louis");
  });

  it("garde vides les champs facultatifs, et nuls le pays et le type", () => {
    const { profil } = normaliserProfil(
      saisie({
        first_name: "",
        last_name: " ",
        country: "",
        city: "",
        profession: "",
        profile_type: "",
      }),
    );
    assert.deepEqual(profil, {
      display_name: "Awa Diop",
      first_name: "",
      last_name: "",
      country: null,
      city: "",
      profession: "",
      profile_type: null,
    });
  });

  it("exige un nom affiché", () => {
    assert.match(normaliserProfil(saisie({ display_name: "   " })).erreur, /nom/);
  });

  it("refuse un champ trop long, à la borne près", () => {
    for (const [champ, max] of Object.entries(LONGUEURS_PROFIL)) {
      assert.ok("profil" in normaliserProfil(saisie({ [champ]: "a".repeat(max) })), champ);
      const refus = normaliserProfil(saisie({ [champ]: "a".repeat(max + 1) }));
      assert.match(refus.erreur ?? "", new RegExp(`${max} caractères`), champ);
    }
  });

  it("compte les caractères comme la base, pas les unités UTF-16", () => {
    // 80 emojis : 160 unités UTF-16, mais 80 caractères pour `char_length`.
    assert.ok("profil" in normaliserProfil(saisie({ first_name: "🎬".repeat(80) })));
    assert.ok("erreur" in normaliserProfil(saisie({ first_name: "🎬".repeat(81) })));
  });

  it("refuse un caractère de contrôle", () => {
    for (const texte of ["Da\u0000kar", "Da\u001bkar", "Da\u007fkar", "Da\u0085kar"]) {
      assert.match(normaliserProfil(saisie({ city: texte })).erreur ?? "", /non autorisés/);
    }
  });

  it("refuse un pays ou un type inconnu", () => {
    for (const pays of ["sn", "XX", "SEN", "Sénégal", "SN "]) {
      assert.equal(normaliserProfil(saisie({ country: pays })).erreur, "Pays inconnu.", pays);
    }
    for (const type of ["author", "ADMIN", "toString"]) {
      assert.equal(
        normaliserProfil(saisie({ profile_type: type })).erreur,
        "Type de profil inconnu.",
        type,
      );
    }
  });

  it("refuse un champ absent ou qui n'est pas un texte", () => {
    for (const champ of CHAMPS_MODIFIABLES) {
      for (const valeur of [null, undefined, 3, ["a"], {}]) {
        assert.ok("erreur" in normaliserProfil(saisie({ [champ]: valeur })), champ);
      }
    }
  });
});

describe("Profil : pays et types", () => {
  it("propose les 249 codes ISO, sans doublon", () => {
    assert.equal(CODES_PAYS.length, 249);
    assert.equal(new Set(CODES_PAYS).size, 249);
    for (const code of CODES_PAYS) {
      assert.match(code, /^[A-Z]{2}$/);
    }
  });

  it("nomme chaque pays en français, et les range par ordre alphabétique", () => {
    const pays = listerPays();
    assert.equal(pays.length, CODES_PAYS.length);
    for (const { code, nom } of pays) {
      // Un code que le référentiel ne connaît pas resterait affiché tel quel.
      assert.ok(nom.length > 2 && nom !== code, code);
    }

    const nomDe = Object.fromEntries(pays.map(({ code, nom }) => [code, nom]));
    assert.equal(nomDe.CM, "Cameroun");
    assert.equal(nomDe.SN, "Sénégal");
    assert.equal(nomDe.ZA, "Afrique du Sud");

    const ordre = new Intl.Collator("fr");
    for (let i = 1; i < pays.length; i += 1) {
      assert.ok(ordre.compare(pays[i - 1].nom, pays[i].nom) <= 0, pays[i].nom);
    }
    // Les accents ne renvoient pas un pays en fin de liste.
    assert.ok(pays.findIndex((p) => p.code === "EG") < pays.findIndex((p) => p.code === "FR"));
  });

  it("propose trois types de profil", () => {
    assert.deepEqual(Object.keys(TYPES_PROFIL), ["AUTHOR", "DIRECTOR", "PRODUCER"]);
  });
});

describe("Profil : accueil", () => {
  it("salue par le prénom, à défaut par le nom affiché", () => {
    assert.equal(salutation({ first_name: "Awa", display_name: "A. Diop" }), "Bienvenue, Awa");
    assert.equal(salutation({ first_name: "  ", display_name: "A. Diop" }), "Bienvenue, A. Diop");
    assert.equal(salutation({ first_name: "", display_name: "" }), "Bienvenue");
    assert.equal(salutation(null), "Bienvenue");
  });
});
