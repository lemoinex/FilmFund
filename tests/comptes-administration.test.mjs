/**
 * Administration des comptes (lot V1) : qui lit la liste des comptes, ce que
 * l'écran en demande, et ce que l'action de changement de rôle laisse passer.
 *
 * La première partie parle à la pile Supabase locale, sous de vrais comptes ;
 * la suite lit des modules purs et le code. Le changement de rôle lui-même —
 * `definir_role()` et sa trace au journal — est éprouvé par
 * tests/administration.test.mjs et tests/journal-administration.test.mjs.
 */
import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";

import {
  adresseListe,
  annonceChangementDeRole,
  estIdentifiantDeCompte,
  LISTE_COMPTES,
  lirePage,
  lireRecherche,
  lireRole,
  nombreDePages,
  obstacleAuChangementDeRole,
  ROLES_COMPTE,
} from "../src/lib/comptes.ts";
import { clientAnonyme, creerCompte, promouvoirAdministrateur } from "./helpers.mjs";

const DOSSIER = "src/app/(app)/administration/utilisateurs";
const MIGRATION = "supabase/migrations/20261007140000_comptes_administration.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("Comptes : qui lit la liste", () => {
  let patron;
  let membre;
  let etranger;

  before(async () => {
    patron = await creerCompte("patron-comptes", "Patron des comptes");
    membre = await creerCompte("membre-comptes", "Membre des comptes");
    etranger = await creerCompte("etranger-comptes", "Étranger des comptes");
    await promouvoirAdministrateur(patron.id);
  });

  it("refuse la liste à un visiteur", async () => {
    const { data, error } = await clientAnonyme().rpc("comptes_administration");
    assert.ok(error, "un visiteur ne doit pas lire la liste des comptes");
    assert.equal(data, null);
  });

  it("refuse la liste à un membre, même pour son propre compte", async () => {
    for (const parametres of [{}, { p_compte: membre.id }, { p_recherche: etranger.email }]) {
      const { data, error } = await membre.client.rpc("comptes_administration", parametres);
      assert.equal(error?.code, "42501", JSON.stringify(parametres));
      assert.equal(data, null);
    }
  });

  it("rend à un administrateur le compte cherché par son adresse", async () => {
    const { data, error } = await patron.client.rpc("comptes_administration", {
      p_recherche: membre.email.toUpperCase(),
    });
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);
    assert.deepEqual(
      {
        id: data[0].id,
        email: data[0].email,
        display_name: data[0].display_name,
        role: data[0].role,
        total: data[0].total,
      },
      {
        id: membre.id,
        email: membre.email,
        display_name: "Membre des comptes",
        role: "member",
        total: 1,
      },
    );
    // Rien d'autre de `auth.users` ne voyage : ni mot de passe, ni jeton.
    assert.deepEqual(Object.keys(data[0]).sort(), [
      "country",
      "cree_le",
      "derniere_connexion",
      "display_name",
      "email",
      "email_confirme",
      "id",
      "profile_type",
      "role",
      "total",
    ]);
  });

  it("rend un compte par son identifiant, et rien pour un identifiant inconnu", async () => {
    const { data } = await patron.client.rpc("comptes_administration", {
      p_compte: etranger.id,
      p_limite: 1,
    });
    assert.deepEqual(
      data.map((c) => c.email),
      [etranger.email],
    );

    const { data: absent, error } = await patron.client.rpc("comptes_administration", {
      p_compte: "00000000-0000-4000-8000-000000000000",
    });
    assert.equal(error, null, error?.message);
    assert.deepEqual(absent, []);
  });

  it("borne chaque appel : cent comptes au plus", async () => {
    const { data } = await patron.client.rpc("comptes_administration", { p_limite: 100 });
    assert.ok(data.length >= 3 && data.length <= 100);

    for (const parametres of [
      { p_limite: 101 },
      { p_limite: 0 },
      { p_decalage: -1 },
      { p_recherche: "a".repeat(121) },
    ]) {
      const { error } = await patron.client.rpc("comptes_administration", parametres);
      assert.equal(error?.code, "22023", JSON.stringify(parametres));
    }
  });

  it("le rôle changé par l'adresse que la liste rend se relit dans la liste", async () => {
    const { data: avant } = await patron.client.rpc("comptes_administration", {
      p_compte: etranger.id,
      p_limite: 1,
    });
    const { error } = await patron.client.rpc("definir_role", {
      email_cible: avant[0].email,
      nouveau_role: "admin",
    });
    assert.equal(error, null, error?.message);

    const { data: apres } = await patron.client.rpc("comptes_administration", {
      p_compte: etranger.id,
      p_limite: 1,
    });
    assert.equal(apres[0].role, "admin");

    // Promu, le compte lit la liste à son tour ; le membre, toujours pas.
    const { error: promu } = await etranger.client.rpc("comptes_administration", { p_limite: 1 });
    assert.equal(promu, null, promu?.message);
    const { error: refus } = await membre.client.rpc("comptes_administration", { p_limite: 1 });
    assert.equal(refus?.code, "42501");
  });
});

