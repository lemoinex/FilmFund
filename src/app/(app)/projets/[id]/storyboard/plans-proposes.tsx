"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  ANGLES,
  DESCRIPTION_PLAN_MAX,
  DUREE_PLAN_SECONDES,
  FOCALE_MM,
  formaterDureePlan,
  MOUVEMENTS,
} from "@/lib/decoupage";
import {
  bilanPlans,
  enNombre,
  LIVRABLE_DECOUPAGE,
  nombrePlans,
  unitesTexte,
  type EtapeProposition,
  type PlanPropose,
} from "@/lib/propositions";
import { CADRAGES } from "@/lib/storyboard";

import type { Devis } from "../actions-ia";
import {
  accepterPlanPropose,
  accepterPlansRestants,
  annulerPropositionDecoupage,
  demanderDevisDecoupage,
  ecarterPlanPropose,
  ecarterPlansRestants,
  lancerPropositionDecoupage,
  type SaisiePlan,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-4 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-secondary hover:text-light hover:bg-surface-hover rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-app-line bg-app focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

const libelle = (table: Record<string, string>, code: string) => table[code] ?? code;

/**
 * Demande d'un découpage à l'assistant, pour une scène : devis, confirmation,
 * suivi, puis plans à accepter — tels quels ou corrigés — ou à écarter, un à
 * un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les plans lus par la page, et ses boutons ne font qu'appeler des
 * actions qui revérifient chaque droit. Rien n'entre dans le découpage sans
 * une acceptation.
 *
 * Le storyboard se lit de toute l'équipe : un lecteur voit les plans
 * proposés, sans pouvoir en demander ni en décider.
 */
export function DecoupagePropose({
  projetId,
  sceneId,
  numeroScene,
  etape,
  plans,
  peutDecider,
  sansScenario,
}: {
  projetId: string;
  sceneId: string;
  numeroScene: string;
  etape: EtapeProposition;
  /** Plans de la proposition en cours ; vide hors de l'étape « proposition ». */
  plans: PlanPropose[];
  /** Qui écrit le storyboard : porteur, éditeurs, administrateurs. */
  peutDecider: boolean;
  /** Ce que l'assistant n'a pas pour travailler, dit avant la demande ; nul s'il a son scénario. */
  sansScenario: string | null;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  const [enSaisie, setEnSaisie] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const proposition = etape.etape === "proposition" ? etape : null;
  const bilan = bilanPlans(plans);
  const auRepos = etape.etape === "repos" || etape.etape === "echec";
  const titre = `assistant-decoupage-${sceneId}`;

  function executer(
    suite: () => Promise<{ erreur: string } | { ok: true; message?: string }>,
    apres?: () => void,
  ) {
    setErreur(null);
    setSucces(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        if (resultat.message) {
          setSucces(resultat.message);
        }
        apres?.();
      }
      router.refresh();
    });
  }

  function obtenirDevis() {
    setErreur(null);
    setSucces(null);
    demarrer(async () => {
      const resultat = await demanderDevisDecoupage(projetId, sceneId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section aria-labelledby={titre} className="border-app-line mt-5 rounded-lg border p-4">
      <h3 id={titre} className="text-sm font-medium">
        {LIVRABLE_DECOUPAGE.titre}
        <span className="sr-only"> pour la scène {numeroScene}</span>
      </h3>

      {peutDecider && auRepos ? (
        <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
          {LIVRABLE_DECOUPAGE.description} Rien n&apos;entre dans le découpage sans accord, plan par
          plan.
          {sansScenario ? ` ${sansScenario}` : null}
        </p>
      ) : null}

      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
      {succes ? (
        <div className="mt-3">
          <Message ton="succes">{succes}</Message>
        </div>
      ) : null}

      {peutDecider && etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {peutDecider && auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-4`}
        >
          {enCours ? "Un instant…" : LIVRABLE_DECOUPAGE.bouton}
          <span className="sr-only"> pour la scène {numeroScene}</span>
        </button>
      ) : null}

      {peutDecider && auRepos && demande ? (
        <div className="mt-4">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Ce découpage compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerPropositionDecoupage(projetId, demande.devis.id, demande.cle),
                  () => setDemande(null),
                )
              }
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : "Confirmer la demande"}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => setDemande(null)}
              className={BOUTON_SECONDAIRE}
            >
              Renoncer
            </button>
          </div>
        </div>
      ) : null}

      {etape.etape === "en_attente" ? (
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : le découpage attend d&apos;être préparé.
          </p>
          {peutDecider ? (
            <button
              type="button"
              disabled={enCours}
              onClick={() => executer(() => annulerPropositionDecoupage(projetId, etape.tacheId))}
              className={`${BOUTON_SECONDAIRE} mt-3`}
            >
              Annuler la demande
            </button>
          ) : null}
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          Découpage en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-3">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-3 py-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_DECOUPAGE.avertissement}
          </p>

          <p role="status" className="text-secondary mt-3 text-xs leading-relaxed tabular-nums">
            {nombrePlans(bilan.enAttente)} à décider
            {bilan.acceptes ? ` · ${nombrePlans(bilan.acceptes)} au découpage` : ""}
            {bilan.ecartes ? ` · ${nombrePlans(bilan.ecartes)} hors découpage` : ""}
          </p>

          <ol className="mt-3 space-y-4">
            {plans.map((plan, index) => (
              <li key={plan.id} className="border-gold/40 border-l pl-3">
                {plan.state !== "proposed" ? (
                  <div className="opacity-70">
                    <Apercu plan={plan} rang={index + 1} />
                    <p
                      className={`mt-1 text-xs ${plan.state === "accepted" ? "text-gold-bright" : "text-secondary"}`}
                    >
                      {/* Ce qui précède reste ce que l'assistant a proposé : un
                          plan corrigé se lit dans le découpage lui-même. */}
                      {plan.state === "accepted"
                        ? "Ajouté au découpage, tel quel ou corrigé"
                        : "Écarté"}
                    </p>
                  </div>
                ) : plan.id === enSaisie && peutDecider ? (
                  <Correction
                    plan={plan}
                    enCours={enCours}
                    onAnnuler={() => setEnSaisie(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterPlanPropose(projetId, plan.id, saisie),
                        () => setEnSaisie(null),
                      )
                    }
                  />
                ) : (
                  <>
                    <Apercu plan={plan} rang={index + 1} />
                    {peutDecider ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => executer(() => accepterPlanPropose(projetId, plan.id))}
                          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Accepter
                          <span className="sr-only"> le plan proposé {index + 1}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => {
                            setConfirmation(false);
                            setEnSaisie(plan.id);
                          }}
                          className={BOUTON_DISCRET}
                        >
                          Corriger
                          <span className="sr-only"> le plan proposé {index + 1}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => executer(() => ecarterPlanPropose(projetId, plan.id))}
                          className={BOUTON_DISCRET}
                        >
                          Écarter
                          <span className="sr-only"> le plan proposé {index + 1}</span>
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ol>

          {peutDecider && bilan.enAttente > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {confirmation ? (
                <>
                  <button
                    type="button"
                    // Le focus passe sur la confirmation : au clavier, l'action
                    // reste à portée sans chercher le bouton qui vient d'apparaître.
                    autoFocus
                    disabled={enCours}
                    onClick={() =>
                      executer(
                        () => accepterPlansRestants(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours
                      ? "Un instant…"
                      : `Ajouter ${nombrePlans(bilan.enAttente)} au découpage`}
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => setConfirmation(false)}
                    className={BOUTON_SECONDAIRE}
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => {
                      setEnSaisie(null);
                      setConfirmation(true);
                    }}
                    className={BOUTON_PRINCIPAL}
                  >
                    Tout accepter
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() =>
                      executer(() => ecarterPlansRestants(projetId, proposition.propositionId))
                    }
                    className={BOUTON_SECONDAIRE}
                  >
                    Écarter le reste
                  </button>
                </>
              )}
            </div>
          ) : null}
          {peutDecider ? null : (
            <p className="text-secondary mt-3 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet décident des plans proposés.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Apercu({ plan, rang }: { plan: PlanPropose; rang: number }) {
  // Comme pour un plan saisi : seuls les écarts à l'angle normal et au plan
  // fixe sont écrits.
  const precisions = [
    plan.focal_mm !== null ? `${plan.focal_mm} mm` : null,
    plan.angle !== "normal" ? libelle(ANGLES, plan.angle) : null,
    plan.movement !== "fixe" ? libelle(MOUVEMENTS, plan.movement) : null,
    plan.duration_seconds !== null ? formaterDureePlan(plan.duration_seconds) : null,
  ].filter(Boolean);

  return (
    <>
      <p className="text-sm">
        <span className="text-gold tabular-nums">{rang}.</span> {libelle(CADRAGES, plan.shot)}
        {precisions.length ? (
          <span className="text-secondary"> · {precisions.join(" · ")}</span>
        ) : null}
      </p>
      {plan.description ? (
        <p className="text-secondary mt-1 text-sm leading-relaxed text-pretty break-words">
          {plan.description}
        </p>
      ) : null}
    </>
  );
}

/** Correction d'un plan proposé avant de l'accepter : les champs d'un plan saisi. */
function Correction({
  plan,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  plan: PlanPropose;
  enCours: boolean;
  onAccepter: (saisie: SaisiePlan) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisiePlan>({
    cadrage: plan.shot,
    angle: plan.angle,
    mouvement: plan.movement,
    focale: plan.focal_mm?.toString() ?? "",
    duree: plan.duration_seconds?.toString() ?? "",
    description: plan.description,
  });
  const id = `correction-${plan.id}`;
  const changer = (champ: keyof SaisiePlan) => (valeur: string) =>
    setSaisie((actuelle) => ({ ...actuelle, [champ]: valeur }));

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-2 gap-3"
    >
      <Choix
        id={`${id}-cadrage`}
        nom="Cadrage"
        table={CADRAGES}
        valeur={saisie.cadrage}
        onChange={changer("cadrage")}
        large
      />
      <Choix
        id={`${id}-angle`}
        nom="Angle"
        table={ANGLES}
        valeur={saisie.angle}
        onChange={changer("angle")}
      />
      <Choix
        id={`${id}-mouvement`}
        nom="Mouvement"
        table={MOUVEMENTS}
        valeur={saisie.mouvement}
        onChange={changer("mouvement")}
      />
      <div>
        <label htmlFor={`${id}-focale`} className="text-secondary block text-xs">
          Focale, en mm (facultatif)
        </label>
        <input
          id={`${id}-focale`}
          type="text"
          inputMode="numeric"
          maxLength={String(FOCALE_MM.max).length}
          value={saisie.focale}
          onChange={(evenement) => changer("focale")(evenement.target.value)}
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-duree`} className="text-secondary block text-xs">
          Durée, en s (facultatif)
        </label>
        <input
          id={`${id}-duree`}
          type="text"
          inputMode="numeric"
          maxLength={String(DUREE_PLAN_SECONDES.max).length}
          value={saisie.duree}
          onChange={(evenement) => changer("duree")(evenement.target.value)}
          className={CHAMP}
        />
      </div>
      <div className="col-span-2">
        <label htmlFor={`${id}-description`} className="text-secondary block text-xs">
          Ce que montre le plan
        </label>
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={DESCRIPTION_PLAN_MAX}
          value={saisie.description}
          onChange={(evenement) => changer("description")(evenement.target.value)}
          className={`${CHAMP} resize-y leading-relaxed`}
        />
      </div>
      <div className="col-span-2 flex flex-wrap gap-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Ajouter au découpage"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}

function Choix({
  id,
  nom,
  table,
  valeur,
  onChange,
  large = false,
}: {
  id: string;
  nom: string;
  table: Record<string, string>;
  valeur: string;
  onChange: (valeur: string) => void;
  large?: boolean;
}) {
  return (
    <div className={large ? "col-span-2" : undefined}>
      <label htmlFor={id} className="text-secondary block text-xs">
        {nom}
      </label>
      <select
        id={id}
        value={valeur}
        onChange={(evenement) => onChange(evenement.target.value)}
        className={CHAMP}
      >
        {Object.entries(table).map(([code, texte]) => (
          <option key={code} value={code}>
            {texte}
          </option>
        ))}
      </select>
    </div>
  );
}
