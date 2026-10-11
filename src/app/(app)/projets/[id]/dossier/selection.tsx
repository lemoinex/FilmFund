"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Message } from "@/components/ui/form";
import {
  FORMATS_EXPORT,
  nombreExports,
  ORDRE_FORMATS,
  type EtapeExport,
  type FormatExport,
} from "@/lib/exports";

import { annulerExport, lancerExport, preparerExport, type DevisExport } from "./actions";

const BOUTON_PRINCIPAL =
  "bg-gold text-navy hover:bg-gold-bright rounded-full px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const BOUTON_SECONDAIRE =
  "border-app-line hover:bg-surface-hover rounded-full border px-5 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/** Rythme de rafraîchissement tant que le dossier se fabrique. */
const RAFRAICHISSEMENT_MS = 3000;

export type OptionExport = {
  groupe: "section" | "document";
  code: string;
  libelle: string;
  /** Ce que la case apporterait : « 2 documents finalisés », « Budget non ouvert ». */
  detail: string;
  /** Faux : rien à exporter pour cette case, qui reste décochée. */
  disponible: boolean;
  /** Vrai : la case n'est pas cochée d'office, même si elle a de quoi exporter. */
  decochee?: boolean;
};

type Demande =
  | { devis: DevisExport; cle: string }
  /** Un dossier identique existe encore : il est proposé tel quel. */
  | { existant: string };

/**
 * Composition d'un dossier : cases à cocher, format, devis, confirmation,
 * suivi.
 *
 * Tout ce qui compte est décidé côté serveur : ce composant n'affiche que
 * l'étape calculée par la page, et ses boutons ne font qu'appeler des actions
 * qui revérifient chaque droit. Les cases désactivées ne sont qu'une aide :
 * la base, elle, omet de toute façon une section vide.
 */
