"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  AVERTISSEMENT_PERSONNE_REELLE,
  CHAMPS_FICHE_PERSONNAGE,
  fichePersonnageRemplie,
  LONGUEURS_PERSONNAGE,
  ROLES_PERSONNAGE,
  type FichePersonnage,
} from "@/lib/fiche";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import { ajouterPersonnage, modifierPersonnage, type EtatPersonnage } from "./actions";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type PersonnageEditable = {
  id: string;
  name: string;
  role: string;
  description: string;
} & FichePersonnage;

/**
 * Ajout ou modification d'un personnage.
 *
 * Envoi par `action` : à l'ajout, la réinitialisation du formulaire après
 * l'action est voulue — il se vide pour le personnage suivant. À la
 * modification, l'action redirige vers la liste et le formulaire disparaît.
 */
export function FormulairePersonnage({
  projetId,
  personnage,
  documentaire = false,
}: {
  projetId: string;
  personnage?: PersonnageEditable;
  /** Un documentaire : ses personnages sont des personnes réelles, et l'écran le dit. */
  documentaire?: boolean;
}) {
  const [etat, action, enCours] = useActionState<EtatPersonnage, FormData>(
    personnage ? modifierPersonnage : ajouterPersonnage,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  // Identifiants préfixés : le formulaire d'ajout et celui d'un personnage en
  // cours de modification coexistent sur la page.
  const p = personnage ? `personnage-${personnage.id}` : "nouveau-personnage";

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {personnage ? <input type="hidden" name="personnage" value={personnage.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_auto]">
        <Field
          label="Nom"
          name="name"
          id={`${p}-nom`}
          required
          maxLength={LONGUEURS_PERSONNAGE.name}
          defaultValue={personnage?.name}
          placeholder="Ɛyɔ"
        />
        <div>
          <label htmlFor={`${p}-role`} className="mb-2 block text-sm font-medium">
            Rôle
          </label>
          <select
            id={`${p}-role`}
            name="role"
            defaultValue={personnage?.role ?? "principal"}
            className={CHAMP}
          >
            {Object.entries(ROLES_PERSONNAGE).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor={`${p}-description`} className="mb-2 block text-sm font-medium">
          Description <span className="text-light-muted font-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${p}-description`}
          name="description"
          rows={4}
          maxLength={LONGUEURS_PERSONNAGE.description}
          defaultValue={personnage?.description}
          placeholder="Qui il est, ce qu'il veut, ce qui l'en empêche."
          aria-describedby={`${p}-description-aide`}
          className={`${CHAMP} resize-y leading-relaxed`}
        />
        <p id={`${p}-description-aide`} className="text-light-muted mt-2 text-xs">
          {LONGUEURS_PERSONNAGE.description} caractères maximum.
        </p>
      </div>

      {/* Replié tant que rien n'y est saisi : la description suffit toujours. */}
      <details
        open={personnage ? fichePersonnageRemplie(personnage).length > 0 : false}
        className="border-navy-line group rounded-lg border"
      >
        <summary className="hover:bg-navy-soft focus-visible:outline-gold cursor-pointer rounded-lg px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2">
          Fiche détaillée <span className="text-light-muted font-normal">(facultatif)</span>
        </summary>
        <div className="border-navy-line space-y-5 border-t px-4 py-5">
          <p className="text-light-muted text-xs leading-relaxed">
            Huit repères à remplir à votre rythme. L&apos;assistant lit ceux qui sont remplis quand
            il écrit pour ce projet ; un champ laissé vide ne lui est pas transmis.
          </p>
          {documentaire ? (
            <p
              role="note"
              className="border-gold/40 bg-gold/10 rounded-lg border px-4 py-3 text-sm leading-relaxed"
            >
              {AVERTISSEMENT_PERSONNE_REELLE}
            </p>
          ) : null}
          {CHAMPS_FICHE_PERSONNAGE.map(({ cle, libelle, max, ligne, aide }) => (
            <div key={cle}>
              <label htmlFor={`${p}-${cle}`} className="mb-2 block text-sm font-medium">
                {libelle}
              </label>
              {ligne ? (
                <input
                  id={`${p}-${cle}`}
                  name={cle}
                  type="text"
                  maxLength={max}
                  defaultValue={personnage?.[cle]}
                  aria-describedby={`${p}-${cle}-aide`}
                  className={CHAMP}
                />
              ) : (
                <textarea
                  id={`${p}-${cle}`}
                  name={cle}
                  rows={3}
                  maxLength={max}
                  defaultValue={personnage?.[cle]}
                  aria-describedby={`${p}-${cle}-aide`}
                  className={`${CHAMP} resize-y leading-relaxed`}
                />
              )}
              <p id={`${p}-${cle}-aide`} className="text-light-muted mt-2 text-xs">
                {aide} {max} caractères maximum.
              </p>
            </div>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {personnage ? "Enregistrer le personnage" : "Ajouter le personnage"}
          </SubmitButton>
        </div>
        {personnage ? (
          <Link
            href={`/projets/${projetId}/assistant/personnages#personnage-${personnage.id}`}
            className="text-light-muted hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}
