"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { TexteMisEnForme } from "@/components/texte-mis-en-forme";
import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  AIDE_BROUILLON,
  brouillonASauver,
  DELAI_BROUILLON_MS,
  documentEnregistreDepuis,
  type Brouillon,
} from "@/lib/brouillons";
import { AIDE_MISE_EN_FORME, estMisEnForme } from "@/lib/mise-en-forme";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";
import {
  compterMots,
  CONTENU_DOCUMENT_MAX,
  libelleMots,
  ORDRE_TYPES,
  STATUTS_DOCUMENT,
  TITRE_DOCUMENT_MAX,
  TYPES_DOCUMENT,
} from "@/lib/documents";
import type { DocumentStatus, DocumentType } from "@/lib/supabase/types";

import {
  abandonnerBrouillon,
  creerDocument,
  enregistrerBrouillon,
  enregistrerDocument,
  restaurerVersion,
  type EtatDocument,
  type EtatRestauration,
} from "./actions";
import { BarreOutils } from "./barre-outils";

const CLASSES_SELECT =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export function FormulaireNouveauDocument({
  projetId,
  typeParDefaut = "note_intention",
}: {
  projetId: string;
  typeParDefaut?: DocumentType;
}) {
  const [etat, action, enCours] = useActionState<EtatDocument, FormData>(creerDocument, null);
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);
  const [type, setType] = useState<DocumentType>(typeParDefaut);

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />

      {message && "erreur" in message ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="nouveau-type" className="mb-2 block text-sm font-medium">
            Type de document
          </label>
          <select
            id="nouveau-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            aria-describedby="nouveau-type-aide"
            className={CLASSES_SELECT}
          >
            {ORDRE_TYPES.map((valeur) => (
              <option key={valeur} value={valeur}>
                {TYPES_DOCUMENT[valeur].libelle}
              </option>
            ))}
          </select>
          <p id="nouveau-type-aide" className="text-secondary mt-2 text-xs leading-relaxed">
            {TYPES_DOCUMENT[type].description}
          </p>
        </div>

        <Field
          label="Titre"
          name="titre"
          id="nouveau-titre"
          maxLength={TITRE_DOCUMENT_MAX}
          placeholder={TYPES_DOCUMENT[type].libelle}
          aide="Laissé vide, le type sert de titre."
        />
      </div>

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>Créer le document</SubmitButton>
      </div>
    </form>
  );
}

/**
 * Restauration d'une version. Sans confirmation : rien ne se perd, le texte
 * actuel restant dans l'historique.
 */
export function FormulaireRestauration({
  projetId,
  documentId,
  versionId,
}: {
  projetId: string;
  documentId: string;
  versionId: string;
}) {
  const [etat, action, enCours] = useActionState<EtatRestauration, FormData>(
    restaurerVersion,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projet" value={projetId} />
      <input type="hidden" name="document" value={documentId} />
      <input type="hidden" name="version" value={versionId} />

      {etat ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>Restaurer cette version</SubmitButton>
      </div>
    </form>
  );
}

export type DocumentEditable = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  content: string;
};

/**
 * Éditeur d'un document.
 *
 * Champs contrôlés : le compteur de mots suit la frappe, et l'on sait si
 * des modifications attendent d'être enregistrées. Dans ce cas, quitter la
 * page déclenche l'avertissement du navigateur — perdre une note
 * d'intention d'une heure pour un clic égaré ne se rattrape pas.
 *
 * Sauvegarde automatique : quelques secondes après la dernière frappe, le
 * titre et le texte partent dans le brouillon du compte. Le document n'est
 * pas touché et aucune version n'est créée : cela reste le rôle du bouton.
 * Un brouillon trouvé à l'ouverture est proposé, jamais appliqué d'office.
 */
