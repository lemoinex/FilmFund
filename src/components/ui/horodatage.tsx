"use client";

import { useSyncExternalStore } from "react";

const DATE_ET_HEURE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });
const DATE_SEULE = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

const sansAbonnement = () => () => {};

/**
 * Date et heure dans le fuseau de la personne qui lit.
 *
 * Le serveur ne connaît pas ce fuseau : formatée chez lui, l'heure serait
 * celle de l'hébergeur. Il rend donc la date seule, que le navigateur
 * complète dès l'hydratation — sans écart entre les deux rendus, que React
 * signalerait.
 */
export function Horodatage({ iso }: { iso: string }) {
  const dansLeNavigateur = useSyncExternalStore(
    sansAbonnement,
    () => true,
    () => false,
  );
  const date = new Date(iso);

  return (
    <time dateTime={iso}>
      {dansLeNavigateur ? DATE_ET_HEURE.format(date) : DATE_SEULE.format(date)}
    </time>
  );
}
