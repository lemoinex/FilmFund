import type { HTMLAttributes, ReactNode } from "react";

/*
 * Briques de formulaire partagées par les pages d'authentification. Mêmes
 * jetons de couleur et même typographie que la landing page.
 */

export function Field({
  label,
  name,
  id = name,
  type = "text",
  autoComplete,
  required,
  placeholder,
  aide,
  defaultValue,
  maxLength,
  inputMode,
}: {
  label: string;
  name: string;
  /** À préciser quand deux formulaires de la page emploient le même nom de champ. */
  id?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
  aide?: string;
  defaultValue?: string;
  maxLength?: number;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  const aideId = aide ? `${id}-aide` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
        {!required ? <span className="text-light-muted font-normal"> (facultatif)</span> : null}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-describedby={aideId}
        className="border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none"
      />
      {aide ? (
        <p id={aideId} className="text-light-muted mt-2 text-xs leading-relaxed">
          {aide}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Message de retour du serveur.
 *
 * `role="alert"` et `aria-live` : sans cela, une erreur affichée après
 * soumission reste invisible pour un lecteur d'écran.
 */
export function Message({ ton, children }: { ton: "erreur" | "succes"; children: ReactNode }) {
  const erreur = ton === "erreur";

  return (
    <p
      role={erreur ? "alert" : "status"}
      aria-live="polite"
      className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${
        erreur
          ? "border-red-400/40 bg-red-400/10 text-red-200"
          : "border-gold/40 bg-gold/10 text-gold-bright"
      }`}
    >
      {children}
    </p>
  );
}

export function SubmitButton({ children, enCours }: { children: ReactNode; enCours?: boolean }) {
  return (
    <button
      type="submit"
      disabled={enCours}
      className="bg-gold text-navy hover:bg-gold-bright w-full rounded-full px-6 py-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
    >
      {enCours ? "Un instant…" : children}
    </button>
  );
}
