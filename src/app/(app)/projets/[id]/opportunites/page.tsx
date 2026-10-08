import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  calculerCompatibilite,
  classerParCompatibilite,
  CRITERES_COMPATIBILITE,
  decompteEnClair,
  ETATS_CRITERE,
  LIMITES_COMPATIBILITE,
  raisonCritere,
  RESERVE_PAYS,
  type CritereCompare,
} from "@/lib/compatibilite";
import { GENRES } from "@/lib/fiche";
import {
  CATEGORIES_OPPORTUNITE,
  echeanceDe,
  filtrerCatalogue,
  jourCourant,
  LIMITE_CATALOGUE,
  lireFiltres,
  montantEnClair,
  STATUTS_VISIBLES,
} from "@/lib/opportunites";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";

export const metadata: Metadata = {
  title: "Opportunités du projet — filmfundAfrica",
  robots: { index: false, follow: false },
};

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const enJour = (valeur: string) => jour.format(new Date(valeur));

/** La couleur ne porte pas seule l'état : le libellé le dit toujours. */
const TON_ETAT: Readonly<Record<CritereCompare["etat"], string>> = {
  rempli: "text-gold-bright",
  non_rempli: "text-light",
  non_precise: "text-secondary",
  non_renseigne: "text-secondary",
};

/**
 * Opportunités du catalogue, comparées au projet. Toute l'équipe les lit :
 * la comparaison ne touche ni au budget, ni à rien de confidentiel.
 */
