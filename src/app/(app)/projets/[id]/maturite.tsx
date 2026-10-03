import Link from "next/link";

import { BarreAvancement } from "@/components/ui/avancement";
import {
  calculerMaturite,
  LIMITE_SCORES_LISTE,
  lireFaits,
  lirePonderations,
  type Maturite,
} from "@/lib/maturite";
import { createClient } from "@/lib/supabase/server";

type ClientServeur = Awaited<ReturnType<typeof createClient>>;

/** Ce que le score mesure : dit partout où il paraît, pour qu'il ne soit pas pris pour un avis. */
const PORTEE = "Ce score mesure ce qui est renseigné dans le projet, pas la qualité de l'écriture.";

/** La dernière version publiée des pondérations : celle qui s'applique. */
function ponderationsEnVigueur(supabase: ClientServeur) {
  return supabase
    .from("readiness_weight_versions")
    .select(
      "version_number, concept, narrative, characters, artistic_vision, feasibility, budget, financing, market, dossier",
    )
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
}

type Chargement =
  /** Le score tient compte du budget : il suit sa règle de lecture. */
  | { etat: "interdit" }
  /** Faits ou pondérations illisibles : aucun score plutôt qu'un score faux. */
  | { etat: "indisponible" }
  | { etat: "calcule"; maturite: Maturite; version: number };

/**
 * Lit les faits du projet et les pondérations en vigueur, puis calcule le
 * score. Rien n'est stocké : il reflète l'état du projet à l'instant.
 *
 * Le droit est revérifié ici, par la fonction dont la RLS se sert : la page
 * qui affiche l'encart n'est pas crue sur parole.
 */
async function chargerMaturite(projetId: string): Promise<Chargement> {
  const supabase = await createClient();
  const [{ data: autorise }, { data: faits }, { data: ponderations }] = await Promise.all([
    supabase.rpc("peut_gerer_budget", { p_project_id: projetId }),
    supabase.rpc("faits_maturite", { p_project_id: projetId }),
    ponderationsEnVigueur(supabase),
  ]);

  if (autorise !== true) {
    return { etat: "interdit" };
  }
  const lus = lireFaits(faits);
  const version = lirePonderations(ponderations);
  if (!lus || !version) {
    return { etat: "indisponible" };
  }
  return {
    etat: "calcule",
    maturite: calculerMaturite(lus, version.poids),
    version: version.version,
  };
}

/**
 * Scores de plusieurs projets, pour les listes : une lecture groupée au lieu
 * de trois requêtes par carte.
 *
 * La base ne rend que les projets dont l'utilisateur gère le budget : les
 * autres n'ont pas d'entrée, et leur carte n'affiche rien. Au-delà de
 * `LIMITE_SCORES_LISTE`, les projets suivants restent sans score — il se lit
 * toujours sur leur page.
 */
export async function chargerScores(projetIds: string[]): Promise<Map<string, number>> {
  const scores = new Map<string, number>();
  const demandes = projetIds.slice(0, LIMITE_SCORES_LISTE);
  if (!demandes.length) {
    return scores;
  }

  const supabase = await createClient();
  const [{ data: lignes }, { data: ponderations }] = await Promise.all([
    supabase.rpc("faits_maturite_projets", { p_project_ids: demandes }),
    ponderationsEnVigueur(supabase),
  ]);

  const version = lirePonderations(ponderations);
  if (!version) {
    return scores;
  }
  for (const ligne of lignes ?? []) {
    const faits = lireFaits(ligne.faits);
    if (faits) {
      scores.set(ligne.project_id, calculerMaturite(faits, version.poids).total);
    }
  }
  return scores;
}

/**
 * Score d'un projet dans une liste. Rien pour un projet sans score : le
 * lecteur d'une équipe, ou un projet au-delà du plafond de la liste.
 */
export function EtiquetteMaturite({
  score,
  className,
}: {
  score: number | undefined;
  className?: string;
}) {
  if (score === undefined) {
    return null;
  }
  return (
    <span className={className}>
      Maturité <span aria-hidden="true">{score} / 100</span>
      <span className="sr-only">{score} sur 100</span>
    </span>
  );
}

function nombreDeManques(maturite: Maturite): number {
  return maturite.criteres.reduce((somme, critere) => somme + critere.manques.length, 0);
}

/**
 * « 1 élément à améliorer », « 4 éléments à améliorer ». Des éléments, et non
 * des points : le mot désigne déjà ceux du score.
 */
