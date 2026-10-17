/**
 * Contenu des pages légales, séparé du code de rendu.
 *
 * Ce fichier est la source unique des textes légaux. Les pages ne font que le
 * parcourir : ajouter, supprimer ou réordonner une section se fait ici, sans
 * toucher à un composant.
 *
 * Les textes viennent du document « Mentions légales, CGU et confidentialité »
 * remis par l'utilisateur le 11 octobre 2026, ramené à ce que la plateforme
 * fait : voir la note qui précède les documents.
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
  slug: "mentions-legales" | "conditions-utilisation" | "confidentialite" | "politique-de-contenu";
  title: string;
  description: string;
  /** Date de dernière mise à jour, ou null tant qu'elle n'est pas arrêtée. */
  updatedAt: string | null;
  sections: LegalSectionContent[];
};

/*
 * Conventions d'écriture des textes ci-dessous :
 * - « [TEXTE ENTRE CROCHETS] » est rendu comme un champ à compléter, surligné
 *   et annoncé aux lecteurs d'écran ;
 * - « **texte** » est rendu en gras.
 * Aucune autre syntaxe n'est interprétée : le contenu reste du texte simple,
 * donc sûr à afficher sans risque d'injection HTML.
 */

/*
 * Identité et coordonnées, données par l'utilisateur le 11 octobre 2026 et
 * publiées par sa décision : deux noms, deux adresses et un numéro lisibles de
 * tout visiteur. Le second représentant est ajouté le 17 octobre 2026, sur sa
 * demande, et le siège devient « ElMan & Sessua » le même jour, partout. Ne
 * rien y ajouter qui n'ait été fourni : la forme juridique,
 * l'adresse précise et l'immatriculation ne sont pas connues.
 */
export const CONTACT_POLITIQUE_CONTENU = "cedrichervex@gmail.com";
export const CONTACT_ROMARIC = "romaricsessua@gmail.com";
export const EDITEUR =
  "FilmFund Africa, startup en cours de création, représentée par NGOOH Cédric Hervé et Romaric SESSUA";
export const TELEPHONE_EDITEUR = "(+237) 674 581 693";
export const SIEGE_EDITEUR = "ElMan & Sessua, Yaoundé, Cameroun";
export const ADMINISTRATEURS = [
  { nom: "NGOOH Cédric Hervé", contact: CONTACT_POLITIQUE_CONTENU },
  { nom: "Romaric SESSUA", contact: CONTACT_ROMARIC },
] as const;

/*
 * Ces textes n'annoncent que ce que la plateforme fait. Le document d'origine
 * portait sept engagements sans rien derrière, retirés avec l'accord de
 * l'utilisateur : applications Android et Windows, mode maintenance et arrêt
 * d'urgence de l'IA, vitrine modifiable par l'administration, double
 * authentification, notification des changements, suppression des contenus à
 * la clôture d'un compte, clés des fournisseurs en variables d'environnement.
 * Les tests des pages légales refusent leur retour : y ajouter un engagement,
 * c'est d'abord livrer ce qu'il décrit.
 */

