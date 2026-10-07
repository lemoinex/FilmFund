/**
 * WEAVER (lot X1) : la note de réalisation, le pitch développé et le pitch
 * oral, de la tâche réclamée au document versionné, contre la base locale et
 * sous le rôle du worker.
 *
 * AUCUN APPEL PAYANT ici : un FOURNISSEUR FACTICE, désigné comme tel, rejoue
 * les réponses que le test lui donne. Il ne prouve pas que l'agent écrit une
 * bonne note ni un pitch qui se dit en trois minutes : cela se vérifie en
 * recette, dans le budget autorisé.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";

import { LIVRABLES_IA } from "../src/lib/propositions.ts";
import { executeursWeaver } from "../worker/src/agents/weaver.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import {
  PROFIL_NOTE_INTENTION,
  PROFIL_NOTE_REALISATION,
  PROFIL_PITCH_DEVELOPPE,
  PROFIL_PITCH_ORAL,
  PROFILS_WEAVER,
} from "../worker/src/ia/profils.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const OPUS = "claude-opus-5-5";
const MIGRATION = "supabase/migrations/20261007210000_weaver_realisation_pitch.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

/** Les trois livrables du lot : action, profil, unités, et où le texte atterrit. */
const LIVRABLES = [
  {
    action: "direction_note",
    profil: PROFIL_NOTE_REALISATION,
    unites: 3,
    type: "note_realisation",
    titre: "Note de réalisation",
    objectif: /Écris la note de réalisation de ce projet\.$/,
  },
  {
    action: "pitch_extended",
    profil: PROFIL_PITCH_DEVELOPPE,
    unites: 2,
    type: "pitch_developpe",
    titre: "Pitch développé",
    objectif: /Écris le pitch développé de ce projet, en une page\.$/,
  },
  {
    action: "pitch_oral",
    profil: PROFIL_PITCH_ORAL,
    unites: 2,
    type: "pitch_oral",
    titre: "Pitch oral",
    objectif: /Écris le pitch oral de ce projet, à dire en trois minutes environ\.$/,
  },
];

/** Réponse d'un fournisseur factice, facturée 1 200 jetons en entrée et 350 en sortie. */
function reponseFactice(texte) {
  return {
    texte,
    arret: "fin",
    modeleServi: OPUS,
    repli: false,
    usages: [{ modele: OPUS, jetonsEntree: 1200, jetonsSortie: 350 }],
  };
}

/** Fournisseur factice : rejoue les réponses données, dans l'ordre, et note ce qu'on lui demande. */
function fournisseurFactice(...reponses) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    return reponses[Math.min(demandes.length, reponses.length) - 1];
  };
  return { fournisseur, demandes };
}

