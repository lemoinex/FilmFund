import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireDemande } from "./formulaire";

export const metadata: Metadata = {
  title: "Mot de passe oublié — FilmFund Africa",
  description: "Recevez un lien pour réinitialiser votre mot de passe FilmFund Africa.",
  robots: { index: false, follow: false },
};

export default async function MotDePasseOublie({
  searchParams,
}: {
  searchParams: Promise<{ erreur?: string }>;
}) {
  const { erreur } = await searchParams;

  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Mot de passe oublié
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        Indiquez votre adresse e-mail : vous recevrez un lien pour choisir un nouveau mot de passe.
      </p>

      <div className="mt-8">
        <FormulaireDemande lienInvalide={erreur === "lien-invalide"} />
      </div>

      <p className="text-light-muted mt-8 text-sm">
        Vous vous en souvenez ?{" "}
        <Link href="/connexion" className="text-gold hover:text-gold-bright transition-colors">
          Se connecter
        </Link>
      </p>
    </>
  );
}