const MENTIONS_LEGALES: LegalDocument = {
  slug: "mentions-legales",
  title: "Mentions légales",
  description:
    "Mentions légales de la plateforme FilmFund Africa : éditeur, directeur de la publication, hébergement, propriété intellectuelle, responsabilité et contact.",
  updatedAt: "17 octobre 2026",
  sections: [
    {
      id: "editeur",
      title: "1. Éditeur du service",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa (ci-après « le Service ») est un espace en ligne destiné aux équipes de cinéma, de l'idée du film au dossier structuré pour le financement et la production.",
        },
        {
          type: "fields",
          fields: [
            { label: "Éditeur", value: EDITEUR },
            {
              label: "Forme juridique",
              value:
                "Non définie à ce jour : la structure est en cours de création. Les numéros RCCM et NIU seront ajoutés après immatriculation.",
            },
            { label: "Siège", value: SIEGE_EDITEUR },
            { label: "Adresse précise", value: "[À COMPLÉTER]" },
            { label: "E-mail de contact", value: CONTACT_POLITIQUE_CONTENU },
            { label: "Téléphone", value: TELEPHONE_EDITEUR },
            { label: "Adresse du Service", value: "https://filmfund.vercel.app" },
          ],
        },
        {
          type: "paragraph",
          text: "Ci-après désigné « FilmFund Africa », « l'éditeur », « nous », « notre » ou « nos ».",
        },
      ],
    },
    {
      id: "directeur-publication",
      title: "2. Directeur de la publication",
      blocks: [
        {
          type: "fields",
          fields: [
            { label: "Directeur de la publication", value: "NGOOH Cédric Hervé" },
            { label: "Qualité", value: "Fondateur et représentant de la startup" },
            {
              label: "Contact",
              value: `${CONTACT_POLITIQUE_CONTENU} — ${TELEPHONE_EDITEUR} — ${SIEGE_EDITEUR}`,
            },
          ],
        },
        {
          type: "paragraph",
          text: "Le directeur de la publication est responsable du contenu éditorial publié par l'éditeur : pages publiques, textes et visuels. Il est la personne à qui adresser toute demande de retrait de contenu illicite, tout droit de réponse et toute notification de contenu litigieux.",
        },
      ],
    },
    {
      id: "hebergement",
      title: "3. Hébergement et infrastructure",
      blocks: [
        {
          type: "paragraph",
          text: "La plateforme est hébergée et déployée au moyen des prestataires d'infrastructure suivants :",
        },
        {
          type: "list",
          items: [
            "Vercel Inc., pour l'hébergement et le déploiement de l'interface web ;",
            "Supabase Inc., pour la base de données, l'authentification et le stockage de fichiers ;",
            "Railway Corp., pour les traitements asynchrones.",
          ],
        },
        {
          type: "fields",
          fields: [
            {
              label: "Hébergement de la base de données et des fichiers",
              value: "Irlande (région « West EU » de Supabase)",
            },
            { label: "Région des traitements asynchrones", value: "[À COMPLÉTER]" },
            { label: "Coordonnées des prestataires", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "administration",
      title: "4. Administration du Service",
      blocks: [
        {
          type: "paragraph",
          text: "L'administration du Service est confiée à deux administrateurs nommés. Leurs prérogatives sont décrites dans la politique de confidentialité.",
        },
        {
          type: "fields",
          fields: ADMINISTRATEURS.map((administrateur) => ({
            label: administrateur.nom,
            value: administrateur.contact,
          })),
        },
      ],
    },
    {
      id: "objet",
      title: "5. Objet de la plateforme",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa est une plateforme numérique destinée à aider les auteurs, réalisateurs, producteurs et équipes audiovisuelles à structurer et organiser leurs projets de films, notamment au moyen d'outils liés au développement narratif, aux documents de production, au storyboard, au budget, au planning, aux équipes et au suivi d'opportunités de financement.",
        },
        {
          type: "paragraph",
          text: "FilmFund Africa n'est pas un organisme de financement, un producteur, un distributeur, un cabinet juridique, un cabinet comptable ou un conseil financier. La plateforme ne garantit pas l'obtention d'un financement, d'une sélection, d'une subvention, d'un partenariat, d'une diffusion ou d'un résultat commercial.",
        },
        {
          type: "paragraph",
          text: "La plateforme comprend un assistant fondé sur des modèles d'intelligence artificielle. Ce qu'il propose reste une suggestion, que l'utilisateur accepte, corrige ou écarte : elle peut être inexacte ou incomplète, et n'engage ni FilmFund Africa ni un résultat.",
        },
        {
          type: "paragraph",
          text: "La plateforme est en accès privé : l'inscription est fermée, et seuls les comptes ouverts par l'éditeur peuvent se connecter.",
        },
      ],
    },
    {
      id: "propriete-intellectuelle",
      title: "6. Propriété intellectuelle",
      blocks: [
        {
          type: "paragraph",
          text: "La marque, le logo, l'interface, le code, la direction artistique et les textes du Service sont la propriété de l'éditeur ou de ses concédants de licence, sauf mention contraire.",
        },
        {
          type: "paragraph",
          text: "Toute reproduction, représentation, adaptation, extraction, distribution ou exploitation, totale ou partielle, non autorisée de ces éléments est interdite, sauf autorisation écrite préalable de l'éditeur ou disposition légale impérative contraire.",
        },
        {
          type: "paragraph",
          text: "Les contenus créés ou téléversés par les utilisateurs — scénarios, personnages, storyboards, budgets, plannings — restent leur propriété, dans les conditions de l'article 7 des conditions générales d'utilisation.",
        },
      ],
    },
    {
      id: "contenus-utilisateurs",
      title: "7. Contenus des utilisateurs",
      blocks: [
        {
          type: "paragraph",
          text: "L'utilisateur demeure responsable des contenus, informations, documents, images, fichiers, données de projet, données d'équipe et autres éléments qu'il importe, crée ou partage sur FilmFund Africa.",
        },
        {
          type: "paragraph",
          text: "FilmFund Africa peut retirer un contenu ou suspendre un compte lorsqu'elle dispose d'éléments raisonnables indiquant une violation des règles applicables, sous réserve des obligations légales. La politique de contenu précise ces règles et la manière de demander un réexamen.",
        },
      ],
    },
    {
      id: "liens-externes",
      title: "8. Liens externes",
      blocks: [
        {
          type: "paragraph",
          text: "La plateforme peut contenir des liens vers des sites ou services tiers. FilmFund Africa ne contrôle pas ces ressources externes et ne saurait être responsable de leur contenu, disponibilité, sécurité, pratiques de confidentialité ou conditions d'utilisation.",
        },
      ],
    },
    {
      id: "disponibilite",
      title: "9. Disponibilité et sécurité",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa met en œuvre des mesures raisonnables pour maintenir la sécurité, l'intégrité et la disponibilité de la plateforme. Toutefois, aucun service numérique ne peut garantir une disponibilité continue, l'absence totale d'erreur ou l'absence de risque de sécurité.",
        },
        {
          type: "paragraph",
          text: "Les utilisateurs sont invités à conserver leurs propres copies de sauvegarde de leurs contenus importants.",
        },
      ],
    },
    {
      id: "signalement",
      title: "10. Signalement de contenu illicite",
      blocks: [
        {
          type: "paragraph",
          text: "Tout contenu manifestement illicite, toute atteinte à vos droits ou tout problème de sécurité peut être signalé à :",
        },
        { type: "fields", fields: [{ value: CONTACT_POLITIQUE_CONTENU }] },
        {
          type: "paragraph",
          text: "L'éditeur s'engage à examiner le signalement dans un délai raisonnable et à retirer ou rendre inaccessible tout contenu dont l'illicéité est établie. Merci d'indiquer, dans la mesure du possible :",
        },
        {
          type: "list",
          items: [
            "l'emplacement du contenu concerné ;",
            "la nature du signalement ;",
            "les éléments permettant de comprendre votre demande ;",
            "vos coordonnées afin que nous puissions vous répondre.",
          ],
        },
      ],
    },
    {
      id: "droit-applicable",
      title: "11. Droit applicable et contact",
      blocks: [
        {
          type: "paragraph",
          text: "Les présentes mentions légales sont régies par le droit camerounais, sous réserve des règles impératives applicables aux utilisateurs situés dans d'autres juridictions.",
        },
        {
          type: "paragraph",
          text: "Pour toute question relative à la plateforme ou aux présentes mentions légales, contactez :",
        },
        {
          type: "fields",
          // Formulation donnée par l'utilisateur le 17 octobre 2026 pour ce seul
          // bloc : la section 1 garde « startup en cours de création ».
          fields: [
            {
              value: "FilmFund Africa, représentée par NGOOH Cédric Hervé et Romaric SESSUA",
            },
            { value: SIEGE_EDITEUR },
            { value: CONTACT_POLITIQUE_CONTENU },
            { value: CONTACT_ROMARIC },
            { value: TELEPHONE_EDITEUR },
          ],
        },
      ],
    },
  ],
};