export function EditeurDocument({
  projetId,
  document,
  brouillon,
  derniereVersion,
}: {
  projetId: string;
  document: DocumentEditable;
  /** Le brouillon du compte, s'il diffère du document. */
  brouillon: Brouillon | null;
  /** Numéro de la dernière version du document ; zéro s'il n'en a pas. */
  derniereVersion: number;
}) {
  const [etat, action, enCours] = useActionState<EtatDocument, FormData>(enregistrerDocument, null);
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  const [titre, setTitre] = useState(document.title);
  const [type, setType] = useState(document.type);
  const [statut, setStatut] = useState(document.status);
  const [contenu, setContenu] = useState(document.content);
  const zone = useRef<HTMLTextAreaElement>(null);
  const [apercu, setApercu] = useState(false);
  // Un scénario garde son texte brut : ni barre d'outils, ni aperçu.
  const misEnForme = estMisEnForme(type);

  // Dernière version enregistrée : la référence pour savoir s'il reste des
  // modifications en attente.
  const [enregistre, setEnregistre] = useState(document);
  // Valeurs envoyées au dernier enregistrement. On les capture à l'envoi et
  // non à la réponse : ce qui est tapé pendant l'enregistrement n'est pas
  // enregistré, et doit rester signalé comme tel.
  const [envoye, setEnvoye] = useState(document);
  const [etatTraite, setEtatTraite] = useState<EtatDocument>(null);

  // Le brouillon trouvé à l'ouverture, tant qu'il n'est ni repris ni
  // abandonné. La sauvegarde automatique attend cette décision : sans cela,
  // la première frappe l'écraserait.
  const [propose, setPropose] = useState(brouillon);
  const [erreurAbandon, setErreurAbandon] = useState<string | null>(null);
  // Dernier texte parti au brouillon, et ce qu'il en est advenu. Un échec y
  // reste : le même texte n'est pas renvoyé en boucle.
  const [sauvegarde, setSauvegarde] = useState<{
    title: string;
    content: string;
    le: string | null;
  } | null>(null);

  // Ajustement pendant le rendu, et non dans un effet : l'état suit la
  // réponse de l'action sans rendu intermédiaire incohérent.
  if (etat !== etatTraite) {
    setEtatTraite(etat);
    if (etat && "enregistreLe" in etat) {
      setEnregistre(envoye);
      // L'enregistrement a supprimé le brouillon : ce qui serait tapé
      // ensuite en ouvre un nouveau.
      setSauvegarde(null);
    }
  }

  const modifie =
    titre !== enregistre.title ||
    type !== enregistre.type ||
    statut !== enregistre.status ||
    contenu !== enregistre.content;

  const aSauver =
    !propose &&
    !enCours &&
    brouillonASauver({ title: titre, content: contenu }, enregistre, sauvegarde);

  useEffect(() => {
    if (!aSauver) return;
    const minuterie = setTimeout(() => {
      const saisi = { title: titre, content: contenu };
      startTransition(async () => {
        const reponse = await enregistrerBrouillon(projetId, document.id, titre, contenu);
        setSauvegarde({ ...saisi, le: "sauvegardeLe" in reponse ? reponse.sauvegardeLe : null });
      });
    }, DELAI_BROUILLON_MS);
    return () => clearTimeout(minuterie);
  }, [aSauver, titre, contenu, projetId, document.id]);

  // Le texte à l'écran est à l'abri s'il est dans le brouillon ; le type et le
  // statut n'y vont pas.
  const aLAbri =
    sauvegarde?.le != null &&
    sauvegarde.title === titre &&
    sauvegarde.content === contenu &&
    type === enregistre.type &&
    statut === enregistre.status;

  useEffect(() => {
    if (!modifie || aLAbri) return;
    const avertir = (evenement: BeforeUnloadEvent) => evenement.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie, aLAbri]);

  const mots = compterMots(contenu);
  // Formatées dans le navigateur : l'heure de l'utilisateur, pas celle du serveur.
  const heureCourte = new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" });
  const etatBrouillon = !sauvegarde
    ? null
    : sauvegarde.le
      ? `brouillon sauvegardé à ${heureCourte.format(new Date(sauvegarde.le))}`
      : "la sauvegarde du brouillon a échoué";
  const heure =
    etat && "enregistreLe" in etat ? heureCourte.format(new Date(etat.enregistreLe)) : null;

  return (
    <form
      ref={formulaire}
      /*
       * Envoi déclenché à la main, et non par `action={action}` : après une
       * action de formulaire, React réinitialise ses champs. Les listes
       * déroulantes reviendraient alors à leur valeur initiale tout en
       * gardant la bonne dans l'état, et l'enregistrement suivant renverrait
       * en silence l'ancien statut.
       */
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);
        setEnvoye({ ...document, title: titre.trim(), type, status: statut, content: contenu });
        startTransition(() => action(donnees));
      }}
      className="space-y-5"
    >
      <input type="hidden" name="projet" value={projetId} />
      <input type="hidden" name="document" value={document.id} />

      {message && "erreur" in message ? <Message ton="erreur">{message.erreur}</Message> : null}

      {propose ? (
        <section
          aria-labelledby="brouillon-titre"
          className="border-gold/60 rounded-xl border p-5 text-sm leading-relaxed"
        >
          <h2 id="brouillon-titre" className="font-medium">
            Un brouillon n&apos;a pas été enregistré
          </h2>
          <p className="text-secondary mt-2">
            Vous avez laissé un brouillon de ce document le{" "}
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" }).format(
              new Date(propose.updated_at),
            )}
            . Le reprendre le remet à l&apos;écran, sans rien enregistrer.
          </p>
          {documentEnregistreDepuis(propose, derniereVersion) ? (
            <p className="mt-2">
              Attention : le document a été enregistré depuis ce brouillon. Le reprendre remplacera
              à l&apos;écran un texte plus récent que lui.
            </p>
          ) : null}
          {erreurAbandon ? (
            <p role="alert" className="mt-2">
              {erreurAbandon}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setTitre(propose.title);
                setContenu(propose.content);
                // Déjà en base : inutile de le renvoyer tel quel.
                setSauvegarde({
                  title: propose.title,
                  content: propose.content,
                  le: propose.updated_at,
                });
                setPropose(null);
              }}
              className="border-gold hover:bg-gold/10 rounded-full border px-4 py-2 text-xs transition-colors"
            >
              Reprendre le brouillon
            </button>
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  const reponse = await abandonnerBrouillon(projetId, document.id);
                  if ("erreur" in reponse) {
                    setErreurAbandon(reponse.erreur);
                  } else {
                    setPropose(null);
                  }
                });
              }}
              className="border-app-line hover:border-secondary rounded-full border px-4 py-2 text-xs transition-colors"
            >
              Abandonner le brouillon
            </button>
          </div>
        </section>
      ) : null}

      <div>
        <label htmlFor="titre" className="mb-2 block text-sm font-medium">
          Titre
        </label>
        <input
          id="titre"
          name="titre"
          required
          maxLength={TITRE_DOCUMENT_MAX}
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          className="border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 font-serif text-xl transition-colors outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="type" className="mb-2 block text-sm font-medium">
            Type
          </label>
          <select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            className={CLASSES_SELECT}
          >
            {ORDRE_TYPES.map((valeur) => (
              <option key={valeur} value={valeur}>
                {TYPES_DOCUMENT[valeur].libelle}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="statut" className="mb-2 block text-sm font-medium">
            Statut
          </label>
          <select
            id="statut"
            name="statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value as DocumentStatus)}
            className={CLASSES_SELECT}
          >
            {Object.entries(STATUTS_DOCUMENT).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between gap-4">
          <label htmlFor="contenu" className="block text-sm font-medium">
            Texte
          </label>
          {/* Pas de région live : chaque frappe serait annoncée. */}
          <span className="text-secondary text-xs tabular-nums">{libelleMots(mots)}</span>
        </div>
        {misEnForme ? <BarreOutils zone={zone} texte={contenu} onChange={setContenu} /> : null}
        <textarea
          ref={zone}
          id="contenu"
          name="contenu"
          rows={22}
          maxLength={CONTENU_DOCUMENT_MAX}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          aria-describedby="contenu-aide"
          className="border-app-line bg-app focus:border-gold w-full resize-y rounded-lg border px-5 py-4 text-[0.9375rem] leading-relaxed transition-colors outline-none"
        />
        {misEnForme ? (
          <>
            <p id="contenu-aide" className="text-secondary mt-2 text-xs leading-relaxed">
              {AIDE_MISE_EN_FORME}
            </p>
            <button
              type="button"
              aria-expanded={apercu}
              aria-controls="contenu-apercu"
              onClick={() => setApercu((ouvert) => !ouvert)}
              className="border-app-line hover:border-secondary mt-3 rounded-full border px-4 py-2 text-xs transition-colors"
            >
              {apercu ? "Masquer l'aperçu" : "Afficher l'aperçu"}
            </button>
            {apercu ? (
              <section
                id="contenu-apercu"
                aria-label="Aperçu du texte mis en forme"
                className="border-app-line mt-3 rounded-lg border border-dashed px-5 py-4 text-[0.9375rem] leading-relaxed"
              >
                {contenu.trim() ? (
                  <TexteMisEnForme texte={contenu} type={type} />
                ) : (
                  <p className="text-secondary text-sm">Rien à montrer : le texte est vide.</p>
                )}
              </section>
            ) : null}
          </>
        ) : (
          <p id="contenu-aide" className="text-secondary mt-2 text-xs leading-relaxed">
            Un scénario garde son texte tel qu&apos;il est écrit : aucune mise en forme n&apos;y est
            appliquée.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>Enregistrer</SubmitButton>
        </div>
        {/* État écrit en toutes lettres : la couleur ne fait que l'appuyer. */}
        <p role="status" className="text-secondary text-sm">
          {modifie ? (
            <>
              <span className="text-gold">Modifications non enregistrées</span>
              {etatBrouillon ? ` — ${etatBrouillon}` : null}
            </>
          ) : heure ? (
            `Enregistré à ${heure}`
          ) : null}
        </p>
      </div>
      <p className="text-secondary text-xs leading-relaxed">{AIDE_BROUILLON}</p>
    </form>
  );
}
