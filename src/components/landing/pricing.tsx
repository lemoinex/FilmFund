import Link from "next/link";

import { CheckIcon } from "@/components/icons";
import { modePriveActif } from "@/lib/acces-prive";
import { lireOffre, montantMensuel, quotasEnMots, type CarteOffre } from "@/lib/offre";
import { formaterValeurPlan } from "@/lib/plans";

/*
 * Questions sur l'offre. Rien n'y est promis qui n'existe : les assistants
 * d'écriture et le paiement sont annoncés comme à venir.
 */
const QUESTIONS = [
  {
    question: "Qu'est-ce qu'une unité texte ?",
    reponse:
      "Les assistants d'écriture de filmfundAfrica arrivent prochainement. Chaque livrable généré comptera un nombre fixe d'unités selon son ampleur : 1 pour une logline, de 1 à 3 pour un synopsis, 3 pour une note d'intention, 8 pour un traitement, 10 pour une bible, 2 par séquence de scénario et 1 par scène de dialogues.",
  },
  {
    question: "Que se passe-t-il quand une limite est atteinte ?",
    reponse:
      "Vos projets, documents et images restent consultables et modifiables. Seul l'ajout au-delà de la limite est suspendu : un nouveau projet, un nouveau membre ou une nouvelle image. Les volumes mensuels repartent à zéro chaque mois, à la date anniversaire de votre studio.",
  },
  {
    question: "Peut-on changer de plan ?",
    reponse:
      "Oui : un changement de plan s'applique aussitôt. Pour l'instant, il est effectué par l'équipe filmfundAfrica.",
  },
  {
    question: "Comment régler un plan payant ?",
    reponse:
      "Les fonctionnalités de paiement seront activées prochainement. Aucun paiement n'est demandé à ce jour.",
  },
];

function Carte({
  carte,
  inscriptionsOuvertes,
}: {
  carte: CarteOffre;
  inscriptionsOuvertes: boolean;
}) {
  const { positionnement, version } = carte;
  const recommande = positionnement.recommande === true;
  const gratuit = version.price_xaf_per_month === 0;
  const quotas = quotasEnMots(version, (mo) => formaterValeurPlan("storage_mb", mo));

  return (
    <li
      className={`bg-navy text-light relative flex h-full flex-col rounded-2xl border p-7 shadow-xl sm:p-8 ${
        recommande
          ? "border-gold shadow-black/25 lg:-translate-y-4"
          : "border-navy-line shadow-black/15"
      } ${
        // Tablette : la troisième carte se centre seule sous les deux autres.
        carte.code === "studio"
          ? "md:col-span-2 md:mx-auto md:w-full md:max-w-md lg:col-span-1 lg:max-w-none"
          : ""
      }`}
    >
      {recommande ? (
        <p className="bg-gold text-navy mb-5 self-start rounded-full px-3 py-1 text-xs font-semibold tracking-[0.12em]">
          RECOMMANDÉ
        </p>
      ) : null}

      <h3 className="font-serif text-2xl leading-tight">{carte.nom}</h3>
      <p className="text-light-muted mt-3 text-sm leading-relaxed text-pretty">
        {positionnement.accroche}
      </p>

      <p className="mt-7 flex flex-wrap items-baseline gap-x-2">
        <span className="font-serif text-4xl leading-none tracking-tight sm:text-5xl">
          {montantMensuel(version)}
        </span>
        <span className="text-light-muted text-sm">XAF / mois</span>
      </p>
      {gratuit ? null : (
        <p className="text-light-muted mt-3 text-xs leading-relaxed">
          Prix mensuel indicatif — paiement bientôt disponible.
        </p>
      )}

      <ul className="border-navy-line mt-7 space-y-3 border-t pt-7 text-sm">
        {quotas.map((quota) => (
          <li key={quota} className="flex items-start gap-3">
            <CheckIcon
              className={`mt-0.5 size-4 shrink-0 ${recommande ? "text-gold" : "text-light-muted"}`}
            />
            <span>{quota}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        {positionnement.inscription && inscriptionsOuvertes ? (
          <Link
            href="/inscription"
            className={`block rounded-full px-5 py-3 text-center text-sm font-medium transition-colors ${
              recommande
                ? "bg-gold text-navy hover:bg-gold-bright"
                : "bg-navy-soft hover:bg-navy-line text-light"
            }`}
          >
            {positionnement.inscription}
          </Link>
        ) : (
          // Mention, pas un bouton : aucune action n'est encore possible.
          <p
            className={`rounded-full border px-5 py-3 text-center text-sm ${
              recommande ? "border-gold/60 text-gold" : "border-navy-line text-light-muted"
            }`}
          >
            {positionnement.bientot}
          </p>
        )}
      </div>
    </li>
  );
}

/**
 * Section tarifaire de la vitrine.
 *
 * Les chiffres viennent de la base (dernière version publiée de chaque plan) ;
 * la page d'accueil est revalidée régulièrement pour les suivre.
 */
export async function Pricing() {
  const offre = await lireOffre(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  const inscriptionsOuvertes = !modePriveActif();

  return (
    <section
      id="tarifs"
      aria-labelledby="tarifs-titre"
      className="bg-ivory text-ink border-ink/10 scroll-mt-20 border-t"
    >
      <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="reveal mx-auto max-w-2xl text-center">
          <p className="eyebrow text-gold-deep mb-5">Tarifs</p>
          <h2
            id="tarifs-titre"
            className="font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl"
          >
            Un plan pour chaque étape de votre film.
          </h2>
          <p className="text-ink-muted mt-6 text-base leading-relaxed text-pretty">
            Commencez à structurer votre projet, puis évoluez lorsque votre production prend de
            l&apos;ampleur.
          </p>
        </div>

        {offre?.length ? (
          <ul className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-8">
            {offre.map((carte) => (
              <Carte key={carte.code} carte={carte} inscriptionsOuvertes={inscriptionsOuvertes} />
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted mt-14 text-center text-base">Offre bientôt présentée.</p>
        )}

        <p className="text-ink-muted mt-10 text-center text-xs leading-relaxed">
          Les fonctionnalités de paiement et d&apos;abonnement seront activées prochainement.
        </p>

        <div className="mx-auto mt-16 max-w-3xl">
          <h3 className="text-center font-serif text-2xl">Questions fréquentes</h3>
          <div className="border-ink/15 divide-ink/15 mt-6 divide-y border-y">
            {/*
             * Contour de focus or foncé, forcé : l'or vif de la règle globale
             * se lit mal sur fond clair, et cette règle, hors couche CSS,
             * l'emporterait sur un utilitaire ordinaire.
             */}
            {QUESTIONS.map(({ question, reponse }) => (
              <details key={question} className="group">
                <summary className="focus-visible:outline-gold-deep! flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-medium">
                  {question}
                  <span
                    aria-hidden="true"
                    className="text-gold-deep text-xl leading-none transition-transform group-open:rotate-45 motion-reduce:transition-none"
                  >
                    +
                  </span>
                </summary>
                <p className="text-ink-muted pb-5 text-sm leading-relaxed text-pretty">{reponse}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
