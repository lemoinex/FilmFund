/**
 * Écran de la recherche (lot L2) : ce que l'écran annonce et compte, et ce que
 * ses actions serveur vérifient.
 *
 * Importe directement les modules TypeScript (types retirés par Node).
 * Modules purs : ni base, ni serveur. Les actions serveur, la page et les
 * composants sont lus comme du texte : leur parcours complet se vérifie par
 * le contrôle de rendu, et les droits eux-mêmes par les tests de la base et
 * du worker (tests/worker-scout.test.mjs).
 *
 * AUCUN APPEL ici, ni à un moteur de recherche, ni à un fournisseur d'IA.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { ongletsDuProjet } from "../src/lib/onglets-projet.ts";
import {
  bilanSources,
  estActionIa,
  estActionStructuree,
  lireQuestion,
  LIVRABLE_RECHERCHE,
  nombreSources,
  segmentsSynthese,
} from "../src/lib/propositions.ts";
import { PROFIL_RECHERCHE, PROFILS_SCOUT } from "../worker/src/ia/profils.ts";

const DOSSIER = "src/app/(app)/projets/[id]/recherche";
const MIGRATION = "supabase/migrations/20261006180000_scout_recherche.sql";
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const sansCommentaires = (source) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("Recherche : catalogue, question et synthèse", () => {
  it("l'écran propose exactement ce que SCOUT sait produire, aux bornes de la base", () => {
    assert.deepEqual(Object.keys(PROFILS_SCOUT), [LIVRABLE_RECHERCHE.action]);
    // Tenu à part des textes et des livrables structurés.
    assert.equal(estActionIa(LIVRABLE_RECHERCHE.action), false);
    assert.equal(estActionStructuree(LIVRABLE_RECHERCHE.action), false);

    const migration = lire(MIGRATION);
    const bornes = /char_length\(btrim\(v_question\)\) not between (\d+) and (\d+)/.exec(migration);
    assert.deepEqual(
      [Number(bornes[1]), Number(bornes[2])],
      [LIVRABLE_RECHERCHE.questionMin, LIVRABLE_RECHERCHE.questionMax],
    );
    const sources = /v_nombre not between 1 and (\d+)/.exec(migration);
    assert.equal(Number(sources[1]), LIVRABLE_RECHERCHE.sourcesMax);
    assert.ok(PROFIL_RECHERCHE.collecte.resultatsMax <= LIVRABLE_RECHERCHE.sourcesMax);
  });

  it("dit ce qui quitte la plateforme, et que rien n'est vérifié", () => {
    assert.match(LIVRABLE_RECHERCHE.transmission, /Votre question, et elle seule/);
    assert.match(LIVRABLE_RECHERCHE.transmission, /moteur de recherche externe/);
    assert.match(LIVRABLE_RECHERCHE.transmission, /rien de confidentiel/);
    assert.match(LIVRABLE_RECHERCHE.transmission, /Rien d'autre du projet/);
    assert.match(LIVRABLE_RECHERCHE.avertissement, /Aucune de ces sources n'a été vérifiée/);
    assert.match(
      LIVRABLE_RECHERCHE.avertissement,
      /une source citée n'est pas une source vérifiée/,
    );
    // Les deux formulations du dépôt pour l'absence : celle-ci, mot pour mot.
    assert.equal(
      LIVRABLE_RECHERCHE.introuvable,
      "Information non trouvée dans la source consultée.",
    );
    // Aucune promesse que l'écran ne tient pas.
    for (const texte of Object.values(LIVRABLE_RECHERCHE).filter((v) => typeof v === "string")) {
      assert.doesNotMatch(texte, /fiable|garanti|certifi|exhausti|officiel/i, texte);
    }
  });

  it("lit une question sur une ligne, dans ses bornes, et refuse le reste", () => {
    assert.equal(
      lireQuestion("  Quels fonds soutiennent\n un premier   long métrage ?  "),
      "Quels fonds soutiennent un premier long métrage ?",
    );
    assert.equal(lireQuestion("a".repeat(10)), "a".repeat(10));
    assert.equal(lireQuestion("a".repeat(500)), "a".repeat(500));
    for (const [raison, valeur] of [
      ["trop courte", "Fonds ?"],
      ["trop longue", "a".repeat(501)],
      ["vide", "    "],
      ["pas un texte", 12345678901],
      ["absente", undefined],
      ["objet", { question: "Quels fonds existent ?" }],
      ["caractère de contrôle", "Quels fonds\u0007 existent pour ce film ?"],
    ]) {
      assert.equal(lireQuestion(valeur), null, raison);
    }
  });

  it("compte et accorde les sources", () => {
    assert.deepEqual(
      bilanSources([
        { state: "proposed" },
        { state: "proposed" },
        { state: "accepted" },
        { state: "dismissed" },
      ]),
      { enAttente: 2, retenues: 1, ecartees: 1 },
    );
    assert.deepEqual(bilanSources([]), { enAttente: 0, retenues: 0, ecartees: 0 });
    assert.equal(nombreSources(1), "1 source");
    assert.equal(nombreSources(12), "12 sources");
  });

  it("découpe la synthèse en texte et en renvois, sans lier ce qui n'est pas une source", () => {
    assert.deepEqual(segmentsSynthese("Un fonds existe [1]. Un autre aussi [2][3].", 3), [
      { texte: "Un fonds existe " },
      { renvoi: 1 },
      { texte: ". Un autre aussi " },
      { renvoi: 2 },
      { renvoi: 3 },
      { texte: "." },
    ]);
    // Hors de la collecte, un numéro reste du texte : aucun lien vers rien.
    assert.deepEqual(segmentsSynthese("Voir [0], [4] et [1].", 3), [
      { texte: "Voir [0], [4] et " },
      { renvoi: 1 },
      { texte: "." },
    ]);
    assert.deepEqual(segmentsSynthese("Aucun renvoi.", 3), [{ texte: "Aucun renvoi." }]);
    assert.deepEqual(segmentsSynthese("", 3), []);
    // Le texte est rendu tel quel : rien n'y est interprété.
    const piege = "Texte <script>alert(1)</script> et [lien](https://x.example.org) [1]";
    assert.equal(
      segmentsSynthese(piege, 1)
        .map((s) => ("texte" in s ? s.texte : `[${s.renvoi}]`))
        .join(""),
      piege,
    );
  });

  it("la rubrique « Recherche » est proposée à toute l'équipe, après les documents", () => {
    for (const budget of [true, false]) {
      const cles = ongletsDuProjet("p", { budget }).map((onglet) => onglet.cle);
      assert.equal(cles[cles.indexOf("documents") + 1], "recherche");
    }
    const onglet = ongletsDuProjet("p", { budget: false }).find((o) => o.cle === "recherche");
    assert.deepEqual(onglet, {
      cle: "recherche",
      libelle: "Recherche",
      href: "/projets/p/recherche",
    });
  });
});

describe("Recherche : actions serveur", () => {
  const source = sansCommentaires(lire(`${DOSSIER}/actions-ia.ts`));
  const fonctions = source.split("\nexport async function ").slice(1);
  const corps = (nom) => {
    const trouve = fonctions.find((f) => f.startsWith(`${nom}(`));
    assert.ok(trouve, `${nom} introuvable`);
    return trouve;
  };

  it("les six actions attendues, et rien d'autre", () => {
    assert.deepEqual(
      fonctions.map((f) => f.slice(0, f.indexOf("("))),
      [
        "demanderDevisRecherche",
        "lancerRecherche",
        "annulerRecherche",
        "retenirSource",
        "ecarterSource",
        "ecarterSourcesRestantes",
      ],
    );
    assert.match(source, /^"use server";/);
  });

  it("chaque action contrôle chacun de ses identifiants et exige une session avant d'appeler la base", () => {
    for (const fonction of fonctions) {
      const nom = fonction.slice(0, fonction.indexOf("("));
      const signature = fonction.slice(fonction.indexOf("(") + 1, fonction.indexOf("): Promise"));
      const identifiants = [...signature.matchAll(/(\w+(?:Id)|cle): string/g)].map((m) => m[1]);
      assert.ok(identifiants.length >= 1, nom);
      for (const identifiant of identifiants) {
        assert.match(
          fonction,
          new RegExp(`!UUID\\.test\\(${identifiant}\\)`),
          `${nom} ${identifiant}`,
        );
      }
      const garde = fonction.indexOf("const acces = await session();");
      const appel = fonction.search(/acces\.supabase\.(rpc|from)\(/);
      assert.ok(garde >= 0 && appel > garde, `${nom} : session avant la base`);
      assert.match(fonction, /if \("erreur" in acces\) \{\s+return acces;/, nom);
    }
  });

  it("le navigateur pose une question ; il ne choisit ni l'action, ni le moteur, ni le nombre de pages", () => {
    const devis = corps("demanderDevisRecherche");
    assert.match(devis, /const question = lireQuestion\(saisie\);\s+if \(question === null\) \{/);
    assert.match(devis, /p_action: ACTION,\s+p_params: \{ question \},/);
    // La question contrôlée est rendue à l'écran, qui la remontre avant l'envoi.
    assert.match(devis, /return \{\s+question,\s+devis: \{/);
    assert.match(source, /const ACTION = LIVRABLE_RECHERCHE\.action;/);
    assert.doesNotMatch(source, /max_results|resultatsMax|modele|model:|perplexity|profil/i);
  });

  it("une source se retient telle que collectée : aucune correction, aucun statut", () => {
    const retenir = corps("retenirSource");
    assert.match(retenir, /rpc\("accepter_source_proposee", \{\s+p_line_id: sourceId,\s+\}\)/);
    assert.match(
      corps("ecarterSource"),
      /rpc\("ecarter_source_proposee", \{\s+p_line_id: sourceId,\s+\}\)/,
    );
    assert.match(
      corps("ecarterSourcesRestantes"),
      /rpc\("ecarter_proposition", \{\s+p_suggestion_id: propositionId,\s+\}\)/,
    );
    assert.doesNotMatch(source, /status|verifie|p_corrige/);
  });

  it("aucune action n'appelle un fournisseur, ni ne lit une clé, ni n'écrit sans passer par une fonction", () => {
    assert.doesNotMatch(source, /fetch\(|process\.env|cle_fournisseur|api\.perplexity|anthropic/i);
    assert.doesNotMatch(source, /\.from\(/);
    assert.doesNotMatch(source, /\.(insert|update|delete|upsert)\(/);
  });

  it("retirer une source est la seule écriture directe, bornée au projet et sous session", () => {
    const retrait = sansCommentaires(lire(`${DOSSIER}/actions.ts`));
    assert.match(retrait, /if \(!UUID\.test\(projetId\) \|\| !UUID\.test\(sourceId\)\) return;/);
    assert.match(retrait, /if \("erreur" in \(await exigerAcces\(supabase\)\)\) \{\s+return;/);
    assert.match(
      retrait,
      /from\("project_sources"\)\.delete\(\)\.eq\("id", sourceId\)\.eq\("project_id", projetId\)/,
    );
    assert.doesNotMatch(retrait, /\.(insert|update|upsert)\(|rpc\(/);
    assert.ok(
      retrait.indexOf("exigerAcces(supabase)") < retrait.indexOf('.from("project_sources")'),
    );
  });
});

describe("Recherche : page et composants", () => {
  const page = lire(`${DOSSIER}/page.tsx`);
  const pageNue = sansCommentaires(page);
  const composants = lire(`${DOSSIER}/recherche.tsx`);
  const composantsNus = sansCommentaires(composants);

  it("la page est un composant serveur ; seuls les boutons sont côté navigateur", () => {
    assert.doesNotMatch(page, /^"use client";/);
    assert.match(composants, /^"use client";/);
    assert.match(pageNue, /robots: \{ index: false, follow: false \}/);
    assert.equal(pageNue.match(/<RafraichissementPropositions/g)?.length, 1);
  });

  it("qui écrit le projet demande et décide ; un lecteur lit, sans suivre la demande", () => {
    // Le formulaire et le suivi : à qui écrit le projet seulement.
    assert.match(
      pageNue,
      /\{peutDecider \? \(\s+<>\s+<RafraichissementPropositions[\s\S]*?<DemandeRecherche[\s\S]*?<\/>\s+\) : null\}/,
    );
    // La tâche — et la question qu'elle porte — ne se lit que de qui la suit.
    assert.match(
      pageNue,
      /if \(peutDecider\) \{\s+const \{ data: tache \} = await supabase\s+\.from\("jobs"\)/,
    );
    assert.match(
      pageNue,
      /peutDecider\s+\? supabase\.from\("jobs"\)\.select\("params"\)\.eq\("id", proposition\.job_id\)\.maybeSingle\(\)\s+: Promise\.resolve\(\{ data: null \}\)/,
    );
    // Les boutons de décision : une source en attente, et le droit d'en décider.
    assert.match(pageNue, /\{source\.state === "proposed" && peutDecider \? \(\s+<DecisionSource/);
    assert.match(
      pageNue,
      /Seuls le porteur et les éditeurs du projet décident des sources proposées\./,
    );
    assert.match(
      pageNue,
      /\{peutDecider \? \(\s+<div className="mt-3">\s+<BoutonConfirme\s+action=\{supprimerSource\}/,
    );
  });

  it("les lectures sont bornées et filtrées par projet", () => {
    assert.match(
      pageNue,
      /\.eq\("project_id", id\)\s+\.order\("created_at", \{ ascending: false \}\)\s+\.limit\(SOURCES_RETENUES_MAX\)/,
    );
    assert.match(
      pageNue,
      /\.eq\("suggestion_id", proposition\.id\)\s+\.order\("position"\)\s+\.limit\(LIVRABLE_RECHERCHE\.sourcesMax\)/,
    );
    assert.match(
      pageNue,
      /\.eq\("project_id", projetId\)\s+\.eq\("action", LIVRABLE_RECHERCHE\.action\)/,
    );
    // Aucune borne écrite en dur dans les composants.
    assert.doesNotMatch(composantsNus, /minLength=\{\d|maxLength=\{\d/);
    assert.match(composantsNus, /minLength=\{LIVRABLE_RECHERCHE\.questionMin\}/);
    assert.match(composantsNus, /maxLength=\{LIVRABLE_RECHERCHE\.questionMax\}/);
  });

  it("avant tout envoi, l'écran dit ce qui part et remontre la question telle qu'elle partira", () => {
    // Sous le champ, puis de nouveau avant la confirmation.
    assert.equal(composantsNus.match(/\{LIVRABLE_RECHERCHE\.transmission\}/g)?.length, 2);
    assert.match(composantsNus, /aria-describedby=\{`\$\{champ\}-aide`\}/);
    assert.match(composantsNus, /La question qui sera transmise/);
    assert.match(composantsNus, /\{demande\.question\}/);
    // Rien ne part sans le second geste : le devis d'abord, la confirmation ensuite.
    assert.match(
      composantsNus,
      /onSubmit=\{\(evenement\) => \{\s+evenement\.preventDefault\(\);\s+obtenirDevis\(\);/,
    );
    assert.match(
      composantsNus,
      /\(\) => lancerRecherche\(projetId, demande\.devis\.id, demande\.cle\)/,
    );
    assert.match(composantsNus, /setDemande\(\{ \.\.\.resultat, cle: crypto\.randomUUID\(\) \}\)/);
  });

  it("l'avertissement accompagne la synthèse comme les sources retenues, et rien ne se dit vérifié par la plateforme", () => {
    assert.equal(pageNue.match(/\{LIVRABLE_RECHERCHE\.avertissement\}/g)?.length, 2);
    assert.ok(
      pageNue.indexOf("{LIVRABLE_RECHERCHE.avertissement}") < pageNue.indexOf("Synthèse</h3>"),
      "l'avertissement précède la synthèse",
    );
    assert.match(pageNue, /non_verifie: "Non vérifiée",/);
    assert.match(pageNue, /mention=\{STATUTS\[source\.status\] \?\? source\.status\}/);
    // Collecte et question : la provenance de chaque source retenue.
    assert.match(
      pageNue,
      /Collectée le \{enJour\(source\.collected_at\)\}, pour la question « \{source\.question\}/,
    );
    assert.match(pageNue, /publiee \? `datée du \$\{enJour\(publiee\)\}` : "date non indiquée"/);
    // L'hôte est un site, pas un organisme : l'écran ne le présente pas autrement.
    assert.doesNotMatch(pageNue, /organisme|Organisme/);
  });

  it("« non trouvée » ne se dit que si le moteur n'a rien rendu, pas pour une panne", () => {
    assert.match(
      pageNue,
      /sansSource = etape\.etape === "echec" && \/\^Aucune source exploitable\/\.test\(tache\?\.reason \?\? ""\);/,
    );
    // Le motif attendu est bien celui que le worker inscrit.
    assert.match(
      lire("worker/src/agents/scout.ts"),
      /new EchecConnu\("Aucune source exploitable n'a été trouvée pour cette question\."\)/,
    );
    assert.match(composantsNus, /\{sansSource\s+\? `\$\{LIVRABLE_RECHERCHE\.introuvable\} /);
    assert.match(composantsNus, /: "La dernière recherche n'a pas abouti\."\}/);
  });

  it("textes venus du web : affichés comme du texte ; liens ouverts à part, sans rien transmettre", () => {
    for (const source of [pageNue, composantsNus]) {
      assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|eval\(/);
    }
    // Un seul lien sortant, vers l'adresse collectée, avec ses trois gardes.
    assert.equal(pageNue.match(/target="_blank"/g)?.length, 1);
    assert.match(
      pageNue,
      /<a\s+href=\{adresse\}\s+target="_blank"\s+rel="noopener noreferrer nofollow"/,
    );
    // Les renvois de la synthèse mènent à la source de la page, jamais ailleurs.
    assert.match(pageNue, /href=\{`#source-\$\{segment\.renvoi\}`\}/);
    assert.match(pageNue, /id=\{`source-\$\{source\.position\}`\}/);
    assert.match(pageNue, /segmentsSynthese\(recherche\.synthese, recherche\.sources\.length\)/);
    // Équivalents accessibles : le lien dit où il mène, les boutons quelle source.
    assert.match(pageNue, /dans un nouvel onglet/);
    assert.match(composantsNus, /<span className="sr-only"> la source \{numero\}<\/span>/);
  });
});