describe("WEAVER : note de réalisation et pitchs", () => {
  let base;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    const administrateur = await creerCompte("admin-realisation", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await base.end();
  });

  function options(fournisseur) {
    return {
      base,
      nom: "worker-realisation-test",
      executeurs: executeursWeaver(base, fournisseur),
      journal: () => {},
      battementMs: 50,
    };
  }

  /** Mène une demande jusqu'à sa proposition, avec un fournisseur factice. */
  async function proposer(porteur, projetId, action, cle, reponse) {
    const tache = await engager(porteur, projetId, action, cle);
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice(reponse));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile, action")
      .eq("job_id", tache.id)
      .single();
    return { tache, demandes, proposition };
  }

  const documentsDe = async (compte, projetId) =>
    (
      await compte.client
        .from("project_documents")
        .select("id, type, title, status, content")
        .eq("project_id", projetId)
        .order("type")
    ).data;

  it("WEAVER sait écrire huit livrables, dont les trois du lot", () => {
    assert.deepEqual(Object.keys(PROFILS_WEAVER), [
      "logline",
      "synopsis_short",
      "synopsis_standard",
      "synopsis_detailed",
      "intention_note",
      "direction_note",
      "pitch_extended",
      "pitch_oral",
    ]);
    for (const { action, profil } of LIVRABLES) {
      assert.equal(PROFILS_WEAVER[action], profil);
      assert.match(profil.id, /^weaver\.[a-z_]+@1$/);
    }
    // Chacun a son profil : aucun ne reprend celui de la note d'intention.
    assert.equal(new Set(LIVRABLES.map((l) => l.profil.id)).size, 3);
    assert.ok(!LIVRABLES.some((l) => l.profil.id === PROFIL_NOTE_INTENTION.id));
  });

  for (const { action, profil, unites, type, titre, objectif } of LIVRABLES) {
    it(`${titre} : devis au barème, proposition déposée, document créé en brouillon et versionné`, async () => {
      const porteur = await creerCompte(`realisation-${type}`);
      const projet = await creerProjet(porteur, "La Saison sèche");
      const { error } = await porteur.client
        .from("projects")
        .update({
          synopsis: "Un village attend la pluie.",
          artistic_vision: "Plans larges, lumière d'harmattan.",
        })
        .eq("id", projet.id);
      assert.ifError(error);

      const texte = `${titre} proposé.\n\nSecond paragraphe.`;
      const { tache, demandes, proposition } = await proposer(
        porteur,
        projet.id,
        action,
        `cle-${type}`,
        texte,
      );

      // Le profil du livrable, ses limites, et le contexte des autres rédactions.
      assert.equal(demandes.length, 1);
      assert.equal(demandes[0].profil.id, profil.id);
      assert.match(demandes[0].message, objectif);
      assert.match(demandes[0].message, /Un village attend la pluie\./);
      assert.match(demandes[0].message, /Plans larges, lumière d'harmattan\./);
      assert.deepEqual(
        [proposition.content, proposition.profile, proposition.action, proposition.state],
        [texte, profil.id, action, "proposed"],
      );

      // Les unités du barème, consommées une fois le texte livré.
      const { data: travail } = await porteur.client
        .from("jobs")
        .select("state, reservation_id")
        .eq("id", tache.id)
        .single();
      assert.equal(travail.state, "succeeded");
      const { data: reglement } = await porteur.client
        .from("reservation_settlements")
        .select("consumed, released")
        .eq("reservation_id", travail.reservation_id)
        .single();
      assert.deepEqual([reglement.consumed, reglement.released], [unites, 0]);

      // Rien n'est écrit tant que la proposition n'est pas appliquée.
      assert.deepEqual(await documentsDe(porteur, projet.id), []);

      const { error: refus } = await porteur.client.rpc("accepter_proposition", {
        p_suggestion_id: proposition.id,
        p_content: null,
      });
      assert.ifError(refus);

      const documents = await documentsDe(porteur, projet.id);
      assert.equal(documents.length, 1);
      assert.deepEqual(
        [documents[0].type, documents[0].title, documents[0].status, documents[0].content],
        [type, titre, "brouillon", texte],
      );
      const { data: versions } = await porteur.client
        .from("project_document_versions")
        .select("version_number, content")
        .eq("document_id", documents[0].id);
      assert.deepEqual(versions, [{ version_number: 1, content: texte }]);
    });
  }

  it("chaque livrable a son document : aucun n'écrase l'autre, ni la note d'intention", async () => {
    const porteur = await creerCompte("realisation-ensemble");
    const projet = await creerProjet(porteur, "Les Trois Textes");
    const { error } = await porteur.client.from("project_documents").insert({
      project_id: projet.id,
      type: "note_intention",
      title: "Note d'intention",
      content: "Pourquoi ce film.",
      created_by: porteur.id,
    });
    assert.ifError(error);

    for (const { action, type } of LIVRABLES) {
      const { proposition } = await proposer(
        porteur,
        projet.id,
        action,
        `ensemble-${type}`,
        `Texte de ${type}.`,
      );
      const { error: refus } = await porteur.client.rpc("accepter_proposition", {
        p_suggestion_id: proposition.id,
        p_content: null,
      });
      assert.ifError(refus);
    }

    const documents = await documentsDe(porteur, projet.id);
    assert.deepEqual(Object.fromEntries(documents.map((d) => [d.type, d.content])), {
      note_intention: "Pourquoi ce film.",
      note_realisation: "Texte de note_realisation.",
      pitch_developpe: "Texte de pitch_developpe.",
      pitch_oral: "Texte de pitch_oral.",
    });
    // Le pitch d'une phrase du projet n'est pas touché non plus.
    const { data: intact } = await porteur.client
      .from("projects")
      .select("logline")
      .eq("id", projet.id)
      .single();
    assert.equal(intact.logline, "");
  });

  it("une seconde note réécrit le même document : deux versions, l'ancien texte conservé", async () => {
    const porteur = await creerCompte("realisation-seconde");
    const projet = await creerProjet(porteur, "La Seconde Note");
    const premiere = await proposer(
      porteur,
      projet.id,
      "direction_note",
      "note-1",
      "Première note.",
    );
    await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: premiere.proposition.id,
      p_content: null,
    });
    const seconde = await proposer(porteur, projet.id, "direction_note", "note-2", "Seconde note.");
    const { data: acceptee, error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: seconde.proposition.id,
      p_content: "Seconde note, retouchée.",
    });
    assert.ifError(error);
    assert.deepEqual(
      [acceptee.state, acceptee.final_content, acceptee.replaced_content],
      ["accepted", "Seconde note, retouchée.", "Première note."],
    );

    const documents = await documentsDe(porteur, projet.id);
    assert.equal(documents.length, 1);
    assert.equal(documents[0].content, "Seconde note, retouchée.");
    const { data: versions } = await porteur.client
      .from("project_document_versions")
      .select("version_number, content")
      .eq("document_id", documents[0].id)
      .order("version_number");
    assert.deepEqual(
      versions.map((v) => v.content),
      ["Première note.", "Seconde note, retouchée."],
    );
  });

  it("un pitch de plus de 6 000 caractères est refusé au dépôt, et à l'acceptation", async () => {
    const porteur = await creerCompte("realisation-long");
    const projet = await creerProjet(porteur, "Le Pitch trop long");
    const tache = await engager(porteur, projet.id, "pitch_oral", "pitch-long");
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    const { fournisseur } = fournisseurFactice(
      reponseFactice("x".repeat(6001)),
      reponseFactice("y".repeat(6001)),
    );
    // Deux échecs connus : la tâche échoue, sans troisième essai.
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, reservation_id")
      .eq("id", tache.id)
      .single();
    assert.equal(travail.state, "failed");
    const { data: reglement } = await porteur.client
      .from("reservation_settlements")
      .select("consumed, released")
      .eq("reservation_id", travail.reservation_id)
      .single();
    assert.deepEqual([reglement.consumed, reglement.released], [0, 2]);

    // Une proposition courte, rallongée à l'écran avant d'être appliquée.
    const { proposition } = await proposer(
      porteur,
      projet.id,
      "pitch_oral",
      "pitch-court",
      "Court.",
    );
    const { error } = await porteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: "z".repeat(6001),
    });
    assert.equal(error?.code, "22023");
    assert.deepEqual(await documentsDe(porteur, projet.id), []);
  });

  it("un lecteur ne demande ni n'applique ; un compte étranger ne lit rien", async () => {
    const porteur = await creerCompte("realisation-porteur");
    const lecteur = await creerCompte("realisation-lecteur");
    const etranger = await creerCompte("realisation-etranger");
    const projet = await creerProjet(porteur, "Le Projet partagé");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "direction_note",
        p_params: {},
      });
      assert.equal(error?.code, "42501");
    }

    const { proposition } = await proposer(
      porteur,
      projet.id,
      "pitch_extended",
      "partage",
      "Pitch.",
    );
    const { error: parLecteur } = await lecteur.client.rpc("accepter_proposition", {
      p_suggestion_id: proposition.id,
      p_content: null,
    });
    assert.equal(parLecteur?.code, "42501");
    const { data: vues } = await etranger.client
      .from("ai_suggestions")
      .select("id")
      .eq("id", proposition.id);
    assert.deepEqual(vues, []);
    assert.deepEqual(await documentsDe(porteur, projet.id), []);
  });
});

