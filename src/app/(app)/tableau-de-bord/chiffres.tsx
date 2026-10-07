import Link from "next/link";

export type Chiffre = {
  titre: string;
  /** Écrit tel quel : « 3 », « 100 et plus ». */
  valeur: string;
  /** Ce que le chiffre compte, pour qu'il ne soit pas lu autrement. */
  precision: string;
  href: string;
};

/**
 * Les chiffres du tableau de bord. Chacun est compté sur des données lues à
 * l'instant, et dit ce qu'il compte : un nombre sans définition se lit
 * toujours plus large qu'il n'est.
 */
export function ChiffresCles({ chiffres }: { chiffres: readonly Chiffre[] }) {
  return (
    <section aria-labelledby="chiffres-titre" className="mt-6">
      <h2 id="chiffres-titre" className="sr-only">
        En chiffres
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {chiffres.map((chiffre) => (
          <li key={chiffre.titre}>
            <Link
              href={chiffre.href}
              className="border-app-line bg-surface hover:border-secondary/40 block h-full rounded-xl border p-4 transition-colors"
            >
              <p className="text-secondary text-xs">{chiffre.titre}</p>
              <p className="mt-2 font-serif text-2xl tabular-nums">{chiffre.valeur}</p>
              <p className="text-secondary mt-1 text-xs leading-relaxed">{chiffre.precision}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
