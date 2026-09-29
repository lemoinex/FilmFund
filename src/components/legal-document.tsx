import {
  LegalFields,
  LegalList,
  LegalPage,
  LegalParagraph,
  LegalSection,
  Placeholder,
  renderRichText,
} from "@/components/legal";
import type { LegalBlock, LegalDocument } from "@/lib/legal-content";

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "paragraph":
      return <LegalParagraph>{renderRichText(block.text)}</LegalParagraph>;
    case "list":
      return <LegalList items={block.items.map((item) => renderRichText(item))} />;
    case "fields":
      return <LegalFields fields={block.fields} />;
  }
}

/**
 * Rendu d'un document légal à partir de son contenu.
 *
 * Ajouter, supprimer ou réordonner une section se fait entièrement dans les
 * données : ce composant parcourt ce qu'on lui donne, sans rien savoir du
 * nombre ni de l'ordre des sections.
 */
export function LegalDocumentPage({ document }: { document: LegalDocument }) {
  return (
    <LegalPage
      title={document.title}
      updatedAt={document.updatedAt ?? <Placeholder>[DATE DE DERNIÈRE MISE À JOUR]</Placeholder>}
    >
      {document.sections.map((section) => (
        <LegalSection key={section.id} id={section.id} title={section.title}>
          {section.blocks.map((block, index) => (
            <Block key={index} block={block} />
          ))}
        </LegalSection>
      ))}
    </LegalPage>
  );
}
