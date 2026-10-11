/**
 * Politique de confidentialité : ce que la page dit du service tel qu'il est.
 *
 * Le texte a longtemps décrit un site de présentation sans compte ni
 * prestataire. Ces tests refusent qu'il y revienne, et qu'il taise à qui
 * partent les contenus d'un projet. Module pur : ni base, ni serveur.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { CONTACT_POLITIQUE_CONTENU, getLegalDocument } from "../src/lib/legal-content.ts";

const politique = getLegalDocument("confidentialite");

const texteDe = (section) =>
  [
    section.title,
    ...section.blocks.flatMap((bloc) => {
      if (bloc.type === "paragraph") return [bloc.text];
      if (bloc.type === "list") return bloc.items;
      return bloc.fields.flatMap((champ) => [champ.label ?? "", champ.value]);
    }),
  ].join("\n");

const section = (id) => texteDe(politique.sections.find((candidate) => candidate.id === id));
const texte = politique.sections.map(texteDe).join("\n");

describe("Politique de confidentialité : le service tel qu'il est", () => {
  it("est datée", () => {
    assert.equal(politique.updatedAt, "11 octobre 2026");
  });

  it("dit que la plateforme est en service, en accès privé", () => {
    assert.match(section("objet"), /La plateforme est en service, en accès privé/);
    assert.match(section("objet"), /L'inscription est fermée/);
  });

  it("ne décrit plus un site de présentation sans compte ni prestataire", () => {
    assert.doesNotMatch(texte, /le site est un site de présentation/i);
    assert.doesNotMatch(texte, /sera ouverte|seront accessibles|seront susceptibles/);
    assert.doesNotMatch(texte, /envisagés|\(prévu\)|n'est configuré ni en service/);
  });

  it("nomme les trois prestataires d'hébergement en service", () => {
    const destinataires = section("destinataires");
    for (const nom of ["Vercel Inc.", "Supabase Inc.", "Railway Corp."]) {
      assert.ok(destinataires.includes(nom), nom);
    }
  });

  it("dit à quels fournisseurs d'IA partent les éléments d'un projet, et sur quelle demande", () => {
    const destinataires = section("destinataires");
    for (const nom of ["Anthropic", "OpenAI", "Perplexity"]) {
      assert.ok(destinataires.includes(nom), nom);
    }
    assert.match(destinataires, /Rien n'est transmis sans une demande de l'utilisateur/);
    assert.match(destinataires, /il reçoit la seule question posée/);
  });

  it("ne dit pas qu'un administrateur ne peut pas modifier un projet", () => {
    assert.doesNotMatch(texte, /ne peut pas modifier/);
    assert.match(section("destinataires"), /les actions d'administration sont journalisées/);
  });

  it("annonce les cookies de session, et aucun autre", () => {
    assert.match(section("cookies"), /strictement nécessaires à la connexion/);
    assert.match(section("cookies"), /aucun cookie de mesure d'audience/);
  });

  it("n'annonce que la durée que la plateforme applique", () => {
    assert.match(section("conservation"), /supprimé trente jours après sa fabrication/);
  });

  it("donne l'adresse de contact, aux trois endroits où elle se demande", () => {
    for (const id of ["responsable", "droits", "contact"]) {
      assert.ok(section(id).includes(CONTACT_POLITIQUE_CONTENU), id);
    }
    assert.doesNotMatch(section("contact"), /\[E-MAIL\]/);
  });

  it("ne promet aucune notification des changements", () => {
    assert.doesNotMatch(section("modifications"), /informés/);
  });

  it("ne revendique aucune certification, et dit toujours qu'aucun paiement n'existe", () => {
    assert.match(section("securite"), /Aucune certification de sécurité n'est revendiquée/);
    assert.match(section("donnees-plateforme"), /Aucune donnée bancaire n'est traitée/);
  });
});
