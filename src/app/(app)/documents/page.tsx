import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DocumentIcon } from "@/components/icons";
import { TYPES_DOCUMENT } from "@/lib/documents";
import { chargerMesProjets } from "@/lib/mes-projets";
import { createClient } from "@/lib/supabase/server";

import { BadgeStatut } from "../projets/[id]/documents/statut";

export const metadata: Metadata = {
  title: "Documents — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/** Au-delà, la liste cesse d'être un aperçu : chaque projet a sa page. */
const LIMITE = 50;

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Les documents des projets de l'utilisateur, possédés ou partagés. Pas
  // ceux que l'administration rend visibles : cette page est celle de son
  // travail, comme le tableau de bord.
  const { possedes, partages } = await chargerMesProjets(supabase, user.id);
  const projetIds = [...possedes, ...partages].map((p) => p.id);

  const { data: documents } = projetIds.length
    ? await supabase
        .from("project_documents")
        .select("id, type, title, status, updated_at, projects(id, title)")
        .in("project_id", projetIds)
        .order("updated_at", { ascending: false })
        .limit(LIMITE)
    : { data: [] };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Documents</h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed">
        {documents?.length
          ? `Les ${documents.length > 1 ? `${documents.length} documents` : "document"} de vos projets, du plus récent au plus ancien.`
          : "Les documents de vos projets apparaîtront ici."}
      </p>

      {documents?.length ? (
        <ul className="border-app-line mt-10 divide-y divide-[var(--app-line)] rounded-xl border">
          {documents.map((document) =>
            document.projects ? (
              <li key={document.id}>
                <Link
                  href={`/projets/${document.projects.id}/documents/${document.id}`}
                  className="hover:bg-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block font-serif text-lg leading-snug text-pretty">
                      {document.title}
                    </span>
                    <span className="text-secondary mt-1 block text-xs">
                      {TYPES_DOCUMENT[document.type].libelle} · {document.projects.title} · modifié
                      le {dateFr.format(new Date(document.updated_at))}
                    </span>
                  </span>
                  <BadgeStatut statut={document.status} />
                </Link>
              </li>
            ) : null,
          )}
        </ul>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <DocumentIcon className="text-gold mx-auto size-9" />
          <p className="text-secondary mx-auto mt-4 max-w-md text-sm leading-relaxed text-pretty">
            Les documents se créent depuis chaque projet, dans l&apos;onglet Documents.
          </p>
          <Link
            href="/projets"
            className="border-app-line hover:bg-surface-hover mt-6 inline-flex items-center rounded-full border px-5 py-2.5 text-sm transition-colors"
          >
            Voir mes projets
          </Link>
        </div>
      )}
    </div>
  );
}
