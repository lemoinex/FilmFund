import type { Metadata } from "next";
import Link from "next/link";

import { FormulaireInscription } from "./formulaire";

export const metadata: Metadata = {
  title: "Créer un compte — filmfundAfrica",
  description: "Créez votre espace de travail filmfundAfrica.",
  robots: { index: false, follow: false },
};

export default function InscriptionPage() {
  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Créer un compte
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        Un espace pour développer, structurer et préparer vos projets.
      </p>

      <div className="mt-8">
        <FormulaireInscription />
      </div>

      <p className="text-light-muted mt-8 text-sm">
        Déjà inscrit ?{" "}
        <Link href="/connexion" className="text-gold hover:text-gold-bright transition-colors">
          Se connecter
        </Link>
      </p>

      <p className="text-light-muted mt-4 text-xs leading-relaxed">
        En créant un compte, vous acceptez les{" "}
        <Link href="/mentions-legales" className="underline underline-offset-2">
          mentions légales
        </Link>{" "}
        et la{" "}
        <Link href="/confidentialite" className="underline underline-offset-2">
          politique de confidentialité
        </Link>
        .
      </p>
    </>
  );
}
