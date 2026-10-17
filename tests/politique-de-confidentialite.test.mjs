/**
 * Politique de confidentialité : ce que la page dit du service tel qu'il est.
 *
 * Le texte a longtemps décrit un site de présentation sans compte ni
 * prestataire. Ces tests refusent qu'il y revienne, et qu'il taise à qui
 * partent les contenus d'un projet. Ils tiennent aussi ce que l'utilisateur a
 * fourni le 11 octobre 2026, et ce qui reste à compléter. Module pur.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  ADMINISTRATEURS,
  CONTACT_POLITIQUE_CONTENU,
  EDITEUR,
  getLegalDocument,
  SIEGE_EDITEUR,
} from "../src/lib/legal-content.ts";

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
    assert.equal(politique.updatedAt, "17 octobre 2026");
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

  it("nomme le responsable du traitement, son siège et son contact", () => {
    const responsable = section("responsable");
    for (const valeur of [EDITEUR, SIEGE_EDITEUR, CONTACT_POLITIQUE_CONTENU]) {
      assert.ok(responsable.includes(valeur), valeur);
      assert.ok(section("contact").includes(valeur), valeur);
    }
    assert.match(responsable, /Délégué à la protection des données\nNon désigné/);
  });

  it("cite le cadre légal fourni, et dit qu'il reste à faire valider", () => {
    const cadre = section("cadre-juridique");
    assert.match(cadre, /loi n° 2010\/012 du 21 décembre 2010/);
    assert.match(cadre, /loi n° 2024\/017 du 23 décembre 2024/);
    assert.match(cadre, /Références légales ci-dessus\n\[À FAIRE VALIDER PAR UN JURISTE\]/);
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
    assert.match(section("systemes"), /toujours depuis le serveur, jamais depuis le navigateur/);
  });

  it("dit où sont la base de données et les fichiers, sans l'étendre aux autres traitements", () => {
    const destinataires = section("destinataires");
    assert.match(destinataires, /Localisation de la base de données et des fichiers\nIrlande/);
    assert.match(destinataires, /Localisation des autres traitements[^\n]*\n\[À COMPLÉTER\]/);
    assert.match(section("transferts"), /hors du Cameroun, notamment aux États-Unis/);
  });

  it("range les dossiers exportés en base, pas dans le stockage", () => {
    const [base, stockage] = ["base de données —", "stockage —"].map((repere) =>
      section("systemes")
        .split("\n")
        .find((ligne) => ligne.includes(repere)),
    );
    assert.match(base, /dossiers exportés/);
    assert.doesNotMatch(stockage, /export/);
  });

  it("ne dit pas qu'un administrateur ne peut pas modifier un projet", () => {
    assert.doesNotMatch(texte, /ne peut pas modifier/);
    assert.match(
      section("destinataires"),
      /Les actions d'administration sensibles sont journalisées/,
    );
  });

  it("nomme les deux administrateurs et laisse à préciser ce qui n'est pas décidé", () => {
    const administrateurs = section("administrateurs");
    for (const administrateur of ADMINISTRATEURS) {
      assert.ok(administrateurs.includes(administrateur.nom));
      assert.ok(administrateurs.includes(administrateur.contact));
    }
    assert.match(administrateurs, /Responsabilités de Romaric SESSUA\n\[À PRÉCISER\]/);
    assert.match(administrateurs, /À CHOISIR\]/);
  });

  it("dit où sont les clés des fournisseurs d'IA : en base, chiffrées", () => {
    assert.match(section("administrateurs"), /conservées chiffrées dans la base de données/);
    assert.match(section("acces"), /une clé enregistrée n'est jamais réaffichée/);
  });

  it("annonce les cookies de session, et aucun autre", () => {
    assert.match(section("cookies"), /strictement nécessaires à la connexion/);
    assert.match(section("cookies"), /aucun cookie de mesure d'audience/);
  });

  it("n'annonce que la durée que la plateforme applique", () => {
    const conservation = section("conservation");
    assert.match(conservation, /supprimé trente jours après sa fabrication/);
    assert.match(conservation, /Dossiers exportés\n30 jours/);
    for (const domaine of [
      "Profils et rôles",
      "Projets et production",
      "Journal d'administration",
    ]) {
      assert.ok(conservation.includes(`${domaine}\n[À COMPLÉTER]`), domaine);
    }
    assert.doesNotMatch(conservation, /\d+ mois/);
  });

  it("donne l'adresse pour exercer ses droits, sans délai inventé", () => {
    assert.ok(section("droits").includes(CONTACT_POLITIQUE_CONTENU));
    assert.match(section("droits"), /Délai de réponse\n\[À COMPLÉTER\]/);
  });

  it("ne promet aucune notification des changements", () => {
    assert.doesNotMatch(section("modifications"), /informés|notifi/);
  });

  it("ne revendique aucune certification, et dit toujours qu'aucun paiement n'existe", () => {
    assert.match(section("securite"), /Aucune certification de sécurité n'est revendiquée/);
    assert.match(section("donnees-plateforme"), /Aucune donnée bancaire n'est traitée/);
  });
});
