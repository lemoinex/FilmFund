/*
 * Icones dessinees a la main : trait de 1.5 sur une grille de 24, meme
 * langage graphique partout. Evite d'ajouter une bibliotheque d'icones
 * entiere pour une douzaine de pictogrammes.
 */

type IconProps = {
  className?: string;
};

function base(className?: string) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };
}

/** Clap de cinema, utilise comme marque. */
export function ClapperIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 10.5h18V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19v-8.5Z" />
      <path d="m3.6 10.5-.5-2.9a1.5 1.5 0 0 1 1.2-1.7l13.8-2.4a1.5 1.5 0 0 1 1.7 1.2l.5 2.9" />
      <path d="m8.2 4.8 1.5 4.6M13.4 3.9l1.5 4.6" />
    </svg>
  );
}

/** Contour stylise du continent africain. */
export function AfricaIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M8.2 2.8h7.3l1.6 3.4-1.1 3.3.9 3-2.4 3.5-1 4.3-2.6 2.4-1.6-2.6.6-3.4-2.6-2.8-1.6-4.2 1.4-2.6-1.5-2.9 2.6-1.4Z" />
    </svg>
  );
}

/** Groupe de personnes. */
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.4a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.2 14.2a5.5 5.5 0 0 1 3.3 5.8" />
    </svg>
  );
}

/** Assistance par intelligence artificielle. */
export function SparkIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3.2 13.7 8 18.5 9.7 13.7 11.4 12 16.2 10.3 11.4 5.5 9.7 10.3 8 12 3.2Z" />
      <path d="M18 16.4 18.8 18.6 21 19.4 18.8 20.2 18 22.4 17.2 20.2 15 19.4 17.2 18.6 18 16.4Z" />
    </svg>
  );
}

/** Bouclier, pour la protection des donnees. */
export function ShieldIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 2.8 20 5.6v6c0 4.3-3.2 8.2-8 9.6-4.8-1.4-8-5.3-8-9.6v-6L12 2.8Z" />
      <path d="m8.9 11.9 2.2 2.2 4-4.3" />
    </svg>
  );
}

/** Etiquette : plans et quotas. */
export function TagIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l7.9 7.9a1.4 1.4 0 0 1 0 2l-6.1 6.1a1.4 1.4 0 0 1-2 0L3.5 12.6Z" />
      <circle cx="8.2" cy="8.2" r="1.4" />
    </svg>
  );
}

/** Plume : ecriture et developpement narratif. */
export function QuillIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20.4 3.6C13.8 4.3 9.5 6.9 7.4 11.4c-1 2.2-1.3 4.4-1 6.6 2.2.3 4.4 0 6.6-1 4.5-2.1 7.1-6.4 7.4-13.4Z" />
      <path d="M13.6 10.4 3.8 20.2" />
    </svg>
  );
}

/** Document professionnel. */
export function DocumentIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M13.4 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.4l-5.6-5.6Z" />
      <path d="M13.4 2.8v5.6H19" />
      <path d="M8.6 13h6.8M8.6 16.6h4.6" />
    </svg>
  );
}

/** Storyboard : grille de vignettes. */
export function StoryboardIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4" width="8" height="6.4" rx="1" />
      <rect x="13" y="4" width="8" height="6.4" rx="1" />
      <rect x="3" y="13.6" width="8" height="6.4" rx="1" />
      <rect x="13" y="13.6" width="8" height="6.4" rx="1" />
    </svg>
  );
}

/** Gestion de projet : colonnes de suivi. */
export function KanbanIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3.6" width="18" height="16.8" rx="2" />
      <path d="M8.4 8v8.6M15.6 8v5.2" />
    </svg>
  );
}

/** Camera de cinema. */
export function CameraIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="2.8" y="7.6" width="12.4" height="9" rx="1.8" />
      <path d="m15.2 12.4 5-2.9v5.8l-5-2.9Z" />
      <circle cx="6.6" cy="5" r="1.8" />
      <circle cx="11.4" cy="5" r="1.8" />
    </svg>
  );
}

/** Coche, pour les listes de benefices. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="m4.8 12.4 4.6 4.6 9.8-10.4" />
    </svg>
  );
}

/** Fleche vers la droite, pour les appels a l'action. */
export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4.4 12h15.2M13.6 6l6 6-6 6" />
    </svg>
  );
}

/** Lecture, pour le bouton de presentation. */
export function PlayIcon({ className }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m10 8.6 6 3.4-6 3.4V8.6Z" />
    </svg>
  );
}
