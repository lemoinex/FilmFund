"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  enNombre,
  LIVRABLE_VIGNETTE,
  unitesImage,
  type EtapeProposition,
} from "@/lib/propositions";

import type { Devis } from "../actions-ia";
import {
  accepterVignette,
  annulerVignette,
  demanderDevisVignette,
  ecarterVignette,
  lancerVignette,
} from "./actions-image";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-4 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Demande d'une vignette à l'assistant, pour une scène : devis, confirmation,
 * suivi, puis croquis à accepter ou à écarter.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape lue par la page, et ses boutons ne font qu'appeler des actions qui
 * revérifient chaque droit. Accepter est le seul geste qui change l'image
 * d'une scène ; si elle en porte déjà une, le remplacement est dit en clair
 * et demande un second clic.
 *
 * Le storyboard se lit de toute l'équipe : un lecteur voit la vignette
 * proposée, sans pouvoir en demander ni en décider.
 */
export function VignetteProposee({
  projetId,
  sceneId,
  numeroScene,
  titreScene,
  etape,
  imageId,
  aImage,
  peutDecider,
}: {
  projetId: string;
  sceneId: string;
  numeroScene: string;
  titreScene: string;
  etape: EtapeProposition;
  /** Vignette qui attend une décision ; null hors de l'étape « proposition ». */
  imageId: string | null;
  /** La scène porte déjà une image : l'accepter la remplacerait. */
  aImage: boolean;
  /** Qui écrit le storyboard : porteur, éditeurs, administrateurs. */
  peutDecider: boolean;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  // Le devis affiché et la clé de sa demande : la clé naît avec le devis et
  // ne change plus, si bien qu'un double clic ne réserve qu'une fois.
  const [demande, setDemande] = useState<{ devis: Devis; cle: string } | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  const auRepos = etape.etape === "repos" || etape.etape === "echec";
  const proposee = etape.etape === "proposition" && imageId !== null;
  const titre = `assistant-vignette-${sceneId}`;

  function executer(suite: () => Promise<{ erreur: string } | { ok: true }>, apres?: () => void) {
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

  function obtenirDevis() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await demanderDevisVignette(projetId, sceneId);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  // Un lecteur n'a rien à voir tant qu'aucune vignette n'attend.
  if (!peutDecider && !proposee) {
    return null;
  }

  return (
    <section aria-labelledby={titre} className="border-app-line mt-5 rounded-lg border p-4">
      <h3 id={titre} className="text-sm font-medium">
        {LIVRABLE_VIGNETTE.titre}
        <span className="sr-only"> pour la scène {numeroScene}</span>
      </h3>

      {peutDecider && auRepos ? (
        <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
          {LIVRABLE_VIGNETTE.description} Rien ne change l&apos;image de la scène sans votre accord.
        </p>
      ) : null}

      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {peutDecider && etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed">
          La dernière demande n&apos;a pas abouti. L&apos;image réservée a été rendue.
        </p>
      ) : null}

      {peutDecider && auRepos && !demande ? (
        <button
          type="button"
          onClick={obtenirDevis}
          disabled={enCours}
          className={`${BOUTON_PRINCIPAL} mt-4`}
        >
          {enCours ? "Un instant…" : LIVRABLE_VIGNETTE.bouton}
          <span className="sr-only"> pour la scène {numeroScene}</span>
        </button>
      ) : null}

      {peutDecider && auRepos && demande ? (
        <div className="mt-4">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Cette vignette compte {unitesImage(demande.devis.quantite)}. Il en reste{" "}
            {enNombre(demande.devis.disponible)} sur {enNombre(demande.devis.allocation)} pour la
            période en cours.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerVignette(projetId, demande.devis.id, demande.cle),
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
            Demande enregistrée : la vignette attend d&apos;être dessinée.
          </p>
          {peutDecider ? (
            <button
              type="button"
              disabled={enCours}
              onClick={() => executer(() => annulerVignette(projetId, etape.tacheId))}
              className={`${BOUTON_SECONDAIRE} mt-3`}
            >
              Annuler la demande
            </button>
          ) : null}
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          Vignette en cours de dessin…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ;
          l&apos;image reste réservée d&apos;ici là.
        </p>
      ) : null}

      {proposee ? (
        <div className="mt-3">
          {/*
           * Servie par sa route, sous la session : la vignette n'est pas
           * encore dans le stockage, et aucun lien signé n'y mène. Fond blanc :
           * c'est celui du croquis, quel que soit le thème de l'écran.
           */}
          <div className="border-app-line relative aspect-[3/2] overflow-hidden rounded-md border bg-white">
            <Image
              src={`/projets/${projetId}/storyboard/vignettes/${imageId}`}
              alt={`Vignette proposée pour la scène ${numeroScene} : ${titreScene}`}
              fill
              unoptimized
              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-contain"
            />
          </div>
          <p className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
            {LIVRABLE_VIGNETTE.avertissement}
          </p>

          {peutDecider ? (
            <>
              {aImage ? (
                <p className="border-gold/40 bg-gold/10 text-gold-bright mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed text-pretty">
                  {LIVRABLE_VIGNETTE.remplacement}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
                          () => accepterVignette(projetId, imageId),
                          () => setConfirmation(false),
                        )
                      }
                      className={BOUTON_PRINCIPAL}
                    >
                      {enCours ? "Un instant…" : "Remplacer l'image de la scène"}
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
                      // Une image déjà en place ne se remplace qu'après un second clic.
                      onClick={() =>
                        aImage
                          ? setConfirmation(true)
                          : executer(() => accepterVignette(projetId, imageId))
                      }
                      className={BOUTON_PRINCIPAL}
                    >
                      {enCours ? "Un instant…" : "Accepter"}
                      <span className="sr-only"> la vignette de la scène {numeroScene}</span>
                    </button>
                    <button
                      type="button"
                      disabled={enCours}
                      onClick={() => executer(() => ecarterVignette(projetId, imageId))}
                      className={BOUTON_SECONDAIRE}
                    >
                      Écarter
                      <span className="sr-only"> la vignette de la scène {numeroScene}</span>
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <p className="text-secondary mt-3 text-xs leading-relaxed">
              Seuls le porteur et les éditeurs du projet décident de la vignette proposée.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
