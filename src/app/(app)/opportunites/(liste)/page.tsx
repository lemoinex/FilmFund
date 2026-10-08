import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GENRES } from "@/lib/fiche";
import {
  AIDE_FILTRE_MONTANT,
  CATEGORIES_OPPORTUNITE,
  devisesDuCatalogue,
  echeanceDe,
  filtreMontantActif,
  filtrerCatalogue,
  filtrerParMontant,
  filtresActifs,
  jourCourant,
  LIMITE_CATALOGUE,
  lireFiltreMontant,
  lireFiltres,
  montantEnClair,
  STATUTS_OPPORTUNITE,
  STATUTS_VISIBLES,
  statutPresente,
} from "@/lib/opportunites";
import { FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { FiltresOpportunites } from "./filtres";

export const metadata: Metadata = {
  title: "Opportunités — filmfundAfrica",
  robots: { index: false, follow: false },
};

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const enJour = (valeur: string) => jour.format(new Date(valeur));

export default async function OpportunitesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametres = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // La RLS ne rend aux comptes que le vérifié et l'expiré. Le filtre est
  // redit ici pour les administrateurs, qui lisent tout : cette page montre
  // ce que voient les équipes, jamais une démonstration.
  const { data, error } = await supabase
    .from("funding_opportunities")
    .select(
      "id, name, organization, category, description, countries, formats, genres, budget_min, budget_max, currency, deadline, source_url, collected_on, status",
    )
    .in("status", STATUTS_VISIBLES)
    .order("updated_at", { ascending: false })
    .limit(LIMITE_CATALOGUE);

  if (error) {
    throw new Error("Lecture du catalogue impossible.");
  }

  const catalogue = data ?? [];
  const aujourdhui = jourCourant();
  const filtres = lireFiltres((champ) => parametres[champ], { formats: FORMATS, genres: GENRES });
  const montant = lireFiltreMontant((champ) => parametres[champ]);
  const actifs = filtresActifs(filtres) || filtreMontantActif(montant);
  // Les filtres trient ; celui du montant, qui garde l'ordre reçu, passe après.
  const retenues = filtrerParMontant(filtrerCatalogue(catalogue, filtres, aujourdhui), montant);

  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });
  const nomPays = (code: string) => noms.of(code) ?? code;
  const ordre = new Intl.Collator("fr");
  const pays = [...new Set(catalogue.flatMap((o) => o.countries))]
    .map((code) => [code, nomPays(code)] as const)
    .sort((a, b) => ordre.compare(a[1], b[1]));
  const devises = devisesDuCatalogue(catalogue);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Opportunités</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        Fonds, résidences, festivals et appels que l&apos;administration a confrontés à leur source.
        Chaque opportunité dit d&apos;où elle vient et quel jour elle a été lue : elle a pu changer
        depuis. Ouvrez la source avant de candidater.
      </p>

      {catalogue.length ? (
        <>
          <div className="border-app-line mt-8 rounded-xl border p-5 sm:p-6">
            <FiltresOpportunites
              filtres={filtres}
              montant={montant}
              pays={pays}
              devises={devises}
              actifs={actifs}
            />
            <p className="text-light mt-4 text-xs leading-relaxed text-pretty">
              Un filtre ne retient que les opportunités qui précisent ce que vous cherchez : celles
              dont la source ne dit rien du pays, du type de projet ou du genre n&apos;y figurent
              pas.
            </p>
            {devises.length ? (
              <p
                id="filtre-montant-aide"
                className="text-light mt-2 text-xs leading-relaxed text-pretty"
              >
                {AIDE_FILTRE_MONTANT}
              </p>
            ) : null}
          </div>

          <p role="status" className="text-secondary mt-6 text-sm">
            {retenues.length > 1
              ? `${retenues.length} opportunités`
              : retenues.length === 1
                ? "Une opportunité"
                : "Aucune opportunité"}
            {actifs ? ` sur ${catalogue.length}, d'après vos filtres.` : "."}
          </p>

          {retenues.length ? (
            <ul className="mt-5 space-y-5">
              {retenues.map((opportunite) => {
                const statut = statutPresente(opportunite, aujourdhui);
                const expiree = echeanceDe(opportunite, aujourdhui) === "passee";
                return (
                  <li key={opportunite.id} className="border-app-line rounded-xl border p-5 sm:p-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                      <h2 className="font-serif text-xl">
                        <Link
                          href={`/opportunites/${opportunite.id}`}
                          className="hover:text-gold-bright underline-offset-4 transition-colors hover:underline"
                        >
                          {opportunite.name}
                        </Link>
                      </h2>
                      <p
                        className={`text-xs font-medium ${expiree ? "text-light" : "text-gold-bright"}`}
                      >
                        {STATUTS_OPPORTUNITE[statut]}
                        {expiree && opportunite.status === "verifie" ? " — date limite passée" : ""}
                      </p>
                    </div>
                    <p className="text-secondary mt-1 text-sm">
                      {opportunite.organization} ·{" "}
                      {CATEGORIES_OPPORTUNITE[
                        opportunite.category as keyof typeof CATEGORIES_OPPORTUNITE
                      ] ?? opportunite.category}
                    </p>

                    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-secondary">Montant</dt>
                        <dd className="mt-0.5">{montantEnClair(opportunite)}</dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Date limite</dt>
                        <dd className="mt-0.5">
                          {opportunite.deadline
                            ? enJour(opportunite.deadline)
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Pays éligibles</dt>
                        <dd className="mt-0.5">
                          {opportunite.countries.length
                            ? opportunite.countries.map(nomPays).join(", ")
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Source</dt>
                        <dd className="mt-0.5">
                          {opportunite.collected_on
                            ? `Lue le ${enJour(opportunite.collected_on)}`
                            : "Information non fournie."}
                        </dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-app-line text-secondary mt-5 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
              Aucune opportunité du catalogue ne correspond à ces filtres. Cela ne dit pas
              qu&apos;il n&apos;en existe pas ailleurs : seulement qu&apos;aucune n&apos;est au
              catalogue.
            </p>
          )}

          {catalogue.length >= LIMITE_CATALOGUE ? (
            <p className="text-secondary mt-4 text-xs leading-relaxed">
              La recherche porte sur les {LIMITE_CATALOGUE} opportunités les plus récemment mises à
              jour.
            </p>
          ) : null}
        </>
      ) : (
        <p className="border-app-line text-secondary mt-8 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
          Aucune opportunité vérifiée n&apos;est encore au catalogue. La plateforme n&apos;affiche
          aucune opportunité fictive : cette page se remplira à mesure que l&apos;administration en
          vérifiera.
        </p>
      )}
    </div>
  );
}
