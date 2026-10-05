"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  CATEGORIES_MATERIEL,
  DESIGNATION_MAX,
  MARGE_POURCENT,
  PUISSANCE_WATTS,
  QUANTITE,
  TENSION_VOLTS,
} from "@/lib/materiel";
import type { GearCategory } from "@/lib/supabase/types";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import {
  ajouterEquipement,
  enregistrerReglages,
  modifierEquipement,
  type EtatMateriel,
} from "./actions";

const CLASSES_CHAMP =
  "border-app-line bg-app focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type EquipementEditable = {
  id: string;
  category: GearCategory;
  label: string;
  quantity: number;
  unit_power_watts: number | null;
  simultaneous: boolean;
};

/**
 * Ajout ou modification d'un équipement.
 *
 * Envoi par `action` : à l'ajout, le formulaire se vide pour l'équipement
 * suivant ; à la modification, l'action redirige et le formulaire disparaît.
 */
export function FormulaireEquipement({
  projetId,
  equipement,
}: {
  projetId: string;
  equipement?: EquipementEditable;
}) {
  const [etat, action, enCours] = useActionState<EtatMateriel, FormData>(
    equipement ? modifierEquipement : ajouterEquipement,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  const p = equipement ? `equipement-${equipement.id}` : "nouvel-equipement";

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {equipement ? <input type="hidden" name="equipement" value={equipement.id} /> : null}

      {message && "erreur" in message ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr]">
        <div>
          <label htmlFor={`${p}-categorie`} className="mb-2 block text-sm font-medium">
            Catégorie
          </label>
          <select
            id={`${p}-categorie`}
            name="categorie"
            defaultValue={equipement?.category ?? "image"}
            className={CLASSES_CHAMP}
          >
            {Object.entries(CATEGORIES_MATERIEL).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Désignation"
          name="designation"
          id={`${p}-designation`}
          required
          maxLength={DESIGNATION_MAX}
          defaultValue={equipement?.label}
          placeholder="Projecteur LED sur pied"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Quantité"
          name="quantite"
          id={`${p}-quantite`}
          required
          inputMode="numeric"
          maxLength={String(QUANTITE.max).length}
          defaultValue={String(equipement?.quantity ?? 1)}
        />
        <Field
          label="Puissance unitaire, en watts"
          name="puissance"
          id={`${p}-puissance`}
          inputMode="numeric"
          maxLength={String(PUISSANCE_WATTS.max).length}
          defaultValue={equipement?.unit_power_watts?.toString()}
          aide="Celle que l'appareil consomme, lue sur sa plaque. Zéro pour ce qui ne se branche pas ; vide si vous ne la connaissez pas encore, ou pour un groupe électrogène, qui fournit le courant."
        />
      </div>

      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="simultane"
          defaultChecked={equipement?.simultaneous ?? true}
          className="accent-gold mt-0.5 size-4"
        />
        <span>
          Fonctionne en même temps que les autres
          <span className="text-secondary block text-xs leading-relaxed">
            Décochez pour ce qui ne tourne jamais pendant que le reste est allumé : il sort de la
            charge simultanée.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {equipement ? "Enregistrer l'équipement" : "Ajouter l'équipement"}
          </SubmitButton>
        </div>
        {equipement ? (
          <Link
            href={`/projets/${projetId}/materiel#equipement-${equipement.id}`}
            className="text-secondary hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Tension et marge du groupe électrogène retenues pour le projet.
 *
 * Champs contrôlés par `key` côté page : après l'enregistrement, la page se
 * recharge avec les valeurs en base, que le formulaire reprend.
 */
export function FormulaireReglages({
  projetId,
  tension,
  marge,
}: {
  projetId: string;
  tension: number;
  marge: number;
}) {
  const [etat, action, enCours] = useActionState<EtatMateriel, FormData>(enregistrerReglages, null);
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  return (
    <form ref={formulaire} action={action} className="space-y-4">
      <input type="hidden" name="projet" value={projetId} />

      {message && "erreur" in message ? <Message ton="erreur">{message.erreur}</Message> : null}
      {message && "succes" in message ? <Message ton="succes">{message.succes}</Message> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field
          label="Tension, en volts"
          name="tension"
          id="reglages-tension"
          required
          inputMode="numeric"
          maxLength={String(TENSION_VOLTS.max).length}
          defaultValue={String(tension)}
        />
        <Field
          label="Marge du groupe, en %"
          name="marge"
          id="reglages-marge"
          required
          inputMode="numeric"
          maxLength={String(MARGE_POURCENT.max).length}
          defaultValue={String(marge)}
        />
        <div className="sm:min-w-40">
          <SubmitButton enCours={enCours}>Enregistrer</SubmitButton>
        </div>
      </div>
    </form>
  );
}
