/**
 * Exports Word (lot M3) : ce que chaque compte peut en demander et en lire
 * par l'API.
 *
 * AUCUN FICHIER RÉEL : l'export est déposé comme le ferait le worker, avec un
 * en-tête d'archive ZIP pour tout fichier. Le rendu Word a sa propre suite
 * (worker-export.test.mjs).
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

/**
 * Fait déposer un export Word pour une tâche en attente, comme le ferait le
 * worker : réclamation, envoi, lecture du contenu, dépôt sans nombre de pages.
 */
async function deposerExportWord(tacheId) {
  assert.match(tacheId, /^[0-9a-f-]{36}$/);
  const { code, erreurs } = await sql(`
    ${annulerLesAutresTaches([tacheId])}
    do $$
    declare
      v_travail uuid;
      v_essai uuid;
    begin
      select r.job_id, r.attempt_id into v_travail, v_essai
      from public.reclamer_travail('worker-de-test', array['docx_export']) r;
      if v_travail is distinct from '${tacheId}' then
        raise exception 'Tâche réclamée inattendue : %', v_travail;
      end if;
      perform public.marquer_tentative_soumise(v_essai);
      perform public.livrer_export(
        v_essai,
        '\\x504b0304140000000800'::bytea,
        null,
        public.contexte_export(v_essai) ->> 'empreinte'
      );
    end $$;
  `);
  assert.equal(code, 0, erreurs);
}

describe("Exports Word : cloisonnement", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let exportWord;

  before(async () => {
    porteur = await creerCompte("word-porteur");
    editeur = await creerCompte("word-editeur");
    lecteur = await creerCompte("word-lecteur");
    etranger = await creerCompte("word-etranger");
    administrateur = await creerCompte("word-admin");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "La Saison sèche");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { error } = await porteur.client
      .from("projects")
      .update({ logline: "Un pitch.", synopsis: "Un synopsis." })
      .eq("id", projet.id);
    assert.ifError(error);
  });

  async function devis(compte) {
    return compte.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "docx_export",
      p_params: DEMANDE,
    });
  }

  it("le porteur et l'éditeur demandent un export Word, compté comme un export", async () => {
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
      p_action: "docx_export",
      p_params: DEMANDE,
    });
    assert.ok(error, "un visiteur ne doit obtenir aucun devis");
  });

  it("l'export Word déposé est lu du porteur, sans nombre de pages", async () => {
    const tache = await engager(porteur, projet.id, "docx_export", "word-cle", DEMANDE);
    assert.equal(tache.action, "docx_export");
    await deposerExportWord(tache.id);

    const { data, error } = await porteur.client
      .from("project_exports")
      .select("id, format, pages")
      .eq("job_id", tache.id)
      .single();
    assert.equal(error, null, error?.message);
    assert.deepEqual([data.format, data.pages], ["docx", null]);
    exportWord = data.id;
  });

  it("un export identique se retrouve dans son format seulement", async () => {
    const chercher = (compte, format) =>
      compte.client.rpc("export_disponible", {
        p_project_id: projet.id,
        p_params: DEMANDE,
        p_format: format,
      });

    assert.equal((await chercher(porteur, "docx")).data, exportWord);
    assert.equal((await chercher(editeur, "docx")).data, exportWord);
    assert.equal((await chercher(administrateur, "docx")).data, exportWord);
    assert.equal((await chercher(porteur, "pdf")).data, null, "aucun PDF n'a été fabriqué");
  });

  it("le lecteur et le compte étranger ne lisent ni ne retrouvent l'export Word", async () => {
    for (const compte of [lecteur, etranger]) {
      const { data } = await compte.client.from("project_exports").select("id");
      assert.deepEqual(data, []);
      const { data: retrouve } = await compte.client.rpc("export_disponible", {
        p_project_id: projet.id,
        p_params: DEMANDE,
        p_format: "docx",
      });
      assert.equal(retrouve, null);
    }
  });
});
