/**
 * Réinitialisation de mot de passe.
 *
 * On vérifie que le nouveau mot de passe ouvre bien une session et que
 * l'ancien ne le fait plus. Un parcours qui affiche « c'est fait » sans
 * changer le mot de passe se remarque le jour où l'utilisateur essaie de se
 * reconnecter, donc trop tard.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { clientAnonyme, creerCompte } from "./helpers.mjs";

const ANCIEN = "motdepasse1";
const NOUVEAU = "nouveau2026x";

describe("Réinitialisation de mot de passe", () => {
  it("n'expose pas l'existence d'un compte", async () => {
    // La réponse doit être la même pour une adresse inscrite et une adresse
    // inconnue : sinon, ce formulaire public devient un outil d'énumération.
    const inscrit = await creerCompte("connu");

    const reponseInscrit = await clientAnonyme().auth.resetPasswordForEmail(inscrit.email);
    const reponseInconnu = await clientAnonyme().auth.resetPasswordForEmail(
      `inconnu${Date.now()}@exemple.test`,
    );

    assert.equal(
      reponseInscrit.error === null,
      reponseInconnu.error === null,
      "les deux appels doivent se comporter identiquement",
    );
  });

  it("remplace effectivement le mot de passe", async () => {
    const compte = await creerCompte("reinit");

    // signUp ouvre déjà une session : c'est l'équivalent de la session de
    // récupération dont dispose l'utilisateur après avoir suivi son lien.
    const { error } = await compte.client.auth.updateUser({ password: NOUVEAU });
    assert.equal(error, null, error?.message);

    const avecNouveau = await clientAnonyme().auth.signInWithPassword({
      email: compte.email,
      password: NOUVEAU,
    });
    assert.equal(avecNouveau.error, null, "le nouveau mot de passe doit fonctionner");

    const avecAncien = await clientAnonyme().auth.signInWithPassword({
      email: compte.email,
      password: ANCIEN,
    });
    assert.ok(avecAncien.error, "l'ancien mot de passe ne doit plus fonctionner");
  });

  it("refuse de changer le mot de passe sans session", async () => {
    // Sans jeton valide, personne ne doit pouvoir modifier un mot de passe.
    const { error } = await clientAnonyme().auth.updateUser({ password: NOUVEAU });
    assert.ok(error, "un appel anonyme doit être rejeté");
  });
});
