import Link from "next/link";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { ANGLES, formaterDureePlan, MOUVEMENTS, resumeDecoupage } from "@/lib/decoupage";
import { CADRAGES } from "@/lib/storyboard";
import type { ShotType } from "@/lib/supabase/types";

import { deplacerPlan, supprimerPlan } from "./actions";
import { FormulairePlan, type PlanEditable } from "./formulaire-plan";

/**
 * Découpage technique d'une scène : la liste de ses plans, repliée sous la
 * planche pour ne pas alourdir le storyboard.
 *
 * Le cadrage que porte la scène reste son cadrage principal ; les plans
 * s'ajoutent à côté, et rien ici ne touche à la scène.
 */
export function PlansScene({
  projetId,
  sceneId,
  numeroScene,
  cadragePrincipal,
  plans,
  planEnModification,
  ouvert,
  peutEditer,
}: {
  projetId: string;
  sceneId: string;
  numeroScene: string;
  cadragePrincipal: ShotType | null;
  plans: PlanEditable[];
  planEnModification?: string;
  ouvert: boolean;
  peutEditer: boolean;
}) {
  // Un lecteur n'a rien à ouvrir tant qu'aucun plan n'est décrit.
  if (!plans.length && !peutEditer) {
    return null;
  }

  return (
    // `open` n'est posé que pour ouvrir : le laisser indéfini rend au
    // navigateur le soin de garder le volet tel que la personne l'a laissé.
    <details className="border-app-line mt-5 border-t pt-4" open={ouvert || undefined}>
      <summary className="hover:text-light cursor-pointer text-sm transition-colors">
        Découpage
        <span className="text-secondary"> · {resumeDecoupage(plans)}</span>
        <span className="sr-only"> de la scène {numeroScene}</span>
      </summary>

      {plans.length ? (
        <ol className="mt-4 space-y-4">
          {plans.map((plan, index) => (
            <li key={plan.id} className="border-app-line border-l pl-3">
              {plan.id === planEnModification && peutEditer ? (
                <FormulairePlan projetId={projetId} sceneId={sceneId} plan={plan} />
              ) : (
                <LignePlan
                  projetId={projetId}
                  sceneId={sceneId}
                  plan={plan}
                  index={index}
                  total={plans.length}
                  peutEditer={peutEditer}
                />
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {peutEditer && !planEnModification ? (
        <div className="mt-5">
          <p className="text-secondary mb-3 text-xs">Nouveau plan, à la fin de la scène.</p>
          <FormulairePlan
            projetId={projetId}
            sceneId={sceneId}
            cadrageParDefaut={plans.length ? null : cadragePrincipal}
          />
        </div>
      ) : null}
    </details>
  );
}

function LignePlan({
  projetId,
  sceneId,
  plan,
  index,
  total,
  peutEditer,
}: {
  projetId: string;
  sceneId: string;
  plan: PlanEditable;
  index: number;
  total: number;
  peutEditer: boolean;
}) {
  const numero = index + 1;
  // L'angle normal et le plan fixe sont le cas courant : seuls les écarts
  // sont écrits, pour que la ligne reste lisible.
  const precisions = [
    plan.focal_mm !== null ? `${plan.focal_mm} mm` : null,
    plan.angle !== "normal" ? ANGLES[plan.angle] : null,
    plan.movement !== "fixe" ? MOUVEMENTS[plan.movement] : null,
    plan.duration_seconds !== null ? formaterDureePlan(plan.duration_seconds) : null,
  ].filter(Boolean);

  return (
    <>
      <p className="text-sm">
        <span className="text-gold tabular-nums">{numero}.</span> {CADRAGES[plan.shot]}
        {precisions.length ? (
          <span className="text-secondary"> · {precisions.join(" · ")}</span>
        ) : null}
      </p>
      {plan.description ? (
        <p className="text-secondary mt-1 text-sm leading-relaxed text-pretty whitespace-pre-line">
          {plan.description}
        </p>
      ) : null}

      {peutEditer ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {(["haut", "bas"] as const).map((sens) => (
            <form key={sens} action={deplacerPlan}>
              <input type="hidden" name="projet" value={projetId} />
              <input type="hidden" name="plan" value={plan.id} />
              <input type="hidden" name="sens" value={sens} />
              <button
                type="submit"
                disabled={sens === "haut" ? index === 0 : index === total - 1}
                aria-label={`${sens === "haut" ? "Avancer" : "Reculer"} le plan ${numero}`}
                className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sens === "haut" ? "↑" : "↓"}
              </button>
            </form>
          ))}
          <Link
            href={`/projets/${projetId}/storyboard?plan=${plan.id}#scene-${sceneId}`}
            className="text-secondary hover:bg-surface-hover hover:text-light ml-auto rounded-full px-3 py-1.5 text-xs transition-colors"
          >
            Modifier
            <span className="sr-only"> le plan {numero}</span>
          </Link>
          <BoutonConfirme
            action={supprimerPlan}
            champs={{ projet: projetId, plan: plan.id }}
            libelle="Supprimer"
            confirmation={`Supprimer le plan ${numero}`}
            discret
          />
        </div>
      ) : null}
    </>
  );
}
