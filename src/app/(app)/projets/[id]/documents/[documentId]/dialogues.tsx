"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  enNombre,
  LIVRABLE_DIALOGUE,
  unitesTexte,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../../actions-ia";
import {
  annulerDialogue,
  appliquerDialogue,
  demanderDevisDialogue,
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

/** Fins de ligne ramenées à « \n », comme un champ de texte les rend. */
const normaliser = (texte: string) => texte.replaceAll("\r\n", "\n");

function champEditeur(): HTMLTextAreaElement | null {
  const champ = document.getElementById(CHAMP_EDITEUR);
  return champ instanceof HTMLTextAreaElement ? champ : null;
}

/**
 * Demande des dialogues d'une scène : sélection dans le texte, devis,
 * confirmation, suivi, puis scène réécrite à comparer, retoucher, appliquer
 * ou écarter.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant ne transmet que
 * le texte sélectionné, que le serveur retrouve dans le document enregistré.
 *
 * L'éditeur, au-dessus, garde en mémoire le texte qu'il a chargé : appliquer
 * une scène pendant qu'il porte des modifications non enregistrées, puis
 * enregistrer, écraserait la scène tout juste remplacée. L'encart refuse donc
 * d'agir sur un document non enregistré, et recharge la page après une
 * acceptation, pour que l'éditeur reparte du texte à jour.
 */
export function Dialogues({
  projetId,
  documentId,
  contenuEnregistre,
  sceneActuelle,
  etape,
}: {
  projetId: string;
  documentId: string;
  /** Contenu du document tel que la base le porte au chargement de la page. */
  contenuEnregistre: string;
  /** Scène que la proposition en cours remplacerait ; vide hors de cette étape. */
  sceneActuelle: string;
  etape: EtapeProposition;
}) {
  const livrable = LIVRABLE_DIALOGUE;
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché, la clé de sa demande et le passage retenu par le
  // serveur : la clé naît avec le devis et ne change plus.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string; passage: string } | null>(
    null,
  );

  const proposition = etape.etape === "proposition" ? etape : null;
  const [texte, setTexte] = useState(proposition?.texte ?? "");
  // Une nouvelle proposition remplace le texte en cours d'édition :
  // ajustement pendant le rendu, sans rendu intermédiaire incohérent.
  const [propositionConnue, setPropositionConnue] = useState(proposition?.propositionId ?? null);
  if ((proposition?.propositionId ?? null) !== propositionConnue) {
    setPropositionConnue(proposition?.propositionId ?? null);
    setTexte(proposition?.texte ?? "");
  }

  const auRepos = etape.etape === "repos" || etape.etape === "echec";

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

  function obtenirDevis() {
    setErreur(null);
    const champ = champEditeur();
    if (!champ) {
      setErreur("Le texte du scénario est introuvable sur cette page.");
      return;
    }
    if (editeurModifie()) {
      setErreur(NON_ENREGISTRE);
      return;
    }
    const selection = champ.value.slice(champ.selectionStart, champ.selectionEnd);
    if (!selection.trim()) {
      setErreur("Sélectionnez d'abord une scène dans le texte du scénario, ci-dessus.");
      return;
    }
    demarrer(async () => {
      const resultat = await demanderDevisDialogue(projetId, documentId, selection);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({
          devis: resultat.devis,
          cle: crypto.randomUUID(),
          passage: resultat.passage,
        });
      }
    });
  }

  function appliquer(propositionId: string) {
    if (editeurModifie()) {
      setErreur(NON_ENREGISTRE);
      return;
    }
    executer(
      () => appliquerDialogue(projetId, documentId, propositionId, texte),
      // Rechargement complet : l'éditeur repart du texte que la base vient
      // d'écrire, au lieu de garder celui d'avant.
      () => window.location.reload(),
    );
  }

  return (
    <section
      aria-labelledby="assistant-dialogues"
      className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="assistant-dialogues" className="text-sm font-medium">
        Assistant de dialogues : {livrable.titre.toLowerCase()}
      </h2>
      <p className="text-secondary mt-2 text-sm leading-relaxed text-pretty">
        {livrable.description} Rien n&apos;est remplacé sans votre accord, et seule la scène
        sélectionnée l&apos;est.
      </p>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          La dernière demande n&apos;a pas abouti : le scénario a pu changer à cet endroit entre la
          demande et sa préparation. L&apos;unité réservée a été rendue.
        </p>
      ) : null}

      {auRepos && !demande ? (
        <div className="mt-5">
          <p className="text-secondary text-sm leading-relaxed text-pretty">
            Sélectionnez une scène dans le texte ci-dessus — {enNombre(livrable.passageMax)}{" "}
            caractères au plus —, puis demandez ses dialogues. Le document doit être enregistré.
          </p>
          <button
            type="button"
            onClick={obtenirDevis}
            disabled={enCours}
            className={`${BOUTON_PRINCIPAL} mt-4`}
          >
            {enCours ? "Un instant…" : livrable.bouton}
          </button>
        </div>
      ) : null}

      {auRepos && demande ? (
        <div className="mt-5">
          <h3 className="text-secondary text-xs tracking-wide uppercase">Scène retenue</h3>
          <p className="border-app-line mt-2 max-h-64 overflow-y-auto rounded-lg border px-4 py-3 text-sm leading-relaxed whitespace-pre-line">
            {demande.passage}
          </p>
          <p role="status" className="mt-4 text-sm leading-relaxed text-pretty">
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
            Demande enregistrée : la scène attend d&apos;être réécrite. Ne modifiez pas cette scène
            d&apos;ici là.
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
          Dialogues en cours d&apos;écriture…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ;
          l&apos;unité reste réservée d&apos;ici là.
        </p>
      ) : null}

      {proposition ? (
        <div className="mt-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <h3 className="text-secondary text-xs tracking-wide uppercase">Scène actuelle</h3>
              <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">
                {sceneActuelle || (
                  <span className="text-secondary">
                    La scène désignée ne se retrouve plus à cet endroit du scénario.
                  </span>
                )}
              </p>
            </div>
            <div>
              <label
                htmlFor="proposition-dialogues"
                className="text-secondary block text-xs tracking-wide uppercase"
              >
                Scène réécrite, modifiable
              </label>
              <textarea
                id="proposition-dialogues"
                rows={livrable.lignes}
                maxLength={livrable.longueurMax}
                value={texte}
                onChange={(evenement) => setTexte(evenement.target.value)}
                aria-describedby="proposition-dialogues-longueur"
                className="border-app-line bg-app focus:border-gold mt-2 w-full resize-y rounded-lg border px-4 py-3 text-sm leading-relaxed transition-colors outline-none"
              />
              <p id="proposition-dialogues-longueur" className="text-secondary mt-1 text-xs">
                {enNombre(texte.length)} / {enNombre(livrable.longueurMax)} caractères
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours || !texte.trim()}
              onClick={() => appliquer(proposition.propositionId)}
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : "Remplacer la scène"}
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
            Seule la scène désignée est remplacée, et le document en garde une version. Si le
            scénario a changé à cet endroit depuis la demande, le remplacement est refusé.
          </p>
        </div>
      ) : null}
    </section>
  );
}
