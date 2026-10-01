/**
 * Concurrence sur la dernière place d'un plan.
 *
 * Par l'API, deux créations arrivent trop décalées pour se croiser : un test
 * qui y lance des requêtes simultanées passe aussi sans verrou, et ne prouve
 * donc rien. Ce test ouvre deux vraies sessions PostgreSQL, dans le conteneur
 * de la base locale, et force le croisement :
 *
 *   - la première crée le seul projet permis, attend, puis valide ;
 *   - la seconde tente la même création pendant cette attente.
 *
 * Avec le verrou posé par la limite, la seconde attend la première, compte
 * un projet, et est refusée. Sans lui, elle passerait aussitôt : le studio
 * aurait deux projets au plan Gratuit.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { creerCompte, executerSqlLocal as session } from "./helpers.mjs";

function creationEnSession(compteId, titre, attente) {
  return `
    begin;
    set local role authenticated;
    select set_config('request.jwt.claims', '{"sub": "${compteId}", "role": "authenticated"}', true);
    insert into public.projects (owner_id, title) values ('${compteId}', '${titre}');
    select pg_sleep(${attente});
    commit;
  `;
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Concurrence sur la dernière place", () => {
  it("une création qui croise une autre attend, compte, et se voit refuser la place prise", async () => {
    const compte = await creerCompte("course", "Course", { plan: "gratuit" });

    const premiere = session(creationEnSession(compte.id, "Première session", 2));
    await pause(500);
    const seconde = session(creationEnSession(compte.id, "Seconde session", 0));

    const [a, b] = await Promise.all([premiere, seconde]);

    assert.equal(a.code, 0, `la première session doit aboutir : ${a.erreurs}`);
    assert.notEqual(b.code, 0, "la seconde session doit être refusée");
    assert.match(b.erreurs, /ne permet pas d'autre projet/);

    const { data } = await compte.client.from("projects").select("title");
    assert.deepEqual(data, [{ title: "Première session" }]);
  });
});
