/**
 * Contenu des pages légales, séparé du code de rendu.
 *
 * Ce fichier est la source unique des textes légaux. Les pages ne font que le
 * parcourir : ajouter, supprimer ou réordonner une section se fait ici, sans
 * toucher à un composant.
 *
 * Cette séparation prépare l'édition par un administrateur : au Lot 2, il
 * suffira de remplacer `getLegalDocument` par une lecture en base de données,
 * sans modifier les pages ni les composants de rendu. Voir la note en fin de
 * fichier.
 */

/** Bloc de contenu à l'intérieur d'une section. */
export type LegalBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  /** Suite de lignes « libellé : valeur », typiquement des coordonnées. */
  | { type: "fields"; fields: { label?: string; value: string }[] };

export type LegalSectionContent = {
  /** Identifiant stable, indépendant de la position : sert d'ancre et de clé. */
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  slug: "mentions-legales" | "confidentialite";
  title: string;
  description: string;
  /** Date de dernière mise à jour, ou null tant qu'elle n'est pas arrêtée. */
  updatedAt: string | null;
  sections: LegalSectionContent[];
};

/*
 * Conventions d'écriture des textes ci-dessous :
 * - « [TEXTE ENTRE CROCHETS MAJUSCULES] » est rendu comme un champ à compléter,
 *   surligné et annoncé aux lecteurs d'écran ;
 * - « **texte** » est rendu en gras.
 * Aucune autre syntaxe n'est interprétée : le contenu reste du texte simple,
 * donc sûr à stocker en base et à afficher sans risque d'injection HTML.
 */

