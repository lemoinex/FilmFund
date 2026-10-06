/**
 * BOARD (lot K1) : la vignette proposée d'une scène, de la tâche réclamée à
 * l'image rattachée à sa scène, contre la base locale et sous le rôle du
 * worker.
 *
 * AUCUN APPEL PAYANT, AUCUNE IMAGE RÉELLE ici : le FOURNISSEUR D'IMAGES EST
 * FACTICE, désigné comme tel, et rend un PNG d'un pixel écrit par le test.
 * Il ne prouve ni que l'agent fonctionne avec OpenAI, ni que l'image rendue
 * est un croquis à l'encre noire — rien ne vérifie un dessin par programme —,
 * ni ce que coûte une vignette : cela se juge en recette, à l'œil, dans le
 * budget autorisé.
 */
import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import {
  composerConsigne,
  estVignetteValide,
  executeursBoard,
  TAILLE_MAX_IMAGE,
} from "../worker/src/agents/board.ts";
import { traiterUnTravail } from "../worker/src/boucle.ts";
import { EchecConnu } from "../worker/src/executeurs.ts";
import { creerFournisseurImagesOpenAI } from "../worker/src/ia/passerelle.ts";
import {
  coutMicroDollars,
  PROFIL_VIGNETTE,
  PROFILS_BOARD,
  PROFILS_FIELD,
  PROFILS_FRAME,
  PROFILS_GEAR,
  PROFILS_IA,
} from "../worker/src/ia/profils.ts";
import { registreDesAgents } from "../worker/src/registre.ts";
import {
  annulerLesAutresTaches,
  creerCompte,
  creerProjet,
  definirCleFactice,
  definirPlafondIa,
  engager,
  executerSqlLocal as sql,
  faireEntrer,
  ouvrirBaseDuWorker,
  promouvoirAdministrateur,
} from "./helpers.mjs";

const MODELE = PROFIL_VIGNETTE.modele;

/** Un PNG d'un pixel : le plus petit fichier que la base accepte comme vignette. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** Réponse d'un fournisseur d'images factice : le fichier donné, facturé 400 jetons en entrée et 5 000 en sortie. */
function reponseFactice(image = PNG, usages) {
  return {
    image,
    modeleServi: MODELE,
    usages:
      usages === undefined ? [{ modele: MODELE, jetonsEntree: 400, jetonsSortie: 5000 }] : usages,
  };
}

/** Fournisseur d'images factice : rejoue les réponses données, et note ce qu'on lui demande. */
function fournisseurFactice(...reponses) {
  const demandes = [];
  const fournisseur = async (demande) => {
    demandes.push(demande);
    const reponse = reponses[Math.min(demandes.length, reponses.length) - 1];
    if (reponse instanceof Error) {
      throw reponse;
    }
    return reponse;
  };
  return { fournisseur, demandes };
}

const CONTEXTE = {
  action: "storyboard_image",
  projet: { format: "long_metrage", genre: "drame", vision: "Lumière naturelle, plans patients." },
  scene: {
    titre: "Le départ",
    decor: "ext",
    lieu: "Berge",
    moment: "aube",
    cadrage: "plan_large",
    description: "Awa pousse sa pirogue à l'eau.",
  },
  plans: [{ cadrage: "gros_plan", angle: "contre_plongee", description: "Le visage d'Awa." }],
};

