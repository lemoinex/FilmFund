"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";

import { Message } from "@/components/ui/form";
import { ANNONCE_RETABLISSEMENT, ANNONCE_SUSPENSION, MOTIF_SUSPENSION } from "@/lib/comptes";

import { retablirCompte, suspendreCompte, type EtatSuspension } from "./actions";

const BOUTON_SECONDAIRE =
  "border-app-line hover:bg-surface rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Suspension d'un compte, en deux temps : le motif d'abord, puis une
 * confirmation qui dit ce que la suspension retire. Le motif saisi est gardé
 * d'un temps à l'autre, et après un refus.
 */
export function FormulaireSuspension({ compteId }: { compteId: string }) {
  const [etat, action, enCours] = useActionState<EtatSuspension, FormData>(suspendreCompte, null);
  const [motif, setMotif] = useState("");
  const [ouvert, setOuvert] = useState(false);

  function demander(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    setOuvert(true);
  }

  function envoyer() {
    const donnees = new FormData();
    donnees.set("compte", compteId);
    donnees.set("motif", motif);
    setOuvert(false);
    startTransition(() => action(donnees));
  }

  return (
    <div className="space-y-4">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      <form onSubmit={demander} className="space-y-3">
        <div>
          <label htmlFor="motif-suspension" className="mb-2 block text-sm font-medium">
            Motif de la suspension
          </label>
          <textarea
            id="motif-suspension"
            name="motif"
            required
            rows={3}
            minLength={MOTIF_SUSPENSION.min}
            maxLength={MOTIF_SUSPENSION.max}
            value={motif}
            onChange={(evenement) => setMotif(evenement.target.value)}
            readOnly={ouvert}
            aria-describedby="motif-suspension-aide"
            className="border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none"
          />
          <p id="motif-suspension-aide" className="text-light-muted mt-2 text-xs leading-relaxed">
            De {MOTIF_SUSPENSION.min} à {MOTIF_SUSPENSION.max} caractères. Lisible des seuls
            administrateurs, et inscrit au journal : le compte ne le voit pas.
          </p>
        </div>

        {ouvert ? null : (
          <button type="submit" disabled={enCours} className={BOUTON_SECONDAIRE}>
            {enCours ? "Un instant…" : "Suspendre ce compte"}
          </button>
        )}
      </form>

      {ouvert ? (
        <div className="space-y-4 rounded-lg border border-red-400/40 p-4">
          <p className="text-sm leading-relaxed">{ANNONCE_SUSPENSION}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={envoyer}
              // Le focus passe sur la confirmation : au clavier, elle reste à
              // portée sans avoir à chercher le bouton qui vient d'apparaître.
              autoFocus
              className="rounded-full bg-red-500/90 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              Confirmer la suspension
            </button>
            <button type="button" onClick={() => setOuvert(false)} className={BOUTON_SECONDAIRE}>
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Rétablissement d'un compte suspendu, confirmé en deux temps. */
export function FormulaireRetablissement({ compteId }: { compteId: string }) {
  const [etat, action, enCours] = useActionState<EtatSuspension, FormData>(retablirCompte, null);
  const [ouvert, setOuvert] = useState(false);

  function envoyer() {
    const donnees = new FormData();
    donnees.set("compte", compteId);
    setOuvert(false);
    startTransition(() => action(donnees));
  }

  return (
    <div className="space-y-4">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      {ouvert ? (
        <div className="border-app-line space-y-4 rounded-lg border p-4">
          <p className="text-sm leading-relaxed">{ANNONCE_RETABLISSEMENT}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={envoyer}
              autoFocus
              className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Confirmer le rétablissement
            </button>
            <button type="button" onClick={() => setOuvert(false)} className={BOUTON_SECONDAIRE}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={enCours}
          className={BOUTON_SECONDAIRE}
        >
          {enCours ? "Un instant…" : "Rétablir ce compte"}
        </button>
      )}
    </div>
  );
}
