/**
 * Personnages proposés par ARC (lot X2b) : ce que l'écran compte et annonce,
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
  bilanPersonnages,
  cleDeNom,
  ERREURS_BASE,
  estActionIa,
  estActionStructuree,
  LIVRABLE_MATERIEL,
  LIVRABLE_PERSONNAGES,
  messageErreur,
  messageLotPersonnages,
  nombrePersonnages,
} from "../src/lib/propositions.ts";
import { PROFIL_PERSONNAGES, PROFILS_ARC_PERSONNAGES } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/assistant";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("Personnages proposés : catalogue, bilan et accords", () => {
  it("l'écran propose exactement ce qu'ARC sait proposer, à la même borne", () => {
    assert.deepEqual(Object.keys(PROFILS_ARC_PERSONNAGES), [LIVRABLE_PERSONNAGES.action]);
    assert.equal(LIVRABLE_PERSONNAGES.lignesMax, PROFIL_PERSONNAGES.lignesMax);
    // Tenu à part des textes, des livrables de FIELD et du matériel.
    assert.equal(estActionIa(LIVRABLE_PERSONNAGES.action), false);
    assert.equal(estActionStructuree(LIVRABLE_PERSONNAGES.action), false);
    assert.notEqual(LIVRABLE_PERSONNAGES.action, LIVRABLE_MATERIEL.action);
  });

  it("dit d'où part l'assistant, à qui la fiche est transmise, ce qu'il ne fait pas et ce que valent ses portraits", () => {
    assert.match(LIVRABLE_PERSONNAGES.description, /pitch, synopsis, thème, enjeux, vision/);
    assert.match(LIVRABLE_PERSONNAGES.description, /personnages déjà saisis/);
    assert.match(LIVRABLE_PERSONNAGES.description, /fournisseur d'IA/);
    assert.match(LIVRABLE_PERSONNAGES.description, /Il n'en modifie aucun/);
    assert.match(LIVRABLE_PERSONNAGES.avertissement, /relisez chaque portrait/);
    assert.match(LIVRABLE_PERSONNAGES.avertissement, /personne réelle/);
  });

  it("compte ce qui attend, ce qui est entré au projet et ce qui est écarté", () => {
    assert.deepEqual(
      bilanPersonnages([
        { state: "proposed" },
        { state: "proposed" },
        { state: "accepted" },
        { state: "dismissed" },
      ]),
      { enAttente: 2, acceptes: 1, ecartes: 1 },
    );
    assert.deepEqual(bilanPersonnages([]), { enAttente: 0, acceptes: 0, ecartes: 0 });
  });

  it("accorde les personnages, et dit combien sont passés après « tout accepter »", () => {
    assert.equal(nombrePersonnages(1), "1 personnage");
    assert.equal(nombrePersonnages(12), "12 personnages");
    assert.equal(messageLotPersonnages(1, 1), "1 personnage ajouté au projet.");
    assert.equal(messageLotPersonnages(6, 6), "6 personnages ajoutés au projet.");
    assert.equal(
      messageLotPersonnages(4, 6),
      "4 personnages sur 6 ajoutés au projet ; les autres attendent toujours votre décision.",
    );
    assert.match(messageLotPersonnages(0, 6), /^Aucun personnage n'a pu être ajouté/);
  });

  it("reconnaît un même nom à la casse, aux accents et aux espaces près", () => {
    assert.equal(cleDeNom("  Le  FRÈRE "), cleDeNom("le frere"));
    assert.equal(cleDeNom("Ɛyɔ"), cleDeNom("ɛyɔ"));
    assert.notEqual(cleDeNom("Le frère"), cleDeNom("La sœur"));
    // La même règle que le worker, qui ne garde qu'une fois un nom rendu deux fois.
    const agent = lire("worker/src/agents/arc.ts");
    const ecran = lire("src/lib/propositions.ts");
    const regle = (source) =>
      /function cleDeNom\(nom: string\): string \{([\s\S]*?)\n\}/.exec(source)?.[1];
    assert.ok(regle(agent));
    assert.equal(regle(ecran), regle(agent));
  });

  it("une liste pleine a son message, qui ne montre pas le code de la base", () => {
    assert.equal(ERREURS_BASE.listePleine, "PR003");
    const message = messageErreur("PR003");
    assert.match(message, /cinquante personnages/);
    assert.ok(!message.includes("PR003"));
  });
});

describe("Personnages proposés : actions serveur", () => {
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
        "demanderDevisPersonnages",
        "lancerPropositionPersonnages",
        "annulerPropositionPersonnages",
        "accepterPersonnagePropose",
        "ecarterPersonnagePropose",
        "accepterPersonnagesRestants",
        "ecarterPersonnagesRestants",
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
    assert.match(corps("demanderDevisPersonnages"), /p_action: ACTION,\s+p_params: \{\},/);
    assert.match(source, /const ACTION = LIVRABLE_PERSONNAGES\.action;/);
    assert.doesNotMatch(source, /modele|profil|jetons|claude-/i);
    assert.match(corps("lancerPropositionPersonnages"), /!UUID\.test\(cle\)/);
  });

  it("un personnage corrigé passe par la lecture d'un personnage saisi avant la base", () => {
    const acceptation = corps("accepterPersonnagePropose");
    assert.match(
      acceptation,
      /normaliserPersonnage\(\{\s+name: saisie\.nom,\s+role: saisie\.role,\s+description: saisie\.description,\s+\}\)/,
    );
    assert.match(acceptation, /if \("erreur" in lu\) \{\s+return lu;/);
    // Sans correction, aucun champ n'est envoyé : la base retient la proposition.
    assert.match(acceptation, /\.\.\.\(corrige \? \{ p_corrige: corrige \} : \{\}\),/);
    assert.ok(acceptation.indexOf("normaliserPersonnage(") < acceptation.indexOf(".rpc("));
  });

  it("une liste pleine est dite avant d'appeler la base, et reconnue quand c'est elle qui le dit", () => {
    for (const nom of ["accepterPersonnagePropose", "accepterPersonnagesRestants"]) {
      const fonction = corps(nom);
      const places = fonction.indexOf("await placesLibres(acces.supabase, projetId)");
      assert.ok(places > 0, nom);
      assert.ok(places < fonction.indexOf('.rpc("accepter_personnage_propose"'), nom);
    }
    assert.match(source, /return MAX_PERSONNAGES - \(count \?\? 0\);/);
    assert.match(source, /code === ERREURS_BASE\.listePleine/);
    assert.match(corps("demanderDevisPersonnages"), /messageDe\(error\?\.code, error\?\.message\)/);
    assert.match(corps("accepterPersonnagePropose"), /messageDe\(error\.code, error\.message\)/);
  });

  it("« tout accepter » ne lit que ce qui attend, sous la RLS, borné, et dit ce qui est passé", () => {
    const lot = corps("accepterPersonnagesRestants");
    assert.match(lot, /\.from\("ai_suggestion_characters"\)/);
    assert.match(lot, /\.eq\("project_id", projetId\)/);
    assert.match(lot, /\.eq\("suggestion_id", propositionId\)/);
    assert.match(lot, /\.eq\("state", "proposed"\)/);
    assert.match(lot, /\.limit\(LIVRABLE_PERSONNAGES\.lignesMax\)/);
    assert.match(lot, /messageLotPersonnages\(acceptes, personnages\.length\)/);
    // Aucune correction ne passe par le lot : chaque personnage tel que proposé.
    assert.doesNotMatch(lot, /p_corrige/);
  });

  it("aucune action n'écrit directement une table, ni ne modifie un personnage existant", () => {
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
    assert.doesNotMatch(source, /service_role|SERVICE_ROLE|createAdminClient/);
    assert.deepEqual(
      [...new Set([...source.matchAll(/\.rpc\(\s*"(\w+)"/g)].map((m) => m[1]))].sort(),
      [
        "accepter_devis",
        "accepter_personnage_propose",
        "annuler_travail",
        "creer_devis",
        "ecarter_personnage_propose",
        "ecarter_proposition",
      ],
    );
  });
});

describe("Personnages proposés : page et encart", () => {
  const page = lire(`${DOSSIER}/[etape]/page.tsx`);
  const encart = lire(`${DOSSIER}/personnages-proposes.tsx`);

  it("la page ne monte l'encart que dans l'étape des personnages, derrière le contrôle d'accès", () => {
    assert.ok(page.indexOf("notFound();") < page.indexOf("<Personnages"));
    assert.match(page, /acces !== "owner" && acces !== "editor"/);
    const liste = page.slice(page.indexOf("async function Personnages("));
    assert.match(liste, /<PersonnagesProposes/);
    assert.equal(page.split("<PersonnagesProposes").length - 1, 1);
    assert.match(
      liste,
      /<RafraichissementPropositions\s+actif=\{assistant\.etape\.etape === "en_attente" \|\| assistant\.etape\.etape === "en_cours"\}/,
    );
  });

  it("la page lit la dernière tâche de personnages et ses lignes, bornées", () => {
    const lecture = page.slice(page.indexOf("async function lireAssistant("));
    assert.match(lecture, /\.eq\("action", LIVRABLE_PERSONNAGES\.action\)/);
    assert.match(lecture, /etapeProposition\(tache, proposition\)/);
    assert.match(lecture, /\.from\("ai_suggestion_characters"\)/);
    assert.match(lecture, /\.limit\(LIVRABLE_PERSONNAGES\.lignesMax\)/);
    assert.equal(lecture.match(/\.limit\(/g).length, 2);
  });

  it("l'encart est client, et n'affiche le texte venu du modèle que comme du texte", () => {
    assert.ok(encart.startsWith('"use client";'));
    assert.doesNotMatch(encart, /dangerouslySetInnerHTML|innerHTML/);
    assert.match(encart, /\{personnage\.name\}/);
    assert.match(encart, /\{personnage\.description\}/);
    assert.doesNotMatch(encart, /supabase|createClient/);
  });

  it("l'encart dit l'avertissement, signale un homonyme sans rien refuser, et confirme « tout accepter »", () => {
    assert.match(encart, /\{LIVRABLE_PERSONNAGES\.avertissement\}/);
    assert.match(encart, /dejaLa\.has\(cleDeNom\(personnage\.name\)\)/);
    assert.match(encart, /sans toucher au premier/);
    assert.match(encart, /Aucun n&apos;entre au projet sans votre accord/);
    // Deux clics pour tout accepter : le second nomme ce qui va entrer.
    assert.match(encart, /setConfirmation\(true\)/);
    assert.match(encart, /`Ajouter \$\{nombrePersonnages\(bilan\.enAttente\)\} au projet`/);
    // Chaque bouton d'une ligne nomme son personnage pour un lecteur d'écran.
    assert.equal(encart.split('<span className="sr-only"> {personnage.name}</span>').length - 1, 3);
  });

  it("la correction reprend les bornes d'un personnage saisi", () => {
    assert.match(encart, /maxLength=\{LONGUEURS_PERSONNAGE\.name\}/);
    assert.match(encart, /maxLength=\{LONGUEURS_PERSONNAGE\.description\}/);
    assert.match(encart, /Object\.entries\(ROLES_PERSONNAGE\)/);
    // Chaque champ a son libellé, relié par son identifiant.
    for (const champ of ["nom", "role", "description"]) {
      assert.ok(encart.includes(`htmlFor={\`\${id}-${champ}\`}`), champ);
      assert.ok(encart.includes(`id={\`\${id}-${champ}\`}`), champ);
    }
  });
});