const CONDITIONS_UTILISATION: LegalDocument = {
  slug: "conditions-utilisation",
  title: "Conditions générales d'utilisation",
  description:
    "Conditions générales d'utilisation de FilmFund Africa : accès, rôles, fonctionnalités d'intelligence artificielle, obligations, propriété des contenus, responsabilité et droit applicable.",
  updatedAt: "11 octobre 2026",
  sections: [
    {
      id: "objet",
      title: "Article 1 — Objet",
      blocks: [
        {
          type: "paragraph",
          text: "Les présentes conditions générales d'utilisation (ci-après « CGU ») encadrent l'accès au Service FilmFund Africa et son utilisation, depuis un navigateur web.",
        },
      ],
    },
    {
      id: "acces",
      title: "Article 2 — Accès au Service et comptes",
      blocks: [
        {
          type: "list",
          items: [
            "L'accès est actuellement restreint : les inscriptions publiques et l'ajout libre de membres sont désactivés. L'accès est réservé aux comptes préenregistrés par les administrateurs.",
            `L'utilisateur s'engage à fournir des informations exactes, à garder ses identifiants confidentiels et à signaler toute compromission à ${CONTACT_POLITIQUE_CONTENU}.`,
            "L'éditeur peut suspendre un compte en cas de violation des CGU, après en avoir averti son titulaire, sauf urgence ou obligation légale.",
          ],
        },
      ],
    },
    {
      id: "roles",
      title: "Article 3 — Rôles et droits d'accès",
      blocks: [
        {
          type: "paragraph",
          text: "Le Service distingue les rôles suivants, détaillés dans la politique de confidentialité :",
        },
        {
          type: "list",
          items: [
            `administrateur : ${ADMINISTRATEURS.map((administrateur) => administrateur.nom).join(" et ")} uniquement ;`,
            "membre de projet — porteur, éditeur ou lecteur : accès limité aux projets auxquels il est rattaché ;",
            "visiteur : accès aux seules pages publiques.",
          ],
        },
        {
          type: "paragraph",
          text: "Toute tentative d'élévation de privilèges ou de contournement des contrôles d'accès est interdite et peut donner lieu à des poursuites.",
        },
      ],
    },
    {
      id: "service",
      title: "Article 4 — Description du Service et fonctionnalités d'IA",
      blocks: [
        {
          type: "list",
          items: [
            "Le Service propose notamment : contenus créatifs, storyboard, calendrier, budget, recherche de financements, exports de dossiers.",
            "Les fonctionnalités d'intelligence artificielle utilisent des fournisseurs tiers : Anthropic pour l'écriture et l'analyse, OpenAI pour les images de storyboard, Perplexity pour la recherche externe.",
            "Les propositions de l'assistant sont des suggestions modifiables. Elles ne remplacent pas silencieusement un contenu : chacune est acceptée ou écartée explicitement, et les documents gardent leurs versions.",
            "Les informations de financement — sources, dates limites, critères — sont fournies avec leur provenance et leur statut de vérification. Elles peuvent être incomplètes ou obsolètes. L'utilisateur doit les vérifier auprès de l'organisme concerné avant toute candidature. L'éditeur ne garantit l'obtention d'aucun financement.",
            "Les contenus générés par intelligence artificielle peuvent contenir des erreurs. L'utilisateur reste responsable de leur validation et de leur usage.",
          ],
        },
      ],
    },
    {
      id: "disponibilite",
      title: "Article 5 — Disponibilité du Service",
      blocks: [
        {
          type: "paragraph",
          text: "L'éditeur peut interrompre temporairement tout ou partie du Service, notamment pour des raisons de maintenance, de sécurité ou de conformité.",
        },
        {
          type: "paragraph",
          text: "Les demandes à l'assistant sont limitées par un plafond mensuel de dépenses, fixé par l'éditeur. Lorsqu'il est atteint, les nouvelles demandes sont refusées jusqu'au mois suivant ; les fonctions manuelles du Service restent disponibles.",
        },
      ],
    },
    {
      id: "obligations",
      title: "Article 6 — Obligations de l'utilisateur",
      blocks: [
        { type: "paragraph", text: "L'utilisateur s'interdit notamment :" },
        {
          type: "list",
          items: [
            "de téléverser des contenus illicites, diffamatoires ou portant atteinte aux droits de tiers ;",
            "de transmettre des données sensibles sans nécessité ;",
            "de tenter d'accéder aux données d'autres projets ;",
            "de perturber le Service ;",
            "d'extraire massivement des données ;",
            "de saisir dans les zones de texte libre des informations qu'il n'a pas le droit de partager.",
          ],
        },
        {
          type: "paragraph",
          text: "La politique de contenu précise les contenus interdits et la manière de signaler un contenu.",
        },
      ],
    },
    {
      id: "propriete",
      title: "Article 7 — Propriété intellectuelle des contenus",
      blocks: [
        {
          type: "list",
          items: [
            "L'utilisateur conserve l'intégralité des droits sur les contenus qu'il crée ou téléverse.",
            "Il concède à l'éditeur une licence limitée, non exclusive, pour héberger, reproduire et traiter ces contenus aux seules fins de fournir le Service, y compris leur transmission aux fournisseurs d'intelligence artificielle pour exécuter une demande.",
            "L'éditeur n'utilise pas les contenus des utilisateurs pour entraîner ses propres modèles.",
            "Un dossier exporté pèse 5 Mo au plus et se conserve 30 jours.",
          ],
        },
        {
          type: "fields",
          fields: [
            {
              label: "Usage des contenus par les fournisseurs d'intelligence artificielle",
              value: "[À CONFIRMER SELON LEURS CONDITIONS CONTRACTUELLES]",
            },
          ],
        },
      ],
    },
    {
      id: "responsabilite",
      title: "Article 8 — Responsabilité",
      blocks: [
        {
          type: "list",
          items: [
            "Le Service est fourni « en l'état », sans garantie de disponibilité continue. L'éditeur est tenu à une obligation de moyens.",
            "L'éditeur n'est pas responsable des décisions prises sur la base de contenus générés par intelligence artificielle, des interruptions imputables aux prestataires tiers, ni des pertes résultant d'une mauvaise conservation des identifiants.",
            "Rien n'exclut la responsabilité de l'éditeur dans les cas où la loi l'interdit.",
          ],
        },
      ],
    },
    {
      id: "donnees-personnelles",
      title: "Article 9 — Données personnelles",
      blocks: [
        {
          type: "paragraph",
          text: "Le traitement des données personnelles est décrit dans la politique de confidentialité, qui fait partie intégrante des CGU.",
        },
      ],
    },
    {
      id: "modification",
      title: "Article 10 — Modification des CGU",
      blocks: [
        {
          type: "paragraph",
          text: "L'éditeur peut modifier les CGU. La date de dernière mise à jour figure en tête de page.",
        },
      ],
    },
    {
      id: "droit-applicable",
      title: "Article 11 — Droit applicable et litiges",
      blocks: [
        {
          type: "paragraph",
          text: "Les CGU sont régies par le droit camerounais. À défaut de résolution amiable, les tribunaux compétents de Yaoundé sont seuls compétents, sous réserve des règles impératives applicables aux consommateurs ou aux utilisateurs situés dans d'autres juridictions.",
        },
      ],
    },
  ],
};

