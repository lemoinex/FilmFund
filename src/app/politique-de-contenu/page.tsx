import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document";
import { getLegalDocument } from "@/lib/legal-content";

const document = getLegalDocument("politique-de-contenu");

export const metadata: Metadata = {
  title: `${document.title} — FilmFund Africa`,
  description: document.description,
  // Comme les autres pages légales : pas d'indexation tant que la plateforme est en accès privé.
  robots: { index: false, follow: true },
};

export default function PolitiqueDeContenu() {
  return <LegalDocumentPage document={document} />;
}
