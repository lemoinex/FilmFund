"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";

import { Field, Message, SubmitButton } from "@/components/ui/form";
import {
  ETAPES_ASSISTANT,
  PITCH_MAX,
  progression,
  TITRE_MAX,
  type CleEtape,
} from "@/lib/assistant";
import { DUREE_MINUTES, GENRES, LONGUEURS_FICHE, MAX_PAYS, type ChampFiche } from "@/lib/fiche";
import type { Pays } from "@/lib/profils";
import { ETAPES, FORMATS } from "@/lib/projets";
import type { ProjectFormat, ProjectStage } from "@/lib/supabase/types";

import { creerProjetAssiste, enregistrerEtape, type EtatEtape } from "./actions";

const CHAMP =
  "border-navy-line bg-navy placeholder:text-light-muted/60 focus:border-gold w-full rounded-lg border px-4 py-3 text-sm transition-colors outline-none";

const LIEN =
  "text-light-muted hover:text-light rounded-full px-3 py-2 text-center text-sm transition-colors";

/** Ce que les étapes affichent : la fiche, plus le titre, le format, l'étape et le pitch. */
export type ValeursProjet = {
  title: string;
  format: ProjectFormat;
  stage: ProjectStage;
  logline: string;
  genre: string | null;
  countries: string[];
  languages: string;
  duration_minutes: number | null;
  short_synopsis: string;
  theme: string;
  stakes: string;
  artistic_vision: string;
  goals: string;
  audience: string;
};

/**
 * Progression dans l'assistant. Un segment par étape : sur écran étroit, le
 * nom de l'étape n'est lu que par les lecteurs d'écran ; « Étape 2 sur 7 »
 * reste visible. Avant la création du projet, les autres étapes ne mènent
 * nulle part : elles ne sont pas des liens.
 */
