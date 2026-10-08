import Link from "next/link";

import { Horodatage } from "@/components/ui/horodatage";
import { createClient } from "@/lib/supabase/server";

import { auteurDeVersion } from "./versions/auteur";

/** Historique des versions d'un document, de la plus récente à la plus ancienne. */
export async function HistoriqueVersions({
  projetId,
  documentId,
}: {
  projetId: string;
  documentId: string;
}) {
  const supabase = await createClient();

  // Le texte des versions n'est pas chargé ici : jusqu'à 200 000 caractères
  // chacune, pour une liste qui n'en affiche aucun.
  const [{ data: versions }, { data: equipe }] = await Promise.all([
    supabase
      .from("project_document_versions")
      .select("id, version_number, created_at, created_by, restored_from")
      .eq("document_id", documentId)
      .eq("project_id", projetId)
      .order("version_number", { ascending: false }),
    supabase.rpc("equipe_du_projet", { p_project_id: projetId }),
  ]);

  const liste = versions ?? [];

  return (
    <section aria-labelledby="historique-titre" className="mt-16">
      <h2 id="historique-titre" className="text-sm font-medium">
        Historique des versions
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed">
        Chaque enregistrement qui change le titre ou le texte crée une version. Aucune n&apos;est
        jamais effacée ; restaurer une version en crée une nouvelle. Chaque version se compare à
        celle qui la précède.
      </p>

      {liste.length ? (
        <ol className="border-app-line mt-5 divide-y divide-[var(--app-line)] rounded-xl border">
          {liste.map((version, index) => {
            const auteur = auteurDeVersion(version.created_by, equipe ?? []);
            // La liste va de la plus récente à la plus ancienne : la
            // précédente est la suivante de la liste.
            const precedente = liste[index + 1];
            return (
              <li
                key={version.id}
                className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <p>
                  <Link
                    href={`/projets/${projetId}/documents/${documentId}/versions/${version.version_number}`}
                    className="hover:text-gold font-medium underline-offset-4 transition-colors hover:underline"
                  >
                    Version {version.version_number}
                  </Link>
                  {index === 0 ? <span className="text-secondary"> · la plus récente</span> : null}
                  {version.restored_from ? (
                    <span className="text-secondary">
                      {" "}
                      · restauration de la version {version.restored_from}
                    </span>
                  ) : null}
                </p>
                <p className="text-secondary text-xs">
                  <Horodatage iso={version.created_at} />
                  {auteur ? ` · ${auteur}` : null}
                  {precedente ? (
                    <>
                      {" · "}
                      <Link
                        href={`/projets/${projetId}/documents/${documentId}/comparaison?de=${precedente.version_number}&a=${version.version_number}`}
                        className="hover:text-gold underline underline-offset-4 transition-colors"
                      >
                        Comparer à la précédente
                        <span className="sr-only">
                          {" "}
                          : version {precedente.version_number} et version {version.version_number}
                        </span>
                      </Link>
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="border-app-line text-secondary mt-5 rounded-xl border border-dashed px-5 py-6 text-sm">
          Aucune version pour l&apos;instant : la première naîtra au premier enregistrement du
          texte.
        </p>
      )}
    </section>
  );
}
