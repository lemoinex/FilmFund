import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TexteMisEnForme } from "@/components/texte-mis-en-forme";
import { BoutonConfirme } from "@/components/ui/confirmation";
import { compterMots, libelleMots, TYPES_DOCUMENT } from "@/lib/documents";
import {
  etapeProposition,
  extrairePassage,
  LIVRABLE_DIALOGUE,
  type EtapeProposition,
} from "@/lib/propositions";
import { createClient } from "@/lib/supabase/server";

import { RafraichissementPropositions } from "../../proposition";
import { supprimerDocument } from "../actions";
import { EditeurDocument } from "../formulaires";
import { BadgeStatut } from "../statut";
import { Dialogues } from "./dialogues";
import { HistoriqueVersions } from "./historique";

export const metadata: Metadata = {
  title: "Document — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string }>;
}) {
  const { id, documentId } = await params;
  const supabase = await createClient();

  const [{ data: document }, { data: peutEditer }] = await Promise.all([
    supabase
      .from("project_documents")
      .select("id, type, status, title, content, updated_at, projects(id, title)")
      .eq("id", documentId)
      .eq("project_id", id)
      .maybeSingle(),
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
  ]);

  // La RLS rend zéro ligne pour un document inexistant comme pour celui
  // d'un projet où l'on n'a pas accès : même 404, rien n'est révélé.
  if (!document || !document.projects) {
    notFound();
  }

  const projet = document.projects;

  // Les dialogues d'une scène ne se demandent que sur un scénario, par qui
  // peut l'écrire : rien n'est lu pour les autres.
  const dialogues =
    peutEditer && document.type === "scenario"
      ? await lireDialogues(supabase, projet.id, document.id, document.content)
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}/documents`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← Documents de {projet.title}
      </Link>

      {peutEditer ? (
        <>
          <h1 className="sr-only">{document.title}</h1>
          <p className="text-gold mt-6 text-sm">{TYPES_DOCUMENT[document.type].libelle}</p>
          <div className="mt-4">
            {/*
             * Pas de `key` liée à la date de modification : l'enregistrement
             * relit les données serveur, et remonter l'éditeur à ce moment
             * effacerait ce qui a été tapé pendant l'enregistrement.
             */}
            <EditeurDocument projetId={projet.id} document={document} />
          </div>

          {dialogues ? (
            <>
              <RafraichissementPropositions
                actif={
                  dialogues.etape.etape === "en_attente" || dialogues.etape.etape === "en_cours"
                }
              />
              <Dialogues
                projetId={projet.id}
                documentId={document.id}
                contenuEnregistre={document.content}
                sceneActuelle={dialogues.scene}
                etape={dialogues.etape}
              />
            </>
          ) : null}

          <HistoriqueVersions projetId={projet.id} documentId={document.id} />

          <section className="border-app-line mt-16 rounded-xl border border-dashed p-5">
            <h2 className="text-sm font-medium">Supprimer ce document</h2>
            <p className="text-secondary mt-2 mb-4 text-sm leading-relaxed">
              La suppression est définitive, historique des versions compris.
            </p>
            <BoutonConfirme
              action={supprimerDocument}
              champs={{ projet: projet.id, document: document.id }}
              libelle="Supprimer le document"
              confirmation="Confirmer la suppression"
            />
          </section>
        </>
      ) : (
        <article className="mt-6">
          <p className="text-gold text-sm">{TYPES_DOCUMENT[document.type].libelle}</p>
          <h1 className="mt-3 font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
            {document.title}
          </h1>
          <p className="text-secondary mt-4 flex flex-wrap items-center gap-3 text-xs">
            <BadgeStatut statut={document.status} />
            {libelleMots(compterMots(document.content))} · modifié le{" "}
            {dateFr.format(new Date(document.updated_at))}
          </p>
          <div className="border-app-line mt-8 border-t pt-8 text-[0.9375rem] leading-relaxed">
            {document.content ? (
              <TexteMisEnForme texte={document.content} type={document.type} />
            ) : (
              <span className="text-secondary">Ce document est vide.</span>
            )}
          </div>
        </article>
      )}

      {peutEditer ? null : <HistoriqueVersions projetId={projet.id} documentId={document.id} />}
    </div>
  );
}

/**
 * Où en est la dernière demande de dialogues sur ce document, et la scène
 * que sa proposition remplacerait.
 *
 * Deux lectures bornées, sous la RLS de l'appelant. La scène montrée en
 * regard est relue dans le document d'après la position de la demande : si
 * le scénario a changé à cet endroit, ce n'est plus elle — la base, qui
 * contrôle son empreinte, refusera alors le remplacement.
 */
async function lireDialogues(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  documentId: string,
  contenu: string,
): Promise<{ etape: EtapeProposition; scene: string }> {
  const { data: tache } = await supabase
    .from("jobs")
    .select("id, state, params")
    .eq("project_id", projetId)
    .eq("action", LIVRABLE_DIALOGUE.action)
    .eq("params->>document", documentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: proposition } = tache
    ? await supabase
        .from("ai_suggestions")
        .select("id, content, state")
        .eq("job_id", tache.id)
        .maybeSingle()
    : { data: null };

  const etape = etapeProposition(tache, proposition);
  if (etape.etape !== "proposition" || !tache) {
    return { etape, scene: "" };
  }

  const parametres =
    tache.params && typeof tache.params === "object" && !Array.isArray(tache.params)
      ? tache.params
      : {};
  return {
    etape,
    scene: extrairePassage(contenu, Number(parametres.debut), Number(parametres.longueur)),
  };
}