function elementsAAmeliorer(nombre: number): string {
  return `${nombre} ${nombre > 1 ? "éléments" : "élément"} à améliorer`;
}

/**
 * Maturité du dossier, sur la page du projet : le score, puis, à la demande,
 * chaque critère avec ce qu'il lui manque.
 *
 * Réservée au porteur, aux éditeurs et aux administrateurs : le score tient
 * compte du budget et du financement, que les lecteurs de l'équipe ne lisent
 * pas.
 */
export async function MaturiteDuDossier({ projetId }: { projetId: string }) {
  const chargement = await chargerMaturite(projetId);
  if (chargement.etat === "interdit") {
    return null;
  }

  return (
    <section
      id="maturite"
      aria-labelledby="maturite-titre"
      className="border-navy-line mt-10 scroll-mt-6 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="maturite-titre" className="text-sm font-medium">
          Maturité du dossier
        </h2>
        {chargement.etat === "calcule" ? (
          <p className="text-gold text-sm tabular-nums">{chargement.maturite.total} / 100</p>
        ) : (
          <p className="text-light-muted text-sm">Indisponible</p>
        )}
      </div>

      {chargement.etat === "calcule" ? (
        <>
          <div className="mt-4">
            <BarreAvancement
              pourcent={chargement.maturite.total}
              libelle="Maturité du dossier, sur 100"
            />
          </div>
          <p className="text-light-muted mt-3 text-xs leading-relaxed text-pretty">{PORTEE}</p>

          <details className="mt-4">
            <summary className="hover:text-gold cursor-pointer text-sm transition-colors">
              Détail par critère
              {nombreDeManques(chargement.maturite) ? (
                <span className="text-light-muted">
                  {" "}
                  — {elementsAAmeliorer(nombreDeManques(chargement.maturite))}
                </span>
              ) : null}
            </summary>
            <ul className="border-navy-line mt-3 divide-y divide-[var(--navy-line)] border-t">
              {chargement.maturite.criteres.map((critere) => (
                <li key={critere.code} className="py-3">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <span>{critere.libelle}</span>
                    <span className="tabular-nums">
                      {critere.points} / {critere.maximum}
                    </span>
                  </div>
                  {critere.manques.length ? (
                    <ul className="text-light-muted mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                      {critere.manques.map((manque) => (
                        <li key={manque}>{manque}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-light-muted mt-1.5 text-xs">Rien à ajouter.</p>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-light-muted mt-3 text-xs">
              Pondérations : version {chargement.version}.
            </p>
          </details>
        </>
      ) : (
        <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
          Le score n&apos;a pas pu être calculé. Rechargez la page dans un instant.
        </p>
      )}
    </section>
  );
}

/**
 * Maturité du dossier, sur le tableau de bord : le score seul, et le chemin
 * vers son détail.
 */
export async function ScoreMaturite({ projetId }: { projetId: string }) {
  const chargement = await chargerMaturite(projetId);
  if (chargement.etat === "interdit") {
    return null;
  }

  const manques = chargement.etat === "calcule" ? nombreDeManques(chargement.maturite) : 0;

  return (
    <section
      aria-labelledby="maturite-titre"
      className="border-app-line bg-surface mt-6 rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="maturite-titre" className="text-sm font-medium">
          Maturité du dossier
        </h3>
        {chargement.etat === "calcule" ? (
          <p className="text-gold text-sm tabular-nums">{chargement.maturite.total} / 100</p>
        ) : (
          <p className="text-secondary text-sm">Indisponible</p>
        )}
      </div>
      <div className="mt-4">
        {chargement.etat === "calcule" ? (
          <BarreAvancement
            pourcent={chargement.maturite.total}
            libelle="Maturité du dossier, sur 100"
          />
        ) : (
          <div aria-hidden="true" className="bg-app-line/60 h-2 rounded-full" />
        )}
      </div>
      <div className="text-secondary mt-3 flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs">
        <p className="text-pretty">
          {chargement.etat === "calcule"
            ? PORTEE
            : "Le score n'a pas pu être calculé. Rechargez la page dans un instant."}
        </p>
        {chargement.etat === "calcule" ? (
          <Link
            href={`/projets/${projetId}#maturite`}
            className="text-gold hover:text-gold-bright transition-colors"
          >
            {manques ? elementsAAmeliorer(manques) : "Voir le détail"}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
