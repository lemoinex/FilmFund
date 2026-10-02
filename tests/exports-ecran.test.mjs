/**
 * Exports PDF (lot M2) : ce que l'écran propose, valide et affiche.
 *
 * Importe directement le module TypeScript (types retirés par Node). Module
 * pur : ni base, ni serveur. La route de téléchargement et le parcours
 * complet se vérifient dans le navigateur.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  enTeteDeTelechargement,
  ERREURS_EXPORT,
  etapeExport,
  exportsPdf,
  libelleDemande,
  lireFichier,
  messageErreurExport,
  nomDeFichier,
  normaliserDemande,
  ORDRE_SECTIONS,
  pages,
  poids,
  premierDuMois,
} from "../src/lib/exports.ts";

const TYPES = ["note_intention", "traitement", "scenario", "biographie", "lettre", "autre"];
const LIBELLES = {
  note_intention: "Note d'intention",
  traitement: "Traitement",
  scenario: "Scénario",
};

/** Espaces insécables ramenées à des espaces ordinaires, pour des attendus lisibles. */
const net = (texte) => texte.replace(/[\u202f\u00a0]/g, " ");

describe("Exports PDF : demande", () => {
  it("ramène une demande à sa forme canonique, comme la base", () => {
    assert.deepEqual(
      normaliserDemande(["planning", "budget", "budget"], ["scenario", "note_intention"], TYPES),
      { sections: ["budget", "planning"], documents: ["note_intention", "scenario"] },
    );
  });

  it("refuse une section ou un type de document inconnu", () => {
    assert.equal(normaliserDemande(["storyboard"], [], TYPES), null);
    assert.equal(normaliserDemande(["budget"], ["facture"], TYPES), null);
    // Un nom de propriété héritée n'est pas une section.
    assert.equal(normaliserDemande(["toString"], [], TYPES), null);
  });

  it("refuse une demande vide ou mal formée", () => {
    assert.equal(normaliserDemande([], [], TYPES), null);
    assert.equal(normaliserDemande("budget", [], TYPES), null);
    assert.equal(normaliserDemande(["budget"], [1], TYPES), null);
    assert.equal(normaliserDemande(undefined, undefined, TYPES), null);
  });

  it("propose les sections dans l'ordre du dossier", () => {
    assert.deepEqual(ORDRE_SECTIONS, ["synthese", "budget", "financements", "planning"]);
  });

  it("nomme le contenu d'un dossier dans l'ordre où il le présente", () => {
    assert.equal(
      libelleDemande(
        { sections: ["budget", "planning", "synthese"], documents: ["scenario", "note_intention"] },
        LIBELLES,
      ),
      "Synthèse, Note d'intention, Scénario, Budget prévisionnel, Planning",
    );
    assert.equal(libelleDemande(null, LIBELLES), "Dossier");
    assert.equal(libelleDemande({ sections: "budget" }, LIBELLES), "Dossier");
  });
});

describe("Exports PDF : étapes de l'écran", () => {
  it("sans tâche, ou après un export abouti, une demande peut être faite", () => {
    assert.deepEqual(etapeExport(null), { etape: "repos" });
    assert.deepEqual(etapeExport({ id: "t", state: "succeeded", reason: null }), {
      etape: "repos",
    });
    assert.deepEqual(etapeExport({ id: "t", state: "cancelled", reason: null }), {
      etape: "repos",
    });
  });

  it("suit la tâche : en attente (annulable), en cours, à rapprocher, en échec", () => {
    assert.deepEqual(etapeExport({ id: "t", state: "queued", reason: null }), {
      etape: "en_attente",
      tacheId: "t",
    });
    assert.deepEqual(etapeExport({ id: "t", state: "running", reason: null }), {
      etape: "en_cours",
    });
    assert.deepEqual(etapeExport({ id: "t", state: "awaiting_reconciliation", reason: null }), {
      etape: "a_rapprocher",
    });
    assert.deepEqual(etapeExport({ id: "t", state: "failed", reason: "Rien à exporter." }), {
      etape: "echec",
      motif: "Rien à exporter.",
    });
  });

  it("ramène un état inconnu au repos plutôt qu'à une attente sans fin", () => {
    assert.deepEqual(etapeExport({ id: "t", state: "inconnu", reason: null }), { etape: "repos" });
  });

  it("traduit chaque erreur connue de la base, sans jamais montrer son code", () => {
    const messages = Object.values(ERREURS_EXPORT).map(messageErreurExport);
    for (const message of [...messages, messageErreurExport("XX000"), messageErreurExport()]) {
      assert.match(message, /^[A-ZÀ-Ý].+\.$/);
      assert.doesNotMatch(message, /\b[0-9A-Z]{5}\b/);
    }
    assert.match(messageErreurExport(ERREURS_EXPORT.quota), /exports PDF/);
    assert.notEqual(messageErreurExport(ERREURS_EXPORT.quota), messageErreurExport("XX000"));
  });

  it("accorde les pages et les exports, et écrit un poids lisible", () => {
    assert.equal(pages(1), "1 page");
    assert.equal(pages(12), "12 pages");
    assert.equal(exportsPdf(1), "1 export PDF");
    assert.equal(exportsPdf(3), "3 exports PDF");
    assert.equal(net(poids(300)), "1 Ko");
    assert.equal(net(poids(319_488)), "312 Ko");
    assert.equal(net(poids(1_258_291)), "1,2 Mo");
  });
});