describe("BOARD : le profil et la consigne", () => {
  it("impose le croquis à l'encre noire sur fond blanc, et interdit tout le reste", () => {
    assert.equal(PROFIL_VIGNETTE.id, "board.vignette@1");
    assert.equal(PROFIL_VIGNETTE.fournisseur, "openai");
    assert.match(
      PROFIL_VIGNETTE.style,
      /croquis dessiné à la main, à l'encre noire sur fond blanc/,
    );
    assert.match(PROFIL_VIGNETTE.style, /Trait noir uniquement/);
    for (const interdit of [
      /noir et blanc uniquement, aucune couleur/,
      /Aucun photoréalisme/,
      /aucun rendu 3D/,
      /aucune peinture numérique/,
      /Aucun texte, aucune lettre, aucun chiffre/,
      /aucune personne réelle ni aucune marque/,
    ]) {
      assert.match(PROFIL_VIGNETTE.interdits, interdit);
    }
    // Aucun mot qui ouvrirait la porte à la couleur ou au réalisme.
    const consignes = `${PROFIL_VIGNETTE.style} ${PROFIL_VIGNETTE.interdits}`;
    assert.doesNotMatch(
      consignes,
      /aquarelle|coloré|couleurs vives|photographi(e|que) réaliste|cinématique/i,
    );
  });

  it("ouvre la demande par le style et la ferme par les interdits, la scène entre les deux", () => {
    const consigne = composerConsigne(CONTEXTE, PROFIL_VIGNETTE);
    assert.ok(consigne.startsWith(PROFIL_VIGNETTE.style));
    assert.ok(consigne.endsWith(PROFIL_VIGNETTE.interdits));
    assert.match(consigne, /Intitulé : Le départ/);
    assert.match(consigne, /Décor : ext/);
    assert.match(consigne, /Cadrage principal : plan large/);
    assert.match(consigne, /Ce que l'on voit : Awa pousse sa pirogue à l'eau\./);
    assert.match(consigne, /- gros plan, contre plongee : Le visage d'Awa\./);
    assert.match(consigne, /Vision artistique : Lumière naturelle, plans patients\./);
  });

  it("borne la vision artistique, et dit ce qui manque plutôt que de laisser un vide", () => {
    const longue = composerConsigne(
      { ...CONTEXTE, projet: { ...CONTEXTE.projet, vision: "v".repeat(5000) } },
      PROFIL_VIGNETTE,
    );
    assert.equal(longue.match(/v{1500,}/)[0].length, 1500);

    const pauvre = composerConsigne(
      {
        ...CONTEXTE,
        projet: { format: "court_metrage", genre: null, vision: "" },
        scene: { ...CONTEXTE.scene, lieu: " ", cadrage: null, description: "" },
        plans: [],
      },
      PROFIL_VIGNETTE,
    );
    assert.match(pauvre, /Lieu : \(non renseigné\)/);
    assert.match(pauvre, /Cadrage principal : \(non renseigné\)/);
    assert.match(pauvre, /<plans>\n\(aucun plan décrit\)/);
  });

  it("le tarif du modèle d'image est connu, et son action n'appartient à aucun autre agent", () => {
    // 400 jetons de consigne à 5 $ le million, 5 000 jetons d'image à 30 $.
    assert.equal(
      coutMicroDollars([{ modele: MODELE, jetonsEntree: 400, jetonsSortie: 5000 }]),
      400 * 5 + 5000 * 30,
    );
    assert.deepEqual(Object.keys(PROFILS_BOARD), ["storyboard_image"]);
    for (const autres of [PROFILS_IA, PROFILS_FIELD, PROFILS_FRAME, PROFILS_GEAR]) {
      assert.ok(!("storyboard_image" in autres));
    }
    assert.ok(PROFIL_VIGNETTE.jetonsImageMax > 0);
  });

  it("ne tient pour vignette qu'un PNG dans les bornes de la base", () => {
    assert.equal(estVignetteValide(PNG), true);
    assert.equal(estVignetteValide(Buffer.from("%PDF-1.7 pas une image")), false);
    assert.equal(estVignetteValide(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0])), false);
    assert.equal(estVignetteValide(PNG.subarray(0, 4)), false);
    assert.equal(estVignetteValide(Buffer.alloc(0)), false);
    const lourde = Buffer.concat([PNG, Buffer.alloc(TAILLE_MAX_IMAGE)]);
    assert.equal(estVignetteValide(lourde), false);
  });
});

