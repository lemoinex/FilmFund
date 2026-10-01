import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { Horodatage } from "@/components/ui/horodatage";
import { CHAMPS_PLAN, formaterValeurPlan, type ValeursPlan } from "@/lib/plans";
import { createClient } from "@/lib/supabase/server";

import { FormulairePlanStudio, FormulaireVersionPlan } from "./formulaires";

export const metadata: Metadata = {
  title: "Plans et quotas — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Les plus anciens d'abord ; au-delà, le SQL reste l'outil. */
const LIMITE_STUDIOS = 200;

export default async function PlansPage() {
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

  const [{ data: plans }, { data: versions }, { data: studios }] = await Promise.all([
    supabase.from("plans").select("code, name").order("position"),
    supabase
      .from("plan_versions")
      .select("*")
      .order("plan_code")
      .order("version_number", { ascending: false }),
    supabase
      .from("studios")
      .select(
        "id, name, personal_owner_id, studio_subscriptions(plan_code, period_anchor), titulaire:profiles!studios_personal_owner_id_fkey(display_name)",
      )
      .order("created_at")
      .limit(LIMITE_STUDIOS),
  ]);

  // Les titulaires arrivent avec leur studio ; seuls les auteurs des
  // versions, peu nombreux, sont cherchés par identifiant. Une liste de
  // centaines d'identifiants dépasserait la longueur admise d'une adresse.
  const auteurs = [
    ...new Set((versions ?? []).map((v) => v.published_by).filter((id): id is string => !!id)),
  ];
  const { data: profils } = auteurs.length
    ? await supabase.from("profiles").select("id, display_name").in("id", auteurs)
    : { data: [] };
  const noms = new Map((profils ?? []).map((p) => [p.id, p.display_name?.trim() || "Sans nom"]));

  const listePlans = plans ?? [];
  const nomsPlans = new Map(listePlans.map((p) => [p.code, p.name]));

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Plans et quotas
      </h1>
      <p className="text-secondary mt-3 max-w-2xl text-sm leading-relaxed">
        Modifier un plan publie une nouvelle version, sans effacer les précédentes. Elle
        s&apos;applique à chaque studio à partir de sa prochaine période mensuelle : la période en
        cours garde ses valeurs. Changer le plan d&apos;un studio, en revanche, s&apos;applique
        aussitôt. Chaque action est journalisée.
      </p>

      {listePlans.map((plan) => {
        const historique = (versions ?? []).filter((v) => v.plan_code === plan.code);
        const derniere = historique[0];
        if (!derniere) {
          return null;
        }
        const valeurs = Object.fromEntries(
          CHAMPS_PLAN.map((c) => [c.cle, derniere[c.cle]]),
        ) as ValeursPlan;

        return (
          <section
            key={plan.code}
            aria-labelledby={`plan-${plan.code}`}
            className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
          >
            <h2 id={`plan-${plan.code}`} className="font-serif text-2xl">
              {plan.name}
            </h2>
            <p className="text-secondary mt-1 text-xs">
              Version {derniere.version_number}, publiée le{" "}
              <Horodatage iso={derniere.published_at} />
              {derniere.published_by
                ? ` par ${noms.get(derniere.published_by) ?? "un administrateur"}`
                : " à la mise en service"}
            </p>

            <div className="mt-6">
              {/*
               * Clé stable : remonter le formulaire à chaque publication
               * effacerait le message qui la confirme. Les valeurs par
               * défaut suivent la nouvelle version, et React y ramène le
               * formulaire après l'envoi.
               */}
              <FormulaireVersionPlan
                key={plan.code}
                plan={plan.code}
                valeurs={valeurs}
                prochaineVersion={derniere.version_number + 1}
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
                      {CHAMPS_PLAN.map((c) => formaterValeurPlan(c.cle, v[c.cle])).join(" · ")}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </section>
        );
      })}

      <section aria-labelledby="studios-titre" className="mt-14">
        <h2 id="studios-titre" className="font-serif text-2xl">
          Studios
        </h2>
        {(studios ?? []).length ? (
          <ul className="border-app-line mt-5 divide-y divide-[var(--app-line)] rounded-xl border">
            {(studios ?? []).map((studio) => {
              // Relation un-à-un : selon la version du client, objet ou tableau.
              const abonnement = Array.isArray(studio.studio_subscriptions)
                ? studio.studio_subscriptions[0]
                : studio.studio_subscriptions;
              const titulaire = studio.personal_owner_id
                ? studio.titulaire?.display_name?.trim() || "un compte sans nom"
                : null;
              const libelle = titulaire ? `${studio.name} de ${titulaire}` : studio.name;

              return (
                <li
                  key={studio.id}
                  className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-sm">
                    <p className="font-medium">{studio.name}</p>
                    <p className="text-secondary text-xs">
                      {titulaire ? `Titulaire : ${titulaire}` : "Studio partagé"}
                      {abonnement ? (
                        <>
                          {" "}
                          · plan {nomsPlans.get(abonnement.plan_code) ?? abonnement.plan_code} ·
                          période renouvelée chaque mois depuis le{" "}
                          <Horodatage iso={abonnement.period_anchor} />
                        </>
                      ) : null}
                    </p>
                  </div>
                  {abonnement ? (
                    <FormulairePlanStudio
                      key={studio.id}
                      studio={studio.id}
                      planActuel={abonnement.plan_code}
                      plans={listePlans}
                      libelleStudio={libelle}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-secondary mt-5 text-sm">Aucun studio.</p>
        )}
      </section>
    </div>
  );
}
