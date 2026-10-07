"use client";

import { startTransition, useActionState, useState } from "react";

import { Message } from "@/components/ui/form";
import { annonceChangementDeRole, ROLES_COMPTE, type RoleCompte } from "@/lib/comptes";

import { changerRole, type EtatRole } from "./actions";

/**
 * Changement de rôle, confirmé en deux temps : le premier clic dit ce que le
 * rôle ouvre ou retire, le second seul l'envoie.
 */
export function FormulaireRole({ compteId, role }: { compteId: string; role: RoleCompte }) {
  const [etat, action, enCours] = useActionState<EtatRole, FormData>(changerRole, null);
  const [ouvert, setOuvert] = useState(false);
  const nouveau: RoleCompte = role === "admin" ? "member" : "admin";
  const libelle =
    nouveau === "admin" ? "Donner le rôle d'administrateur" : "Retirer le rôle d'administrateur";

  function envoyer() {
    const donnees = new FormData();
    donnees.set("compte", compteId);
    donnees.set("role", nouveau);
    setOuvert(false);
    startTransition(() => action(donnees));
  }

  return (
    <div className="space-y-4">
      {etat && "erreur" in etat ? <Message ton="erreur">{etat.erreur}</Message> : null}
      {etat && "succes" in etat ? <Message ton="succes">{etat.succes}</Message> : null}

      {ouvert ? (
        <div className="border-app-line space-y-4 rounded-lg border p-4">
          <p className="text-sm leading-relaxed">
            <span className="font-medium">
              {ROLES_COMPTE[role]} → {ROLES_COMPTE[nouveau]}.
            </span>{" "}
            {annonceChangementDeRole(nouveau)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={envoyer}
              // Le focus passe sur la confirmation : au clavier, elle reste à
              // portée sans avoir à chercher le bouton qui vient d'apparaître.
              autoFocus
              className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
            >
              Confirmer le changement
            </button>
            <button
              type="button"
              onClick={() => setOuvert(false)}
              className="border-app-line hover:bg-surface rounded-full border px-5 py-2.5 text-sm transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={enCours}
          className="border-app-line hover:bg-surface rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {enCours ? "Un instant…" : libelle}
        </button>
      )}
    </div>
  );
}