const MENTIONS_LEGALES: LegalDocument = {
  slug: "mentions-legales",
  title: "Mentions légales",
  description:
    "Mentions légales de la plateforme filmfundAfrica : éditeur, hébergement, propriété intellectuelle, responsabilité et contact.",
  updatedAt: null,
  sections: [
    {
      id: "editeur",
      title: "1. Éditeur de la plateforme",
      blocks: [
        { type: "paragraph", text: "Le site et la plateforme FilmFund Africa sont édités par :" },
        {
          type: "fields",
          fields: [
            { value: "[DÉNOMINATION LÉGALE / NOM DE L'ENTREPRENEUR]" },
            { label: "Forme juridique", value: "[À COMPLÉTER]" },
            { label: "Capital social", value: "[À COMPLÉTER, SI APPLICABLE]" },
            { label: "Siège social / adresse professionnelle", value: "[À COMPLÉTER]" },
            {
              label: "Immatriculation",
              value: "[RCCM / NUMÉRO D'IDENTIFICATION FISCALE / AUTRE, À COMPLÉTER]",
            },
            { label: "Numéro de téléphone", value: "[À COMPLÉTER]" },
            { label: "E-mail de contact", value: "[À COMPLÉTER]" },
            { label: "Directeur ou directrice de la publication", value: "[NOM, À COMPLÉTER]" },
          ],
        },
        {
          type: "paragraph",
          text: "Ci-après désigné « FilmFund Africa », « nous », « notre » ou « nos ».",
        },
      ],
    },
    {
      id: "hebergement",
      title: "2. Hébergement",
      blocks: [
        {
          type: "paragraph",
          text: "La plateforme est susceptible d'être hébergée ou déployée au moyen de prestataires d'infrastructure cloud, notamment :",
        },
        {
          type: "list",
          items: [
            "Vercel Inc., pour l'hébergement et le déploiement de l'interface web ;",
            "Supabase Inc. et/ou ses sous-traitants, pour les services de base de données, authentification, stockage de fichiers et services associés ;",
            "Railway Corp. et/ou ses sous-traitants, lorsqu'un service applicatif, un traitement asynchrone ou une tâche planifiée le nécessite.",
          ],
        },
        {
          type: "paragraph",
          text: "Les fournisseurs, régions d'hébergement et coordonnées pertinentes doivent être mis à jour dans la présente page avant la mise en production, selon la configuration effectivement utilisée.",
        },
      ],
    },
    {
      id: "objet",
      title: "3. Objet de la plateforme",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa est une plateforme numérique destinée à aider les auteurs, réalisateurs, producteurs et équipes audiovisuelles à structurer et organiser leurs projets de films, notamment au moyen d'outils liés au développement narratif, aux documents de production, au storyboard, au budget, au planning, aux équipes et au suivi d'opportunités de financement.",
        },
        {
          type: "paragraph",
          text: "FilmFund Africa n'est pas un organisme de financement, un producteur, un distributeur, un cabinet juridique, un cabinet comptable ou un conseil financier. La plateforme ne garantit pas l'obtention d'un financement, d'une sélection, d'une subvention, d'un partenariat, d'une diffusion ou d'un résultat commercial.",
        },
      ],
    },
    {
      id: "propriete-intellectuelle",
      title: "4. Propriété intellectuelle",
      blocks: [
        {
          type: "paragraph",
          text: "Sauf indication contraire, les éléments accessibles sur la plateforme — notamment les textes, logos, éléments graphiques, interfaces, mises en page, bases de données, logiciels, marques, contenus éditoriaux et éléments visuels — sont protégés par les règles applicables de propriété intellectuelle et appartiennent à FilmFund Africa ou à ses concédants de licence.",
        },
        {
          type: "paragraph",
          text: "Toute reproduction, représentation, adaptation, extraction, distribution ou exploitation, totale ou partielle, non autorisée de ces éléments est interdite, sauf autorisation écrite préalable de FilmFund Africa ou disposition légale impérative contraire.",
        },
        {
          type: "paragraph",
          text: "Les contenus téléversés ou créés par les utilisateurs restent la propriété de leurs titulaires de droits. L'utilisateur garantit disposer des droits, autorisations et consentements nécessaires pour importer, publier, partager ou traiter ces contenus via la plateforme.",
        },
      ],
    },
    {
      id: "contenus-utilisateurs",
      title: "5. Contenus des utilisateurs",
      blocks: [
        {
          type: "paragraph",
          text: "L'utilisateur demeure responsable des contenus, informations, documents, images, fichiers, données de projet, données d'équipe et autres éléments qu'il importe, crée ou partage sur FilmFund Africa.",
        },
        {
          type: "paragraph",
          text: "L'utilisateur s'engage à ne pas utiliser la plateforme pour :",
        },
        {
          type: "list",
          items: [
            "porter atteinte aux droits de tiers, notamment aux droits d'auteur, droits voisins, droits à l'image, droits des marques ou droits relatifs à la vie privée ;",
            "diffuser des contenus illicites, diffamatoires, frauduleux, haineux, discriminatoires ou violents ;",
            "introduire des virus, logiciels malveillants ou codes destinés à perturber la plateforme ;",
            "accéder sans autorisation à un compte, un projet, un fichier ou une donnée ;",
            "utiliser la plateforme à des fins contraires aux lois applicables.",
          ],
        },
        {
          type: "paragraph",
          text: "FilmFund Africa peut suspendre ou supprimer l'accès à un contenu ou à un compte lorsqu'elle dispose d'éléments raisonnables indiquant une violation des présentes règles, sous réserve des obligations légales applicables.",
        },
      ],
    },
    {
      id: "liens-externes",
      title: "6. Liens externes",
      blocks: [
        {
          type: "paragraph",
          text: "La plateforme peut contenir des liens vers des sites ou services tiers. FilmFund Africa ne contrôle pas ces ressources externes et ne saurait être responsable de leur contenu, disponibilité, sécurité, pratiques de confidentialité ou conditions d'utilisation.",
        },
        {
          type: "paragraph",
          text: "L'utilisateur est invité à consulter les politiques et conditions applicables sur les sites tiers concernés.",
        },
      ],
    },
    {
      id: "disponibilite",
      title: "7. Disponibilité et sécurité",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa met en œuvre des mesures raisonnables pour maintenir la sécurité, l'intégrité et la disponibilité de la plateforme. Toutefois, aucun service numérique ne peut garantir une disponibilité continue, l'absence totale d'erreur ou l'absence de risque de sécurité.",
        },
        {
          type: "paragraph",
          text: "FilmFund Africa peut faire évoluer, limiter, interrompre temporairement ou modifier tout ou partie de la plateforme, notamment pour des raisons de maintenance, de sécurité, d'amélioration ou de conformité.",
        },
        {
          type: "paragraph",
          text: "Les utilisateurs sont invités à conserver leurs propres copies de sauvegarde de leurs contenus importants.",
        },
      ],
    },
    {
      id: "responsabilite",
      title: "8. Limitation de responsabilité",
      blocks: [
        {
          type: "paragraph",
          text: "Dans les limites autorisées par la loi applicable, FilmFund Africa ne peut être tenue responsable :",
        },
        {
          type: "list",
          items: [
            "des décisions prises par les utilisateurs à partir des informations, modèles, suggestions ou outils proposés ;",
            "de la perte, altération ou indisponibilité de contenus due à un événement hors de son contrôle raisonnable ;",
            "des actes, omissions, contenus ou services de tiers ;",
            "d'une perte de financement, de chance, de revenu, de clientèle, d'opportunité ou de données indirectement liée à l'utilisation de la plateforme.",
          ],
        },
        {
          type: "paragraph",
          text: "Aucune disposition des présentes mentions légales ne vise à exclure une responsabilité qui ne pourrait être exclue ou limitée en vertu de la loi applicable.",
        },
      ],
    },
    {
      id: "signalement",
      title: "9. Signalement",
      blocks: [
        {
          type: "paragraph",
          text: "Pour signaler un contenu illicite, une atteinte à vos droits ou un problème de sécurité, contactez-nous à :",
        },
        {
          type: "fields",
          fields: [{ value: "[E-MAIL DE CONTACT / SECURITY EMAIL À COMPLÉTER]" }],
        },
        { type: "paragraph", text: "Merci d'indiquer, dans la mesure du possible :" },
        {
          type: "list",
          items: [
            "l'URL ou l'emplacement du contenu concerné ;",
            "la nature du signalement ;",
            "les éléments permettant de comprendre votre demande ;",
            "vos coordonnées afin que nous puissions vous répondre.",
          ],
        },
      ],
    },
    {
      id: "droit-applicable",
      title: "10. Droit applicable et contact",
      blocks: [
        {
          type: "paragraph",
          text: "Les présentes mentions légales sont soumises au droit applicable au lieu d'établissement de l'éditeur, sous réserve des règles impératives applicables aux utilisateurs.",
        },
        {
          type: "paragraph",
          text: "Pour toute question relative à la plateforme ou aux présentes mentions légales, contactez :",
        },
        {
          type: "fields",
          fields: [
            { value: "[NOM / DÉNOMINATION LÉGALE]" },
            { value: "[ADRESSE]" },
            { value: "[E-MAIL]" },
            { value: "[TÉLÉPHONE, SI APPLICABLE]" },
          ],
        },
      ],
    },
  ],
};