describe("Exports PDF : fichier", () => {
  it("tire du titre un nom de fichier sans accent ni caractère spécial", () => {
    assert.equal(nomDeFichier("Les Eaux de Kribi"), "dossier-les-eaux-de-kribi.pdf");
    assert.equal(nomDeFichier("L'Été « indien » — acte II"), "dossier-l-ete-indien-acte-ii.pdf");
    // Rien qui puisse sortir de l'en-tête ou du dossier de téléchargement.
    assert.equal(nomDeFichier('a"\r\nx: y/../z'), "dossier-a-x-y-z.pdf");
    assert.equal(nomDeFichier("Ɛ ɔ ŋ"), "dossier-projet.pdf");
    assert.ok(nomDeFichier("x".repeat(300)).length <= 72);
    assert.doesNotMatch(nomDeFichier(`${"mot ".repeat(15)}fin`), /-\.pdf$/);
  });

  it("lit un fichier rendu en hexadécimal par l'API", () => {
    const fichier = lireFichier("\\x255044462d312e330a");
    assert.equal(Buffer.from(fichier).toString("latin1"), "%PDF-1.3\n");
  });

  it("refuse ce qui n'est pas un PDF rendu en hexadécimal", () => {
    assert.equal(lireFichier(null), null);
    assert.equal(lireFichier(undefined), null);
    assert.equal(lireFichier(""), null);
    assert.equal(lireFichier("\\x"), null);
    assert.equal(lireFichier("255044462d"), null, "sans préfixe");
    assert.equal(lireFichier("\\x25504"), null, "nombre impair de chiffres");
    assert.equal(lireFichier("\\x3c68746d6c3e"), null, "du HTML, pas un PDF");
    assert.equal(lireFichier("\\x2550zz462d"), null);
  });
});

describe("Exports PDF : en-tête de téléchargement", () => {
  it("donne un nom réduit à l'ASCII, et un nom complet encodé", () => {
    assert.equal(
      enTeteDeTelechargement("Les Eaux de Kribi"),
      "attachment; filename=\"dossier-les-eaux-de-kribi.pdf\"; filename*=UTF-8''Dossier%20-%20Les%20Eaux%20de%20Kribi.pdf",
    );
  });

  it("garde les lettres du titre dans le nom complet", () => {
    const enTete = enTeteDeTelechargement("Mɔ́ŋ ma Ɛyɔ");
    const encode = enTete.split("filename*=UTF-8''")[1];
    assert.equal(decodeURIComponent(encode), "Dossier - Mɔ́ŋ ma Ɛyɔ.pdf");
  });

  it("ne laisse rien sortir de l'en-tête, quel que soit le titre", () => {
    const enTete = enTeteDeTelechargement("a\"\r\nSet-Cookie: x=1; b/../c\d:e*f?g<h>i|j'k(l)");
    // Un en-tête tient sur une ligne, en ASCII, sans guillemet hors de sa place.
    assert.match(
      enTete,
      /^attachment; filename="[a-z0-9.-]+"; filename\*=UTF-8''[A-Za-z0-9%._~-]+$/,
    );
    const nom = decodeURIComponent(enTete.split("filename*=UTF-8''")[1]);
    assert.doesNotMatch(nom, /[\u0000-\u001f<>:"/\\|?*]/);
    assert.equal(enTeteDeTelechargement("   "), enTeteDeTelechargement(""));
    assert.match(enTeteDeTelechargement(""), /Dossier%20-%20Projet\.pdf$/);
  });

  it("écrit le premier du mois « 1er »", () => {
    assert.equal(premierDuMois("1 novembre 2026"), "1er novembre 2026");
    assert.equal(premierDuMois("11 novembre 2026"), "11 novembre 2026");
    assert.equal(premierDuMois("21 novembre 2026 à 19:32"), "21 novembre 2026 à 19:32");
  });
});
