import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { FormulaireEdition } from "./formulaire";

export const metadata: Metadata = {
  title: "Projet — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  /*
   * `maybeSingle` plutôt que `single` : la RLS renvoie zéro ligne aussi bien
   * pour un projet inexistant que pour celui d'un autre utilisateur. Les deux
   * cas donnent la même page 404, ce qui évite de révéler l'existence du
   * projet d'autrui.
   */
  const { data: projet } = await supabase
    .from("projects")
    .select("id, title, format, stage, logline, synopsis")
    .eq("id", id)
    .maybeSingle();

  if (!projet) {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/projets" className="text-light-muted hover:text-light text-sm transition-colors">
        ← Mes projets
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
        {projet.title}
      </h1>

      <div className="mt-10">
        <FormulaireEdition projet={projet} />
      </div>
    </div>
  );
}
