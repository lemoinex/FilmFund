"use client";

import { startTransition, useActionState, useRef } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import { LONGUEURS_PROFIL, TYPES_PROFIL, type Pays, type SaisieProfil } from "@/lib/profils";
import { useMessageFormulaire } from "@/lib/use-message-formulaire";

import { mettreAJourProfil, type EtatProfil } from "./actions";

const LISTE =
  "border-navy-line bg-navy focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

export function FormulaireProfil({ profil, pays }: { profil: SaisieProfil; pays: Pays[] }) {
  const [etat, action, enCours] = useActionState<EtatProfil, FormData>(mettreAJourProfil, null);
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useMessageFormulaire(etat, formulaire);

  return (
    <form
      ref={formulaire}
      /*
       * Envoi déclenché à la main, et non par `action={action}` : après une
       * action de formulaire, React réinitialise les champs à leurs valeurs
       * initiales. Les listes (pays, type) réafficheraient l'ancienne valeur,
       * et l'enregistrement suivant la renverrait en silence.
       */
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);
        startTransition(() => action(donnees));
      }}
      className="space-y-5"
    >
      {message && "erreur" in message ? <Message ton="erreur">{message.erreur}</Message> : null}
      {message && "message" in message ? <Message ton="succes">{message.message}</Message> : null}

      <Field
        label="Nom affiché"
        name="nomAffiche"
        required
        autoComplete="nickname"
        defaultValue={profil.display_name}
        maxLength={LONGUEURS_PROFIL.display_name}
        aide="Le nom sous lequel vos équipes vous voient."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Prénom"
          name="prenom"
          autoComplete="given-name"
          defaultValue={profil.first_name}
          maxLength={LONGUEURS_PROFIL.first_name}
        />
        <Field
          label="Nom"
          name="nom"
          autoComplete="family-name"
          defaultValue={profil.last_name}
          maxLength={LONGUEURS_PROFIL.last_name}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pays" className="mb-2 block text-sm font-medium">
            Pays
            <span className="text-light-muted font-normal"> (facultatif)</span>
          </label>
          <select
            id="pays"
            name="pays"
            autoComplete="country"
            defaultValue={profil.country ?? ""}
            className={LISTE}
          >
            <option value="">Non renseigné</option>
            {pays.map(({ code, nom }) => (
              <option key={code} value={code}>
                {nom}
              </option>
            ))}
          </select>
        </div>

        <Field
          label="Ville"
          name="ville"
          autoComplete="address-level2"
          defaultValue={profil.city}
          maxLength={LONGUEURS_PROFIL.city}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label="Profession"
          name="profession"
          autoComplete="organization-title"
          defaultValue={profil.profession}
          maxLength={LONGUEURS_PROFIL.profession}
        />

        <div>
          <label htmlFor="type" className="mb-2 block text-sm font-medium">
            Vous êtes
            <span className="text-light-muted font-normal"> (facultatif)</span>
          </label>
          <select id="type" name="type" defaultValue={profil.profile_type ?? ""} className={LISTE}>
            <option value="">Non renseigné</option>
            {Object.entries(TYPES_PROFIL).map(([code, libelle]) => (
              <option key={code} value={code}>
                {libelle}
              </option>
            ))}
          </select>
        </div>
      </div>

      <SubmitButton enCours={enCours}>Enregistrer</SubmitButton>
    </form>
  );
}
