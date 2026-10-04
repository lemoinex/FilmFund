import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
// Doit rester en dernier : desactive les regles de style qui entrent en conflit avec Prettier.
import prettier from "eslint-config-prettier";

const SDK_IA = {
  group: ["@anthropic-ai/*", "openai", "openai/*"],
  message:
    "Les fournisseurs d'IA ne s'appellent que par la passerelle : worker/src/ia/passerelle.ts.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Passerelle IA unique : aucune route, aucun composant, aucun agent
  // n'importe le SDK d'un fournisseur. tests/architecture.test.mjs le vérifie
  // aussi, sans dépendre de la configuration du lint.
  { rules: { "no-restricted-imports": ["error", { patterns: [SDK_IA] }] } },
  { files: ["worker/src/ia/passerelle.ts"], rules: { "no-restricted-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Outillage local, ignoré par Git : ses copies de travail contiennent
    // d'autres builds du dépôt, que le lint parcourait jusqu'à y échouer.
    ".claude/**",
  ]),
]);

export default eslintConfig;
