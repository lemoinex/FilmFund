"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  enNombre,
  LIVRABLES_RETOUCHE,
  RETOUCHE,
  unitesTexte,
  type ActionRetouche,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../../actions-ia";
import {
  annulerDialogue,
  appliquerRetouche,
  demanderDevisRetouche,
  ecarterDialogue,
  lancerDialogue,
} from "./actions-ia";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Champ de texte de l'éditeur du document, sur la même page. */
const CHAMP_EDITEUR = "contenu";

const NON_ENREGISTRE =
  "Le document porte des modifications non enregistrées : enregistrez-le d'abord.";

const ACTIONS = Object.keys(LIVRABLES_RETOUCHE) as ActionRetouche[];

/** Fins de ligne ramenées à « \n », comme un champ de texte les rend. */
const normaliser = (texte: string) => texte.replaceAll("\r\n", "\n");

function champEditeur(): HTMLTextAreaElement | null {
  const champ = document.getElementById(CHAMP_EDITEUR);
  return champ instanceof HTMLTextAreaElement ? champ : null;
}

/**
 * Retouche d'un passage : sélection dans le texte, choix de la retouche,
 * devis, confirmation, suivi, puis passage retouché à comparer, reprendre,
 * appliquer ou écarter.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant ne transmet que
 * le texte sélectionné et le nom de la retouche, que le serveur n'admet que
 * parmi les quatre du catalogue.
 *
 * Comme l'encart des dialogues, celui-ci refuse d'agir sur un document non
 * enregistré, et recharge la page après une acceptation : l'éditeur, au-dessus,
 * garde en mémoire le texte qu'il a chargé, et enregistrer ensuite écraserait
 * le passage tout juste remplacé.
 */
