/**
 * Profil professionnel : ce que l'écran propose, et ce qu'une saisie doit
 * respecter. Module pur, testable sans pile Supabase.
 *
 * Aucun import d'alias : ce module est aussi chargé tel quel par les tests
 * Node.
 */

/**
 * Métier déclaré par le titulaire. Mêmes codes que l'énumération
 * `profile_type` en base ; un test d'architecture vérifie qu'ils ne
 * s'écartent pas. Ce n'est pas un rôle : aucun accès n'en dépend.
 */
export const TYPES_PROFIL = {
  AUTHOR: "Auteur ou autrice",
  DIRECTOR: "Réalisateur ou réalisatrice",
  PRODUCER: "Producteur ou productrice",
} as const;

export type TypeProfil = keyof typeof TYPES_PROFIL;

/**
 * Longueur maximale de chaque champ de texte, en caractères. Mêmes bornes que
 * les contraintes de `profiles`, qui ont le dernier mot.
 */
export const LONGUEURS_PROFIL = {
  display_name: 120,
  first_name: 80,
  last_name: 80,
  city: 120,
  profession: 120,
} as const;

type ChampTexte = keyof typeof LONGUEURS_PROFIL;

const LIBELLES_CHAMPS: Record<ChampTexte, string> = {
  display_name: "Le nom affiché",
  first_name: "Le prénom",
  last_name: "Le nom",
  city: "La ville",
  profession: "La profession",
};

/** Ce que le titulaire modifie depuis l'écran : jamais le rôle. */
export type SaisieProfil = {
  display_name: string;
  first_name: string;
  last_name: string;
  country: string | null;
  city: string;
  profession: string;
  profile_type: TypeProfil | null;
};

export const CHAMPS_MODIFIABLES = [
  "display_name",
  "first_name",
  "last_name",
  "country",
  "city",
  "profession",
  "profile_type",
] as const satisfies readonly (keyof SaisieProfil)[];

/**
 * Codes ISO 3166-1 à deux lettres. Seuls les codes sont écrits ici : les noms
 * viennent de `Intl`, qui les tient du référentiel CLDR — aucun nom de pays
 * n'est donc rédigé, ni à tenir à jour, dans le dépôt.
 */
// prettier-ignore
export const CODES_PAYS = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ",
  "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW",
  "CX", "CY", "CZ",
  "DE", "DJ", "DK", "DM", "DO", "DZ",
  "EC", "EE", "EG", "EH", "ER", "ES", "ET",
  "FI", "FJ", "FK", "FM", "FO", "FR",
  "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT",
  "GU", "GW", "GY",
  "HK", "HM", "HN", "HR", "HT", "HU",
  "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP",
  "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ",
  "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY",
  "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS",
  "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
  "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM",
  "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY",
  "QA",
  "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ",
  "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ",
  "UA", "UG", "UM", "US", "UY", "UZ",
  "VA", "VC", "VE", "VG", "VI", "VN", "VU",
  "WF", "WS",
  "YE", "YT",
  "ZA", "ZM", "ZW",
] as const;

export type Pays = { code: string; nom: string };

/**
 * Pays proposés, par ordre alphabétique de leur nom français. À calculer côté
 * serveur et à passer au formulaire : deux moteurs peuvent ne pas trier, ni
 * nommer, tout à fait de la même façon.
 */
export function listerPays(): Pays[] {
  const noms = new Intl.DisplayNames("fr", { type: "region", fallback: "none" });
  const ordre = new Intl.Collator("fr");
  return CODES_PAYS.map((code) => ({ code, nom: noms.of(code) ?? code })).sort((a, b) =>
    ordre.compare(a.nom, b.nom),
  );
}

/** Caractères de contrôle : ces textes tiennent sur une ligne. */
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/;

/**
 * Texte d'un champ : espaces repliés, extrémités coupées. Nul s'il n'a pas la
 * forme d'un texte, ou s'il garde un caractère de contrôle.
 */
function texteDe(valeur: unknown): string | null {
  if (typeof valeur !== "string") {
    return null;
  }
  const texte = valeur.replace(/\s+/g, " ").trim();
  return CONTROLE.test(texte) ? null : texte;
}

/**
 * Saisie du formulaire, ramenée à ce que la base attend. Une erreur si un
 * champ manque, déborde, ou désigne un pays ou un type inconnu.
 *
 * La longueur se compte en caractères, comme `char_length` en base, et non en
 * unités UTF-16 : « é » décomposé ou un emoji ne doivent pas être comptés
 * autrement ici que là-bas.
 */
export function normaliserProfil(
  saisie: Readonly<Record<string, unknown>>,
): { profil: SaisieProfil } | { erreur: string } {
  const textes = {} as Record<ChampTexte, string>;
  for (const champ of Object.keys(LONGUEURS_PROFIL) as ChampTexte[]) {
    const texte = texteDe(saisie[champ]);
    if (texte === null) {
      return { erreur: `${LIBELLES_CHAMPS[champ]} contient des caractères non autorisés.` };
    }
    if ([...texte].length > LONGUEURS_PROFIL[champ]) {
      return {
        erreur: `${LIBELLES_CHAMPS[champ]} ne peut pas dépasser ${LONGUEURS_PROFIL[champ]} caractères.`,
      };
    }
    textes[champ] = texte;
  }

  if (!textes.display_name) {
    return { erreur: "Indiquez le nom sous lequel vos équipes vous voient." };
  }

  const pays = saisie.country;
  if (
    typeof pays !== "string" ||
    (pays !== "" && !(CODES_PAYS as readonly string[]).includes(pays))
  ) {
    return { erreur: "Pays inconnu." };
  }

  const type = saisie.profile_type;
  if (typeof type !== "string" || (type !== "" && !Object.hasOwn(TYPES_PROFIL, type))) {
    return { erreur: "Type de profil inconnu." };
  }

  return {
    profil: {
      ...textes,
      country: pays || null,
      profile_type: (type || null) as TypeProfil | null,
    },
  };
}

/**
 * Accueil du tableau de bord : « Bienvenue, Awa ». Le prénom d'abord ; à
 * défaut, le nom affiché ; rien de plus si le profil n'en dit pas davantage.
 */
export function salutation(profil: { first_name?: string; display_name?: string } | null): string {
  const nom = profil?.first_name?.trim() || profil?.display_name?.trim();
  return nom ? `Bienvenue, ${nom}` : "Bienvenue";
}
