import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRightIcon, ClapperIcon } from "@/components/icons";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Tableau de bord — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function TableauDeBord() {
  const supabase = await createClient();

  // Inutile de filtrer par porteur : la RLS ne renvoie que les projets de
  // l'utilisateur courant.
  const { data: projets } = await supabase
    .from("projects")
    .select("id, title, format, stage, logline, updated_at")
    .order("updated_at", { ascending: false })
    .limit(5);

  const total = projets?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Tableau de bord
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed">
        {total === 0
          ? "Votre espace est prêt. Créez votre premier projet pour commencer."
          : `${total} projet${total > 1 ? "s" : ""} récent${total > 1 ? "s" : ""}.`}
      </p>

      {total === 0 ? (
        <div className="border-navy-line bg-navy-soft/40 mt-10 rounded-xl border p-10 text-center">
          <ClapperIcon className="text-gold mx-auto size-10" />
          <p className="mt-5 font-serif text-xl">Aucun projet pour l&apos;instant</p>
          <p className="text-light-muted mx-auto mt-3 max-w-md text-sm leading-relaxed text-pretty">
            Un projet rassemble votre titre, votre format, votre pitch et votre synopsis. Vous
            pourrez le compléter au fil du développement.
          </p>
          <Link
            href="/projets/nouveau"
            className="bg-gold text-navy hover:bg-gold-bright mt-8 inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
          >
            Créer un projet
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projets?.map((projet) => (
              <li key={projet.id}>
                <Link
                  href={`/projets/${projet.id}`}
                  className="border-navy-line bg-navy-soft/40 hover:border-gold/50 block h-full rounded-xl border p-5 transition-colors"
                >
                  <p className="text-light-muted flex flex-wrap gap-2 text-xs">
                    <span className="bg-navy rounded px-2 py-0.5">{FORMATS[projet.format]}</span>
                    <span className="text-gold bg-gold/10 rounded px-2 py-0.5">
                      {ETAPES[projet.stage]}
                    </span>
                  </p>
                  <p className="mt-3 font-serif text-lg leading-snug text-pretty">{projet.title}</p>
                  {projet.logline ? (
                    <p className="text-light-muted mt-2 line-clamp-3 text-sm leading-relaxed">
                      {projet.logline}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/projets/nouveau"
              className="bg-gold text-navy hover:bg-gold-bright inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
            >
              Créer un projet
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="/projets"
              className="border-navy-line hover:border-light-muted hover:bg-navy-soft inline-flex items-center rounded-full border px-6 py-3.5 text-sm transition-colors"
            >
              Voir tous mes projets
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
