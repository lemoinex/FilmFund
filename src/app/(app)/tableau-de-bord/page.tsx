import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  ArrowRightIcon,
  ClapperIcon,
  DocumentIcon,
  QuillIcon,
  StoryboardIcon,
} from "@/components/icons";
import { BarreAvancement } from "@/components/ui/avancement";
import { Couverture } from "@/components/ui/couverture";
import { Onglets } from "@/components/ui/onglets";
import { compterMots, libelleMots, STATUTS_DOCUMENT } from "@/lib/documents";
import { ROLES_PROJET } from "@/lib/equipes";
import { chargerMesProjets, type ResumeProjet } from "@/lib/mes-projets";
import {
  aujourdhui,
  calculerAvancement,
  comparerEtapes,
  estEnRetard,
  formaterJour,
} from "@/lib/planning";
import { salutation } from "@/lib/profils";
import { ETAPES, FORMATS } from "@/lib/projets";
import { liensSignes } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

import { ScoreMaturite } from "../projets/[id]/maturite";
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
  const [{ possedes, partages }, { data: profil }] = await Promise.all([
    chargerMesProjets(supabase, user.id, { limite: 5 }),
    supabase.from("profiles").select("first_name, display_name").eq("id", user.id).maybeSingle(),
  ]);
  const projets = [...possedes, ...partages].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );

  // Le projet mis en avant est le dernier modifié : celui sur lequel on
  // travaille, sans qu'aucune préférence ne soit stockée.
  const [projet, ...autres] = projets;

  const visuels = projet ? await chargerVisuels(supabase, projet.id) : null;

  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <h1 className="font-serif text-2xl leading-tight tracking-tight break-words sm:text-3xl">
          {salutation(profil)}
          <span className="sr-only"> — tableau de bord</span>
        </h1>

        <div className="border-app-line mt-6 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <p className="text-secondary text-sm font-medium">Mon projet</p>
          {projet ? (
            <span className="border-app-line text-secondary rounded-full border px-3 py-1 text-xs">
              {projet.role ? `Vous : ${ROLES_PROJET[projet.role].toLowerCase()}` : "Vous : porteur"}
            </span>
          ) : null}
        </div>

        <InvitationsRecues />

        {projet ? (
          <ProjetEnCours projet={projet} autres={autres} couverture={visuels?.couverture ?? null} />
        ) : (
          <AucunProjet />
        )}
      </div>

      <Apercus projet={projet ?? null} visuels={visuels} />
    </div>
  );
}

type Visuels = {
  couverture: string | null;
  planches: { id: string; url: string; titre: string; numero: string }[];
};

/**
 * Couverture et planches illustrées du projet mis en avant.
 *
 * Trois planches au plus, dans l'ordre du storyboard : la colonne est un
 * aperçu, pas une galerie. Les liens sont signés avec la session de
 * l'utilisateur ; une image qu'il ne peut pas lire est simplement absente.
 */
async function chargerVisuels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
): Promise<Visuels> {
  const [{ data: projet }, { data: scenes }] = await Promise.all([
    supabase.from("projects").select("cover_path").eq("id", projetId).maybeSingle(),
    supabase
      .from("storyboard_scenes")
      .select("id, title, position, image_path")
      .eq("project_id", projetId)
      .order("position"),
  ]);

  const toutes = scenes ?? [];
  const illustrees = toutes.filter((s) => s.image_path).slice(0, 3);
  const liens = await liensSignes(supabase, [
    projet?.cover_path,
    ...illustrees.map((s) => s.image_path),
  ]);

  return {
    couverture: projet?.cover_path ? (liens.get(projet.cover_path) ?? null) : null,
    planches: illustrees.flatMap((scene) => {
      const url = scene.image_path ? liens.get(scene.image_path) : undefined;
      // Numéro calculé sur l'ensemble du storyboard, comme sur sa page.
      const numero = String(toutes.indexOf(scene) + 1).padStart(2, "0");
      return url ? [{ id: scene.id, url, titre: scene.title, numero }] : [];
    }),
  };
}

