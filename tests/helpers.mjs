/**
 * Utilitaires partagés par les tests d'intégration.
 *
 * Les tests s'exécutent contre la pile Supabase locale, démarrée par
 * `npm run db:start`. Ils créent de vrais comptes et de vraies lignes : c'est
 * le seul moyen d'éprouver la RLS, qui ne se simule pas.
 *
 * Les clés ci-dessous sont celles de toute installation Supabase locale.
 * Elles n'ouvrent que le conteneur Docker de la machine et sont publiques par
 * construction ; elles peuvent être surchargées par variables d'environnement
 * si la configuration locale diffère.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

export const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";

export const PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export const SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ?? "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";

const MOT_DE_PASSE = "motdepasse1";

/** Client anonyme, tel qu'un visiteur non connecté en dispose. */
export function clientAnonyme() {
  return createClient(URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client de service, qui contourne la RLS.
 *
 * Réservé à la mise en place des tests — promouvoir un administrateur, par
 * exemple, ce qu'aucun compte ne peut faire tant qu'aucun administrateur
 * n'existe. Jamais utilisé pour vérifier un comportement : ce qui est testé
 * doit toujours l'être avec les droits d'un utilisateur réel.
 */
export function clientDeService() {
  return createClient(URL, SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Crée un compte et renvoie son client authentifié.
 *
 * L'adresse porte un suffixe unique : les tests peuvent ainsi s'enchaîner sur
 * une base déjà peuplée sans se marcher dessus.
 *
 * Le studio personnel du compte est mis au plan Studio, le plus large : les
 * suites éprouvent le cloisonnement et les droits, pas les quotas, qui ont
 * leur propre suite et y demandent explicitement le plan Gratuit.
 */
export async function creerCompte(prefixe, nomAffiche = prefixe, { plan = "studio" } = {}) {
  const client = clientAnonyme();
  const email = `${prefixe}+${Date.now()}${Math.random().toString(36).slice(2, 7)}@exemple.test`;

  const { data, error } = await client.auth.signUp({
    email,
    password: MOT_DE_PASSE,
    options: { data: { display_name: nomAffiche } },
  });

  if (error) {
    throw new Error(`Création du compte ${email} impossible : ${error.message}`);
  }

  if (plan !== "gratuit") {
    await changerPlan(data.user.id, plan);
  }

  return { client, id: data.user.id, email };
}

/** Change le plan du studio personnel d'un compte, comme le ferait l'exploitant. */
export async function changerPlan(compteId, plan) {
  const service = clientDeService();
  const { data: studio, error: lecture } = await service
    .from("studios")
    .select("id")
    .eq("personal_owner_id", compteId)
    .single();

  if (lecture) {
    throw new Error(`Studio personnel introuvable : ${lecture.message}`);
  }

  const { error } = await service
    .from("studio_subscriptions")
    .update({ plan_code: plan })
    .eq("studio_id", studio.id);

  if (error) {
    throw new Error(`Changement de plan impossible : ${error.message}`);
  }
}

/** Promeut un compte administrateur, comme le ferait l'exploitant en SQL direct. */
export async function promouvoirAdministrateur(id) {
  const { error } = await clientDeService().from("profiles").update({ role: "admin" }).eq("id", id);

  if (error) {
    throw new Error(`Promotion impossible : ${error.message}`);
  }
}

/** Crée un projet porté par le compte donné. */
export async function creerProjet(compte, titre) {
  const { data, error } = await compte.client
    .from("projects")
    .insert({ owner_id: compte.id, title: titre })
    .select("id, title")
    .single();

  if (error) {
    throw new Error(`Création du projet impossible : ${error.message}`);
  }

  return data;
}

/** Invitation envoyée par le porteur ; renvoie son identifiant. */
export async function inviter(porteur, projetId, email, role = "viewer", poste = "") {
  const { data, error } = await porteur.client
    .from("project_invitations")
    .insert({ project_id: projetId, email, role, job_title: poste, invited_by: porteur.id })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Invitation impossible : ${error.message}`);
  }

  return data.id;
}

/** Invite puis fait accepter : le compte devient membre du projet. */
export async function faireEntrer(porteur, projetId, compte, role) {
  const invitationId = await inviter(porteur, projetId, compte.email, role);
  const { error } = await compte.client.rpc("accepter_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(`Acceptation impossible : ${error.message}`);
  }
}

const PROJET_SUPABASE = /^project_id\s*=\s*"([^"]+)"/m.exec(
  // `URL` désigne ici l'adresse de l'API locale (plus haut) : le constructeur
  // est pris explicitement sur l'objet global.
  readFileSync(new globalThis.URL("../supabase/config.toml", import.meta.url), "utf8"),
)[1];

/**
 * Exécute du SQL dans le conteneur de la base locale, comme l'exploitant.
 *
 * Réservé à ce que l'API ne permet pas : ouvrir deux sessions qui se
 * croisent, ou inscrire un fichier de taille donnée sans l'envoyer.
 * `docker exec` évite tout mot de passe : psql s'y connecte en local.
 */
export function executerSqlLocal(sql) {
  return new Promise((resolve, reject) => {
    const psql = spawn(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${PROJET_SUPABASE}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let sortie = "";
    let erreurs = "";
    psql.stdout.on("data", (d) => (sortie += d));
    psql.stderr.on("data", (d) => (erreurs += d));
    psql.on("error", reject);
    psql.on("close", (code) => resolve({ code, sortie, erreurs }));
    psql.stdin.end(sql);
  });
}

/*
 * Mot de passe du rôle du worker dans la base locale Docker, et là seulement.
 * Il n'ouvre que le conteneur de la machine ; en production, le mot de passe
 * est fixé par l'exploitant et rangé dans Railway, jamais dans le dépôt.
 */
const MOT_DE_PASSE_WORKER_LOCAL = "worker-local-uniquement";

/**
 * Connexion à la base locale sous le rôle du worker, comme en production :
 * aucun droit sur les tables, ses seules fonctions. Sans TLS — la base
 * locale n'en a pas ; le point d'entrée du worker, lui, l'exige toujours.
 */
export async function ouvrirBaseDuWorker() {
  const { code, erreurs } = await executerSqlLocal(
    `alter role filmfund_worker password '${MOT_DE_PASSE_WORKER_LOCAL}';`,
  );
  if (code !== 0) {
    throw new Error(`Mot de passe local du worker impossible à fixer : ${erreurs}`);
  }

  const { ouvrirBase } = await import("../worker/src/base.ts");
  return ouvrirBase({
    hote: "127.0.0.1",
    port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
    base: "postgres",
    utilisateur: "filmfund_worker",
    motDePasse: MOT_DE_PASSE_WORKER_LOCAL,
    tls: false,
  });
}

/** Devis accepté : renvoie la tâche née de la réservation. */
export async function engager(compte, projetId, action, cle, params = {}) {
  const { data: devis, error } = await compte.client.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: action,
    p_params: params,
  });
  if (error) {
    throw new Error(`Devis impossible : ${error.message}`);
  }
  const { data: reservation, error: refus } = await compte.client.rpc("accepter_devis", {
    p_quote_id: devis[0].quote_id,
    p_idempotency_key: cle,
  });
  if (refus) {
    throw new Error(`Réservation impossible : ${refus.message}`);
  }
  const { data: tache } = await compte.client
    .from("jobs")
    .select("id, state, action")
    .eq("reservation_id", reservation.id)
    .single();
  return tache;
}

/**
 * Les tâches laissées en attente par les autres suites passeraient avant
 * celles du test : elles sont annulées et leurs réservations rendues, comme
 * le ferait leur porteur. Celles dont le bail a expiré sont d'abord
 * récupérées, pour qu'aucune ne revienne en attente au milieu d'un test.
 * Renvoie le SQL, à exécuter par executerSqlLocal.
 */
export function annulerLesAutresTaches(gardees) {
  const liste = gardees.map((id) => `'${id}'`).join(", ");
  return `
    select public.recuperer_travaux_expires();
    select count(public.clore_travail(j, 'cancelled', 0, 'Écartée par un test de réclamation'))
    from public.jobs j
    where j.state = 'queued' and j.id not in (${liste});
  `;
}

/**
 * Fait déposer une proposition pour une tâche de logline en attente, comme
 * le ferait le worker : réclamation, envoi, provision, coût confirmé,
 * livraison. AUCUN FOURNISSEUR N'EST APPELÉ : le texte est donné par le test.
 *
 * Pour les suites qui éprouvent ce que les comptes font d'une proposition,
 * pas l'agent qui la rédige — celui-ci a sa propre suite.
 */
export async function deposerProposition(tacheId, texte) {
  if (!/^[0-9a-f-]{36}$/.test(tacheId) || texte.includes("$texte$")) {
    throw new Error("Tâche ou texte inutilisable dans le SQL du test.");
  }
  const { code, erreurs } = await executerSqlLocal(`
    ${annulerLesAutresTaches([tacheId])}
    do $$
    declare
      v_travail uuid;
      v_essai uuid;
    begin
      select r.job_id, r.attempt_id into v_travail, v_essai
      from public.reclamer_travail('worker-de-test', array['logline']) r;
      if v_travail is distinct from '${tacheId}' then
        raise exception 'Tâche réclamée inattendue : %', v_travail;
      end if;
      perform public.marquer_tentative_soumise(v_essai);
      perform public.provisionner_cout(
        v_essai, 'anthropic', 'claude-opus-5-5', 'weaver.logline@1', 10, 10, 0.0001
      );
      perform public.confirmer_cout(v_essai, 'claude-opus-5-5', 10, 10, 0.0001, false);
      perform public.livrer_proposition(v_essai, $texte$${texte}$texte$);
    end $$;
  `);
  if (code !== 0) {
    throw new Error(`Dépôt de la proposition impossible : ${erreurs}`);
  }
}

/**
 * Plafond mensuel des dépenses d'IA de la base locale, en dollars.
 *
 * Les suites qui font tourner un agent le relèvent le temps de leurs tests :
 * leurs provisions jamais confirmées — coupures simulées — s'accumulent dans
 * le registre d'une exécution à l'autre, et finiraient par atteindre le
 * plafond de mise en service. Elles le remettent à 5 $ en sortant.
 */
export async function definirPlafondIa(dollars) {
  const { code, erreurs } = await executerSqlLocal(
    `update public.ai_settings set monthly_budget_usd = ${Number(dollars)};`,
  );
  if (code !== 0) {
    throw new Error(`Plafond d'IA impossible à fixer : ${erreurs}`);
  }
}
