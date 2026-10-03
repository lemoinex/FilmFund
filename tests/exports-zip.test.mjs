/**
 * Exports ZIP (lot M5) : ce que chaque compte peut en demander et en lire par
 * l'API, et ce que la base accepte qu'on y dépose.
 *
 * AUCUN FICHIER RÉEL : l'export est déposé comme le ferait le worker, avec un
 * en-tête d'archive ZIP pour tout fichier. La fabrication de l'archive a sa
 * propre suite (worker-export.test.mjs).
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import {
  annulerLesAutresTaches,
  clientAnonyme,
  creerCompte,
  creerProjet,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const DEMANDE = { sections: ["synthese"], documents: [] };

/** En-tête d'une archive ZIP, et celui d'un PDF, en hexadécimal. */
const ARCHIVE = "504b0304140000000800";
const PDF = "255044462d312e370a25";

/**
 * Fait déposer un fichier pour une tâche en attente, comme le ferait le
 * worker : réclamation, envoi, lecture du contenu, dépôt. Un dépôt refusé
 * annule tout le bloc : la tâche retourne en attente.
 */
async function deposer(tacheId, { fichier = ARCHIVE, pages = "null" } = {}) {
  assert.match(tacheId, /^[0-9a-f-]{36}$/);
  assert.match(fichier, /^[0-9a-f]+$/);
  assert.match(pages, /^(null|\d+)$/);
  return sql(`
    ${annulerLesAutresTaches([tacheId])}
    do $$
    declare
      v_travail uuid;
      v_essai uuid;
    begin
      select r.job_id, r.attempt_id into v_travail, v_essai
      from public.reclamer_travail('worker-de-test', array['zip_export']) r;
      if v_travail is distinct from '${tacheId}' then
        raise exception 'Tâche réclamée inattendue : %', v_travail;
      end if;
      perform public.marquer_tentative_soumise(v_essai);
      perform public.livrer_export(
        v_essai,
        '\\x${fichier}'::bytea,
        ${pages},
        public.contexte_export(v_essai) ->> 'empreinte'
      );
    end $$;
  `);
}

describe("Exports ZIP : cloisonnement", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let tache;
  let exportZip;

  before(async () => {
    porteur = await creerCompte("zip-porteur");
    editeur = await creerCompte("zip-editeur");
    lecteur = await creerCompte("zip-lecteur");
    etranger = await creerCompte("zip-etranger");
    administrateur = await creerCompte("zip-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "La Saison des pluies");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Un pitch.", synopsis: "Un synopsis." })
      .eq("id", projet.id);
    assert.ifError(error);
  });

  async function devis(compte, action = "zip_export") {
    return compte.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: action,
      p_params: DEMANDE,
    });
  }

  const chercher = (compte, format) =>
    compte.client.rpc("export_disponible", {
      p_project_id: projet.id,
      p_params: DEMANDE,
      p_format: format,
    });

  it("le porteur et l'éditeur demandent un export ZIP, compté comme un export", async () => {
    for (const compte of [porteur, editeur]) {
      const { data, error } = await devis(compte);
      assert.equal(error, null, error?.message);
      assert.deepEqual([data[0].unit, data[0].quantity], ["pdf", 1]);
    }
  });

  it("ni le lecteur, ni un compte étranger, ni un visiteur n'en demandent", async () => {
    for (const compte of [lecteur, etranger]) {
      const { error } = await devis(compte);
      assert.equal(error?.code, "42501");
    }
    const { error } = await clientAnonyme().rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "zip_export",
      p_params: DEMANDE,
    });
    assert.ok(error, "un visiteur ne doit obtenir aucun devis");
  });

  it("un format que la base ne connaît pas n'obtient aucun devis", async () => {
    for (const action of ["rar_export", "xlsx_export", "ZIP_EXPORT"]) {
      const { data, error } = await devis(porteur, action);
      assert.equal(error?.code, "22023", action);
      assert.equal(data, null);
    }
  });

  it("la base refuse ce qui n'est pas une archive, ou qui déclare des pages", async () => {
    tache = await engager(porteur, projet.id, "zip_export", "zip-cle", DEMANDE);
    assert.equal(tache.action, "zip_export");

    // Le worker n'est pas cru sur parole : un PDF pour une tâche d'archive.
    const unPdf = await deposer(tache.id, { fichier: PDF });
    assert.notEqual(unPdf.code, 0, "un PDF ne se dépose pas comme archive");
    assert.match(unPdf.erreurs, /Fichier invalide/);

    const avecPages = await deposer(tache.id, { pages: "3" });
    assert.notEqual(avecPages.code, 0, "une archive ne déclare pas de pages");
    assert.match(avecPages.erreurs, /Seul un PDF déclare un nombre de pages/);

    const { data } = await porteur.client
      .from("project_exports")
      .select("id")
      .eq("job_id", tache.id);
    assert.deepEqual(data, [], "rien n'a été déposé");
  });

  it("l'archive déposée est lue du porteur, sans nombre de pages", async () => {
    const depot = await deposer(tache.id);
    assert.equal(depot.code, 0, depot.erreurs);

    const { data, error } = await porteur.client
      .from("project_exports")
      .select("id, format, pages")
      .eq("job_id", tache.id)
      .single();
    assert.equal(error, null, error?.message);
    assert.deepEqual([data.format, data.pages], ["zip", null]);
    exportZip = data.id;
  });

  it("un export identique se retrouve dans son format seulement", async () => {
    assert.equal((await chercher(porteur, "zip")).data, exportZip);
    assert.equal((await chercher(editeur, "zip")).data, exportZip);
    assert.equal((await chercher(administrateur, "zip")).data, exportZip);
    // Une archive et un Word commencent par les mêmes octets : seul le format
    // rangé en base les distingue.
    assert.equal((await chercher(porteur, "docx")).data, null, "aucun Word n'a été fabriqué");
    assert.equal((await chercher(porteur, "pdf")).data, null, "aucun PDF n'a été fabriqué");
  });

  it("l'éditeur et l'administrateur lisent l'archive ; le lecteur et le compte étranger, non", async () => {
    for (const compte of [editeur, administrateur]) {
      const { data } = await compte.client
        .from("project_exports")
        .select("id, format")
        .eq("id", exportZip);
      assert.deepEqual(data, [{ id: exportZip, format: "zip" }]);
    }
    for (const compte of [lecteur, etranger]) {
      const { data } = await compte.client.from("project_exports").select("id");
      assert.deepEqual(data, []);
      assert.equal((await chercher(compte, "zip")).data, null);
    }
  });

  it("un compte ne change pas le format d'un export, ni n'en dépose un lui-même", async () => {
    const { data: modifie } = await porteur.client
      .from("project_exports")
      .update({ format: "pdf" })
      .eq("id", exportZip)
      .select("id");
    assert.deepEqual(modifie ?? [], [], "l'export ne se modifie pas par l'API");

    const { error: depot } = await porteur.client.rpc("livrer_export", {
      p_attempt_id: crypto.randomUUID(),
      p_file: `\\x${ARCHIVE}`,
      p_pages: null,
      p_fingerprint: "0".repeat(64),
    });
    assert.ok(depot, "livrer_export est réservée au worker");
  });
});
