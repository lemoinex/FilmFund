"use client";

import { useActionState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { POSTE_MAX, ROLES_ATTRIBUABLES } from "@/lib/equipes";
import { inviterMembre, type EtatInvitation } from "../actions-equipe";

export function FormulaireInvitation({ projetId }: { projetId: string }) {
  const [etat, action, enCours] = useActionState<EtatInvitation, FormData>(inviterMembre, null);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="projet" value={projetId} />

      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <Field
        label="Adresse e-mail"
        name="email"
        type="email"
        autoComplete="off"
        required
        placeholder="collaborateur@exemple.com"
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="role-invitation" className="mb-2 block text-sm font-medium">
            Rôle
          </label>
          <select
            id="role-invitation"
            name="role"
            defaultValue="viewer"
            className="border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none"
          >
            {Object.entries(ROLES_ATTRIBUABLES).map(([valeur, libelle]) => (
              <option key={valeur} value={valeur}>
                {libelle}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Poste sur le film"
          name="poste"
          maxLength={POSTE_MAX}
          placeholder="Réalisation, image, montage…"
        />
      </div>

      <SubmitButton enCours={enCours}>Envoyer l&apos;invitation</SubmitButton>
    </form>
  );
}
