/**
 * Suspension d'un compte (lot V2a) : ce qu'un compte suspendu ne peut plus
 * faire, par chacun des trois chemins — l'API, le stockage, le worker —, qui
 * le suspend et le rétablit, et ce que les autres comptes n'en subissent pas.
 *
 * Contre la pile Supabase locale, sous de vrais comptes : c'est le contrôle
 * que PostgREST appelle avant chaque requête qui est éprouvé, et une
 * simulation en SQL ne le traverserait pas.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import { auteurDe, descriptionDe } from "../src/lib/journal-administration.ts";
import {
  annulerLesAutresTaches,
  clientAnonyme,
  creerCompte,
  creerProjet,
  engager,
  executerSqlLocal,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const SUSPENDU = "CS001";
const REFUS = "42501";
const MOTIF = "Comptes multiples ouverts pour contourner les quotas.";
const MIGRATION = "supabase/migrations/20261007180000_suspension_comptes.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

// Plus petite image PNG valide : un pixel transparent.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const images = (compte) => compte.client.storage.from("project-images");

describe("Suspension d'un compte", () => {
  let patron;
  let adjoint;
  let cible;
  let temoin;
  let projet;
  let projetTemoin;
  let image;

  const suspendre = (auteur, compteId, motif = MOTIF) =>
    auteur.client.from("account_suspensions").insert({ user_id: compteId, reason: motif });
  const retablir = (auteur, compteId) =>
    auteur.client.from("account_suspensions").delete().eq("user_id", compteId).select("user_id");

  before(async () => {
    patron = await creerCompte("suspension-patron", "Patron des suspensions");
    adjoint = await creerCompte("suspension-adjoint", "Adjoint des suspensions");
    cible = await creerCompte("suspension-cible", "Cible des suspensions");
    temoin = await creerCompte("suspension-temoin", "Témoin des suspensions");
    await promouvoirAdministrateur(patron.id);
    await promouvoirAdministrateur(adjoint.id);
    projet = await creerProjet(cible, "Projet du compte suspendu");
    projetTemoin = await creerProjet(temoin, "Projet du témoin");
    image = `${projet.id}/couverture/${crypto.randomUUID()}.png`;
    const { error } = await images(cible).upload(image, PIXEL, { contentType: "image/png" });
    assert.equal(error, null, error?.message);
  });

  it("avant toute suspension, rien ne change pour personne", async () => {
    const { data: plans, error: visiteur } = await clientAnonyme().from("plans").select("code");
    assert.equal(visiteur, null, visiteur?.message);
    assert.ok(plans.length >= 3);

    const { data, error } = await cible.client.from("projects").select("id").eq("id", projet.id);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
    const { data: etat } = await cible.client.rpc("compte_suspendu");
    assert.equal(etat, false);
  });

  it("seul un administrateur suspend, et jamais un administrateur ni lui-même", async () => {
    const { error: parMembre } = await suspendre(temoin, cible.id);
    assert.equal(parMembre?.code, REFUS);
    const { error: soiMeme } = await suspendre(patron, patron.id);
    assert.equal(soiMeme?.code, REFUS);
    assert.match(soiMeme.message, /propre compte/);
    const { error: unAdministrateur } = await suspendre(patron, adjoint.id);
    assert.equal(unAdministrateur?.code, REFUS);
    assert.match(unAdministrateur.message, /retirez d'abord son rôle/);

    for (const motif of ["court", "a".repeat(501), "Motif sur\ndeux lignes, donc refusé."]) {
      const { error } = await suspendre(patron, cible.id, motif);
      assert.equal(error?.code, "23514", motif.slice(0, 20));
    }
    // L'auteur et la date ne se fournissent pas.
    const { error: auteurForge } = await patron.client
      .from("account_suspensions")
      .insert({ user_id: cible.id, reason: MOTIF, suspended_by: temoin.id });
    assert.equal(auteurForge?.code, REFUS);

    const { data } = await patron.client.from("account_suspensions").select("user_id");
    assert.ok(!data.some((s) => [cible.id, patron.id, adjoint.id].includes(s.user_id)));
  });

  it("un administrateur suspend un compte : l'auteur est fixé par la base, le motif journalisé", async () => {
    const tache = await engager(cible, projet.id, "logline", "avant-suspension");
    assert.equal(tache.state, "queued");

    const { error } = await suspendre(patron, cible.id, `  ${MOTIF}  `);
    assert.equal(error, null, error?.message);

    const { data } = await patron.client
      .from("account_suspensions")
      .select("user_id, reason, suspended_by")
      .eq("user_id", cible.id);
    assert.deepEqual(data, [{ user_id: cible.id, reason: MOTIF, suspended_by: patron.id }]);

    const { data: journal } = await patron.client
      .from("admin_audit_log")
      .select("id, created_at, actor_id, action, project_id, details")
      .eq("action", "suspension_compte")
      .eq("details->>compte", cible.id);
    assert.equal(journal.length, 1);
    assert.equal(journal[0].actor_id, patron.id);
    const annuaire = {
      comptes: new Map([
        [patron.id, "Awa"],
        [cible.id, "Bintou"],
      ]),
      projets: new Map(),
    };
    assert.equal(
      `${auteurDe(journal[0], annuaire)} ${descriptionDe(journal[0], annuaire)}`,
      `Awa a suspendu le compte de Bintou : « ${MOTIF} »`,
    );

    // Une seconde suspension du même compte est refusée : une ligne par compte.
    const { error: doublon } = await suspendre(adjoint, cible.id);
    assert.equal(doublon?.code, "23505");

    // La tâche en attente n'est pas exécutée : le worker la clôt en la réclamant.
    const reclamation = await executerSqlLocal(`
      ${annulerLesAutresTaches([tache.id])}
      set role filmfund_worker;
      select 'pris:' || job_id from public.reclamer_travail('worker-suspension', array['logline']);
    `);
    assert.equal(reclamation.code, 0, reclamation.erreurs);
    assert.doesNotMatch(reclamation.sortie, /pris:/);
    const { data: close } = await patron.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    assert.equal(close.state, "cancelled");
    assert.match(close.reason ?? "", /Droits de l'auteur retirés/);
  });

  it("le compte suspendu ne lit ni n'écrit plus rien par l'API", async () => {
    const tentatives = {
      "lire ses projets": cible.client.from("projects").select("id"),
      "lire son profil": cible.client.from("profiles").select("id").eq("id", cible.id),
      "lire les plans, pourtant publics": cible.client.from("plans").select("code"),
      "créer un projet": cible.client
        .from("projects")
        .insert({ title: "Projet d'un compte suspendu", owner_id: cible.id }),
      "modifier son projet": cible.client
        .from("projects")
        .update({ title: "X" })
        .eq("id", projet.id),
      "appeler une fonction privilégiée": cible.client.rpc("acces_au_projet", {
        p_project_id: projet.id,
      }),
      "demander un devis": cible.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "logline",
        p_params: {},
      }),
      "lire son propre état": cible.client.rpc("compte_suspendu"),
      "lire sa suspension": cible.client.from("account_suspensions").select("reason"),
      "se rétablir": cible.client.from("account_suspensions").delete().eq("user_id", cible.id),
    };
    for (const [nom, requete] of Object.entries(tentatives)) {
      const { data, error } = await requete;
      assert.equal(error?.code, SUSPENDU, nom);
      assert.equal(data, null, nom);
    }

    const { data: intact } = await patron.client
      .from("projects")
      .select("title")
      .eq("id", projet.id)
      .single();
    assert.equal(intact.title, "Projet du compte suspendu");
  });

  it("le compte suspendu ne lit ni n'envoie plus de fichier", async () => {
    const { data: lien, error: lecture } = await images(cible).createSignedUrl(image, 60);
    assert.ok(lecture, "un lien signé ne doit plus être délivré");
    assert.equal(lien, null);

    const { error: envoi } = await images(cible).upload(
      `${projet.id}/couverture/${crypto.randomUUID()}.png`,
      PIXEL,
      { contentType: "image/png" },
    );
    assert.ok(envoi, "un envoi ne doit plus être accepté");

    const { data: retires } = await images(cible).remove([image]);
    assert.deepEqual(retires ?? [], []);
    // Le fichier est toujours là : l'administration le lit.
    const { error: parAdmin } = await images(patron).createSignedUrl(image, 60);
    assert.equal(parAdmin, null, parAdmin?.message);
  });

  it("les autres comptes, les visiteurs et l'administration ne subissent rien", async () => {
    const { data: plans, error: visiteur } = await clientAnonyme().from("plans").select("code");
    assert.equal(visiteur, null, visiteur?.message);
    assert.ok(plans.length >= 3);

    const { data, error } = await temoin.client
      .from("projects")
      .select("id")
      .eq("id", projetTemoin.id);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
    const { data: etat } = await temoin.client.rpc("compte_suspendu");
    assert.equal(etat, false);
    // Un compte ordinaire ne lit aucune suspension, pas même qu'il en existe.
    const { data: vues } = await temoin.client.from("account_suspensions").select("user_id");
    assert.deepEqual(vues, []);

    const { data: parAdmin, error: admin } = await adjoint.client
      .from("projects")
      .select("id")
      .eq("id", projet.id);
    assert.equal(admin, null, admin?.message);
    assert.equal(parAdmin.length, 1);
  });

  it("un compte suspendu ne devient pas administrateur, et un motif ne se réécrit pas", async () => {
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: cible.email,
      nouveau_role: "admin",
    });
    assert.equal(error?.code, REFUS);
    assert.match(error.message, /rétablissez-le/);

    const { error: reecriture } = await patron.client
      .from("account_suspensions")
      .update({ reason: "Un autre motif, écrit après coup." })
      .eq("user_id", cible.id);
    assert.equal(reecriture?.code, REFUS);
  });

  it("le mode privé ne gèle pas la suspension", async () => {
    const victime = await creerCompte("suspension-prive", "Compte suspendu en mode privé");
    await executerSqlLocal("update public.app_settings set private_admin_only = true where id;");
    try {
      const { error } = await suspendre(patron, victime.id);
      assert.equal(error, null, error?.message);
      const { data, error: retour } = await retablir(patron, victime.id);
      assert.equal(retour, null, retour?.message);
      assert.equal(data.length, 1);
    } finally {
      await executerSqlLocal("update public.app_settings set private_admin_only = false where id;");
    }
  });

  it("rétabli, le compte retrouve tout, et le journal garde les deux actions", async () => {
    const { data: parMembre } = await retablir(temoin, cible.id);
    assert.deepEqual(parMembre, []);
    const { error: encore } = await cible.client.from("projects").select("id");
    assert.equal(encore?.code, SUSPENDU);

    const { data, error } = await retablir(adjoint, cible.id);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);

    const { data: projets, error: lecture } = await cible.client
      .from("projects")
      .select("id")
      .eq("id", projet.id);
    assert.equal(lecture, null, lecture?.message);
    assert.equal(projets.length, 1);
    const { error: fichier } = await images(cible).createSignedUrl(image, 60);
    assert.equal(fichier, null, fichier?.message);
    const tache = await engager(cible, projet.id, "logline", "apres-retablissement");
    assert.equal(tache.state, "queued");
    await cible.client.rpc("annuler_travail", { p_job_id: tache.id });

    const { data: journal } = await patron.client
      .from("admin_audit_log")
      .select("id, created_at, actor_id, action, project_id, details")
      .in("action", ["suspension_compte", "retablissement_compte"])
      .eq("details->>compte", cible.id)
      .order("id");
    assert.deepEqual(
      journal.map((entree) => [entree.action, entree.actor_id]),
      [
        ["suspension_compte", patron.id],
        ["retablissement_compte", adjoint.id],
      ],
    );
    assert.equal(
      descriptionDe(journal[1], { comptes: new Map([[cible.id, "Awa"]]), projets: new Map() }),
      "a rétabli le compte d'Awa",
    );
  });
});

describe("Suspension : ce que la migration tient", () => {
  const migration = lire(MIGRATION);
  const sansCommentaires = migration.replace(/^\s*--.*$/gm, "");

  it("le contrôle avant requête ne nomme pas la lecture privilégiée dans la condition d'un visiteur", () => {
    // PostgreSQL vérifie le droit d'exécuter une fonction dès qu'il prépare
    // l'expression qui la nomme : en une seule condition, tout visiteur serait
    // refusé. Vu en écrivant le lot.
    const corps = /create function public\.controle_avant_requete\(\)[\s\S]*?\$\$;/.exec(
      sansCommentaires,
    )[0];
    assert.match(corps, /if \(select auth\.uid\(\)\) is null then\s+return;\s+end if;/);
    assert.doesNotMatch(corps, /auth\.uid\(\)[^;]*compte_suspendu\(\)/);
    assert.doesNotMatch(corps, /security definer/);
    assert.match(
      sansCommentaires,
      /grant execute on function public\.controle_avant_requete\(\) to anon, authenticated, service_role;/,
    );
  });

  it("chaque chemin d'accès a son verrou, et le retour arrière est écrit", () => {
    assert.match(
      sansCommentaires,
      /alter role authenticator set pgrst\.db_pre_request = 'public\.controle_avant_requete';\s+notify pgrst, 'reload config';/,
    );
    assert.match(
      sansCommentaires,
      /create policy "Compte suspendu : aucun accès"\s+on storage\.objects\s+as restrictive\s+for all\s+to authenticated/,
    );
    assert.match(
      sansCommentaires,
      /and not exists \(select 1 from public\.account_suspensions s where s\.user_id = p_user\)/,
    );
    assert.match(migration, /alter role authenticator reset pgrst\.db_pre_request;/);
  });

  it("le journal sait dire les deux actions", () => {
    const journal = lire("src/lib/journal-administration.ts");
    for (const action of ["suspension_compte", "retablissement_compte"]) {
      assert.match(sansCommentaires, new RegExp(`'${action}'`));
      assert.match(journal, new RegExp(`case "${action}":`));
    }
  });
});
