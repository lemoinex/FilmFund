import type { Metadata } from "next";
import Link from "next/link";

import { modePriveActif } from "@/lib/acces-prive";

import { FormulaireConnexion } from "./formulaire";

export const metadata: Metadata = {
  title: "Connexion — filmfundAfrica",
  description: "Accédez à votre espace de travail filmfundAfrica.",
  robots: { index: false, follow: false },
};

export default async function ConnexionPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>;
}) {
  const { suite } = await searchParams;

  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Connexion</h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        Retrouvez vos projets et reprenez où vous en étiez.
      </p>

      <div className="mt-8">
        <FormulaireConnexion suite={suite} />
      </div>

      <p className="text-light-muted mt-6 text-sm">
        <Link
          href="/mot-de-passe-oublie"
          className="hover:text-light underline underline-offset-2 transition-colors"
        >
          Mot de passe oublié ?
        </Link>
      </p>

      {modePriveActif() ? null : (
        <p className="text-light-muted mt-8 text-sm">
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="text-gold hover:text-gold-bright transition-colors">
            Créer un compte
          </Link>
        </p>
      )}
    </>
  );
}
