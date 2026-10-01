/**
 * Passerelle IA unique : le SDK d'un fournisseur n'est importé qu'à un seul
 * endroit, dans le worker, et sa clé n'est lue que là.
 *
 * Le lint porte la même règle (`eslint.config.mjs`) ; ce test la tient sans
 * dépendre de sa configuration, et lit aussi ce que le lint ne regarde pas :
 * les dépendances déclarées et les noms de variables d'environnement.
 */
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));
const PASSERELLE = "worker/src/ia/passerelle.ts";

/** Paquets dont la présence signale un appel direct à un fournisseur d'IA. */
const SDK_IA =
  /^(@anthropic-ai\/|openai$|openai\/|@google\/generative-ai|@google\/genai|@mistralai\/|cohere-ai|replicate$|ai$|@ai-sdk\/)/;

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;

function fichiersDe(dossier) {
  const trouves = [];
  for (const entree of readdirSync(join(RACINE, dossier), { withFileTypes: true })) {
    const chemin = `${dossier}/${entree.name}`;
    if (entree.isDirectory()) {
      if (entree.name !== "node_modules") {
        trouves.push(...fichiersDe(chemin));
      }
    } else if (/\.(ts|tsx|mts|js|jsx|mjs)$/.test(entree.name)) {
      trouves.push(chemin);
    }
  }
  return trouves;
}

function lire(chemin) {
  return readFileSync(join(RACINE, chemin), "utf8");
}

function importsIa(chemin) {
  return [...lire(chemin).matchAll(IMPORT)].map((m) => m[1]).filter((nom) => SDK_IA.test(nom));
}

const SOURCES = [...fichiersDe("src"), ...fichiersDe("worker/src")];

describe("Passerelle IA unique", () => {
  it("le test parcourt bien l'application et le worker", () => {
    assert.ok(SOURCES.some((f) => f.startsWith("src/app/")));
    assert.ok(SOURCES.includes(PASSERELLE));
  });

  it("aucun fichier n'importe le SDK d'un fournisseur, sauf la passerelle", () => {
    const fautifs = SOURCES.filter((f) => f !== PASSERELLE && importsIa(f).length > 0);
    assert.deepEqual(fautifs, []);
  });

  it("la passerelle, elle, l'importe : la règle a bien quelque chose à garder", () => {
    assert.deepEqual(importsIa(PASSERELLE), ["@anthropic-ai/sdk"]);
  });

  it("l'application ne déclare aucun SDK d'IA ; le worker, un seul", () => {
    const dependances = (chemin) => {
      const paquet = JSON.parse(lire(chemin));
      return Object.keys({ ...paquet.dependencies, ...paquet.devDependencies });
    };
    assert.deepEqual(
      dependances("package.json").filter((nom) => SDK_IA.test(nom)),
      [],
    );
    assert.deepEqual(
      dependances("worker/package.json").filter((nom) => SDK_IA.test(nom)),
      ["@anthropic-ai/sdk"],
    );
  });

  it("la clé du fournisseur n'est lue que par le point d'entrée du worker", () => {
    const lecteurs = SOURCES.filter((f) => lire(f).includes("ANTHROPIC_API_KEY"));
    assert.deepEqual(lecteurs, ["worker/src/index.ts"]);
  });

  it("aucune variable exposée au navigateur ne porte une clé d'IA", () => {
    const exposees = /NEXT_PUBLIC_[A-Z0-9_]*(ANTHROPIC|OPENAI|CLAUDE|_AI_|IA_|API_KEY|SECRET)/;
    const fautifs = [...SOURCES, ".env.example"].filter((f) => exposees.test(lire(f)));
    assert.deepEqual(fautifs, []);
  });
});
