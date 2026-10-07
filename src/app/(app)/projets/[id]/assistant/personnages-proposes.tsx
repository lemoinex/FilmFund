"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import { LONGUEURS_PERSONNAGE, ROLES_PERSONNAGE } from "@/lib/fiche";
import {
  bilanPersonnages,
  cleDeNom,
  enNombre,
  LIVRABLE_PERSONNAGES,
  nombrePersonnages,
  unitesTexte,
  type EtapeProposition,
  type PersonnagePropose,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  accepterPersonnagePropose,
  accepterPersonnagesRestants,
  annulerPropositionPersonnages,
  demanderDevisPersonnages,
  ecarterPersonnagePropose,
  ecarterPersonnagesRestants,
  lancerPropositionPersonnages,
  type SaisiePersonnagePropose,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_DISCRET =
  "text-light-muted hover:text-light hover:bg-navy-soft rounded-full px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-navy-line bg-navy focus:border-gold mt-1 w-full rounded-lg border px-3 py-2 text-sm transition-colors outline-none";

const libelleRole = (code: string) => (ROLES_PERSONNAGE as Record<string, string>)[code] ?? code;

/**
 * Demande de personnages à l'assistant : devis, confirmation, suivi, puis
 * personnages à accepter — tels quels ou corrigés — ou à écarter, un à un.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape et les lignes lues par la page, et ses boutons ne font qu'appeler
 * des actions qui revérifient chaque droit. Aucun personnage n'entre au
 * projet sans une acceptation, et aucun personnage existant n'est modifié.
 *
 * L'assistant de création n'existe que pour le porteur et les éditeurs : qui
 * voit cet encart peut en décider.
 */
export function PersonnagesProposes({
  projetId,
  etape,
  personnages,
  nomsExistants,
}: {
  projetId: string;
  etape: EtapeProposition;
  /** Lignes de la proposition en cours ; vide hors de l'étape « proposition ». */
  personnages: PersonnagePropose[];
  /** Noms des personnages déjà au projet, pour signaler un homonyme sans rien refuser. */
  nomsExistants: string[];
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
  const bilan = bilanPersonnages(personnages);
  const auRepos = etape.etape === "repos" || etape.etape === "echec";
  const dejaLa = new Set(nomsExistants.map(cleDeNom));

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
      const resultat = await demanderDevisPersonnages(projetId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby="assistant-personnages"
      className="border-navy-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-personnages" className="text-sm font-medium">
        {LIVRABLE_PERSONNAGES.titre}
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
        {LIVRABLE_PERSONNAGES.description} Aucun n&apos;entre au projet sans votre accord, un à un.
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

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : LIVRABLE_PERSONNAGES.bouton}
        </button>
      ) : null}

      {auRepos && demande ? (
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
                  () => lancerPropositionPersonnages(projetId, demande.devis.id, demande.cle),
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
            Demande enregistrée : les personnages attendent d&apos;être préparés.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerPropositionPersonnages(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Personnages en cours de préparation…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-light-muted mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ; les
          unités restent réservées d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <p className="border-gold/40 bg-gold/10 text-gold-bright rounded-lg border px-4 py-3 text-sm leading-relaxed text-pretty">
            {LIVRABLE_PERSONNAGES.avertissement}
          </p>

          <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed tabular-nums">
            {nombrePersonnages(bilan.enAttente)} à décider
            {bilan.acceptes ? ` · ${nombrePersonnages(bilan.acceptes)} au projet` : ""}
            {bilan.ecartes ? ` · ${nombrePersonnages(bilan.ecartes)} hors projet` : ""}
          </p>

          <ol className="border-navy-line mt-4 divide-y divide-[var(--navy-line)] rounded-xl border">
            {personnages.map((personnage) => (
              <li key={personnage.id} className="p-4 sm:px-5">
                {personnage.state !== "proposed" ? (
                  <div className="opacity-70">
                    <Apercu personnage={personnage} />
                    <p
                      className={`mt-1 text-right text-xs ${personnage.state === "accepted" ? "text-gold-bright" : "text-light-muted"}`}
                    >
                      {/* Ce qui précède reste ce que l'assistant a proposé : un
                          personnage corrigé se lit dans la liste elle-même. */}
                      {personnage.state === "accepted"
                        ? "Ajouté au projet, tel quel ou corrigé"
                        : "Écarté"}
                    </p>
                  </div>
                ) : personnage.id === enSaisie ? (
                  <Correction
                    personnage={personnage}
                    enCours={enCours}
                    onAnnuler={() => setEnSaisie(null)}
                    onAccepter={(saisie) =>
                      executer(
                        () => accepterPersonnagePropose(projetId, personnage.id, saisie),
                        () => setEnSaisie(null),
                      )
                    }
                  />
                ) : (
                  <>
                    <Apercu personnage={personnage} />
                    {dejaLa.has(cleDeNom(personnage.name)) ? (
                      <p className="text-gold-bright mt-2 text-xs leading-relaxed">
                        Un personnage du projet porte déjà ce nom : l&apos;accepter en ajouterait un
                        second, sans toucher au premier.
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() =>
                          executer(() => accepterPersonnagePropose(projetId, personnage.id))
                        }
                        className="bg-gold text-navy hover:bg-gold-bright rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Accepter
                        <span className="sr-only"> {personnage.name}</span>
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() => {
                          setConfirmation(false);
                          setEnSaisie(personnage.id);
                        }}
                        className={BOUTON_DISCRET}
                      >
                        Corriger
                        <span className="sr-only"> {personnage.name}</span>
                      </button>
                      <button
                        type="button"
                        disabled={enCours}
                        onClick={() =>
                          executer(() => ecarterPersonnagePropose(projetId, personnage.id))
                        }
                        className={BOUTON_DISCRET}
                      >
                        Écarter
                        <span className="sr-only"> {personnage.name}</span>
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>

          {bilan.enAttente > 0 ? (
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
                        () => accepterPersonnagesRestants(projetId, proposition.propositionId),
                        () => setConfirmation(false),
                      )
                    }
                    className={BOUTON_PRINCIPAL}
                  >
                    {enCours
                      ? "Un instant…"
                      : `Ajouter ${nombrePersonnages(bilan.enAttente)} au projet`}
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
                        ecarterPersonnagesRestants(projetId, proposition.propositionId),
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
        </div>
      ) : null}
    </section>
  );
}

/** Le personnage tel que l'assistant l'a proposé : du texte, jamais du balisage. */
function Apercu({ personnage }: { personnage: PersonnagePropose }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="min-w-0 font-serif text-lg leading-snug break-words">{personnage.name}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs ${
            personnage.role === "principal" ? "text-gold bg-gold/10" : "bg-navy-soft"
          }`}
        >
          {libelleRole(personnage.role)}
        </span>
      </div>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty break-words whitespace-pre-line">
        {personnage.description}
      </p>
    </div>
  );
}

/** Correction d'un personnage proposé avant de l'accepter : les champs d'un personnage saisi. */
function Correction({
  personnage,
  enCours,
  onAccepter,
  onAnnuler,
}: {
  personnage: PersonnagePropose;
  enCours: boolean;
  onAccepter: (saisie: SaisiePersonnagePropose) => void;
  onAnnuler: () => void;
}) {
  const [saisie, setSaisie] = useState<SaisiePersonnagePropose>({
    nom: personnage.name,
    role: personnage.role,
    description: personnage.description,
  });
  const id = `correction-${personnage.id}`;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        onAccepter(saisie);
      }}
      className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]"
    >
      <div>
        <label htmlFor={`${id}-nom`} className="text-light-muted block text-xs">
          Nom
        </label>
        <input
          id={`${id}-nom`}
          type="text"
          required
          maxLength={LONGUEURS_PERSONNAGE.name}
          value={saisie.nom}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, nom: evenement.target.value }))
          }
          className={CHAMP}
        />
      </div>
      <div>
        <label htmlFor={`${id}-role`} className="text-light-muted block text-xs">
          Rôle
        </label>
        <select
          id={`${id}-role`}
          value={saisie.role}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, role: evenement.target.value }))
          }
          className={CHAMP}
        >
          {Object.entries(ROLES_PERSONNAGE).map(([code, texte]) => (
            <option key={code} value={code}>
              {texte}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-description`} className="text-light-muted block text-xs">
          Description
        </label>
        <textarea
          id={`${id}-description`}
          rows={5}
          maxLength={LONGUEURS_PERSONNAGE.description}
          value={saisie.description}
          onChange={(evenement) =>
            setSaisie((actuelle) => ({ ...actuelle, description: evenement.target.value }))
          }
          className={`${CHAMP} resize-y leading-relaxed`}
        />
      </div>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Ajouter au projet"}
        </button>
        <button type="button" disabled={enCours} onClick={onAnnuler} className={BOUTON_SECONDAIRE}>
          Annuler
        </button>
      </div>
    </form>
  );
}
