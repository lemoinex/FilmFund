import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Horodatage } from "@/components/ui/horodatage";
import {
  bilanComparaison,
  bilanEnClair,
  comparerTextes,
  lireVersionsComparees,
  replierInchange,
  type LigneComparee,
  type Segment,
} from "@/lib/comparaison";
import { createClient } from "@/lib/supabase/server";

import { auteurDeVersion } from "../versions/auteur";

export const metadata: Metadata = {
  title: "Comparer deux versions — filmfundAfrica",
  robots: { index: false, follow: false },
};

const premier = (valeur: string | string[] | undefined) =>
  Array.isArray(valeur) ? valeur[0] : valeur;

/**
 * Ce qui a changé entre deux versions d'un document, toujours lu de la plus
 * ancienne à la plus récente : un ajout se lit comme un ajout, d'où que l'on
 * vienne.
 *
 * La page ne fait que lire, sous la RLS de l'appelant, comme la page d'une
 * version : toute l'équipe du projet y accède, personne n'y écrit.
 */
export default async function ComparaisonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; documentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, documentId } = await params;
  const parametres = await searchParams;
  const numeros = lireVersionsComparees(premier(parametres.de), premier(parametres.a));
  if (!numeros) {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: versions }, { data: document }, { data: equipe }] = await Promise.all([
    supabase
      .from("project_document_versions")
      .select("version_number, title, content, created_at, created_by")
      .eq("document_id", documentId)
      .eq("project_id", id)
      .in("version_number", [numeros.ancienne, numeros.recente]),
    supabase
      .from("project_documents")
      .select("id, title")
      .eq("id", documentId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.rpc("equipe_du_projet", { p_project_id: id }),
  ]);

  const ancienne = versions?.find((v) => v.version_number === numeros.ancienne);
  const recente = versions?.find((v) => v.version_number === numeros.recente);

  // Même 404 pour une version inexistante que pour celle d'un projet où
  // l'on n'a pas accès : rien n'est révélé.
  if (!ancienne || !recente || !document) {
    notFound();
  }

  const comparaison = comparerTextes(ancienne.content, recente.content);
  const bilan = comparaison.tropLong ? null : bilanComparaison(comparaison.lignes);
  const groupes = comparaison.tropLong ? [] : replierInchange(comparaison.lignes);
  const adresse = (numero: number) => `/projets/${id}/documents/${documentId}/versions/${numero}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}/documents/${documentId}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {document.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Comparer deux versions
      </h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed text-pretty">
        Ce qui a changé de la version {ancienne.version_number} à la version{" "}
        {recente.version_number}, toujours lu de la plus ancienne à la plus récente.
      </p>

      <dl className="border-app-line mt-6 grid grid-cols-1 gap-4 rounded-xl border p-5 text-sm sm:grid-cols-2">
        {[ancienne, recente].map((version) => {
          const auteur = auteurDeVersion(version.created_by, equipe ?? []);
          return (
            <div key={version.version_number}>
              <dt>
                <Link
                  href={adresse(version.version_number)}
                  className="hover:text-gold font-medium underline-offset-4 transition-colors hover:underline"
                >
                  Version {version.version_number}
                </Link>
              </dt>
              <dd className="text-secondary mt-1 text-xs">
                <Horodatage iso={version.created_at} />
                {auteur ? ` · ${auteur}` : null}
              </dd>
            </div>
          );
        })}
      </dl>

      {ancienne.title !== recente.title ? (
        <p className="mt-6 text-sm leading-relaxed">
          <span className="text-secondary">Titre : </span>
          <del className="text-red-200 line-through">
            <span className="sr-only">ancien titre, </span>
            {ancienne.title}
          </del>{" "}
          <span aria-hidden="true">→</span>{" "}
          <ins className="text-gold-bright decoration-gold/60 underline underline-offset-4">
            <span className="sr-only">nouveau titre, </span>
            {recente.title}
          </ins>
        </p>
      ) : (
        <p className="text-secondary mt-6 text-sm">Le titre n&apos;a pas changé.</p>
      )}

      {bilan ? (
        <>
          <p role="status" className="mt-4 text-sm leading-relaxed">
            {bilanEnClair(bilan)}
          </p>

          {bilan.identiques ? null : (
            <>
              <p className="text-secondary mt-4 text-xs leading-relaxed">
                <span aria-hidden="true">− </span>
                <span className="text-red-200 line-through">texte retiré</span> ·{" "}
                <span aria-hidden="true">+ </span>
                <span className="text-gold-bright decoration-gold/60 underline underline-offset-4">
                  texte ajouté
                </span>
                . Le texte inchangé loin d&apos;une modification est replié.
              </p>

              <div className="border-app-line mt-6 space-y-2 border-t pt-6 text-[0.9375rem] leading-relaxed">
                {groupes.map((groupe, rang) =>
                  groupe.type === "repli" ? (
                    <p
                      key={rang}
                      className="border-app-line text-secondary border-y border-dashed py-2 text-center text-xs"
                    >
                      {groupe.nombre} lignes inchangées
                    </p>
                  ) : (
                    <div key={rang} className="space-y-1">
                      {groupe.lignes.map((ligne, numero) => (
                        <Ligne key={numero} ligne={ligne} />
                      ))}
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <p
          role="status"
          className="border-app-line text-secondary mt-6 rounded-xl border border-dashed p-5 text-sm leading-relaxed"
        >
          Ces deux versions sont trop différentes pour être comparées ligne à ligne ici. Ouvrez-les
          l&apos;une et l&apos;autre pour les lire.
        </p>
      )}
    </div>
  );
}

/** Un mot ou un passage, marqué autrement que par sa seule couleur. */
function Marque({ segment }: { segment: Segment }) {
  if (segment.type === "retire") {
    return (
      <del className="text-red-200 line-through">
        <span className="sr-only"> retiré : </span>
        {segment.texte}
      </del>
    );
  }
  if (segment.type === "ajoute") {
    return (
      <ins className="text-gold-bright decoration-gold/60 underline underline-offset-4">
        <span className="sr-only"> ajouté : </span>
        {segment.texte}
      </ins>
    );
  }
  return <>{segment.texte}</>;
}

/** Une ligne de la comparaison : toujours du texte, jamais du balisage. */
function Ligne({ ligne }: { ligne: LigneComparee }) {
  if (ligne.type === "egal") {
    // Une ligne vide garde sa hauteur : c'est une séparation de paragraphes.
    return <p className="min-h-[1.5em] break-words whitespace-pre-wrap">{ligne.texte}</p>;
  }
  if (ligne.type === "modifie") {
    return (
      <p className="border-gold/40 border-l-2 pl-3 break-words whitespace-pre-wrap">
        {ligne.segments.map((segment, rang) => (
          <Marque key={rang} segment={segment} />
        ))}
      </p>
    );
  }
  const retire = ligne.type === "retire";
  return (
    <p
      className={`flex gap-2 border-l-2 pl-3 break-words whitespace-pre-wrap ${retire ? "border-red-400/50" : "border-gold/60"}`}
    >
      <span aria-hidden="true" className="text-secondary shrink-0 select-none">
        {retire ? "−" : "+"}
      </span>
      <span className="min-w-0">
        <Marque segment={{ type: ligne.type, texte: ligne.texte || " " }} />
      </span>
    </p>
  );
}
