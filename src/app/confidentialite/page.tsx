import type { Metadata } from "next";

import { LegalDocumentPage } from "@/components/legal-document";
import { getLegalDocument } from "@/lib/legal-content";

const document = getLegalDocument("confidentialite");

export const metadata: Metadata = {
  title: `${document.title} — filmfundAfrica`,
  description: document.description,
  // Document encore incomplet : pas d'indexation tant qu'il n'est pas finalise.
  robots: { index: false, follow: true },
};

export default function Confidentialite() {
  return <LegalDocumentPage document={document} />;
}
