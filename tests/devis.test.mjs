/**
 * Devis, réservation atomique et idempotence (lot G), par l'API réelle.
 *
 * Les studios éprouvés ici sont au plan Gratuit — 20 unités texte, 10
 * images, 2 exports PDF par mois —, ce qui permet d'atteindre les limites en
 * quelques appels. Chaque scénario qui consomme des unités a son propre
 * porteur : les compteurs d'un studio ne débordent pas sur un autre test.
 *
 * Les acceptations simultanées passent par deux vraies sessions
 * PostgreSQL : par l'API, deux requêtes arrivent trop décalées pour se
 * croiser, et un test qui s'y fierait passerait aussi sans verrou.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { lireValeursBareme } from "../src/lib/plans.ts";
import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  executerSqlLocal as session,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const LIMITE_DU_PLAN = "53400";
const PARAMETRE_INVALIDE = "22023";
const REFUS = "42501";
const CLE_EN_CONFLIT = "DV002";
const DEVIS_DEJA_ACCEPTE = "DV003";

async function devis(compte, projetId, action, params = {}) {
  const { data, error } = await compte.client.rpc("creer_devis", {
    p_project_id: projetId,
    p_action: action,
    p_params: params,
  });
  return { devis: data?.[0], error };
}

async function devisValide(compte, projetId, action, params = {}) {
  const { devis: d, error } = await devis(compte, projetId, action, params);
  assert.ifError(error);
  return d;
}

function accepter(compte, devisId, cle) {
  return compte.client.rpc("accepter_devis", { p_quote_id: devisId, p_idempotency_key: cle });
}

/** Porteur au plan Gratuit et son unique projet. */
async function porteurEtProjet(prefixe) {
  const porteur = await creerCompte(prefixe, prefixe, { plan: "gratuit" });
  const projet = await creerProjet(porteur, `Projet de ${prefixe}`);
  return { porteur, projet };
}

