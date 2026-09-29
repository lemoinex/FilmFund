import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRightIcon,
  ClapperIcon,
  DocumentIcon,
  QuillIcon,
  StoryboardIcon,
} from "@/components/icons";
import { Onglets } from "@/components/ui/onglets";
import { compterMots, libelleMots, STATUTS_DOCUMENT } from "@/lib/documents";
import { ROLES_PROJET } from "@/lib/equipes";
import { chargerMesProjets, type ResumeProjet } from "@/lib/mes-projets";
import { ETAPES, FORMATS } from "@/lib/projets";
import { createClient } from "@/lib/supabase/server";

import { InvitationsRecues } from "./invitations";

export const metadata: Metadata = {
  title: "Tableau de bord — filmfundAfrica",
  robots: { index: false, follow: false },
};

const dateFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });

export default async function TableauDeBord() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // Projets possédés et partagés, jamais ceux que l'administration rend
  // visibles : ce tableau de bord est celui du travail de l'utilisateur.
  const { possedes, partages } = await chargerMesProjets(supabase, user.id, { limite: 5 });
  const projets = [...possedes, ...partages].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  // Le projet mis en avant est le dernier modifié : celui sur lequel on
  // travaille, sans qu'aucune préférence ne soit stockée.
  const [projet, ...autres] = projets;

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <h1 className="sr-only">Tableau de bord</h1>

        <div className="border-app-line flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <p className="text-secondary text-sm font-medium">Mon projet</p>
          {projet ? (
            <span className="border-app-line text-secondary rounded-full border px-3 py-1 text-xs">
              {projet.role ? `Vous : ${ROLES_PROJET[projet.role].toLowerCase()}` : "Vous : porteur"}
            </span>
          ) : null}
        </div>

        <InvitationsRecues />

        {projet ? <ProjetEnCours projet={projet} autres={autres} /> : <AucunProjet />}
      </div>

      <Apercus />
    </div>
  );
}

