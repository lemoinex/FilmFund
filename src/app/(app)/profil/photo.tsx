"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";

import { COMPARTIMENT_PHOTOS, initiales, TYPES_PHOTO, verifierFichierPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

import { definirPhoto, retirerPhoto } from "./actions";

/**
 * Photo de profil, ou initiales à défaut, dans un cercle.
 *
 * `unoptimized` : la photo arrive par un lien signé, valable une heure et
 * différent à chaque affichage ; l'optimiseur de Next.js la mettrait en
 * cache sous une adresse qui ne resservira jamais.
 */
export function Avatar({
  url,
  nom,
  taille = "petite",
}: {
  url: string | null | undefined;
  nom: string;
  taille?: "petite" | "grande";
}) {
  const dimensions = taille === "grande" ? "size-24 text-2xl" : "size-9 text-xs";
  return (
    <span
      className={`border-app-line bg-surface-hover text-secondary relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border font-medium ${dimensions}`}
    >
      {url ? (
        <Image
          src={url}
          alt={`Photo de profil de ${nom}`}
          fill
          unoptimized
          sizes={taille === "grande" ? "96px" : "36px"}
          className="object-cover"
        />
      ) : (
        <span aria-hidden="true">{initiales(nom)}</span>
      )}
    </span>
  );
}

/**
 * Envoi de la photo, du navigateur directement vers le stockage, puis
 * rattachement par l'action serveur, qui en contrôle les octets réels.
 *
 * Le nom du fichier est tiré au hasard : le nom d'origine peut contenir des
 * informations personnelles, et un nom neuf évite qu'une ancienne photo
 * reste servie depuis un cache.
 */
export function EnvoiPhoto({ compteId, aPhoto }: { compteId: string; aPhoto: boolean }) {
  const entree = useRef<HTMLInputElement>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [enCours, demarrer] = useTransition();
  const occupe = envoiEnCours || enCours;

  async function envoyer(fichier: File) {
    setErreur(null);

    const probleme = verifierFichierPhoto(fichier);
    if (probleme) {
      setErreur(probleme);
      return;
    }

    const chemin = `${compteId}/${crypto.randomUUID()}.${TYPES_PHOTO[fichier.type]}`;

    setEnvoiEnCours(true);
    const { error } = await createClient()
      .storage.from(COMPARTIMENT_PHOTOS)
      .upload(chemin, fichier, { contentType: fichier.type, upsert: false });
    setEnvoiEnCours(false);

    if (error) {
      setErreur("L'envoi a échoué. Vérifiez votre connexion et réessayez.");
      return;
    }

    demarrer(async () => {
      const donnees = new FormData();
      donnees.set("chemin", chemin);
      const resultat = await definirPhoto(donnees);
      if ("erreur" in resultat) setErreur(resultat.erreur);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={entree}
        type="file"
        accept={Object.keys(TYPES_PHOTO).join(",")}
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
        className="border-app-line hover:bg-surface-hover rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-50"
      >
        {occupe ? "Envoi…" : aPhoto ? "Remplacer la photo" : "Ajouter une photo"}
      </button>

      {aPhoto ? (
        <button
          type="button"
          disabled={occupe}
          onClick={() =>
            demarrer(async () => {
              setErreur(null);
              const resultat = await retirerPhoto();
              if ("erreur" in resultat) setErreur(resultat.erreur);
            })
          }
          className="text-secondary rounded-full px-4 py-2 text-sm transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
        >
          Retirer la photo
        </button>
      ) : null}

      {erreur ? (
        <p role="alert" className="w-full text-xs leading-relaxed text-red-200">
          {erreur}
        </p>
      ) : (
        <p className="text-secondary w-full text-xs">JPEG, PNG ou WebP, 2 Mo au plus.</p>
      )}
    </div>
  );
}
