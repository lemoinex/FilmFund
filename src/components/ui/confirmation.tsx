"use client";

import { useState } from "react";

/**
 * Bouton d'action irréversible, confirmé en deux temps.
 *
 * Le premier clic ne fait qu'afficher la confirmation : une suppression ne
 * doit pas tenir à un clic égaré. Les champs cachés portent les identifiants
 * attendus par l'action serveur.
 */
export function BoutonConfirme({
  action,
  champs,
  libelle,
  confirmation,
  discret = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  champs: Record<string, string>;
  libelle: string;
  confirmation: string;
  discret?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);

  if (!ouvert) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        className={
          discret
            ? "text-light-muted rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-red-400/10 hover:text-red-200"
            : "rounded-full border border-red-400/40 px-5 py-2.5 text-sm text-red-200 transition-colors hover:bg-red-400/10"
        }
      >
        {libelle}
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {Object.entries(champs).map(([nom, valeur]) => (
        <input key={nom} type="hidden" name={nom} value={valeur} />
      ))}
      <button
        type="submit"
        // Le focus passe sur la confirmation : au clavier, l'action reste à
        // portée sans avoir à chercher le bouton qui vient d'apparaître.
        autoFocus
        className={`rounded-full bg-red-500/90 font-medium text-white transition-colors hover:bg-red-500 ${
          discret ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
        }`}
      >
        {confirmation}
      </button>
      <button
        type="button"
        onClick={() => setOuvert(false)}
        className={`border-navy-line hover:bg-navy-soft rounded-full border transition-colors ${
          discret ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm"
        }`}
      >
        Annuler
      </button>
    </form>
  );
}
