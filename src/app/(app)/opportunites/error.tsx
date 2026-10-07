"use client";

/**
 * Erreur à la lecture du catalogue.
 *
 * Aucun détail technique n'est affiché : le message d'erreur serveur peut
 * contenir des éléments internes. `reset` relance le rendu de la page.
 */
export default function ErreurOpportunites({ reset }: { reset: () => void }) {
  return (
    <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <section
        role="alert"
        className="border-app-line bg-surface mx-auto mt-8 max-w-lg rounded-xl border p-8 text-center"
      >
        <h1 className="font-serif text-2xl">Le catalogue n&apos;a pas pu se charger</h1>
        <p className="text-secondary mt-3 text-sm leading-relaxed">
          Vos données ne sont pas en cause. Réessayez dans un instant.
        </p>
        <button
          type="button"
          onClick={reset}
          className="bg-gold text-navy hover:bg-gold-bright mt-6 rounded-full px-6 py-3 text-sm font-medium transition-colors"
        >
          Réessayer
        </button>
      </section>
    </div>
  );
}
