import Link from "next/link";

import { ClapperIcon } from "@/components/icons";

/** Mise en page sobre pour les écrans d'authentification. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
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
        <div className="w-full max-w-md">{children}</div>
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
