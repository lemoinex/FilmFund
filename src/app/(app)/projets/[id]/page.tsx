import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { Couverture } from "@/components/ui/couverture";
import { EnvoiImage } from "@/components/ui/envoi-image";
import { lireAcces, ROLES_PROJET } from "@/lib/equipes";
import { ETAPES, FORMATS } from "@/lib/projets";
import { attenteEnCours, lireEtapes } from "@/lib/propositions-serveur";
import { liensSignes } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

import { supprimerProjet } from "../actions";
import { definirCouverture, retirerCouverture } from "./images/actions";
import { Equipe } from "./equipe";
import { FormulaireEdition } from "./formulaire";
import { MaturiteDuDossier } from "./maturite";
import { OngletsProjet } from "./onglets";
import { Proposition, RafraichissementPropositions } from "./proposition";

export const metadata: Metadata = {
  title: "Projet — filmfundAfrica",
  robots: { index: false, follow: false },
};

/** Les livrables que cette page porte : le texte qu'ils écrivent s'y lit. */
const LIVRABLES_PAGE = ["logline", "synopsis_standard"] as const;

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
      .select("id, title, format, stage, logline, synopsis, cover_path")
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

  const liens = await liensSignes(supabase, [projet.cover_path]);
  const urlCouverture = projet.cover_path ? liens.get(projet.cover_path) : null;

  // Assistant d'écriture : même règle que la fonction SQL peut_engager_unites,
  // qui a le dernier mot. Les lecteurs n'engagent pas les unités du studio.
  const peutDemander = peutEditer || estAdmin === true;
  // Les deux livrables que cette page écrit : le pitch et le synopsis, tous
  // deux affichés et modifiés ici.
  const etapes = await lireEtapes(supabase, id, LIVRABLES_PAGE, peutDemander);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <Link href="/projets" className="text-light-muted hover:text-light text-sm transition-colors">
        ← Mes projets
      </Link>

      <div className="mt-6 flex flex-wrap items-start gap-5">
        <Couverture url={urlCouverture} titre={projet.title} prioritaire />
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl">
            {projet.title}
          </h1>
          <p className="text-light-muted mt-4 flex flex-wrap gap-2 text-xs">
            <span className="bg-navy-soft rounded px-2.5 py-1">{FORMATS[projet.format]}</span>
            <span className="text-gold bg-gold/10 rounded px-2.5 py-1">{ETAPES[projet.stage]}</span>
            <span className="border-navy-line rounded border px-2.5 py-1">
              {acces
                ? `Vous : ${ROLES_PROJET[acces].toLowerCase()}`
                : "Consultation administrateur"}
            </span>
          </p>
          {/*
           * Porteur et éditeurs seulement : la couverture est une colonne du
           * projet, et les administrateurs ne modifient pas le contenu des
           * projets d'autrui.
           */}
          {peutEditer ? (
            <div className="mt-4">
              <EnvoiImage
                projetId={projet.id}
                dossier="couverture"
                rattacher={definirCouverture}
                retirer={retirerCouverture}
                libelle="la couverture"
                aImage={Boolean(projet.cover_path)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <OngletsProjet projetId={projet.id} actif="projet" budget={peutGererBudget} />

      {/* Le score tient compte du budget : il se montre à qui le lit. */}
      {peutGererBudget ? <MaturiteDuDossier projetId={projet.id} /> : null}

      <div className="mt-10">
        {/*
         * Clé sur le pitch : quand une proposition est appliquée, le
         * formulaire repart du nouveau texte. Sans cela, son champ garderait
         * l'ancien pitch, et l'enregistrement suivant l'y remettrait.
         */}
        {peutEditer ? (
          <FormulaireEdition key={projet.logline} projet={projet} />
        ) : (
          <Apercu projet={projet} />
        )}
      </div>

      {peutDemander ? (
        <>
          <RafraichissementPropositions actif={attenteEnCours(etapes.values())} />
          <Proposition
            projetId={projet.id}
            action="logline"
            texteActuel={projet.logline}
            etape={etapes.get("logline") ?? { etape: "repos" }}
            peutAppliquer={peutEditer}
          />
          <Proposition
            projetId={projet.id}
            action="synopsis_standard"
            texteActuel={projet.synopsis}
            etape={etapes.get("synopsis_standard") ?? { etape: "repos" }}
            peutAppliquer={peutEditer}
          />
        </>
      ) : null}

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
