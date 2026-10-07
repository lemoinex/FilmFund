import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Horodatage } from "@/components/ui/horodatage";
import {
  estIdentifiantDeCompte,
  obstacleALaSuspension,
  obstacleAuChangementDeRole,
  ROLES_COMPTE,
  type Compte,
} from "@/lib/comptes";
import { TYPES_PROFIL } from "@/lib/profils";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { FormulaireRole } from "../formulaire-role";
import { FormulaireRetablissement, FormulaireSuspension } from "../formulaire-suspension";

export const metadata: Metadata = {
  title: "Compte — filmfundAfrica",
  robots: { index: false, follow: false },
};

const NON_FOURNIE = "Information non fournie.";

/** Les plus récemment modifiés d'abord ; le nombre total est dit à part. */
const LIMITE_PROJETS = 50;

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:gap-6">
      <dt className="text-secondary shrink-0 text-xs sm:w-44 sm:pt-0.5">{libelle}</dt>
      <dd className="text-sm leading-relaxed break-words">{children}</dd>
    </div>
  );
}

export default async function ComptePage({ params }: { params: Promise<{ compteId: string }> }) {
  const { compteId } = await params;
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

  if (!estIdentifiantDeCompte(compteId)) {
    notFound();
  }

  const [
    { data: comptes },
    { data: profil },
    { data: studio },
    { data: plans },
    { data: projets, count: nombreProjets },
    { data: modePrive },
    { data: suspension },
  ] = await Promise.all([
    supabase.rpc("comptes_administration", { p_compte: compteId, p_limite: 1 }),
    supabase
      .from("profiles")
      .select("first_name, last_name, city, profession")
      .eq("id", compteId)
      .maybeSingle(),
    supabase
      .from("studios")
      .select("name, studio_subscriptions(plan_code)")
      .eq("personal_owner_id", compteId)
      .maybeSingle(),
    supabase.from("plans").select("code, name"),
    supabase
      .from("projects")
      .select("id, title, format, stage, updated_at", { count: "exact" })
      .eq("owner_id", compteId)
      .order("updated_at", { ascending: false })
      .limit(LIMITE_PROJETS),
    supabase.rpc("mode_prive"),
    supabase
      .from("account_suspensions")
      .select("reason, suspended_by, suspended_at")
      .eq("user_id", compteId)
      .maybeSingle(),
  ]);

  const compte = (comptes as Compte[] | null)?.[0];
  if (!compte) {
    notFound();
  }

  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });
  const abonnement = Array.isArray(studio?.studio_subscriptions)
    ? studio.studio_subscriptions[0]
    : studio?.studio_subscriptions;
  const nomDuPlan = abonnement
    ? ((plans ?? []).find((p) => p.code === abonnement.plan_code)?.name ?? abonnement.plan_code)
    : null;
  const soiMeme = compte.id === user.id;
  const obstacle = obstacleAuChangementDeRole({
    soiMeme: soiMeme && compte.role === "admin",
    // Sans réponse, on ne propose rien : la base refuserait de toute façon.
    modePrive: modePrive !== false,
    suspendu: !!suspension && compte.role !== "admin",
  });
  const obstacleSuspension = obstacleALaSuspension({
    soiMeme,
    administrateur: compte.role === "admin",
  });
  const { data: auteurSuspension } = suspension?.suspended_by
    ? await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", suspension.suspended_by)
        .maybeSingle()
    : { data: null };
  const listeProjets = projets ?? [];
  const totalProjets = nombreProjets ?? listeProjets.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="text-xs">
        <Link
          href="/administration/utilisateurs"
          className="text-secondary hover:text-light transition-colors"
        >
          ← Utilisateurs
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-3xl leading-tight tracking-tight break-words sm:text-4xl">
        {compte.display_name.trim() || "Sans nom"}
      </h1>
      <p className="text-secondary mt-2 text-sm break-all">
        {compte.email ?? "Adresse non fournie"}
        {soiMeme ? " · c'est votre compte" : ""}
      </p>

      <section
        aria-labelledby="compte-titre"
        className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="compte-titre" className="font-serif text-2xl">
          Compte
        </h2>
        <dl className="mt-3 divide-y divide-[var(--app-line)]">
          <Ligne libelle="Adresse">
            {compte.email ?? NON_FOURNIE}
            {compte.email_confirme ? " (confirmée)" : " (non confirmée)"}
          </Ligne>
          <Ligne libelle="Créé le">
            <Horodatage iso={compte.cree_le} />
          </Ligne>
          <Ligne libelle="Dernière connexion">
            {compte.derniere_connexion ? (
              <Horodatage iso={compte.derniere_connexion} />
            ) : (
              "Jamais connecté."
            )}
          </Ligne>
          <Ligne libelle="Studio personnel">
            {studio ? `${studio.name}${nomDuPlan ? ` · plan ${nomDuPlan}` : ""}` : NON_FOURNIE}
          </Ligne>
        </dl>
      </section>

      <section
        aria-labelledby="profil-titre"
        className="border-app-line mt-6 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="profil-titre" className="font-serif text-2xl">
          Profil
        </h2>
        <p className="text-secondary mt-1 text-xs leading-relaxed">
          Renseigné par le titulaire. Ses équipes n&apos;en lisent que le nom affiché.
        </p>
        <dl className="mt-3 divide-y divide-[var(--app-line)]">
          <Ligne libelle="Prénom">{profil?.first_name || NON_FOURNIE}</Ligne>
          <Ligne libelle="Nom">{profil?.last_name || NON_FOURNIE}</Ligne>
          <Ligne libelle="Type de profil">
            {compte.profile_type
              ? (TYPES_PROFIL[compte.profile_type as keyof typeof TYPES_PROFIL] ??
                compte.profile_type)
              : NON_FOURNIE}
          </Ligne>
          <Ligne libelle="Profession">{profil?.profession || NON_FOURNIE}</Ligne>
          <Ligne libelle="Pays">
            {compte.country ? (noms.of(compte.country) ?? compte.country) : NON_FOURNIE}
          </Ligne>
          <Ligne libelle="Ville">{profil?.city || NON_FOURNIE}</Ligne>
        </dl>
      </section>

      <section
        aria-labelledby="role-titre"
        className="border-app-line mt-6 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="role-titre" className="font-serif text-2xl">
          Rôle
        </h2>
        <p className="mt-3 text-sm">
          Rôle actuel : <span className="font-medium">{ROLES_COMPTE[compte.role]}</span>
        </p>
        <p className="text-secondary mt-1 max-w-2xl text-xs leading-relaxed">
          Le type de profil n&apos;ouvre aucun droit : seul ce rôle distingue un administrateur
          d&apos;un membre. Chaque changement est inscrit au journal d&apos;administration.
        </p>
        <div className="mt-5">
          {obstacle ? (
            <p className="border-app-line text-secondary rounded-lg border border-dashed px-4 py-3 text-sm leading-relaxed">
              {obstacle}
            </p>
          ) : (
            <FormulaireRole compteId={compte.id} role={compte.role} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="suspension-titre"
        className="border-app-line mt-6 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="suspension-titre" className="font-serif text-2xl">
          Suspension
        </h2>
        <p className="text-secondary mt-1 max-w-2xl text-xs leading-relaxed">
          Un compte suspendu garde ses données, mais ne lit ni n&apos;écrit plus rien. Il peut
          encore se connecter, et voit alors qu&apos;il est suspendu, sans le motif. Suspendre et
          rétablir sont inscrits au journal d&apos;administration.
        </p>
        <div className="mt-5">
          {suspension ? (
            <div className="space-y-5">
              <dl className="divide-y divide-[var(--app-line)] rounded-lg border border-red-400/40 px-4">
                <Ligne libelle="État">Suspendu</Ligne>
                <Ligne libelle="Depuis le">
                  <Horodatage iso={suspension.suspended_at} />
                </Ligne>
                <Ligne libelle="Par">
                  {suspension.suspended_by
                    ? auteurSuspension?.display_name?.trim() || "un compte supprimé"
                    : "L'exploitant (hors application)"}
                </Ligne>
                <Ligne libelle="Motif">{suspension.reason}</Ligne>
              </dl>
              <FormulaireRetablissement compteId={compte.id} />
            </div>
          ) : obstacleSuspension ? (
            <p className="border-app-line text-secondary rounded-lg border border-dashed px-4 py-3 text-sm leading-relaxed">
              {obstacleSuspension}
            </p>
          ) : (
            <FormulaireSuspension compteId={compte.id} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="projets-titre"
        className="border-app-line mt-6 rounded-xl border p-5 sm:p-6"
      >
        <h2 id="projets-titre" className="font-serif text-2xl">
          Projets portés
        </h2>
        {listeProjets.length ? (
          <>
            <p className="text-secondary mt-1 text-xs">
              {totalProjets} projet{totalProjets > 1 ? "s" : ""}
              {totalProjets > listeProjets.length
                ? ` · les ${listeProjets.length} plus récemment modifiés`
                : ""}
            </p>
            <ul className="mt-3 divide-y divide-[var(--app-line)]">
              {listeProjets.map((projet) => (
                <li
                  key={projet.id}
                  className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <Link
                    href={`/projets/${projet.id}`}
                    className="hover:text-gold text-sm font-medium break-words transition-colors"
                  >
                    {projet.title}
                  </Link>
                  <span className="text-secondary shrink-0 text-xs">
                    {FORMATS[projet.format] ?? projet.format} ·{" "}
                    {ETAPES[projet.stage] ?? projet.stage} · modifié le{" "}
                    <Horodatage iso={projet.updated_at} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-secondary mt-3 text-sm">Ce compte ne porte aucun projet.</p>
        )}
      </section>
    </div>
  );
}
