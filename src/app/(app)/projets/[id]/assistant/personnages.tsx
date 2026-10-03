"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { LONGUEURS_PERSONNAGE, ROLES_PERSONNAGE } from "@/lib/fiche";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import { ajouterPersonnage, modifierPersonnage, type EtatPersonnage } from "./actions";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type PersonnageEditable = {
  id: string;
  name: string;
  role: string;
  description: string;
};

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
}: {
  projetId: string;
  personnage?: PersonnageEditable;
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
