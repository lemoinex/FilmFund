import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TexteMisEnForme } from "@/components/texte-mis-en-forme";
import { Horodatage } from "@/components/ui/horodatage";
import { compterMots, libelleMots } from "@/lib/documents";
import { createClient } from "@/lib/supabase/server";

import { FormulaireRestauration } from "../../../formulaires";
import { auteurDeVersion } from "../auteur";

export const metadata: Metadata = {
  title: "Version d'un document — FilmFund Africa",
  robots: { index: false, follow: false },
};

export default async function VersionPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string; numero: string }>;
}) {
  const { id, documentId, numero } = await params;
  const numeroVersion = Number(numero);
  if (!Number.isInteger(numeroVersion) || numeroVersion < 1) {
    notFound();
  }

  const supabase = await createClient();

  const [
    { data: version },
    { data: document },
    { data: peutEditer },
    { data: equipe },
    { data: derniere },
  ] = await Promise.all([
    supabase
      .from("project_document_versions")
      .select("id, version_number, title, content, created_at, created_by, restored_from")
      .eq("document_id", documentId)
      .eq("project_id", id)
      .eq("version_number", numeroVersion)
      .maybeSingle(),
    supabase
      .from("project_documents")
      .select("id, title, content, type")
      .eq("id", documentId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
    supabase.rpc("equipe_du_projet", { p_project_id: id }),
    // Le numéro seul de la version la plus récente : c'est elle, le texte
    // actuel du document, puisque chaque enregistrement en crée une.
    supabase
      .from("project_document_versions")
      .select("version_number")
      .eq("document_id", documentId)
      .eq("project_id", id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Même 404 pour une version inexistante que pour celle d'un projet où
  // l'on n'a pas accès : rien n'est révélé.
  if (!version || !document) {
    notFound();
  }

  const actuelle = version.title === document.title && version.content === document.content;
  const auteur = auteurDeVersion(version.created_by, equipe ?? []);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}/documents/${documentId}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {document.title}
      </Link>

      <article className="mt-6">
        <p className="text-gold text-sm">
          Version {version.version_number}
          {version.restored_from ? ` · restauration de la version ${version.restored_from}` : null}
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
          {version.title}
        </h1>
        <p className="text-secondary mt-4 text-xs">
          {libelleMots(compterMots(version.content))} · <Horodatage iso={version.created_at} />
          {auteur ? ` · ${auteur}` : null}
        </p>
        <div className="border-app-line mt-8 border-t pt-8 text-[0.9375rem] leading-relaxed">
          {version.content ? (
            // Une version n'a pas de type à elle : elle se lit comme son document.
            <TexteMisEnForme texte={version.content} type={document.type} />
          ) : (
            <span className="text-secondary">Cette version est vide.</span>
          )}
        </div>
      </article>

      {derniere && derniere.version_number !== version.version_number ? (
        <p className="mt-8 text-sm">
          <Link
            href={`/projets/${id}/documents/${documentId}/comparaison?de=${version.version_number}&a=${derniere.version_number}`}
            className="text-gold hover:text-gold-bright underline underline-offset-4 transition-colors"
          >
            Comparer à la version actuelle
            <span className="sr-only"> (version {derniere.version_number})</span>
          </Link>
        </p>
      ) : null}

      {actuelle ? (
        <p className="border-app-line text-secondary mt-12 rounded-xl border border-dashed p-5 text-sm">
          C&apos;est le titre et le texte actuels du document.
        </p>
      ) : peutEditer ? (
        <section
          aria-labelledby="restauration-titre"
          className="border-app-line mt-12 rounded-xl border border-dashed p-5"
        >
          <h2 id="restauration-titre" className="text-sm font-medium">
            Restaurer cette version
          </h2>
          <p className="text-secondary mt-2 mb-4 text-sm leading-relaxed">
            Son titre et son texte redeviennent ceux du document. Rien ne se perd : le texte actuel
            reste dans l&apos;historique, et la restauration y figure comme une nouvelle version.
          </p>
          <FormulaireRestauration projetId={id} documentId={documentId} versionId={version.id} />
        </section>
      ) : null}
    </div>
  );
}
