import type { NextConfig } from "next";

/**
 * L'origine du projet Supabase, seule adresse hors de l'application que le
 * navigateur a le droit de joindre : il y lit les images par lien signé et y
 * dépose celles qu'on envoie. Absente ou illisible, elle n'est pas remplacée :
 * la politique n'en est que plus stricte.
 */
function origineSupabase(adresse: string | undefined): string | null {
  try {
    const url = new URL(adresse ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Politique de sécurité de contenu : ce que le navigateur accepte de charger.
 *
 * Tout vient de l'application, sauf les images et les appels vers Supabase.
 * Aucun objet embarqué, aucun formulaire posté ailleurs, aucune balise
 * `<base>` qui déplacerait les adresses relatives, aucun affichage en cadre.
 *
 * `'unsafe-inline'` reste admis pour les scripts : Next en écrit dans chaque
 * page pour la démarrer, et les admettre un à un, par jeton, rendrait toutes
 * les pages dynamiques, vitrine comprise. La politique ferme donc les origines
 * étrangères, pas un script écrit dans la page — décision du 10 octobre 2026,
 * à rouvrir avant la levée du mode privé. Les styles en ligne sont ceux des
 * jauges, dont la largeur est une donnée.
 *
 * En développement seulement, le rechargement à chaud évalue du code et tient
 * un canal ouvert : deux permissions de plus, jamais servies en production.
 */
export function politiqueDeContenu(reglages: {
  supabaseUrl: string | undefined;
  developpement: boolean;
}): string {
  const supabase = origineSupabase(reglages.supabaseUrl);
  const avecSupabase = supabase ? ` ${supabase}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${reglages.developpement ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data:${avecSupabase}`,
    "font-src 'self'",
    `connect-src 'self'${avecSupabase}${reglages.developpement ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  return directives.join("; ");
}

/*
 * En-têtes de sécurité, posés sur toutes les réponses.
 *
 * Aucune page n'a vocation à s'afficher dans un cadre : l'interdire empêche
 * qu'un site tiers superpose l'application à ses propres boutons pour y faire
 * cliquer un utilisateur connecté. `frame-ancestors` et `X-Frame-Options`
 * disent la même chose, le second aux navigateurs qui ignorent le premier.
 */
export function enTetesDeSecurite(reglages: {
  supabaseUrl: string | undefined;
  developpement: boolean;
}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: politiqueDeContenu(reglages) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Un lien reçu par e-mail porte un jeton dans son adresse : seule l'origine
    // part vers un autre site, jamais le chemin ni ses paramètres.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: enTetesDeSecurite({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          developpement: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
};

export default nextConfig;
