/**
 * Mentions légales : ce que la page dit du service tel qu'il est.
 *
 * Le texte parlait d'un hébergement « susceptible » d'exister et d'une mise
 * en production à venir. Ces tests refusent qu'il y revienne. Ils tiennent
 * aussi ce qu'il ne doit pas inventer : l'identité de l'éditeur reste à
 * compléter tant qu'elle n'est pas fournie. Module pur : ni base, ni serveur.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { CONTACT_POLITIQUE_CONTENU, getLegalDocument } from "../src/lib/legal-content.ts";

const mentions = getLegalDocument("mentions-legales");

const texteDe = (section) =>
  [
    section.title,
    ...section.blocks.flatMap((bloc) => {
      if (bloc.type === "paragraph") return [bloc.text];
      if (bloc.type === "list") return bloc.items;
      return bloc.fields.flatMap((champ) => [champ.label ?? "", champ.value]);
    }),
  ].join("\n");

const section = (id) => texteDe(mentions.sections.find((candidate) => candidate.id === id));
const texte = mentions.sections.map(texteDe).join("\n");

describe("Mentions légales : le service tel qu'il est", () => {
  it("sont datées", () => {
    assert.equal(mentions.updatedAt, "11 octobre 2026");
  });

  it("nomment les trois hébergeurs en service, sans conditionnel", () => {
    const hebergement = section("hebergement");
    for (const nom of ["Vercel Inc.", "Supabase Inc.", "Railway Corp."]) {
      assert.ok(hebergement.includes(nom), nom);
    }
    assert.match(hebergement, /La plateforme est hébergée et déployée/);
    assert.doesNotMatch(texte, /susceptible d'être hébergée|avant la mise en production/);
  });

  it("disent que la plateforme est en accès privé", () => {
    assert.match(section("objet"), /en accès privé : l'inscription est fermée/);
  });

  it("disent que l'assistant propose, et que l'utilisateur décide", () => {
    assert.match(
      section("objet"),
      /reste une suggestion, que l'utilisateur accepte, corrige ou écarte/,
    );
    assert.match(section("objet"), /peut être inexacte ou incomplète/);
  });

  it("n'annoncent que les mesures qui existent, et renvoient à la politique de contenu", () => {
    const contenus = section("contenus-utilisateurs");
    assert.match(contenus, /peut retirer un contenu ou suspendre un compte/);
    assert.match(contenus, /La politique de contenu précise ces règles/);
  });

  it("donnent l'adresse de signalement", () => {
    assert.ok(section("signalement").includes(CONTACT_POLITIQUE_CONTENU));
    assert.doesNotMatch(section("signalement"), /À COMPLÉTER/);
  });

  it("donnent l'adresse de contact de l'éditeur, aux deux endroits où elle se demande", () => {
    assert.ok(section("editeur").includes(CONTACT_POLITIQUE_CONTENU));
    assert.ok(section("droit-applicable").includes(CONTACT_POLITIQUE_CONTENU));
  });

  it("n'inventent pas le reste de l'identité de l'éditeur", () => {
    assert.match(section("editeur"), /\[DÉNOMINATION LÉGALE \/ NOM DE L'ENTREPRENEUR\]/);
    assert.match(section("editeur"), /Forme juridique\n\[À COMPLÉTER\]/);
    assert.match(section("droit-applicable"), /\[NOM \/ DÉNOMINATION LÉGALE\]/);
  });

  it("ne garantissent toujours aucun financement", () => {
    assert.match(section("objet"), /ne garantit pas l'obtention d'un financement/);
  });
});
