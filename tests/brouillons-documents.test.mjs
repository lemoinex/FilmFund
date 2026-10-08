/**
 * Brouillons des documents (lot ED3) : la règle, ce que la base rend à chacun
 * par l'API, et ce que lisent l'éditeur et ses actions.
 *
 * La règle est un module pur. Les actions serveur et l'éditeur sont lus comme
 * du texte ; la frappe, la minuterie et le clic se vérifient dans un
 * navigateur. AUCUN APPEL À UN FOURNISSEUR.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  AIDE_BROUILLON,
  brouillonAProposer,
  brouillonASauver,
  DELAI_BROUILLON_MS,
  documentEnregistreDepuis,
} from "../src/lib/brouillons.ts";
import {
  clientAnonyme,
  creerCompte,
  creerProjet,
  executerSqlLocal as sql,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const DOSSIER = "src/app/(app)/projets/[id]/documents";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

describe("Brouillons : la règle", () => {
  const document = { title: "Note", content: "Texte enregistré." };

  it("ne propose qu'un brouillon qui diffère du document", () => {
    assert.equal(brouillonAProposer(document, null), null);
    assert.equal(brouillonAProposer(document, { ...document, base_version: 1 }), null);
    const autreTexte = { title: "Note", content: "Texte en cours.", base_version: 1 };
    assert.equal(brouillonAProposer(document, autreTexte), autreTexte);
    const autreTitre = { title: "Note, bis", content: document.content, base_version: 1 };
    assert.equal(brouillonAProposer(document, autreTitre), autreTitre);
  });

  it("dit si le document a été enregistré depuis le brouillon", () => {
    assert.equal(documentEnregistreDepuis({ base_version: 2 }, 2), false);
    assert.equal(documentEnregistreDepuis({ base_version: 2 }, 3), true);
    assert.equal(documentEnregistreDepuis({ base_version: 0 }, 0), false);
    assert.equal(documentEnregistreDepuis({ base_version: 0 }, 1), true);
  });

  it("ne sauvegarde ni un texte égal au document, ni un texte déjà parti", () => {
    const saisi = { title: "Note", content: "Texte en cours." };
    assert.equal(brouillonASauver(document, document, null), false);
    assert.equal(brouillonASauver(saisi, document, null), true);
    assert.equal(brouillonASauver(saisi, document, { ...saisi }), false);
    assert.equal(brouillonASauver(saisi, document, { ...saisi, content: "Plus ancien." }), true);
    // Revenu au texte du document : rien à sauvegarder, même après un brouillon.
    assert.equal(brouillonASauver(document, document, { ...saisi }), false);
    assert.equal(brouillonASauver({ ...document, title: "Autre" }, document, null), true);
  });

  it("attend quelques secondes, et le dit sans promettre une version", () => {
    assert.ok(DELAI_BROUILLON_MS >= 2000 && DELAI_BROUILLON_MS <= 15000);
    assert.match(AIDE_BROUILLON, /pour vous seul/);
    assert.match(AIDE_BROUILLON, /Seul « Enregistrer » modifie le document et crée une version\./);
  });
});

describe("Brouillons : ce que la base rend à chacun", () => {
  let porteur;
  let editeur;
  let lecteur;
  let etranger;
  let administrateur;
  let projet;
  let autreProjet;
  let documentId;

  const brouillons = (compte) =>
    compte.client
      .from("project_document_drafts")
      .select("user_id, title, content, base_version")
      .eq("document_id", documentId);
  const creer = (compte, contenu, projetId = projet.id) =>
    compte.client
      .from("project_document_drafts")
      .insert({ document_id: documentId, project_id: projetId, title: "Note", content: contenu })
      .select("user_id, base_version");
  const versions = async () => {
    const { data, error } = await porteur.client
      .from("project_document_versions")
      .select("version_number")
      .eq("document_id", documentId);
    assert.equal(error, null);
    return data.length;
  };

  before(async () => {
    porteur = await creerCompte("brouillon-porteur", "Porteuse");
    editeur = await creerCompte("brouillon-editeur", "Éditeur");
    lecteur = await creerCompte("brouillon-lecteur", "Lecteur");
    etranger = await creerCompte("brouillon-etranger", "Étranger");
    administrateur = await creerCompte("brouillon-admin", "Administratrice");
    await promouvoirAdministrateur(administrateur.id);

    projet = await creerProjet(porteur, "Projet aux brouillons");
    autreProjet = await creerProjet(porteur, "Autre projet aux brouillons");
    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");

    const { data, error } = await porteur.client
      .from("project_documents")
      .insert({
        project_id: projet.id,
        type: "note_intention",
        title: "Note",
        content: "Version A.",
        created_by: porteur.id,
      })
      .select("id")
      .single();
    assert.equal(error, null);
    documentId = data.id;
    const maj = await porteur.client
      .from("project_documents")
      .update({ content: "Version B." })
      .eq("id", documentId);
    assert.equal(maj.error, null);
  });

  it("le porteur crée son brouillon : la base nomme le titulaire et la version de départ", async () => {
    const { data, error } = await creer(porteur, "Brouillon du porteur.");
    assert.equal(error, null);
    assert.deepEqual(data, [{ user_id: porteur.id, base_version: 2 }]);
  });

  it("créer puis modifier un brouillon ne crée aucune version, et ne touche pas au document", async () => {
    const avant = await versions();
    const { data, error } = await porteur.client
      .from("project_document_drafts")
      .update({ content: "Brouillon du porteur, repris." })
      .eq("document_id", documentId)
      .eq("user_id", porteur.id)
      .select("content");
    assert.equal(error, null);
    assert.equal(data.length, 1);
    assert.equal(await versions(), avant);
    assert.equal(avant, 2);

    const document = await porteur.client
      .from("project_documents")
      .select("content")
      .eq("id", documentId)
      .single();
    assert.equal(document.data.content, "Version B.");
  });

  it("un second brouillon du même compte pour le même document est refusé", async () => {
    const { error } = await creer(porteur, "Un second.");
    assert.equal(error?.code, "23505");
  });

  it("un brouillon ne se rattache pas au projet d'un autre document", async () => {
    const { error } = await creer(editeur, "Égaré.", autreProjet.id);
    assert.ok(error, "le rattachement à un autre projet aurait dû être refusé");
  });

  it("l'éditeur a le sien, et ne lit, ne réécrit ni ne supprime celui du porteur", async () => {
    const creation = await creer(editeur, "Brouillon de l'éditeur.");
    assert.equal(creation.error, null);

    const lus = await brouillons(editeur);
    assert.deepEqual(
      lus.data.map((b) => b.user_id),
      [editeur.id],
    );

    const reecrit = await editeur.client
      .from("project_document_drafts")
      .update({ content: "Réécrit." })
      .eq("document_id", documentId)
      .eq("user_id", porteur.id)
      .select("user_id");
    assert.deepEqual(reecrit.data, []);
    const supprime = await editeur.client
      .from("project_document_drafts")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", porteur.id)
      .select("user_id");
    assert.deepEqual(supprime.data, []);

    const duPorteur = await brouillons(porteur);
    assert.deepEqual(
      duPorteur.data.map((b) => b.content),
      ["Brouillon du porteur, repris."],
    );
  });

  it("un compte n'écrit pas un brouillon au nom d'un autre, ni sa version de départ", async () => {
    const auNom = await editeur.client
      .from("project_document_drafts")
      .insert({ document_id: documentId, project_id: projet.id, user_id: porteur.id })
      .select("user_id");
    assert.equal(auNom.error?.code, "42501");

    const base = await porteur.client
      .from("project_document_drafts")
      .update({ base_version: 99 })
      .eq("document_id", documentId)
      .select("base_version");
    assert.equal(base.error?.code, "42501");
  });

  it("un lecteur n'a pas de brouillon et n'en lit aucun", async () => {
    const { error } = await creer(lecteur, "Brouillon d'un lecteur.");
    assert.equal(error?.code, "42501");
    assert.deepEqual((await brouillons(lecteur)).data, []);
  });

  it("un compte étranger au projet n'en crée ni n'en lit", async () => {
    const { error } = await creer(etranger, "Brouillon d'un étranger.");
    assert.equal(error?.code, "42501");
    assert.deepEqual((await brouillons(etranger)).data, []);
  });

  it("un visiteur sans session n'a aucun droit sur les brouillons", async () => {
    const { data, error } = await clientAnonyme()
      .from("project_document_drafts")
      .select("content")
      .eq("document_id", documentId);
    assert.ok(error || data.length === 0);
    assert.equal(error?.code, "42501");
  });

  it("un administrateur lit tous les brouillons, sans réécrire celui d'un autre", async () => {
    const lus = await brouillons(administrateur);
    assert.equal(lus.error, null);
    assert.deepEqual(lus.data.map((b) => b.user_id).sort(), [porteur.id, editeur.id].sort());

    const reecrit = await administrateur.client
      .from("project_document_drafts")
      .update({ content: "Réécrit par l'administration." })
      .eq("document_id", documentId)
      .eq("user_id", porteur.id)
      .select("user_id");
    assert.deepEqual(reecrit.data, []);
  });

  it("le document enregistré par un autre : le brouillon garde sa version de départ", async () => {
    const maj = await editeur.client
      .from("project_documents")
      .update({ content: "Version C, par l'éditeur." })
      .eq("id", documentId);
    assert.equal(maj.error, null);

    const [duPorteur] = (await brouillons(porteur)).data;
    assert.equal(duPorteur.base_version, 2);
    assert.equal(documentEnregistreDepuis(duPorteur, await versions()), true);
    assert.equal(duPorteur.content, "Brouillon du porteur, repris.");
  });

  it("un éditeur sorti de l'équipe ne lit plus son brouillon, et n'en écrit plus", async () => {
    const sortie = await porteur.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .eq("user_id", editeur.id)
      .select("user_id");
    assert.equal(sortie.error, null);
    assert.equal(sortie.data.length, 1);

    assert.deepEqual((await brouillons(editeur)).data, []);
    const reprise = await editeur.client
      .from("project_document_drafts")
      .update({ content: "Après la sortie." })
      .eq("document_id", documentId)
      .select("user_id");
    assert.deepEqual(reprise.data, []);
  });

  it("le titulaire abandonne son brouillon ; un administrateur supprime celui d'un autre, et c'est journalisé", async () => {
    const abandon = await porteur.client
      .from("project_document_drafts")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", porteur.id)
      .select("user_id");
    assert.deepEqual(abandon.data, [{ user_id: porteur.id }]);

    const suppression = await administrateur.client
      .from("project_document_drafts")
      .delete()
      .eq("document_id", documentId)
      .eq("user_id", editeur.id)
      .select("user_id");
    assert.deepEqual(suppression.data, [{ user_id: editeur.id }]);

    const { code, sortie } = await sql(`
      select count(*) from public.admin_audit_log
      where action = 'intervention_contenu'
        and details ->> 'table' = 'project_document_drafts'
        and details ->> 'ligne' = '${documentId}';
    `);
    assert.equal(code, 0);
    assert.match(sortie, /\b1\b/);
  });

  it("un brouillon disparaît avec son document", async () => {
    assert.equal((await creer(porteur, "Avant la suppression.")).error, null);
    const suppression = await porteur.client
      .from("project_documents")
      .delete()
      .eq("id", documentId);
    assert.equal(suppression.error, null);
    const { data } = await administrateur.client
      .from("project_document_drafts")
      .select("user_id")
      .eq("document_id", documentId);
    assert.deepEqual(data, []);
  });
});

describe("Brouillons : les actions et l'éditeur", () => {
  const actions = lire(`${DOSSIER}/actions.ts`);
  const editeur = lire(`${DOSSIER}/formulaires.tsx`);
  const page = lire(`${DOSSIER}/[documentId]/page.tsx`);
  /** Le corps d'une action exportée, jusqu'à la suivante. */
  const corps = (nom) => {
    const debut = actions.indexOf(`export async function ${nom}(`);
    assert.ok(debut >= 0, nom);
    const suite = actions.indexOf("\nexport ", debut + 1);
    return actions.slice(debut, suite === -1 ? undefined : suite);
  };

  it("la sauvegarde n'écrit que dans les brouillons : ni document, ni version", () => {
    const sauvegarde = corps("enregistrerBrouillon");
    assert.match(sauvegarde, /\.from\("project_document_drafts"\)/);
    assert.doesNotMatch(sauvegarde, /\.from\("project_documents"\)/);
    assert.doesNotMatch(sauvegarde, /\.from\("project_document_versions"\)/);
    assert.doesNotMatch(sauvegarde, /revalidatePath/);
  });

  it("la sauvegarde vérifie la session et borne ce qu'elle reçoit", () => {
    const sauvegarde = corps("enregistrerBrouillon");
    assert.match(sauvegarde, /await exigerAcces\(supabase\)/);
    assert.match(sauvegarde, /titre\.length > TITRE_DOCUMENT_MAX/);
    assert.match(sauvegarde, /contenu\.length > CONTENU_DOCUMENT_MAX/);
    assert.match(sauvegarde, /typeof contenu !== "string"/);
    assert.ok(
      sauvegarde.indexOf("exigerAcces") < sauvegarde.indexOf('.from("project_document_drafts")'),
    );
  });

  it("sauvegarde, abandon et enregistrement ne visent que le brouillon de l'appelant", () => {
    for (const nom of ["enregistrerBrouillon", "abandonnerBrouillon", "enregistrerDocument"]) {
      const action = corps(nom);
      assert.match(action, /\.from\("project_document_drafts"\)/, nom);
      assert.match(action, /\.eq\("user_id", garde\.user\.id\)/, nom);
    }
  });

  it("enregistrer le document supprime le brouillon, après l'écriture du document", () => {
    const enregistrement = corps("enregistrerDocument");
    const ecriture = enregistrement.indexOf('.from("project_documents")');
    const suppression = enregistrement.indexOf('.from("project_document_drafts")');
    assert.ok(ecriture >= 0 && suppression > ecriture);
    assert.match(enregistrement.slice(suppression), /\.delete\(\)/);
  });

  it("la page ne lit que le brouillon du compte, et pour qui peut éditer", () => {
    assert.match(page, /if \(peutEditer\) \{[\s\S]*?\.from\("project_document_drafts"\)/);
    assert.match(page, /\.eq\("user_id", user\?\.id \?\? ""\)/);
    assert.match(page, /brouillon = brouillonAProposer\(document, enCours\)/);
  });

  it("un brouillon trouvé à l'ouverture est proposé, jamais appliqué d'office", () => {
    // Le texte de l'éditeur naît toujours du document enregistré.
    assert.match(editeur, /const \[contenu, setContenu\] = useState\(document\.content\);/);
    assert.match(editeur, /const \[titre, setTitre\] = useState\(document\.title\);/);
    assert.match(editeur, /Reprendre le brouillon/);
    assert.match(editeur, /Abandonner le brouillon/);
    assert.match(editeur, /sans rien enregistrer/);
    assert.match(editeur, /documentEnregistreDepuis\(propose, derniereVersion\)/);
  });

  it("la sauvegarde automatique attend la décision sur le brouillon proposé, et l'enregistrement en cours", () => {
    assert.match(
      editeur,
      /const aSauver =\s+!propose &&\s+!enCours &&\s+brouillonASauver\(\{ title: titre, content: contenu \}, enregistre, sauvegarde\);/,
    );
    assert.match(editeur, /if \(!aSauver\) return;/);
    assert.match(editeur, /\}, DELAI_BROUILLON_MS\);/);
    assert.match(editeur, /return \(\) => clearTimeout\(minuterie\);/);
  });

  it("l'éditeur dit l'état du brouillon, son échec compris, et ce qu'est un brouillon", () => {
    assert.match(editeur, /brouillon sauvegardé à/);
    assert.match(editeur, /la sauvegarde du brouillon a échoué/);
    assert.match(editeur, /\{AIDE_BROUILLON\}/);
  });

  it("l'avertissement de fermeture se tait quand le texte est à l'abri dans le brouillon", () => {
    assert.match(editeur, /if \(!modifie \|\| aLAbri\) return;/);
    assert.match(editeur, /type === enregistre\.type &&\s+statut === enregistre\.status/);
  });
});