describe("BOARD : la passerelle vers le fournisseur d'images", () => {
  const fetchReel = globalThis.fetch;
  let appels;

  /** Remplace `fetch` le temps d'un test : AUCUNE REQUÊTE NE SORT. */
  function simuler(reponse) {
    appels = [];
    globalThis.fetch = async (url, options) => {
      appels.push({ url: String(url), options });
      if (reponse instanceof Error) {
        throw reponse;
      }
      return reponse;
    };
  }
  const json = (corps, init) =>
    new Response(JSON.stringify(corps), {
      status: 200,
      headers: { "content-type": "application/json" },
      ...init,
    });

  after(() => {
    globalThis.fetch = fetchReel;
  });

  const demander = (cle = "sk-factice-openai-aaaaaaaaaaaa") =>
    creerFournisseurImagesOpenAI(cle)(
      { profil: PROFIL_VIGNETTE, consigne: "Un croquis." },
      new AbortController().signal,
    );

  it("une seule requête, vers une seule adresse, avec les seuls paramètres du profil", async () => {
    simuler(
      json({
        data: [{ b64_json: PNG.toString("base64") }],
        usage: { input_tokens: 12, output_tokens: 3400 },
      }),
    );
    const reponse = await demander();

    assert.equal(appels.length, 1);
    assert.equal(appels[0].url, "https://api.openai.com/v1/images/generations");
    assert.equal(appels[0].options.method, "POST");
    // Aucune redirection suivie : la clé ne part vers aucune autre adresse.
    assert.equal(appels[0].options.redirect, "error");
    assert.deepEqual(JSON.parse(appels[0].options.body), {
      model: PROFIL_VIGNETTE.modele,
      prompt: "Un croquis.",
      n: 1,
      size: PROFIL_VIGNETTE.taille,
      quality: PROFIL_VIGNETTE.qualite,
      output_format: "png",
      background: "opaque",
    });
    assert.equal(appels[0].options.headers.authorization, "Bearer sk-factice-openai-aaaaaaaaaaaa");

    assert.ok(reponse.image.equals(PNG));
    assert.deepEqual(reponse.usages, [
      { modele: PROFIL_VIGNETTE.modele, jetonsEntree: 12, jetonsSortie: 3400 },
    ]);
  });

  it("sans usage rapporté, le coût est laissé à rapprocher plutôt qu'inventé", async () => {
    simuler(json({ data: [{ b64_json: PNG.toString("base64") }] }));
    assert.equal((await demander()).usages, null);
  });

  it("une requête refusée est un échec connu, sans frais ; une erreur du serveur, un échec qui peut avoir coûté", async () => {
    for (const [statut, sansFrais] of [
      [400, true],
      [401, true],
      [403, true],
      [429, false],
      [500, false],
    ]) {
      simuler(new Response('{"error":{"message":"détail du fournisseur"}}', { status: statut }));
      await assert.rejects(demander(), (erreur) => {
        assert.ok(erreur instanceof EchecConnu, String(statut));
        assert.equal(erreur.sansFrais, sansFrais, String(statut));
        // Le texte du fournisseur part au journal, jamais sur la tâche.
        assert.doesNotMatch(erreur.message, /détail du fournisseur/);
        assert.match(erreur.detail, /détail du fournisseur/);
        return true;
      });
    }
  });

  it("compte sans crédits : un 429 sans frais, dit en clair ; une limite de débit reste douteuse", async () => {
    // Le corps relevé en production le 6 octobre 2026, tel qu'OpenAI l'a rendu.
    const sansCredits = {
      error: {
        message: "You have no credits remaining. Add credits to continue using the API.",
        type: "insufficient_quota",
        param: null,
        code: "credit_balance_exhausted",
      },
    };
    for (const [raison, corps, sansFrais] of [
      ["type et code", sansCredits, true],
      ["type seul", { error: { type: "insufficient_quota" } }, true],
      ["code seul", { error: { code: "credit_balance_exhausted" } }, true],
      ["code historique", { error: { code: "insufficient_quota" } }, true],
      [
        "limite de débit",
        { error: { type: "rate_limit_error", code: "rate_limit_exceeded" } },
        false,
      ],
      // Le message ne décide de rien : seuls le type et le code sont lus.
      ["message seul", { error: { message: "insufficient_quota : no credits remaining" } }, false],
      ["corps sans erreur", { message: "insufficient_quota" }, false],
    ]) {
      simuler(new Response(JSON.stringify(corps), { status: 429 }));
      await assert.rejects(demander(), (erreur) => {
        assert.ok(erreur instanceof EchecConnu, raison);
        assert.equal(erreur.sansFrais, sansFrais, raison);
        if (sansFrais) {
          assert.match(erreur.message, /n'a plus de crédits : rien n'a été produit ni facturé/);
        } else {
          assert.equal(erreur.message, "Le fournisseur a répondu par une erreur (429).");
        }
        // Le texte du fournisseur ne passe jamais sur la tâche.
        assert.doesNotMatch(erreur.message, /credits remaining|insufficient_quota/);
        return true;
      });
    }

    // Un corps illisible ne dit rien : le doute reste, la provision aussi.
    simuler(new Response("insufficient_quota", { status: 429 }));
    await assert.rejects(demander(), (erreur) => erreur.sansFrais === false);

    // Le même corps sous un autre statut ne change pas la règle des 5xx.
    simuler(new Response(JSON.stringify(sansCredits), { status: 500 }));
    await assert.rejects(demander(), (erreur) => erreur.sansFrais === false);
  });

  it("une réponse illisible ou sans image est un échec connu ; la clé n'apparaît dans aucun message", async () => {
    for (const corps of [
      "pas du JSON",
      '{"data":[]}',
      '{"data":[{"b64_json":""}]}',
      '{"data":[{"url":"https://x"}]}',
    ]) {
      simuler(new Response(corps, { status: 200 }));
      await assert.rejects(demander(), (erreur) => {
        assert.ok(erreur instanceof EchecConnu, corps);
        assert.doesNotMatch(`${erreur.message} ${erreur.detail ?? ""}`, /sk-factice/);
        return true;
      });
    }
  });

  it("une réponse démesurée n'est pas lue", async () => {
    simuler(
      new Response("{}", { status: 200, headers: { "content-length": String(50 * 1024 * 1024) } }),
    );
    await assert.rejects(demander(), /dépasse la taille admise/);
  });

  it("une coupure reste une issue inconnue : elle remonte telle quelle, sans réessai", async () => {
    simuler(new TypeError("fetch failed"));
    await assert.rejects(demander(), (erreur) => {
      assert.ok(!(erreur instanceof EchecConnu));
      return true;
    });
    assert.equal(appels.length, 1, "aucune seconde requête");
  });
});

