import { useEffect, useState, type RefObject } from "react";

/**
 * Message d'un formulaire, limité à son dernier envoi.
 *
 * `useActionState` garde le résultat d'une action tant que le formulaire
 * reste affiché. Une erreur d'ajout survivait ainsi à une autre action
 * réussie sur la même page — supprimer une ligne, changer un rôle — et
 * laissait croire que quelque chose venait d'échouer.
 *
 * Règle : dès qu'un autre formulaire de la page est envoyé, le message se
 * masque ; un nouveau résultat de ce formulaire-ci le fait réapparaître.
 * L'écoute porte sur l'événement `submit`, émis aussi bien par les
 * formulaires à action que par ceux envoyés à la main.
 */
export function useMessageFormulaire<Etat>(
  etat: Etat,
  formulaire: RefObject<HTMLFormElement | null>,
): Etat | null {
  const [masque, setMasque] = useState(false);
  const [etatVu, setEtatVu] = useState(etat);

  // Nouveau résultat de ce formulaire : on l'affiche. Ajustement pendant le
  // rendu, et non dans un effet, pour ne pas afficher un rendu intermédiaire.
  if (etat !== etatVu) {
    setEtatVu(etat);
    setMasque(false);
  }

  useEffect(() => {
    const surEnvoi = (evenement: Event) => {
      if (evenement.target !== formulaire.current) {
        setMasque(true);
      }
    };
    // Phase de capture : l'écoute précède tout gestionnaire qui arrêterait
    // la propagation.
    document.addEventListener("submit", surEnvoi, true);
    return () => document.removeEventListener("submit", surEnvoi, true);
  }, [formulaire]);

  return masque ? null : etat;
}