export default async function OpportunitesProjetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Le projet ne se lit que de son équipe et de l'administration : la RLS
  // en décide, et un projet illisible répond comme une page absente.
  const [{ data: projet }, { data: budget }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, format, genre, countries, duration_minutes, stage")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
  ]);

  if (!projet) {
    notFound();
  }

  // Même filtre que la rubrique « Opportunités » : jamais une démonstration,
  // même pour un administrateur.
  const { data, error } = await supabase
    .from("funding_opportunities")
    .select(
      "id, name, organization, category, description, countries, formats, genres, stages, duration_min_minutes, duration_max_minutes, budget_min, budget_max, currency, deadline, status",
    )
    .in("status", STATUTS_VISIBLES)
    .order("updated_at", { ascending: false })
    .limit(LIMITE_CATALOGUE);

  if (error) {
    throw new Error("Lecture du catalogue impossible.");
  }

  const catalogue = data ?? [];
  const aujourdhui = jourCourant();
  const sansFiltre = lireFiltres(() => undefined, { formats: FORMATS, genres: GENRES });
  // Triées par date limite, puis classées : à décompte égal, la plus proche d'abord.
  const ouvertes = filtrerCatalogue(catalogue, sansFiltre, aujourdhui).filter(
    (opportunite) => echeanceDe(opportunite, aujourdhui) !== "passee",
  );
  const expirees = catalogue.length - ouvertes.length;
  const lignes = classerParCompatibilite(
    ouvertes.map((opportunite) => ({
      opportunite,
      compatibilite: calculerCompatibilite(projet, opportunite),
    })),
  );

  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });
  const nommer: Readonly<Record<CritereCompare["code"], (code: string) => string>> = {
    format: (code) => (FORMATS as Record<string, string>)[code] ?? code,
    pays: (code) => noms.of(code) ?? code,
    genre: (code) => (GENRES as Record<string, string>)[code] ?? code,
    // La durée se dit en minutes : aucun code à nommer.
    duree: (code) => code,
    stade: (code) => (ETAPES as Record<string, string>)[code] ?? code,
  };
  // Le stade d'un projet est toujours renseigné : il ne manque jamais.
  const manquants = [
    projet.genre ? null : "son genre",
    projet.countries.length ? null : "ses pays de production",
    projet.duration_minutes === null ? "sa durée" : null,
  ].filter((manquant) => manquant !== null);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Opportunités
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        Les opportunités vérifiées du catalogue, comparées à ce que dit la fiche de ce projet.
      </p>

      <OngletsProjet projetId={id} actif="opportunites" budget={budget === true} />

      <p className="border-app-line text-secondary mt-8 rounded-xl border p-5 text-xs leading-relaxed text-pretty">
        {LIMITES_COMPATIBILITE}
      </p>

      {manquants.length ? (
        <p className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          La fiche de ce projet ne dit pas encore {manquants.join(", ni ")} :{" "}
          {manquants.length > 1
            ? "ces critères ne peuvent pas être évalués"
            : "ce critère ne peut pas être évalué"}
          .{" "}
          <Link
            href={`/projets/${id}/fiche`}
            className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
          >
            Voir la fiche
          </Link>
        </p>
      ) : null}

      {lignes.length ? (
        <ul className="mt-8 space-y-5">
          {lignes.map(({ opportunite, compatibilite }) => (
            <li key={opportunite.id} className="border-app-line rounded-xl border p-5 sm:p-6">
              <h2 className="font-serif text-xl">
                <Link
                  href={`/opportunites/${opportunite.id}`}
                  className="hover:text-gold-bright underline-offset-4 transition-colors hover:underline"
                >
                  {opportunite.name}
                </Link>
              </h2>
              <p className="text-secondary mt-1 text-sm">
                {opportunite.organization} ·{" "}
                {CATEGORIES_OPPORTUNITE[
                  opportunite.category as keyof typeof CATEGORIES_OPPORTUNITE
                ] ?? opportunite.category}
              </p>

              <p className="mt-4 text-sm font-medium">{decompteEnClair(compatibilite)}</p>
              {compatibilite.nonRemplis ? (
                <p className="text-secondary mt-1 text-xs leading-relaxed">
                  {compatibilite.nonRemplis > 1
                    ? `${compatibilite.nonRemplis} conditions ne sont pas remplies`
                    : "Une condition n'est pas remplie"}{" "}
                  d&apos;après la fiche du projet.
                </p>
              ) : null}

              <dl className="mt-4 space-y-3 text-xs">
                {compatibilite.criteres.map((critere) => (
                  <div key={critere.code}>
                    <dt className="font-medium">
                      {CRITERES_COMPATIBILITE[critere.code]} —{" "}
                      <span className={TON_ETAT[critere.etat]}>{ETATS_CRITERE[critere.etat]}</span>
                    </dt>
                    <dd className="text-secondary mt-0.5 leading-relaxed">
                      {raisonCritere(critere, nommer[critere.code])}
                      {critere.code === "pays" && critere.etat !== "non_precise"
                        ? ` ${RESERVE_PAYS}`
                        : ""}
                    </dd>
                  </div>
                ))}
              </dl>

              <dl className="border-app-line mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t pt-4 text-xs sm:grid-cols-2">
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
              </dl>

              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
                <Link
                  href={`/opportunites/${opportunite.id}`}
                  className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                >
                  Exigences, source et candidature
                  <span className="sr-only"> : {opportunite.name}</span>
                </Link>
                {/* Les financements ne s'ouvrent qu'à qui gère le budget : le lien aussi. */}
                {budget === true ? (
                  <Link
                    href={`/projets/${id}/financements?opportunite=${opportunite.id}#ajout-candidature`}
                    className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
                  >
                    Préparer une candidature
                    <span className="sr-only"> à {opportunite.name}</span>
                  </Link>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-app-line text-secondary mt-8 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
          {catalogue.length
            ? "Toutes les opportunités vérifiées du catalogue sont expirées."
            : "Aucune opportunité vérifiée n'est encore au catalogue. La plateforme n'affiche aucune opportunité fictive : cette page se remplira à mesure que l'administration en vérifiera."}
        </p>
      )}

      {expirees ? (
        <p className="text-secondary mt-5 text-xs leading-relaxed">
          {expirees > 1
            ? `${expirees} opportunités expirées ne sont pas comparées.`
            : "Une opportunité expirée n'est pas comparée."}{" "}
          <Link
            href="/opportunites?echeance=passee"
            className="text-gold hover:text-gold-bright underline-offset-2 hover:underline"
          >
            Les consulter
          </Link>
        </p>
      ) : null}

      {catalogue.length >= LIMITE_CATALOGUE ? (
        <p className="text-secondary mt-4 text-xs leading-relaxed">
          La comparaison porte sur les {LIMITE_CATALOGUE} opportunités les plus récemment mises à
          jour.
        </p>
      ) : null}
    </div>
  );
}