describe("BOARD : proposition de vignette", () => {
  let base;
  let administrateur;

  before(async () => {
    base = await ouvrirBaseDuWorker();
    administrateur = await creerCompte("admin-board", "Administration");
    await promouvoirAdministrateur(administrateur.id);
    await definirPlafondIa(1_000_000);
  });

  after(async () => {
    await definirPlafondIa(5);
    await definirCleFactice("openai", null);
    await base.end();
  });

  const options = (fournisseur) => ({
    base,
    nom: "worker-board-test",
    executeurs: executeursBoard(base, fournisseur),
    journal: () => {},
    battementMs: 50,
  });

  async function creerScene(compte, projetId, position, champs = {}) {
    const { data, error } = await compte.client
      .from("storyboard_scenes")
      .insert({
        project_id: projetId,
        position,
        title: `Scène ${position}`,
        setting: "ext",
        location: "Berge",
        time_of_day: "aube",
        created_by: compte.id,
        ...champs,
      })
      .select("id")
      .single();
    assert.ifError(error);
    return data.id;
  }

  async function lancer(porteur, projet, scene, cle) {
    const tache = await engager(porteur, projet.id, "storyboard_image", cle, { scene });
    const nettoyage = await sql(annulerLesAutresTaches([tache.id]));
    assert.equal(nettoyage.code, 0, nettoyage.erreurs);
    return tache;
  }

  /** Vignettes proposées, sans leur fichier. */
  const proposees = async (compte, projetId) => {
    const { data } = await compte.client
      .from("ai_suggestion_images")
      .select("id, scene_id, size_bytes, state, accepted_path")
      .eq("project_id", projetId)
      .order("created_at");
    return data ?? [];
  };

  /** Dépose un fichier dans le compartiment privé, comme le fera l'écran à l'acceptation. */
  async function deposer(compte, projetId, contenu = PNG) {
    const chemin = `${projetId}/scenes/${crypto.randomUUID()}.png`;
    const { error } = await compte.client.storage
      .from("project-images")
      .upload(chemin, contenu, { contentType: "image/png", upsert: false });
    assert.ifError(error);
    return chemin;
  }

  const imageDe = async (compte, scene) => {
    const { data } = await compte.client
      .from("storyboard_scenes")
      .select("image_path")
      .eq("id", scene)
      .single();
    return data.image_path;
  };

  it("le devis compte une image, sur le quota d'images, pour une scène du projet et rien d'autre", async () => {
    const porteur = await creerCompte("board-devis");
    const projet = await creerProjet(porteur, "Devis de la vignette");
    const autre = await creerProjet(porteur, "Autre projet");
    const ailleurs = await creerScene(porteur, autre.id, 1);
    const scene = await creerScene(porteur, projet.id, 1);

    for (const [raison, params] of [
      ["sans scène", {}],
      ["scène qui n'est pas un identifiant", { scene: "la première" }],
      ["scène inconnue", { scene: "00000000-0000-0000-0000-000000000000" }],
      ["scène d'un autre projet", { scene: ailleurs }],
    ]) {
      const { error } = await porteur.client.rpc("creer_devis", {
        p_project_id: projet.id,
        p_action: "storyboard_image",
        p_params: params,
      });
      assert.equal(error?.code, "22023", raison);
    }

    const { data: devis, error } = await porteur.client.rpc("creer_devis", {
      p_project_id: projet.id,
      p_action: "storyboard_image",
      // Le navigateur ne choisit pas le nombre d'images : la base en compte une.
      p_params: { scene, count: 50 },
    });
    assert.ifError(error);
    assert.equal(devis[0].quantity, 1);
    assert.equal(devis[0].unit, "image");
  });

  it("de la demande à la scène : dépôt, lecture par l'équipe, acceptation explicite, ancienne image rendue", async () => {
    const porteur = await creerCompte("board-chemin");
    const projet = await creerProjet(porteur, "Le Fleuve immobile");
    const lecteur = await creerCompte("board-chemin-lecteur");
    await faireEntrer(porteur, projet.id, lecteur, "viewer");
    const etranger = await creerCompte("board-chemin-etranger");

    await porteur.client
      .from("projects")
      .update({ genre: "drame", artistic_vision: "Lumière naturelle." })
      .eq("id", projet.id);
    const scene = await creerScene(porteur, projet.id, 1, {
      title: "Le départ",
      shot: "plan_large",
      description: "Awa pousse sa pirogue à l'eau.",
    });
    await porteur.client.from("scene_shots").insert({
      project_id: projet.id,
      scene_id: scene,
      position: 1,
      shot: "gros_plan",
      description: "Le visage d'Awa.",
      created_by: porteur.id,
    });
    await porteur.client.from("project_budgets").insert({ project_id: projet.id, currency: "XAF" });
    await porteur.client.from("project_documents").insert({
      project_id: projet.id,
      type: "scenario",
      title: "Scénario",
      content: "SCÉNARIO CONFIDENTIEL",
      created_by: porteur.id,
    });

    // La scène porte déjà une image : elle ne doit pas être remplacée sans accord.
    const ancienne = await deposer(porteur, projet.id);
    await porteur.client.from("storyboard_scenes").update({ image_path: ancienne }).eq("id", scene);

    const tache = await lancer(porteur, projet, scene, "board-chemin-cle");
    const { fournisseur, demandes } = fournisseurFactice(reponseFactice());
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    // Le profil de la vignette, sa consigne de style, la scène — ni scénario, ni budget.
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].profil.id, PROFIL_VIGNETTE.id);
    assert.ok(demandes[0].consigne.startsWith(PROFIL_VIGNETTE.style));
    assert.ok(demandes[0].consigne.endsWith(PROFIL_VIGNETTE.interdits));
    assert.match(demandes[0].consigne, /Intitulé : Le départ/);
    assert.match(demandes[0].consigne, /Le visage d'Awa\./);
    assert.match(demandes[0].consigne, /Vision artistique : Lumière naturelle\./);
    assert.doesNotMatch(demandes[0].consigne, /XAF|SCÉNARIO CONFIDENTIEL/);

    // Le coût confirmé vient de l'usage rapporté, au tarif du modèle d'image.
    const { rows: cout } = await sql(
      `select row_to_json(x) from (select c.provider, c.profile, c.estimated_output_tokens, s.model, s.input_tokens, s.output_tokens, s.usd::text
         from public.provider_charges c join public.provider_charge_settlements s using (attempt_id)
         where c.job_id = '${tache.id}') x;`,
    ).then((r) => ({ rows: [JSON.parse(r.sortie.trim())] }));
    assert.deepEqual(cout[0], {
      provider: "openai",
      profile: PROFIL_VIGNETTE.id,
      estimated_output_tokens: PROFIL_VIGNETTE.jetonsImageMax,
      model: MODELE,
      input_tokens: 400,
      output_tokens: 5000,
      usd: "0.152000",
    });

    // Le texte parent est écrit par la base ; la vignette est celle du fournisseur.
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id, content, state, profile")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.content, "Vignette proposée par l'assistant pour une scène.");
    assert.equal(proposition.profile, PROFIL_VIGNETTE.id);

    const [vignette] = await proposees(porteur, projet.id);
    assert.deepEqual(
      { scene: vignette.scene_id, octets: vignette.size_bytes, etat: vignette.state },
      { scene, octets: PNG.length, etat: "proposed" },
    );
    const { data: fichier } = await porteur.client
      .from("ai_suggestion_images")
      .select("file")
      .eq("id", vignette.id)
      .single();
    assert.ok(Buffer.from(fichier.file.slice(2), "hex").equals(PNG));

    // Le storyboard se lit de toute l'équipe : sa vignette proposée aussi. Pas d'un étranger.
    assert.equal((await proposees(lecteur, projet.id)).length, 1);
    assert.equal((await proposees(etranger, projet.id)).length, 0);

    // Tant que rien n'est accepté, la scène garde son image.
    assert.equal(await imageDe(porteur, scene), ancienne);

    // Décider reste à qui écrit le storyboard : ni lecteur, ni étranger.
    const nouvelle = await deposer(porteur, projet.id);
    for (const compte of [lecteur, etranger]) {
      const { error } = await compte.client.rpc("accepter_image_proposee", {
        p_image_id: vignette.id,
        p_path: nouvelle,
      });
      assert.equal(error?.code, "42501");
      const { error: ecart } = await compte.client.rpc("ecarter_image_proposee", {
        p_image_id: vignette.id,
      });
      assert.equal(ecart?.code, "42501");
    }

    // Aucune écriture directe : la table ne se modifie que par ses fonctions.
    const { error: direct } = await porteur.client
      .from("ai_suggestion_images")
      .update({ state: "accepted" })
      .eq("id", vignette.id);
    assert.ok(direct, "une mise à jour directe doit être refusée");

    // Un chemin d'un autre projet, un chemin sans fichier, un chemin qui sort du dossier : refusés.
    const autre = await creerProjet(porteur, "Autre projet");
    const ailleurs = await deposer(porteur, autre.id);
    for (const [raison, chemin] of [
      ["fichier d'un autre projet", ailleurs],
      ["aucun fichier à ce chemin", `${projet.id}/scenes/${crypto.randomUUID()}.png`],
      ["chemin qui remonte", `${projet.id}/scenes/../../${autre.id}/scenes/x.png`],
      ["chemin hors des scènes", `${projet.id}/couverture.png`],
    ]) {
      const { error } = await porteur.client.rpc("accepter_image_proposee", {
        p_image_id: vignette.id,
        p_path: chemin,
      });
      assert.equal(error?.code, "22023", raison);
    }
    assert.equal(await imageDe(porteur, scene), ancienne, "la scène n'a pas bougé");

    // Acceptation explicite : la scène change d'image, et l'ancienne est rendue pour être supprimée.
    const { data: rendue, error: accord } = await porteur.client.rpc("accepter_image_proposee", {
      p_image_id: vignette.id,
      p_path: nouvelle,
    });
    assert.ifError(accord);
    assert.equal(rendue, ancienne);
    assert.equal(await imageDe(lecteur, scene), nouvelle);

    const [acceptee] = await proposees(porteur, projet.id);
    assert.deepEqual(
      { etat: acceptee.state, chemin: acceptee.accepted_path },
      { etat: "accepted", chemin: nouvelle },
    );
    const { data: close } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("id", proposition.id)
      .single();
    assert.equal(close.state, "accepted");

    // Accepter deux fois ne rend rien à supprimer ; une vignette acceptée ne s'écarte plus.
    const { data: encore, error: bis } = await porteur.client.rpc("accepter_image_proposee", {
      p_image_id: vignette.id,
      p_path: nouvelle,
    });
    assert.ifError(bis);
    assert.equal(encore, null);
    const { error: tard } = await porteur.client.rpc("ecarter_image_proposee", {
      p_image_id: vignette.id,
    });
    assert.equal(tard?.code, "PR001");

    // Une unité d'image consommée, aucune unité de texte.
    const { data: travail } = await porteur.client
      .from("jobs")
      .select("state, attempts, reservation_id")
      .eq("id", tache.id)
      .single();
    assert.deepEqual([travail.state, travail.attempts], ["succeeded", 1]);
    const { data: reservation } = await porteur.client
      .from("reservations")
      .select("unit, quantity")
      .eq("id", travail.reservation_id)
      .single();
    assert.deepEqual(reservation, { unit: "image", quantity: 1 });
  });

  it("écarter la vignette laisse la scène telle qu'elle était", async () => {
    const porteur = await creerCompte("board-ecart");
    const projet = await creerProjet(porteur, "Écartée");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-ecart-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice());
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const [vignette] = await proposees(porteur, projet.id);
    const { error } = await porteur.client.rpc("ecarter_image_proposee", {
      p_image_id: vignette.id,
    });
    assert.ifError(error);

    assert.equal((await proposees(porteur, projet.id))[0].state, "dismissed");
    assert.equal(await imageDe(porteur, scene), null);
    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("state")
      .eq("job_id", tache.id)
      .single();
    assert.equal(proposition.state, "dismissed");

    // Une vignette écartée ne s'accepte plus.
    const chemin = await deposer(porteur, projet.id);
    const { error: tard } = await porteur.client.rpc("accepter_image_proposee", {
      p_image_id: vignette.id,
      p_path: chemin,
    });
    assert.equal(tard?.code, "PR001");
  });

  it("écarter la proposition d'un bloc écarte sa vignette", async () => {
    const porteur = await creerCompte("board-bloc");
    const projet = await creerProjet(porteur, "D'un bloc");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-bloc-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice());
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: proposition } = await porteur.client
      .from("ai_suggestions")
      .select("id")
      .eq("job_id", tache.id)
      .single();
    const { error } = await porteur.client.rpc("ecarter_proposition", {
      p_suggestion_id: proposition.id,
    });
    assert.ifError(error);
    assert.equal((await proposees(porteur, projet.id))[0].state, "dismissed");
  });

  it("ce que l'agent a produit ne change pas ; en mode privé, seul un administrateur décide", async () => {
    const porteur = await creerCompte("board-garde-fous");
    const projet = await creerProjet(porteur, "Garde-fous");
    const scene = await creerScene(porteur, projet.id, 1);
    await lancer(porteur, projet, scene, "board-garde-fous-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice());
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    const [vignette] = await proposees(porteur, projet.id);

    // Même l'exploitant, en SQL direct, ne remplace ni ne supprime une vignette proposée.
    for (const requete of [
      `update public.ai_suggestion_images set file = '\\x89504e470d0a1a0a00'::bytea where id = '${vignette.id}';`,
      `update public.ai_suggestion_images set scene_id = gen_random_uuid() where id = '${vignette.id}';`,
      `delete from public.ai_suggestion_images where id = '${vignette.id}';`,
    ]) {
      const resultat = await sql(requete);
      assert.notEqual(resultat.code, 0, requete);
      assert.match(resultat.erreurs, /ne change pas|ne se supprime pas/, requete);
    }

    const chemin = await deposer(porteur, projet.id);
    const modePrive = (actif) =>
      sql(`update public.app_settings set private_admin_only = ${actif} where id;`);
    try {
      assert.equal((await modePrive(true)).code, 0);

      assert.equal((await proposees(porteur, projet.id)).length, 0);
      const { error: refus } = await porteur.client.rpc("accepter_image_proposee", {
        p_image_id: vignette.id,
        p_path: chemin,
      });
      assert.equal(refus?.code, "42501");
      const { error: ecart } = await porteur.client.rpc("ecarter_image_proposee", {
        p_image_id: vignette.id,
      });
      assert.equal(ecart?.code, "42501");

      assert.equal((await proposees(administrateur, projet.id)).length, 1);
      const { error } = await administrateur.client.rpc("accepter_image_proposee", {
        p_image_id: vignette.id,
        p_path: chemin,
      });
      assert.ifError(error);
    } finally {
      assert.equal((await modePrive(false)).code, 0);
    }
    assert.equal(await imageDe(porteur, scene), chemin);
  });

  it("une scène supprimée avant l'appel : la tâche échoue, rien n'est envoyé", async () => {
    const porteur = await creerCompte("board-scene-partie");
    const projet = await creerProjet(porteur, "Scène partie");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-scene-partie-cle");
    await porteur.client.from("storyboard_scenes").delete().eq("id", scene);

    const { fournisseur, demandes } = fournisseurFactice(reponseFactice());
    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    assert.equal(demandes.length, 0, "aucun appel pour une scène qui n'existe plus");
    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state")
      .eq("id", tache.id)
      .single();
    assert.notEqual(finale.state, "succeeded");
  });

  it("un fichier qui n'est pas un PNG fait échouer la tâche : rien n'est déposé, la dépense reste inscrite", async () => {
    const porteur = await creerCompte("board-pas-png");
    const projet = await creerProjet(porteur, "Pas un PNG");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-pas-png-cle");
    const { fournisseur } = fournisseurFactice(
      reponseFactice(Buffer.from("%PDF-1.7 pas une image")),
    );

    assert.equal(await traiterUnTravail(options(fournisseur)), true);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const { data: finale } = await porteur.client
      .from("jobs")
      .select("state, reason")
      .eq("id", tache.id)
      .single();
    assert.equal(finale.state, "failed");
    assert.match(finale.reason, /image exploitable/);
    assert.equal((await proposees(porteur, projet.id)).length, 0);

    // L'appel a eu lieu : son coût est confirmé, même sans vignette.
    const cout = await sql(
      `select count(*) from public.provider_charge_settlements s join public.provider_charges c using (attempt_id) where c.job_id = '${tache.id}' and s.usd > 0;`,
    );
    assert.equal(cout.sortie.trim(), "2");
  });

  it("sans usage rapporté, la vignette est déposée et le coût laissé à rapprocher", async () => {
    const porteur = await creerCompte("board-sans-usage");
    const projet = await creerProjet(porteur, "Sans usage");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-sans-usage-cle");
    const { fournisseur } = fournisseurFactice(reponseFactice(PNG, null));
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    assert.equal((await proposees(porteur, projet.id)).length, 1);
    const cout = await sql(
      `select coalesce(s.usd::text, 'nul') from public.provider_charge_settlements s join public.provider_charges c using (attempt_id) where c.job_id = '${tache.id}';`,
    );
    assert.equal(cout.sortie.trim(), "nul");
  });

  it("une requête refusée par le fournisseur ne coûte rien : la provision est soldée à zéro", async () => {
    const porteur = await creerCompte("board-refus");
    const projet = await creerProjet(porteur, "Refusée");
    const scene = await creerScene(porteur, projet.id, 1);
    const tache = await lancer(porteur, projet, scene, "board-refus-cle");
    const refus = new EchecConnu("Le fournisseur a répondu par une erreur (400).", {
      sansFrais: true,
    });
    const { fournisseur } = fournisseurFactice(refus);
    assert.equal(await traiterUnTravail(options(fournisseur)), true);

    const cout = await sql(
      `select s.usd::text from public.provider_charge_settlements s join public.provider_charges c using (attempt_id) where c.job_id = '${tache.id}';`,
    );
    assert.equal(cout.sortie.trim(), "0.000000");
    assert.equal((await proposees(porteur, projet.id)).length, 0);
  });

  it("la base recontrôle le dépôt : le worker ne suffit pas", async () => {
    const resultat = await sql(
      "select public.livrer_proposition_image('00000000-0000-0000-0000-000000000000', '\\x89504e470d0a1a0a'::bytea);",
    );
    assert.notEqual(resultat.code, 0);
  });

  it("BOARD n'entre en service qu'avec une clé OpenAI, indépendamment de celle d'Anthropic", async () => {
    await definirCleFactice("openai", null);
    await definirCleFactice("anthropic", "sk-ant-factice-board-aaaaaaaaaaaa");
    const evenements = [];
    const clesImages = [];
    const agents = registreDesAgents({
      base,
      journal: (evenement) => evenements.push(evenement),
      creerFournisseur: () => async () => ({}),
      creerFournisseurImages: (cle) => {
        clesImages.push(cle);
        return async () => reponseFactice();
      },
    });

    await agents.relire();
    assert.ok(!("storyboard_image" in agents.lire()), "sans clé OpenAI, pas de vignette");
    assert.ok("logline" in agents.lire(), "les agents de texte tournent sans elle");

    await definirCleFactice("openai", "sk-factice-openai-board-aaaaaaaa");
    await agents.relire();
    assert.deepEqual(
      Object.keys(agents.lire()).filter((action) => action in PROFILS_BOARD),
      Object.keys(PROFILS_BOARD),
    );
    assert.deepEqual(clesImages, ["sk-factice-openai-board-aaaaaaaa"]);

    // Retirer la clé d'Anthropic ne sort pas BOARD, et inversement.
    await definirCleFactice("anthropic", null);
    await agents.relire();
    assert.deepEqual(Object.keys(agents.lire()), Object.keys(PROFILS_BOARD));

    await definirCleFactice("openai", null);
    await agents.relire();
    assert.deepEqual(Object.keys(agents.lire()), []);

    // Le journal nomme le fournisseur et les actions, jamais une clé.
    assert.deepEqual(
      evenements.map((e) => [e.fournisseur, e.evenement]),
      [
        ["anthropic", "cle_fournisseur_chargee"],
        ["openai", "cle_fournisseur_chargee"],
        ["anthropic", "cle_fournisseur_retiree"],
        ["openai", "cle_fournisseur_retiree"],
      ],
    );
    assert.ok(!JSON.stringify(evenements).includes("factice"));
  });

  it("BOARD expose exactement les actions de ses profils", () => {
    const { fournisseur } = fournisseurFactice();
    assert.deepEqual(Object.keys(executeursBoard(base, fournisseur)), Object.keys(PROFILS_BOARD));
  });
});