const CONFIDENTIALITE: LegalDocument = {
  slug: "confidentialite",
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité de filmfundAfrica : données traitées, finalités, destinataires, conservation, sécurité et droits des personnes.",
  updatedAt: null,
  sections: [
    {
      id: "objet",
      title: "1. Objet et périmètre",
      blocks: [
        {
          type: "paragraph",
          text: "La présente politique décrit la manière dont FilmFund Africa traite les données à caractère personnel dans le cadre de son site de présentation et, à terme, de sa plateforme de développement de projets cinématographiques et audiovisuels.",
        },
        {
          type: "paragraph",
          text: "**En l'état actuel, le site est un site de présentation.** Il ne comporte ni création de compte, ni formulaire, ni espace de dépôt de fichiers, ni outil de mesure d'audience, ni traceur publicitaire. Aucune donnée n'y est collectée auprès des visiteurs en dehors des informations techniques strictement nécessaires à l'affichage des pages, décrites à la section 4.",
        },
        {
          type: "paragraph",
          text: "Les traitements décrits aux sections 5 et suivantes concernent les fonctionnalités de la plateforme lorsqu'elles seront ouvertes. La présente politique sera mise à jour, et sa date de dernière mise à jour modifiée, avant toute mise en service de ces fonctionnalités.",
        },
      ],
    },
    {
      id: "responsable",
      title: "2. Responsable du traitement",
      blocks: [
        {
          type: "paragraph",
          text: "Le responsable du traitement des données décrites dans la présente politique est :",
        },
        {
          type: "fields",
          fields: [
            { value: "[DÉNOMINATION LÉGALE / NOM DE L'ENTREPRENEUR]" },
            { label: "Adresse", value: "[À COMPLÉTER]" },
            { label: "E-mail de contact", value: "[À COMPLÉTER]" },
            {
              label: "Délégué à la protection des données, le cas échéant",
              value: "[À COMPLÉTER OU SANS OBJET]",
            },
          ],
        },
        {
          type: "paragraph",
          text: "Les informations d'identification complètes figurent dans les mentions légales.",
        },
      ],
    },
    {
      id: "cadre-juridique",
      title: "3. Cadre juridique applicable",
      blocks: [
        {
          type: "paragraph",
          text: "Le cadre juridique applicable au traitement des données dépend du lieu d'établissement du responsable du traitement et de la résidence des personnes concernées.",
        },
        {
          type: "fields",
          fields: [
            { label: "Réglementation de référence", value: "[À COMPLÉTER]" },
            { label: "Autorité de contrôle compétente", value: "[À COMPLÉTER]" },
          ],
        },
        {
          type: "paragraph",
          text: "Ces éléments doivent être déterminés avec un conseil juridique et renseignés avant la mise en production.",
        },
      ],
    },
    {
      id: "donnees-actuelles",
      title: "4. Données traitées aujourd'hui",
      blocks: [
        {
          type: "paragraph",
          text: "La consultation du site suppose, comme pour tout service accessible en ligne, le traitement technique de certaines données par l'infrastructure qui sert les pages :",
        },
        {
          type: "list",
          items: [
            "adresse IP de connexion et informations transmises par le navigateur (type de navigateur, système d'exploitation, page demandée, date et heure) ;",
            "journaux techniques générés automatiquement par l'hébergeur à des fins de fonctionnement, de sécurité et de diagnostic.",
          ],
        },
        {
          type: "paragraph",
          text: "Ces données ne sont pas utilisées pour identifier les visiteurs, ne sont pas recoupées avec d'autres sources et ne font l'objet d'aucun profilage.",
        },
        {
          type: "fields",
          fields: [
            { label: "Durée de conservation des journaux techniques", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "donnees-plateforme",
      title: "5. Données traitées lorsque la plateforme sera ouverte",
      blocks: [
        {
          type: "paragraph",
          text: "Lorsque les fonctionnalités de la plateforme seront accessibles, les catégories de données suivantes seront susceptibles d'être traitées :",
        },
        {
          type: "list",
          items: [
            "données de compte : identifiants de connexion, adresse e-mail, nom ou pseudonyme, préférences ;",
            "données de profil professionnel renseignées volontairement : fonction, société, pays d'activité ;",
            "contenus de projet créés ou importés : synopsis, documents de développement, storyboards, budgets, plannings, fichiers joints ;",
            "données relatives aux équipes et collaborateurs invités par l'utilisateur ;",
            "données d'usage du service nécessaires à son fonctionnement et à sa sécurité.",
          ],
        },
        {
          type: "paragraph",
          text: "Aucune donnée bancaire n'est traitée à ce jour : la plateforme ne comporte aucune fonctionnalité de paiement, et aucun prestataire de paiement n'est mis en œuvre.",
        },
        {
          type: "paragraph",
          text: "**Attention aux données de tiers.** Les contenus de projet peuvent contenir des données concernant d'autres personnes, par exemple des membres d'équipe ou des personnes filmées. L'utilisateur demeure responsable de disposer des droits et autorisations nécessaires avant de les importer.",
        },
      ],
    },
    {
      id: "finalites",
      title: "6. Finalités et bases légales",
      blocks: [
        {
          type: "paragraph",
          text: "Les traitements envisagés poursuivront les finalités suivantes :",
        },
        {
          type: "list",
          items: [
            "fournir le service : création de compte, accès à l'espace de travail, conservation des projets ;",
            "assurer la sécurité du service, prévenir la fraude et les usages abusifs ;",
            "répondre aux demandes d'assistance et aux signalements ;",
            "respecter les obligations légales applicables ;",
            "améliorer le service, sur la base de données agrégées ne permettant pas d'identifier une personne.",
          ],
        },
        {
          type: "fields",
          fields: [
            {
              label: "Bases légales retenues pour chaque finalité",
              value: "[À COMPLÉTER AVEC UN CONSEIL JURIDIQUE]",
            },
          ],
        },
      ],
    },
    {
      id: "cookies",
      title: "7. Cookies et mesure d'audience",
      blocks: [
        {
          type: "paragraph",
          text: "Le site ne dépose aucun cookie de mesure d'audience, de publicité ou de réseau social, et n'intègre aucun outil d'analytics.",
        },
        {
          type: "paragraph",
          text: "Si de tels outils devaient être mis en place, cette politique serait mise à jour au préalable et un mécanisme de recueil du consentement serait proposé lorsque la réglementation applicable l'exige.",
        },
      ],
    },
    {
      id: "destinataires",
      title: "8. Destinataires et prestataires",
      blocks: [
        {
          type: "paragraph",
          text: "Les données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins commerciales.",
        },
        {
          type: "paragraph",
          text: "**Accès interne.** Les comptes disposant du rôle d'administrateur au sein de filmfundAfrica peuvent consulter les profils et les projets de l'ensemble des utilisateurs, et supprimer un projet. Cet accès sert à l'assistance, à la modération des contenus signalés et au traitement des demandes d'effacement. Il est limité aux personnes désignées par l'éditeur. Un administrateur ne peut pas modifier le contenu d'un projet dont il n'est pas le porteur.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "Personnes disposant du rôle d'administrateur",
              value: "[À COMPLÉTER]",
            },
          ],
        },
        {
          type: "paragraph",
          text: "Les prestataires d'infrastructure suivants sont **envisagés** pour l'hébergement et le fonctionnement du service. À la date de la présente politique, **aucun d'eux n'est configuré ni en service** :",
        },
        {
          type: "list",
          items: [
            "Vercel Inc., pour l'hébergement et le déploiement de l'interface web (prévu) ;",
            "Supabase Inc., pour la base de données, l'authentification et le stockage de fichiers (prévu) ;",
            "Railway Corp., pour d'éventuels services applicatifs, traitements asynchrones ou tâches planifiées (prévu).",
          ],
        },
        {
          type: "fields",
          fields: [
            {
              label: "Prestataires effectivement mis en œuvre",
              value: "[À COMPLÉTER AVANT MISE EN PRODUCTION]",
            },
            { label: "Localisation de l'hébergement et des données", value: "[À COMPLÉTER]" },
          ],
        },
        {
          type: "paragraph",
          text: "Cette section doit être mise à jour dès qu'un prestataire est réellement configuré, en indiquant sa qualité de sous-traitant, les données concernées et les garanties contractuelles applicables.",
        },
      ],
    },
    {
      id: "transferts",
      title: "9. Transferts hors du pays d'établissement",
      blocks: [
        {
          type: "paragraph",
          text: "Le recours à des prestataires établis à l'étranger peut impliquer un transfert de données hors du pays d'établissement du responsable du traitement.",
        },
        {
          type: "fields",
          fields: [
            { label: "Pays de destination", value: "[À COMPLÉTER]" },
            { label: "Garanties encadrant les transferts", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "conservation",
      title: "10. Durées de conservation",
      blocks: [
        {
          type: "paragraph",
          text: "Les données sont conservées pour la durée nécessaire aux finalités pour lesquelles elles sont traitées, puis supprimées ou archivées conformément à la réglementation applicable.",
        },
        {
          type: "fields",
          fields: [
            { label: "Données de compte", value: "[À COMPLÉTER]" },
            { label: "Contenus de projet", value: "[À COMPLÉTER]" },
            { label: "Journaux techniques et de sécurité", value: "[À COMPLÉTER]" },
            { label: "Demandes d'assistance et signalements", value: "[À COMPLÉTER]" },
          ],
        },
        {
          type: "paragraph",
          text: "Aucune durée n'est annoncée tant qu'elle n'a pas été arrêtée : une durée affichée engage le responsable du traitement.",
        },
      ],
    },
    {
      id: "securite",
      title: "11. Sécurité",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa met en œuvre des mesures techniques et organisationnelles raisonnables visant à protéger les données contre la perte, l'altération, la divulgation ou l'accès non autorisé.",
        },
        {
          type: "paragraph",
          text: "Aucun service numérique ne peut toutefois garantir une sécurité absolue. Les utilisateurs sont invités à protéger leurs identifiants et à conserver leurs propres copies de sauvegarde de leurs contenus importants.",
        },
        {
          type: "paragraph",
          text: "Aucune certification de sécurité n'est revendiquée. Les mesures effectivement mises en place seront décrites ici lorsqu'elles auront été définies et appliquées :",
        },
        { type: "fields", fields: [{ value: "[À COMPLÉTER]" }] },
      ],
    },
    {
      id: "droits",
      title: "12. Vos droits",
      blocks: [
        {
          type: "paragraph",
          text: "Sous réserve du cadre juridique applicable et des conditions qu'il prévoit, vous pouvez notamment disposer des droits suivants sur vos données :",
        },
        {
          type: "list",
          items: [
            "droit d'accès et d'obtention d'une copie ;",
            "droit de rectification des données inexactes ou incomplètes ;",
            "droit à l'effacement, dans les cas prévus par la réglementation applicable ;",
            "droit à la limitation du traitement ;",
            "droit d'opposition, notamment pour des motifs tenant à votre situation particulière ;",
            "droit à la portabilité de certaines données ;",
            "droit de retirer votre consentement à tout moment, lorsque le traitement repose sur celui-ci ;",
            "droit d'introduire une réclamation auprès de l'autorité de contrôle compétente.",
          ],
        },
        {
          type: "fields",
          fields: [
            { label: "Adresse pour exercer vos droits", value: "[À COMPLÉTER]" },
            { label: "Délai de réponse applicable", value: "[À COMPLÉTER]" },
            { label: "Autorité de contrôle compétente", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "mineurs",
      title: "13. Mineurs",
      blocks: [
        {
          type: "paragraph",
          text: "La plateforme s'adresse à des professionnels et à des porteurs de projets audiovisuels. Elle n'est pas destinée aux personnes n'ayant pas atteint l'âge requis par la réglementation applicable pour consentir seules au traitement de leurs données.",
        },
        { type: "fields", fields: [{ label: "Âge minimum retenu", value: "[À COMPLÉTER]" }] },
      ],
    },
    {
      id: "modifications",
      title: "14. Modifications de la présente politique",
      blocks: [
        {
          type: "paragraph",
          text: "La présente politique peut être modifiée pour tenir compte de l'évolution du service, des prestataires utilisés ou de la réglementation applicable. La date de dernière mise à jour figure en tête de page.",
        },
        {
          type: "paragraph",
          text: "En cas de modification substantielle des traitements, les utilisateurs disposant d'un compte en seront informés par les moyens appropriés avant son entrée en vigueur.",
        },
      ],
    },
    {
      id: "contact",
      title: "15. Contact",
      blocks: [
        {
          type: "paragraph",
          text: "Pour toute question relative à la présente politique ou à vos données, contactez :",
        },
        {
          type: "fields",
          fields: [
            { value: "[NOM / DÉNOMINATION LÉGALE]" },
            { value: "[ADRESSE]" },
            { value: "[E-MAIL]" },
          ],
        },
      ],
    },
  ],
};

const DOCUMENTS: Record<LegalDocument["slug"], LegalDocument> = {
  "mentions-legales": MENTIONS_LEGALES,
  confidentialite: CONFIDENTIALITE,
};

/**
 * Renvoie un document légal par son identifiant d'URL.
 *
 * Point d'extension pour l'édition par un administrateur : cette fonction est
 * le seul endroit que les pages interrogent. Lorsque la base de données sera
 * en place, elle lira la version publiée du document en base et retombera sur
 * la version ci-dessus si aucune n'existe encore. Les pages et les composants
 * de rendu n'auront pas à changer.
 */
export function getLegalDocument(slug: LegalDocument["slug"]): LegalDocument {
  return DOCUMENTS[slug];
}
