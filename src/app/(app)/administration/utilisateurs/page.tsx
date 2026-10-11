import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Horodatage } from "@/components/ui/horodatage";
import {
  adresseListe,
  LISTE_COMPTES,
  lirePage,
  lireRecherche,
  nombreDePages,
  ROLES_COMPTE,
  type Compte,
} from "@/lib/comptes";
import { TYPES_PROFIL } from "@/lib/profils";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Utilisateurs — FilmFund Africa",
  robots: { index: false, follow: false },
};

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-3 py-2.5 text-sm transition-colors outline-none";

export default async function UtilisateursPage({
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

  // Même réponse qu'une page inexistante pour qui n'est pas administrateur.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    notFound();
  }

  // Une recherche refusée n'est pas lue comme une recherche vide : l'écran le
  // dit, plutôt que de montrer toute la liste sous un texte qui n'a pas servi.
  const recherche = lireRecherche(parametres.q);
  const page = lirePage(parametres.page);

  const { data, error } =
    recherche === null
      ? { data: [], error: null }
      : await supabase.rpc("comptes_administration", {
          p_recherche: recherche,
          p_limite: LISTE_COMPTES.parPage,
          p_decalage: (page - 1) * LISTE_COMPTES.parPage,
        });

  if (error) {
    throw new Error("Lecture des comptes impossible.");
  }

  const comptes = (data ?? []) as Compte[];
  // Cinquante identifiants au plus : la liste tient dans une adresse.
  const { data: suspensions } = comptes.length
    ? await supabase
        .from("account_suspensions")
        .select("user_id")
        .in(
          "user_id",
          comptes.map((compte) => compte.id),
        )
    : { data: [] };
  const suspendus = new Set((suspensions ?? []).map((suspension) => suspension.user_id));
  const total = comptes[0]?.total ?? 0;
  const pages = nombreDePages(total);
  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Utilisateurs</h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed text-pretty">
        Les comptes de la plateforme, les plus récents d&apos;abord. Les adresses ne sont lisibles
        que de l&apos;administration. Consulter un compte ne laisse aucune trace ; changer un rôle
        est inscrit au journal.
      </p>

      <form
        method="get"
        action="/administration/utilisateurs"
        role="search"
        aria-label="Rechercher un compte"
        className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="recherche-compte" className="mb-1.5 block text-xs font-medium">
            Rechercher
          </label>
          <input
            id="recherche-compte"
            name="q"
            type="search"
            defaultValue={recherche ?? ""}
            maxLength={LISTE_COMPTES.rechercheMax}
            placeholder="Adresse, nom affiché, prénom ou nom"
            className={CHAMP}
          />
        </div>
        <button
          type="submit"
          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Rechercher
        </button>
        {recherche ? (
          <Link
            href="/administration/utilisateurs"
            className="text-secondary hover:text-light py-2.5 text-xs transition-colors"
          >
            Retirer la recherche
          </Link>
        ) : null}
      </form>

      {recherche === null ? (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-200"
        >
          Cette recherche n&apos;est pas lisible : {LISTE_COMPTES.rechercheMax} caractères au plus,
          sur une ligne.
        </p>
      ) : comptes.length ? (
        <>
          <p className="text-secondary mt-8 text-xs" aria-live="polite">
            {total} compte{total > 1 ? "s" : ""}
            {recherche ? ` pour « ${recherche} »` : ""} · page {page} sur {pages}
          </p>

          <ul className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
            {comptes.map((compte) => (
              <li key={compte.id} className="px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link
                    href={`/administration/utilisateurs/${compte.id}`}
                    className="hover:text-gold font-medium break-all transition-colors"
                  >
                    {compte.display_name.trim() || "Sans nom"}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2">
                    {suspendus.has(compte.id) ? (
                      <span className="rounded-full border border-red-400/40 px-2.5 py-0.5 text-xs text-red-200">
                        Suspendu
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        compte.role === "admin"
                          ? "border-gold/40 text-gold-bright"
                          : "border-app-line text-secondary"
                      }`}
                    >
                      {ROLES_COMPTE[compte.role]}
                    </span>
                  </span>
                </div>
                <p className="text-secondary mt-1 text-sm break-all">
                  {compte.email ?? "Adresse non fournie"}
                  {compte.email_confirme ? "" : " · adresse non confirmée"}
                </p>
                <p className="text-secondary mt-1 text-xs leading-relaxed">
                  {[
                    compte.profile_type
                      ? (TYPES_PROFIL[compte.profile_type as keyof typeof TYPES_PROFIL] ??
                        compte.profile_type)
                      : null,
                    compte.country ? (noms.of(compte.country) ?? compte.country) : null,
                  ]
                    .filter(Boolean)
                    .map((mention) => `${mention} · `)
                    .join("")}
                  créé le <Horodatage iso={compte.cree_le} /> ·{" "}
                  {compte.derniere_connexion ? (
                    <>
                      dernière connexion le <Horodatage iso={compte.derniere_connexion} />
                    </>
                  ) : (
                    "jamais connecté"
                  )}
                </p>
              </li>
            ))}
          </ul>

          {pages > 1 ? (
            <nav aria-label="Pages de la liste" className="mt-6 flex items-center gap-4 text-sm">
              {page > 1 ? (
                <Link
                  href={adresseListe(recherche, page - 1)}
                  className="border-app-line hover:bg-surface rounded-full border px-4 py-2 transition-colors"
                >
                  Page précédente
                </Link>
              ) : null}
              {page < pages ? (
                <Link
                  href={adresseListe(recherche, page + 1)}
                  className="border-app-line hover:bg-surface rounded-full border px-4 py-2 transition-colors"
                >
                  Page suivante
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      ) : (
        <p className="border-app-line text-secondary mt-8 rounded-xl border border-dashed px-5 py-10 text-center text-sm">
          {recherche
            ? `Aucun compte ne correspond à « ${recherche} ».`
            : page > 1
              ? "Cette page est vide : la liste est plus courte."
              : "Aucun compte."}
        </p>
      )}
    </div>
  );
}
