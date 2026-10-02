/**
 * Point d'entrée du worker FilmFund, déployé sur Railway.
 *
 * Connexion : pooler Supabase en mode session, sous le rôle dédié
 * `filmfund_worker`, chiffrée et vérifiée par le certificat racine de
 * Supabase — toujours : aucune variable ne permet de s'en dispenser.
 * Variables attendues : PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 * (voir docs/worker.md). Aucune valeur n'est journalisée.
 *
 * Les clés des fournisseurs d'IA ne sont pas des variables d'environnement :
 * elles sont posées depuis l'écran Administration → Intégrations IA et lues
 * dans le coffre. Le registre des agents est donc relu périodiquement :
 * poser une clé met l'agent en service, la retirer l'en sort, sans
 * redéploiement. Sans clé, aucun agent : seules les tâches qui n'appellent
 * aucun fournisseur — l'export PDF — sont alors prises.
 */
import { readFileSync } from "node:fs";
import { hostname } from "node:os";

import { ouvrirBase, purgerExports, roleCourant } from "./base.ts";
import { demarrerWorker, type Evenement, type Registre } from "./boucle.ts";
import { executeursExport } from "./exports/executeur.ts";
import { registreDesAgents } from "./registre.ts";

/** Fréquence de relecture des clés du coffre. */
const RELECTURE_CLES_MS = 60_000;

/** Fréquence de suppression des exports expirés. */
const PURGE_EXPORTS_MS = 60 * 60_000;

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

const agents = registreDesAgents({ base, journal });
// L'export n'appelle aucun fournisseur : il est en service avec ou sans clé.
const exportsPdf = executeursExport(base);
const executeurs = (): Registre => ({ ...exportsPdf, ...agents.lire() });
const nom = `${process.env.RAILWAY_REPLICA_ID ?? hostname()}-${process.pid}`.slice(0, 100);
const arret = new AbortController();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    journal({ niveau: "info", evenement: "arret_demande", signal });
    arret.abort();
  });
}

try {
  const role = await roleCourant(base);
  await agents.relire();
  journal({
    niveau: "info",
    evenement: "worker_demarre",
    worker: nom,
    role,
    actions: Object.keys(executeurs()),
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

// Une clé injoignable un instant ne doit pas arrêter le worker : il garde le
// registre qu'il a et retentera au battement suivant.
const relecture = setInterval(() => {
  agents.relire().catch((erreur) =>
    journal({
      niveau: "alerte",
      evenement: "relecture_cles_impossible",
      message: erreur instanceof Error ? erreur.message : String(erreur),
    }),
  );
}, RELECTURE_CLES_MS);

// Les exports se conservent 30 jours : au-delà, ils pèseraient pour rien
// dans la base. Un échec n'arrête rien, la purge suivante rattrapera.
function purger(): void {
  purgerExports(base).then(
    (nombre) => {
      if (nombre > 0) {
        journal({ niveau: "info", evenement: "exports_expires_purges", nombre });
      }
    },
    (erreur) =>
      journal({
        niveau: "alerte",
        evenement: "purge_exports_impossible",
        message: erreur instanceof Error ? erreur.message : String(erreur),
      }),
  );
}
purger();
const purge = setInterval(purger, PURGE_EXPORTS_MS);

try {
  await demarrerWorker({ base, nom, executeurs, journal }, arret.signal);
} finally {
  clearInterval(relecture);
  clearInterval(purge);
  await base.end();
}
