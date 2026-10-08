import { estMisEnForme, lireMiseEnForme, type Segment } from "@/lib/mise-en-forme";

/**
 * Le texte d'un document, tel qu'il se lit : ses marqueurs rendus en titres,
 * en listes, en gras et en italique.
 *
 * Rien n'est injecté : chaque élément est construit à partir du texte, qui
 * reste du texte. Un document dont le type garde son texte brut — un
 * scénario — est rendu tel qu'il est écrit, retours à la ligne compris.
 *
 * Les titres d'un document sont de niveau 2 et 3 : le niveau 1 est le titre
 * de la page qui le montre.
 */
export function TexteMisEnForme({ texte, type }: { texte: string; type: string }) {
  if (!estMisEnForme(type)) {
    return <div className="text-pretty whitespace-pre-line">{texte}</div>;
  }

  return (
    <div className="space-y-4 text-pretty">
      {lireMiseEnForme(texte).map((bloc, rang) => {
        if (bloc.type === "titre") {
          return bloc.niveau === 1 ? (
            <h2 key={rang} className="pt-4 font-serif text-2xl leading-snug first:pt-0">
              <Segments segments={bloc.segments} />
            </h2>
          ) : (
            <h3 key={rang} className="pt-2 font-serif text-xl leading-snug first:pt-0">
              <Segments segments={bloc.segments} />
            </h3>
          );
        }
        if (bloc.type === "liste") {
          return (
            <ul key={rang} className="list-disc space-y-1.5 pl-5">
              {bloc.elements.map((element, numero) => (
                <li key={numero}>
                  <Segments segments={element} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={rang}>
            {bloc.lignes.map((ligne, numero) => (
              <span key={numero}>
                {numero > 0 ? <br /> : null}
                <Segments segments={ligne} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Segments({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, rang) =>
        segment.gras ? (
          <strong key={rang} className="font-semibold">
            {segment.texte}
          </strong>
        ) : segment.italique ? (
          <em key={rang}>{segment.texte}</em>
        ) : (
          <span key={rang}>{segment.texte}</span>
        ),
      )}
    </>
  );
}