/** Acceptation dans une session qui garde son verrou `attente` secondes. */
function acceptationEnSession(compteId, devisId, cle, attente) {
  return `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub": "${compteId}", "role": "authenticated"}', true);
    select 'reservation:' || id from public.accepter_devis('${devisId}', '${cle}');
    select pg_sleep(${attente});
    commit;
  `;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function reservationDe(sortie) {
  return /reservation:([0-9a-f-]{36})/.exec(sortie)?.[1];
}

describe("Formulaire du barème", () => {
  const valides = {
    logline: "1",
    synopsis_short: "1",
    synopsis_standard: "2",
    synopsis_detailed: "3",
    intention_note: "3",
    dramatic_analysis: "4",
    treatment: "8",
    bible: "10",
    screenplay_per_sequence: "2",
    dialogue_per_scene: "1",
  };

  it("lit des entiers, zéro compris", () => {
    const resultat = lireValeursBareme((cle) => ({ ...valides, logline: "0" })[cle]);
    assert.deepEqual(resultat, {
      valeurs: {
        logline: 0,
        synopsis_short: 1,
        synopsis_standard: 2,
        synopsis_detailed: 3,
        intention_note: 3,
        dramatic_analysis: 4,
        treatment: 8,
        bible: 10,
        screenplay_per_sequence: 2,
        dialogue_per_scene: 1,
      },
    });
  });

  it("refuse décimales, champs vides et valeurs démesurées, en nommant le livrable", () => {
    for (const [valeur, attendu] of [
      ["2,5", /^Traitement : saisissez un nombre entier/],
      ["", /^Traitement : saisissez un nombre entier/],
      ["1001", /^Traitement : la valeur doit être comprise entre 0 et/],
    ]) {
      const resultat = lireValeursBareme((cle) => ({ ...valides, treatment: valeur })[cle]);
      assert.ok("erreur" in resultat, `« ${valeur} » doit être refusé`);
      assert.match(resultat.erreur, attendu);
    }
  });
});

describe("Devis et réservations", () => {
  let administrateur;

  before(async () => {
    administrateur = await creerCompte("admin-devis", "Administration");
    await promouvoirAdministrateur(administrateur.id);
  });

  describe("Devis", () => {
    it("la base calcule le coût selon le barème et le plan, pour quinze minutes", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-calcul");

      const traitement = await devisValide(porteur, projet.id, "treatment");
      assert.equal(traitement.unit, "text");
      assert.equal(traitement.quantity, 8);
      assert.equal(traitement.allowance, 20);
      assert.equal(traitement.available, 20);

      const duree = (new Date(traitement.expires_at) - Date.now()) / 60_000;
      assert.ok(duree > 14 && duree <= 15, `validité de ${duree} minutes`);

      const scenario = await devisValide(porteur, projet.id, "screenplay", { sequences: 3 });
      assert.equal(scenario.quantity, 6);

      const dialogues = await devisValide(porteur, projet.id, "dialogue", { scenes: 4 });
      assert.equal(dialogues.quantity, 4);

      const images = await devisValide(porteur, projet.id, "image", { count: 4 });
      assert.deepEqual([images.unit, images.quantity, images.allowance], ["image", 4, 10]);

      const pdf = await devisValide(porteur, projet.id, "pdf_export");
      assert.deepEqual([pdf.unit, pdf.quantity, pdf.allowance], ["pdf", 1, 2]);
    });

    it("refuse une action inconnue et des paramètres invalides", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-parametres");

      for (const [action, params] of [
        ["inconnue", {}],
        ["screenplay", {}],
        ["screenplay", { sequences: 2.5 }],
        ["screenplay", { sequences: "3" }],
        ["dialogue", { scenes: 0 }],
        ["image", { count: 101 }],
      ]) {
        const { error } = await devis(porteur, projet.id, action, params);
        assert.equal(error?.code, PARAMETRE_INVALIDE, `${action} ${JSON.stringify(params)}`);
      }

      const { error: tableau } = await devis(porteur, projet.id, "logline", [1, 2]);
      assert.equal(tableau?.code, PARAMETRE_INVALIDE, "les paramètres doivent former un objet");
    });

    it("le porteur et un éditeur engagent des unités ; un lecteur, un étranger ou un visiteur non", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-droits");
      const editeur = await creerCompte("devis-editeur");
      const lecteur = await creerCompte("devis-lecteur");
      const etranger = await creerCompte("devis-etranger");
      await faireEntrer(porteur, projet.id, editeur, "editor");
      await faireEntrer(porteur, projet.id, lecteur, "viewer");

      const parEditeur = await devisValide(editeur, projet.id, "logline");
      // Le quota est celui du studio du projet, pas celui de l'éditeur.
      assert.equal(parEditeur.allowance, 20);

      for (const compte of [lecteur, etranger]) {
        const { error } = await devis(compte, projet.id, "logline");
        assert.equal(error?.code, REFUS);
      }

      const { error: visiteur } = await clientAnonyme().rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "logline",
        p_params: {},
      });
      assert.ok(visiteur, "un visiteur ne demande pas de devis");
    });

    it("un étranger n'accepte ni ne lit le devis d'un autre, sans apprendre qu'il existe", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-cloison");
      const lecteur = await creerCompte("devis-cloison-lecteur");
      const etranger = await creerCompte("devis-cloison-etranger");
      await faireEntrer(porteur, projet.id, lecteur, "viewer");

      const d = await devisValide(porteur, projet.id, "logline");

      const { error: vrai } = await accepter(etranger, d.quote_id, "cle-etrangere");
      const { error: inexistant } = await accepter(etranger, crypto.randomUUID(), "cle-etrangere");
      assert.equal(vrai?.code, REFUS);
      assert.equal(vrai?.message, inexistant?.message, "même réponse qu'un devis inexistant");

      const { data: lu } = await etranger.client.from("quotes").select("id");
      assert.deepEqual(lu, []);

      // L'équipe du projet, lecteurs compris, voit ce qui s'y engage.
      const { data: vuParLecteur } = await lecteur.client.from("quotes").select("id");
      assert.deepEqual(vuParLecteur, [{ id: d.quote_id }]);

      const { error: acceptationLecteur } = await accepter(lecteur, d.quote_id, "cle-lecteur");
      assert.equal(acceptationLecteur?.code, REFUS);
    });

    it("le navigateur n'écrit ni devis, ni réservation, ni règlement", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-ecriture");
      const d = await devisValide(porteur, projet.id, "logline");
      const { data: reservation } = await accepter(porteur, d.quote_id, "cle-ecriture");

      const { data: ligne } = await porteur.client.from("quotes").select("*").single();
      const { error: copie } = await porteur.client
        .from("quotes")
        .insert({ ...ligne, id: crypto.randomUUID(), quantity: 0 });
      assert.ok(copie, "l'écriture d'un devis doit être refusée");

      const { error: baisse } = await porteur.client
        .from("quotes")
        .update({ quantity: 0 })
        .eq("id", d.quote_id)
        .select("id");
      assert.ok(baisse, "la modification d'un devis doit être refusée");

      const { error: reservationDirecte } = await porteur.client.from("reservations").insert({
        ...reservation,
        id: crypto.randomUUID(),
        idempotency_key: "cle-directe",
      });
      assert.ok(reservationDirecte, "l'écriture d'une réservation doit être refusée");

      const { error: reglement } = await porteur.client
        .from("reservation_settlements")
        .insert({ reservation_id: reservation.id, reserved: 1, consumed: 0 });
      assert.ok(reglement, "l'écriture d'un règlement doit être refusée");

      const { error: rpc } = await porteur.client.rpc("regler_reservation", {
        p_reservation_id: reservation.id,
        p_consumed: 0,
      });
      assert.ok(rpc, "le règlement est réservé au worker");
    });
  });

  describe("Idempotence", () => {
    it("même clé, même demande : la même réservation, comptée une fois", async () => {
      const { porteur, projet } = await porteurEtProjet("idem-meme");
      const d = await devisValide(porteur, projet.id, "treatment");

      const premiere = await accepter(porteur, d.quote_id, "cle-double-envoi");
      const seconde = await accepter(porteur, d.quote_id, "cle-double-envoi");
      assert.ifError(premiere.error);
      assert.ifError(seconde.error);
      assert.equal(seconde.data.id, premiere.data.id);

      // Un nouveau devis pour la même demande, sous la même clé — un envoi
      // rejoué après expiration, par exemple — renvoie aussi la première.
      const redemande = await devisValide(porteur, projet.id, "treatment");
      const rejeu = await accepter(porteur, redemande.quote_id, "cle-double-envoi");
      assert.ifError(rejeu.error);
      assert.equal(rejeu.data.id, premiere.data.id);

      const suivant = await devisValide(porteur, projet.id, "logline");
      assert.equal(suivant.available, 12, "les 8 unités ne sont engagées qu'une fois");

      const { data: reservations } = await porteur.client.from("reservations").select("id");
      assert.equal(reservations.length, 1);
    });

    it("même clé, autre demande : conflit", async () => {
      const { porteur, projet } = await porteurEtProjet("idem-conflit");
      const deux = await devisValide(porteur, projet.id, "screenplay", { sequences: 2 });
      const trois = await devisValide(porteur, projet.id, "screenplay", { sequences: 3 });

      assert.ifError((await accepter(porteur, deux.quote_id, "cle-partagee")).error);
      const { error } = await accepter(porteur, trois.quote_id, "cle-partagee");
      assert.equal(error?.code, CLE_EN_CONFLIT);
    });

    it("un devis ne s'accepte qu'une fois, même sous une autre clé", async () => {
      const { porteur, projet } = await porteurEtProjet("idem-unique");
      const d = await devisValide(porteur, projet.id, "logline");

      assert.ifError((await accepter(porteur, d.quote_id, "cle-une")).error);
      const { error } = await accepter(porteur, d.quote_id, "cle-deux");
      assert.equal(error?.code, DEVIS_DEJA_ACCEPTE);
    });

    it("refuse une clé vide ou démesurée", async () => {
      const { porteur, projet } = await porteurEtProjet("idem-cle");
      const d = await devisValide(porteur, projet.id, "logline");

      for (const cle of ["", "x".repeat(201)]) {
        const { error } = await accepter(porteur, d.quote_id, cle);
        assert.equal(error?.code, PARAMETRE_INVALIDE, `clé de ${cle.length} caractères`);
      }
    });
  });

  describe("Quotas", () => {
    it("l'acceptation revérifie le disponible, et chaque nature d'unité a son quota", async () => {
      const { porteur, projet } = await porteurEtProjet("quota-texte");
      // Trois devis de 8 unités, chacun calculé quand 20 restaient.
      const a = await devisValide(porteur, projet.id, "treatment");
      const b = await devisValide(porteur, projet.id, "treatment");
      const c = await devisValide(porteur, projet.id, "treatment");

      assert.ifError((await accepter(porteur, a.quote_id, "cle-a")).error);
      assert.ifError((await accepter(porteur, b.quote_id, "cle-b")).error);
      const { error } = await accepter(porteur, c.quote_id, "cle-c");
      assert.equal(error?.code, LIMITE_DU_PLAN);
      assert.match(error.message, /il reste 4 sur 20/);

      const { error: bible } = await devis(porteur, projet.id, "bible");
      assert.equal(bible?.code, LIMITE_DU_PLAN, "un devis au-delà du disponible est refusé");

      // Images et exports PDF ne puisent pas dans les unités texte.
      const images = await devisValide(porteur, projet.id, "image", { count: 10 });
      assert.equal(images.available, 10);
      assert.ifError((await accepter(porteur, images.quote_id, "cle-images")).error);
      const { error: image } = await devis(porteur, projet.id, "image", { count: 1 });
      assert.equal(image?.code, LIMITE_DU_PLAN);

      const pdf = await devisValide(porteur, projet.id, "pdf_export");
      assert.equal(pdf.available, 2);
    });
  });

  describe("Concurrence", () => {
    it("deux acceptations croisées pour les dernières unités : une seule aboutit", async () => {
      const { porteur, projet } = await porteurEtProjet("course-quota");
      const bible = await devisValide(porteur, projet.id, "bible");
      assert.ifError((await accepter(porteur, bible.quote_id, "cle-bible")).error);

      // Deux devis de 8 unités quand 10 restent : chacun passerait seul.
      const a = await devisValide(porteur, projet.id, "treatment");
      const b = await devisValide(porteur, projet.id, "treatment");

      const premiere = session(acceptationEnSession(porteur.id, a.quote_id, "course-a", 2));
      await pause(500);
      const seconde = session(acceptationEnSession(porteur.id, b.quote_id, "course-b", 0));
      const [s1, s2] = await Promise.all([premiere, seconde]);

      assert.equal(s1.code, 0, `la première session doit aboutir : ${s1.erreurs}`);
      assert.notEqual(s2.code, 0, "la seconde session doit être refusée");
      assert.match(s2.erreurs, /Quota insuffisant/);

      const { data } = await porteur.client.from("reservations").select("quantity");
      assert.equal(
        data.reduce((total, r) => total + r.quantity, 0),
        18,
      );
    });

    it("la même clé envoyée deux fois en même temps : une seule réservation, renvoyée aux deux", async () => {
      const { porteur, projet } = await porteurEtProjet("course-cle");
      const d = await devisValide(porteur, projet.id, "logline");

      const premiere = session(acceptationEnSession(porteur.id, d.quote_id, "cle-simultanee", 2));
      await pause(500);
      const seconde = session(acceptationEnSession(porteur.id, d.quote_id, "cle-simultanee", 0));
      const [s1, s2] = await Promise.all([premiere, seconde]);

      assert.equal(s1.code, 0, `la première session doit aboutir : ${s1.erreurs}`);
      assert.equal(s2.code, 0, `la seconde session doit aboutir : ${s2.erreurs}`);
      assert.ok(reservationDe(s1.sortie));
      assert.equal(reservationDe(s2.sortie), reservationDe(s1.sortie));

      const { data } = await porteur.client.from("reservations").select("id");
      assert.equal(data.length, 1);
    });
  });

  describe("Administration", () => {
    it("un administrateur engage des unités sur tout projet, et c'est journalisé", async () => {
      const { porteur, projet } = await porteurEtProjet("devis-admin");

      const d = await devisValide(administrateur, projet.id, "logline");
      const { data: reservation, error } = await accepter(administrateur, d.quote_id, "cle-admin");
      assert.ifError(error);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("action, details")
        .eq("project_id", projet.id)
        .eq("actor_id", administrateur.id);
      assert.deepEqual(journal, [
        {
          action: "intervention_contenu",
          details: { table: "reservations", operation: "insert", ligne: reservation.id },
        },
      ]);

      // Le porteur voit ce que l'administration a engagé dans son projet.
      const { data: vu } = await porteur.client.from("reservations").select("id");
      assert.deepEqual(vu, [{ id: reservation.id }]);
    });

    it("seule l'administration publie le barème ; la publication est journalisée", async () => {
      const compte = await creerCompte("bareme-fraudeur");
      // Valeurs en vigueur : la publication ne change rien aux autres suites.
      const { data: courante } = await compte.client
        .from("text_unit_rate_versions")
        .select(
          "logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note, dramatic_analysis, treatment, bible, screenplay_per_sequence, dialogue_per_scene",
        )
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      const { error: refus } = await compte.client.from("text_unit_rate_versions").insert(courante);
      assert.ok(refus, "un compte ne publie pas le barème");

      const { data: publiee, error } = await administrateur.client
        .from("text_unit_rate_versions")
        .insert({ ...courante, published_by: compte.id, published_at: "2020-01-01T00:00:00Z" })
        .select("version_number, published_by, published_at");
      assert.ok(error, "auteur et date ne se fournissent pas");
      assert.equal(publiee, null);

      const { data: version, error: publication } = await administrateur.client
        .from("text_unit_rate_versions")
        .insert(courante)
        .select("version_number, published_by, published_at")
        .single();
      assert.ifError(publication);
      assert.equal(version.published_by, administrateur.id);
      assert.ok(Date.now() - new Date(version.published_at) < 60_000);

      const { data: journal } = await administrateur.client
        .from("admin_audit_log")
        .select("details")
        .eq("action", "publication_bareme")
        .eq("actor_id", administrateur.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      assert.deepEqual(journal.details, { version: version.version_number });

      const { error: modification } = await administrateur.client
        .from("text_unit_rate_versions")
        .update({ treatment: 0 })
        .eq("version_number", version.version_number)
        .select("version_number");
      assert.ok(modification, "une version publiée ne se modifie pas");
    });
  });
});
