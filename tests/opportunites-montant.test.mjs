/**
 * Filtre par montant du catalogue des opportunités (lot OP1) : la lecture de
 * l'adresse, ce que le filtre retient, et ce que lisent la page et son
 * formulaire.
 *
 * La règle est un module pur ; la page et le formulaire sont lus comme du
 * texte. Aucune base, aucun fournisseur.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  AIDE_FILTRE_MONTANT,
  devisesDuCatalogue,
  filtreMontantActif,
  filtrerParMontant,
  lireFiltreMontant,
  MONTANT_MAX,
  montantAtteint,
} from "../src/lib/opportunites.ts";

const DOSSIER = "src/app/(app)/opportunites/(liste)";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const filtre = (saisie = {}) => lireFiltreMontant((champ) => saisie[champ]);

/** Une opportunité fictive, réduite à ce que le filtre lit. */
const fiche = (name, budget_min, budget_max, currency) => ({
  name,
  budget_min,
  budget_max,
  currency,
});
const noms = (liste) => liste.map((o) => o.name);

const CATALOGUE = [
  fiche("Sans montant", null, null, null),
  fiche("Devise sans montant", null, null, "XAF"),
  fiche("Montant sans devise", 1000, 2000, null),
  fiche("Fourchette XAF", 5_000_000, 20_000_000, "XAF"),
  fiche("Plafond XAF", null, 3_000_000, "XAF"),
  fiche("Plancher XAF", 10_000_000, null, "XAF"),
  fiche("Fixe EUR", 30_000, 30_000, "EUR"),
];

describe("Filtre par montant : lecture de l'adresse", () => {
  it("sans rien dans l'adresse, le filtre est inactif", () => {
    assert.deepEqual(filtre(), { devise: null, minimum: null });
    assert.equal(filtreMontantActif(filtre()), false);
  });

  it("lit une devise, en majuscules, et un montant entier", () => {
    assert.deepEqual(filtre({ devise: " xaf ", montant: "5 000 000" }), {
      devise: "XAF",
      minimum: 5_000_000,
    });
    assert.equal(filtreMontantActif(filtre({ devise: "EUR" })), true);
  });

  it("une devise seule filtre déjà : toute somme dite dans cette devise", () => {
    assert.deepEqual(filtre({ devise: "EUR" }), { devise: "EUR", minimum: null });
  });

  it("un montant sans devise ne filtre rien : il ne voudrait rien dire", () => {
    assert.deepEqual(filtre({ montant: "5000" }), { devise: null, minimum: null });
    assert.deepEqual(filtre({ devise: "euros", montant: "5000" }), { devise: null, minimum: null });
  });

  it("ignore un montant qui n'en est pas un, sans refuser la devise", () => {
    for (const montant of ["abc", "-5", "1.5", "1e9", "0", String(MONTANT_MAX + 1), ["1", "2"]]) {
      assert.deepEqual(
        filtre({ devise: "XAF", montant }),
        { devise: "XAF", minimum: null },
        String(montant),
      );
    }
  });

  it("ignore une devise répétée, qui arrive en tableau", () => {
    assert.deepEqual(filtre({ devise: ["XAF", "EUR"] }), { devise: null, minimum: null });
  });
});

