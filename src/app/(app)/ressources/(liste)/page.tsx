import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  actionDe,
  AVERTISSEMENT_BROUILLON,
  CATEGORIES_RESSOURCE,
  filtrerRessources,
  filtresRessourcesActifs,
  INTRODUCTION_RESSOURCES,
  LIMITES_RESSOURCES,
  lireFiltresRessources,
  nombreRessources,
  ressourcesVisibles,
  STATUTS_RESSOURCE,
  TYPES_RESSOURCE,
} from "@/lib/ressources";
import { createClient } from "@/lib/supabase/server";

import { FiltresRessources } from "./filtres";

export const metadata: Metadata = {
  title: "Ressources — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function RessourcesPage({
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

  // Le rôle ne sert qu'à montrer les brouillons à qui les relit. Les
  // contenus viennent du dépôt : aucune table n'est lue, rien n'est généré.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  const bibliotheque = ressourcesVisibles(estAdministrateur === true);
  const filtres = lireFiltresRessources((champ) => parametres[champ]);
  const actifs = filtresRessourcesActifs(filtres);
  const retenues = filtrerRessources(bibliotheque, filtres);

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Ressources</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        {INTRODUCTION_RESSOURCES}
      </p>

      {bibliotheque.length ? (
        <>
          <div className="border-app-line mt-8 rounded-xl border p-5 sm:p-6">
            <FiltresRessources filtres={filtres} actifs={actifs} />
          </div>

          <p role="status" className="text-secondary mt-6 text-sm">
            {nombreRessources(retenues.length)}
            {actifs ? ` sur ${bibliotheque.length}, d'après vos filtres.` : "."}
          </p>

          {retenues.length ? (
            <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              {retenues.map((ressource) => {
                const action = actionDe(ressource);
                const brouillon = ressource.statut !== "publie";
                return (
                  <li
                    key={ressource.slug}
                    className="border-app-line flex flex-col rounded-xl border p-5 sm:p-6"
                  >
                    <p className="text-gold text-xs font-medium">
                      {CATEGORIES_RESSOURCE[ressource.categorie]} ·{" "}
                      {TYPES_RESSOURCE[ressource.type]}
                    </p>
                    <h2 className="mt-2 font-serif text-xl leading-snug break-words">
                      {ressource.titre}
                    </h2>
                    <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
                      {ressource.description}
                    </p>
                    {brouillon ? (
                      <p className="border-gold/40 bg-gold/10 text-gold-bright mt-4 rounded-lg border px-3 py-2 text-xs leading-relaxed">
                        {STATUTS_RESSOURCE[ressource.statut]} — {AVERTISSEMENT_BROUILLON}
                      </p>
                    ) : null}
                    {action ? (
                      <p className="mt-auto pt-5">
                        <Link
                          href={`/ressources/${ressource.slug}`}
                          className="text-gold hover:text-gold-bright text-sm underline underline-offset-4 transition-colors"
                        >
                          {action.libelle}
                          <span className="sr-only"> : {ressource.titre}</span>
                        </Link>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="border-app-line text-secondary mt-5 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
              Aucune ressource ne correspond à cette recherche. Essayez un autre mot, ou retirez un
              filtre.
            </p>
          )}

          <p className="text-secondary mt-8 max-w-2xl text-xs leading-relaxed text-pretty">
            {LIMITES_RESSOURCES}
          </p>
        </>
      ) : (
        <p className="border-app-line text-secondary mt-8 rounded-xl border border-dashed p-8 text-sm leading-relaxed text-pretty">
          Aucune ressource n&apos;est encore publiée. Les premiers guides sont en cours de relecture
          : la plateforme n&apos;affiche aucun contenu qui n&apos;a pas été validé.
        </p>
      )}
    </div>
  );
}
