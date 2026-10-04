import type { NextConfig } from "next";

/*
 * En-têtes de sécurité, posés sur toutes les réponses.
 *
 * Aucune page n'a vocation à s'afficher dans un cadre : l'interdire empêche
 * qu'un site tiers superpose l'application à ses propres boutons pour y faire
 * cliquer un utilisateur connecté. Les deux en-têtes disent la même chose, le
 * second aux navigateurs qui ignorent le premier.
 */
const EN_TETES_DE_SECURITE = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Un lien reçu par e-mail porte un jeton dans son adresse : seule l'origine
  // part vers un autre site, jamais le chemin ni ses paramètres.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: EN_TETES_DE_SECURITE }];
  },
};

export default nextConfig;
