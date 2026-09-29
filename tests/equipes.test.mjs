/**
 * Équipes de projet.
 *
 * Chaque test se place du côté de qui voudrait obtenir plus que ce que son
 * rôle lui donne : un inconnu qui lit, un lecteur qui écrit, un éditeur qui
 * s'approprie le projet, un membre qui se promeut, un tiers qui accepte une
 * invitation qui ne lui est pas destinée.
 */
import { strict as assert } from "node:assert";
import { before, describe, it } from "node:test";

import { clientAnonyme, clientDeService, creerCompte, creerProjet } from "./helpers.mjs";

/** Invitation envoyée par le porteur ; renvoie son identifiant. */
async function inviter(porteur, projetId, email, role = "viewer", poste = "") {
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
async function faireEntrer(porteur, projetId, compte, role) {
  const invitationId = await inviter(porteur, projetId, compte.email, role);
  const { error } = await compte.client.rpc("accepter_invitation", {
    p_invitation_id: invitationId,
  });

  if (error) {
    throw new Error(`Acceptation impossible : ${error.message}`);
  }
}

async function lireProjet(compte, projetId) {
  const { data } = await compte.client
    .from("projects")
    .select("id, title, owner_id")
    .eq("id", projetId)
    .maybeSingle();
  return data;
}

describe("Invitations", () => {
  let porteur;
  let invite;
  let tiers;
  let projet;

  before(async () => {
    porteur = await creerCompte("porteur");
    invite = await creerCompte("invite");
    tiers = await creerCompte("tiers");
    projet = await creerProjet(porteur, "Le Fleuve");
  });

  it("une invitation n'ouvre pas l'accès au projet avant d'être acceptée", async () => {
    await inviter(porteur, projet.id, invite.email);
    assert.equal(await lireProjet(invite, projet.id), null);
  });

  it("le destinataire voit son invitation, avec le titre du projet", async () => {
    const { data, error } = await invite.client.rpc("mes_invitations");
    assert.equal(error, null, error?.message);

    const invitation = data.find((i) => i.project_id === projet.id);
    assert.ok(invitation, "l'invitation doit figurer dans la liste");
    assert.equal(invitation.project_title, "Le Fleuve");
  });

  it("un tiers ne voit pas les invitations des autres", async () => {
    const { data } = await tiers.client.rpc("mes_invitations");
    assert.equal(data.length, 0);

    const { data: lignes } = await tiers.client.from("project_invitations").select("id");
    assert.equal(lignes.length, 0);
  });

  it("un tiers ne peut pas accepter une invitation destinée à un autre", async () => {
    const { data: invitations } = await invite.client.rpc("mes_invitations");
    const { id } = invitations.find((i) => i.project_id === projet.id);

    const { error } = await tiers.client.rpc("accepter_invitation", { p_invitation_id: id });
    assert.ok(error, "l'acceptation par un tiers doit échouer");
    assert.equal(await lireProjet(tiers, projet.id), null);
  });

  it("la base refuse une adresse non normalisée", async () => {
    const autre = await creerProjet(porteur, "Casse");
    const { error } = await porteur.client.from("project_invitations").insert({
      project_id: autre.id,
      email: invite.email.toUpperCase(),
      invited_by: porteur.id,
    });

    // L'adresse doit être normalisée avant l'enregistrement ; la base refuse
    // une adresse en majuscules plutôt que de la laisser devenir introuvable.
    assert.ok(error, "une adresse non normalisée doit être refusée par la base");
  });

  it("seul le porteur invite", async () => {
    const { error: parTiers } = await tiers.client.from("project_invitations").insert({
      project_id: projet.id,
      email: `complice${Date.now()}@exemple.test`,
      invited_by: tiers.id,
    });
    assert.ok(parTiers, "un tiers ne doit pas pouvoir inviter");

    // Même un porteur ne peut pas signer une invitation au nom d'un autre.
    const { error: auNomDAutrui } = await porteur.client.from("project_invitations").insert({
      project_id: projet.id,
      email: `usurpe${Date.now()}@exemple.test`,
      invited_by: tiers.id,
    });
    assert.ok(auNomDAutrui, "invited_by doit être le porteur lui-même");
  });

  it("l'acceptation fait entrer le destinataire, et consomme l'invitation", async () => {
    const { data: invitations } = await invite.client.rpc("mes_invitations");
    const { id } = invitations.find((i) => i.project_id === projet.id);

    const { error } = await invite.client.rpc("accepter_invitation", { p_invitation_id: id });
    assert.equal(error, null, error?.message);

    assert.ok(await lireProjet(invite, projet.id), "le membre doit lire le projet");

    const { error: rejeu } = await invite.client.rpc("accepter_invitation", {
      p_invitation_id: id,
    });
    assert.ok(rejeu, "une invitation ne sert qu'une fois");
  });

  it("personne n'inscrit un membre directement, sans invitation", async () => {
    const { error: parLePorteur } = await porteur.client
      .from("project_members")
      .insert({ project_id: projet.id, user_id: tiers.id, role: "editor" });
    assert.ok(parLePorteur, "le porteur ne doit pas pouvoir inscrire un tiers");

    const { error: parSoiMeme } = await tiers.client
      .from("project_members")
      .insert({ project_id: projet.id, user_id: tiers.id, role: "editor" });
    assert.ok(parSoiMeme, "un tiers ne doit pas pouvoir s'inscrire lui-même");

    assert.equal(await lireProjet(tiers, projet.id), null);
  });

  it("le refus supprime l'invitation sans donner accès", async () => {
    const autre = await creerProjet(porteur, "Refusé");
    const id = await inviter(porteur, autre.id, tiers.email);

    const { error } = await tiers.client.rpc("refuser_invitation", { p_invitation_id: id });
    assert.equal(error, null, error?.message);

    assert.equal(await lireProjet(tiers, autre.id), null);
    const { data } = await tiers.client.rpc("mes_invitations");
    assert.equal(data.length, 0);
  });

  it("un compte à l'adresse non confirmée ne peut pas se connecter", async () => {
    // Quelqu'un s'inscrit avec l'adresse d'un autre, qu'il ne peut pas
    // confirmer. C'est ici que l'usurpation s'arrête : sans session, pas
    // d'invitation. Le contrôle de confirmation dans email_confirme_courant()
    // n'est qu'une seconde ligne, inatteignable tant que celle-ci tient.
    const email = `usurpateur${Date.now()}@exemple.test`;
    const { error: creation } = await clientDeService().auth.admin.createUser({
      email,
      password: "motdepasse1",
      email_confirm: false,
    });
    assert.equal(creation, null, creation?.message);

    const { error } = await clientAnonyme().auth.signInWithPassword({
      email,
      password: "motdepasse1",
    });
    assert.ok(error, "la connexion d'un compte non confirmé doit être refusée");
  });

  it("demander à changer d'adresse pour celle d'autrui ne suffit pas", async () => {
    // Le destinataire n'est pas encore inscrit. Un utilisateur connecté
    // demande à prendre son adresse : tant que ce changement n'est pas
    // confirmé depuis la boîte du destinataire, il ne doit rien recueillir.
    const convoitee = `pas-encore-inscrit${Date.now()}@exemple.test`;
    const autre = await creerProjet(porteur, "Convoité");
    const id = await inviter(porteur, autre.id, convoitee);

    const { error: demande } = await tiers.client.auth.updateUser({ email: convoitee });
    assert.equal(demande, null, demande?.message);

    const { data } = await tiers.client.rpc("mes_invitations");
    assert.ok(
      data.every((i) => i.id !== id),
      "l'invitation ne doit pas apparaître avant confirmation",
    );

    const { error } = await tiers.client.rpc("accepter_invitation", { p_invitation_id: id });
    assert.ok(error, "l'acceptation doit être refusée");
  });
});

describe("Droits selon le rôle", () => {
  let porteur;
  let editeur;
  let lecteur;
  let tiers;
  let projet;

  before(async () => {
    porteur = await creerCompte("porteur");
    editeur = await creerCompte("editeur");
    lecteur = await creerCompte("lecteur");
    tiers = await creerCompte("tiers");
    projet = await creerProjet(porteur, "La Saison sèche");

    await faireEntrer(porteur, projet.id, editeur, "editor");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
  });

  it("un inconnu ne lit ni le projet ni son équipe", async () => {
    assert.equal(await lireProjet(tiers, projet.id), null);

    const { data: membres } = await tiers.client
      .from("project_members")
      .select("user_id")
      .eq("project_id", projet.id);
    assert.equal(membres.length, 0);

    const { data: equipe } = await tiers.client.rpc("equipe_du_projet", {
      p_project_id: projet.id,
    });
    assert.equal(equipe.length, 0);
  });

  it("chaque membre voit l'équipe, avec les noms", async () => {
    const { data, error } = await lecteur.client.rpc("equipe_du_projet", {
      p_project_id: projet.id,
    });
    assert.equal(error, null, error?.message);

    assert.deepEqual(data.map((m) => m.role).sort(), ["editor", "owner", "viewer"]);
    assert.ok(
      data.every((m) => !("email" in m)),
      "aucune adresse ne doit être exposée",
    );
  });

  it("un lecteur ne modifie pas le projet", async () => {
    const { data } = await lecteur.client
      .from("projects")
      .update({ title: "Détourné" })
      .eq("id", projet.id)
      .select("id");
    assert.equal(data.length, 0);

    assert.equal((await lireProjet(porteur, projet.id)).title, "La Saison sèche");
  });

  it("un éditeur modifie le projet", async () => {
    const { data, error } = await editeur.client
      .from("projects")
      .update({ logline: "Deux sœurs, un puits, un été sans pluie." })
      .eq("id", projet.id)
      .select("id");
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
  });

  it("un éditeur ne s'approprie pas le projet", async () => {
    const { error } = await editeur.client
      .from("projects")
      .update({ owner_id: editeur.id })
      .eq("id", projet.id);
    assert.ok(error, "le changement de porteur doit être refusé");

    assert.equal((await lireProjet(porteur, projet.id)).owner_id, porteur.id);
  });

  it("un porteur non plus ne cède pas son projet depuis l'application", async () => {
    const autre = await creerProjet(porteur, "Cession");
    const { error } = await porteur.client
      .from("projects")
      .update({ owner_id: tiers.id })
      .eq("id", autre.id);
    assert.ok(error, "un transfert de propriété ne passe pas par l'API");
  });

  it("ni un éditeur ni un lecteur ne suppriment le projet", async () => {
    for (const membre of [editeur, lecteur]) {
      await membre.client.from("projects").delete().eq("id", projet.id);
    }
    assert.ok(await lireProjet(porteur, projet.id), "le projet doit toujours exister");
  });

  it("un membre ne se promeut pas lui-même", async () => {
    const { data } = await lecteur.client
      .from("project_members")
      .update({ role: "editor" })
      .eq("project_id", projet.id)
      .eq("user_id", lecteur.id)
      .select("role");
    assert.equal(data.length, 0);
  });

  it("un éditeur n'invite pas", async () => {
    const { error } = await editeur.client.from("project_invitations").insert({
      project_id: projet.id,
      email: `ami${Date.now()}@exemple.test`,
      invited_by: editeur.id,
    });
    assert.ok(error, "inviter est réservé au porteur");
  });

  it("un membre ne voit pas les invitations en attente", async () => {
    await inviter(porteur, projet.id, `attente${Date.now()}@exemple.test`);

    const { data } = await editeur.client
      .from("project_invitations")
      .select("email")
      .eq("project_id", projet.id);
    assert.equal(data.length, 0);
  });

  it("le porteur change un rôle, mais pas l'identité du membre", async () => {
    const { data, error } = await porteur.client
      .from("project_members")
      .update({ role: "editor", job_title: "Scripte" })
      .eq("project_id", projet.id)
      .eq("user_id", lecteur.id)
      .select("role, job_title");
    assert.equal(error, null, error?.message);
    assert.deepEqual(data, [{ role: "editor", job_title: "Scripte" }]);

    // Réécrire user_id ferait entrer un tiers qui n'a rien accepté.
    const { error: substitution } = await porteur.client
      .from("project_members")
      .update({ user_id: tiers.id })
      .eq("project_id", projet.id)
      .eq("user_id", lecteur.id);
    assert.ok(substitution, "user_id ne doit pas être modifiable");
    assert.equal(await lireProjet(tiers, projet.id), null);
  });

  it("un membre quitte le projet et perd l'accès", async () => {
    const { error } = await lecteur.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .eq("user_id", lecteur.id);
    assert.equal(error, null, error?.message);

    assert.equal(await lireProjet(lecteur, projet.id), null);
  });

  it("un membre ne retire pas un autre membre ; le porteur, si", async () => {
    const intrus = await creerCompte("intrus");
    await faireEntrer(porteur, projet.id, intrus, "viewer");

    const { data: parIntrus } = await intrus.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .eq("user_id", editeur.id)
      .select("user_id");
    assert.equal(parIntrus.length, 0, "un membre ne doit pas pouvoir en exclure un autre");
    assert.ok(await lireProjet(editeur, projet.id));

    const { data: parPorteur } = await porteur.client
      .from("project_members")
      .delete()
      .eq("project_id", projet.id)
      .eq("user_id", editeur.id)
      .select("user_id");
    assert.equal(parPorteur.length, 1);
    assert.equal(await lireProjet(editeur, projet.id), null);
  });
});
