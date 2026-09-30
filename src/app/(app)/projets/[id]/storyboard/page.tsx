import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import Image from "next/image";

import { StoryboardIcon } from "@/components/icons";
import { BoutonConfirme } from "@/components/ui/confirmation";
import { EnvoiImage } from "@/components/ui/envoi-image";
import { CADRAGES, enteteScene, numeroScene } from "@/lib/storyboard";
import { liensSignes } from "@/lib/supabase/liens-images";
import { createClient } from "@/lib/supabase/server";

import { definirImageScene, retirerImageScene } from "../images/actions";
import { OngletsProjet } from "../onglets";
import { deplacerScene, supprimerScene } from "./actions";
import { FormulaireScene, type SceneEditable } from "./formulaire";

export const metadata: Metadata = {
  title: "Storyboard — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function StoryboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { id } = await params;
  const { scene: sceneEnModification } = await searchParams;
  const supabase = await createClient();

  const [{ data: projet }, { data: peutEditer }, { data: budget }, { data: scenes }] =
    await Promise.all([
      supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
      supabase.rpc("peut_editer_contenu", { p_project_id: id }),
      supabase.rpc("peut_gerer_budget", { p_project_id: id }),
      supabase
        .from("storyboard_scenes")
        .select("id, title, setting, location, time_of_day, shot, description, image_path")
        .eq("project_id", id)
        .order("position"),
    ]);

  if (!projet) {
    notFound();
  }

  const liste = scenes ?? [];
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
                  <FormulaireScene projetId={projet.id} scene={scene} />
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
            <FormulaireScene projetId={projet.id} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Planche({
  projetId,
  scene,
  image,
  aImage,
  index,
  total,
  peutEditer,
}: {
  projetId: string;
  scene: SceneEditable;
  image: string | null;
  aImage: boolean;
  index: number;
  total: number;
  peutEditer: boolean;
}) {
  const numero = numeroScene(index);

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
        {scene.shot ? <p className="sr-only">Cadrage : {CADRAGES[scene.shot]}</p> : null}
        {scene.description ? (
          <p className="text-secondary mt-2 flex-1 text-sm leading-relaxed text-pretty whitespace-pre-line">
            {scene.description}
          </p>
        ) : (
          <div className="flex-1" />
        )}

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