export function SelectionExport({
  projetId,
  options,
  etape,
}: {
  projetId: string;
  options: OptionExport[];
  etape: EtapeExport;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [coches, setCoches] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        options
          .filter((option) => option.disponible && !option.decochee)
          .map((option) => option.code),
      ),
  );
  const [demande, setDemande] = useState<Demande | null>(null);
  const [format, setFormat] = useState<FormatExport>("pdf");

  const enFabrication = etape.etape === "en_attente" || etape.etape === "en_cours";
  // Une demande interrompue n'empêche pas d'en faire une autre : aucun
  // fournisseur n'est en jeu, et son unité se règle au rapprochement.
  const libre = !enFabrication;

  useEffect(() => {
    if (!enFabrication) {
      return;
    }
    const minuterie = setInterval(() => router.refresh(), RAFRAICHISSEMENT_MS);
    return () => clearInterval(minuterie);
  }, [enFabrication, router]);

  function basculer(code: string) {
    // Une autre sélection est une autre demande : le devis affiché ne vaut plus.
    setDemande(null);
    setErreur(null);
    setCoches((actuels) => {
      const suivants = new Set(actuels);
      if (!suivants.delete(code)) {
        suivants.add(code);
      }
      return suivants;
    });
  }

  function choisirFormat(suivant: FormatExport) {
    // Un autre format est une autre demande, avec son propre devis.
    setDemande(null);
    setErreur(null);
    setFormat(suivant);
  }

  function choisis(groupe: OptionExport["groupe"]) {
    return options
      .filter((option) => option.groupe === groupe && option.disponible && coches.has(option.code))
      .map((option) => option.code);
  }

  function preparer() {
    setErreur(null);
    demarrer(async () => {
      const resultat = await preparerExport(
        projetId,
        choisis("section"),
        choisis("document"),
        format,
      );
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else if ("existant" in resultat) {
        setDemande({ existant: resultat.existant });
      } else {
        // La clé naît avec le devis et ne change plus : un double clic ne
        // réserve qu'une fois.
        setDemande({ devis: resultat.devis, cle: crypto.randomUUID() });
      }
    });
  }

  function executer(action: () => Promise<{ erreur: string } | object>) {
    setErreur(null);
    demarrer(async () => {
      const resultat = await action();
      if ("erreur" in resultat) {
        setErreur(resultat.erreur);
      } else {
        setDemande(null);
      }
      router.refresh();
    });
  }

  const aucunChoix = choisis("section").length + choisis("document").length === 0;

  return (
    <section
      aria-labelledby="composer-dossier"
      className="border-app-line mt-10 rounded-xl border p-5 sm:p-6"
    >
      <h2 id="composer-dossier" className="font-serif text-2xl leading-tight">
        Composer le dossier
      </h2>
      <p className="text-secondary mt-2 max-w-2xl text-sm leading-relaxed text-pretty">
        Cochez ce que le dossier doit contenir. Seuls les documents finalisés y entrent ; la page de
        garde, elle, est toujours présente.
      </p>

      <fieldset disabled={enCours || !libre} className="mt-5 disabled:opacity-70">
        <legend className="sr-only">Contenu du dossier</legend>
        <ul className="border-app-line divide-y divide-[var(--app-line)] rounded-lg border">
          {options.map((option) => {
            const id = `export-${option.groupe}-${option.code}`;
            return (
              <li key={id}>
                <label
                  htmlFor={id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    option.disponible ? "hover:bg-surface cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    className="accent-gold mt-1 size-4 shrink-0"
                    checked={option.disponible && coches.has(option.code)}
                    disabled={!option.disponible}
                    onChange={() => basculer(option.code)}
                    aria-describedby={`${id}-detail`}
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${option.disponible ? "" : "text-secondary"}`}>
                      {option.libelle}
                    </span>
                    <span id={`${id}-detail`} className="text-secondary mt-0.5 block text-xs">
                      {option.detail}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset disabled={enCours || !libre} className="mt-5 disabled:opacity-70">
        <legend className="text-sm font-medium">Format</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ORDRE_FORMATS.map((code) => {
            const id = `export-format-${code}`;
            const choisi = format === code;
            return (
              <label
                key={code}
                htmlFor={id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                  choisi ? "border-gold bg-surface" : "border-app-line hover:bg-surface"
                }`}
              >
                <input
                  id={id}
                  type="radio"
                  name="format-export"
                  value={code}
                  className="accent-gold mt-1 size-4 shrink-0"
                  checked={choisi}
                  onChange={() => choisirFormat(code)}
                  aria-describedby={`${id}-detail`}
                />
                <span className="min-w-0">
                  <span className="block text-sm">{FORMATS_EXPORT[code].libelle}</span>
                  <span id={`${id}-detail`} className="text-secondary mt-0.5 block text-xs">
                    {FORMATS_EXPORT[code].detail}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {erreur ? (
        <div className="mt-4">
          <Message ton="erreur">{erreur}</Message>
        </div>
      ) : null}

      {etape.etape === "echec" && !demande ? (
        <p role="status" className="text-secondary mt-4 text-sm leading-relaxed text-pretty">
          La dernière demande n&apos;a pas abouti
          {etape.motif ? ` : ${etape.motif.replace(/\.$/, "")}` : ""}. L&apos;export réservé a été
          rendu.
        </p>
      ) : null}

      {libre && !demande ? (
        <button
          type="button"
          onClick={preparer}
          disabled={enCours || aucunChoix}
          className={`${BOUTON_PRINCIPAL} mt-5`}
        >
          {enCours ? "Un instant…" : "Préparer le dossier"}
        </button>
      ) : null}

      {libre && demande && "devis" in demande ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Ce dossier en {FORMATS_EXPORT[format].libelle} compte{" "}
            {nombreExports(demande.devis.quantite)}. Il en reste {demande.devis.disponible} sur{" "}
            {demande.devis.allocation} pour la période en cours.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={enCours}
              onClick={() => executer(() => lancerExport(projetId, demande.devis.id, demande.cle))}
              className={BOUTON_PRINCIPAL}
            >
              {enCours ? "Un instant…" : "Fabriquer le dossier"}
            </button>
            <button
              type="button"
              disabled={enCours}
              onClick={() => setDemande(null)}
              className={BOUTON_SECONDAIRE}
            >
              Renoncer
            </button>
          </div>
        </div>
      ) : null}

      {libre && demande && "existant" in demande ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed text-pretty">
            Ce dossier existe déjà en {FORMATS_EXPORT[format].libelle}, à l&apos;identique : rien
            n&apos;a changé dans le projet depuis. Aucun export n&apos;est décompté.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {/* Lien ordinaire, et non `Link` : un fichier ne se précharge pas. */}
            <a
              href={`/projets/${projetId}/dossier/${demande.existant}`}
              className={BOUTON_PRINCIPAL}
            >
              Télécharger ce dossier
            </a>
            <button type="button" onClick={() => setDemande(null)} className={BOUTON_SECONDAIRE}>
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {etape.etape === "en_attente" ? (
        <div className="mt-5">
          <p role="status" className="text-sm leading-relaxed">
            Demande enregistrée : le dossier attend d&apos;être fabriqué.
          </p>
          <button
            type="button"
            disabled={enCours}
            onClick={() => executer(() => annulerExport(projetId, etape.tacheId))}
            className={`${BOUTON_SECONDAIRE} mt-4`}
          >
            Annuler la demande
          </button>
        </div>
      ) : null}

      {etape.etape === "en_cours" ? (
        <p role="status" className="mt-5 text-sm leading-relaxed">
          Dossier en cours de fabrication…
        </p>
      ) : null}

      {etape.etape === "a_rapprocher" ? (
        <p role="status" className="text-secondary mt-5 text-sm leading-relaxed text-pretty">
          Cette demande a été interrompue avant sa fin. Son issue est en cours de vérification ;
          l&apos;export reste réservé d&apos;ici là.
        </p>
      ) : null}
    </section>
  );
}
