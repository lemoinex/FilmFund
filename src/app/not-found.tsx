import type { Metadata } from "next";
import Link from "next/link";

import { ClapperIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Page introuvable — filmfundAfrica",
  robots: { index: false, follow: false },
};

/**
 * Page 404 des adresses qui ne correspondent à aucune route.
 *
 * C'est aussi l'écran que reçoit un compte ordinaire sous `/administration` :
 * le middleware y réécrit sa requête vers une adresse inexistante, pour que
 * ces pages ne se distinguent en rien d'une page absente. Le texte ne dit
 * donc rien des droits ni de la session, et la page ne lit ni l'un ni
 * l'autre : elle reste statique, et s'affiche même si l'authentification est
 * en panne.
 *
 * Elle apporte son en-tête et son pied de page, n'ayant que la mise en page
 * racine autour d'elle. Les 404 de l'espace connecté ont leur propre page,
 * `(app)/not-found.tsx`, rendue dans la coque.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-navy-line/60 border-b">
        <div className="mx-auto flex h-18 w-full max-w-7xl items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-lg tracking-tight">
            <ClapperIcon className="text-gold size-7" />
            <span className="font-medium">
              filmfund<span className="text-gold font-semibold">Africa</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8 sm:py-16">
        <div className="w-full max-w-md">
          <p className="eyebrow text-gold mb-5">Erreur 404</p>
          <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            Page introuvable
          </h1>
          <p className="text-light-muted mt-4 text-sm leading-relaxed text-pretty">
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
              href="/"
              className="border-light-muted/50 text-light hover:border-gold-bright hover:text-gold-bright rounded-full border px-6 py-3.5 text-center text-sm font-medium transition-colors"
            >
              Revenir à l&apos;accueil
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-navy-line/60 border-t">
        <div className="text-light-muted mx-auto flex w-full max-w-7xl flex-wrap gap-x-6 gap-y-2 px-5 py-6 text-sm sm:px-8">
          <Link href="/mentions-legales" className="hover:text-light transition-colors">
            Mentions légales
          </Link>
          <Link href="/confidentialite" className="hover:text-light transition-colors">
            Politique de confidentialité
          </Link>
        </div>
      </footer>
    </div>
  );
}