describe("Note de réalisation et pitchs : l'écran, le worker et la base s'accordent", () => {
  const migration = lire(MIGRATION);
  const corps = (nom) => {
    const debut = migration.indexOf(`create or replace function public.${nom}`);
    assert.ok(debut >= 0, nom);
    return migration.slice(debut, migration.indexOf("\n$$;", debut));
  };

  it("la borne de l'écran, celle du profil et celles de la base sont les mêmes", () => {
    for (const { action, profil } of LIVRABLES) {
      const borne = LIVRABLES_IA[action].longueurMax;
      assert.equal(profil.longueurMax, borne, action);
      assert.ok(profil.longueurCible < borne, action);
      for (const fonction of ["livrer_proposition", "accepter_proposition"]) {
        assert.match(
          corps(fonction),
          new RegExp(`when '${action}' then v_max := ${borne};`),
          `${fonction} : ${action}`,
        );
      }
    }
  });

  it("chaque livrable atterrit dans son propre type de document, que la base connaît", () => {
    const acceptation = corps("accepter_proposition");
    const types = LIVRABLES.map(({ action, type, titre }) => {
      assert.match(
        acceptation,
        new RegExp(
          `when '${action}' then\\s+v_type := '${type}';\\s+v_titre := '${titre.replace("'", "''")}';`,
        ),
        action,
      );
      assert.match(
        migration,
        new RegExp(`alter type public\\.document_type add value if not exists '${type}'`),
        type,
      );
      return type;
    });
    // Deux livrables du même type s'écraseraient à l'acceptation.
    assert.equal(new Set(types).size, LIVRABLES.length);
  });

  it("le barème en connaît le prix, et l'administration comme la vitrine y ont droit", () => {
    for (const { action, unites } of LIVRABLES) {
      assert.match(
        migration,
        new RegExp(`add column ${action} integer not null default ${unites}`),
      );
      assert.match(migration, new RegExp(`alter column ${action} drop default`));
      assert.match(migration, new RegExp(`and ${action} >= 0`));
      assert.match(
        corps("creer_devis"),
        new RegExp(`when '${action}' then v_quantite := v_bareme\\.${action};`),
      );
    }
    const colonnes = LIVRABLES.map((l) => l.action).join(", ");
    assert.match(
      migration,
      new RegExp(
        `grant insert \\(${colonnes}\\)\\s+on table public\\.text_unit_rate_versions to authenticated;`,
      ),
    );
    assert.match(
      migration,
      new RegExp(
        `grant select \\(${colonnes}\\)\\s+on table public\\.text_unit_rate_versions to anon;`,
      ),
    );
  });

  it("l'écran range les trois encarts dans l'onglet Documents, et ne les confond pas avec le pitch", () => {
    for (const { action } of LIVRABLES) {
      assert.equal(LIVRABLES_IA[action].page, "documents");
      assert.match(LIVRABLES_IA[action].description, /fournisseur d'IA/);
    }
    // « Pitch » désigne déjà la logline de la page du projet.
    assert.equal(LIVRABLES_IA.logline.page, "projet");
    assert.match(LIVRABLES_IA.pitch_extended.description, /Ce n'est pas le pitch d'une phrase/);
    // La durée d'un pitch oral n'est pas mesurée : l'écran le dit.
    assert.match(LIVRABLES_IA.pitch_oral.description, /estimation/);
    const page = lire("src/app/(app)/projets/[id]/documents/page.tsx");
    for (const { action, type } of LIVRABLES) {
      assert.match(page, new RegExp(`${action}: "${type}",`));
    }
  });

  it("les consignes tiennent l'agent à ce que le dossier dit", () => {
    assert.match(PROFIL_NOTE_REALISATION.systeme, /à la première personne/);
    assert.match(PROFIL_NOTE_REALISATION.systeme, /ne nomme ni matériel ni marque/);
    assert.match(PROFIL_NOTE_REALISATION.systeme, /que le dossier ne cite pas/);
    assert.match(PROFIL_PITCH_DEVELOPPE.systeme, /ne dévoile pas le dénouement/);
    assert.match(PROFIL_PITCH_DEVELOPPE.systeme, /pas de promesse de succès/);
    assert.match(PROFIL_PITCH_ORAL.systeme, /pour l'oreille/);
    assert.match(PROFIL_PITCH_ORAL.systeme, /si le dossier le dit/);
    for (const { profil } of LIVRABLES) {
      assert.match(profil.systeme, new RegExp(`Vise ${profil.longueurCible} caractères environ`));
      assert.equal(profil.fournisseur, "anthropic");
    }
  });

  it("la migration n'ouvre ni table, ni politique, ni droit au worker", () => {
    const code = migration.replace(/^\s*--.*$/gm, "");
    assert.doesNotMatch(
      code,
      /create table|create policy|alter policy|drop policy|disable row level/i,
    );
    assert.doesNotMatch(code, /to filmfund_worker|grant execute|revoke /i);
    assert.equal([...code.matchAll(/^grant [^;]+;/gm)].length, 2);
  });
});
