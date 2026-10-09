import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SparkIcon } from "@/components/icons";
import { pageAssistant } from "@/lib/assistant-ia";
import { chargerMesProjets } from "@/lib/mes-projets";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Assistant IA — filmfundAfrica",
  robots: { index: false, follow: false },
};

/**
 * L'assistant se demande projet par projet : cette rubrique mène à la page
 * de chacun. Elle ne lit que les projets, et ne lance rien.
 */
export default async function AssistantIaPage() {
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

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Assistant IA</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        Un seul assistant pour écrire, structurer, documenter, préparer le tournage et chiffrer. Il
        travaille sur un projet à la fois : choisissez-en un pour voir ce qu&apos;il peut y faire,
        et où le lui demander.
      </p>

      {projets.length ? (
        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projets.map((projet) => (
            <li key={projet.id}>
              <Link
                href={pageAssistant(projet.id)}
                className="border-app-line bg-surface hover:border-secondary/40 flex h-full flex-col rounded-xl border p-5 transition-colors"
              >
                <span className="text-secondary flex flex-wrap gap-2 text-xs">
                  <span>{FORMATS[projet.format]}</span>
                  <span className="text-gold">{ETAPES[projet.stage]}</span>
                </span>
                <span className="mt-3 flex-1 font-serif text-lg leading-snug text-pretty">
                  {projet.title}
                </span>
                <span className="text-secondary mt-4 text-sm">
                  Voir ce que l&apos;assistant peut faire
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <SparkIcon className="text-gold mx-auto size-9" />
          <p className="text-secondary mx-auto mt-4 max-w-md text-sm leading-relaxed">
            L&apos;assistant travaille sur un projet. Créez d&apos;abord un projet.
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
