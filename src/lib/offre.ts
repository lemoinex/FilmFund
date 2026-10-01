/**
 * Offre publique : les plans tels que la vitrine les présente.
 *
 * Les chiffres — volumes et prix — sont lus en base : la dernière version
 * publiée de chaque plan, modifiable depuis « Plans et quotas ». Le
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
    `${compte(version.pdf_exports_per_month, "export PDF", "exports PDF")} par mois`,
  ];
}

/**
 * Lit l'offre en base, sans session ni cookie : le catalogue est public.
 * Renvoie null si la base est injoignable ou mal configurée — la vitrine
 * présente alors l'offre plus tard, plutôt que de ne pas s'afficher.
 */
export async function lireOffre(
  url: string | undefined,
  clePubliable: string | undefined,
): Promise<CarteOffre[] | null> {
  try {
    if (!url || !clePubliable) {
      return null;
    }
    const supabase = createClient<Database>(url, clePubliable, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [plans, versions] = await Promise.all([
      supabase.from("plans").select("code, name, position"),
      supabase
        .from("plan_versions")
        .select(
          "plan_code, version_number, max_projects, max_members, storage_mb, text_units_per_month, images_per_month, pdf_exports_per_month, price_xaf_per_month",
        ),
    ]);

    if (plans.error || versions.error) {
      return null;
    }
    return composerOffre(plans.data, versions.data);
  } catch {
    return null;
  }
}
