/**
 * ARC : analyse dramaturgique, personnages et arcs narratifs.
 *
 * Premier agent qui ne réécrit pas le projet : il le lit et en rend une
 * lecture. La mécanique est celle de WEAVER — même contexte, même fabrique
 * d'exécuteurs —, seul le profil change.
 */
import type { Base } from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import { PROFILS_ARC } from "../ia/profils.ts";

import { executeursDeProfils } from "./weaver.ts";

/** Ce qu'ARC sait exécuter, avec ce fournisseur. */
export function executeursArc(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return executeursDeProfils(base, fournisseur, PROFILS_ARC);
}
