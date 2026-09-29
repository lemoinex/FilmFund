import { STATUTS_DOCUMENT } from "@/lib/documents";
import type { DocumentStatus } from "@/lib/supabase/types";

const TONS: Record<DocumentStatus, string> = {
  brouillon: "bg-surface-hover text-secondary",
  en_relecture: "border border-gold/40 text-gold",
  finalise: "bg-gold/12 text-gold",
};

/** Statut d'un document : écrit en toutes lettres, la couleur ne fait que l'appuyer. */
export function BadgeStatut({ statut }: { statut: DocumentStatus }) {
  return (
    <span className={`shrink-0 rounded-md px-2.5 py-1 text-xs ${TONS[statut]}`}>
      {STATUTS_DOCUMENT[statut]}
    </span>
  );
}
