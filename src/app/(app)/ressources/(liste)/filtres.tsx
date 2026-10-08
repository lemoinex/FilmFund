import Link from "next/link";

import {
  CATEGORIES_RESSOURCE,
  RECHERCHE_RESSOURCES_MAX,
  TYPES_RESSOURCE,
  type FiltresRessources as Filtres,
} from "@/lib/ressources";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-3 py-2.5 text-sm transition-colors outline-none";

function Choix({
  nom,
  libelle,
  valeur,
  options,
}: {
  nom: string;
  libelle: string;
  valeur: string | null;
  options: readonly (readonly [string, string])[];
}) {
  const id = `filtre-${nom}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium">
        {libelle}
      </label>
      <select id={id} name={nom} defaultValue={valeur ?? ""} className={CHAMP}>
        <option value="">Tous</option>
        {options.map(([code, nomOption]) => (
          <option key={code} value={code}>
            {nomOption}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Filtres de la bibliothèque. Un formulaire en GET, sans script : les filtres
 * tiennent dans l'adresse, qui se partage et se retrouve au retour arrière.
 * Rien ne part à chaque frappe ; le filtrage se fait sur les contenus déjà
 * chargés avec la page.
 */
export function FiltresRessources({ filtres, actifs }: { filtres: Filtres; actifs: boolean }) {
  return (
    <form method="get" action="/ressources" role="search" aria-label="Filtrer les ressources">
      <div>
        <label htmlFor="filtre-q" className="mb-1.5 block text-xs font-medium">
          Rechercher
        </label>
        <input
          id="filtre-q"
          name="q"
          type="search"
          defaultValue={filtres.texte}
          maxLength={RECHERCHE_RESSOURCES_MAX}
          placeholder="Mot du titre ou de la description"
          className={CHAMP}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Choix
          nom="categorie"
          libelle="Catégorie"
          valeur={filtres.categorie}
          options={Object.entries(CATEGORIES_RESSOURCE)}
        />
        <Choix
          nom="type"
          libelle="Type"
          valeur={filtres.type}
          options={Object.entries(TYPES_RESSOURCE)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
        >
          Filtrer
        </button>
        {actifs ? (
          <Link
            href="/ressources"
            className="text-secondary hover:text-light rounded-full px-3 py-2 text-sm transition-colors"
          >
            Tout afficher
          </Link>
        ) : null}
      </div>
    </form>
  );
}
