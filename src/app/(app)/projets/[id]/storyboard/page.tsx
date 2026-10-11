import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Image from "next/image";

import { StoryboardIcon } from "@/components/icons";
import { BoutonConfirme } from "@/components/ui/confirmation";
import { EnvoiImage } from "@/components/ui/envoi-image";
import { PLANS_PAR_SCENE_MAX } from "@/lib/decoupage";
import { episodeDeScene, estSerie, NUMERO_EPISODE, SANS_SCENARIO_D_EPISODE } from "@/lib/episodes";
import {
  etapeProposition,
  LIVRABLE_DECOUPAGE,
  type EtapeProposition,
  type PlanPropose,
} from "@/lib/propositions";
import { CADRAGES, enteteScene, numeroScene } from "@/lib/storyboard";
import { liensSignes } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

import { definirImageScene, retirerImageScene } from "../images/actions";
import { OngletsProjet } from "../onglets";
import { RafraichissementPropositions } from "../proposition";
import { deplacerScene, supprimerScene } from "./actions";
import { FormulaireScene, type EpisodeDeScene, type SceneEditable } from "./formulaire";
import type { PlanEditable } from "./formulaire-plan";
import { lireVignettes, VIGNETTE_AU_REPOS, type VignetteScene } from "./lecture-vignettes";
import { PlansScene } from "./plans";
import { DecoupagePropose } from "./plans-proposes";
import { VignetteProposee } from "./vignette-proposee";

export const metadata: Metadata = {
  title: "Storyboard — FilmFund Africa",
  robots: { index: false, follow: false },
};

