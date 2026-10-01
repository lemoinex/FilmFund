"use client";

import { startTransition, useActionState, type FormEvent } from "react";

import { BoutonConfirme } from "@/components/ui/confirmation";
import { Field, Message, SubmitButton } from "@/components/ui/form";
import { CLE_MAX, type Fournisseur } from "@/lib/integrations-ia";

import { gererCle, type EtatIntegration } from "./actions";

/*
 * Enregistrer et retirer partagent un seul état : l'écran ne montre que le
 * dernier retour, celui qui dit où en est le fournisseur.
 *
 * Le champ est vidé dès l'envoi, et jamais repeuplé : une clé enregistrée ne
 * se relit pas. Le serveur ne renvoie que l'état, jamais la valeur.
 */
export function FormulaireCle({
  fournisseur,
  configure,
}: {
  fournisseur: Fournisseur;
  configure: boolean;
}) {
  const [etat, agir, enCours] = useActionState<EtatIntegration, FormData>(gererCle, null);

  function envoyer(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const donnees = new FormData(formulaire);
    // La clé quitte le champ avant même l'aller-retour : elle ne traîne pas
    // à l'écran, et un second envoi ne la renverrait pas par mégarde.
    formulaire.reset();
    startTransition(() => agir(donnees));
  }

  return (
    <div className="space-y-4">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <form onSubmit={envoyer} className="space-y-4">
        <input type="hidden" name="fournisseur" value={fournisseur.code} />
        <Field
          label={configure ? "Remplacer la clé" : "Clé d'API"}
          name="cle"
          id={`cle-${fournisseur.code}`}
          type="password"
          autoComplete="off"
          required
          maxLength={CLE_MAX}
          aide="Collez la clé telle que le fournisseur l'a délivrée. Elle ne sera plus affichée après enregistrement."
        />
        <div className="w-full sm:w-auto sm:max-w-xs">
          <SubmitButton enCours={enCours}>
            {configure ? "Remplacer la clé" : "Enregistrer la clé"}
          </SubmitButton>
        </div>
      </form>

      {configure ? (
        <BoutonConfirme
          action={agir}
          champs={{ fournisseur: fournisseur.code, intention: "retrait" }}
          libelle="Retirer la clé"
          confirmation={`Retirer la clé ${fournisseur.nom}`}
        />
      ) : null}
    </div>
  );
}
