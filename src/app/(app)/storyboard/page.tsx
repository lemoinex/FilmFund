import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StoryboardIcon } from "@/components/icons";
import { chargerMesProjets } from "@/lib/mes-projets";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Storyboard — FilmFund Africa",
  robots: { index: false, follow: false },
};

/** Les storyboards de ses projets, avec leur nombre de scènes. */
export default async function StoryboardsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Projets possédés et partagés, comme le tableau de bord : pas ceux que
  // l'administration rend visibles.
  const { possedes, partages } = await chargerMesProjets(supabase, user.id);
  const projets = [...possedes, ...partages].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  // Seule la colonne project_id : on compte les scènes, sans rapatrier leur
  // contenu.
  const { data: scenes } = projets.length
    ? await supabase
        .from("storyboard_scenes")
        .select("project_id")
        .in(
          "project_id",
          projets.map((p) => p.id),
        )
    : { data: [] };

  const compte = new Map<string, number>();
  for (const { project_id } of scenes ?? []) {
    compte.set(project_id, (compte.get(project_id) ?? 0) + 1);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Storyboard</h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed">
        Le découpage de chacun de vos projets, scène par scène.
      </p>

      {projets.length ? (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projets.map((projet) => {
            const nombre = compte.get(projet.id) ?? 0;
            return (
              <li key={projet.id}>
                <Link
                  href={`/projets/${projet.id}/storyboard`}
                  className="border-app-line bg-surface hover:border-secondary/40 flex h-full flex-col rounded-xl border p-5 transition-colors"
                >
                  <span className="text-secondary flex flex-wrap gap-2 text-xs">
                    <span>{FORMATS[projet.format]}</span>
                    <span className="text-gold">{ETAPES[projet.stage]}</span>
                  </span>
                  <span className="mt-3 flex-1 font-serif text-lg leading-snug text-pretty">
                    {projet.title}
                  </span>
                  <span className={`mt-4 text-sm ${nombre ? "text-light" : "text-secondary"}`}>
                    {nombre ? `${nombre} scène${nombre > 1 ? "s" : ""}` : "Aucune scène"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <StoryboardIcon className="text-gold mx-auto size-9" />
          <p className="text-secondary mx-auto mt-4 max-w-md text-sm leading-relaxed">
            Le storyboard se construit dans chaque projet. Créez d&apos;abord un projet.
          </p>
          <Link
            href="/projets/nouveau"
            className="bg-gold text-navy hover:bg-gold-bright mt-6 inline-flex items-center rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          >
            Créer un projet
          </Link>
        </div>
      )}
    </div>
  );
}