async function ProjetEnCours({ projet, autres }: { projet: ResumeProjet; autres: ResumeProjet[] }) {
  const supabase = await createClient();

  // Données complémentaires : le synopsis (absent du résumé), la dernière
  // note d'intention, et les droits calculés par les mêmes fonctions que la
  // RLS.
  const [{ data: detail }, { data: note }, { data: budgetAutorise }, { data: peutEditer }] =
    await Promise.all([
      supabase.from("projects").select("synopsis").eq("id", projet.id).maybeSingle(),
      supabase
        .from("project_documents")
        .select("id, status, content")
        .eq("project_id", projet.id)
        .eq("type", "note_intention")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.rpc("peut_gerer_budget", { p_project_id: projet.id }),
      supabase.rpc("peut_editer_contenu", { p_project_id: projet.id }),
    ]);

  const synopsis = detail?.synopsis?.trim() ?? "";

  return (
    <>
      <section aria-labelledby="projet-titre" className="mt-8">
        <div className="flex flex-wrap items-start gap-5">
          <Couverture />

          {/*
           * Largeur minimale : sur mobile, c'est le bouton qui passe à la
           * ligne, au lieu de comprimer le titre en colonne étroite.
           */}
          <div className="min-w-0 flex-1 basis-56">
            <h2
              id="projet-titre"
              className="font-serif text-3xl leading-tight tracking-tight text-pretty sm:text-4xl"
            >
              {projet.title}
            </h2>
            <ul aria-label="Informations du projet" className="mt-4 flex flex-wrap gap-2 text-xs">
              <li className="bg-surface-hover text-secondary rounded-md px-2.5 py-1">
                {FORMATS[projet.format]}
              </li>
              <li className="bg-gold/12 text-gold rounded-md px-2.5 py-1">
                <span className="sr-only">Étape : </span>
                {ETAPES[projet.stage]}
              </li>
            </ul>
            <p className="text-secondary mt-3 text-xs">
              Modifié le {dateFr.format(new Date(projet.updated_at))}
            </p>
          </div>

          <Link
            href={`/projets/${projet.id}`}
            className="border-app-line hover:bg-surface-hover inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors"
          >
            Ouvrir le projet
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>

        {projet.logline ? (
          <p className="text-secondary mt-5 max-w-3xl text-sm leading-relaxed text-pretty">
            {projet.logline}
          </p>
        ) : null}
      </section>

      <Onglets
        className="mt-8"
        libelle="Rubriques du projet"
        actif="synthese"
        onglets={[
          { cle: "synthese", libelle: "Synthèse", href: "/tableau-de-bord" },
          { cle: "documents", libelle: "Documents", href: `/projets/${projet.id}/documents` },
          { cle: "storyboard", libelle: "Storyboard" },
          ...(budgetAutorise
            ? [{ cle: "budget", libelle: "Budget", href: `/projets/${projet.id}/budget` }]
            : []),
          { cle: "equipe", libelle: "Équipe", href: `/projets/${projet.id}#equipe` },
        ]}
      />

      <section
        aria-labelledby="avancement-titre"
        className="border-app-line bg-surface mt-6 rounded-xl border p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="avancement-titre" className="text-sm font-medium">
            Avancement du projet
          </h3>
          {/*
           * Aucune mesure d'avancement n'existe encore dans les données. Un
           * pourcentage déduit de l'étape serait une invention : on l'écrit.
           */}
          <p className="text-secondary text-sm">Non renseigné</p>
        </div>
        <div aria-hidden="true" className="bg-app-line/60 mt-4 h-2 rounded-full" />
        <p className="text-secondary mt-3 text-xs">
          Étape actuelle : <span className="text-light">{ETAPES[projet.stage]}</span>
        </p>
      </section>

      <section aria-labelledby="synthese-titre" className="mt-6">
        <h3 id="synthese-titre" className="sr-only">
          Synthèse du projet
        </h3>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CarteSynthese
            titre="Synopsis"
            icone={<QuillIcon className="size-5" />}
            statut={synopsis ? "Rédigé" : "Non commencé"}
            detail={synopsis ? libelleMots(compterMots(synopsis)) : "Aucun synopsis pour l'instant"}
            renseigne={Boolean(synopsis)}
            lien={{ href: `/projets/${projet.id}`, libelle: `le synopsis de ${projet.title}` }}
          />
          <CarteSynthese
            titre="Note d'intention"
            icone={<DocumentIcon className="size-5" />}
            statut={note ? STATUTS_DOCUMENT[note.status] : "Non commencé"}
            detail={note ? libelleMots(compterMots(note.content)) : "Aucun document"}
            renseigne={Boolean(note)}
            lien={
              note
                ? {
                    href: `/projets/${projet.id}/documents/${note.id}`,
                    libelle: `la note d'intention de ${projet.title}`,
                  }
                : peutEditer
                  ? {
                      href: `/projets/${projet.id}/documents?type=note_intention#nouveau-titre`,
                      libelle: `la note d'intention de ${projet.title}`,
                      texte: "Rédiger",
                    }
                  : undefined
            }
          />
          <CarteSynthese
            titre="Storyboard"
            icone={<StoryboardIcon className="size-5" />}
            statut="Non commencé"
            detail="Aucune scène"
            renseigne={false}
          />
        </ul>
      </section>

      {autres.length ? (
        <section aria-labelledby="autres-titre" className="mt-10">
          <h3 id="autres-titre" className="text-sm font-medium">
            Autres projets récents
          </h3>
          <ul className="border-app-line mt-4 divide-y divide-[var(--app-line)] rounded-xl border">
            {autres.map((autre) => (
              <li key={autre.id}>
                <Link
                  href={`/projets/${autre.id}`}
                  className="hover:bg-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors"
                >
                  <span className="min-w-0 truncate font-serif">{autre.title}</span>
                  <span className="text-secondary flex shrink-0 flex-wrap gap-2 text-xs">
                    {autre.role ? <span>{ROLES_PROJET[autre.role]}</span> : null}
                    <span>{FORMATS[autre.format]}</span>
                    <span className="text-gold">{ETAPES[autre.stage]}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/projets/nouveau"
          className="bg-gold text-navy hover:bg-gold-bright inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Créer un projet
          <ArrowRightIcon className="size-4" />
        </Link>
        <Link
          href="/projets"
          className="border-app-line hover:bg-surface-hover inline-flex items-center rounded-full border px-5 py-2.5 text-sm transition-colors"
        >
          Voir tous mes projets
        </Link>
      </div>
    </>
  );
}

/**
 * Couverture du projet.
 *
 * Les projets n'ont pas encore d'image : un emplacement sombre, décoratif,
 * tient la place sans charger de ressource externe.
 */
function Couverture() {
  return (
    <div
      aria-hidden="true"
      className="border-app-line relative flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[linear-gradient(160deg,var(--surface-hover),var(--sidebar-bg))] sm:h-32 sm:w-24"
    >
      <ClapperIcon className="text-gold/70 size-8" />
    </div>
  );
}

function CarteSynthese({
  titre,
  icone,
  statut,
  detail,
  renseigne,
  lien,
}: {
  titre: string;
  icone: React.ReactNode;
  statut: string;
  detail: string;
  renseigne: boolean;
  /** `libelle` complète le texte du lien pour les lecteurs d'écran. */
  lien?: { href: string; libelle: string; texte?: string };
}) {
  return (
    <li className="border-app-line bg-surface hover:border-secondary/40 flex h-full flex-col rounded-xl border p-5 transition-colors">
      <div className="flex items-center gap-3">
        <span className={renseigne ? "text-gold" : "text-secondary"}>{icone}</span>
        <h4 className="text-sm font-medium">{titre}</h4>
      </div>

      {/* Le statut est écrit : la couleur ne fait que le souligner. */}
      <p className={`mt-4 text-sm ${renseigne ? "text-light" : "text-secondary"}`}>{statut}</p>
      <p className="text-secondary mt-1 flex-1 text-xs">{detail}</p>

      <div className="mt-5">
        {lien ? (
          <Link
            href={lien.href}
            className="text-gold hover:text-gold-bright inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            {lien.texte ?? "Voir"}
            <span className="sr-only"> {lien.libelle}</span>
            <ArrowRightIcon className="size-4" />
          </Link>
        ) : (
          <span className="text-secondary text-xs">Bientôt disponible</span>
        )}
      </div>
    </li>
  );
}

function AucunProjet() {
  return (
    <section className="border-app-line bg-surface mt-8 rounded-xl border p-8 text-center sm:p-10">
      <ClapperIcon className="text-gold mx-auto size-10" />
      <h2 className="mt-5 font-serif text-2xl">Aucun projet pour l&apos;instant</h2>
      <p className="text-secondary mx-auto mt-3 max-w-md text-sm leading-relaxed text-pretty">
        Un projet rassemble votre titre, votre format, votre pitch et votre synopsis. Vous pourrez
        le compléter au fil du développement.
      </p>
      <Link
        href="/projets/nouveau"
        className="bg-gold text-navy hover:bg-gold-bright mt-8 inline-flex items-center gap-2.5 rounded-full px-6 py-3.5 text-sm font-medium transition-colors"
      >
        Créer un projet
        <ArrowRightIcon className="size-4" />
      </Link>
    </section>
  );
}

/**
 * Colonne d'aperçus visuels.
 *
 * Aucun visuel de projet n'existe encore en base (ni couverture, ni planche
 * de storyboard). Plutôt que d'y montrer les images de la vitrine, qui ne
 * sont pas celles du projet, trois emplacements décoratifs annoncent ce que
 * la colonne accueillera. Non interactifs, ignorés des lecteurs d'écran.
 */
function Apercus() {
  return (
    <aside
      aria-labelledby="apercus-titre"
      className="border-app-line hidden w-56 shrink-0 border-l px-5 py-8 xl:block"
    >
      <h2 id="apercus-titre" className="text-secondary text-xs font-medium tracking-wide uppercase">
        Aperçus visuels
      </h2>
      <div aria-hidden="true" className="mt-5 space-y-4">
        {["aspect-[4/3]", "aspect-[3/4]", "aspect-[4/3]"].map((format, index) => (
          <div
            key={index}
            className={`${format} border-app-line relative overflow-hidden rounded-xl border bg-[linear-gradient(150deg,var(--surface-hover),var(--surface)_55%,var(--sidebar-bg))]`}
          >
            <div className="pattern-film absolute inset-0" />
          </div>
        ))}
      </div>
      <p className="text-secondary mt-5 text-xs leading-relaxed">
        Les couvertures et planches de storyboard apparaîtront ici.
      </p>
    </aside>
  );
}
