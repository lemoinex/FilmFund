import Image from "next/image";

import { ClapperIcon } from "@/components/icons";

/**
 * Couverture d'un projet, au format affiche (3:4).
 *
 * `unoptimized` : l'image arrive par un lien signé, valable une heure et
 * différent à chaque affichage. L'optimiseur de Next.js la mettrait en
 * cache sous une adresse qui ne resservira jamais, et consommerait du quota
 * pour rien. Le chargement différé et le dimensionnement restent assurés.
 *
 * Sans image, un emplacement sombre décoratif tient la place.
 */
export function Couverture({
  url,
  titre,
  className = "h-28 w-20 sm:h-32 sm:w-24",
  prioritaire = false,
}: {
  url: string | null | undefined;
  titre: string;
  className?: string;
  prioritaire?: boolean;
}) {
  return (
    <div
      className={`border-app-line relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[linear-gradient(160deg,var(--surface-hover),var(--sidebar-bg))] ${className}`}
    >
      {url ? (
        <Image
          src={url}
          alt={`Couverture du projet ${titre}`}
          fill
          unoptimized
          priority={prioritaire}
          sizes="96px"
          className="object-cover"
        />
      ) : (
        <ClapperIcon className="text-gold/70 size-8" />
      )}
    </div>
  );
}
