/**
 * Calculs du planning : dates, retards, avancement.
 *
 * Aucun import d'alias ni de valeur : ce module est chargé tel quel par les
 * tests Node, qui éprouvent ces règles de dates — années bissextiles,
 * fuseaux, étapes sans date — là où une erreur passerait inaperçue.
 */
import type { MilestoneStatus } from "@/lib/supabase/types";

/** Date au format AAAA-MM-JJ, et existante : le 31 février est refusé. */
export function lireDate(valeur: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return null;
  const date = new Date(`${valeur}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(valeur) ? valeur : null;
}

/*
 * Les dates d'étape sont des jours, sans heure. Formatées en UTC, elles
 * s'affichent telles qu'elles ont été saisies, quel que soit le fuseau du
 * serveur ; sans cela, le 30 novembre deviendrait le 29 à l'ouest de
 * Greenwich.
 */
const jourFr = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const jourCourtFr = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function formaterJour(date: string): string {
  return jourFr.format(new Date(`${date}T00:00:00Z`));
}

export function formaterPeriode(debut: string | null, echeance: string | null): string {
  if (debut && echeance) {
    return debut === echeance
      ? `le ${formaterJour(echeance)}`
      : `du ${jourCourtFr.format(new Date(`${debut}T00:00:00Z`))} au ${formaterJour(echeance)}`;
  }
  if (echeance) return `échéance le ${formaterJour(echeance)}`;
  if (debut) return `à partir du ${formaterJour(debut)}`;
  return "sans date";
}

/** Aujourd'hui, en AAAA-MM-JJ (UTC). */
export function aujourdhui(): string {
  return new Date().toISOString().slice(0, 10);
}

export function estEnRetard(
  etape: { status: MilestoneStatus; due_on: string | null },
  jour: string,
): boolean {
  return etape.status !== "termine" && etape.due_on !== null && etape.due_on < jour;
}

/**
 * Avancement : la part des étapes terminées.
 *
 * Une mesure, pas une estimation — elle ne vaut que ce que vaut le
 * planning saisi, et l'interface le dit en affichant le décompte à côté du
 * pourcentage. Sans étape, pas d'avancement du tout (et non 0 %).
 */
export function calculerAvancement(
  etapes: { status: MilestoneStatus }[],
): { terminees: number; total: number; pourcent: number } | null {
  if (!etapes.length) return null;
  const terminees = etapes.filter((e) => e.status === "termine").length;
  return {
    terminees,
    total: etapes.length,
    pourcent: Math.round((terminees / etapes.length) * 100),
  };
}

/** Tri : les échéances les plus proches d'abord, les étapes sans date en fin. */
export function comparerEtapes(
  a: { due_on: string | null; starts_on: string | null },
  b: { due_on: string | null; starts_on: string | null },
): number {
  const cleA = a.due_on ?? a.starts_on ?? "9999-12-31";
  const cleB = b.due_on ?? b.starts_on ?? "9999-12-31";
  return cleA.localeCompare(cleB);
}
