import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ArrowRightIcon } from "@/components/icons";
import { ROLES_PROJET } from "@/lib/equipes";
import { LIMITE_SCORES_LISTE } from "@/lib/maturite";
import { chargerMesProjets, type ResumeProjet } from "@/lib/mes-projets";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { chargerScores, EtiquetteMaturite } from "./[id]/maturite";

export const metadata: Metadata = {
  title: "Mes projets — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function ProjetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const { possedes, partages, autres } = await chargerMesProjets(supabase, user.id, {
    inclureAutres: true,
  });

  // Dans l'ordre de la page : si le plafond coupe, ce sont les derniers
  // projets affichés qui restent sans score.
  const affiches = [...possedes, ...partages, ...autres];
  const scores = await chargerScores(affiches.map((projet) => projet.id));

  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
            Mes projets
          </h1>
          <p className="text-light-muted mt-3 text-sm leading-relaxed">
            {possedes.length
              ? `${possedes.length} projet${possedes.length > 1 ? "s" : ""}.`
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

      {possedes.length ? (
        <ListeProjets projets={possedes} scores={scores} />
      ) : (
        <p className="border-navy-line text-light-muted mt-10 rounded-xl border border-dashed p-10 text-center text-sm">
          Vos projets apparaîtront ici.
        </p>
      )}

      {partages.length ? (
        <section aria-labelledby="partages-titre" className="mt-16">
          <h2 id="partages-titre" className="font-serif text-2xl leading-tight tracking-tight">
            Partagés avec moi
          </h2>
          <p className="text-light-muted mt-2 text-sm leading-relaxed">
            Les projets dont vous faites partie de l&apos;équipe.
          </p>
          <ListeProjets projets={partages} scores={scores} />
        </section>
      ) : null}

      {autres.length ? (
        <section aria-labelledby="autres-titre" className="mt-16">
          <h2 id="autres-titre" className="font-serif text-2xl leading-tight tracking-tight">
            Autres projets de la plateforme
          </h2>
          <p className="text-light-muted mt-2 text-sm leading-relaxed">
            Visibles au titre de l&apos;administration : consultation et suppression, sans
            modification.
          </p>
          <ListeProjets projets={autres} scores={scores} />
        </section>
      ) : null}

      {affiches.length > LIMITE_SCORES_LISTE ? (
        <p className="text-light-muted mt-8 text-xs leading-relaxed">
          La maturité s&apos;affiche pour les {LIMITE_SCORES_LISTE} premiers projets de cette page.
          Elle se lit toujours sur la page de chaque projet.
        </p>
      ) : null}
    </div>
  );
}

function ListeProjets({
  projets,
  scores,
}: {
  projets: ResumeProjet[];
  scores: Map<string, number>;
}) {
  return (
    <ul className="border-navy-line mt-8 divide-y divide-[var(--navy-line)] rounded-xl border">
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
              {projet.role ? (
                <span className="border-navy-line rounded border px-2.5 py-1">
                  {ROLES_PROJET[projet.role]}
                </span>
              ) : null}
              <EtiquetteMaturite
                score={scores.get(projet.id)}
                className="border-gold/40 text-light rounded border px-2.5 py-1 tabular-nums"
              />
              <span className="bg-navy-soft rounded px-2.5 py-1">{FORMATS[projet.format]}</span>
              <span className="text-gold bg-gold/10 rounded px-2.5 py-1">
                {ETAPES[projet.stage]}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
