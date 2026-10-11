/**
 * Champ de mot de passe et son bouton « Afficher » (correctif du 11 octobre 2026).
 *
 * Une connexion refusée depuis un téléphone ne se comprenait pas : la saisie
 * restait masquée, et le clavier y glisse une majuscule ou un espace. Ces
 * tests tiennent le bouton, ce qu'il ne doit pas faire, et sa présence sur
 * chaque formulaire qui demande un mot de passe.
 *
 * Lecture de fichiers : ni base, ni serveur, ni navigateur. Le comportement à
 * l'écran n'est pas couvert ici.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

const CHAMP = lire("src/components/ui/champ-mot-de-passe.tsx");
const FORMULAIRES = [
  "src/app/(auth)/connexion/formulaire.tsx",
  "src/app/(auth)/inscription/formulaire.tsx",
  "src/app/(auth)/nouveau-mot-de-passe/formulaire.tsx",
];

describe("champ de mot de passe", () => {
  it("masque la saisie tant que rien n'est demandé", () => {
    assert.match(CHAMP, /useState\(false\)/);
    assert.match(CHAMP, /type=\{visible \? "text" : "password"\}/);
  });

  it("son bouton ne soumet pas le formulaire", () => {
    assert.match(CHAMP, /<button\s+type="button"/);
  });

  it("dit son état et ce qu'il commande, par un texte et non une icône seule", () => {
    assert.match(CHAMP, /aria-pressed=\{visible\}/);
    assert.match(CHAMP, /aria-controls=\{id\}/);
    assert.match(CHAMP, /\{visible \? "Masquer" : "Afficher"\}/);
    assert.match(CHAMP, /le mot de passe/);
  });

  it("affiché, ne laisse pas le clavier corriger la saisie", () => {
    assert.match(CHAMP, /autoCapitalize="none"/);
    assert.match(CHAMP, /autoCorrect="off"/);
    assert.match(CHAMP, /spellCheck=\{false\}/);
  });

  it("ne garde la saisie nulle part", () => {
    assert.doesNotMatch(CHAMP, /localStorage|sessionStorage|console\.|value=/);
  });

  for (const chemin of FORMULAIRES) {
    it(`${chemin} n'a plus de champ de mot de passe sans bouton`, () => {
      const source = lire(chemin);
      assert.match(source, /<PasswordField/);
      assert.doesNotMatch(source, /type="password"/);
    });
  }

  it("la clé d'un fournisseur reste masquée, sans bouton", () => {
    const source = lire("src/app/(app)/administration/integrations/formulaire.tsx");
    assert.match(source, /type="password"/);
    assert.doesNotMatch(source, /PasswordField/);
  });
});
