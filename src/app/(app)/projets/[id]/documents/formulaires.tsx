"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
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

import { creerDocument, enregistrerDocument, type EtatDocument } from "./actions";

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
 */
export function EditeurDocument({
  projetId,
  document,
}: {
  projetId: string;
  document: DocumentEditable;
}) {
  const [etat, action, enCours] = useActionState<EtatDocument, FormData>(enregistrerDocument, null);
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  const [titre, setTitre] = useState(document.title);
  const [type, setType] = useState(document.type);
  const [statut, setStatut] = useState(document.status);
  const [contenu, setContenu] = useState(document.content);

  // Dernière version enregistrée : la référence pour savoir s'il reste des
  // modifications en attente.
  const [enregistre, setEnregistre] = useState(document);
  // Valeurs envoyées au dernier enregistrement. On les capture à l'envoi et
  // non à la réponse : ce qui est tapé pendant l'enregistrement n'est pas
  // enregistré, et doit rester signalé comme tel.
  const [envoye, setEnvoye] = useState(document);
  const [etatTraite, setEtatTraite] = useState<EtatDocument>(null);

  // Ajustement pendant le rendu, et non dans un effet : l'état suit la
  // réponse de l'action sans rendu intermédiaire incohérent.
  if (etat !== etatTraite) {
    setEtatTraite(etat);
    if (etat && "enregistreLe" in etat) {
      setEnregistre(envoye);
    }
  }

  const modifie =
    titre !== enregistre.title ||
    type !== enregistre.type ||
    statut !== enregistre.status ||
    contenu !== enregistre.content;

  useEffect(() => {
    if (!modifie) return;
    const avertir = (evenement: BeforeUnloadEvent) => evenement.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const mots = compterMots(contenu);
  // Formatée dans le navigateur : l'heure de l'utilisateur, pas celle du serveur.
  const heure =
    etat && "enregistreLe" in etat
      ? new Intl.DateTimeFormat("fr-FR", { timeStyle: "short" }).format(new Date(etat.enregistreLe))
      : null;

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
        <textarea
          id="contenu"
          name="contenu"
          rows={22}
          maxLength={CONTENU_DOCUMENT_MAX}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          className="border-app-line bg-app focus:border-gold w-full resize-y rounded-lg border px-5 py-4 text-[0.9375rem] leading-relaxed transition-colors outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>Enregistrer</SubmitButton>
        </div>
        {/* État écrit en toutes lettres : la couleur ne fait que l'appuyer. */}
        <p role="status" className="text-secondary text-sm">
          {modifie ? (
            <span className="text-gold">Modifications non enregistrées</span>
          ) : heure ? (
            `Enregistré à ${heure}`
          ) : null}
        </p>
      </div>
    </form>
  );
}
