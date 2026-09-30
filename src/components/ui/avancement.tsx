/**
 * Barre d'avancement accessible.
 *
 * `role="progressbar"` et ses valeurs : un lecteur d'écran annonce
 * « 38 % » là où l'œil voit la barre. Le libellé textuel reste affiché à
 * côté par l'appelant : la couleur ne porte jamais seule l'information.
 */
export function BarreAvancement({ pourcent, libelle }: { pourcent: number; libelle: string }) {
  const valeur = Math.min(100, Math.max(0, Math.round(pourcent)));

  return (
    <div
      role="progressbar"
      aria-valuenow={valeur}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={libelle}
      className="bg-app-line/60 h-2 overflow-hidden rounded-full"
    >
      <div
        className="bg-gold h-full rounded-full transition-[width] duration-500"
        style={{ width: `${valeur}%` }}
      />
    </div>
  );
}
