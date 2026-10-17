/**
 * Mentions légales : ce que la page dit du service tel qu'il est.
 *
 * Le texte vient du document remis par l'utilisateur le 11 octobre 2026. Ces
 * tests tiennent ce qu'il a fourni — éditeur, siège, directeur de la
 * publication, administrateurs — et refusent qu'on invente le reste : forme
 * juridique, adresse précise, immatriculation. Module pur : ni base, ni serveur.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  ADMINISTRATEURS,
  CONTACT_POLITIQUE_CONTENU,
  CONTACT_ROMARIC,
  EDITEUR,
  getLegalDocument,
  SIEGE_EDITEUR,
  TELEPHONE_EDITEUR,
} from "../src/lib/legal-content.ts";

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
    assert.equal(mentions.updatedAt, "17 octobre 2026");
  });

  it("nomment l'éditeur, son siège et ses coordonnées, tels que l'utilisateur les a donnés", () => {
    assert.equal(EDITEUR, "FilmFund Africa, représentée par NGOOH Cédric Hervé et Romaric SESSUA");
    assert.equal(SIEGE_EDITEUR, "ElMan & Sessua, Yaoundé, Cameroun");
    for (const valeur of [EDITEUR, SIEGE_EDITEUR, CONTACT_POLITIQUE_CONTENU, TELEPHONE_EDITEUR]) {
      assert.ok(section("editeur").includes(valeur), valeur);
    }
  });

  it("donnent le contact de la section 11 dans la formulation de l'utilisateur", () => {
    const contact = mentions.sections
      .find((candidate) => candidate.id === "droit-applicable")
      .blocks.find((bloc) => bloc.type === "fields");
    assert.deepEqual(
      contact.fields.map((champ) => champ.value),
      [EDITEUR, SIEGE_EDITEUR, CONTACT_POLITIQUE_CONTENU, CONTACT_ROMARIC, TELEPHONE_EDITEUR],
    );
  });

  it("n'inventent ni forme juridique, ni adresse précise, ni immatriculation", () => {
    const editeur = section("editeur");
    assert.match(editeur, /Forme juridique\nNon définie à ce jour/);
    assert.match(editeur, /RCCM et NIU seront ajoutés après immatriculation/);
    assert.match(editeur, /Adresse précise\n\[À COMPLÉTER\]/);
    assert.doesNotMatch(texte, /SARL|SAS\b|S\.A\./);
    // Le siège ne s'écrit qu'à partir de la constante : aucune ancienne forme.
    assert.doesNotMatch(texte, /ElMan, Yaoundé|startup en cours de création/);
  });

  it("nomment le directeur de la publication", () => {
    const directeur = section("directeur-publication");
    assert.match(directeur, /Directeur de la publication\nNGOOH Cédric Hervé/);
    assert.match(directeur, /Fondateur et représentant de la startup/);
  });

  it("nomment les deux administrateurs, et personne d'autre", () => {
    assert.deepEqual(
      ADMINISTRATEURS.map((administrateur) => administrateur.nom),
      ["NGOOH Cédric Hervé", "Romaric SESSUA"],
    );
    for (const administrateur of ADMINISTRATEURS) {
      assert.ok(section("administration").includes(administrateur.nom));
      assert.ok(section("administration").includes(administrateur.contact));
    }
  });

  it("nomment les trois hébergeurs en service, sans conditionnel", () => {
    const hebergement = section("hebergement");
    for (const nom of ["Vercel Inc.", "Supabase Inc.", "Railway Corp."]) {
      assert.ok(hebergement.includes(nom), nom);
    }
    assert.match(hebergement, /La plateforme est hébergée et déployée/);
    assert.doesNotMatch(texte, /susceptible d'être hébergée|avant la mise en production/);
  });

  it("disent où sont la base de données et les fichiers, et rien des autres traitements", () => {
    const hebergement = section("hebergement");
    assert.match(hebergement, /Hébergement de la base de données et des fichiers\nIrlande/);
    assert.match(hebergement, /Région des traitements asynchrones\n\[À COMPLÉTER\]/);
    assert.match(hebergement, /Coordonnées des prestataires\n\[À COMPLÉTER\]/);
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

  it("disent le droit applicable", () => {
    assert.match(section("droit-applicable"), /régies par le droit camerounais/);
  });

  it("ne garantissent toujours aucun financement", () => {
    assert.match(section("objet"), /ne garantit pas l'obtention d'un financement/);
  });
});
