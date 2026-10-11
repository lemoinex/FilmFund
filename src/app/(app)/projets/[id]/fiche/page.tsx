import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { FicheDetaillee } from "@/components/ui/fiche-personnage";
import { Message } from "@/components/ui/form";
import { etapeDe, type CleEtape } from "@/lib/assistant";
import { decompteEpisodes, estSerie } from "@/lib/episodes";
import { lireAcces } from "@/lib/equipes";
import { dureeEnClair, GENRES, ROLES_PERSONNAGE } from "@/lib/fiche";
import { listerPays } from "@/lib/profils";
import { ETAPES, FORMATS } from "@/lib/projets";
import { attenteEnCours, lireEtapes } from "@/lib/propositions-serveur";
import { createClient } from "@/lib/supabase/server";

import { OngletsProjet } from "../onglets";
import { Proposition, RafraichissementPropositions } from "../proposition";

export const metadata: Metadata = {
  title: "Fiche du projet — FilmFund Africa",
  robots: { index: false, follow: false },
};

const NON_FOURNI = "Information non fournie.";

/** Libellé d'un code connu ; nul sinon. */
function libelle<T extends Record<string, string>>(codes: T, valeur: string | null) {
  return valeur && Object.hasOwn(codes, valeur) ? codes[valeur as keyof T] : null;
}

/**
 * Fiche du projet, en lecture : le récapitulatif de l'assistant. Toute
 * l'équipe la lit, comme le projet ; porteur et éditeurs la complètent par
 * l'assistant.
 */
/** Le livrable que cette rubrique porte : le synopsis court s'y lit. */
const LIVRABLES_FICHE = ["synopsis_short"] as const;

