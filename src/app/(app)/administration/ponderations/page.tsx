import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Horodatage } from "@/components/ui/horodatage";
import { CRITERES, lirePonderations, ORDRE_CRITERES } from "@/lib/maturite";
import { createClient } from "@/lib/supabase/server";

import { FormulairePonderations } from "./formulaire";

export const metadata: Metadata = {
  title: "Score de maturité — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Les plus récentes d'abord ; au-delà, le SQL reste l'outil. */
const LIMITE_VERSIONS = 50;

export default async function PonderationsPage() {
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

  const { data: versions } = await supabase
    .from("readiness_weight_versions")
    .select("*")
    .order("version_number", { ascending: false })
    .limit(LIMITE_VERSIONS);

  const historique = versions ?? [];
  const enVigueur = historique[0];
  // Lue comme l'application la lit pour calculer : si elle est refusée ici,
  // aucun score ne s'affiche nulle part.
  const lue = lirePonderations(enVigueur);

  const auteurs = [
    ...new Set(historique.map((v) => v.published_by).filter((id): id is string => !!id)),
  ];
  const { data: profils } = auteurs.length
    ? await supabase.from("profiles").select("id, display_name").in("id", auteurs)
    : { data: [] };
  const noms = new Map((profils ?? []).map((p) => [p.id, p.display_name?.trim() || "Sans nom"]));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Score de maturité
      </h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed">
        Le score d&apos;un projet se calcule sur ce qui y est renseigné, critère par critère : il ne
        juge pas la qualité de l&apos;écriture. Les pondérations donnent à chaque critère sa part
        des 100 points ; un critère à zéro n&apos;est plus évalué. Publier une version n&apos;efface
        pas les précédentes. Elle s&apos;applique aussitôt à tous les projets, car aucun score
        n&apos;est stocké. Chaque publication est journalisée.
      </p>

      {enVigueur && lue ? (
        <section
          aria-labelledby="ponderations-titre"
          className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
        >
          <h2 id="ponderations-titre" className="font-serif text-2xl">
            Pondérations en vigueur
          </h2>
          <p className="text-secondary mt-1 text-xs">
            Version {enVigueur.version_number}, publiée le{" "}
            <Horodatage iso={enVigueur.published_at} />
            {enVigueur.published_by
              ? ` par ${noms.get(enVigueur.published_by) ?? "un administrateur"}`
              : " à la mise en service"}
          </p>

          <div className="mt-6">
            {/*
             * Clé stable : remonter le formulaire à chaque publication
             * effacerait le message qui la confirme.
             */}
            <FormulairePonderations
              key="ponderations"
              valeurs={lue.poids}
              prochaineVersion={enVigueur.version_number + 1}
            />
          </div>

          {historique.length > 1 ? (
            <details className="mt-6">
              <summary className="text-secondary hover:text-light cursor-pointer text-sm">
                Versions précédentes ({historique.length - 1})
              </summary>
              <ol className="mt-3 space-y-2 text-xs">
                {historique.slice(1).map((v) => (
                  <li key={v.id} className="text-secondary leading-relaxed">
                    <span className="text-light font-medium">Version {v.version_number}</span> ·{" "}
                    <Horodatage iso={v.published_at} /> ·{" "}
                    {ORDRE_CRITERES.map((code) => `${CRITERES[code]} ${v[code]}`).join(" · ")}
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
        </section>
      ) : (
        <p className="border-app-line text-secondary mt-10 rounded-xl border border-dashed p-8 text-sm leading-relaxed">
          Aucune version des pondérations n&apos;a pu être lue : le score ne s&apos;affiche sur
          aucun projet. Rechargez la page dans un instant.
        </p>
      )}
    </div>
  );
}
