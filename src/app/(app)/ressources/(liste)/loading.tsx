/**
 * Squelette de la bibliothèque pendant sa lecture. Le pulsé est neutralisé
 * par la règle globale `prefers-reduced-motion`.
 *
 * Rangé dans le groupe `(liste)` : il ne couvre pas la page d'une ressource,
 * qui répondrait sinon 200 à une adresse inconnue.
 */
export default function ChargementRessources() {
  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <p role="status" className="sr-only">
        Chargement des ressources…
      </p>

      <div aria-hidden="true" className="animate-pulse">
        <div className="bg-surface-hover h-9 w-56 rounded" />
        <div className="bg-surface-hover mt-4 h-4 w-full max-w-2xl rounded" />
        <div className="bg-surface border-app-line mt-8 h-40 rounded-xl border" />
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="bg-surface border-app-line h-40 rounded-xl border" />
          ))}
        </div>
      </div>
    </div>
  );
}