describe("Comptes : ce que l'écran lit et annonce", () => {
  it("la recherche tient sur une ligne, dans les bornes de la base", () => {
    assert.equal(lireRecherche("  Awa   Ngono\n"), "Awa Ngono");
    assert.equal(lireRecherche(undefined), "");
    assert.equal(lireRecherche(""), "");
    assert.equal(lireRecherche("a".repeat(120)), "a".repeat(120));
    for (const refusee of ["a".repeat(121), "Awa\u0007", 42, ["awa"], {}]) {
      assert.equal(lireRecherche(refusee), null, String(refusee).slice(0, 20));
    }

    const migration = lire(MIGRATION);
    assert.match(
      migration,
      new RegExp(`char_length\\(v_recherche\\) > ${LISTE_COMPTES.rechercheMax}\\b`),
    );
    const limite = Number(/p_limite not between 1 and (\d+)/.exec(migration)?.[1]);
    assert.ok(LISTE_COMPTES.parPage <= limite, "l'écran ne demande pas plus que la base n'admet");
    const decalage = Number(/p_decalage not between 0 and (\d+)/.exec(migration)?.[1]);
    assert.ok((LISTE_COMPTES.pageMax - 1) * LISTE_COMPTES.parPage <= decalage);
  });

  it("une page illisible est la première, et la liste a toujours une page", () => {
    assert.equal(lirePage("3"), 3);
    for (const refusee of [undefined, "", "0", "-1", "1.5", "abc", ["2"], "99999"]) {
      assert.equal(lirePage(refusee), 1, String(refusee));
    }
    assert.equal(lirePage("9999"), LISTE_COMPTES.pageMax);
    assert.equal(nombreDePages(0), 1);
    assert.equal(nombreDePages(50), 1);
    assert.equal(nombreDePages(51), 2);
  });

  it("l'adresse d'une page garde la recherche, sans rien d'inutile", () => {
    assert.equal(adresseListe("", 1), "/administration/utilisateurs");
    assert.equal(adresseListe("", 2), "/administration/utilisateurs?page=2");
    assert.equal(adresseListe("awa & co", 3), "/administration/utilisateurs?q=awa+%26+co&page=3");
  });

  it("les rôles de l'écran sont ceux de la base, et rien d'autre ne passe", () => {
    const enumeration = /create type public\.user_role as enum \(([^)]+)\)/.exec(
      lire("supabase/migrations/20260929092712_profiles_et_roles.sql"),
    )[1];
    assert.deepEqual(
      Object.keys(ROLES_COMPTE),
      enumeration.split(",").map((valeur) => valeur.trim().replace(/'/g, "")),
    );
    assert.equal(lireRole("admin"), "admin");
    assert.equal(lireRole("member"), "member");
    for (const refuse of ["owner", "ADMIN", "", null, undefined, "toString", ["admin"]]) {
      assert.equal(lireRole(refuse), null, String(refuse));
    }
    assert.ok(estIdentifiantDeCompte("00000000-0000-4000-8000-000000000000"));
    for (const refuse of ["", "abc", "00000000-0000-4000-8000-00000000000g", null, 42]) {
      assert.equal(estIdentifiantDeCompte(refuse), false, String(refuse));
    }
  });

  it("l'écran dit pourquoi un rôle ne se change pas, avant que la base le refuse", () => {
    assert.equal(obstacleAuChangementDeRole({ soiMeme: false, modePrive: false }), null);
    assert.match(obstacleAuChangementDeRole({ soiMeme: false, modePrive: true }), /mode privé/i);
    assert.match(obstacleAuChangementDeRole({ soiMeme: true, modePrive: false }), /propre rôle/);
    // Le mode privé gèle tout : c'est lui qui est dit d'abord.
    assert.match(obstacleAuChangementDeRole({ soiMeme: true, modePrive: true }), /mode privé/i);

    // Promouvoir en mode privé ne suffit pas à ouvrir l'application.
    assert.match(annonceChangementDeRole("admin"), /adresses autorisées/);
    assert.match(annonceChangementDeRole("member"), /perdra l'accès à l'administration/);
  });
});

describe("Comptes : ce que les pages et l'action laissent passer", () => {
  it("l'action revérifie la session et le rôle, puis relit l'adresse en base", () => {
    const action = sansCommentaires(lire(`${DOSSIER}/actions.ts`));
    const etapes = [
      "exigerAcces(supabase)",
      'rpc("is_admin")',
      "estIdentifiantDeCompte(compteId)",
      'rpc("mode_prive")',
      "obstacleAuChangementDeRole(",
      'rpc("comptes_administration"',
      'rpc("definir_role"',
    ].map((etape) => action.indexOf(etape));
    assert.ok(
      etapes.every((position) => position >= 0),
      etapes.join(","),
    );
    assert.deepEqual(
      etapes,
      [...etapes].sort((a, b) => a - b),
    );

    // L'adresse du compte ne vient jamais du navigateur.
    assert.deepEqual(
      [...action.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]),
      ["compte", "role"],
    );
    assert.match(action, /email_cible: compte\.email,/);
    // Sans réponse de la base sur le mode privé, rien n'est tenté.
    assert.match(action, /modePrive: modePrive !== false,/);
    // Aucune écriture directe du rôle : le seul chemin est la fonction livrée.
    assert.doesNotMatch(action, /from\("profiles"\)/);
  });

  it("le formulaire n'envoie que l'identifiant et le rôle, au second clic", () => {
    const formulaire = sansCommentaires(lire(`${DOSSIER}/formulaire-role.tsx`));
    assert.deepEqual(
      [...formulaire.matchAll(/donnees\.set\("([^"]+)"/g)].map((m) => m[1]),
      ["compte", "role"],
    );
    assert.match(formulaire, /annonceChangementDeRole\(nouveau\)/);
    // Le premier bouton ouvre la confirmation ; il n'envoie rien.
    assert.match(formulaire, /onClick=\{\(\) => setOuvert\(true\)\}/);
    assert.equal(formulaire.match(/startTransition\(/g).length, 1);
    assert.doesNotMatch(formulaire, /<form\b/);
  });

  it("les deux pages lisent les comptes par la fonction bornée, jamais autrement", () => {
    const liste = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
    const fiche = sansCommentaires(lire(`${DOSSIER}/[compteId]/page.tsx`));
    assert.match(liste, /p_limite: LISTE_COMPTES\.parPage,/);
    assert.match(liste, /p_decalage: \(page - 1\) \* LISTE_COMPTES\.parPage,/);
    // Chacune garde son contrôle, en seconde ligne derrière le middleware :
    // la fiche appelle `notFound()` ailleurs, ce qui ne prouve pas celui-ci.
    for (const page of [liste, fiche]) {
      assert.match(page, /rpc\("is_admin"\);\s*if \(!estAdministrateur\) \{\s*notFound\(\);/);
    }
    // Une recherche refusée n'est pas lue comme une recherche vide.
    assert.match(liste, /recherche === null\s*\? \{ data: \[\], error: null \}/);

    // La fiche d'un identifiant mal formé ou inconnu est une page absente,
    // et la base n'est pas interrogée avant le contrôle du rôle.
    const ordre = ['rpc("is_admin")', "estIdentifiantDeCompte(compteId)", "Promise.all("].map((e) =>
      fiche.indexOf(e),
    );
    assert.ok(ordre.every((position) => position >= 0));
    assert.deepEqual(
      ordre,
      [...ordre].sort((a, b) => a - b),
    );
    assert.match(fiche, /if \(!compte\) \{\s*notFound\(\);/);
    // Le formulaire ne s'affiche que si rien ne s'y oppose.
    assert.match(fiche, /\{obstacle \? \(/);

    // Aucune des deux ne se sert d'un accès privilégié.
    for (const source of [liste, fiche, lire(`${DOSSIER}/actions.ts`)]) {
      assert.doesNotMatch(source, /SECRET|service_role|auth\.admin/);
    }
  });

  it("aucun écran d'attente ne couvre la fiche d'un compte", () => {
    // Il ferait répondre 200 à l'adresse d'un compte qui n'existe pas.
    assert.equal(existsSync(new URL(`../${DOSSIER}/loading.tsx`, import.meta.url)), false);
    assert.equal(
      existsSync(new URL(`../${DOSSIER}/[compteId]/loading.tsx`, import.meta.url)),
      false,
    );
  });

  it("la rubrique n'est proposée qu'aux administrateurs", () => {
    const navigation = lire("src/app/(app)/navigation.tsx");
    const administration = navigation.slice(
      navigation.indexOf("const RUBRIQUES_ADMINISTRATION"),
      navigation.indexOf("function estActive"),
    );
    assert.match(administration, /href: "\/administration\/utilisateurs"/);
    assert.equal(navigation.match(/\/administration\/utilisateurs/g).length, 1);
  });

  it("la fonction retire ses droits nommément, puis ne rend que le nécessaire", () => {
    const migration = sansCommentaires(lire(MIGRATION)).replace(/^\s*--.*$/gm, "");
    assert.match(
      migration,
      /revoke all on function public\.comptes_administration\(text, integer, integer, uuid\)\s+from public, anon, authenticated;/,
    );
    assert.match(
      migration,
      /grant execute on function public\.comptes_administration\(text, integer, integer, uuid\)\s+to authenticated;/,
    );
    assert.match(
      migration,
      /if \(select auth\.uid\(\)\) is null or not public\.is_admin\(\) then\s+raise exception/,
    );
    // Rien d'autre de `auth.users` que ces colonnes.
    assert.deepEqual(
      [...new Set([...migration.matchAll(/\bu\.([a-z_]+)/g)].map((m) => m[1]))].sort(),
      ["created_at", "email", "email_confirmed_at", "id", "last_sign_in_at"],
    );
    assert.match(lire("supabase/tests/privileges_fonctions.test.sql"), /'comptes_administration',/);
  });
});
