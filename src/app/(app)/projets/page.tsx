import type { Metadata } from "next";
import Link from "next/link";

import { ArrowRightIcon } from "@/components/icons";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Mes projets — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function ProjetsPage() {
  const supabase = await createClient();

  const { data: projets } = await supabase
    .from("projects")
    .select("id, title, format, stage, logline, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            Mes projets
          </h1>
          <p className="text-light-muted mt-3 text-sm leading-relaxed">
            {projets?.length
              ? `${projets.length} projet${projets.length > 1 ? "s" : ""}.`
              : "Aucun projet pour l'instant."}
          </p>
        </div>
        <Link
          href="/projets/nouveau"
          className="bg-gold text-navy hover:bg-gold-bright inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
        >
          Créer un projet
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>

      {projets?.length ? (
        <ul className="border-navy-line mt-10 divide-y divide-[var(--navy-line)] rounded-xl border">
          {projets.map((projet) => (
            <li key={projet.id}>
              <Link
                href={`/projets/${projet.id}`}
                className="hover:bg-navy-soft/40 flex flex-wrap items-center justify-between gap-4 p-5 transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-serif text-lg leading-snug text-pretty">{projet.title}</p>
                  {projet.logline ? (
                    <p className="text-light-muted mt-1.5 line-clamp-2 max-w-2xl text-sm leading-relaxed">
                      {projet.logline}
                    </p>
                  ) : null}
                  <p className="text-light-muted mt-2 text-xs">
                    Modifié le {dateFr.format(new Date(projet.updated_at))}
                  </p>
                </div>
                <div className="text-light-muted flex shrink-0 flex-wrap gap-2 text-xs">
                  <span className="bg-navy-soft rounded px-2.5 py-1">{FORMATS[projet.format]}</span>
                  <span className="text-gold bg-gold/10 rounded px-2.5 py-1">
                    {ETAPES[projet.stage]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-navy-line text-light-muted mt-10 rounded-xl border border-dashed p-10 text-center text-sm">
          Vos projets apparaîtront ici.
        </p>
      )}
    </div>
  );
}
