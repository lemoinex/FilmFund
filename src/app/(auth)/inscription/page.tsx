import type { Metadata } from "next";
import Link from "next/link";

import { Message } from "@/components/ui/form";
import { MESSAGE_INSCRIPTIONS_FERMEES, modePriveActif } from "@/lib/acces-prive";

import { FormulaireInscription } from "./formulaire";

export const metadata: Metadata = {
  title: "Créer un compte — filmfundAfrica",
  description: "Créez votre espace de travail filmfundAfrica.",
  robots: { index: false, follow: false },
};

export default function InscriptionPage() {
  // Le composant du formulaire est conservé tel quel : rouvrir les
  // inscriptions ne demandera que de lever le mode privé.
  if (modePriveActif()) {
    return (
      <>
        <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
          Créer un compte
        </h1>
        <div className="mt-8">
          <Message ton="erreur">{MESSAGE_INSCRIPTIONS_FERMEES}</Message>
        </div>
        <p className="text-light-muted mt-8 text-sm">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="text-gold hover:text-gold-bright transition-colors">
            Se connecter
          </Link>
        </p>
      </>
    );
  }

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
