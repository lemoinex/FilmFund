import Link from "next/link";

import { ClapperIcon } from "@/components/icons";

/*
 * Ancres absolues : le pied de page est aussi monte sur les pages legales.
 */
const NAV_LINKS = [
  { href: "/#accueil", label: "Accueil" },
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#producteurs", label: "Pour les producteurs" },
  { href: "/#a-propos", label: "À propos" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#contact", label: "Contact" },
];

const LEGAL_LINKS = [
  { href: "/mentions-legales", label: "Mentions légales" },
  { href: "/confidentialite", label: "Politique de confidentialité" },
];

/*
 * Pas d'icones sociales : aucun compte n'existe a ce jour, et un lien mort
 * vaut moins qu'une absence. Les conditions d'utilisation s'ajouteront ici
 * quand cette page sera ecrite.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-navy border-navy-line/60 border-t">
      <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
          <Link href="/#accueil" className="flex items-center gap-2.5 text-base tracking-tight">
            <ClapperIcon className="text-gold size-6" />
            <span className="font-medium">
              filmfund<span className="text-gold font-semibold">Africa</span>
            </span>
          </Link>

          <nav aria-label="Navigation de pied de page">
            <ul className="text-light-muted flex flex-wrap items-center gap-x-7 gap-y-3 text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-light transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="border-navy-line/60 mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Informations légales">
            <ul className="text-light-muted flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-light transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <p className="text-light-muted text-sm">
            © {year} FilmFund Africa. Tous droits réservés.
          </p>
        </div>
      </div>
    </footer>
  );
}
