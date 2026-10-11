import type { Metadata } from "next";
import Link from "next/link";

import { MESSAGE_ACCES_RESERVE } from "@/lib/acces-prive";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Accès réservé — FilmFund Africa",
  robots: { index: false, follow: false },
};

/**
 * Destination des comptes que le mode privé tient à l'écart.
 *
 * Volontairement pauvre : ni donnée du compte, ni indication sur les
 * adresses autorisées. Seules issues : se déconnecter, ou revenir à la
 * connexion pour changer de compte.
 */
export default async function AccesRefusePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Accès réservé
      </h1>
      <p className="text-light-muted mt-4 text-sm leading-relaxed text-pretty">
        {MESSAGE_ACCES_RESERVE}
      </p>

      <div className="mt-8">
        {user ? (
          // Route dédiée et non action serveur : voir src/app/auth/deconnexion.
          <form method="post" action="/auth/deconnexion">
            <button
              type="submit"
              className="bg-gold text-navy hover:bg-gold-bright w-full rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
            >
              Se déconnecter
            </button>
          </form>
        ) : (
          <Link
            href="/connexion"
            className="bg-gold text-navy hover:bg-gold-bright block w-full rounded-full px-6 py-3.5 text-center text-sm font-medium transition-colors"
          >
            Retour à la connexion
          </Link>
        )}
      </div>
    </>
  );
}
