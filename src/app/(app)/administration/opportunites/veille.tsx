"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  CATEGORIES_OPPORTUNITE,
  LIVRABLE_VEILLE,
  LONGUEURS_OPPORTUNITE,
  type EtapeVeille,
} from "@/lib/opportunites";

import {
  accepterOpportunite,
  annulerVeille,
  ecarterOpportunite,
  lancerVeille,
  preparerVeille,
} from "./actions-veille";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-4 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:border-secondary rounded-full border px-4 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const CHAMP =
  "border-app-line focus:border-gold mt-1 block w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none";

type Issue = { erreur: string } | { ok: true };

/**
 * Demande d'une veille : la recherche, sa confirmation, le suivi.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape lue par la page, et ses boutons ne font qu'appeler des actions qui
 * revérifient le rôle. Avant tout envoi, il dit ce qui quitte la plateforme —
 * la recherche, et elle seule — et la remontre telle qu'elle partira.
 */
export function DemandeVeille({ etape }: { etape: EtapeVeille }) {
  const router = useRouter();
  const champ = useId();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState("");
  // La recherche telle qu'elle partira, une fois relue par le serveur.
  const [question, setQuestion] = useState<string | null>(null);

  const auRepos =
    etape.etape === "repos" || etape.etape === "echec" || etape.etape === "sans_resultat";

  function executer(suite: () => Promise<Issue>, apres?: () => void) {
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

  function preparer() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await preparerVeille(saisie);
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setQuestion(resultat.question);
      }
    });
  }

  return (
    <div className="border-app-line bg-surface mt-6 rounded-xl border p-5">
      <p className="text-secondary text-xs leading-relaxed text-pretty">
        {LIVRABLE_VEILLE.description}
      </p>
      <p className="text-secondary mt-2 text-xs leading-relaxed text-pretty">
        {LIVRABLE_VEILLE.limites}
      </p>

      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && question === null ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          La dernière veille n&apos;a pas abouti{etape.motif ? ` : ${etape.motif}` : "."} Rien
          n&apos;a été proposé.
        </p>
      ) : null}

      {etape.etape === "sans_resultat" && question === null ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          {etape.texte} Reformulez la recherche, ou précisez un pays, un format ou une année.
        </p>
      ) : null}

      {auRepos && question === null ? (
        <form
          className="mt-4"
          onSubmit={(evenement) => {
            evenement.preventDefault();
            preparer();
          }}
        >
          <label htmlFor={champ} className="block text-xs font-medium">
            Ce que vous cherchez
          </label>
          <textarea
            id={champ}
            value={saisie}
            onChange={(evenement) => setSaisie(evenement.target.value)}
            rows={3}
            minLength={LIVRABLE_VEILLE.questionMin}
            maxLength={LIVRABLE_VEILLE.questionMax}
            required
            aria-describedby={`${champ}-aide`}
            className="border-app-line focus:border-gold mt-2 block w-full rounded-lg border bg-transparent px-3 py-2 text-sm leading-relaxed outline-none"
          />
          <p id={`${champ}-aide`} className="text-light mt-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_VEILLE.transmission}
          </p>
          <button type="submit" disabled={enCours} className={`${BOUTON_PRINCIPAL} mt-4`}>
            {enCours ? "Un instant…" : "Relire avant d'envoyer"}
          </button>
        </form>
      ) : null}

      {auRepos && question !== null ? (
        <div className="mt-4">
          <p className="text-xs font-medium">La recherche qui sera transmise</p>
          <p className="border-app-line mt-2 rounded-lg border px-3 py-2 text-sm leading-relaxed">
            {question}
          </p>
          <p className="text-light mt-2 text-xs leading-relaxed text-pretty">
            {LIVRABLE_VEILLE.transmission}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={() =>
                executer(
                  () => lancerVeille(question),
                  () => {
                    setQuestion(null);
                    setSaisie("");
                  },
                )
              }
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : LIVRABLE_VEILLE.bouton}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => setQuestion(null)}
              className={BOUTON_SECONDAIRE}
            >
              Modifier la recherche
            </button>
          </div>
        </div>
      ) : null}

      {etape.etape === "en_attente" ? (
        <div className="mt-3">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : la veille attend d&apos;être lancée.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerVeille(etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-3`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-3 text-sm leading-relaxed">
          Veille en cours : collecte des pages, puis relevé des opportunités…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-3 text-xs leading-relaxed text-pretty">
          La dernière veille a été interrompue avant sa fin : son issue reste à établir. Vous pouvez
          en demander une autre.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Accepter ou écarter une opportunité proposée. Le nom, l'organisme et la
 * catégorie se corrigent avant d'accepter — l'assistant a pu mal les lire, ou
 * ne pas trouver l'organisme. La page, la date de la collecte et l'extrait ne
 * se corrigent pas.
 */
export function DecisionOpportunite({
  ligneId,
  nom,
  organisme,
  categorie,
  dejaAuCatalogue,
}: {
  ligneId: string;
  nom: string;
  organisme: string;
  categorie: string;
  /** Une fiche porte déjà ce nom chez cet organisme : l'accepter serait refusé. */
  dejaAuCatalogue: boolean;
}) {
  const router = useRouter();
  const p = useId();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState({ nom, organisme, categorie });

  function executer(suite: () => Promise<Issue>) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await suite();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      }
      router.refresh();
    });
  }

  return (
    <form
      className="mt-4"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        executer(() => accepterOpportunite(ligneId, saisie));
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`${p}-nom`} className="text-xs font-medium">
            Nom
          </label>
          <input
            id={`${p}-nom`}
            value={saisie.nom}
            onChange={(evenement) => setSaisie({ ...saisie, nom: evenement.target.value })}
            required
            maxLength={LONGUEURS_OPPORTUNITE.name}
            className={CHAMP}
          />
        </div>
        <div>
          <label htmlFor={`${p}-organisme`} className="text-xs font-medium">
            Organisme
          </label>
          <input
            id={`${p}-organisme`}
            value={saisie.organisme}
            onChange={(evenement) => setSaisie({ ...saisie, organisme: evenement.target.value })}
            required
            maxLength={LONGUEURS_OPPORTUNITE.organization}
            aria-describedby={organisme ? undefined : `${p}-organisme-aide`}
            className={CHAMP}
          />
          {organisme ? null : (
            <p id={`${p}-organisme-aide`} className="text-light mt-1 text-xs leading-relaxed">
              L&apos;extrait ne nomme pas l&apos;organisme : lisez-le sur la page, ne le déduisez
              pas du site.
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${p}-categorie`} className="text-xs font-medium">
            Catégorie
          </label>
          <select
            id={`${p}-categorie`}
            value={saisie.categorie}
            onChange={(evenement) => setSaisie({ ...saisie, categorie: evenement.target.value })}
            required
            className={CHAMP}
          >
            {Object.entries(CATEGORIES_OPPORTUNITE).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dejaAuCatalogue ? (
        <p role="status" className="text-light mt-3 text-xs leading-relaxed text-pretty">
          Une fiche du catalogue porte déjà ce nom chez cet organisme : elle ne peut pas y entrer
          une seconde fois. Écartez cette proposition, ou corrigez le nom si c&apos;est un autre
          appel.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" disabled={enCours} className={BOUTON_PRINCIPAL}>
          {enCours ? "Un instant…" : "Accepter, non vérifiée"}
          <span className="sr-only"> : {nom}</span>
        </button>
        <button
          type="button"
          disabled={enCours}
          onClick={() => executer(() => ecarterOpportunite(ligneId))}
          className={BOUTON_SECONDAIRE}
        >
          Écarter
          <span className="sr-only"> : {nom}</span>
        </button>
      </div>
      {erreur ? (
        <div className="mt-3">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}
    </form>
  );
}