export function BarreEtapes({ projetId, actuelle }: { projetId?: string; actuelle: CleEtape }) {
  const { rang, total } = progression(actuelle);

  return (
    <nav aria-label="Étapes de l'assistant" className="mt-8">
      <p className="text-light-muted text-xs">
        Étape {rang} sur {total}
      </p>
      <ol className="mt-1 flex gap-1.5">
        {ETAPES_ASSISTANT.map((etape, index) => {
          const courante = etape.cle === actuelle;
          const passee = index + 1 < rang;
          const contenu = (
            <>
              <span
                aria-hidden="true"
                className={`block h-1 rounded-full ${
                  courante ? "bg-gold" : passee ? "bg-gold/50" : "bg-navy-line"
                }`}
              />
              <span
                className={`sr-only sm:not-sr-only sm:mt-2 sm:block sm:truncate sm:text-[0.6875rem] ${
                  courante ? "text-gold" : "text-light-muted"
                }`}
              >
                {etape.libelle}
              </span>
            </>
          );

          return (
            <li key={etape.cle} className="min-w-0 flex-1">
              {projetId ? (
                <Link
                  href={`/projets/${projetId}/assistant/${etape.cle}`}
                  aria-current={courante ? "step" : undefined}
                  className="block py-2.5"
                >
                  {contenu}
                </Link>
              ) : (
                <span aria-current={courante ? "step" : undefined} className="block py-2.5">
                  {contenu}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ZoneTexte({
  champ,
  label,
  defaultValue,
  max,
  rows = 6,
  placeholder,
  aide,
}: {
  champ: ChampFiche | "logline";
  label: string;
  defaultValue: string;
  max: number;
  rows?: number;
  placeholder?: string;
  aide?: string;
}) {
  return (
    <div>
      <label htmlFor={champ} className="mb-2 block text-sm font-medium">
        {label} <span className="text-light-muted font-normal">(facultatif)</span>
      </label>
      <textarea
        id={champ}
        name={champ}
        rows={rows}
        maxLength={max}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-describedby={`${champ}-aide`}
        className={`${CHAMP} resize-y leading-relaxed`}
      />
      <p id={`${champ}-aide`} className="text-light-muted mt-2 text-xs leading-relaxed">
        {aide ? `${aide} ` : ""}
        {max} caractères maximum.
      </p>
    </div>
  );
}

/**
 * Pays de production, dans un ordre choisi : le premier est le principal.
 * Une liste et un bouton « Ajouter » plutôt qu'un choix à l'arrivée : au
 * clavier, les flèches parcourent une liste en changeant sa valeur, et
 * chaque pays traversé serait ajouté.
 */
function ChoixPays({ pays, initiaux }: { pays: Pays[]; initiaux: string[] }) {
  const [choisis, setChoisis] = useState(initiaux);
  const [selection, setSelection] = useState("");
  const liste = useRef<HTMLSelectElement>(null);

  const nom = (code: string) => pays.find((p) => p.code === code)?.nom ?? code;
  const plein = choisis.length >= MAX_PAYS;

  const ajouter = () => {
    if (!selection || plein || choisis.includes(selection)) return;
    setChoisis([...choisis, selection]);
    setSelection("");
  };

  // Le bouton cliqué disparaît : le focus revient à la liste des pays.
  const retirer = (code: string) => {
    setChoisis(choisis.filter((c) => c !== code));
    liste.current?.focus();
  };

  const mettreEnPremier = (code: string) => {
    setChoisis([code, ...choisis.filter((c) => c !== code)]);
    liste.current?.focus();
  };

  return (
    <fieldset aria-describedby="pays-aide">
      <legend className="mb-2 block text-sm font-medium">
        Pays de production <span className="text-light-muted font-normal">(facultatif)</span>
      </legend>
      <p id="pays-aide" className="text-light-muted text-xs leading-relaxed">
        Le premier est le pays principal. {MAX_PAYS} pays au plus.
      </p>

      {choisis.length ? (
        <ol className="mt-3 flex flex-wrap gap-2">
          {choisis.map((code, index) => (
            <li
              key={code}
              className="border-navy-line bg-navy-soft flex max-w-full items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-sm"
            >
              <input type="hidden" name="countries" value={code} />
              <span className="min-w-0 truncate">{nom(code)}</span>
              {index === 0 ? (
                <span className="text-gold shrink-0 pr-1 text-xs">principal</span>
              ) : (
                <button
                  type="button"
                  onClick={() => mettreEnPremier(code)}
                  className="text-light-muted hover:text-light shrink-0 rounded-full px-2 py-1 text-xs transition-colors"
                >
                  En premier
                  <span className="sr-only"> : {nom(code)} devient le pays principal</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => retirer(code)}
                aria-label={`Retirer ${nom(code)}`}
                className="text-light-muted hover:bg-navy hover:text-light flex size-7 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex gap-2">
        <label htmlFor="pays-a-ajouter" className="sr-only">
          Pays à ajouter
        </label>
        {/* Sans nom : la liste sert à choisir, seuls les pays retenus partent. */}
        <select
          id="pays-a-ajouter"
          ref={liste}
          value={selection}
          onChange={(evenement) => setSelection(evenement.target.value)}
          disabled={plein}
          className={`${CHAMP} min-w-0 flex-1 disabled:opacity-60`}
        >
          <option value="">{plein ? `${MAX_PAYS} pays au plus` : "Choisir un pays"}</option>
          {pays
            .filter((p) => !choisis.includes(p.code))
            .map((p) => (
              <option key={p.code} value={p.code}>
                {p.nom}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={ajouter}
          disabled={!selection || plein}
          className="border-navy-line hover:bg-navy-soft shrink-0 rounded-full border px-5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Ajouter
        </button>
      </div>
    </fieldset>
  );
}

function Liste({
  id,
  label,
  defaultValue,
  options,
  vide,
}: {
  id: string;
  label: string;
  defaultValue: string;
  options: Record<string, string>;
  /** Libellé de l'absence de choix, quand le champ est facultatif. */
  vide?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
        {vide ? <span className="text-light-muted font-normal"> (facultatif)</span> : null}
      </label>
      <select id={id} name={id} defaultValue={defaultValue} className={CHAMP}>
        {vide ? <option value="">{vide}</option> : null}
        {Object.entries(options).map(([valeur, libelle]) => (
          <option key={valeur} value={valeur}>
            {libelle}
          </option>
        ))}
      </select>
    </div>
  );
}

function ChampsEtape({
  etape,
  valeurs,
  pays,
}: {
  etape: Exclude<CleEtape, "personnages">;
  valeurs: ValeursProjet;
  pays: Pays[];
}) {
  switch (etape) {
    case "informations":
      return (
        <>
          <Field
            label="Titre du projet"
            name="title"
            required
            maxLength={TITRE_MAX}
            defaultValue={valeurs.title}
            placeholder="Lumière de l'Océan"
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Liste id="format" label="Format" defaultValue={valeurs.format} options={FORMATS} />
            <Liste id="stage" label="Étape" defaultValue={valeurs.stage} options={ETAPES} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Liste
              id="genre"
              label="Genre"
              defaultValue={valeurs.genre ?? ""}
              options={GENRES}
              vide="Non précisé"
            />
            <Field
              label="Durée, en minutes"
              name="duration_minutes"
              inputMode="numeric"
              maxLength={4}
              defaultValue={valeurs.duration_minutes?.toString() ?? ""}
              aide={`De ${DUREE_MINUTES.min} à ${DUREE_MINUTES.max} minutes.`}
            />
          </div>
          <ChoixPays pays={pays} initiaux={valeurs.countries} />
          <Field
            label="Langues"
            name="languages"
            maxLength={LONGUEURS_FICHE.languages}
            defaultValue={valeurs.languages}
            placeholder="Français, ewondo"
          />
        </>
      );
    case "concept":
      return (
        <>
          <ZoneTexte
            champ="logline"
            label="Pitch"
            rows={3}
            max={PITCH_MAX}
            defaultValue={valeurs.logline}
            placeholder="Une phrase qui résume le film."
          />
          <ZoneTexte
            champ="short_synopsis"
            label="Synopsis court"
            max={LONGUEURS_FICHE.short_synopsis}
            defaultValue={valeurs.short_synopsis}
            aide="L'histoire en quelques paragraphes : le début, le nœud, l'issue."
          />
          <Field
            label="Thème"
            name="theme"
            maxLength={LONGUEURS_FICHE.theme}
            defaultValue={valeurs.theme}
            placeholder="L'exil, la transmission, la mer"
          />
        </>
      );
    case "enjeux":
      return (
        <ZoneTexte
          champ="stakes"
          label="Enjeux"
          rows={8}
          max={LONGUEURS_FICHE.stakes}
          defaultValue={valeurs.stakes}
        />
      );
    case "vision":
      return (
        <ZoneTexte
          champ="artistic_vision"
          label="Vision artistique"
          rows={8}
          max={LONGUEURS_FICHE.artistic_vision}
          defaultValue={valeurs.artistic_vision}
        />
      );
    case "objectifs":
      return (
        <ZoneTexte
          champ="goals"
          label="Objectifs"
          rows={8}
          max={LONGUEURS_FICHE.goals}
          defaultValue={valeurs.goals}
        />
      );
    case "public":
      return (
        <ZoneTexte
          champ="audience"
          label="Public cible"
          rows={8}
          max={LONGUEURS_FICHE.audience}
          defaultValue={valeurs.audience}
        />
      );
  }
}

/**
 * Formulaire d'une étape. Sans projet, c'est la première étape, qui le crée.
 *
 * Envoi déclenché à la main, et non par `action={action}` : après une action
 * de formulaire, React réinitialise les champs. Sur une erreur, les listes
 * et les pays choisis reviendraient à leurs valeurs d'origine, et la saisie
 * serait perdue. Une réussite mène à l'étape suivante.
 */
export function FormulaireEtape({
  projetId,
  etape,
  valeurs,
  pays,
  precedente,
  suivante,
}: {
  projetId?: string;
  etape: Exclude<CleEtape, "personnages">;
  valeurs: ValeursProjet;
  pays: Pays[];
  /** Adresse de l'étape précédente, s'il y en a une. */
  precedente?: string;
  /** Adresse où mène « Passer cette étape ». */
  suivante?: string;
}) {
  const [etat, action, enCours] = useActionState<EtatEtape, FormData>(
    projetId ? enregistrerEtape : creerProjetAssiste,
    null,
  );
  const derniere = etape === ETAPES_ASSISTANT.at(-1)?.cle;

  return (
    <form
      onSubmit={(evenement) => {
        evenement.preventDefault();
        const donnees = new FormData(evenement.currentTarget);
        startTransition(() => action(donnees));
      }}
      className="space-y-5"
    >
      {projetId ? (
        <>
          <input type="hidden" name="projet" value={projetId} />
          <input type="hidden" name="etape" value={etape} />
        </>
      ) : null}

      {etat?.erreur ? <Message ton="erreur">{etat.erreur}</Message> : null}

      <ChampsEtape etape={etape} valeurs={valeurs} pays={pays} />

      <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center">
        <div className="w-full sm:w-auto sm:min-w-64">
          <SubmitButton enCours={enCours}>
            {!projetId
              ? "Créer le projet et continuer"
              : derniere
                ? "Enregistrer et terminer"
                : "Enregistrer et continuer"}
          </SubmitButton>
        </div>
        {suivante ? (
          <Link href={suivante} className={LIEN}>
            {derniere ? "Terminer sans enregistrer" : "Passer cette étape"}
          </Link>
        ) : null}
        {precedente ? (
          <Link href={precedente} className={`${LIEN} sm:ml-auto`}>
            ← Étape précédente
          </Link>
        ) : null}
      </div>
    </form>
  );
}
