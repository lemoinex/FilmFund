/**
 * Offre publique : les plans tels que la vitrine les présente.
 *
 * Les chiffres — volumes, prix, barème des unités texte — sont lus en base :
 * la dernière version publiée, modifiable depuis « Plans et quotas ». Le
 * positionnement — accroches, boutons, badge — est rédigé ici. Aucun prix
 * n'est donc recopié dans le code.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "./supabase/database.types";

export type PlanPublic = { code: string; name: string; position: number };

export type VersionPubliee = {
  plan_code: string;
  version_number: number;
  max_projects: number;
  max_members: number;
  storage_mb: number;
  text_units_per_month: number;
  images_per_month: number;
  pdf_exports_per_month: number;
  price_xaf_per_month: number;
};

export type Positionnement = {
  accroche: string;
  /** Bouton vers l'inscription, quand elle est ouverte. */
  inscription?: string;
  /** Mention affichée quand aucune action n'est encore possible. */
  bientot: string;
  recommande?: boolean;
};

/*
 * Tant que le paiement n'existe pas, aucun bouton ne laisse croire qu'un plan
 * payant s'achète : seul le plan Gratuit mène à l'inscription, et seulement
 * quand elle est ouverte.
 */
export const POSITIONNEMENT: Readonly<Record<string, Positionnement>> = {
  gratuit: {
    accroche: "Pour les auteurs et créateurs qui veulent structurer leur premier projet.",
    inscription: "Commencer gratuitement",
    bientot: "Bientôt disponible",
  },
  pro: {
    accroche:
      "Pour les professionnels qui développent plusieurs projets et souhaitent une préproduction mieux structurée.",
    bientot: "Préinscription bientôt disponible",
    recommande: true,
  },
  studio: {
    accroche:
      "Pour les studios, producteurs et petites équipes qui gèrent plusieurs projets en parallèle.",
    bientot: "Préinscription bientôt disponible",
  },
};

export type CarteOffre = {
  code: string;
  nom: string;
  version: VersionPubliee;
  positionnement: Positionnement;
};

/**
 * Cartes de l'offre, dans l'ordre d'affichage : la dernière version publiée
 * de chaque plan. Un plan sans version publiée, ou sans positionnement rédigé,
 * n'est pas présenté — mieux vaut l'absence qu'une carte sans texte.
 */
export function composerOffre(plans: PlanPublic[], versions: VersionPubliee[]): CarteOffre[] {
  const dernieres = new Map<string, VersionPubliee>();
  for (const version of versions) {
    const connue = dernieres.get(version.plan_code);
    if (!connue || version.version_number > connue.version_number) {
      dernieres.set(version.plan_code, version);
    }
  }

  return [...plans]
    .sort((a, b) => a.position - b.position)
    .flatMap((plan) => {
      const version = dernieres.get(plan.code);
      const positionnement = POSITIONNEMENT[plan.code];
      return version && positionnement
        ? [{ code: plan.code, nom: plan.name, version, positionnement }]
        : [];
    });
}

const NOMBRE = new Intl.NumberFormat("fr-FR");

/** Montant mensuel sans devise : « 0 », « 20 000 ». */
export function montantMensuel(version: VersionPubliee): string {
  return NOMBRE.format(version.price_xaf_per_month);
}

function compte(nombre: number, singulier: string, pluriel: string): string {
  return `${NOMBRE.format(nombre)} ${nombre > 1 ? pluriel : singulier}`;
}

/**
 * Quotas d'un plan, mis en mots. Le stockage est formaté par l'appelant, qui
 * détient la règle commune aux écrans (« 100 Mo », « 2 Go »).
 */
export function quotasEnMots(
  version: VersionPubliee,
  formaterStockage: (megaoctets: number) => string,
): string[] {
  return [
    compte(version.max_projects, "projet actif", "projets actifs"),
    version.max_members > 1 ? `Jusqu'à ${NOMBRE.format(version.max_members)} membres` : "1 membre",
    `${formaterStockage(version.storage_mb)} de stockage d'images`,
    `${compte(version.text_units_per_month, "unité texte", "unités texte")} par mois`,
    `${compte(version.images_per_month, "image générée", "images générées")} par mois`,
    `${compte(version.pdf_exports_per_month, "export", "exports")} par mois (PDF, Word ou ZIP)`,
  ];
}

/** Barème des unités texte, tel que la vitrine l'explique. */
export type BaremePublie = {
  logline: number;
  synopsis_short: number;
  synopsis_standard: number;
  synopsis_detailed: number;
  intention_note: number;
  direction_note: number;
  pitch_extended: number;
  pitch_oral: number;
  dramatic_analysis: number;
  character_list: number;
  budget_plan: number;
  schedule_plan: number;
  shot_list: number;
  gear_list: number;
  research: number;
  cultural_context: number;
  treatment: number;
  bible: number;
  screenplay_per_sequence: number;
  dialogue_per_scene: number;
  text_edit_per_passage: number;
};