const CONFIDENTIALITE: LegalDocument = {
  slug: "confidentialite",
  title: "Politique de confidentialité",
  description:
    "Politique de confidentialité de FilmFund Africa : données traitées, systèmes, accès, finalités, destinataires, conservation, sécurité et droits des personnes.",
  updatedAt: "17 octobre 2026",
  sections: [
    {
      id: "objet",
      title: "1. Objet et périmètre",
      blocks: [
        {
          type: "paragraph",
          text: "La présente politique décrit la manière dont FilmFund Africa traite les données à caractère personnel dans le cadre de son site de présentation et de sa plateforme de développement de projets cinématographiques et audiovisuels.",
        },
        {
          type: "paragraph",
          text: "**La plateforme est en service, en accès privé.** L'inscription est fermée : seuls les comptes ouverts par l'éditeur peuvent se connecter. Le site de présentation reste consultable sans compte ; il ne comporte ni formulaire, ni outil de mesure d'audience, ni traceur publicitaire.",
        },
      ],
    },
    {
      id: "responsable",
      title: "2. Responsable du traitement",
      blocks: [
        {
          type: "fields",
          fields: [
            { label: "Responsable du traitement", value: EDITEUR },
            { label: "Siège", value: SIEGE_EDITEUR },
            { label: "Contact données personnelles", value: CONTACT_POLITIQUE_CONTENU },
            { label: "Délégué à la protection des données", value: "Non désigné" },
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
      title: "3. Cadre légal",
      blocks: [
        {
          type: "paragraph",
          text: "Le traitement est effectué conformément au droit camerounais applicable, notamment la loi n° 2010/012 du 21 décembre 2010 relative à la cybersécurité et à la cybercriminalité et la loi n° 2024/017 du 23 décembre 2024 relative à la protection des données à caractère personnel. Pour les utilisateurs situés dans l'Union européenne, les droits prévus par le règlement général sur la protection des données (RGPD) sont également garantis.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "Références légales ci-dessus",
              value: "[À FAIRE VALIDER PAR UN JURISTE]",
            },
            { label: "Autorité de protection des données compétente", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "donnees-actuelles",
      title: "4. Données traitées lors de la consultation du site",
      blocks: [
        {
          type: "paragraph",
          text: "La consultation du site suppose, comme pour tout service accessible en ligne, le traitement technique de certaines données par l'infrastructure qui sert les pages :",
        },
        {
          type: "list",
          items: [
            "adresse IP de connexion et informations transmises par le navigateur (type d'appareil et de navigateur, page demandée, date et heure) ;",
            "journaux techniques et journaux d'erreurs générés automatiquement par l'hébergeur à des fins de fonctionnement, de sécurité et de diagnostic.",
          ],
        },
        {
          type: "paragraph",
          text: "Ces données ne sont pas utilisées pour identifier les visiteurs, ne sont pas recoupées avec d'autres sources et ne font l'objet d'aucun profilage.",
        },
      ],
    },
    {
      id: "donnees-plateforme",
      title: "5. Données traitées pour les titulaires d'un compte",
      blocks: [
        {
          type: "paragraph",
          text: "Pour les titulaires d'un compte, les catégories de données suivantes sont traitées :",
        },
        {
          type: "list",
          items: [
            "données de compte : adresse e-mail, mot de passe conservé sous forme non lisible par le prestataire d'authentification, nom affiché, rôle ;",
            "données de profil renseignées volontairement : prénom, nom, pays, ville, profession, type de profil, photo ;",
            "contenus de projet créés ou importés : fiche du projet, personnages, documents et leurs versions, storyboard et images, budget, financements, planning, matériel, fichiers joints ;",
            "données relatives aux équipes : membres d'un projet, rôles et invitations ;",
            "demandes adressées à l'assistant IA : la demande, la proposition reçue, la décision prise et les unités consommées ;",
            "journal des actions d'administration et données d'usage nécessaires au fonctionnement et à la sécurité du service.",
          ],
        },
        {
          type: "paragraph",
          text: "Le Service ne vise pas à collecter de données sensibles ni de données de mineurs.",
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
      id: "systemes",
      title: "6. Systèmes et données hébergées",
      blocks: [
        {
          type: "list",
          items: [
            "Vercel — hébergement et diffusion de l'interface web : journaux de requêtes (adresse IP, navigateur) ;",
            "Supabase, authentification — gestion des comptes et des sessions : adresse e-mail, identifiant, mot de passe non lisible, dates de connexion ;",
            "Supabase, base de données — données des profils, des projets et de leur production, dossiers exportés, journal d'administration, sous un contrôle d'accès par rôle appliqué à chaque ligne ;",
            "Supabase, stockage — images de storyboard, photos de profil et fichiers téléversés, dans un espace privé ;",
            "Railway — traitements asynchrones : fabrication des dossiers exportés et demandes à l'assistant IA, avec des données de traitement transitoires et des journaux ;",
            "Anthropic, OpenAI et Perplexity — fournisseurs d'intelligence artificielle : les éléments envoyés pour exécuter une demande, toujours depuis le serveur, jamais depuis le navigateur.",
          ],
        },
      ],
    },
    {
      id: "finalites",
      title: "7. Finalités et bases légales",
      blocks: [
        { type: "paragraph", text: "Les traitements poursuivent les finalités suivantes :" },
        {
          type: "fields",
          fields: [
            {
              label: "Fourniture du Service, gestion des comptes",
              value: "Exécution du contrat ou consentement",
            },
            {
              label: "Sécurité, prévention des abus, journalisation",
              value: "Intérêt légitime ou obligation légale",
            },
            { label: "Fonctionnalités d'intelligence artificielle", value: "Exécution du contrat" },
            { label: "Communications de service", value: "Intérêt légitime" },
            { label: "Respect des obligations légales", value: "Obligation légale" },
          ],
        },
      ],
    },
    {
      id: "cookies",
      title: "8. Cookies et traceurs",
      blocks: [
        {
          type: "paragraph",
          text: "Le site ne dépose aucun cookie de mesure d'audience, de publicité ou de réseau social, et n'intègre aucun outil d'analytics.",
        },
        {
          type: "paragraph",
          text: "Les seuls cookies déposés sont ceux strictement nécessaires à la connexion et au maintien de la session des titulaires d'un compte. Tout traceur non essentiel ne serait déposé qu'avec le consentement de l'utilisateur.",
        },
      ],
    },
    {
      id: "destinataires",
      title: "9. Destinataires et prestataires",
      blocks: [
        {
          type: "paragraph",
          text: "Les données ne sont ni vendues, ni louées, ni cédées à des tiers à des fins commerciales.",
        },
        {
          type: "paragraph",
          text: "**Accès interne.** Les comptes disposant du rôle d'administrateur peuvent consulter les comptes, les profils et les projets de l'ensemble des utilisateurs, y intervenir, suspendre un compte et supprimer un projet. Cet accès sert à l'assistance, à la modération des contenus signalés et au traitement des demandes d'effacement. Les actions d'administration sensibles sont journalisées.",
        },
        {
          type: "paragraph",
          text: "**Hébergement.** Les prestataires d'infrastructure suivants sont en service :",
        },
        {
          type: "list",
          items: [
            "Vercel Inc., pour l'hébergement et le déploiement de l'interface web ;",
            "Supabase Inc., pour la base de données, l'authentification et le stockage de fichiers ;",
            "Railway Corp., pour les traitements asynchrones : fabrication des dossiers exportés et demandes à l'assistant IA.",
          ],
        },
        {
          type: "paragraph",
          text: "**Assistant IA.** Lorsqu'un utilisateur demande une proposition à l'assistant, les éléments du projet nécessaires à cette demande sont transmis à un fournisseur de modèles d'intelligence artificielle, qui les traite pour produire la réponse. Rien n'est transmis sans une demande de l'utilisateur, confirmée après l'affichage de son devis. Les fournisseurs en service sont :",
        },
        {
          type: "list",
          items: [
            "Anthropic, pour la rédaction et l'analyse de textes : il reçoit les éléments du projet utiles à la demande ;",
            "OpenAI, pour les images du storyboard : il reçoit la description de la scène à dessiner et de ses plans ;",
            "Perplexity, pour la recherche documentaire : il reçoit la seule question posée.",
          ],
        },
        {
          type: "paragraph",
          text: "Les conditions de traitement propres à chacun de ces fournisseurs s'appliquent aux éléments qu'il reçoit.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "Localisation de la base de données et des fichiers",
              value: "Irlande (région « West EU » de Supabase)",
            },
            {
              label:
                "Localisation des autres traitements (interface, traitements asynchrones, fournisseurs d'IA)",
              value: "[À COMPLÉTER]",
            },
          ],
        },
      ],
    },
    {
      id: "transferts",
      title: "10. Transferts hors du Cameroun",
      blocks: [
        {
          type: "paragraph",
          text: "Certains de ces prestataires sont établis hors du Cameroun, notamment aux États-Unis. Les transferts sont encadrés par les garanties contractuelles disponibles.",
        },
        {
          type: "fields",
          fields: [
            {
              label: "Déclaration ou autorisation auprès de l'autorité de protection compétente",
              value: "[À COMPLÉTER, SI REQUISE]",
            },
          ],
        },
      ],
    },
    {
      id: "acces",
      title: "11. Qui accède à quoi",
      blocks: [
        {
          type: "list",
          items: [
            "pages publiques : lecture par tous ;",
            "comptes : un membre lit et modifie son propre profil ; les administrateurs lisent les comptes et peuvent en suspendre un ;",
            "données d'un projet : aucun accès pour un visiteur ; lecture ou écriture pour ses membres, selon leur rôle ; lecture et intervention pour les administrateurs ;",
            "journal d'administration : lecture par les seuls administrateurs ;",
            "clés des fournisseurs d'intelligence artificielle : saisie et remplacement par les seuls administrateurs ; une clé enregistrée n'est jamais réaffichée ;",
            "plans, quotas et plafond mensuel de dépenses de l'assistant : consultation et ajustement par les seuls administrateurs.",
          ],
        },
      ],
    },
    {
      id: "administrateurs",
      title: "12. Gestion des rôles des administrateurs",
      blocks: [
        {
          type: "paragraph",
          text: "Deux comptes administrateurs nommés sont préenregistrés. Aucun autre compte ne peut obtenir ce rôle par inscription ; toute attribution passe par une action explicite et journalisée.",
        },
        {
          type: "fields",
          fields: ADMINISTRATEURS.map((administrateur) => ({
            label: administrateur.nom,
            value: administrateur.contact,
          })),
        },
        {
          type: "paragraph",
          text: "NGOOH Cédric Hervé, directeur de la publication, est le responsable éditorial et légal : il arbitre les demandes d'exercice de droits, les signalements de contenu et les incidents de sécurité, et valide les changements de rôles.",
        },
        {
          type: "fields",
          fields: [
            { label: "Responsabilités de Romaric SESSUA", value: "[À PRÉCISER]" },
            {
              label:
                "Actions sensibles (rôles, clés des fournisseurs d'IA, suppression de données)",
              value: "[EXÉCUTABLES PAR CHACUN OU AVEC L'ACCORD DE L'AUTRE — À CHOISIR]",
            },
          ],
        },
        {
          type: "list",
          items: [
            "sécurité des comptes administrateurs : mots de passe uniques, révision trimestrielle des accès, révocation immédiate en cas de départ ou de compromission ;",
            "traçabilité : les actions d'administration sensibles sont horodatées et rattachées à leur auteur dans le journal d'administration ;",
            "continuité : en cas d'indisponibilité de l'un des administrateurs, l'autre dispose des droits nécessaires pour maintenir le Service et traiter les urgences ;",
            "secrets techniques : les clés des fournisseurs d'intelligence artificielle sont conservées chiffrées dans la base de données ; aucun secret n'est exposé au navigateur.",
          ],
        },
      ],
    },
    {
      id: "conservation",
      title: "13. Durées de conservation",
      blocks: [
        {
          type: "paragraph",
          text: "Les données sont conservées pour la durée nécessaire aux finalités pour lesquelles elles sont traitées, puis supprimées ou anonymisées, hors obligations légales de conservation.",
        },
        {
          type: "fields",
          fields: [
            { label: "Profils et rôles", value: "[À COMPLÉTER]" },
            { label: "Projets et production", value: "[À COMPLÉTER]" },
            { label: "Versions et validations", value: "[À COMPLÉTER]" },
            { label: "Quotas et usage de l'assistant", value: "[À COMPLÉTER]" },
            { label: "Journal d'administration", value: "[À COMPLÉTER]" },
            { label: "Journaux techniques", value: "[À COMPLÉTER]" },
            { label: "Dossiers exportés", value: "30 jours" },
          ],
        },
        {
          type: "paragraph",
          text: "Une durée est déjà appliquée par la plateforme : un dossier exporté est supprimé trente jours après sa fabrication.",
        },
        {
          type: "paragraph",
          text: "Aucune autre durée n'est annoncée tant qu'elle n'a pas été arrêtée : une durée affichée engage le responsable du traitement.",
        },
      ],
    },
    {
      id: "securite",
      title: "14. Sécurité",
      blocks: [
        {
          type: "paragraph",
          text: "FilmFund Africa met en œuvre des mesures techniques et organisationnelles raisonnables visant à protéger les données contre la perte, l'altération, la divulgation ou l'accès non autorisé. Aucun service numérique ne peut toutefois garantir une sécurité absolue.",
        },
        {
          type: "paragraph",
          text: "Aucune certification de sécurité n'est revendiquée. Les mesures en place sont les suivantes :",
        },
        {
          type: "list",
          items: [
            "l'accès à la plateforme est réservé aux comptes autorisés, et les échanges avec le site sont chiffrés ;",
            "les données sont chiffrées au repos par les prestataires d'hébergement ;",
            "les données d'un projet ne sont accessibles qu'à son équipe et aux administrateurs, par des règles appliquées dans la base de données ;",
            "les fichiers sont conservés dans un espace de stockage privé, sans adresse publique ;",
            "les clés d'accès aux fournisseurs d'intelligence artificielle sont conservées chiffrées, et les appels à ces fournisseurs partent du seul serveur ;",
            "les actions d'administration sensibles sont journalisées.",
          ],
        },
        {
          type: "fields",
          fields: [{ label: "Fréquence des sauvegardes", value: "[À COMPLÉTER]" }],
        },
        {
          type: "paragraph",
          text: "En cas de violation de données, l'éditeur informe l'autorité compétente et les personnes concernées dans les délais légaux.",
        },
      ],
    },
    {
      id: "droits",
      title: "15. Vos droits",
      blocks: [
        {
          type: "paragraph",
          text: "Vous disposez d'un droit d'accès, de rectification, d'effacement, d'opposition, de limitation et de portabilité, ainsi que du droit de retirer votre consentement. Vous pouvez saisir l'autorité de protection des données compétente en cas de désaccord.",
        },
        {
          type: "fields",
          fields: [
            { label: "Adresse pour exercer vos droits", value: CONTACT_POLITIQUE_CONTENU },
            { label: "Délai de réponse", value: "[À COMPLÉTER]" },
          ],
        },
      ],
    },
    {
      id: "mineurs",
      title: "16. Mineurs",
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
      title: "17. Modifications de la présente politique",
      blocks: [
        {
          type: "paragraph",
          text: "La présente politique peut être modifiée pour tenir compte de l'évolution du service, des prestataires utilisés ou de la réglementation applicable. La date de dernière mise à jour figure en tête de page.",
        },
      ],
    },
    {
      id: "contact",
      title: "18. Contact",
      blocks: [
        {
          type: "paragraph",
          text: "Pour toute question relative à la présente politique ou à vos données, contactez :",
        },
        {
          type: "fields",
          fields: [
            { value: EDITEUR },
            { value: SIEGE_EDITEUR },
            { value: CONTACT_POLITIQUE_CONTENU },
            { value: TELEPHONE_EDITEUR },
          ],
        },
      ],
    },
  ],
};

const POLITIQUE_CONTENU: LegalDocument = {
  slug: "politique-de-contenu",
  title: "Politique de contenu et de protection des comptes",
  description:
    "Politique de contenu de FilmFund Africa : contenus interdits, responsabilité des utilisateurs, signalement, modération et protection des comptes.",
  updatedAt: "11 octobre 2026",
  sections: [
    {
      id: "objet",
      title: "1. Objet",
      blocks: [
        {
          type: "paragraph",
          text: "La présente politique définit les règles applicables aux contenus créés, importés ou partagés sur FilmFund Africa, ainsi que les mesures destinées à protéger les comptes des utilisateurs.",
        },
        {
          type: "paragraph",
          text: "Elle s'applique aux projets, documents, images, fichiers et autres contenus que les utilisateurs créent, importent ou partagent sur la plateforme. Ces contenus ne sont pas publics : ils sont accessibles à l'équipe du projet et aux administrateurs de la plateforme.",
        },
        {
          type: "fields",
          fields: [
            { label: "Date d'entrée en vigueur", value: "11 octobre 2026" },
            { label: "Service concerné", value: "FilmFund Africa" },
            { label: "Contact", value: CONTACT_POLITIQUE_CONTENU },
          ],
        },
      ],
    },
    {
      id: "contenus-interdits",
      title: "2. Contenus interdits",
      blocks: [
        {
          type: "paragraph",
          text: "Les utilisateurs ne doivent pas créer, importer ou partager :",
        },
        {
          type: "list",
          items: [
            "des contenus constituant des menaces, du harcèlement ou une incitation à la violence ;",
            "des contenus d'exploitation sexuelle, notamment impliquant des mineurs ;",
            "des données personnelles, identifiants ou informations confidentielles de tiers sans autorisation ;",
            "des contenus portant atteinte aux droits de propriété intellectuelle ;",
            "des logiciels malveillants, tentatives d'hameçonnage, escroqueries ou liens destinés à compromettre les utilisateurs ;",
            "des messages publicitaires non sollicités ou des contenus visant à perturber le fonctionnement du service ;",
            "des contenus interdits par la législation applicable.",
          ],
        },
      ],
    },
    {
      id: "responsabilite",
      title: "3. Responsabilité des utilisateurs",
      blocks: [
        {
          type: "paragraph",
          text: "Chaque utilisateur doit disposer des droits ou autorisations nécessaires pour les contenus qu'il crée, importe ou partage. Il s'engage à ne pas usurper l'identité d'un tiers et à ne pas utiliser le service pour contourner les dispositifs de sécurité.",
        },
      ],
    },
    {
      id: "signalement",
      title: "4. Signalement et modération",
      blocks: [
        {
          type: "paragraph",
          text: "Tout contenu susceptible de contrevenir à cette politique peut être signalé à l'adresse suivante :",
        },
        { type: "fields", fields: [{ value: CONTACT_POLITIQUE_CONTENU }] },
        {
          type: "paragraph",
          text: "Après examen, FilmFund Africa peut retirer un contenu ou suspendre un compte. La mesure retenue tient compte de la gravité des faits, de leur répétition et des risques pour les autres utilisateurs.",
        },
        {
          type: "paragraph",
          text: "L'utilisateur concerné peut demander un réexamen en écrivant à la même adresse. Une mesure immédiate peut être prise lorsqu'un contenu présente un risque urgent pour la sécurité des personnes ou du service.",
        },
      ],
    },
    {
      id: "mots-de-passe",
      title: "5. Protection des mots de passe",
      blocks: [
        {
          type: "paragraph",
          text: "Les utilisateurs doivent choisir un mot de passe unique pour ce service et ne jamais le communiquer à un tiers.",
        },
        {
          type: "paragraph",
          text: "FilmFund Africa ne demande jamais aux utilisateurs de transmettre leur mot de passe par courriel ou par messagerie.",
        },
      ],
    },
    {
      id: "compromission",
      title: "6. Suspicion de compromission",
      blocks: [
        {
          type: "paragraph",
          text: "Lorsqu'une compromission est détectée ou raisonnablement suspectée, FilmFund Africa peut suspendre l'accès du compte concerné. L'utilisateur choisit alors un nouveau mot de passe depuis le lien « Mot de passe oublié » de la page de connexion.",
        },
        {
          type: "paragraph",
          text: "Un utilisateur constatant une activité inhabituelle doit la signaler à l'adresse indiquée à la section 4.",
        },
      ],
    },
    {
      id: "evolution",
      title: "7. Évolution de la politique",
      blocks: [
        {
          type: "paragraph",
          text: "Cette politique peut être mise à jour pour tenir compte de l'évolution du service, des risques de sécurité et des obligations applicables. La date de dernière mise à jour figure en tête de page.",
        },
      ],
    },
  ],
};

const DOCUMENTS: Record<LegalDocument["slug"], LegalDocument> = {
  "mentions-legales": MENTIONS_LEGALES,
  "conditions-utilisation": CONDITIONS_UTILISATION,
  confidentialite: CONFIDENTIALITE,
  "politique-de-contenu": POLITIQUE_CONTENU,
};

/** Renvoie un document légal par son identifiant d'URL : le seul endroit que les pages interrogent. */
export function getLegalDocument(slug: LegalDocument["slug"]): LegalDocument {
  return DOCUMENTS[slug];
}
