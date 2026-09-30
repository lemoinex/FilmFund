"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";
import { DEVISES, LIBELLE_MAX, montantPourSaisie, ORDRE_POSTES, POSTES } from "@/lib/budgets";
import type { BudgetCategory } from "@/lib/supabase/types";

import {
  ajouterLigne,
  changerDevise,
  modifierLigne,
  ouvrirBudget,
  type EtatBudget,
} from "./actions";

const CLASSES_SELECT =
  "border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export type LigneEditable = {
  id: string;
  category: BudgetCategory;
  label: string;
  quantity: number;
  unit_cost: number;
  actual_amount: number | null;
};

/**
 * Ajout ou modification d'une ligne de dépense.
 *
 * Un seul formulaire pour les deux usages : les règles de saisie ne peuvent
 * pas diverger entre la création d'une ligne et sa correction.
 */
export function FormulaireLigne({
  projetId,
  devise,
  ligne,
  posteParDefaut = "developpement",
}: {
  projetId: string;
  devise: string;
  ligne?: LigneEditable;
  posteParDefaut?: BudgetCategory;
}) {
  const [etat, action, enCours] = useActionState<EtatBudget, FormData>(
    ligne ? modifierLigne : ajouterLigne,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  // Préfixe des identifiants : le formulaire d'ajout et celui d'une ligne en
  // cours de modification coexistent sur la page.
  const p = ligne ? `ligne-${ligne.id}` : "nouvelle";

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />
      {ligne ? <input type="hidden" name="ligne" value={ligne.id} /> : null}

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={`${p}-poste`} className="mb-2 block text-sm font-medium">
            Poste
          </label>
          <select
            id={`${p}-poste`}
            name="poste"
            defaultValue={ligne?.category ?? posteParDefaut}
            className={CLASSES_SELECT}
          >
            {ORDRE_POSTES.map((poste) => (
              <option key={poste} value={poste}>
                {POSTES[poste]}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Description"
          name="libelle"
          id={`${p}-libelle`}
          required
          maxLength={LIBELLE_MAX}
          defaultValue={ligne?.label}
          placeholder="Location caméra, cachet, billets d'avion…"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field
          label="Quantité"
          name="quantite"
          id={`${p}-quantite`}
          required
          inputMode="decimal"
          defaultValue={ligne ? montantPourSaisie(ligne.quantity) : "1"}
          aide="Jours, semaines, unités…"
        />
        <Field
          label={`Coût unitaire (${devise})`}
          name="cout"
          id={`${p}-cout`}
          required
          inputMode="decimal"
          defaultValue={ligne ? montantPourSaisie(ligne.unit_cost) : undefined}
          placeholder="1 500 000"
        />
        <Field
          label={`Montant réel (${devise})`}
          name="reel"
          id={`${p}-reel`}
          inputMode="decimal"
          defaultValue={ligne ? montantPourSaisie(ligne.actual_amount) : undefined}
          aide="À renseigner une fois la dépense engagée."
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-full sm:w-auto sm:min-w-56">
          <SubmitButton enCours={enCours}>
            {ligne ? "Enregistrer la ligne" : "Ajouter la ligne"}
          </SubmitButton>
        </div>
        {ligne ? (
          <Link
            href={`/projets/${projetId}/budget#ligne-${ligne.id}`}
            className="text-light-muted hover:text-light text-sm transition-colors"
          >
            Annuler
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/** Choix de la devise : à l'ouverture du budget, ou pour la changer ensuite. */
export function FormulaireDevise({
  projetId,
  deviseActuelle,
}: {
  projetId: string;
  deviseActuelle?: string;
}) {
  const [etat, action, enCours] = useActionState<EtatBudget, FormData>(
    deviseActuelle ? changerDevise : ouvrirBudget,
    null,
  );
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  return (
    <form ref={formulaire} action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />

      {message?.erreur ? <Message ton="erreur">{message.erreur}</Message> : null}

      <div>
        <label htmlFor="devise" className="mb-2 block text-sm font-medium">
          Devise du budget
        </label>
        <select
          // Remonté quand la devise change : après l'action, React
          // réinitialiserait sinon le champ sur l'ancienne valeur.
          key={deviseActuelle}
          id="devise"
          name="devise"
          required
          defaultValue={deviseActuelle ?? ""}
          className={CLASSES_SELECT}
        >
          {deviseActuelle ? null : (
            <option value="" disabled>
              Choisissez une devise
            </option>
          )}
          {Object.entries(DEVISES).map(([code, libelle]) => (
            <option key={code} value={code}>
              {libelle}
            </option>
          ))}
        </select>
      </div>

      <div className="w-full sm:w-auto sm:max-w-xs">
        <SubmitButton enCours={enCours}>
          {deviseActuelle ? "Changer de devise" : "Ouvrir le budget"}
        </SubmitButton>
      </div>
    </form>
  );
}
