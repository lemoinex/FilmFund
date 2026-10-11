import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { STATUTS_DOCUMENT, TYPES_DOCUMENT } from "@/lib/documents";
import { FORMATS_EXPORT } from "@/lib/exports";
import { STATUTS_OPPORTUNITE } from "@/lib/opportunites";
import { ETAPES, FORMATS } from "@/lib/projets";
import {
  croiser,
  enNombre,
  ETATS_DEMANDE,
  ETATS_PROPOSITION,
  libelle,
  LIBELLES_ACTION,
  LIBELLES_CONTENU,
  lireComptages,
  nombreDe,
  PRINCIPE_STATISTIQUES,
  totalDe,
  type Comptage,
} from "@/lib/statistiques";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Statistiques — FilmFund Africa",
  robots: { index: false, follow: false },
};

const PLANS: Readonly<Record<string, string>> = {
  gratuit: "Gratuit",
  pro: "Pro",
  studio: "Studio",
};

const TYPES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(TYPES_DOCUMENT).map(([code, type]) => [code, type.libelle]),
);

const EXPORTS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FORMATS_EXPORT).map(([code, format]) => [code, format.libelle]),
);

export default async function StatistiquesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // La base refuserait un non-administrateur ; on préfère ne pas révéler que
  // la page existe.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    notFound();
  }

  // Une seule lecture : des comptages, sans nom, titre, contenu ni montant.
  const { data: brut, error } = await supabase.rpc("statistiques_usage");
  if (error) {
    throw new Error("Lecture des statistiques impossible.");
  }
  const comptages = lireComptages(brut);

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl">Statistiques</h1>
        <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
          {PRINCIPE_STATISTIQUES}
        </p>
      </header>

      <Section id="comptes" titre="Comptes et studios">
        <Chiffres
          lignes={[
            ["Comptes", nombreDe(comptages, "comptes", "total")],
            ["Administrateurs", nombreDe(comptages, "comptes", "administrateurs")],
            ["Comptes suspendus", nombreDe(comptages, "comptes", "suspendus")],
          ]}
        />
        <Repartition
          legende="Studios par plan"
          comptages={comptages}
          domaine="studios_par_plan"
          libelles={PLANS}
          vide="Aucun studio."
        />
      </Section>

      <Section id="projets" titre="Projets">
        <Chiffres lignes={[["Projets", totalDe(comptages, "projets_par_format")]]} />
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          <Repartition
            legende="Par format"
            comptages={comptages}
            domaine="projets_par_format"
            libelles={FORMATS}
            vide="Aucun projet."
          />
          <Repartition
            legende="Par étape"
            comptages={comptages}
            domaine="projets_par_etape"
            libelles={ETAPES}
            vide="Aucun projet."
          />
        </div>
        <Chiffres
          lignes={Object.entries(LIBELLES_CONTENU).map(([cle, texte]) => [
            texte,
            nombreDe(comptages, "contenus", cle),
          ])}
        />
      </Section>

      <Section id="documents" titre="Documents">
        <Croise
          legende={`${enNombre(totalDe(comptages, "documents"))} documents, par type et par statut`}
          premiere="Type"
          comptages={comptages}
          domaine="documents"
          libelles={TYPES}
          etats={STATUTS_DOCUMENT}
          vide="Aucun document."
        />
      </Section>

      <Section id="assistant" titre="Assistant IA">
        <Croise
          legende="Demandes des trente derniers jours, par livrable et par issue"
          premiere="Livrable"
          comptages={comptages}
          domaine="demandes_30j"
          libelles={LIBELLES_ACTION}
          etats={ETATS_DEMANDE}
          vide="Aucune demande depuis trente jours."
        />
        <Croise
          legende="Propositions de l'assistant, depuis l'origine, par livrable et par décision"
          premiere="Livrable"
          comptages={comptages}
          domaine="propositions"
          libelles={LIBELLES_ACTION}
          etats={ETATS_PROPOSITION}
          vide="Aucune proposition."
        />
        <p className="text-light-muted text-xs leading-relaxed">
          Une proposition de lignes — budget, planning, découpage, matériel, personnages — est dite
          acceptée dès qu&apos;une de ses lignes l&apos;a été. Une demande échouée ne coûte pas
          d&apos;unité.
        </p>
      </Section>

      <Section id="exports" titre="Exports et opportunités">
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
          <Repartition
            legende="Exports disponibles, par format"
            comptages={comptages}
            domaine="exports"
            libelles={EXPORTS}
            vide="Aucun export disponible."
            note="Un export expire au bout de trente jours : il n'est alors plus compté."
          />
          <Repartition
            legende="Opportunités du catalogue, par statut"
            comptages={comptages}
            domaine="opportunites"
            libelles={STATUTS_OPPORTUNITE}
            vide="Catalogue vide."
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  id,
  titre,
  children,
}: {
  id: string;
  titre: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`statistiques-${id}`} className="mt-12 space-y-6">
      <h2 id={`statistiques-${id}`} className="font-serif text-xl">
        {titre}
      </h2>
      {children}
    </section>
  );
}

