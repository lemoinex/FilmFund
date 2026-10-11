import { fichePersonnageRemplie, type ChampFichePersonnage } from "@/lib/fiche";

/**
 * La fiche détaillée d'un personnage, à la lecture : ses champs remplis, et
 * rien pour ceux qui ne le sont pas. Un personnage sans fiche détaillée
 * n'affiche rien de plus que sa description.
 */
export function FicheDetaillee({
  personnage,
}: {
  personnage: Readonly<Partial<Record<ChampFichePersonnage, string | null>>>;
}) {
  const champs = fichePersonnageRemplie(personnage);
  if (!champs.length) return null;

  return (
    <dl className="border-navy-line mt-3 space-y-2 border-l pl-4">
      {champs.map(({ cle, libelle, valeur }) => (
        <div key={cle}>
          <dt className="text-light-muted text-xs">{libelle}</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-pretty break-words whitespace-pre-line">
            {valeur}
          </dd>
        </div>
      ))}
    </dl>
  );
}
