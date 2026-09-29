import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { FormulaireNouveauMotDePasse } from "./formulaire";

export const metadata: Metadata = {
  title: "Nouveau mot de passe — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function NouveauMotDePasse() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * Cette page n'est atteinte qu'après échange du jeton par la route
   * /auth/reinitialisation, qui ouvre une session. Un accès direct sans
   * session est donc renvoyé vers la demande de lien.
   */
  if (!user) {
    redirect("/mot-de-passe-oublie?erreur=lien-invalide");
  }

  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Nouveau mot de passe
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        Choisissez un mot de passe pour <span className="text-light">{user.email}</span>.
      </p>

      <div className="mt-8">
        <FormulaireNouveauMotDePasse />
      </div>
    </>
  );
}
