import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GENRES } from "@/lib/fiche";
import {
  CATEGORIES_OPPORTUNITE,
  echeanceDe,
  jourCourant,
  montantEnClair,
  STATUTS_OPPORTUNITE,
  STATUTS_VISIBLES,
  statutPresente,
} from "@/lib/opportunites";
import { FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Opportunité — filmfundAfrica",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NON_FOURNIE = "Information non fournie.";

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const enJour = (valeur: string) => jour.format(new Date(valeur));

const libelles = (codes: readonly string[], referentiel: Readonly<Record<string, string>>) =>
  codes.map((code) => referentiel[code] ?? code).join(", ");

function Lien({ adresse }: { adresse: string }) {
  return (
    <a
      href={adresse}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="text-gold hover:text-gold-bright break-all underline-offset-2 hover:underline"
    >
      {adresse}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}

export default async function OpportunitePage({
  params,
}: {
  params: Promise<{ opportuniteId: string }>;
}) {
  const { opportuniteId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }
  if (!UUID.test(opportuniteId)) {
    notFound();
  }

  // Même filtre que la liste : un administrateur ne lit pas ici ce que les
  // équipes ne lisent pas.
  const { data: opportunite } = await supabase
    .from("funding_opportunities")
    .select(
      "id, name, organization, category, description, website, application_url, countries, formats, genres, budget_min, budget_max, currency, opens_on, deadline, requirements, source_url, collected_on, source_excerpt, status",
    )
    .eq("id", opportuniteId)
    .in("status", STATUTS_VISIBLES)
    .maybeSingle();

  if (!opportunite) {
    notFound();
  }

  const aujourdhui = jourCourant();
  const statut = statutPresente(opportunite, aujourdhui);
  const expiree = echeanceDe(opportunite, aujourdhui) === "passee";
  const pasEncoreOuverte = opportunite.opens_on !== null && opportunite.opens_on > aujourdhui;
  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p>
        <Link
          href="/opportunites"
          className="text-secondary hover:text-light text-xs transition-colors"
        >
          ← Toutes les opportunités
        </Link>
      </p>

      <h1 className="mt-5 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        {opportunite.name}
      </h1>
      <p className="text-secondary mt-2 text-sm">
        {opportunite.organization} ·{" "}
        {CATEGORIES_OPPORTUNITE[opportunite.category as keyof typeof CATEGORIES_OPPORTUNITE] ??
          opportunite.category}
      </p>
      <p className={`mt-3 text-xs font-medium ${expiree ? "text-light" : "text-gold-bright"}`}>
        {STATUTS_OPPORTUNITE[statut]}
        {expiree && opportunite.status === "verifie" ? " — date limite passée" : ""}
        {!expiree && pasEncoreOuverte ? " — pas encore ouverte" : ""}
      </p>

      {expiree ? (
        <p className="border-app-line text-secondary mt-6 rounded-xl border p-5 text-sm leading-relaxed text-pretty">
          Cette opportunité est close. Elle reste affichée pour mémoire : une nouvelle édition peut
          exister, que seule la source dira.
        </p>
      ) : null}

      <section aria-labelledby="opportunite-description" className="mt-10">
        <h2 id="opportunite-description" className="font-serif text-xl">
          Description
        </h2>
        <p className="mt-3 text-sm leading-relaxed whitespace-pre-line">
          {opportunite.description || NON_FOURNIE}
        </p>
      </section>

      <section aria-labelledby="opportunite-conditions" className="mt-10">
        <h2 id="opportunite-conditions" className="font-serif text-xl">
          Ce que la source annonce
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-secondary text-xs">Montant</dt>
            <dd className="mt-0.5">{montantEnClair(opportunite)}</dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Ouverture</dt>
            <dd className="mt-0.5">
              {opportunite.opens_on ? enJour(opportunite.opens_on) : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Date limite</dt>
            <dd className="mt-0.5">
              {opportunite.deadline ? enJour(opportunite.deadline) : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Pays éligibles</dt>
            <dd className="mt-0.5">
              {opportunite.countries.length
                ? opportunite.countries.map((code) => noms.of(code) ?? code).join(", ")
                : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Types de projet</dt>
            <dd className="mt-0.5">
              {opportunite.formats.length ? libelles(opportunite.formats, FORMATS) : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Genres</dt>
            <dd className="mt-0.5">
              {opportunite.genres.length ? libelles(opportunite.genres, GENRES) : NON_FOURNIE}
            </dd>
          </div>
        </dl>

        <h3 className="mt-6 text-sm font-medium">Exigences</h3>
        <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
          {opportunite.requirements || NON_FOURNIE}
        </p>
      </section>

      <section aria-labelledby="opportunite-liens" className="mt-10">
        <h2 id="opportunite-liens" className="font-serif text-xl">
          Candidater
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-secondary text-xs">Page de candidature</dt>
            <dd className="mt-0.5">
              {opportunite.application_url ? (
                <Lien adresse={opportunite.application_url} />
              ) : (
                NON_FOURNIE
              )}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Site de l&apos;organisme</dt>
            <dd className="mt-0.5">
              {opportunite.website ? <Lien adresse={opportunite.website} /> : NON_FOURNIE}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="opportunite-source"
        className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="opportunite-source" className="font-serif text-xl">
          Source
        </h2>
        <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
          Ce qui précède a été confronté à cette page par l&apos;administration, le jour indiqué.
          Rien ne garantit qu&apos;elle n&apos;a pas changé depuis.
        </p>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-secondary text-xs">Adresse</dt>
            <dd className="mt-0.5">
              {opportunite.source_url ? <Lien adresse={opportunite.source_url} /> : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Lue le</dt>
            <dd className="mt-0.5">
              {opportunite.collected_on ? enJour(opportunite.collected_on) : NON_FOURNIE}
            </dd>
          </div>
          <div>
            <dt className="text-secondary text-xs">Extrait</dt>
            <dd className="mt-0.5 leading-relaxed whitespace-pre-line">
              {opportunite.source_excerpt || NON_FOURNIE}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
