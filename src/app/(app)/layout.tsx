import Link from "next/link";
import { redirect } from "next/navigation";

import { ClapperIcon } from "@/components/icons";
import { deconnexion } from "@/app/(auth)/actions";
import { accesAutorise } from "@/lib/acces-prive";
import { createClient } from "@/lib/supabase/server";

import { MenuMobile, NavigationLaterale } from "./navigation";

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

  // Mode privé : même contrôle que le middleware, au plus près de la donnée.
  if (!accesAutorise(user.email)) {
    redirect("/acces-refuse");
  }

  const { data: profil } = await supabase
    .from("profiles")
    .select("display_name, role")
    .eq("id", user.id)
    .single();

  const nom = profil?.display_name?.trim() || user.email?.split("@")[0] || "Vous";

  const compte = (
    <div className="space-y-3">
      <div className="min-w-0">
        <p className="truncate text-sm">{nom}</p>
        {profil?.role === "admin" ? <p className="text-gold mt-1 text-xs">Administrateur</p> : null}
      </div>
      <form action={deconnexion}>
        <button
          type="submit"
          className="border-app-line text-secondary hover:bg-surface-hover hover:text-light w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors"
        >
          Se déconnecter
        </button>
      </form>
    </div>
  );

  const marque = (
    <Link href="/tableau-de-bord" className="flex items-center gap-2.5 tracking-tight">
      <ClapperIcon className="text-gold size-7" />
      <span className="font-medium">
        filmfund<span className="text-gold font-semibold">Africa</span>
      </span>
    </Link>
  );

  /*
   * Fenêtre applicative sombre, posée sur un fond clair : l'espace de travail
   * se lit comme un outil, distinct de la vitrine. `overflow-clip` et non
   * `overflow-hidden` pour arrondir les angles : le second créerait un
   * conteneur de défilement et empêcherait la barre latérale de rester fixe.
   */
  return (
    <div className="bg-canvas min-h-screen p-2 sm:p-4 lg:p-6">
      <div className="bg-app border-app-line/60 mx-auto flex min-h-[calc(100vh-1rem)] max-w-[1440px] flex-col overflow-clip rounded-2xl border shadow-[0_24px_60px_-28px_rgba(16,23,34,0.55)] sm:min-h-[calc(100vh-2rem)] lg:min-h-[calc(100vh-3rem)] lg:flex-row">
        <aside className="bg-sidebar border-app-line hidden w-64 shrink-0 flex-col gap-8 border-r px-4 py-6 lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)]">
          <div className="px-2">{marque}</div>
          <div className="flex-1 overflow-y-auto">
            <NavigationLaterale />
          </div>
          <div className="border-app-line border-t px-2 pt-5">{compte}</div>
        </aside>

        <header className="bg-sidebar border-app-line relative z-40 flex h-16 items-center justify-between border-b px-4 lg:hidden">
          {marque}
          <MenuMobile>{compte}</MenuMobile>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
