"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  consigneDe,
  enNombre,
  LIVRABLES_IA,
  unitesTexte,
  type ActionIa,
  type EtapeProposition,
} from "@/lib/propositions";

import {
  annulerProposition,
  appliquerProposition,
  demanderDevis,
  ecarterProposition,
  lancerProposition,
  type Devis,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-navy-line hover:border-light-muted rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Rythme de rafraîchissement tant qu'une proposition se prépare. */
const RAFRAICHISSEMENT_MS = 3000;

/**
 * Une seule boucle de rafraîchissement par page, quel que soit le nombre
 * d'encarts : la page sait lesquels attendent, et n'en rafraîchit la route
 * qu'une fois.
 */
export function RafraichissementPropositions({ actif }: { actif: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!actif) {
      return;
    }
    const minuterie = setInterval(() => router.refresh(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [actif, router]);
  return null;
}

/** Champ de texte de l'éditeur d'un document, quand l'encart se tient sous lui. */
const CHAMP_EDITEUR = "contenu";

const NON_ENREGISTRE =
  "Le document porte des modifications non enregistrées : enregistrez-le d'abord.";

/**
 * Demande de rédaction à l'assistant : devis, confirmation, suivi, puis
 * proposition à comparer, modifier, appliquer ou écarter.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape calculée par la page, et ses boutons ne font qu'appeler des
 * actions qui revérifient chaque droit. Le livrable vient du catalogue, que
 * les actions revalident de leur côté.
 */
export function Proposition({
  projetId,
  action,
  texteActuel,
  precision,
  etape,
  peutAppliquer,
  episodeId,
  contenuEnregistre,
}: {
  projetId: string;
  action: ActionIa;
  texteActuel: string;
  /** Ce que la proposition écrirait précisément — le document visé, par exemple. */
  precision?: string;
  etape: EtapeProposition;
  /** Porteur et éditeurs : un administrateur hors de l'équipe peut demander et écarter, pas appliquer. */
  peutAppliquer: boolean;
  /** Épisode dont on écrit une séquence ; absent, la demande n'en désigne aucun. */
  episodeId?: string;
  /**
   * Donné quand l'encart se tient sous l'éditeur du document qu'il complète :
   * il refuse alors d'agir sur un document non enregistré, et recharge la page
   * après une acceptation — sans quoi l'éditeur réenregistrerait l'ancien texte.
   */
  contenuEnregistre?: string;
}) {
  const livrable = LIVRABLES_IA[action];
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  // Ce que l'équipe précise avant le devis, pour un livrable qui le demande.
  // Le serveur la revalide : elle part chez le fournisseur.
  const consigne = consigneDe(action);
  const [saisie, setSaisie] = useState("");

  const proposition = etape.etape === "proposition" ? etape : null;
  const [texte, setTexte] = useState(proposition?.texte ?? "");
  // Une nouvelle proposition remplace le texte en cours d'édition :
  // ajustement pendant le rendu, sans rendu intermédiaire incohérent.
  const [propositionConnue, setPropositionConnue] = useState(proposition?.propositionId ?? null);
  if ((proposition?.propositionId ?? null) !== propositionConnue) {
    setPropositionConnue(proposition?.propositionId ?? null);
    setTexte(proposition?.texte ?? "");
  }

  function executer(suite: () => Promise<{ erreur: string } | object>, apres?: () => void) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        apres?.();
      }
      router.refresh();
    });
  }

  /** Vrai si l'éditeur de la page affiche autre chose que ce que la base porte. */
  function editeurModifie(): boolean {
    if (contenuEnregistre === undefined) {
      return false;
    }
    const champ = document.getElementById(CHAMP_EDITEUR);
    return (
      champ instanceof HTMLTextAreaElement &&
      champ.value.replaceAll("\r\n", "\n") !== contenuEnregistre.replaceAll("\r\n", "\n")
    );
  }

  function obtenirDevis() {
    setErreur(null);
    if (editeurModifie()) {
      setErreur(NON_ENREGISTRE);
      return;
    }
    demarrer(async () => {
      const resultat = await demanderDevis(
        projetId,
        action,
        consigne ? saisie : undefined,
        episodeId,
      );
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  return (
    <section
      aria-labelledby={`assistant-${action}`}
      className="border-navy-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id={`assistant-${action}`} className="text-sm font-medium">
        Assistant d&apos;écriture : {livrable.titre.toLowerCase()}
      </h2>
      <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">
        {livrable.description} Rien n&apos;est remplacé sans votre accord.
      </p>
      {precision ? (
        <p className="text-light-muted mt-2 text-sm leading-relaxed text-pretty">{precision}</p>
      ) : null}

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-light-muted mt-4 text-sm leading-relaxed">
          La dernière demande n&apos;a pas abouti. Les unités réservées ont été rendues.
        </p>
      ) : null}

      {(etape.etape === "repos" || etape.etape === "echec") && !demande ? (
        <>
          {consigne ? (
            <div className="mt-5">
              <label htmlFor={`consigne-${action}`} className="block text-sm font-medium">
                {consigne.libelle}
              </label>
              <p
                id={`consigne-${action}-aide`}
                className="text-light-muted mt-1 text-sm leading-relaxed text-pretty"
              >
                {consigne.aide}
              </p>
              <textarea
                id={`consigne-${action}`}
                rows={4}
                maxLength={consigne.longueurMax}
                value={saisie}
                onChange={(evenement) => setSaisie(evenement.target.value)}
                aria-describedby={`consigne-${action}-aide consigne-${action}-longueur`}
                className="border-navy-line bg-navy focus:border-gold mt-2 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
              />
              <p id={`consigne-${action}-longueur`} className="text-light-muted mt-1 text-xs">
                {enNombre(saisie.length)} / {enNombre(consigne.longueurMax)} caractères
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={obtenirDevis}
            disabled={enCours || (consigne !== null && !saisie.trim())}
            className={`${BOUTON_PRINCIPAL} mt-5`}
          >
            {enCours ? "Un instant…" : livrable.bouton}
          </button>
        </>
      ) : null}

      {(etape.etape === "repos" || etape.etape === "echec") && demande ? (
        <div className="mt-5">
          {consigne ? (
            <p className="text-light-muted mb-3 text-sm leading-relaxed text-pretty whitespace-pre-line">
              <span className="text-light">{consigne.libelle} :</span> {saisie.trim()}
            </p>
          ) : null}
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
                  () => lancerProposition(projetId, action, demande.devis.id, demande.cle),
                  () => {
                    setDemande(null);
                    setSaisie("");
                  },
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
            Demande enregistrée : la proposition attend d&apos;être rédigée.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerProposition(projetId, action, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Proposition en cours de rédaction…
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-light-muted text-xs tracking-wide uppercase">
                {livrable.remplace}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-pretty whitespace-pre-line">
                {texteActuel || <span className="text-light-muted">Rien pour l&apos;instant.</span>}
              </p>
            </div>
            <div>
              <label
                htmlFor={`proposition-${action}`}
                className="text-light-muted block text-xs tracking-wide uppercase"
              >
                {peutAppliquer ? "Proposition, modifiable" : "Proposition"}
              </label>
              <textarea
                id={`proposition-${action}`}
                rows={livrable.lignes}
                maxLength={livrable.longueurMax}
                readOnly={!peutAppliquer}
                value={texte}
                onChange={(evenement) => setTexte(evenement.target.value)}
                aria-describedby={`proposition-${action}-longueur`}
                className="border-navy-line bg-navy focus:border-gold mt-2 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
              />
              <p id={`proposition-${action}-longueur`} className="text-light-muted mt-1 text-xs">
                {enNombre(texte.length)} / {enNombre(livrable.longueurMax)} caractères
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {peutAppliquer ? (
              <button
                type="button"
                disabled={enCours || !texte.trim()}
                onClick={() => {
                  if (editeurModifie()) {
                    setErreur(NON_ENREGISTRE);
                    return;
                  }
                  executer(
                    () => appliquerProposition(projetId, action, proposition.propositionId, texte),
                    // Sous un éditeur, la page repart du texte enregistré.
                    contenuEnregistre === undefined ? undefined : () => window.location.reload(),
                  );
                }}
                className={BOUTON_PRINCIPAL}
              >
                {enCours ? "Un instant…" : "Utiliser cette proposition"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(() => ecarterProposition(projetId, action, proposition.propositionId))
              }
              className={BOUTON_SECONDAIRE}
            >
              Écarter
            </button>
          </div>
          {peutAppliquer ? null : (
            <p className="text-light-muted mt-3 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet peuvent appliquer une proposition.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
