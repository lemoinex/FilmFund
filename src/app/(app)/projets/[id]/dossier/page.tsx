import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ORDRE_TYPES, TYPES_DOCUMENT } from "@/lib/documents";
import { estSerie } from "@/lib/episodes";
import {
  ACTIONS_EXPORT,
  detailFiche,
  estFormatExport,
  etapeExport,
  FORMATS_EXPORT,
  libelleDemande,
  ORDRE_SECTIONS,
  pages,
  poids,
  premierDuMois,
  SECTIONS,
  SECTIONS_D_OUVERTURE,
  SECTIONS_DE_SERIE,
  type SectionExport,
} from "@/lib/exports";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";
import { SelectionExport, type OptionExport } from "./selection";

export const metadata: Metadata = {
  title: "Dossier — FilmFund Africa",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});
const jourFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

/** Les plus récents d'abord ; au-delà, les exports plus anciens expirent d'eux-mêmes. */
const EXPORTS_AFFICHES = 10;

const LIBELLES_DOCUMENTS = Object.fromEntries(
  ORDRE_TYPES.map((type) => [type, TYPES_DOCUMENT[type].libelle]),
);

/** « 2 lignes de budget », « 1 candidature » ; rien : la formule donnée. */
function compte(nombre: number, un: string, plusieurs: string, aucun: string): string {
  return nombre ? `${nombre} ${nombre > 1 ? plusieurs : un}` : aucun;
}

