"use client";

import { useRef, useState, useTransition } from "react";

import { COMPARTIMENT_IMAGES, TYPES_IMAGE, verifierFichier, type DossierImage } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";

type Resultat = { erreur: string } | { ok: true };

/**
 * Envoi d'une image, du navigateur directement vers le stockage.
 *
 * Direct, et non par une action serveur : celles-ci plafonnent le corps
 * d'une requête à 1 Mo. Les politiques de stockage contrôlent l'envoi ;
 * l'action `rattacher` enregistre ensuite le chemin, et supprime le fichier
 * si ce rattachement échoue.
 *
 * Le nom du fichier est tiré au hasard : le nom d'origine peut contenir des
 * informations personnelles, et un nom unique évite qu'une ancienne version
 * reste servie depuis un cache.
 */
export function EnvoiImage({
  projetId,
  dossier,
  champs,
  rattacher,
  retirer,
  libelle,
  aImage,
  compact = false,
}: {
  projetId: string;
  dossier: DossierImage;
  /** Champs transmis aux actions, en plus du projet et du chemin. */
  champs?: Record<string, string>;
  rattacher: (formData: FormData) => Promise<Resultat>;
  retirer?: (formData: FormData) => Promise<Resultat>;
  libelle: string;
  aImage: boolean;
  compact?: boolean;
}) {
  const entree = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [enCours, demarrer] = useTransition();
  const occupe = envoiEnCours || enCours;

  function donnees(extra: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("projet", projetId);
    for (const [cle, valeur] of Object.entries({ ...champs, ...extra })) {
      formData.set(cle, valeur);
    }
    return formData;
  }

  async function envoyer(fichier: File) {
    setErreur(null);

    const probleme = verifierFichier(fichier);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    const chemin = `${projetId}/${dossier}/${crypto.randomUUID()}.${TYPES_IMAGE[fichier.type]}`;

    setEnvoiEnCours(true);
    const { error } = await createClient()
      .storage.from(COMPARTIMENT_IMAGES)
      .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
    setEnvoiEnCours(false);

    if (error) {
      setErreur("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
      return;
    }

    demarrer(async () => {
      const resultat = await rattacher(donnees({ chemin }));
      if ("erreur" in resultat) setErreur(resultat.erreur);
    });
  }

  const classesBouton = compact
    ? "text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors disabled:opacity-50"
    : "border-app-line hover:bg-surface-hover rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={entree}
        type="file"
        accept={Object.keys(TYPES_IMAGE).join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(evenement) => {
          const fichier = evenement.target.files?.[0];
          // Réinitialisé aussitôt : choisir deux fois le même fichier doit
          // relancer l'envoi.
          evenement.target.value = "";
          if (fichier) void envoyer(fichier);
        }}
      />
      <button
        type="button"
        disabled={occupe}
        onClick={() => entree.current?.click()}
        className={classesBouton}
      >
        {occupe ? "Envoi…" : aImage ? `Remplacer ${libelle}` : `Ajouter ${libelle}`}
      </button>

      {aImage && retirer ? (
        <button
          type="button"
          disabled={occupe}
          onClick={() =>
            demarrer(async () => {
              setErreur(null);
              const resultat = await retirer(donnees());
              if ("erreur" in resultat) setErreur(resultat.erreur);
            })
          }
          className={
            compact
              ? "text-secondary rounded-full px-3 py-1.5 text-xs transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
              : "text-secondary rounded-full px-4 py-2 text-sm transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
          }
        >
          Retirer {libelle}
        </button>
      ) : null}

      {erreur ? (
        <p role="alert" className="w-full text-xs leading-relaxed text-red-200">
          {erreur}
        </p>
      ) : null}
      {!compact && !erreur ? (
        <p className="text-secondary w-full text-xs">JPEG, PNG ou WebP, 5 Mo au plus.</p>
      ) : null}
    </div>
  );
}