/** Quelques nombres côte à côte, chacun sous son libellé. */
function Chiffres({ lignes }: { lignes: (readonly [string, number])[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {lignes.map(([texte, nombre]) => (
        <div key={texte}>
          <dt className="text-light-muted text-xs">{texte}</dt>
          <dd className="mt-1 text-lg tabular-nums">{enNombre(nombre)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Un domaine, clé par clé. */
function Repartition({
  legende,
  comptages,
  domaine,
  libelles,
  vide,
  note,
}: {
  legende: string;
  comptages: readonly Comptage[];
  domaine: string;
  libelles: Readonly<Record<string, string>>;
  vide: string;
  note?: string;
}) {
  const lignes = croiser(comptages, domaine);

  return (
    <div>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="text-light-muted pb-2 text-left text-xs">{legende}</caption>
        <tbody>
          {lignes.length ? (
            lignes.map((ligne) => (
              <tr key={ligne.cle} className="border-navy-line border-b last:border-b-0">
                <th scope="row" className="py-2 pr-4 font-normal break-words">
                  {libelle(libelles, ligne.cle)}
                </th>
                <td className="py-2 text-right tabular-nums">{enNombre(ligne.total)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="text-light-muted py-2">{vide}</td>
            </tr>
          )}
        </tbody>
      </table>
      {note ? <p className="text-light-muted mt-2 text-xs leading-relaxed">{note}</p> : null}
    </div>
  );
}

/** Un domaine croisé : une ligne par clé, une colonne par état. */
function Croise({
  legende,
  premiere,
  comptages,
  domaine,
  libelles,
  etats,
  vide,
}: {
  legende: string;
  premiere: string;
  comptages: readonly Comptage[];
  domaine: string;
  libelles: Readonly<Record<string, string>>;
  etats: Readonly<Record<string, string>>;
  vide: string;
}) {
  const lignes = croiser(comptages, domaine);
  // Les états connus, dans leur ordre ; puis ceux que la base rendrait sans
  // que l'écran les connaisse, pour qu'aucun nombre ne disparaisse.
  const connus = Object.keys(etats);
  const inconnus = [...new Set(lignes.flatMap((ligne) => Object.keys(ligne.details)))].filter(
    (etat) => !connus.includes(etat),
  );
  const colonnes = [...connus, ...inconnus];

  if (!lignes.length) {
    return (
      <div>
        <p className="text-light-muted text-xs">{legende}</p>
        <p className="border-navy-line text-light-muted mt-2 rounded-xl border border-dashed p-4 text-sm">
          {vide}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <caption className="text-light-muted pb-2 text-left text-xs">{legende}</caption>
        <thead>
          <tr className="text-light-muted border-navy-line border-b text-xs">
            <th scope="col" className="py-2 pr-4 font-normal">
              {premiere}
            </th>
            {colonnes.map((etat) => (
              <th key={etat} scope="col" className="py-2 pr-4 text-right font-normal">
                {libelle(etats, etat)}
              </th>
            ))}
            <th scope="col" className="py-2 text-right font-normal">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((ligne) => (
            <tr key={ligne.cle} className="border-navy-line border-b last:border-b-0">
              <th scope="row" className="py-2 pr-4 font-normal break-words">
                {libelle(libelles, ligne.cle)}
              </th>
              {colonnes.map((etat) => (
                <td key={etat} className="py-2 pr-4 text-right tabular-nums">
                  {enNombre(ligne.details[etat] ?? 0)}
                </td>
              ))}
              <td className="py-2 text-right tabular-nums">{enNombre(ligne.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
