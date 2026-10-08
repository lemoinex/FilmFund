import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { GENRES } from "@/lib/fiche";
import {
  CATEGORIES_OPPORTUNITE,
  cleOpportunite,
  dureeEnClair,
  etapeVeille,
  jourCourant,
  LANGUES_OPPORTUNITE,
  LIVRABLE_VEILLE,
  montantEnClair,
  STATUTS_OPPORTUNITE,
  statutPresente,
} from "@/lib/opportunites";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { RafraichissementPropositions } from "../../projets/[id]/proposition";

import { supprimerOpportunite } from "./actions";
import { FormulaireOpportunite, type OpportuniteEditable } from "./formulaire";
import { DecisionOpportunite, DemandeVeille } from "./veille";

export const metadata: Metadata = {
  title: "Opportunités — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Les plus récemment modifiées d'abord ; au-delà, la page le dit. */
const LIMITE_OPPORTUNITES = 200;

/** Opportunités proposées affichées : deux veilles pleines. Au-delà, la page le dit. */
const LIMITE_PROPOSEES = 2 * LIVRABLE_VEILLE.opportunitesMax;

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const enJour = (valeur: string) => jour.format(new Date(valeur));

const libelles = (codes: readonly string[], referentiel: Readonly<Record<string, string>>) =>
  codes.map((code) => referentiel[code] ?? code).join(", ");

export default async function OpportunitesPage({
  searchParams,
}: {
  searchParams: Promise<{ modifier?: string }>;
}) {
  const { modifier } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Même réponse qu'une page inexistante pour qui n'est pas administrateur.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    notFound();
  }

  const { data } = await supabase
    .from("funding_opportunities")
    .select(
      "id, name, organization, category, description, website, application_url, countries, formats, genres, languages, stages, duration_min_minutes, duration_max_minutes, budget_min, budget_max, currency, opens_on, deadline, requirements, source_url, collected_on, source_excerpt, status, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(LIMITE_OPPORTUNITES);

  const catalogue = data ?? [];

  // La veille : sa dernière tâche, ce qu'elle a rendu, et tout ce qui attend
  // encore une décision. La RLS ne rend ces lignes qu'à l'administration.
  const { data: tache } = await supabase
    .from("jobs")
    .select("id, state, reason")
    .eq("action", LIVRABLE_VEILLE.action)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: derniere } = tache
    ? await supabase
        .from("ai_suggestions")
        .select("id, content, state")
        .eq("job_id", tache.id)
        .maybeSingle()
    : { data: null };
  const { count: relevees } = derniere
    ? await supabase
        .from("ai_suggestion_opportunities")
        .select("id", { count: "exact", head: true })
        .eq("suggestion_id", derniere.id)
    : { count: null };
  const etape = etapeVeille(tache, derniere ? { ...derniere, lignes: relevees ?? 0 } : null);

  const { data: lignes } = await supabase
    .from("ai_suggestion_opportunities")
    .select(
      "id, name, organization, category, summary, source_url, source_title, source_excerpt, published_on, collected_at",
    )
    .eq("state", "proposed")
    .order("created_at", { ascending: false })
    .order("position")
    .limit(LIMITE_PROPOSEES);
  const proposees = lignes ?? [];
  const auCatalogue = new Set(catalogue.map((o) => cleOpportunite(o.name, o.organization)));
  const aujourdhui = jourCourant();
  const visibles = catalogue.filter((o) =>
    ["verifie", "expire"].includes(statutPresente(o, aujourdhui)),
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Opportunités</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        Le catalogue des fonds, résidences, festivals et appels que la plateforme pourra proposer
        aux équipes. Une veille en propose ; vous les acceptez, les complétez et les vérifiez.
        Chaque opportunité porte sa source, la date où elle a été lue et l&apos;extrait qui la
        fonde. Les comptes ne lisent que ce qui est vérifié ou expiré ; une démonstration ne leur
        est jamais montrée. Chaque ajout, changement ou retrait est journalisé.
      </p>
      <p className="text-secondary mt-3 text-sm">
        {catalogue.length
          ? `${catalogue.length} au catalogue, dont ${visibles} ${visibles > 1 ? "visibles" : "visible"} des comptes.`
          : "Le catalogue est vide."}
      </p>

      <section aria-labelledby="veille-opportunites" className="mt-10">
        <RafraichissementPropositions
          actif={etape.etape === "en_attente" || etape.etape === "en_cours"}
        />
        <h2 id="veille-opportunites" className="font-serif text-2xl leading-tight">
          {LIVRABLE_VEILLE.titre}
        </h2>
        <DemandeVeille etape={etape} />

        {proposees.length ? (
          <>
            <h3 className="mt-8 text-sm font-medium">
              {proposees.length > 1
                ? `${proposees.length} opportunités proposées attendent votre décision`
                : "Une opportunité proposée attend votre décision"}
            </h3>
            <p className="text-light mt-2 max-w-2xl text-xs leading-relaxed text-pretty">
              {LIVRABLE_VEILLE.avertissement}
            </p>
            <ul className="mt-5 space-y-5">
              {proposees.map((proposee) => (
                <li key={proposee.id} className="border-app-line rounded-xl border p-5 sm:p-6">
                  <p className="text-gold text-xs font-medium">
                    Proposée par la veille — non vérifiée
                  </p>
                  <p className="mt-3 text-xs font-medium">Résumé de l&apos;extrait</p>
                  <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
                    {proposee.summary}
                  </p>
                  <dl className="mt-4 text-xs">
                    <dt className="text-secondary">Page d&apos;où elle vient</dt>
                    <dd className="mt-0.5 break-all">
                      <a
                        href={proposee.source_url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                      >
                        {proposee.source_title}
                        <span className="sr-only"> (nouvel onglet)</span>
                      </a>
                      <span className="text-secondary block">
                        {proposee.source_url}
                        {` — collectée le ${enJour(proposee.collected_at)}`}
                        {proposee.published_on
                          ? `, page datée du ${enJour(proposee.published_on)}`
                          : ", page sans date"}
                      </span>
                    </dd>
                  </dl>
                  <details className="mt-3 text-xs">
                    <summary className="text-secondary hover:text-light cursor-pointer">
                      Lire l&apos;extrait collecté
                    </summary>
                    <p className="text-secondary mt-2 leading-relaxed whitespace-pre-line">
                      {proposee.source_excerpt}
                    </p>
                  </details>
                  <DecisionOpportunite
                    ligneId={proposee.id}
                    nom={proposee.name}
                    organisme={proposee.organization}
                    categorie={proposee.category}
                    dejaAuCatalogue={auCatalogue.has(
                      cleOpportunite(proposee.name, proposee.organization),
                    )}
                  />
                </li>
              ))}
            </ul>
            {proposees.length >= LIMITE_PROPOSEES ? (
              <p className="text-secondary mt-4 text-xs leading-relaxed">
                Seules les {LIMITE_PROPOSEES} propositions les plus récentes sont affichées : les
                autres apparaîtront à mesure que vous déciderez de celles-ci.
              </p>
            ) : null}
          </>
        ) : null}
      </section>

      <h2 className="border-app-line mt-12 border-t pt-10 font-serif text-2xl leading-tight">
        Catalogue
      </h2>

      {catalogue.length ? (
        <ul className="mt-6 space-y-6">
          {catalogue.map((opportunite) => {
            const statut = statutPresente(opportunite, aujourdhui);
            const expireeParSaDate = statut === "expire" && opportunite.status === "verifie";
            return (
              <li
                key={opportunite.id}
                id={`opportunite-${opportunite.id}`}
                className="border-app-line scroll-mt-8 rounded-xl border p-5 sm:p-6"
              >
                {opportunite.id === modifier ? (
                  <>
                    <h2 className="font-serif text-xl">Modifier « {opportunite.name} »</h2>
                    <div className="mt-5">
                      <FormulaireOpportunite
                        opportunite={opportunite satisfies OpportuniteEditable}
                      />
                    </div>
                    <p className="mt-4">
                      <Link
                        href="/administration/opportunites"
                        className="text-secondary hover:text-light text-xs transition-colors"
                      >
                        Fermer sans enregistrer
                      </Link>
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                      <h2 className="font-serif text-xl">{opportunite.name}</h2>
                      <p
                        className={`text-xs font-medium ${statut === "verifie" ? "text-gold-bright" : "text-light"}`}
                      >
                        {STATUTS_OPPORTUNITE[statut]}
                        {expireeParSaDate ? " — date limite passée" : ""}
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
                            ? opportunite.countries.join(", ")
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Types de projet</dt>
                        <dd className="mt-0.5">
                          {opportunite.formats.length
                            ? libelles(opportunite.formats, FORMATS)
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Genres</dt>
                        <dd className="mt-0.5">
                          {opportunite.genres.length
                            ? libelles(opportunite.genres, GENRES)
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Durée</dt>
                        <dd className="mt-0.5">
                          {dureeEnClair(opportunite) ?? "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Stades d&apos;avancement</dt>
                        <dd className="mt-0.5">
                          {opportunite.stages.length
                            ? libelles(opportunite.stages, ETAPES)
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Langues</dt>
                        <dd className="mt-0.5">
                          {opportunite.languages.length
                            ? libelles(opportunite.languages, LANGUES_OPPORTUNITE)
                            : "Information non fournie."}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-secondary">Source</dt>
                        <dd className="mt-0.5 break-all">
                          {opportunite.source_url ? (
                            <a
                              href={opportunite.source_url}
                              target="_blank"
                              rel="noopener noreferrer nofollow"
                              className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                            >
                              {opportunite.source_url}
                              <span className="sr-only"> (nouvel onglet)</span>
                            </a>
                          ) : (
                            "Information non fournie."
                          )}
                          {opportunite.collected_on
                            ? ` — lue le ${enJour(opportunite.collected_on)}`
                            : ""}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/administration/opportunites?modifier=${opportunite.id}#opportunite-${opportunite.id}`}
                        className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
                      >
                        Modifier
                        <span className="sr-only"> {opportunite.name}</span>
                      </Link>
                      <BoutonConfirme
                        action={supprimerOpportunite}
                        champs={{ opportunite: opportunite.id }}
                        libelle="Retirer"
                        confirmation="Retirer du catalogue"
                        discret
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-app-line text-secondary mt-6 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
          Aucune opportunité n&apos;est encore au catalogue. Rien n&apos;est proposé aux équipes
          tant que le catalogue est vide : la plateforme n&apos;affiche aucune opportunité fictive.
        </p>
      )}

      {catalogue.length >= LIMITE_OPPORTUNITES ? (
        <p className="text-secondary mt-4 text-xs leading-relaxed">
          Seules les {LIMITE_OPPORTUNITES} opportunités les plus récemment modifiées sont affichées.
        </p>
      ) : null}

      <section aria-labelledby="ajout-opportunite" className="border-app-line mt-12 border-t pt-10">
        <h2 id="ajout-opportunite" className="font-serif text-2xl leading-tight">
          Nouvelle opportunité
        </h2>
        <p className="text-secondary mt-2 max-w-2xl text-sm leading-relaxed text-pretty">
          Saisissez ce que la source annonce, sans rien compléter de mémoire. Ce qui n&apos;est pas
          dit par la source reste vide : l&apos;écran l&apos;affichera comme non fourni.
        </p>
        <div className="mt-6">
          {/* Clé stable : remonter le formulaire effacerait le message qui confirme l'ajout. */}
          <FormulaireOpportunite key="nouvelle" />
        </div>
      </section>
    </div>
  );
}
