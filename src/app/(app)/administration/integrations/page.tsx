import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FOURNISSEURS } from "@/lib/integrations-ia";
import { createClient } from "@/lib/supabase/server";

import { FormulaireCle } from "./formulaire";

export const metadata: Metadata = {
  title: "Intégrations IA — filmfundAfrica",
  robots: { index: false, follow: false },
};

// Fuseau affiché explicitement : le serveur rend en UTC, et une heure sans
// fuseau laisserait croire qu'elle est locale.
const horodatage = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function IntegrationsPage() {
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

  // L'état seulement : la table ne contient pas les clés, et aucune requête
  // d'ici ne sait les lire.
  const { data: etats, error } = await supabase
    .from("ai_provider_keys")
    .select("provider, configured_by, configured_at");

  if (error) {
    throw new Error("Lecture des intégrations impossible.");
  }

  const auteurs = etats.map((etat) => etat.configured_by).filter((id): id is string => id !== null);
  const { data: profils } = auteurs.length
    ? await supabase.from("profiles").select("id, display_name").in("id", auteurs)
    : { data: [] };
  const nomDe = new Map((profils ?? []).map((profil) => [profil.id, profil.display_name]));

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl">Intégrations IA</h1>
        <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
          Les clés des fournisseurs sont rangées chiffrées, hors de portée de l&apos;application :
          seul le worker les lit, pour exécuter les demandes. Une clé enregistrée ne se réaffiche
          jamais — elle se remplace ou se retire. Chaque changement est inscrit au journal
          d&apos;administration, sans la valeur.
        </p>
      </header>

      <div className="mt-10 space-y-6">
        {FOURNISSEURS.map((fournisseur) => {
          const etat = etats.find((ligne) => ligne.provider === fournisseur.code);
          const auteur = etat?.configured_by ? nomDe.get(etat.configured_by) : null;

          return (
            <section
              key={fournisseur.code}
              aria-labelledby={`fournisseur-${fournisseur.code}`}
              className="border-navy-line rounded-xl border p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                <h2 id={`fournisseur-${fournisseur.code}`} className="text-base font-medium">
                  {fournisseur.nom}
                </h2>
                <p className={`text-xs ${etat ? "text-gold-bright" : "text-light-muted"}`}>
                  {etat ? "Clé enregistrée" : "Aucune clé"}
                </p>
              </div>

              <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
                {fournisseur.usage}
              </p>

              {etat ? (
                <p className="text-light-muted mt-3 text-xs leading-relaxed">
                  Enregistrée le {horodatage.format(new Date(etat.configured_at))} (UTC)
                  {auteur ? ` par ${auteur}` : null}.
                </p>
              ) : fournisseur.employe ? (
                <p className="mt-3 text-xs leading-relaxed text-red-200">
                  Sans clé, les demandes restent en attente : rien n&apos;est rédigé.
                </p>
              ) : null}

              <div className="mt-5">
                <FormulaireCle fournisseur={fournisseur} configure={etat !== undefined} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
