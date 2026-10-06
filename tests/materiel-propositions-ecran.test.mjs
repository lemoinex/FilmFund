/**
 * Matériel proposé par GEAR (lot J3c-3) : ce que l'écran compte et annonce,
 * et ce que ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page et
 * l'encart sont lus comme du texte : leur parcours complet se vérifie dans le
 * navigateur, et les droits eux-mêmes par les tests de la base et du worker.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  bilanEquipements,
  estActionIa,
  estActionStructuree,
  LIVRABLE_DECOUPAGE,
  LIVRABLE_MATERIEL,
  messageLotEquipements,
  nombreEquipements,
} from "../src/lib/propositions.ts";
import { PROFIL_MATERIEL, PROFILS_GEAR } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/materiel";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Matériel proposé : catalogue, bilan et accords", () => {
  it("l'écran propose exactement ce que GEAR sait produire, à la même borne", () => {
    assert.deepEqual(Object.keys(PROFILS_GEAR), [LIVRABLE_MATERIEL.action]);
    assert.equal(LIVRABLE_MATERIEL.lignesMax, PROFIL_MATERIEL.lignesMax);
    // Tenu à part des textes, des livrables de FIELD et du découpage.
    assert.equal(estActionIa(LIVRABLE_MATERIEL.action), false);
    assert.equal(estActionStructuree(LIVRABLE_MATERIEL.action), false);
    assert.notEqual(LIVRABLE_MATERIEL.action, LIVRABLE_DECOUPAGE.action);
  });

  it("dit d'où part l'assistant, à qui le dossier est transmis, ce qu'il ne fait pas et ce que valent ses puissances", () => {
    assert.match(LIVRABLE_MATERIEL.description, /storyboard, du découpage/);
    assert.match(LIVRABLE_MATERIEL.description, /fournisseur d'IA/);
    assert.match(LIVRABLE_MATERIEL.description, /ni marque, ni loueur, ni prix/);
    assert.match(LIVRABLE_MATERIEL.description, /aucun calcul/);
    assert.match(LIVRABLE_MATERIEL.avertissement, /sans fiche technique/);
    assert.match(LIVRABLE_MATERIEL.avertissement, /plaque de l'appareil/);
  });

  it("compte ce qui attend, ce qui est entré au matériel et ce qui est écarté", () => {
    assert.deepEqual(
      bilanEquipements([
        { state: "proposed" },
        { state: "proposed" },
        { state: "accepted" },
        { state: "dismissed" },
      ]),
      { enAttente: 2, acceptes: 1, ecartes: 1 },
    );
    assert.deepEqual(bilanEquipements([]), { enAttente: 0, acceptes: 0, ecartes: 0 });
  });

  it("accorde les équipements, et dit combien sont passés après « tout accepter »", () => {
    assert.equal(nombreEquipements(1), "1 équipement");
    assert.equal(nombreEquipements(12), "12 équipements");
    assert.equal(messageLotEquipements(1, 1), "1 équipement ajouté au matériel.");
    assert.equal(messageLotEquipements(6, 6), "6 équipements ajoutés au matériel.");
    assert.equal(
      messageLotEquipements(4, 6),
      "4 équipements sur 6 ajoutés au matériel ; les autres attendent toujours votre décision.",
    );
    assert.match(messageLotEquipements(0, 6), /^Aucun équipement n'a pu être ajouté/);
  });
});

describe("Matériel proposé : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-ia.ts`));
  const fonctions = source.split("\nexport async function ").slice(1);
  const corps = (nom) => {
    const fonction = fonctions.find((f) => f.startsWith(`${nom}(`));
    assert.ok(fonction, `${nom} introuvable`);
    return fonction;
  };

  it("les sept actions attendues, et rien d'autre", () => {
    assert.deepEqual(
      fonctions.map((f) => f.slice(0, f.indexOf("("))),
      [
        "demanderDevisMateriel",
        "lancerPropositionMateriel",
        "annulerPropositionMateriel",
        "accepterEquipementPropose",
        "ecarterEquipementPropose",
        "accepterEquipementsRestants",
        "ecarterEquipementsRestants",
      ],
    );
  });

  it("chaque action contrôle chacun de ses identifiants et exige une session avant d'appeler la base", () => {
    for (const fonction of fonctions) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const signature = fonction.slice(0, fonction.indexOf("): Promise<"));
      const identifiants = [...signature.matchAll(/(\w+): string/g)].map((m) => m[1]);
      assert.ok(identifiants.length >= 1, `${nom} : lecture de la signature`);
      for (const identifiant of identifiants) {
        assert.ok(fonction.includes(`UUID.test(${identifiant})`), `${nom} : ${identifiant}`);
      }
      const controle = fonction.indexOf("UUID.test(");
      const garde = fonction.indexOf("await session()");
      const appel = fonction.search(/\.rpc\(/);
      assert.ok(garde > controle, `${nom} : la session suit le contrôle`);
      assert.ok(appel > garde, `${nom} : la base n'est appelée qu'après la garde`);
    }
    assert.match(source, /const garde = await exigerAcces\(supabase\);/);
  });

  it("le navigateur ne choisit ni l'action, ni le modèle, ni les paramètres du devis", () => {
    assert.match(corps("demanderDevisMateriel"), /p_action: ACTION,\s+p_params: \{\},/);
    assert.match(source, /const ACTION = LIVRABLE_MATERIEL\.action;/);
    assert.doesNotMatch(source, /modele|profil|jetons|claude-/i);
    assert.match(corps("lancerPropositionMateriel"), /!UUID\.test\(cle\)/);
  });

  it("un équipement corrigé passe par les lectures d'une ligne saisie avant la base", () => {
    const acceptation = corps("accepterEquipementPropose");
    for (const controle of [
      "estCategorieMateriel(categorie)",
      'lireEntier(String(saisie.quantite ?? ""), QUANTITE)',
      'lireEntier(String(saisie.puissance ?? ""), PUISSANCE_WATTS)',
      "designation.length > DESIGNATION_MAX",
      'quantite === null || quantite === "invalide"',
    ]) {
      assert.ok(acceptation.includes(controle), controle);
    }
    // Sans correction, aucun champ n'est envoyé : la base retient la proposition.
    assert.match(acceptation, /\.\.\.\(corrige \? \{ p_corrige: corrige \} : \{\}\),/);
    // La case à cocher n'est crue que si elle vaut exactement vrai.
    assert.match(acceptation, /simultaneous: saisie\.simultane === true,/);
  });

  it("une liste pleine refuse une ligne de plus, à l'unité comme en lot", () => {
    assert.match(
      corps("accepterEquipementPropose"),
      /if \(\(await placesLibres\(acces\.supabase, projetId\)\) < 1\) \{\s+return LISTE_PLEINE;/,
    );
    assert.match(
      corps("accepterEquipementsRestants"),
      /if \(\(await placesLibres\(acces\.supabase, projetId\)\) < equipements\.length\) \{\s+return LISTE_PLEINE;/,
    );
    assert.match(source, /EQUIPEMENTS_MAX - \(count \?\? 0\)/);
  });

  it("« tout accepter » ne lit que les lignes en attente de la proposition, sous la RLS, et borne sa lecture", () => {
    const lot = corps("accepterEquipementsRestants");
    assert.match(
      lot,
      /\.eq\("project_id", projetId\)\s+\.eq\("suggestion_id", propositionId\)\s+\.eq\("state", "proposed"\)/,
    );
    assert.match(lot, /\.limit\(LIVRABLE_MATERIEL\.lignesMax\)/);
    assert.match(lot, /messageLotEquipements\(acceptes, equipements\.length\)/);
    assert.match(corps("ecarterEquipementsRestants"), /rpc\("ecarter_proposition"/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé, ni n'écrit sans passer par une fonction", () => {
    assert.doesNotMatch(source, /anthropic|openai|API_KEY|SECRET|service_role/i);
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
  });
});

describe("Matériel proposé : page du matériel", () => {
  const page = sansCommentaires(lire(`${DOSSIER}/page.tsx`));
  const encart = lire(`${DOSSIER}/lignes-proposees.tsx`);

  it("la page porte l'encart et une seule boucle de rafraîchissement", () => {
    assert.equal(page.match(/<RafraichissementPropositions/g)?.length, 1);
    assert.equal(page.match(/<MaterielPropose/g)?.length, 1);
    assert.match(page, /\.limit\(LIVRABLE_MATERIEL\.lignesMax\)/);
    assert.match(page, /\.eq\("action", LIVRABLE_MATERIEL\.action\)/);
  });

  it("un lecteur lit le matériel proposé sans suivre la demande ni en décider", () => {
    assert.match(
      page,
      /if \(peutDecider\) \{\s+const \{ data: tache \} = await supabase\s+\.from\("jobs"\)/,
    );
    assert.match(page, /if \(proposition\?\.state === "proposed"\) \{/);
    assert.match(
      page,
      /const montrerAssistant = peutDecider \|\| assistant\.etape\.etape === "proposition";/,
    );
    assert.match(page, /peutDecider=\{peutDecider\}/);
    assert.match(
      encart,
      /Seuls le porteur et les éditeurs du projet décident du matériel proposé\./,
    );
    assert.match(encart, /\{peutDecider && auRepos && !demande \? \(/);
    assert.match(encart, /\{peutDecider && bilan\.enAttente > 0 \? \(/);
  });

  it("l'encart affiche l'avertissement dès que des lignes sont montrées, et ne présente aucune puissance comme une mesure", () => {
    assert.match(encart, /\{LIVRABLE_MATERIEL\.avertissement\}/);
    assert.match(
      encart,
      /`Puissance estimée : \$\{formaterPuissance\(equipement\.unit_power_watts\)\} l'unité`/,
    );
    assert.match(encart, /"Puissance non estimée"/);
    assert.match(encart, /Rien n&apos;entre au matériel sans accord, ligne par ligne\./);
  });

  it("l'encart ne calcule rien : le besoin électrique reste celui de la page, sur ce qui est accepté", () => {
    // Ni total, ni intensité sur des lignes seulement proposées.
    assert.doesNotMatch(encart, /besoinElectrique|formaterIntensite|puissanceLigne/);
    // Aucune arithmétique sur une puissance proposée, sous quelque forme que ce soit.
    assert.doesNotMatch(encart, /unit_power_watts[^\n]*[*+]|[*+][^\n]*unit_power_watts/);
    assert.doesNotMatch(encart, /\.reduce\(/);
    assert.match(page, /besoinElectrique\(liste, reglages\)/);
  });

  it("« tout accepter » demande une confirmation, et aucune borne n'est écrite en dur", () => {
    assert.match(encart, /`Ajouter \$\{nombreEquipements\(bilan\.enAttente\)\} au matériel`/);
    assert.match(encart, /setConfirmation\(true\)/);
    assert.match(encart, /maxLength=\{DESIGNATION_MAX\}/);
    assert.match(encart, /maxLength=\{String\(QUANTITE\.max\)\.length\}/);
    assert.match(encart, /maxLength=\{String\(PUISSANCE_WATTS\.max\)\.length\}/);
    assert.doesNotMatch(encart, /maxLength=\{\d+\}/);
  });
});
