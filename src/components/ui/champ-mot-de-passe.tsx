"use client";

import { useState } from "react";

/**
 * Champ de mot de passe avec son bouton « Afficher ».
 *
 * Sur un téléphone, une majuscule automatique ou un espace glissé par le
 * clavier donnent un refus que rien ne permet de comprendre tant que la saisie
 * reste masquée. Le bouton porte un texte, pas une icône seule, et ne
 * soumet pas le formulaire.
 */
export function PasswordField({
  label,
  name,
  id = name,
  autoComplete,
  aide,
}: {
  label: string;
  name: string;
  id?: string;
  autoComplete: "current-password" | "new-password";
  aide?: string;
}) {
  const [visible, setVisible] = useState(false);
  const aideId = aide ? `${id}-aide` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          // Affiché, le champ devient un champ de texte : sans ces réglages le
          // clavier y remettrait majuscule et correction automatiques.
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={aideId}
          className="border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border py-3 pr-24 pl-4 text-sm transition-colors outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((actuel) => !actuel)}
          aria-pressed={visible}
          aria-controls={id}
          className="text-light-muted hover:text-gold focus-visible:outline-gold absolute inset-y-0 right-0 rounded-r-lg px-4 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          {visible ? "Masquer" : "Afficher"}
          <span className="sr-only"> le mot de passe</span>
        </button>
      </div>
      {aide ? (
        <p id={aideId} className="text-light-muted mt-2 text-xs leading-relaxed">
          {aide}
        </p>
      ) : null}
    </div>
  );
}
