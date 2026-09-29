/**
 * Squelette du tableau de bord pendant le chargement des projets.
 *
 * Mêmes proportions que la page chargée, pour éviter qu'elle ne saute à
 * l'arrivée des données. Le pulsé est neutralisé par la règle globale
 * `prefers-reduced-motion`.
 */
export default function ChargementTableauDeBord() {
  return (
    <div className="flex min-h-full">
      <div className="min-w-0 flex-1 px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
        <p role="status" className="sr-only">
          Chargement du tableau de bord…
        </p>

        <div aria-hidden="true" className="animate-pulse">
          <div className="border-app-line flex justify-between border-b pb-4">
            <div className="bg-surface-hover h-4 w-24 rounded" />
            <div className="bg-surface-hover h-6 w-28 rounded-full" />
          </div>

          <div className="mt-8 flex gap-5">
            <div className="bg-surface-hover h-32 w-24 rounded-lg" />
            <div className="flex-1 space-y-4 pt-2">
              <div className="bg-surface-hover h-8 w-2/3 rounded" />
              <div className="flex gap-2">
                <div className="bg-surface-hover h-6 w-24 rounded-md" />
                <div className="bg-surface-hover h-6 w-24 rounded-md" />
              </div>
            </div>
          </div>

          <div className="border-app-line mt-8 flex gap-6 border-b pb-3">
            {[16, 14, 14, 20, 20].map((largeur, index) => (
              <div
                key={index}
                className="bg-surface-hover h-4 rounded"
                style={{ width: `${largeur * 4}px` }}
              />
            ))}
          </div>

          <div className="bg-surface border-app-line mt-6 h-28 rounded-xl border" />

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="bg-surface border-app-line h-40 rounded-xl border" />
            ))}
          </div>
        </div>
      </div>

      <div aria-hidden="true" className="border-app-line hidden w-56 shrink-0 border-l xl:block" />
    </div>
  );
}
