import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { lireAcces, ROLES_PROJET } from "@/lib/equipes";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { supprimerProjet } from "../actions";
import { Equipe } from "./equipe";
import { FormulaireEdition } from "./formulaire";
import { OngletsProjet } from "./onglets";

export const metadata: Metadata = {
  title: "Projet — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function ProjetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  /*
   * `maybeSingle` plutôt que `single` : la RLS renvoie zéro ligne aussi bien
   * pour un projet inexistant que pour celui d'un autre utilisateur. Les deux
   * cas donnent la même page 404, ce qui évite de révéler l'existence du
   * projet d'autrui.
   */
  const [{ data: projet }, { data: accesBrut }, { data: estAdmin }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, format, stage, logline, synopsis")
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("acces_au_projet", { p_project_id: id }),
    supabase.rpc("is_admin"),
  ]);

  if (!projet) {
    notFound();
  }

  const acces = lireAcces(accesBrut);
  const peutEditer = acces === "owner" || acces === "editor";
  const peutSupprimer = acces === "owner" || estAdmin === true;
  // Même règle que la fonction SQL peut_gerer_budget, qui a le dernier mot.
  const peutGererBudget = peutEditer || estAdmin === true;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/projets" className="text-light-muted hover:text-light text-sm transition-colors">
        ← Mes projets
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
        {projet.title}
      </h1>
      <p className="text-light-muted mt-4 flex flex-wrap gap-2 text-xs">
        <span className="bg-navy-soft rounded px-2.5 py-1">{FORMATS[projet.format]}</span>
        <span className="text-gold bg-gold/10 rounded px-2.5 py-1">{ETAPES[projet.stage]}</span>
        <span className="border-navy-line rounded border px-2.5 py-1">
          {acces ? `Vous : ${ROLES_PROJET[acces].toLowerCase()}` : "Consultation administrateur"}
        </span>
      </p>

      <OngletsProjet projetId={projet.id} actif="projet" budget={peutGererBudget} />

      <div className="mt-10">
        {peutEditer ? <FormulaireEdition projet={projet} /> : <Apercu projet={projet} />}
      </div>

      <Equipe projetId={projet.id} acces={acces} utilisateurId={user.id} />

      {peutSupprimer ? (
        <section className="border-navy-line mt-16 rounded-xl border border-dashed p-5">
          <h2 className="text-sm font-medium">Supprimer ce projet</h2>
          <p className="text-light-muted mt-2 mb-4 text-sm leading-relaxed text-pretty">
            La suppression est définitive et emporte tout le contenu du projet, son équipe et ses
            invitations en attente.
          </p>
          <BoutonConfirme
            action={supprimerProjet}
            champs={{ id: projet.id }}
            libelle="Supprimer le projet"
            confirmation="Confirmer la suppression"
          />
        </section>
      ) : null}
    </div>
  );
}

/** Lecture seule, pour les lecteurs et les administrateurs hors équipe. */
function Apercu({ projet }: { projet: { logline: string; synopsis: string } }) {
  return (
    <dl className="space-y-8">
      <div>
        <dt className="text-light-muted text-xs tracking-wide uppercase">Pitch</dt>
        <dd className="mt-2 leading-relaxed text-pretty">
          {projet.logline || <span className="text-light-muted">Pas encore de pitch.</span>}
        </dd>
      </div>
      <div>
        <dt className="text-light-muted text-xs tracking-wide uppercase">Synopsis</dt>
        <dd className="mt-2 leading-relaxed text-pretty whitespace-pre-line">
          {projet.synopsis || <span className="text-light-muted">Pas encore de synopsis.</span>}
        </dd>
      </div>
    </dl>
  );
}
