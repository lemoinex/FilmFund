import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  enDollars,
  enNombre,
  lireLignes,
  moisCourant,
  moisEnClair,
  nombreAppels,
  regrouper,
  reserves,
  volumeDe,
  type CoutsMois,
} from "@/lib/couts-ia";
import { bilanPlafond, enDollars as enDollarsDuPlafond } from "@/lib/plafond-ia";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Coûts de l'IA — filmfundAfrica",
  robots: { index: false, follow: false },
};

export default async function CoutsIaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  // La RLS ne renverrait rien à un non-administrateur ; on préfère ne pas
  // révéler que la page existe.
  const { data: estAdministrateur } = await supabase.rpc("is_admin");
  if (!estAdministrateur) {
    notFound();
  }

  // Une lecture agrégée et bornée, sous la RLS de l'appelant : douze mois,
  // sans détail par studio ni par projet.
  const [{ data: brut, error }, { data: plafond }] = await Promise.all([
    supabase.rpc("couts_ia_par_mois"),
    supabase.rpc("depense_ia_administration"),
  ]);

  if (error) {
    throw new Error("Lecture des coûts de l'IA impossible.");
  }

  const mois = regrouper(lireLignes(brut));
  const cle = moisCourant(new Date());
  const courant = mois.find((m) => m.mois === cle);
  const precedents = mois.filter((m) => m.mois !== cle);
  const bilan = plafond?.[0]
    ? bilanPlafond(Number(plafond[0].depense), Number(plafond[0].plafond))
    : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <header>
        <h1 className="font-serif text-2xl sm:text-3xl">Coûts de l&apos;IA</h1>
        <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
          Ce que les appels aux fournisseurs ont coûté, mois par mois, par agent et par modèle. Les
          montants sont calculés par la plateforme, d&apos;après l&apos;usage que chaque fournisseur
          rapporte et les tarifs relevés à la main dans les profils :{" "}
          <strong className="text-light font-medium">
            seule la facture du fournisseur fait foi.
          </strong>{" "}
          Aucun détail par studio ni par projet n&apos;est montré ici.
        </p>
      </header>

      <section aria-labelledby="mois-courant" className="mt-10">
        <h2 id="mois-courant" className="font-serif text-xl capitalize">
          {moisEnClair(cle)}
        </h2>
        <p className="text-light-muted mt-2 text-xs leading-relaxed">
          Mois civil, compté en UTC, comme le plafond.
        </p>

        {bilan ? (
          <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-light-muted text-xs">Compté ce mois</dt>
              <dd className="mt-1 text-lg tabular-nums">{enDollarsDuPlafond(bilan.depense)}</dd>
            </div>
            <div>
              <dt className="text-light-muted text-xs">Plafond</dt>
              <dd className="mt-1 text-lg tabular-nums">{enDollarsDuPlafond(bilan.plafond)}</dd>
            </div>
            <div>
              <dt className="text-light-muted text-xs">Reste</dt>
              <dd
                className={`mt-1 text-lg tabular-nums ${bilan.atteint || bilan.bas ? "text-red-200" : ""}`}
              >
                {enDollarsDuPlafond(bilan.reste)}
              </dd>
            </div>
          </dl>
        ) : null}
        <p className="mt-3 text-sm">
          <Link
            href="/administration/integrations"
            className="text-gold hover:text-gold-bright underline underline-offset-4 transition-colors"
          >
            Changer le plafond
          </Link>
        </p>

        {courant ? (
          <DetailDuMois mois={courant} />
        ) : (
          <p className="border-navy-line text-light-muted mt-6 rounded-xl border border-dashed p-5 text-sm leading-relaxed">
            Aucun appel à un fournisseur ce mois-ci.
          </p>
        )}
      </section>

      <section aria-labelledby="mois-precedents" className="mt-14">
        <h2 id="mois-precedents" className="font-serif text-xl">
          Mois précédents
        </h2>
        <p className="text-light-muted mt-2 text-xs leading-relaxed">
          Onze mois au plus avant celui-ci. Au-delà, les registres restent en base.
        </p>

        {precedents.length ? (
          <div className="mt-5 space-y-3">
            {precedents.map((m) => (
              <details key={m.mois} className="border-navy-line group rounded-xl border">
                <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-4 sm:px-5">
                  <span className="text-sm font-medium capitalize">{moisEnClair(m.mois)}</span>
                  <span className="text-light-muted text-sm tabular-nums">
                    {enDollars(m.compte)} · {nombreAppels(m.appels)}
                  </span>
                </summary>
                <div className="border-navy-line border-t px-4 pb-4 sm:px-5">
                  <DetailDuMois mois={m} />
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="border-navy-line text-light-muted mt-5 rounded-xl border border-dashed p-5 text-sm leading-relaxed">
            Aucun appel enregistré avant ce mois.
          </p>
        )}
      </section>
    </div>
  );
}

/** Un mois : ses réserves dites en clair, puis un tableau par agent. */
function DetailDuMois({ mois }: { mois: CoutsMois }) {
  const notes = reserves(mois);

  return (
    <div className="mt-6 space-y-6">
      <p className="text-sm leading-relaxed tabular-nums">
        {nombreAppels(mois.appels)}, {enDollars(mois.compte)} comptés
        {mois.dontReserve > 0 ? `, dont ${enDollars(mois.dontReserve)} de réserves` : ""}.
      </p>
      {notes.length ? (
        <ul className="text-light-muted list-disc space-y-1 pl-5 text-xs leading-relaxed">
          {notes.map((note) => (
            <li key={note}>{note}.</li>
          ))}
        </ul>
      ) : null}

      {mois.agents.map((agent) => (
        <div key={agent.agent} className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <caption className="pb-2 text-left">
              <span className="text-gold text-xs font-medium tracking-wide">{agent.agent}</span>
              <span className="text-light-muted ml-3 text-xs tabular-nums">
                {enDollars(agent.compte)} · {nombreAppels(agent.appels)}
              </span>
            </caption>
            <thead>
              <tr className="text-light-muted border-navy-line border-b text-xs">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Profil
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Modèle
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Appels
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Volume
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Compté
                </th>
              </tr>
            </thead>
            <tbody>
              {agent.lignes.map((ligne) => (
                <tr
                  key={`${ligne.profil}-${ligne.modele ?? "recherche"}-${ligne.fournisseur}`}
                  className="border-navy-line border-b align-top last:border-b-0"
                >
                  <th scope="row" className="py-2 pr-4 font-normal break-all">
                    {ligne.profil}
                  </th>
                  <td className="text-light-muted py-2 pr-4 break-all">
                    {ligne.modele ?? `Recherche (${ligne.fournisseur})`}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{enNombre(ligne.appels)}</td>
                  <td className="text-light-muted py-2 pr-4 tabular-nums">{volumeDe(ligne)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {enDollars(ligne.compte)}
                    {ligne.dontReserve > 0 ? (
                      <span className="text-light-muted block text-xs">
                        dont {enDollars(ligne.dontReserve)} de réserves
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