export default async function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: autorise },
    { data: finalises },
    { data: budget },
    { count: lignes },
    { count: candidatures },
    { count: etapes },
    { count: personnages },
    { count: plans },
    { count: equipements },
    { count: episodes },
    { data: tache },
    { data: exportsDisponibles },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, format, logline, synopsis, genre, countries, languages, duration_minutes, short_synopsis, theme, stakes, artistic_vision, goals, audience",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase.from("project_documents").select("type").eq("project_id", id).eq("status", "finalise"),
    supabase.from("project_budgets").select("currency").eq("project_id", id).maybeSingle(),
    supabase.from("budget_lines").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase
      .from("project_fundings")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("project_milestones")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("project_characters")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
    supabase.from("scene_shots").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase.from("project_gear").select("id", { count: "exact", head: true }).eq("project_id", id),
    supabase
      .from("project_episodes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
    supabase
      .from("jobs")
      .select("id, state, reason")
      .eq("project_id", id)
      .in("action", ACTIONS_EXPORT)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Jamais la colonne `file` ici : elle ne se lit qu'au téléchargement.
    supabase
      .from("project_exports")
      .select("id, params, format, pages, size_bytes, created_at, expires_at")
      .eq("project_id", id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(EXPORTS_AFFICHES),
  ]);

  /*
   * Un dossier peut contenir le budget : il suit sa règle. Un lecteur de
   * l'équipe lit le projet mais pas ses exports ; il obtient la même 404
   * qu'un inconnu. La RLS garantit de toute façon qu'aucun fichier ne lui
   * parviendrait.
   */
  if (!projet || !autorise) {
    notFound();
  }

  const fiche = detailFiche(projet, personnages ?? 0);

  // Chaque case dit ce qu'elle apporterait, et ce qui n'y entre jamais.
  const contenuDes: Record<SectionExport, { detail: string; disponible: boolean }> = {
    synthese: {
      detail:
        projet.logline.trim() || projet.synopsis.trim()
          ? "Le pitch et le synopsis"
          : "Ni pitch ni synopsis pour l'instant",
      disponible: Boolean(projet.logline.trim() || projet.synopsis.trim()),
    },
    episodes: {
      detail: episodes
        ? `${compte(episodes, "épisode", "épisodes", "")} : numéro, titre, durée et résumé`
        : "Aucun épisode pour l'instant",
      disponible: (episodes ?? 0) > 0,
    },
    fiche_projet: {
      detail: fiche ?? "La fiche est encore vide",
      disponible: fiche !== null,
    },
    budget: {
      detail: !budget
        ? "Le budget n'est pas encore ouvert"
        : lignes
          ? `${compte(lignes, "ligne de budget", "lignes de budget", "")}, sans les montants réalisés`
          : "Aucune ligne de budget",
      disponible: Boolean(budget) && (lignes ?? 0) > 0,
    },
    financements: {
      detail: candidatures
        ? `${compte(candidatures, "candidature", "candidatures", "")}, sans vos notes`
        : "Aucune candidature",
      disponible: (candidatures ?? 0) > 0,
    },
    planning: {
      detail: compte(etapes ?? 0, "étape", "étapes", "Aucune étape"),
      disponible: (etapes ?? 0) > 0,
    },
    decoupage: {
      detail: plans
        ? `${compte(plans, "plan", "plans", "")}, scène par scène, sans les images`
        : "Aucun plan dans le découpage",
      disponible: (plans ?? 0) > 0,
    },
    materiel: {
      detail: equipements
        ? `${compte(equipements, "équipement", "équipements", "")}, sans le besoin électrique`
        : "Aucun équipement",
      disponible: (equipements ?? 0) > 0,
    },
  };

  // Dans l'ordre du dossier : la synthèse et la fiche, les documents, puis les tableaux.
  const section = (code: SectionExport): OptionExport => ({
    groupe: "section",
    code,
    libelle: SECTIONS[code].libelle,
    ...contenuDes[code],
  });
  const options: OptionExport[] = [
    // La saison ne se propose qu'à une série : un autre format n'a pas d'épisodes.
    ...SECTIONS_D_OUVERTURE.filter(
      (code) => !SECTIONS_DE_SERIE.includes(code) || estSerie(projet.format),
    ).map(section),
    ...ORDRE_TYPES.map((type): OptionExport => {
      const nombre = (finalises ?? []).filter((document) => document.type === type).length;
      return {
        groupe: "document",
        code: type,
        libelle: TYPES_DOCUMENT[type].libelle,
        detail: compte(
          nombre,
          "document finalisé",
          "documents finalisés",
          "Aucun document finalisé",
        ),
        disponible: nombre > 0,
      };
    }),
    ...ORDRE_SECTIONS.filter((code) => !SECTIONS_D_OUVERTURE.includes(code)).map(section),
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Dossier</h1>

      <OngletsProjet projetId={projet.id} actif="dossier" budget />

      <p className="text-secondary mt-8 max-w-2xl text-sm leading-relaxed text-pretty">
        Réunissez les pièces du projet : en PDF, prêt à être envoyé ; en Word, à retoucher ; ou en
        archive ZIP, un fichier Word par texte et un classeur Excel par tableau. Un dossier
        n&apos;est visible que du porteur, des éditeurs et des administrateurs : il peut contenir le
        budget, auquel les lecteurs de l&apos;équipe n&apos;ont pas accès.
      </p>

      <SelectionExport projetId={projet.id} options={options} etape={etapeExport(tache)} />

      <section aria-labelledby="dossiers-disponibles" className="mt-12">
        <h2 id="dossiers-disponibles" className="font-serif text-2xl leading-tight">
          Dossiers disponibles
        </h2>
        {exportsDisponibles?.length ? (
          <ul className="border-app-line mt-5 divide-y divide-[var(--app-line)] rounded-xl border">
            {exportsDisponibles.map((dossier) => {
              const format = estFormatExport(dossier.format) ? dossier.format : "pdf";
              return (
                <li
                  key={dossier.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-sm leading-relaxed text-pretty">
                      <span className="border-app-line text-secondary mr-2 inline-block rounded-full border px-2 py-0.5 align-middle text-[0.6875rem]">
                        {FORMATS_EXPORT[format].libelle}
                      </span>
                      {libelleDemande(dossier.params, LIBELLES_DOCUMENTS)}
                    </p>
                    <p className="text-secondary mt-1 text-xs leading-relaxed">
                      Fabriqué le{" "}
                      <time dateTime={dossier.created_at}>
                        {premierDuMois(dateFr.format(new Date(dossier.created_at)))}
                      </time>{" "}
                      UTC ·{" "}
                      {/* Seul un PDF a une pagination arrêtée : un traitement de texte la recalcule, une archive n'en a pas. */}
                      {dossier.pages ? `${pages(dossier.pages)} · ` : ""}
                      {poids(dossier.size_bytes ?? 0)} · disponible jusqu&apos;au{" "}
                      <time dateTime={dossier.expires_at}>
                        {premierDuMois(jourFr.format(new Date(dossier.expires_at)))}
                      </time>
                    </p>
                  </div>
                  {/* Lien ordinaire, et non `Link` : un fichier ne se précharge pas. */}
                  <a
                    href={`/projets/${projet.id}/dossier/${dossier.id}`}
                    className="border-app-line hover:bg-surface-hover shrink-0 rounded-full border px-4 py-2 text-sm transition-colors"
                  >
                    Télécharger
                    <span className="sr-only">
                      {" "}
                      le dossier {FORMATS_EXPORT[format].libelle} du{" "}
                      {premierDuMois(dateFr.format(new Date(dossier.created_at)))}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="border-app-line text-secondary mt-5 rounded-xl border border-dashed px-5 py-8 text-center text-sm leading-relaxed">
            Aucun dossier pour l&apos;instant. Un dossier fabriqué reste disponible 30 jours.
          </p>
        )}
      </section>
    </div>
  );
}
