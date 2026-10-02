/**
 * Profil professionnel (lot Q1), éprouvé par l'API avec de vrais comptes.
 *
 * Prénom, nom, pays, ville, profession et type ne regardent que leur
 * titulaire et les administrateurs. Ces tests tentent de les lire et de les
 * écrire depuis un autre compte, depuis l'équipe d'un projet, et sans compte.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  clientAnonyme,
  clientDeService,
  creerCompte,
  creerProjet,
  faireEntrer,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const CHAMPS = "first_name, last_name, country, city, profession, profile_type";

async function definirModePrive(actif) {
  const { error } = await clientDeService()
    .from("app_settings")
    .update({ private_admin_only: actif })
    .eq("id", true);
  assert.equal(error, null, error?.message);
}

/** Profil lu par l'exploitant : ce qui est réellement en base. */
async function enBase(compte) {
  const { data, error } = await clientDeService()
    .from("profiles")
    .select(`${CHAMPS}, display_name, role`)
    .eq("id", compte.id)
    .single();
  assert.equal(error, null, error?.message);
  return data;
}

describe("Profil professionnel", () => {
  let alice;
  let bob;
  let administratrice;

  before(async () => {
    alice = await creerCompte("profil-alice", "Alice Diop");
    bob = await creerCompte("profil-bob", "Bob Traoré");
    administratrice = await creerCompte("profil-admin", "Administratrice");
    await promouvoirAdministrateur(administratrice.id);
  });

  after(async () => {
    await definirModePrive(false);
  });

  it("naît vide avec le compte", async () => {
    const { data } = await alice.client.from("profiles").select(CHAMPS).eq("id", alice.id).single();

    assert.deepEqual(data, {
      first_name: "",
      last_name: "",
      country: null,
      city: "",
      profession: "",
      profile_type: null,
    });
  });

  it("se complète par son titulaire", async () => {
    const saisie = {
      first_name: "Alice",
      last_name: "Diop",
      country: "SN",
      city: "Dakar",
      profession: "Scénariste",
      profile_type: "AUTHOR",
    };
    const { data, error } = await alice.client
      .from("profiles")
      .update(saisie)
      .eq("id", alice.id)
      .select(CHAMPS)
      .single();

    assert.equal(error, null, error?.message);
    assert.deepEqual(data, saisie);
  });

  it("ne se lit par aucun autre compte, ni sans compte", async () => {
    const { data: vuParBob } = await bob.client.from("profiles").select(CHAMPS).eq("id", alice.id);
    assert.deepEqual(vuParBob, []);

    const { data: toutPourBob } = await bob.client.from("profiles").select("id, city");
    assert.deepEqual(
      toutPourBob.map((profil) => profil.id),
      [bob.id],
      "Bob ne doit recevoir que son propre profil",
    );

    const { data: anonyme } = await clientAnonyme().from("profiles").select(CHAMPS);
    assert.deepEqual(anonyme ?? [], []);
  });

  it("ne se modifie par aucun autre compte", async () => {
    const { data } = await bob.client
      .from("profiles")
      .update({ city: "PIRATE", profession: "PIRATE", profile_type: "PRODUCER" })
      .eq("id", alice.id)
      .select("id");
    assert.deepEqual(data, []);

    const profil = await enBase(alice);
    assert.equal(profil.city, "Dakar");
    assert.equal(profil.profession, "Scénariste");
    assert.equal(profil.profile_type, "AUTHOR");
  });

  it("n'arrive pas aux coéquipiers, qui ne reçoivent que le nom affiché", async () => {
    const projet = await creerProjet(alice, "Les Eaux de Kribi");
    await faireEntrer(alice, projet.id, bob, "editor");

    const { data: equipe, error } = await bob.client.rpc("equipe_du_projet", {
      p_project_id: projet.id,
    });
    assert.equal(error, null, error?.message);

    const porteuse = equipe.find((membre) => membre.user_id === alice.id);
    assert.equal(porteuse?.display_name, "Alice Diop");
    assert.deepEqual(Object.keys(porteuse).sort(), [
      "depuis",
      "display_name",
      "job_title",
      "role",
      "user_id",
    ]);
    assert.ok(!/Dakar|Scénariste|AUTHOR/.test(JSON.stringify(equipe)));

    // Même coéquipier, le profil lui-même reste fermé.
    const { data } = await bob.client.from("profiles").select(CHAMPS).eq("id", alice.id);
    assert.deepEqual(data, []);
  });

  it("refuse par la base ce que l'écran refuse", async () => {
    const refus = [
      [{ first_name: "a".repeat(81) }, "23514"],
      [{ last_name: "a".repeat(81) }, "23514"],
      [{ city: "a".repeat(121) }, "23514"],
      [{ profession: "a".repeat(121) }, "23514"],
      [{ city: "Da\nkar" }, "23514"],
      [{ country: "sn" }, "23514"],
      [{ country: "SEN" }, "23514"],
      [{ country: "" }, "23514"],
      [{ profile_type: "ADMIN" }, "22P02"],
    ];

    for (const [saisie, code] of refus) {
      const { error } = await alice.client.from("profiles").update(saisie).eq("id", alice.id);
      assert.equal(error?.code, code, JSON.stringify(saisie));
    }

    const profil = await enBase(alice);
    assert.equal(profil.first_name, "Alice");
    assert.equal(profil.country, "SN");
    assert.equal(profil.profile_type, "AUTHOR");
  });

  it("ne laisse pas glisser un rôle dans la mise à jour du profil", async () => {
    const { error } = await alice.client
      .from("profiles")
      .update({ city: "Thiès", role: "admin" })
      .eq("id", alice.id);
    assert.equal(error?.code, "42501");

    const profil = await enBase(alice);
    assert.equal(profil.role, "member");
    assert.equal(profil.city, "Dakar", "la mise à jour entière doit être refusée");
  });

  it("se corrige par un administrateur, et le journal n'en retient que les champs", async () => {
    const { data, error } = await administratrice.client
      .from("profiles")
      .update({ city: "Saint-Louis", profession: "Autrice confidentielle" })
      .eq("id", alice.id)
      .select("id");
    assert.equal(error, null, error?.message);
    assert.equal(data.length, 1);

    const { data: journal, error: lecture } = await administratrice.client
      .from("admin_audit_log")
      .select("*")
      .eq("action", "modification_profil")
      .eq("details->>compte", alice.id);
    assert.equal(lecture, null, lecture?.message);

    assert.equal(journal.length, 1);
    assert.equal(journal[0].actor_id, administratrice.id);
    assert.deepEqual(journal[0].details.champs, ["city", "profession"]);
    assert.ok(!/Saint-Louis|confidentielle/.test(JSON.stringify(journal)));
  });

  it("ne laisse aucune trace au journal quand le titulaire le modifie", async () => {
    const { error } = await bob.client
      .from("profiles")
      .update({ first_name: "Bob", country: "ML", profile_type: "DIRECTOR" })
      .eq("id", bob.id);
    assert.equal(error, null, error?.message);

    const { data: journal } = await administratrice.client
      .from("admin_audit_log")
      .select("id")
      .eq("details->>compte", bob.id);
    assert.deepEqual(journal, []);
  });

  it("suit le mode privé : fermé au titulaire, ouvert aux administrateurs", async () => {
    await definirModePrive(true);
    try {
      const { data: lu } = await bob.client.from("profiles").select(CHAMPS).eq("id", bob.id);
      assert.deepEqual(lu, [], "en mode privé, un membre ne lit plus son profil");

      const { data: ecrit } = await bob.client
        .from("profiles")
        .update({ city: "Bamako" })
        .eq("id", bob.id)
        .select("id");
      assert.deepEqual(ecrit ?? [], []);
      assert.equal((await enBase(bob)).city, "");

      const { data: vuParAdmin } = await administratrice.client
        .from("profiles")
        .select("first_name, country")
        .eq("id", bob.id);
      assert.deepEqual(vuParAdmin, [{ first_name: "Bob", country: "ML" }]);
    } finally {
      await definirModePrive(false);
    }
  });
});
