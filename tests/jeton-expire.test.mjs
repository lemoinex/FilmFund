/**
 * Jeton expiré.
 *
 * Un jeton d'accès périmé ne doit plus rien ouvrir : ni la base (PostgREST),
 * ni le serveur d'authentification, que consulte `getUser()` — sur lequel
 * reposent le middleware et chaque action serveur.
 *
 * Attendre l'expiration d'un vrai jeton prendrait une heure. Le test en
 * fabrique donc deux, copies conformes d'une vraie session à la date
 * d'expiration près : l'un encore valide, témoin qui prouve que le jeton
 * fabriqué est bien reconnu, l'autre périmé. Seule cette date les sépare ;
 * si le second est refusé et pas le premier, c'est elle qui l'a été.
 *
 * Ils sont signés avec le secret JWT de la pile locale, lu à l'exécution
 * auprès de la CLI Supabase : il n'est écrit nulle part.
 */
import { strict as assert } from "node:assert";
import { execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { before, describe, it } from "node:test";

import { createClient } from "@supabase/supabase-js";

import { creerCompte, PUBLISHABLE_KEY, URL } from "./helpers.mjs";

function secretJwtLocal() {
  if (process.env.SUPABASE_JWT_SECRET) {
    return process.env.SUPABASE_JWT_SECRET;
  }
  const sortie = execSync("npx supabase status -o env", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const ligne = sortie.split(/\r?\n/).find((l) => l.startsWith("JWT_SECRET="));
  if (!ligne) {
    throw new Error("Secret JWT local introuvable : la pile Supabase locale est-elle démarrée ?");
  }
  return ligne.slice("JWT_SECRET=".length).replace(/^"|"$/g, "");
}

function base64url(objet) {
  return Buffer.from(JSON.stringify(objet)).toString("base64url");
}

function clientAvecJeton(jeton) {
  return createClient(URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jeton}` } },
  });
}

describe("Jeton expiré", () => {
  let compte;
  let valide;
  let perime;

  before(async () => {
    compte = await creerCompte("jeton");
    const { data } = await compte.client.auth.getSession();
    // La charge d'une vraie session : le serveur d'authentification vérifie
    // aussi que la session désignée existe.
    const charge = JSON.parse(
      Buffer.from(data.session.access_token.split(".")[1], "base64url").toString(),
    );

    const secret = secretJwtLocal();
    const maintenant = Math.floor(Date.now() / 1000);
    const signer = (exp) => {
      const corps = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({
        ...charge,
        iat: maintenant - 7200,
        exp,
      })}`;
      return `${corps}.${createHmac("sha256", secret).update(corps).digest("base64url")}`;
    };

    valide = signer(maintenant + 600);
    perime = signer(maintenant - 60);
  });

  it("le témoin, identique mais encore valide, est accepté partout", async () => {
    const client = clientAvecJeton(valide);

    const { data, error } = await client.from("profiles").select("id").eq("id", compte.id);
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);

    const { data: utilisateur, error: erreurAuth } = await client.auth.getUser(valide);
    assert.equal(erreurAuth, null, erreurAuth?.message);
    assert.equal(utilisateur.user.id, compte.id);
  });

  it("la base refuse un jeton expiré, même pour lire son propre profil", async () => {
    const { data, error } = await clientAvecJeton(perime)
      .from("profiles")
      .select("id")
      .eq("id", compte.id);

    assert.equal(data, null);
    assert.equal(error?.code, "PGRST303", "PostgREST doit motiver le refus par l'expiration");
  });

  it("le serveur d'authentification refuse un jeton expiré", async () => {
    const { data, error } = await clientAvecJeton(perime).auth.getUser(perime);

    assert.equal(data.user, null);
    assert.equal(error?.status, 403);
    assert.match(error?.message ?? "", /expired/, "le refus doit être motivé par l'expiration");
  });
});