describe("Filtre par montant : ce qu'il retient", () => {
  const retenues = (saisie) => noms(filtrerParMontant(CATALOGUE, filtre(saisie)));

  it("inactif, il rend tout, dans l'ordre reçu", () => {
    assert.deepEqual(retenues({}), noms(CATALOGUE));
  });

  it("une devise : les seules opportunités qui disent un montant dans cette devise", () => {
    assert.deepEqual(retenues({ devise: "XAF" }), [
      "Fourchette XAF",
      "Plafond XAF",
      "Plancher XAF",
    ]);
    assert.deepEqual(retenues({ devise: "EUR" }), ["Fixe EUR"]);
    assert.deepEqual(retenues({ devise: "USD" }), []);
  });

  it("un minimum : celles dont le montant accordé l'atteint", () => {
    assert.deepEqual(retenues({ devise: "XAF", montant: "5000000" }), [
      "Fourchette XAF",
      "Plancher XAF",
    ]);
    assert.deepEqual(retenues({ devise: "XAF", montant: "20000000" }), ["Fourchette XAF"]);
    assert.deepEqual(retenues({ devise: "XAF", montant: "20000001" }), []);
    assert.deepEqual(retenues({ devise: "XAF", montant: "3000000" }), [
      "Fourchette XAF",
      "Plafond XAF",
      "Plancher XAF",
    ]);
  });

  it("deux devises ne se comparent jamais : 30 000 EUR n'atteint pas 10 000 XAF", () => {
    assert.deepEqual(retenues({ devise: "XAF", montant: "10000" }), [
      "Fourchette XAF",
      "Plafond XAF",
      "Plancher XAF",
    ]);
    assert.ok(!retenues({ devise: "XAF", montant: "1" }).includes("Fixe EUR"));
  });

  it("une opportunité sans montant n'est jamais retenue : « non fourni » n'est pas « toute somme »", () => {
    for (const saisie of [{ devise: "XAF" }, { devise: "XAF", montant: "1" }, { devise: "EUR" }]) {
      const liste = retenues(saisie);
      for (const nom of ["Sans montant", "Devise sans montant", "Montant sans devise"]) {
        assert.ok(!liste.includes(nom), nom);
      }
    }
  });

  it("garde l'ordre reçu : le tri des autres filtres n'est pas défait", () => {
    const inverse = [...CATALOGUE].reverse();
    assert.deepEqual(noms(filtrerParMontant(inverse, filtre({ devise: "XAF" }))), [
      "Plancher XAF",
      "Plafond XAF",
      "Fourchette XAF",
    ]);
  });

  it("le montant atteint est le plafond, à défaut le plancher, et rien sans devise", () => {
    assert.equal(montantAtteint(fiche("a", 5, 20, "XAF")), 20);
    assert.equal(montantAtteint(fiche("a", null, 20, "XAF")), 20);
    assert.equal(montantAtteint(fiche("a", 5, null, "XAF")), 5);
    assert.equal(montantAtteint(fiche("a", null, null, "XAF")), null);
    assert.equal(montantAtteint(fiche("a", 5, 20, null)), null);
    assert.equal(montantAtteint(fiche("a", 0, 0, "XAF")), 0);
  });

  it("ne propose que les devises dans lesquelles un montant est dit, triées", () => {
    assert.deepEqual(devisesDuCatalogue(CATALOGUE), ["EUR", "XAF"]);
    assert.deepEqual(devisesDuCatalogue([fiche("a", null, null, "USD")]), []);
    assert.deepEqual(devisesDuCatalogue([]), []);
  });
});

describe("Filtre par montant : page et formulaire", () => {
  const page = lire(`${DOSSIER}/page.tsx`);
  const formulaire = lire(`${DOSSIER}/filtres.tsx`);

  it("la page applique le filtre sur les lignes lues, après les autres, sans rien ajouter à la requête", () => {
    assert.match(page, /const montant = lireFiltreMontant\(\(champ\) => parametres\[champ\]\);/);
    assert.match(
      page,
      /const retenues = filtrerParMontant\(filtrerCatalogue\(catalogue, filtres, aujourdhui\), montant\);/,
    );
    assert.doesNotMatch(page, /\.(gte|lte|gt|lt|ilike|like|or|filter)\(/);
    assert.doesNotMatch(page, /\.eq\("currency"/);
  });

  it("un filtre par montant actif se dit, et se retire avec les autres", () => {
    assert.match(
      page,
      /const actifs = filtresActifs\(filtres\) \|\| filtreMontantActif\(montant\);/,
    );
  });

  it("la page lit les montants et la devise du catalogue", () => {
    assert.match(page, /budget_min, budget_max, currency/);
    assert.match(page, /const devises = devisesDuCatalogue\(catalogue\);/);
  });

  it("le formulaire propose la devise puis le montant, chacun nommé pour un lecteur d'écran", () => {
    assert.match(formulaire, /<legend[^>]*>Montant accordé<\/legend>/);
    assert.match(formulaire, /name="devise"/);
    assert.match(formulaire, /name="montant"/);
    assert.match(formulaire, /htmlFor="filtre-devise"/);
    assert.match(formulaire, /htmlFor="filtre-montant"/);
    assert.match(formulaire, /aria-describedby="filtre-montant-aide"/);
    assert.match(formulaire, /\{devises\.map\(\(devise\) => \(/);
    // Sans montant au catalogue, le filtre n'est pas proposé du tout.
    assert.match(formulaire, /\{devises\.length \? \(/);
  });

  it("le formulaire reste un formulaire en GET, sans script", () => {
    assert.match(formulaire, /<form method="get" action="\/opportunites"/);
    assert.doesNotMatch(formulaire, /"use client"/);
  });

  it("l'écran dit ce que le filtre ne fait pas", () => {
    assert.match(page, /\{AIDE_FILTRE_MONTANT\}/);
    assert.match(page, /id="filtre-montant-aide"/);
    assert.match(AIDE_FILTRE_MONTANT, /dans la même devise/);
    assert.match(AIDE_FILTRE_MONTANT, /ne donne pas de montant n'y figure pas/);
    assert.match(AIDE_FILTRE_MONTANT, /pas ce que votre projet obtiendrait/);
    assert.doesNotMatch(AIDE_FILTRE_MONTANT, /taux|conver/i);
  });
});