async function ProjetEnCours({
  projet,
  autres,
  couverture,
}: {
  projet: ResumeProjet;
  autres: ResumeProjet[];
  couverture: string | null;
}) {
  const supabase = await createClient();

  // Données complémentaires : le synopsis (absent du résumé), la dernière
  // note d'intention, et les droits calculés par les mêmes fonctions que la
  // RLS.
  const [
    { data: detail },
    { data: note },
    { count: nombreScenes },
    { data: etapes },
    { data: budgetAutorise },
    { data: peutEditer },
  ] = await Promise.all([
    supabase.from("projects").select("synopsis").eq("id", projet.id).maybeSingle(),
    supabase
      .from("project_documents")
      .select("id, status, content")
      .eq("project_id", projet.id)
      .eq("type", "note_intention")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Nombre seul, sans rapatrier les scènes.
    supabase
      .from("storyboard_scenes")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projet.id),
    supabase
      .from("project_milestones")
      .select("title, status, starts_on, due_on")
      .eq("project_id", projet.id),
    supabase.rpc("peut_gerer_budget", { p_project_id: projet.id }),
    supabase.rpc("peut_editer_contenu", { p_project_id: projet.id }),
  ]);

  const synopsis = detail?.synopsis?.trim() ?? "";

  const avancement = calculerAvancement(etapes ?? []);
  const jour = aujourdhui();
  const enRetard = (etapes ?? []).filter((e) => estEnRetard(e, jour)).length;
  // Prochaine échéance : l'étape non terminée la plus proche, à venir.
  const prochaine = (etapes ?? [])
    .filter((e) => e.status !== "termine" && e.due_on !== null && e.due_on >= jour)
    .sort(comparerEtapes)[0];

  return (
    <>
      <section aria-labelledby="projet-titre" className="mt-8">
        <div className="flex flex-wrap items-start gap-5">
          <Couverture url={couverture} titre={projet.title} prioritaire />

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
          { cle: "storyboard", libelle: "Storyboard", href: `/projets/${projet.id}/storyboard` },
          { cle: "planning", libelle: "Planning", href: `/projets/${projet.id}/planning` },
          ...(budgetAutorise
            ? [
                { cle: "budget", libelle: "Budget", href: `/projets/${projet.id}/budget` },
                {
                  cle: "financements",
                  libelle: "Financements",
                  href: `/projets/${projet.id}/financements`,
                },
              ]
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
           * L'avancement est mesuré sur le planning : la part des étapes
           * terminées. Sans planning, aucune mesure n'existe — un pourcentage
           * déduit de l'étape du projet serait une invention.
           */}
          {avancement ? (
            <p className="text-gold text-sm tabular-nums">{avancement.pourcent} %</p>
          ) : (
            <p className="text-secondary text-sm">Non renseigné</p>
          )}
        </div>
        <div className="mt-4">
          {avancement ? (
            <BarreAvancement
              pourcent={avancement.pourcent}
              libelle="Part des étapes du planning terminées"
            />
          ) : (
            <div aria-hidden="true" className="bg-app-line/60 h-2 rounded-full" />
          )}
        </div>
        <div className="text-secondary mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs">
          <p>
            {avancement ? (
              <>
                {avancement.terminees} étape{avancement.terminees > 1 ? "s" : ""} terminée
                {avancement.terminees > 1 ? "s" : ""} sur {avancement.total}
                {enRetard ? <span className="text-red-200"> · {enRetard} en retard</span> : null}
              </>
            ) : (
              <>
                Étape actuelle : <span className="text-light">{ETAPES[projet.stage]}</span>
              </>
            )}
          </p>
          {prochaine?.due_on ? (
            <p>
              Prochaine échéance : <span className="text-light">{prochaine.title}</span>, le{" "}
              {formaterJour(prochaine.due_on)}
            </p>
          ) : avancement ? null : peutEditer ? (
            <Link
              href={`/projets/${projet.id}/planning#ajout-etape`}
              className="text-gold hover:text-gold-bright transition-colors"
            >
              Établir le planning
            </Link>
          ) : null}
        </div>
      </section>

      {/* Le score tient compte du budget : il se montre à qui le lit. */}
      {budgetAutorise ? <ScoreMaturite projetId={projet.id} /> : null}

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
                      href: `/projets/${projet.id}/documents?type=note_intention#ajout-document`,
                      libelle: `la note d'intention de ${projet.title}`,
                      texte: "Rédiger",
                    }
                  : undefined
            }
          />
          <CarteSynthese
            titre="Storyboard"
            icone={<StoryboardIcon className="size-5" />}
            statut={nombreScenes ? "Commencé" : "Non commencé"}
            detail={
              nombreScenes ? `${nombreScenes} scène${nombreScenes > 1 ? "s" : ""}` : "Aucune scène"
            }
            renseigne={Boolean(nombreScenes)}
            lien={
              nombreScenes
                ? {
                    href: `/projets/${projet.id}/storyboard`,
                    libelle: `le storyboard de ${projet.title}`,
                  }
                : peutEditer
                  ? {
                      href: `/projets/${projet.id}/storyboard#ajout-scene`,
                      libelle: `le storyboard de ${projet.title}`,
                      texte: "Commencer",
                    }
                  : undefined
            }
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
 * Colonne d'aperçus visuels : la couverture et les premières planches
 * illustrées du projet mis en avant, chacune menant à sa page.
 *
 * Sans aucun visuel, trois emplacements décoratifs annoncent ce que la
 * colonne accueillera — jamais les images de la vitrine, qui ne sont pas
 * celles du projet.
 */
function Apercus({ projet, visuels }: { projet: ResumeProjet | null; visuels: Visuels | null }) {
  const aDesVisuels = Boolean(visuels?.couverture || visuels?.planches.length);

  return (
    <aside
      aria-labelledby="apercus-titre"
      className="border-app-line hidden w-56 shrink-0 border-l px-5 py-8 xl:block"
    >
      <h2 id="apercus-titre" className="text-secondary text-xs font-medium tracking-wide uppercase">
        Aperçus visuels
      </h2>

      {projet && visuels && aDesVisuels ? (
        <ul className="mt-5 space-y-4">
          {visuels.couverture ? (
            <li>
              <Link
                href={`/projets/${projet.id}`}
                className="border-app-line hover:border-gold/60 relative block aspect-[3/4] overflow-hidden rounded-xl border transition-colors"
              >
                <Image
                  src={visuels.couverture}
                  alt={`Couverture du projet ${projet.title}`}
                  fill
                  unoptimized
                  sizes="176px"
                  className="object-cover"
                />
              </Link>
            </li>
          ) : null}
          {visuels.planches.map((planche) => (
            <li key={planche.id}>
              <Link
                href={`/projets/${projet.id}/storyboard#scene-${planche.id}`}
                className="border-app-line hover:border-gold/60 relative block aspect-video overflow-hidden rounded-xl border transition-colors"
              >
                <Image
                  src={planche.url}
                  alt={`Planche de la scène ${planche.numero} : ${planche.titre}`}
                  fill
                  unoptimized
                  sizes="176px"
                  className="object-cover"
                />
                <span
                  aria-hidden="true"
                  className="bg-app/80 text-gold absolute top-2 left-2 rounded px-1.5 font-serif text-sm"
                >
                  {planche.numero}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <>
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
            La couverture et les planches illustrées du storyboard apparaîtront ici.
          </p>
        </>
      )}
    </aside>
  );
}
