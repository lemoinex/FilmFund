"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { CATEGORIES_MATERIEL, DESIGNATION_MAX, PUISSANCE_WATTS, QUANTITE } from "@/lib/materiel";
import { formaterPuissance } from "@/lib/materiel-calculs";
import {
  bilanEquipements,
  enNombre,
  LIVRABLE_MATERIEL,
  nombreEquipements,
  unitesTexte,
  type EquipementPropose,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  accepterEquipementPropose,
  accepterEquipementsRestants,
  annulerPropositionMateriel,
  demanderDevisMateriel,
  ecarterEquipementPropose,
  ecarterEquipementsRestants,
  lancerPropositionMateriel,
  type SaisieEquipement,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-secondary hover:text-light hover:bg-surface-hover rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-app-line bg-app focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

const libelleCategorie = (code: string) =>
  (CATEGORIES_MATERIEL as Record<string, string>)[code] ?? code;

/**
 * Demande de matériel à l'assistant : devis, confirmation, suivi, puis
 * équipements à accepter — tels quels ou corrigés — ou à écarter, un à un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les lignes lues par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Rien n'entre au matériel sans une
 * acceptation.
 *
 * Le matériel se lit de toute l'équipe : un lecteur voit les équipements
 * proposés, sans pouvoir en demander ni en décider.
 */
export function MaterielPropose({
  projetId,
  etape,
  equipements,
  peutDecider,
}: {
  projetId: string;
  etape: EtapeProposition;
  /** Lignes de la proposition en cours ; vide hors de l'étape « proposition ». */
  equipements: EquipementPropose[];
  /** Qui écrit le matériel : porteur, éditeurs, administrateurs. */
  peutDecider: boolean;
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
  const bilan = bilanEquipements(equipements);
  const auRepos = etape.etape === "repos" || etape.etape === "echec";

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
      const resultat = await demanderDevisMateriel(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-materiel"
      className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-materiel" className="text-sm font-medium">
        {LIVRABLE_MATERIEL.titre}
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
        {LIVRABLE_MATERIEL.description} Rien n&apos;entre au matériel sans accord, ligne par ligne.
      </p>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
      {succes ? (
        <div className="mt-4">
          <Message ton="succes">{succes}</Message>
        </div>
      ) : null}

      {peutDecider && etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {peutDecider && auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : LIVRABLE_MATERIEL.bouton}
        </button>
      ) : null}

      {peutDecider && auRepos && demande ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Cette proposition compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerPropositionMateriel(projetId, demande.devis.id, demande.cle),
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
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : la liste attend d&apos;être préparée.
          </p>
          {peutDecider ? (
            <button
              type="button"
              disabled={enCours}
              onClick={() => executer(() => annulerPropositionMateriel(projetId, etape.tacheId))}
              className={`${BOUTON_SECONDAIRE} mt-4`}
            >
              Annuler la demande
            </button>
          ) : null}
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Liste de matériel en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty">
            {LIVRABLE_MATERIEL.avertissement}
          </p>

          <p role="status" className="text-secondary mt-4 text-sm leading-relaxed tabular-nums">
            {nombreEquipements(bilan.enAttente)} à décider
            {bilan.acceptes ? ` · ${nombreEquipements(bilan.acceptes)} au matériel` : ""}
            {bilan.ecartes ? ` · ${nombreEquipements(bilan.ecartes)} hors matériel` : ""}
          </p>

          <ol className="border-app-line mt-4 divide-y divide-[var(--app-line)] rounded-xl border">
            {equipements.map((equipement) => (
              <li key={equipement.id} className="p-4 sm:px-5">
                {equipement.state !== "proposed" ? (
                  <div className="opacity-70">
                    <Apercu equipement={equipement} />
                    <p
                      className={`mt-1 text-right text-xs ${equipement.state === "accepted" ? "text-gold-bright" : "text-secondary"}`}
                    >
                      {/* Ce qui précède reste ce que l'assistant a proposé : une
                          ligne corrigée se lit dans la liste elle-même. */}
                      {equipement.state === "accepted"
                        ? "Ajouté au matériel, tel quel ou corrigé"
                        : "Écarté"}
                    </p>
                  </div>
                ) : equipement.id === enSaisie && peutDecider ? (
                  <Correction
                    equipement={equipement}
                    enCours={enCours}
                    onAnnuler={() => setEnSaisie(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterEquipementPropose(projetId, equipement.id, saisie),
                        () => setEnSaisie(null),
                      )
                    }
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <Apercu equipement={equipement} />
                    {peutDecider ? (
                      <div className="flex w-full flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() =>
                            executer(() => accepterEquipementPropose(projetId, equipement.id))
                          }
                          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Accepter
                          <span className="sr-only"> {equipement.label}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() => {
                            setConfirmation(false);
                            setEnSaisie(equipement.id);
                          }}
                          className={BOUTON_DISCRET}
                        >
                          Corriger
                          <span className="sr-only"> {equipement.label}</span>
                        </button>
                        <button
                          type="button"
                          disabled={enCours}
                          onClick={() =>
                            executer(() => ecarterEquipementPropose(projetId, equipement.id))
                          }
                          className={BOUTON_DISCRET}
                        >
                          Écarter
                          <span className="sr-only"> {equipement.label}</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ol>

          {peutDecider && bilan.enAttente > 0 ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
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
                        () => accepterEquipementsRestants(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours
                      ? "Un instant…"
                      : `Ajouter ${nombreEquipements(bilan.enAttente)} au matériel`}
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
                      executer(() =>
                        ecarterEquipementsRestants(projetId, proposition.propositionId),
                      )
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
            <p className="text-secondary mt-4 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet décident du matériel proposé.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

function Apercu({ equipement }: { equipement: EquipementPropose }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-gold text-xs font-medium">{libelleCategorie(equipement.category)}</p>
      <p className="mt-1 text-sm font-medium break-words">
        {equipement.label}
        {equipement.quantity > 1 ? (
          <span className="text-secondary font-normal"> × {equipement.quantity}</span>
        ) : null}
      </p>
      <p className="text-secondary mt-1 text-xs tabular-nums">
        {equipement.unit_power_watts === null
          ? "Puissance non estimée"
          : equipement.unit_power_watts === 0
            ? "Ne se branche pas"
            : `Puissance estimée : ${formaterPuissance(equipement.unit_power_watts)} l'unité`}
        {equipement.unit_power_watts && !equipement.simultaneous
          ? " · hors charge simultanée"
          : null}
      </p>
    </div>
  );
}

/** Correction d'un équipement proposé avant de l'accepter : les champs d'une ligne saisie. */
function Correction({
  equipement,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  equipement: EquipementPropose;
  enCours: boolean;
  onAccepter: (saisie: SaisieEquipement) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisieEquipement>({
    categorie: equipement.category,
    designation: equipement.label,
    quantite: String(equipement.quantity),
    puissance: equipement.unit_power_watts?.toString() ?? "",
    simultane: equipement.simultaneous,
  });
  const id = `correction-${equipement.id}`;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div>
        <label htmlFor={`${id}-categorie`} className="text-secondary block text-xs">
          Catégorie
        </label>
        <select
          id={`${id}-categorie`}
          value={saisie.categorie}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, categorie: evenement.target.value }))
          }
          className={CHAMP}
        >
          {Object.entries(CATEGORIES_MATERIEL).map(([code, texte]) => (
            <option key={code} value={code}>
              {texte}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${id}-designation`} className="text-secondary block text-xs">
          Désignation
        </label>
        <input
          id={`${id}-designation`}
          type="text"
          required
          maxLength={DESIGNATION_MAX}
          value={saisie.designation}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, designation: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-quantite`} className="text-secondary block text-xs">
          Quantité
        </label>
        <input
          id={`${id}-quantite`}
          type="text"
          inputMode="numeric"
          required
          maxLength={String(QUANTITE.max).length}
          value={saisie.quantite}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, quantite: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-puissance`} className="text-secondary block text-xs">
          Puissance unitaire, en watts (facultatif)
        </label>
        <input
          id={`${id}-puissance`}
          type="text"
          inputMode="numeric"
          maxLength={String(PUISSANCE_WATTS.max).length}
          value={saisie.puissance}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, puissance: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm sm:col-span-2">
        <input
          type="checkbox"
          checked={saisie.simultane}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, simultane: evenement.target.checked }))
          }
          className="accent-gold size-4"
        />
        Fonctionne en même temps que les autres
      </label>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Ajouter au matériel"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}
