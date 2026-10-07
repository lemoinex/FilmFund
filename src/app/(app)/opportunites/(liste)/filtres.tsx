import Link from "next/link";

import { GENRES } from "@/lib/fiche";
import {
  CATEGORIES_OPPORTUNITE,
  ECHEANCES,
  RECHERCHE_MAX,
  type FiltresCatalogue,
} from "@/lib/opportunites";
import { FORMATS } from "@/lib/projets";

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
 * Filtres du catalogue. Un formulaire en GET, sans script : les filtres
 * tiennent dans l'adresse, qui se partage et se retrouve au retour arrière.
 *
 * `pays` ne propose que les pays qu'une opportunité lue nomme : en proposer
 * d'autres ne mènerait qu'à une liste vide.
 */
export function FiltresOpportunites({
  filtres,
  pays,
  actifs,
}: {
  filtres: FiltresCatalogue;
  pays: readonly (readonly [string, string])[];
  actifs: boolean;
}) {
  return (
    <form method="get" action="/opportunites" role="search" aria-label="Filtrer les opportunités">
      <div>
        <label htmlFor="filtre-q" className="mb-1.5 block text-xs font-medium">
          Rechercher
        </label>
        <input
          id="filtre-q"
          name="q"
          type="search"
          defaultValue={filtres.texte}
          maxLength={RECHERCHE_MAX}
          placeholder="Nom, organisme ou mot de la description"
          className={CHAMP}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Choix
          nom="categorie"
          libelle="Type"
          valeur={filtres.categorie}
          options={Object.entries(CATEGORIES_OPPORTUNITE)}
        />
        <Choix nom="pays" libelle="Pays éligible" valeur={filtres.pays} options={pays} />
        <Choix
          nom="format"
          libelle="Type de projet"
          valeur={filtres.format}
          options={Object.entries(FORMATS)}
        />
        <Choix
          nom="genre"
          libelle="Genre"
          valeur={filtres.genre}
          options={Object.entries(GENRES)}
        />
        <Choix
          nom="echeance"
          libelle="Date limite"
          valeur={filtres.echeance}
          options={Object.entries(ECHEANCES)}
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
            href="/opportunites"
            className="text-secondary hover:text-light text-xs transition-colors"
          >
            Retirer les filtres
          </Link>
        ) : null}
      </div>
    </form>
  );
}