export function Retouches({
  projetId,
  documentId,
  contenuEnregistre,
  passageActuel,
  actionEnCours,
  etape,
}: {
  projetId: string;
  documentId: string;
  /** Contenu du document tel que la base le porte au chargement de la page. */
  contenuEnregistre: string;
  /** Passage que la proposition en cours remplacerait ; vide hors de cette étape. */
  passageActuel: string;
  /** La retouche de la dernière demande, si elle est connue. */
  actionEnCours: ActionRetouche | null;
  etape: EtapeProposition;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché, la retouche choisie, la clé de la demande et le passage
  // retenu par le serveur : la clé naît avec le devis et ne change plus.
  const [demande, setDemande] = useState<{
    action: ActionRetouche;
    devis: Devis;
    cle: string;
    passage: string;
  } | null>(null);

  const proposition = etape.etape === "proposition" && actionEnCours ? etape : null;
  const [texte, setTexte] = useState(proposition?.texte ?? "");
  // Une nouvelle proposition remplace le texte en cours d'édition :
  // ajustement pendant le rendu, sans rendu intermédiaire incohérent.
  const [propositionConnue, setPropositionConnue] = useState(proposition?.propositionId ?? null);
  if ((proposition?.propositionId ?? null) !== propositionConnue) {
    setPropositionConnue(proposition?.propositionId ?? null);
    setTexte(proposition?.texte ?? "");
  }

  const auRepos = etape.etape === "repos" || etape.etape === "echec";
  const nomEnCours = actionEnCours
    ? LIVRABLES_RETOUCHE[actionEnCours].bouton.toLowerCase()
    : "retoucher";

  /** Vrai si l'éditeur affiche autre chose que ce que la base porte. */
  function editeurModifie(): boolean {
    const champ = champEditeur();
    return champ !== null && normaliser(champ.value) !== normaliser(contenuEnregistre);
  }

  function executer(suite: () => Promise<{ erreur: string } | object>, apres?: () => void) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
        router.refresh();
      } else if (apres) {
        apres();
      } else {
        router.refresh();
      }
    });
  }

  function obtenirDevis(action: ActionRetouche) {
    setErreur(null);
    const champ = champEditeur();
    if (!champ) {
      setErreur("Le texte du document est introuvable sur cette page.");
      return;
    }
    if (editeurModifie()) {
      setErreur(NON_ENREGISTRE);
      return;
    }
    const selection = champ.value.slice(champ.selectionStart, champ.selectionEnd);
    if (!selection.trim()) {
      setErreur("Sélectionnez d'abord un passage dans le texte du document, ci-dessus.");
      return;
    }
    demarrer(async () => {
      const resultat = await demanderDevisRetouche(projetId, documentId, action, selection);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({
          action,
          devis: resultat.devis,
          cle: crypto.randomUUID(),
          passage: resultat.passage,
        });
      }
    });
  }

  function appliquer(propositionId: string, action: ActionRetouche) {
    if (editeurModifie()) {
      setErreur(NON_ENREGISTRE);
      return;
    }
    executer(
      () => appliquerRetouche(projetId, documentId, propositionId, action, texte),
      // Rechargement complet : l'éditeur repart du texte que la base vient
      // d'écrire, au lieu de garder celui d'avant.
      () => window.location.reload(),
    );
  }

  return (
    <section
      aria-labelledby="assistant-retouches"
      className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-retouches" className="text-sm font-medium">
        Assistant d&apos;écriture : {RETOUCHE.titre.toLowerCase()}
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
        {RETOUCHE.description}
      </p>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          La dernière demande n&apos;a pas abouti : le document a pu changer à cet endroit entre la
          demande et sa préparation. L&apos;unité réservée a été rendue.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <div className="mt-5">
          <p className="text-secondary text-sm leading-relaxed text-pretty">
            Sélectionnez un passage dans le texte ci-dessus — {enNombre(RETOUCHE.passageMax)}{" "}
            caractères au plus —, puis choisissez une retouche. Le document doit être enregistré.
          </p>
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ACTIONS.map((action) => (
              <li key={action} className="border-app-line rounded-lg border p-4">
                <button
                  type="button"
                  onClick={() => obtenirDevis(action)}
                  disabled={enCours}
                  aria-describedby={`retouche-${action}`}
                  className={BOUTON_SECONDAIRE}
                >
                  {LIVRABLES_RETOUCHE[action].bouton}
                </button>
                <p
                  id={`retouche-${action}`}
                  className="text-secondary mt-3 text-xs leading-relaxed text-pretty"
                >
                  {LIVRABLES_RETOUCHE[action].effet}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {auRepos && demande ? (
        <div className="mt-5">
          <h3 className="text-secondary text-xs tracking-wide uppercase">
            Passage retenu, à {LIVRABLES_RETOUCHE[demande.action].bouton.toLowerCase()}
          </h3>
          <p className="border-app-line mt-2 max-h-64 overflow-y-auto rounded-lg border px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
            {demande.passage}
          </p>
          <p role="status" className="mt-4 text-sm leading-relaxed text-pretty">
            Cette retouche compte {unitesTexte(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerDialogue(projetId, documentId, demande.devis.id, demande.cle),
                  () => {
                    setDemande(null);
                    router.refresh();
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
            Demande enregistrée ({nomEnCours}) : le passage attend d&apos;être retouché. Ne le
            modifiez pas d&apos;ici là.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerDialogue(projetId, documentId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Retouche en cours ({nomEnCours})…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ;
          l&apos;unité reste réservée d&apos;ici là.
        </p>
      ) : null}

      {proposition && actionEnCours ? (
        <div className="mt-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-secondary text-xs tracking-wide uppercase">Passage actuel</h3>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                {passageActuel || (
                  <span className="text-secondary">
                    Le passage désigné ne se retrouve plus à cet endroit du document.
                  </span>
                )}
              </p>
              {passageActuel ? (
                <p className="text-secondary mt-1 text-xs">
                  {enNombre([...passageActuel].length)} caractères
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="proposition-retouche"
                className="text-secondary block text-xs tracking-wide uppercase"
              >
                Passage proposé ({nomEnCours}), modifiable
              </label>
              <textarea
                id="proposition-retouche"
                rows={RETOUCHE.lignes}
                maxLength={LIVRABLES_RETOUCHE[actionEnCours].longueurMax}
                value={texte}
                onChange={(evenement) => setTexte(evenement.target.value)}
                aria-describedby="proposition-retouche-longueur"
                className="border-app-line bg-app focus:border-gold mt-2 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
              />
              <p id="proposition-retouche-longueur" className="text-secondary mt-1 text-xs">
                {enNombre([...texte].length)} /{" "}
                {enNombre(LIVRABLES_RETOUCHE[actionEnCours].longueurMax)} caractères
              </p>
            </div>
          </div>

          {/* Dit en toutes lettres : rien ne garantit qu'une retouche tienne sa promesse de longueur. */}
          {passageActuel ? (
            <p role="status" className="mt-4 text-sm leading-relaxed text-pretty">
              {comparerLongueurs([...passageActuel].length, [...texte].length)}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours || !texte.trim()}
              onClick={() => appliquer(proposition.propositionId, actionEnCours)}
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : "Remplacer le passage"}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(() => ecarterDialogue(projetId, documentId, proposition.propositionId))
              }
              className={BOUTON_SECONDAIRE}
            >
              Écarter
            </button>
          </div>
          <p className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
            Seul le passage désigné est remplacé, et le document en garde une version. Si le
            document a changé à cet endroit depuis la demande, le remplacement est refusé.
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** « Le passage proposé est plus court de 42 caractères. » */
function comparerLongueurs(actuel: number, propose: number): string {
  const ecart = propose - actuel;
  if (ecart === 0) {
    return "Le passage proposé a la même longueur que le passage actuel.";
  }
  const nombre = Math.abs(ecart);
  return `Le passage proposé est plus ${ecart < 0 ? "court" : "long"} de ${enNombre(nombre)} ${
    nombre > 1 ? "caractères" : "caractère"
  }.`;
}
