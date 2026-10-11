import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page introuvable — FilmFund Africa",
  robots: { index: false, follow: false },
};

/**
 * Page 404 de l'espace connecté : un projet ou un document introuvable.
 *
 * Next rend le 404 d'un groupe de routes à l'intérieur de sa mise en page.
 * Sans ce fichier, c'est la page 404 de la racine qui s'y afficherait, avec
 * son en-tête et son `<main>` imbriqués dans ceux de la coque. Celle-ci
 * n'apporte donc que le contenu : la coque fournit le reste.
 *
 * Même règle que pour la page de la racine : le texte ne dit rien des droits,
 * puisque le projet d'autrui répond 404 pour ne pas révéler son existence.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="eyebrow text-gold mb-5">Erreur 404</p>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Page introuvable
      </h1>
      <p className="text-secondary mt-4 max-w-md text-sm leading-relaxed text-pretty">
        Cette page n&apos;existe pas ou n&apos;existe plus. Vérifiez l&apos;adresse, ou repartez
        d&apos;un endroit connu.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/tableau-de-bord"
          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-6 py-3.5 text-center text-sm font-medium transition-colors"
        >
          Aller au tableau de bord
        </Link>
        <Link
          href="/projets"
          className="border-app-line text-light hover:bg-surface-hover rounded-full border px-6 py-3.5 text-center text-sm font-medium transition-colors"
        >
          Voir mes projets
        </Link>
      </div>
    </div>
  );
}