export default async function FichePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assistant?: string }>;
}) {
  const { id } = await params;
  const { assistant } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: accesBrut },
    { data: estAdmin },
    { data: budget },
    { data: personnages },
    { count: episodes },
  ] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, title, format, stage, logline, genre, countries, languages, duration_minutes, short_synopsis, theme, stakes, artistic_vision, goals, audience",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("acces_au_projet", { p_project_id: id }),
    supabase.rpc("is_admin"),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase
      .from("project_characters")
      .select(
        "id, name, role, description, age, occupation, appearance, goal, obstacle, arc, traits, relations",
      )
      .eq("project_id", id)
      .order("position")
      .order("created_at"),
    // Nombre seul : les épisodes se lisent sur leur page. Zéro hors d'une série.
    supabase
      .from("project_episodes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id),
  ]);

  if (!projet) {
    notFound();
  }

  const acces = lireAcces(accesBrut);
  const peutEditer = acces === "owner" || acces === "editor";
  const modifier = peutEditer ? (cle: CleEtape) => `/projets/${id}/assistant/${cle}` : null;

  // Assistant d'écriture : même règle que la fonction SQL peut_engager_unites,
  // qui a le dernier mot. Les lecteurs n'engagent pas les unités du studio.
  const peutDemander = peutEditer || estAdmin === true;
  const etapes = await lireEtapes(supabase, id, LIVRABLES_FICHE, peutDemander);

  const noms = new Map(listerPays().map(({ code, nom }) => [code, nom]));
  const pays = projet.countries.map((code, index) => {
    const nom = noms.get(code) ?? code;
    return index === 0 && projet.countries.length > 1 ? `${nom} (principal)` : nom;
  });

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${id}`}
        className="text-light-muted hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Fiche du projet
      </h1>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        Ce qui définit le film : ses repères, son concept, ses personnages, sa vision et son public.
      </p>

      <OngletsProjet projetId={id} actif="fiche" budget={budget === true} />

      {assistant === "termine" && peutEditer ? (
        <div className="mt-8">
          <Message ton="succes">
            L&apos;assistant est terminé. La fiche se complète à tout moment.
          </Message>
        </div>
      ) : null}

      {peutEditer ? (
        <Link
          href={`/projets/${id}/assistant/informations`}
          className="bg-gold text-navy hover:bg-gold-bright mt-8 block w-full rounded-full px-6 py-3.5 text-center text-sm font-medium transition-colors sm:inline-block sm:w-auto"
        >
          Compléter avec l&apos;assistant
        </Link>
      ) : null}

      <div className="mt-10 space-y-10">
        <Section cle="informations" modifier={modifier}>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <Ligne terme="Format">{FORMATS[projet.format]}</Ligne>
            <Ligne terme="Étape">{ETAPES[projet.stage]}</Ligne>
            <Ligne terme="Genre">{libelle(GENRES, projet.genre)}</Ligne>
            <Ligne terme="Durée">
              {projet.duration_minutes ? dureeEnClair(projet.duration_minutes) : null}
            </Ligne>
            <Ligne terme="Pays de production">{pays.join(", ")}</Ligne>
            <Ligne terme="Langues">{projet.languages}</Ligne>
          </dl>
        </Section>

        {estSerie(projet.format) ? (
          <section aria-labelledby="fiche-episodes" className="border-navy-line border-t pt-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id="fiche-episodes" className="font-serif text-xl leading-tight">
                Épisodes
              </h2>
              <Link
                href={`/projets/${id}/episodes`}
                className="text-light-muted hover:bg-navy-soft hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
              >
                {peutEditer ? "Gérer" : "Voir"}
                <span className="sr-only"> les épisodes</span>
              </Link>
            </div>
            <p className="mt-4 leading-relaxed">
              {episodes === null ? NON_FOURNI : `${decompteEpisodes(episodes)}.`}
            </p>
          </section>
        ) : null}

        <Section cle="concept" modifier={modifier}>
          <dl className="space-y-5">
            <Ligne terme="Pitch">{projet.logline}</Ligne>
            <Ligne terme="Synopsis court">{projet.short_synopsis}</Ligne>
            <Ligne terme="Thème">{projet.theme}</Ligne>
          </dl>
        </Section>

        <Section cle="personnages" modifier={modifier}>
          {personnages?.length ? (
            <ul className="space-y-4">
              {personnages.map((personnage) => (
                <li key={personnage.id}>
                  <p className="font-medium break-words">
                    {personnage.name}
                    {libelle(ROLES_PERSONNAGE, personnage.role) ? (
                      <span className="text-light-muted font-normal">
                        {" "}
                        · {libelle(ROLES_PERSONNAGE, personnage.role)}
                      </span>
                    ) : null}
                  </p>
                  {personnage.description ? (
                    <p className="text-light-muted mt-1 text-sm leading-relaxed text-pretty whitespace-pre-line">
                      {personnage.description}
                    </p>
                  ) : null}
                  <FicheDetaillee personnage={personnage} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-light-muted text-sm">{NON_FOURNI}</p>
          )}
        </Section>

        <Section cle="enjeux" modifier={modifier}>
          <Texte>{projet.stakes}</Texte>
        </Section>
        <Section cle="vision" modifier={modifier}>
          <Texte>{projet.artistic_vision}</Texte>
        </Section>
        <Section cle="objectifs" modifier={modifier}>
          <Texte>{projet.goals}</Texte>
        </Section>
        <Section cle="public" modifier={modifier}>
          <Texte>{projet.audience}</Texte>
        </Section>
      </div>

      {peutDemander ? (
        <>
          <RafraichissementPropositions actif={attenteEnCours(etapes.values())} />
          <Proposition
            projetId={id}
            action="synopsis_short"
            texteActuel={projet.short_synopsis}
            etape={etapes.get("synopsis_short") ?? { etape: "repos" }}
            peutAppliquer={peutEditer}
          />
        </>
      ) : null}
    </div>
  );
}

function Section({
  cle,
  modifier,
  children,
}: {
  cle: CleEtape;
  modifier: ((cle: CleEtape) => string) | null;
  children: ReactNode;
}) {
  const { titre } = etapeDe(cle);

  return (
    <section aria-labelledby={`fiche-${cle}`} className="border-navy-line border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={`fiche-${cle}`} className="font-serif text-xl leading-tight">
          {titre}
        </h2>
        {modifier ? (
          <Link
            href={modifier(cle)}
            className="text-light-muted hover:bg-navy-soft hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
          >
            Modifier<span className="sr-only"> : {titre}</span>
          </Link>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Ligne({ terme, children }: { terme: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-light-muted text-xs tracking-wide uppercase">{terme}</dt>
      <dd className="mt-1.5 leading-relaxed text-pretty break-words whitespace-pre-line">
        {children || <span className="text-light-muted text-sm">{NON_FOURNI}</span>}
      </dd>
    </div>
  );
}

function Texte({ children }: { children: string }) {
  return children ? (
    <p className="leading-relaxed text-pretty break-words whitespace-pre-line">{children}</p>
  ) : (
    <p className="text-light-muted text-sm">{NON_FOURNI}</p>
  );
}
