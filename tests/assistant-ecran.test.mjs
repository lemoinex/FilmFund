/**
 * Assistant de création (lot R2) : ses étapes, et ce que la première valide
 * en plus de la fiche.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. Les droits sur la fiche ont leur propre suite
 * (lot R1).
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  estEtape,
  etapeDe,
  etapePrecedente,
  etapeSuivante,
  ETAPES_ASSISTANT,
  lirePitch,
  lireTitre,
  PITCH_MAX,
  progression,
  TITRE_MAX,
} from "../src/lib/assistant.ts";
import { CHAMPS_FICHE } from "../src/lib/fiche.ts";

const CLES = ["informations", "concept", "personnages", "enjeux", "vision", "objectifs", "public"];

describe("Assistant : étapes", () => {
  it("propose sept étapes, dans l'ordre du produit", () => {
    assert.deepEqual(
      ETAPES_ASSISTANT.map((etape) => etape.cle),
      CLES,
    );
    for (const etape of ETAPES_ASSISTANT) {
      assert.ok(etape.libelle && etape.titre && etape.aide, etape.cle);
    }
  });

  it("chaque champ de la fiche appartient à une étape, et à une seule", () => {
    const champs = ETAPES_ASSISTANT.flatMap((etape) => etape.champs);
    assert.deepEqual([...champs].sort(), [...CHAMPS_FICHE].sort());
    assert.equal(new Set(champs).size, champs.length);
  });

  it("les personnages s'enregistrent un par un : leur étape n'a pas de champ", () => {
    assert.deepEqual(etapeDe("personnages").champs, []);
  });

  it("ne reconnaît que ses étapes", () => {
    for (const cle of CLES) assert.ok(estEtape(cle), cle);
    for (const valeur of ["", "Informations", "recapitulatif", "toString", "__proto__", null, 3]) {
      assert.equal(estEtape(valeur), false, String(valeur));
    }
  });

  it("mène d'une étape à l'autre, puis à la fiche", () => {
    assert.equal(etapePrecedente("informations"), null);
    assert.equal(etapeSuivante("informations"), "concept");
    assert.equal(etapePrecedente("concept"), "informations");
    assert.equal(etapeSuivante("objectifs"), "public");
    assert.equal(etapeSuivante("public"), null);
    assert.deepEqual(progression("informations"), { rang: 1, total: 7 });
    assert.deepEqual(progression("public"), { rang: 7, total: 7 });
  });
});

describe("Assistant : titre et pitch", () => {
  it("exige un titre, espaces repliés", () => {
    assert.deepEqual(lireTitre("  Lumière   de l'Océan "), { titre: "Lumière de l'Océan" });
    for (const valeur of ["", "   ", null, undefined, 3, ["Titre"]]) {
      assert.match(lireTitre(valeur).erreur ?? "", /titre/, String(valeur));
    }
  });

  it("borne le titre en caractères, comme la base", () => {
    assert.equal(TITRE_MAX, 200);
    assert.ok("titre" in lireTitre("🎬".repeat(TITRE_MAX)));
    assert.match(lireTitre("é".repeat(TITRE_MAX + 1)).erreur, /200/);
  });

  it("garde le pitch tel qu'écrit, extrémités coupées, et le borne", () => {
    assert.deepEqual(lirePitch(" Une mer.\r\nUn exil. "), { pitch: "Une mer.\nUn exil." });
    assert.deepEqual(lirePitch(""), { pitch: "" });
    assert.equal(PITCH_MAX, 500);
    assert.ok("pitch" in lirePitch("é".repeat(PITCH_MAX)));
    assert.match(lirePitch("é".repeat(PITCH_MAX + 1)).erreur, /500/);
  });
});