/**
 * Barème mis en mots : « 1 pour une logline, de 1 à 3 pour un synopsis, …
 * et 1 par retouche d'un passage ». Les trois synopsis se résument à leur
 * fourchette, ou à un seul nombre s'ils coûtent autant.
 */
export function uniteTexteEnMots(bareme: BaremePublie): string {
  const n = (valeur: number) => NOMBRE.format(valeur);
  const synopsis = [bareme.synopsis_short, bareme.synopsis_standard, bareme.synopsis_detailed];
  const [min, max] = [Math.min(...synopsis), Math.max(...synopsis)];

  const parties = [
    `${n(bareme.logline)} pour une logline`,
    min === max ? `${n(min)} pour un synopsis` : `de ${n(min)} à ${n(max)} pour un synopsis`,
    `${n(bareme.intention_note)} pour une note d'intention`,
    `${n(bareme.direction_note)} pour une note de réalisation`,
    bareme.pitch_extended === bareme.pitch_oral
      ? `${n(bareme.pitch_extended)} pour un pitch développé ou oral`
      : `${n(bareme.pitch_extended)} pour un pitch développé, ${n(bareme.pitch_oral)} pour un pitch oral`,
    `${n(bareme.dramatic_analysis)} pour une analyse dramaturgique`,
    `${n(bareme.character_list)} pour une liste de personnages`,
    `${n(bareme.budget_plan)} pour un budget prévisionnel`,
    `${n(bareme.schedule_plan)} pour un planning prévisionnel`,
    `${n(bareme.shot_list)} pour le découpage d'une scène`,
    `${n(bareme.gear_list)} pour une liste de matériel`,
    `${n(bareme.research)} pour une recherche documentaire`,
    `${n(bareme.cultural_context)} pour un contexte historique et culturel`,
    `${n(bareme.treatment)} pour un traitement`,
    `${n(bareme.bible)} pour une bible`,
    `${n(bareme.screenplay_per_sequence)} par séquence de scénario`,
    `${n(bareme.dialogue_per_scene)} par scène de dialogues`,
  ];
  return `${parties.join(", ")} et ${n(bareme.text_edit_per_passage)} par retouche d'un passage`;
}

function clientPublic(url: string, clePubliable: string) {
  return createClient<Database>(url, clePubliable, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Le barème en vigueur, avec le numéro de la version dont il vient. */
export type BaremeEnVigueur = BaremePublie & { version_number: number };

/**
 * Dernière version publiée du barème, lue sans session. Null si la base est
 * injoignable : la vitrine l'explique alors sans chiffres.
 *
 * Le numéro de version accompagne les valeurs : deux versions peuvent porter
 * les mêmes, et lui seul dit laquelle a été lue.
 */
export async function lireBareme(
  url: string | undefined,
  clePubliable: string | undefined,
): Promise<BaremeEnVigueur | null> {
  try {
    if (!url || !clePubliable) {
      return null;
    }
    const { data, error } = await clientPublic(url, clePubliable)
      .from("text_unit_rate_versions")
      .select(
        "version_number, logline, synopsis_short, synopsis_standard, synopsis_detailed, intention_note, direction_note, pitch_extended, pitch_oral, dramatic_analysis, character_list, budget_plan, schedule_plan, shot_list, gear_list, research, cultural_context, treatment, bible, screenplay_per_sequence, dialogue_per_scene, text_edit_per_passage",
      )
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    return error ? null : data;
  } catch {
    return null;
  }
}

/**
 * Lit l'offre en base, sans session ni cookie : le catalogue est public.
 * Renvoie null si la base est injoignable ou mal configurée — la vitrine
 * présente alors l'offre plus tard, plutôt que de ne pas s'afficher.
 *
 * Chaque plan arrive avec sa seule dernière version : rapatrier toutes les
 * versions pour y chercher la plus récente grossirait à chaque publication,
 * et l'API tronque une réponse au-delà de 1 000 lignes.
 */
export async function lireOffre(
  url: string | undefined,
  clePubliable: string | undefined,
): Promise<CarteOffre[] | null> {
  try {
    if (!url || !clePubliable) {
      return null;
    }
    const { data, error } = await clientPublic(url, clePubliable)
      .from("plans")
      .select(
        "code, name, position, plan_versions(plan_code, version_number, max_projects, max_members, storage_mb, text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month)",
      )
      .order("version_number", { referencedTable: "plan_versions", ascending: false })
      .limit(1, { referencedTable: "plan_versions" });

    if (error) {
      return null;
    }
    return composerOffre(
      data.map(({ code, name, position }) => ({ code, name, position })),
      data.flatMap((plan) => plan.plan_versions),
    );
  } catch {
    return null;
  }
}
