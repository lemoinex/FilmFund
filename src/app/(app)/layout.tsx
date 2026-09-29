import Link from "next/link";
import { redirect } from "next/navigation";

import { ClapperIcon } from "@/components/icons";
import { deconnexion } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";

/**
 * Coque de l'espace connecté.
 *
 * La garde du middleware ne suffit pas : on revérifie l'utilisateur ici, au
 * plus près de la donnée. Une seule couche de protection est une couche de
 * trop peu.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const nom = profil?.display_name?.trim() || user.email?.split("@")[0] || "Vous";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-navy-line/60 bg-navy/85 sticky top-0 z-50 border-b backdrop-blur-lg">
        <div className="mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <div className="flex items-center gap-8">
            <Link href="/tableau-de-bord" className="flex items-center gap-2.5 tracking-tight">
              <ClapperIcon className="text-gold size-7" />
              <span className="font-medium">
                filmfund<span className="text-gold font-semibold">Africa</span>
              </span>
            </Link>
            <nav aria-label="Navigation de l'espace de travail" className="hidden sm:block">
              <ul className="text-light-muted flex items-center gap-6 text-sm">
                <li>
                  <Link href="/tableau-de-bord" className="hover:text-light transition-colors">
                    Tableau de bord
                  </Link>
                </li>
                <li>
                  <Link href="/projets" className="hover:text-light transition-colors">
                    Mes projets
                  </Link>
                </li>
              </ul>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-light-muted hidden text-sm md:inline">{nom}</span>
            {profil?.role === "admin" ? (
              // Masqué sur mobile : à 375 px, il repousse le bouton de
              // déconnexion hors de l'écran.
              <span className="text-gold bg-gold/10 hidden rounded-full px-2.5 py-1 text-xs sm:inline">
                Administrateur
              </span>
            ) : null}
            <form action={deconnexion}>
              <button
                type="submit"
                className="border-navy-line hover:border-light-muted hover:bg-navy-soft rounded-full border px-4 py-2 text-sm transition-colors"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>
    </div>
  );
}
