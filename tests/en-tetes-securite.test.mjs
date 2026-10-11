/**
 * En-têtes de sécurité (lot DU2) : la politique de contenu servie sur chaque
 * réponse, et les trois en-têtes qui l'accompagnent.
 *
 * Ces tests lisent ce que l'application déclare ; ils ne voient pas ce qu'un
 * navigateur refuse. Une image ou un envoi bloqué ne se constate qu'à l'écran,
 * console ouverte.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import nextConfig, { enTetesDeSecurite, politiqueDeContenu } from "../next.config.ts";

const SUPABASE = "https://exemple.supabase.co";

/** La politique, directive par directive : nom → sources admises. */
function directives(politique) {
  return Object.fromEntries(
    politique.split("; ").map((directive) => {
      const [nom, ...sources] = directive.split(" ");
      return [nom, sources];
    }),
  );
}

const production = directives(politiqueDeContenu({ supabaseUrl: SUPABASE, developpement: false }));

describe("Politique de sécurité de contenu", () => {
  it("dit exactement ces dix directives, et rien d'autre", () => {
    // Une directive retirée rouvre ce qu'elle fermait ; une origine ajoutée
    // se voit ici, et se justifie dans le fichier.
    assert.deepEqual(production, {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", SUPABASE],
      "font-src": ["'self'"],
      "connect-src": ["'self'", SUPABASE],
      "object-src": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("n'admet aucune origine étrangère hors celle de Supabase, ni joker", () => {
    const sources = Object.values(production).flat();
    const origines = sources.filter((source) => /^[a-z]+:\/\//.test(source));
    assert.deepEqual([...new Set(origines)], [SUPABASE]);
    assert.deepEqual(
      sources.filter((source) => source.includes("*") || source === "https:" || source === "http:"),
      [],
    );
  });

  it("n'évalue pas de code en production", () => {
    assert.ok(!production["script-src"].includes("'unsafe-eval'"));
  });

  it("ne retient de l'adresse de Supabase que son origine", () => {
    const politique = politiqueDeContenu({
      supabaseUrl: `${SUPABASE}/rest/v1/?cle=valeur`,
      developpement: false,
    });
    assert.deepEqual(directives(politique)["connect-src"], ["'self'", SUPABASE]);
  });

  it("sans adresse lisible, n'ouvre rien de plus", () => {
    for (const supabaseUrl of [undefined, "", "pas une adresse", "javascript:alert(1)"]) {
      const lues = directives(politiqueDeContenu({ supabaseUrl, developpement: false }));
      assert.deepEqual(lues["connect-src"], ["'self'"], String(supabaseUrl));
      assert.deepEqual(lues["img-src"], ["'self'", "data:"], String(supabaseUrl));
    }
  });

  it("en développement, n'ajoute que l'évaluation et le canal du rechargement à chaud", () => {
    const local = "http://127.0.0.1:54321";
    const lues = directives(politiqueDeContenu({ supabaseUrl: local, developpement: true }));
    assert.deepEqual(lues["script-src"], ["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    assert.deepEqual(lues["connect-src"], [
      "'self'",
      local,
      "ws://localhost:*",
      "ws://127.0.0.1:*",
    ]);
    // Le reste est celui de la production.
    for (const nom of ["default-src", "object-src", "base-uri", "form-action", "frame-ancestors"]) {
      assert.deepEqual(lues[nom], production[nom], nom);
    }
  });
});

describe("En-têtes de sécurité", () => {
  it("quatre en-têtes, dont la politique de contenu", () => {
    const enTetes = enTetesDeSecurite({ supabaseUrl: SUPABASE, developpement: false });
    assert.deepEqual(
      enTetes.map((enTete) => enTete.key),
      ["Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"],
    );
    const valeur = (nom) => enTetes.find((enTete) => enTete.key === nom).value;
    assert.equal(
      valeur("Content-Security-Policy"),
      politiqueDeContenu({ supabaseUrl: SUPABASE, developpement: false }),
    );
    assert.equal(valeur("X-Frame-Options"), "DENY");
    assert.equal(valeur("X-Content-Type-Options"), "nosniff");
    assert.equal(valeur("Referrer-Policy"), "strict-origin-when-cross-origin");
  });

  it("ils sont posés sur toutes les réponses", async () => {
    const regles = await nextConfig.headers();
    assert.equal(regles.length, 1);
    assert.equal(regles[0].source, "/:path*");
    assert.deepEqual(
      regles[0].headers.map((enTete) => enTete.key),
      enTetesDeSecurite({ supabaseUrl: SUPABASE, developpement: false }).map(
        (enTete) => enTete.key,
      ),
    );
  });
});
