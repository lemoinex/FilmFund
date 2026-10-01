/**
 * Point d'entrée du worker FilmFund, déployé sur Railway.
 *
 * Connexion : pooler Supabase en mode session, sous le rôle dédié
 * `filmfund_worker`, chiffrée et vérifiée par le certificat racine de
 * Supabase — toujours : aucune variable ne permet de s'en dispenser.
 * Variables attendues : PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 * (voir docs/worker.md). Aucune valeur n'est journalisée.
 *
 * ANTHROPIC_API_KEY est facultative : sans elle, le worker n'a aucun
 * exécuteur et ne prend aucune tâche. Avec elle, WEAVER est en service.
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

import { executeursWeaver } from "./agents/weaver.ts";
import { ouvrirBase, roleCourant } from "./base.ts";
import { demarrerWorker, type Evenement } from "./boucle.ts";
import type { Executeur } from "./executeurs.ts";
import { creerFournisseurAnthropic } from "./ia/passerelle.ts";

function journal(evenement: Evenement): void {
  console.log(JSON.stringify({ date: new Date().toISOString(), ...evenement }));
}

function variable(nom: string): string {
  const valeur = process.env[nom];
  if (!valeur) {
    journal({ niveau: "erreur", evenement: "variable_manquante", variable: nom });
    process.exit(1);
  }
  return valeur;
}

const base = ouvrirBase({
  hote: variable("PGHOST"),
  port: Number(variable("PGPORT")),
  base: variable("PGDATABASE"),
  utilisateur: variable("PGUSER"),
  motDePasse: variable("PGPASSWORD"),
  tls: { ca: readFileSync(new URL("../certs/prod-ca-2021.crt", import.meta.url), "utf8") },
});

// Une connexion inactive qui tombe ne doit pas arrêter le processus : la
// boucle rouvrira une connexion à la requête suivante.
base.on("error", (erreur) => {
  journal({ niveau: "alerte", evenement: "connexion_perdue", message: erreur.message });
});

const cleAnthropic = process.env.ANTHROPIC_API_KEY;
const executeurs: Readonly<Record<string, Executeur>> = cleAnthropic
  ? executeursWeaver(base, creerFournisseurAnthropic(cleAnthropic))
  : {};

const nom = `${process.env.RAILWAY_REPLICA_ID ?? hostname()}-${process.pid}`.slice(0, 100);
const arret = new AbortController();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    journal({ niveau: "info", evenement: "arret_demande", signal });
    arret.abort();
  });
}

try {
  journal({
    niveau: "info",
    evenement: "worker_demarre",
    worker: nom,
    role: await roleCourant(base),
    actions: Object.keys(executeurs),
  });
} catch (erreur) {
  journal({
    niveau: "erreur",
    evenement: "connexion_impossible",
    message: erreur instanceof Error ? erreur.message : String(erreur),
  });
  await base.end();
  process.exit(1);
}

await demarrerWorker({ base, nom, executeurs, journal }, arret.signal);
await base.end();
