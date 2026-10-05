import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CameraIcon } from "@/components/icons";
import { BoutonConfirme } from "@/components/ui/confirmation";
import { CATEGORIES_MATERIEL, EQUIPEMENTS_MAX, REGLAGES_PAR_DEFAUT } from "@/lib/materiel";
import {
  besoinElectrique,
  formaterIntensite,
  formaterPuissance,
  puissanceLigne,
} from "@/lib/materiel-calculs";
import { createClient } from "@/lib/supabase/server";
import type { GearCategory } from "@/lib/supabase/types";

import { OngletsProjet } from "../onglets";
import { supprimerEquipement } from "./actions";
import { FormulaireEquipement, FormulaireReglages, type EquipementEditable } from "./formulaire";

export const metadata: Metadata = {
  title: "Matériel — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function MaterielPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ equipement?: string }>;
}) {
  const { id } = await params;
  const { equipement: equipementEnModification } = await searchParams;
  const supabase = await createClient();

  const [
    { data: projet },
    { data: peutEditer },
    { data: budget },
    { data: equipements },
    { data: reglagesDuProjet },
  ] = await Promise.all([
    supabase.from("projects").select("id, title").eq("id", id).maybeSingle(),
    supabase.rpc("peut_editer_contenu", { p_project_id: id }),
    supabase.rpc("peut_gerer_budget", { p_project_id: id }),
    supabase
      .from("project_gear")
      .select("id, category, label, quantity, unit_power_watts, simultaneous")
      .eq("project_id", id)
      .order("created_at")
      // Bornée comme l'ajout l'est.
      .limit(EQUIPEMENTS_MAX),
    supabase
      .from("project_power_settings")
      .select("voltage_volts, generator_margin_percent")
      .eq("project_id", id)
      .maybeSingle(),
  ]);

  if (!projet) {
    notFound();
  }

  const liste = equipements ?? [];
  const reglages = {
    tension: reglagesDuProjet?.voltage_volts ?? REGLAGES_PAR_DEFAUT.tension,
    marge: reglagesDuProjet?.generator_margin_percent ?? REGLAGES_PAR_DEFAUT.marge,
  };
  const besoin = besoinElectrique(liste, reglages);

  const groupes = (Object.keys(CATEGORIES_MATERIEL) as GearCategory[])
    .map((categorie) => ({
      categorie,
      equipements: liste.filter((e) => e.category === categorie),
    }))
    .filter((g) => g.equipements.length > 0);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <Link
        href={`/projets/${projet.id}`}
        className="text-secondary hover:text-light text-sm transition-colors"
      >
        ← {projet.title}
      </Link>

      <h1 className="mt-6 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
        Matériel
      </h1>
      <p className="text-secondary mt-3 text-sm">
        {liste.length
          ? `${liste.length} ligne${liste.length > 1 ? "s" : ""} de matériel pour le tournage.`
          : "Aucun matériel pour l'instant."}
      </p>

      <OngletsProjet projetId={projet.id} actif="materiel" budget={budget === true} />

      {liste.length || peutEditer ? (
        <section
          aria-labelledby="besoin-titre"
          className="border-app-line bg-surface mt-10 rounded-xl border p-5"
        >
          <h2 id="besoin-titre" className="text-sm font-medium">
            Besoin électrique
          </h2>

          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-secondary text-xs">Charge simultanée</dt>
              <dd className="text-gold mt-1 font-serif text-2xl tabular-nums">
                {formaterPuissance(besoin.simultanee)}
              </dd>
            </div>
            <div>
              <dt className="text-secondary text-xs">Intensité sous {reglages.tension} V</dt>
              <dd className="text-gold mt-1 font-serif text-2xl tabular-nums">
                {formaterIntensite(besoin.intensite)}
              </dd>
            </div>
            <div>
              <dt className="text-secondary text-xs">Groupe électrogène conseillé</dt>
              <dd className="text-gold mt-1 font-serif text-2xl tabular-nums">
                {formaterPuissance(besoin.groupe)}
              </dd>
            </div>
          </dl>

          <ul className="text-secondary mt-5 space-y-1 text-xs leading-relaxed">
            <li>
              Charge simultanée : somme des quantités × puissances des équipements qui fonctionnent
              en même temps. Puissance installée, tout compris :{" "}
              {formaterPuissance(besoin.installee)}.
            </li>
            <li>
              Intensité : charge simultanée ÷ tension ({reglages.tension} V, en monophasé, sans
              facteur de puissance).
            </li>
            <li>Groupe conseillé : charge simultanée + {reglages.marge} % de marge.</li>
            {besoin.sansPuissance ? (
              <li className="text-light">
                {besoin.sansPuissance} ligne{besoin.sansPuissance > 1 ? "s" : ""} sans puissance
                renseignée {besoin.sansPuissance > 1 ? "ne sont pas comptées" : "n'est pas comptée"}
                .
              </li>
            ) : null}
          </ul>

          <p className="border-app-line mt-5 border-t pt-4 text-xs leading-relaxed">
            Ces chiffres sont des additions et des divisions, pas une étude électrique. La tension
            de {REGLAGES_PAR_DEFAUT.tension} V et la marge de {REGLAGES_PAR_DEFAUT.marge} %
            proposées par défaut ne sont pas une norme : faites valider les réglages et le résultat
            par un chef électricien, et relevez chaque puissance sur la plaque de l&apos;appareil.
          </p>

          {peutEditer ? (
            <div className="border-app-line mt-5 border-t pt-5">
              <FormulaireReglages
                // Les valeurs en base font foi : le formulaire les reprend
                // dès qu'elles changent.
                key={`${reglages.tension}-${reglages.marge}`}
                projetId={projet.id}
                tension={reglages.tension}
                marge={reglages.marge}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {groupes.length ? (
        <div className="mt-10 space-y-10">
          {groupes.map(({ categorie, equipements: equipementsCategorie }) => (
            <section key={categorie} aria-labelledby={`categorie-${categorie}`}>
              <h2 id={`categorie-${categorie}`} className="text-gold text-sm font-medium">
                {CATEGORIES_MATERIEL[categorie]}
              </h2>
              <ul className="border-app-line mt-3 divide-y divide-[var(--app-line)] rounded-xl border">
                {equipementsCategorie.map((equipement) => (
                  <li
                    key={equipement.id}
                    id={`equipement-${equipement.id}`}
                    className="scroll-mt-8 p-4 sm:px-5"
                  >
                    {equipement.id === equipementEnModification && peutEditer ? (
                      <FormulaireEquipement projetId={projet.id} equipement={equipement} />
                    ) : (
                      <LigneEquipement
                        projetId={projet.id}
                        equipement={equipement}
                        peutEditer={peutEditer === true}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="border-app-line bg-surface mt-10 rounded-xl border p-8 text-center">
          <CameraIcon className="text-gold mx-auto size-9" />
          <p className="mt-4 font-serif text-xl">La liste de matériel est vide</p>
          <p className="text-secondary mx-auto mt-2 max-w-md text-sm leading-relaxed text-pretty">
            {peutEditer
              ? "Listez le matériel du tournage, avec la puissance de ce qui se branche : le besoin électrique se calcule au fur et à mesure."
              : "Le matériel listé par l'équipe apparaîtra ici."}
          </p>
        </div>
      )}

      {peutEditer ? (
        <section
          aria-labelledby="ajout-equipement"
          className="border-app-line mt-12 border-t pt-10"
        >
          <h2 id="ajout-equipement" className="font-serif text-2xl leading-tight">
            Nouvel équipement
          </h2>
          <p className="text-secondary mt-2 text-sm">
            Ni loueur ni prix ici : les prix se tiennent au budget.
          </p>
          <div className="mt-6">
            {liste.length < EQUIPEMENTS_MAX ? (
              <FormulaireEquipement projetId={projet.id} />
            ) : (
              <p className="text-secondary text-sm">
                La liste a atteint ses {EQUIPEMENTS_MAX} lignes : regroupez-en ou supprimez-en avant
                d&apos;en ajouter.
              </p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LigneEquipement({
  projetId,
  equipement,
  peutEditer,
}: {
  projetId: string;
  equipement: EquipementEditable;
  peutEditer: boolean;
}) {
  const puissance = puissanceLigne(equipement);

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {equipement.label}
          {equipement.quantity > 1 ? (
            <span className="text-secondary font-normal"> × {equipement.quantity}</span>
          ) : null}
        </p>
        <p className="text-secondary mt-1 text-xs">
          {puissance === null
            ? "Puissance non renseignée"
            : puissance === 0
              ? "Ne se branche pas"
              : equipement.quantity > 1
                ? `${equipement.quantity} × ${formaterPuissance(equipement.unit_power_watts ?? 0)} = ${formaterPuissance(puissance)}`
                : formaterPuissance(puissance)}
          {/* Écrit en toutes lettres : la présentation seule ne le dirait pas. */}
          {puissance && !equipement.simultaneous ? " · hors charge simultanée" : null}
        </p>
      </div>

      {peutEditer ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/projets/${projetId}/materiel?equipement=${equipement.id}#equipement-${equipement.id}`}
            className="text-secondary hover:bg-surface-hover hover:text-light rounded-full px-3 py-1.5 text-xs transition-colors"
          >
            Modifier
            <span className="sr-only"> {equipement.label}</span>
          </Link>
          <BoutonConfirme
            action={supprimerEquipement}
            champs={{ projet: projetId, equipement: equipement.id }}
            libelle="Supprimer"
            confirmation="Supprimer l'équipement"
            discret
          />
        </div>
      ) : null}
    </div>
  );
}
