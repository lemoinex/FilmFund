import Link from "next/link";

import { ClapperIcon } from "@/components/icons";
import { modePriveActif } from "@/lib/acces-prive";

/*
 * Ancres absolues (« /#... ») et non relatives : la barre est aussi montee sur
 * les pages legales, d'ou une ancre nue ne mènerait nulle part.
 */
const NAV_LINKS = [
  { href: "/#accueil", label: "Accueil" },
  { href: "/#fonctionnalites", label: "Fonctionnalités" },
  { href: "/#producteurs", label: "Pour les producteurs" },
  { href: "/#a-propos", label: "À propos" },
  { href: "/#contact", label: "Contact" },
];

export function Navbar() {
  // Page publique, rendue à la construction : changer le mode privé demande
  // un redéploiement pour que ce lien disparaisse ou réapparaisse.
  const inscriptionsOuvertes = !modePriveActif();

  return (
    <header className="bg-navy/85 border-navy-line/60 sticky top-0 z-50 border-b backdrop-blur-lg">
      <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          href="/#accueil"
          className="flex shrink-0 items-center gap-2.5 text-lg tracking-tight"
          aria-label="filmfundAfrica, accueil"
        >
          <ClapperIcon className="text-gold size-7" />
          <span className="font-medium">
            filmfund<span className="text-gold font-semibold">Africa</span>
          </span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm xl:gap-9">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-light-muted hover:text-light transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 lg:flex">
          <Link
            href="/connexion"
            className="border-navy-line hover:border-light-muted hover:bg-navy-soft rounded-full border px-5 py-2.5 text-sm transition-colors"
          >
            Se connecter
          </Link>
          {inscriptionsOuvertes ? (
            <Link
              href="/inscription"
              className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Découvrir la plateforme
            </Link>
          ) : null}
        </div>

        {/*
         * Menu mobile en <details> : ferme par defaut, ouvrable au clavier via
         * le <summary>, refermable par Echap. Aucun JavaScript, donc le
         * composant reste un composant serveur et le menu marche avant
         * l'hydratation.
         */}
        <details className="group relative lg:hidden">
          {/*
           * Le summary sert a la fois de bouton d'ouverture et de fermeture :
           * les trois barres deviennent une croix quand le menu est ouvert.
           * Activable a la souris comme au clavier (Entree ou Espace).
           */}
          <summary
            className="border-navy-line group-open:bg-navy-soft flex size-11 cursor-pointer list-none items-center justify-center rounded-full border transition-colors marker:content-none [&::-webkit-details-marker]:hidden"
            aria-label="Ouvrir ou fermer le menu de navigation"
          >
            <span aria-hidden="true" className="relative block h-3.5 w-5">
              <span className="bg-light absolute inset-x-0 top-0 h-px transition-transform duration-200 group-open:top-1/2 group-open:rotate-45" />
              <span className="bg-light absolute inset-x-0 top-1/2 h-px transition-opacity duration-200 group-open:opacity-0" />
              <span className="bg-light absolute inset-x-0 bottom-0 h-px transition-transform duration-200 group-open:bottom-1/2 group-open:-rotate-45" />
            </span>
          </summary>
          <nav
            aria-label="Navigation principale"
            className="border-navy-line bg-navy-soft absolute right-0 mt-3 w-64 rounded-xl border p-2 shadow-2xl"
          >
            <ul className="text-sm">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-light-muted hover:text-light hover:bg-navy block rounded-lg px-4 py-3 transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              <li className="border-navy-line mt-2 space-y-2 border-t pt-2">
                <Link
                  href="/connexion"
                  className="border-navy-line block rounded-lg border px-4 py-3 text-center"
                >
                  Se connecter
                </Link>
                {inscriptionsOuvertes ? (
                  <Link
                    href="/inscription"
                    className="bg-gold text-navy block rounded-lg px-4 py-3 text-center font-medium"
                  >
                    Découvrir la plateforme
                  </Link>
                ) : null}
              </li>
            </ul>
          </nav>
        </details>
      </div>
    </header>
  );
}
