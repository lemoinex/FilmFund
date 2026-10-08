"use client";

import { useEffect, useRef, type RefObject } from "react";

import { appliquerMarque, MARQUES, type Marque, type Saisie } from "@/lib/mise-en-forme";

const BOUTON =
  "border-app-line hover:border-secondary focus-visible:border-gold rounded-md border px-2.5 py-1.5 text-xs transition-colors";

/** Ce que chaque bouton montre : son nom en clair, écrit comme il rendra. */
const APPARENCE: Readonly<Record<Marque, string>> = {
  titre: "font-serif",
  sous_titre: "font-serif",
  liste: "",
  gras: "font-semibold",
  italique: "italic",
};

/**
 * Barre d'outils de mise en forme. Chaque bouton pose ou retire des
 * marqueurs dans le texte, autour de la sélection ou en tête de ses lignes :
 * il n'écrit rien d'autre que ce qu'on écrirait à la main.
 *
 * La zone de texte reste la seule source du contenu. La barre lit sa
 * sélection, rend le nouveau texte à l'éditeur, puis replace la sélection une
 * fois le rendu fait.
 */
export function BarreOutils({
  zone,
  texte,
  onChange,
}: {
  zone: RefObject<HTMLTextAreaElement | null>;
  texte: string;
  onChange: (texte: string) => void;
}) {
  // La sélection à rétablir après le prochain rendu : React réécrit la
  // valeur du champ, et le navigateur envoie alors le curseur à la fin.
  const aRetablir = useRef<Saisie | null>(null);

  useEffect(() => {
    const saisie = aRetablir.current;
    const champ = zone.current;
    if (!saisie || !champ || champ.value !== saisie.texte) {
      return;
    }
    aRetablir.current = null;
    champ.focus();
    champ.setSelectionRange(saisie.debut, saisie.fin);
  }, [texte, zone]);

  function poser(marque: Marque) {
    const champ = zone.current;
    if (!champ) {
      return;
    }
    const saisie = appliquerMarque(
      { texte, debut: champ.selectionStart, fin: champ.selectionEnd },
      marque,
    );
    aRetablir.current = saisie;
    onChange(saisie.texte);
  }

  return (
    <div
      role="toolbar"
      aria-label="Mise en forme du texte"
      aria-controls="contenu"
      className="mb-2 flex flex-wrap gap-2"
    >
      {(Object.keys(MARQUES) as Marque[]).map((marque) => (
        <button
          key={marque}
          type="button"
          onClick={() => poser(marque)}
          className={`${BOUTON} ${APPARENCE[marque]}`}
        >
          {MARQUES[marque].libelle}
        </button>
      ))}
    </div>
  );
}
