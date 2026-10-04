import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentIcon } from "@/components/icons";
import { ORDRE_TYPES, TYPES_DOCUMENT } from "@/lib/documents";
import { lireAcces } from "@/lib/equipes";
import type { ActionIa } from "@/lib/propositions";
import { attenteEnCours, lireEtapes } from "@/lib/propositions-serveur";
import { createClient } from "@/lib/supabase/server";
import type { DocumentType } from "@/lib/supabase/types";

import { OngletsProjet } from "../onglets";
import { Proposition, RafraichissementPropositions } from "../proposition";
import { FormulaireNouveauDocument } from "./formulaires";
import { BadgeStatut } from "./statut";

export const metadata: Metadata = {
  title: "Documents — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

/**
 * Les livrables que cette rubrique porte, et le type de document où chacun
 * atterrit. La base écrit dans le document de ce type le plus récemment
 * modifié : l'écran doit montrer celui-là, sans quoi la comparaison
 * avant/après mentirait.
 */
const LIVRABLES_DOCUMENTS: Readonly<
  Record<ActionIa & ("synopsis_detailed" | "intention_note" | "treatment" | "bible"), DocumentType>
> = {
  synopsis_detailed: "synopsis",
  treatment: "traitement",
  bible: "bible",
  intention_note: "note_intention",
};

export default async function DocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type: typeDemande } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: peutEditer },
    { data: accesBrut },
    { data: estAdmin },
    { data: budget },
    { data: documents },
  ] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
    supabase.rpc("acces_au_projet", { p_project_id: id }),
    supabase.rpc("is_admin"),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase
      .from("project_documents")
      // Sans le contenu : jusqu'à 200 000 caractères par document, inutiles
      // pour une liste.
      .select("id, type, title, status, updated_at")
      .eq("project_id", id)
      .order("updated_at", { ascending: false }),
  ]);

  // Même 404 pour un projet inexistant et pour celui d'autrui.
  if (!projet) {
    notFound();
  }

  // Lien « Rédiger la note d'intention » du tableau de bord : le formulaire
  // s'ouvre sur le bon type.
  const typeParDefaut = ORDRE_TYPES.find((t) => t === typeDemande) as DocumentType | undefined;

  // Assistant d'écriture : demander engage les unités du studio — porteur,
  // éditeur ou administrateur ; appliquer réécrit le projet, et reste au
  // porteur et aux éditeurs.
  const acces = lireAcces(accesBrut);
  const peutAppliquer = acces === "owner" || acces === "editor";
  const peutDemander = peutAppliquer || estAdmin === true;
  const actions = Object.keys(LIVRABLES_DOCUMENTS) as (keyof typeof LIVRABLES_DOCUMENTS)[];
  const etapes = await lireEtapes(supabase, id, actions, peutDemander);

  // Le document visé par chaque livrable : le plus récemment modifié de son
  // type, contenu compris — deux lectures d'une ligne, pas la liste entière.
  const vises = new Map(
    peutDemander
      ? await Promise.all(
          actions.map(async (action) => {
            const { data } = await supabase
              .from("project_documents")
              .select("id, title, content")
              .eq("project_id", id)
              .eq("type", LIVRABLES_DOCUMENTS[action])
              .order("updated_at", { ascending: false })
              .order("id")
              .limit(1)
              .maybeSingle();
            return [action, data] as const;
          }),
        )
      : [],
  );

  const groupes = ORDRE_TYPES.map((type) => ({
    type,
    documents: (documents ?? []).filter((d) => d.type === type),
  })).filter((g) => g.documents.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Documents
      </h1>

      <OngletsProjet projetId={projet.id} actif="documents" budget={budget === true} />

      {groupes.length ? (
        <div className="mt-10 space-y-10">
          {groupes.map(({ type, documents: liste }) => (
            <section key={type} aria-labelledby={`type-${type}`}>
              <h2 id={`type-${type}`} className="text-gold text-sm font-medium">
                {TYPES_DOCUMENT[type].libelle}
              </h2>
              <ul className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
                {liste.map((document) => (
                  <li key={document.id}>
                    <Link
                      href={`/projets/${projet.id}/documents/${document.id}`}
                      className="hover:bg-surface flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block font-serif text-lg leading-snug text-pretty">
                          {document.title}
                        </span>
                        <span className="text-secondary mt-1 block text-xs">
                          Modifié le {dateFr.format(new Date(document.updated_at))}
                        </span>
                      </span>
                      <BadgeStatut statut={document.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <DocumentIcon className="text-gold mx-auto size-9" />
          <p className="mt-4 font-serif text-xl">Aucun document pour l&apos;instant</p>
          <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed text-pretty">
            {peutEditer
              ? "Commencez par la note d'intention : c'est la pièce que tout dossier de financement demande en premier."
              : "Les documents rédigés par l'équipe apparaîtront ici."}
          </p>
        </div>
      )}

      {peutDemander ? (
        <>
          <RafraichissementPropositions actif={attenteEnCours(etapes.values())} />
          {actions.map((action) => {
            const vise = vises.get(action) ?? null;
            return (
              <Proposition
                key={action}
                projetId={id}
                action={action}
                texteActuel={vise?.content ?? ""}
                precision={
                  vise
                    ? `La proposition remplacerait le document « ${vise.title} », qui en garderait une version.`
                    : `Aucun document de type « ${TYPES_DOCUMENT[LIVRABLES_DOCUMENTS[action]].libelle} » : la proposition en créerait un, en brouillon.`
                }
                etape={etapes.get(action) ?? { etape: "repos" }}
                peutAppliquer={peutAppliquer}
              />
            );
          })}
        </>
      ) : null}

      {peutEditer ? (
        <section aria-labelledby="ajout-document" className="border-app-line mt-12 border-t pt-10">
          <h2 id="ajout-document" className="font-serif text-2xl leading-tight">
            Nouveau document
          </h2>
          <div className="mt-6">
            <FormulaireNouveauDocument projetId={projet.id} typeParDefaut={typeParDefaut} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
