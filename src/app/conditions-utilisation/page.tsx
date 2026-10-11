import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document";
import { getLegalDocument } from "@/lib/legal-content";

const document = getLegalDocument("conditions-utilisation");

export const metadata: Metadata = {
  title: `${document.title} — FilmFund Africa`,
  description: document.description,
  // Comme les autres pages légales : pas d'indexation tant que la plateforme est en accès privé.
  robots: { index: false, follow: true },
};

export default function ConditionsUtilisation() {
  return <LegalDocumentPage document={document} />;
}
