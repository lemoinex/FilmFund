import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { auteurDe, descriptionDe, type Annuaire } from "@/lib/journal-administration";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Journal d'administration — filmfundAfrica",
  robots: { index: false, follow: false },
};

// Fuseau affiché explicitement : le serveur rend en UTC, et une heure sans
// fuseau laisserait croire qu'elle est locale.
const horodatage = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Les plus récentes d'abord ; au-delà, le SQL reste l'outil d'enquête. */
const LIMITE = 200;

export default async function JournalAdministrationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // La RLS ne renverrait rien à un non-administrateur ; on préfère ne pas
  // révéler que la page existe.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    notFound();
  }

  const { data: entrees, error } = await supabase
    .from("admin_audit_log")
    .select("id, created_at, actor_id, action, project_id, details")
    .order("id", { ascending: false })
    .limit(LIMITE);

  if (error) {
    throw new Error("Lecture du journal impossible.");
  }

  const comptesCites = new Set<string>();
  const projetsCites = new Set<string>();
  for (const entree of entrees) {
    if (entree.actor_id) comptesCites.add(entree.actor_id);
    const compte = (entree.details as { compte?: unknown } | null)?.compte;
    if (typeof compte === "string") comptesCites.add(compte);
    if (entree.project_id) projetsCites.add(entree.project_id);
  }

  const [{ data: profils }, { data: projets }, { data: plans }] = await Promise.all([
    comptesCites.size
      ? supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", [...comptesCites])
      : Promise.resolve({ data: [] }),
    projetsCites.size
      ? supabase
          .from("projects")
          .select("id, title")
          .in("id", [...projetsCites])
      : Promise.resolve({ data: [] }),
    supabase.from("plans").select("code, name"),
  ]);

  const annuaire: Annuaire = {
    comptes: new Map((profils ?? []).map((p) => [p.id, p.display_name?.trim() || "Sans nom"])),
    projets: new Map((projets ?? []).map((p) => [p.id, p.title])),
    plans: new Map((plans ?? []).map((p) => [p.code, p.name])),
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Journal d&apos;administration
      </h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed">
        Changements de rôle, modifications de profils, bascules du mode privé, suppressions de
        projets et interventions de l&apos;administration dans les projets et les studios
        d&apos;autrui. Le journal ne se modifie ni ne s&apos;efface ; il ne retient aucun contenu
        d&apos;œuvre. Heures en UTC.
      </p>

      {entrees.length ? (
        <ol className="border-app-line mt-10 divide-y divide-[var(--app-line)] rounded-xl border">
          {entrees.map((entree) => (
            <li
              key={entree.id}
              className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:gap-6"
            >
              <time
                dateTime={entree.created_at}
                className="text-secondary shrink-0 text-xs tabular-nums sm:w-44"
              >
                {horodatage.format(new Date(entree.created_at))}
              </time>
              <p className="text-sm leading-relaxed">
                <span className="font-medium">{auteurDe(entree, annuaire)}</span>{" "}
                {descriptionDe(entree, annuaire)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="border-app-line text-secondary mt-10 rounded-xl border border-dashed px-5 py-10 text-center text-sm">
          Aucune action d&apos;administration n&apos;a encore été journalisée.
        </p>
      )}
    </div>
  );
}
