import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AVERTISSEMENT_BROUILLON,
  CATEGORIES_RESSOURCE,
  estLienSur,
  LIMITES_RESSOURCES,
  STATUTS_RESSOURCE,
  trouverRessource,
  TYPES_RESSOURCE,
  type BlocRessource,
} from "@/lib/ressources";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Ressource — FilmFund Africa",
  robots: { index: false, follow: false },
};

const jour = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const enJour = (valeur: string) => jour.format(new Date(`${valeur}T00:00:00Z`));

export default async function RessourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Un brouillon n'existe que pour l'administration : pour tout autre
  // lecteur, son adresse est celle d'une page introuvable.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  const ressource = trouverRessource(slug, estAdministrateur === true);
  if (!ressource) {
    notFound();
  }

  const lien = ressource.lien && estLienSur(ressource.lien.url) ? ressource.lien : null;

  return (
    <article className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href="/ressources"
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← Ressources
      </Link>

      <p className="text-gold mt-6 text-xs font-medium">
        {CATEGORIES_RESSOURCE[ressource.categorie]} · {TYPES_RESSOURCE[ressource.type]}
      </p>
      <h1 className="mt-2 font-serif text-3xl leading-tight tracking-tight break-words sm:text-4xl">
        {ressource.titre}
      </h1>
      <p className="text-secondary mt-3 text-sm leading-relaxed text-pretty">
        {ressource.description}
      </p>

      {ressource.statut !== "publie" ? (
        <p className="border-gold/40 bg-gold/10 text-gold-bright mt-6 rounded-lg border px-4 py-3 text-sm leading-relaxed">
          {STATUTS_RESSOURCE[ressource.statut]} — {AVERTISSEMENT_BROUILLON}
        </p>
      ) : null}

      <dl className="text-secondary mt-6 flex flex-wrap gap-x-8 gap-y-2 text-xs">
        {ressource.auteur ? (
          <div>
            <dt className="inline">Rédaction : </dt>
            <dd className="text-light inline">{ressource.auteur}</dd>
          </div>
        ) : null}
        <div>
          <dt className="inline">Mise à jour : </dt>
          <dd className="text-light inline">
            {ressource.misAJourLe ? enJour(ressource.misAJourLe) : "Information non fournie."}
          </dd>
        </div>
      </dl>

      {ressource.sections?.map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`} className="mt-10">
          <h2 id={`section-${section.id}`} className="font-serif text-xl leading-snug">
            {section.titre}
          </h2>
          <div className="mt-4 space-y-4">
            {section.blocs.map((bloc, rang) => (
              <Bloc key={rang} bloc={bloc} />
            ))}
          </div>
        </section>
      ))}

      {lien ? (
        <section aria-labelledby="source-externe" className="border-app-line mt-10 border-t pt-8">
          <h2 id="source-externe" className="text-sm font-medium">
            Source externe
          </h2>
          <p className="text-secondary mt-2 text-sm leading-relaxed">
            Publiée par {lien.source}. Lien vérifié le {enJour(lien.verifieLe)} : la page a pu
            changer depuis.
          </p>
          <p className="mt-3">
            <a
              href={lien.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:text-gold-bright text-sm underline underline-offset-4 transition-colors"
            >
              Consulter la source
              <span className="sr-only"> (nouvel onglet)</span>
            </a>
          </p>
        </section>
      ) : null}

      <p className="text-secondary border-app-line mt-12 border-t pt-6 text-xs leading-relaxed text-pretty">
        {LIMITES_RESSOURCES}
      </p>
    </article>
  );
}

/** Un bloc de contenu : toujours du texte, jamais du balisage. */
function Bloc({ bloc }: { bloc: BlocRessource }) {
  if (bloc.type === "paragraphe") {
    return <p className="text-sm leading-relaxed text-pretty">{bloc.texte}</p>;
  }
  if (bloc.type === "liste") {
    return (
      <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
        {bloc.elements.map((element) => (
          <li key={element}>{element}</li>
        ))}
      </ul>
    );
  }
  // Des points à vérifier, dans l'ordre : une liste numérotée, pas des cases
  // à cocher — rien n'est enregistré, une case cochée se perdrait.
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
      {bloc.elements.map((element) => (
        <li key={element}>{element}</li>
      ))}
    </ol>
  );
}