export default async function StoryboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scene?: string; plan?: string; decoupage?: string }>;
}) {
  const { id } = await params;
  const {
    scene: sceneEnModification,
    plan: planEnModification,
    decoupage: decoupageOuvert,
  } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: peutEditer },
    { data: budget },
    { data: scenes },
    { data: plans },
  ] = await Promise.all([
    supabase.from("projects").select("id, title, format").eq("id", id).maybeSingle(),
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase
      .from("storyboard_scenes")
      .select(
        "id, title, setting, location, time_of_day, shot, description, image_path, episode_id",
      )
      .eq("project_id", id)
      .order("position"),
    supabase
      .from("scene_shots")
      .select("id, scene_id, shot, focal_mm, angle, movement, description, duration_seconds")
      .eq("project_id", id)
      .order("position"),
  ]);

  if (!projet) {
    notFound();
  }

  const liste = scenes ?? [];
  const peutDecider = peutEditer === true;
  // Les épisodes qu'une scène peut désigner : pour une série seulement. Lus
  // sous la RLS, comme toute l'équipe les lit.
  const { data: saison } = estSerie(projet.format)
    ? await supabase
        .from("project_episodes")
        .select("id, number, title")
        .eq("project_id", projet.id)
        .order("number")
        .limit(NUMERO_EPISODE.max)
    : { data: [] };
  const episodes: EpisodeDeScene[] = saison ?? [];
  const episodesParId = new Map(episodes.map((episode) => [episode.id, episode]));
  const assistant = await lireAssistant(supabase, projet.id, peutDecider);
  const vignettes = await lireVignettes(supabase, projet.id, peutDecider);
  // Une seule boucle de rafraîchissement pour la page : un découpage ou une
  // vignette qui se prépare suffit à la tenir.
  const enPreparation = [...assistant.parScene.values(), ...vignettes.values()].some(
    ({ etape }) => etape.etape === "en_attente" || etape.etape === "en_cours",
  );

  // Les plans de chaque scène, dans leur ordre ; bornés comme l'ajout l'est.
  const plansParScene = new Map<string, PlanEditable[]>();
  for (const { scene_id, ...plan } of plans ?? []) {
    const deLaScene = plansParScene.get(scene_id) ?? [];
    if (deLaScene.length < PLANS_PAR_SCENE_MAX) {
      deLaScene.push(plan);
    }
    plansParScene.set(scene_id, deLaScene);
  }
  const liens = await liensSignes(
    supabase,
    liste.map((s) => s.image_path),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Storyboard
      </h1>
      <p className="text-secondary mt-3 text-sm">
        {liste.length
          ? `${liste.length} scène${liste.length > 1 ? "s" : ""}, dans l'ordre du film.`
          : "Aucune scène pour l'instant."}
      </p>

      <OngletsProjet projetId={projet.id} actif="storyboard" budget={budget === true} />
      <RafraichissementPropositions actif={enPreparation} />

      {liste.length ? (
        <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {liste.map((scene, index) => (
            <li
              key={scene.id}
              id={`scene-${scene.id}`}
              className="border-app-line bg-surface flex scroll-mt-8 flex-col overflow-hidden rounded-xl border"
            >
              {scene.id === sceneEnModification && peutEditer ? (
                <div className="p-5">
                  <p className="text-gold mb-4 text-sm">Scène {numeroScene(index)}</p>
                  <FormulaireScene projetId={projet.id} scene={scene} episodes={episodes} />
                </div>
              ) : (
                <Planche
                  projetId={projet.id}
                  scene={scene}
                  image={scene.image_path ? (liens.get(scene.image_path) ?? null) : null}
                  aImage={Boolean(scene.image_path)}
                  index={index}
                  total={liste.length}
                  peutEditer={peutEditer === true}
                  plans={plansParScene.get(scene.id) ?? []}
                  planEnModification={planEnModification}
                  decoupageOuvert={decoupageOuvert === scene.id}
                  assistant={assistant.parScene.get(scene.id) ?? REPOS}
                  episode={scene.episode_id ? (episodesParId.get(scene.episode_id) ?? null) : null}
                  sansScenario={
                    scene.episode_id
                      ? assistant.scenarios.episodes.has(scene.episode_id)
                        ? null
                        : SANS_SCENARIO_D_EPISODE
                      : assistant.scenarios.sansEpisode
                        ? null
                        : LIVRABLE_DECOUPAGE.sansScenario
                  }
                  vignette={vignettes.get(scene.id) ?? VIGNETTE_AU_REPOS}
                />
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <StoryboardIcon className="text-gold mx-auto size-9" />
          <p className="mt-4 font-serif text-xl">Le storyboard est vide</p>
          <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed text-pretty">
            {peutEditer
              ? "Décrivez les scènes dans l'ordre du film. Les images viendront s'y ajouter plus tard."
              : "Les scènes décrites par l'équipe apparaîtront ici."}
          </p>
        </div>
      )}

      {peutEditer ? (
        <section
          aria-labelledby="ajout-scene"
          className="border-app-line mt-12 max-w-3xl border-t pt-10"
        >
          <h2 id="ajout-scene" className="font-serif text-2xl leading-tight">
            Nouvelle scène
          </h2>
          <p className="text-secondary mt-2 text-sm">
            Elle prend place à la fin du storyboard ; les flèches la déplacent ensuite.
          </p>
          <div className="mt-6">
            <FormulaireScene projetId={projet.id} episodes={episodes} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

type AssistantScene = { etape: EtapeProposition; plans: PlanPropose[] };

/** Ce que le projet a de scénarios : un sans épisode, et ceux de quels épisodes. */
type ScenariosDuProjet = { sansEpisode: boolean; episodes: ReadonlySet<string> };

const REPOS: AssistantScene = { etape: { etape: "repos" }, plans: [] };

/** Tâches de découpage relues pour retrouver la dernière de chaque scène. */
const TACHES_LUES = 200;

/**
 * Où en est, scène par scène, la dernière demande de découpage, et les plans
 * de sa proposition si elle attend encore une décision.
 *
 * Lectures bornées, sous la RLS de l'appelant. Qui écrit le storyboard suit
 * chaque demande depuis sa tâche ; un lecteur ne lit que les propositions en
 * attente — il n'a pas à voir une demande en cours, seulement ce qui est
 * proposé à l'équipe.
 */
async function lireAssistant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projetId: string,
  peutDecider: boolean,
): Promise<{ parScene: Map<string, AssistantScene>; scenarios: ScenariosDuProjet }> {
  const parScene = new Map<string, AssistantScene>();
  /** Proposition en attente → scène, pour y ranger ses plans. */
  const scenes = new Map<string, string | null>();

  // Les scénarios du projet, par épisode : un par épisode au plus, la base
  // le garantit. De quoi dire, scène par scène, celui que l'assistant lira.
  const { data: documents } = await supabase
    .from("project_documents")
    .select("episode_id")
    .eq("project_id", projetId)
    .eq("type", "scenario")
    .order("episode_id", { ascending: true, nullsFirst: true })
    .limit(NUMERO_EPISODE.max + 1);
  const scenarios: ScenariosDuProjet = {
    sansEpisode: (documents ?? []).some((document) => document.episode_id === null),
    episodes: new Set(
      (documents ?? []).flatMap((document) => (document.episode_id ? [document.episode_id] : [])),
    ),
  };

  if (peutDecider) {
    const { data: taches } = await supabase
      .from("jobs")
      .select("id, state, params")
      .eq("project_id", projetId)
      .eq("action", LIVRABLE_DECOUPAGE.action)
      .order("created_at", { ascending: false })
      .limit(TACHES_LUES);

    // La plus récente de chaque scène : la liste est déjà dans cet ordre.
    const dernieres = new Map<string, { id: string; state: string }>();
    for (const tache of taches ?? []) {
      const scene =
        tache.params && typeof tache.params === "object" && !Array.isArray(tache.params)
          ? tache.params.scene
          : null;
      if (typeof scene === "string" && !dernieres.has(scene)) {
        dernieres.set(scene, { id: tache.id, state: tache.state });
      }
    }

    const { data: propositions } = dernieres.size
      ? await supabase
          .from("ai_suggestions")
          .select("id, content, state, job_id")
          .in(
            "job_id",
            [...dernieres.values()].map((tache) => tache.id),
          )
      : { data: [] };

    for (const [scene, tache] of dernieres) {
      const proposition = (propositions ?? []).find((p) => p.job_id === tache.id) ?? null;
      const etape = etapeProposition(tache, proposition);
      parScene.set(scene, { etape, plans: [] });
      if (etape.etape === "proposition") {
        scenes.set(etape.propositionId, scene);
      }
    }
  } else {
    const { data: propositions } = await supabase
      .from("ai_suggestions")
      .select("id, content")
      .eq("project_id", projetId)
      .eq("action", LIVRABLE_DECOUPAGE.action)
      .eq("state", "proposed")
      .order("created_at", { ascending: false })
      .limit(TACHES_LUES);
    for (const proposition of propositions ?? []) {
      // La scène d'une proposition se lit sur ses plans.
      scenes.set(proposition.id, null);
    }
  }

  if (!scenes.size) {
    return { parScene, scenarios };
  }

  const { data: plans } = await supabase
    .from("ai_suggestion_shots")
    .select(
      "id, suggestion_id, scene_id, position, shot, focal_mm, angle, movement, description, duration_seconds, state",
    )
    .in("suggestion_id", [...scenes.keys()])
    .order("position")
    // Bornée comme la base borne chaque dépôt.
    .limit(scenes.size * LIVRABLE_DECOUPAGE.lignesMax);

  for (const { suggestion_id, scene_id, ...plan } of plans ?? []) {
    let deLaScene = parScene.get(scene_id);
    if (!deLaScene || deLaScene.etape.etape !== "proposition") {
      // Lecteur : la première proposition rencontrée pour la scène est la
      // plus récente, les autres sont ignorées.
      if (peutDecider || deLaScene) {
        continue;
      }
      deLaScene = {
        etape: { etape: "proposition", propositionId: suggestion_id, texte: "" },
        plans: [],
      };
      parScene.set(scene_id, deLaScene);
    }
    if (
      deLaScene.etape.etape === "proposition" &&
      deLaScene.etape.propositionId === suggestion_id
    ) {
      deLaScene.plans.push(plan);
    }
  }

  return { parScene, scenarios };
}

function Planche({
  projetId,
  scene,
  image,
  aImage,
  index,
  total,
  peutEditer,
  plans,
  planEnModification,
  decoupageOuvert,
  assistant,
  episode,
  sansScenario,
  vignette,
}: {
  projetId: string;
  scene: SceneEditable;
  image: string | null;
  aImage: boolean;
  index: number;
  total: number;
  peutEditer: boolean;
  plans: PlanEditable[];
  planEnModification?: string;
  decoupageOuvert: boolean;
  assistant: AssistantScene;
  /** L'épisode de la scène, s'il est rattaché et lisible. */
  episode: EpisodeDeScene | null;
  sansScenario: string | null;
  vignette: VignetteScene;
}) {
  const numero = numeroScene(index);
  const planDeLaScene = plans.some((plan) => plan.id === planEnModification);
  // Qui écrit le storyboard voit toujours l'encart ; un lecteur, seulement
  // quand des plans proposés attendent — il les lit, sans en décider.
  const montrerAssistant = peutEditer || assistant.etape.etape === "proposition";
  const assistantActif = assistant.etape.etape !== "repos";

  return (
    <>
      {/*
       * Cadre de la planche, en 16:9. Avec une image, elle le remplit et
       * garde le numéro en incrustation ; sans image, le numéro seul tient
       * la place. Lien signé : voir le composant Couverture pour
       * `unoptimized`.
       */}
      <div className="border-app-line relative flex aspect-video items-center justify-center overflow-hidden border-b bg-[linear-gradient(150deg,var(--surface-hover),var(--sidebar-bg))]">
        {image ? (
          <>
            <Image
              src={image}
              alt={`Planche de la scène ${numero} : ${scene.title}`}
              fill
              unoptimized
              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
            <span
              aria-hidden="true"
              className="bg-app/80 text-gold absolute top-3 left-3 rounded-md px-2 py-0.5 font-serif text-lg"
            >
              {numero}
            </span>
          </>
        ) : (
          <span aria-hidden="true" className="text-gold/80 font-serif text-5xl">
            {numero}
          </span>
        )}
        {scene.shot ? (
          <span
            aria-hidden="true"
            className="bg-app/80 text-secondary absolute bottom-3 left-3 rounded-md px-2 py-1 text-[0.6875rem]"
          >
            {CADRAGES[scene.shot]}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-secondary text-[0.6875rem] tracking-wide">
          <span className="sr-only">Scène {numero}, </span>
          {enteteScene(scene)}
        </p>
        <h2 className="mt-2 font-serif text-lg leading-snug text-pretty">{scene.title}</h2>
        {episode ? <p className="text-gold mt-1 text-xs">{episodeDeScene(episode)}</p> : null}
        {scene.shot ? <p className="sr-only">Cadrage : {CADRAGES[scene.shot]}</p> : null}
        {scene.description ? (
          <p className="text-secondary mt-2 flex-1 text-sm leading-relaxed text-pretty whitespace-pre-line">
            {scene.description}
          </p>
        ) : (
          <div className="flex-1" />
        )}

        <VignetteProposee
          projetId={projetId}
          sceneId={scene.id}
          numeroScene={numero}
          titreScene={scene.title}
          etape={vignette.etape}
          imageId={vignette.imageId}
          aImage={aImage}
          peutDecider={peutEditer}
        />

        <PlansScene
          projetId={projetId}
          sceneId={scene.id}
          numeroScene={numero}
          cadragePrincipal={scene.shot}
          plans={plans}
          planEnModification={planDeLaScene ? planEnModification : undefined}
          ouvert={decoupageOuvert || planDeLaScene || (montrerAssistant && assistantActif)}
          peutEditer={peutEditer}
          assistant={
            montrerAssistant ? (
              <DecoupagePropose
                projetId={projetId}
                sceneId={scene.id}
                numeroScene={numero}
                etape={assistant.etape}
                plans={assistant.plans}
                peutDecider={peutEditer}
                sansScenario={sansScenario}
              />
            ) : null
          }
        />

        {peutEditer ? (
          <div className="border-app-line mt-5 flex flex-wrap items-center gap-1 border-t pt-4">
            <form action={deplacerScene}>
              <input type="hidden" name="projet" value={projetId} />
              <input type="hidden" name="scene" value={scene.id} />
              <input type="hidden" name="sens" value="haut" />
              <button
                type="submit"
                disabled={index === 0}
                aria-label={`Avancer la scène ${numero}`}
                className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↑
              </button>
            </form>
            <form action={deplacerScene}>
              <input type="hidden" name="projet" value={projetId} />
              <input type="hidden" name="scene" value={scene.id} />
              <input type="hidden" name="sens" value="bas" />
              <button
                type="submit"
                disabled={index === total - 1}
                aria-label={`Reculer la scène ${numero}`}
                className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                ↓
              </button>
            </form>
            <EnvoiImage
              projetId={projetId}
              dossier="scenes"
              champs={{ scene: scene.id }}
              rattacher={definirImageScene}
              retirer={retirerImageScene}
              libelle="l'image"
              aImage={aImage}
              compact
            />
            <Link
              href={`/projets/${projetId}/storyboard?scene=${scene.id}#scene-${scene.id}`}
              className="text-secondary hover:bg-surface-hover hover:text-light ml-auto rounded-full px-3 py-1.5 text-xs transition-colors"
            >
              Modifier
              <span className="sr-only"> la scène {numero}</span>
            </Link>
            <BoutonConfirme
              action={supprimerScene}
              champs={{ projet: projetId, scene: scene.id }}
              libelle="Supprimer"
              confirmation={`Supprimer la scène ${numero}`}
              discret
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
