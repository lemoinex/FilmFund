import type { Metadata } from "next";
import Link from "next/link";

import { MESSAGE_COMPTE_SUSPENDU } from "@/lib/comptes";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Compte suspendu — FilmFund Africa",
  robots: { index: false, follow: false },
};

/**
 * Destination d'un compte suspendu.
 *
 * Volontairement pauvre : ni donnée du compte, ni motif — celui-ci n'est
 * lisible que de l'administration. Aucune lecture en base : elle serait
 * refusée. Seules issues : se déconnecter, ou réessayer si le compte a été
 * rétabli entre-temps.
 */
export default async function CompteSuspenduPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Compte suspendu
      </h1>
      <p className="text-light-muted mt-4 text-sm leading-relaxed text-pretty">
        {MESSAGE_COMPTE_SUSPENDU}
      </p>

      <div className="mt-8 space-y-3">
        {user ? (
          <>
            {/* Route dédiée et non action serveur : voir src/app/auth/deconnexion. */}
            <form method="post" action="/auth/deconnexion">
              <button
                type="submit"
                className="bg-gold text-navy hover:bg-gold-bright w-full rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
              >
                Se déconnecter
              </button>
            </form>
            <Link
              href="/tableau-de-bord"
              className="text-light-muted hover:text-light block text-center text-xs transition-colors"
            >
              Mon compte a été rétabli : revenir à l&apos;application
            </Link>
          </>
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
