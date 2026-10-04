/**
 * SCRIPT : traitement, bible et scénario. Ce lot n'ouvre que le traitement
 * et la bible — un scénario ne tient pas dans une proposition, plafonnée à
 * 20 000 caractères, et sa livraison reste à décider.
 *
 * L'agent n'a pas de mécanique propre : écrire un traitement, c'est écrire un
 * texte long à partir du contexte du projet, comme un synopsis détaillé. Il
 * reprend donc la fabrique de WEAVER, avec ses propres profils versionnés.
 */
import type { Base } from "../base.ts";
import type { Executeur } from "../executeurs.ts";
import type { Fournisseur } from "../ia/passerelle.ts";
import { PROFILS_SCRIPT } from "../ia/profils.ts";

import { executeursDeProfils } from "./weaver.ts";

/** Ce que SCRIPT sait exécuter, avec ce fournisseur. */
export function executeursScript(
  base: Base,
  fournisseur: Fournisseur,
): Readonly<Record<string, Executeur>> {
  return executeursDeProfils(base, fournisseur, PROFILS_SCRIPT);
}
