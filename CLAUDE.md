# FilmFund Africa — Instructions Claude Code

Plateforme SaaS privée de préproduction audiovisuelle pour les professionnels
du cinéma africain. Ce fichier définit les règles permanentes du dépôt.

## 1. Ordre de priorité

En cas de conflit, appliquer cet ordre :

1. Sécurité, confidentialité, RLS et intégrité des données.
2. Instructions explicites de l’utilisateur.
3. Architecture et conventions réellement présentes dans le dépôt.
4. Ce fichier `CLAUDE.md`.
5. Documents de produit et backlog.
6. Préférences d’implémentation.

Ne jamais supprimer, simplifier ou déclarer terminé une fonctionnalité métier
sans demande explicite. Une fonctionnalité peut être planifiée ou désactivée,
mais reste dans le backlog.

**Le dépôt est déjà en production.** Ne jamais recréer, renommer ni réécrire un
module livré : l’étendre. `docs/backlog-status.md` fait foi sur ce qui est livré
(voir section 11). En cas de doute, lire le code existant avant de proposer.

## 2. Lecture ciblée

Au début de chaque tâche :

1. Lire `CLAUDE.md`.
2. Lire `docs/backlog-status.md`.
3. Lire `package.json`.
4. Lire uniquement les fichiers, migrations, routes, composants et documents
   directement liés à la tâche.
5. Lire le document métier correspondant seulement si nécessaire :

| Sujet                             | Document à lire si présent                          |
| --------------------------------- | --------------------------------------------------- |
| État réel, audit et plan des lots | `docs/implementation-audit.md`                      |
| Mode privé                        | `docs/mode-prive.md`                                |
| Worker, passerelle IA, coûts      | `docs/worker.md`                                    |
| Rôles d’Anthropic et d’OpenAI     | `docs/roles-anthropic-openai-filmfund-africa.md`    |
| Produit, périmètre MVP, rôles     | `docs/product/PRD_MVP.md`                           |
| Règles d’exécution                | `docs/engineering/VIBECODING_RULES.md`              |
| Sécurité, risques, garde-fous     | `docs/engineering/GUARDRAILS_BACKLOG.md`            |
| Lots et ordre d’exécution         | `docs/engineering/LOTS_IMPLEMENTATION.md`           |
| Décisions d’architecture          | `docs/decisions/ADR-0001-architecture-and-scope.md` |
| Landing page                      | `docs/design/LANDING_PAGE_SPEC.md`                  |

Les six derniers documents ne sont pas encore versionnés : signaler leur absence,
ne jamais en supposer le contenu.

Ne pas lire récursivement le dépôt. Exclure par défaut `.next/`, `node_modules/`,
lockfiles, fichiers binaires, logs et gros fichiers non liés. Ne pas refaire un
audit complet quand l’état est déjà décrit dans le backlog.

## 3. Démarrage d’un lot

Avant toute écriture :

1. Auditer les fichiers ciblés et les dépendances directes.
2. Identifier les conventions existantes, flux Auth, RLS, migrations, routes,
   Storage, variables d’environnement, appels externes, coûts et tests.
3. Vérifier le statut du lot dans `docs/backlog-status.md`.
4. Répondre avec :

```md
## État observé

## Analyse

## Plan proposé

## Fichiers concernés

## Risques et sécurité

## Validation prévue

## Décision requise
```

Un plan se termine par : « Puis-je exécuter ce plan et modifier uniquement les
fichiers listés ? »

Attendre une confirmation explicite avant toute action qui modifie l’état local
ou distant : fichiers, dépendances, configuration, migrations, Supabase, secrets,
Git, GitHub, Vercel, Railway. Une autorisation ne couvre que l’action ou le lot
nommé. Les actions en lecture seule sont libres : lire des fichiers,
`git status`, `git diff`, `git log`, `npm run lint`, `npm run build`, `npm test`.

Après accord, terminer entièrement le lot approuvé : code, migration si nécessaire,
tests ciblés, validations disponibles et rapport honnête. Travailler par tranches
verticales : interface, validation, données réelles, sécurité, états UX, vérification.

## 4. Stack et workflow

- GitHub est le dépôt de référence : branches, PR, issues et GitHub Actions.
  Ne jamais utiliser ni proposer GitLab.
- Vercel : application Next.js et previews.
- Supabase : PostgreSQL, Auth, Storage, Realtime, migrations et RLS.
- Railway : worker (`worker/`), APIs spécialisées, cron ou traitements longs.
- Stack : Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, npm.
- Branches : `feature/*`, `fix/*`, `chore/*`, `docs/*`.
- Pas de push direct vers `main`.
- Ne jamais faire commit, push, PR, merge, déploiement, migration de production,
  modification distante, suppression ou changement de secret sans confirmation
  distincte.
- Vérifier les scripts disponibles dans `package.json` avant toute commande.
- Proposer les commandes Windows en PowerShell lorsque utile.
- Commits en français, Conventional Commits, **signés** : Vercel exige des commits
  vérifiés et annule la prévisualisation d’un commit non signé.

Avant tout commit proposé, comme la CI :

```text
npm run lint
npm run typecheck
npm run format:check
npm run build
npm test              # pile Supabase locale requise : npm run db:start
npx supabase test db  # tests SQL (pgTAP)
```

Livraison : branche, PR, CI verte, fusion, puis `supabase db push` précédé de
`--dry-run`, puis vérification en production. Chaque étape distante sur accord.

## 5. Règles immuables

- Préserver l’architecture réelle du dépôt : ajouts minimaux, typés, réversibles.
- Ne pas installer de dépendance sans nécessité démontrée.
- Ne pas renommer, déplacer, supprimer, réinitialiser ni remplacer massivement
  sans cartographier les usages, signaler l’impact et obtenir confirmation.
- Ne jamais inventer une fonctionnalité, un test, une donnée, une source,
  un résultat fournisseur ou un statut de déploiement. Ne jamais déclarer un test
  exécuté s’il ne l’a pas été.
- Ne jamais écrire, afficher, logger, retourner ou committer une clé, secret,
  mot de passe, token, payload sensible ou chaîne de connexion.
- Les valeurs réelles vivent dans `.env.local`, dans les variables Vercel et
  Railway, ou dans les secrets GitHub Actions. Séparer local, recette, production.
- `.env`, `.env.local`, `.next/`, `node_modules/` restent ignorés par Git.
- `.env.example` contient seulement les noms et explications non sensibles.
- Toute variable `NEXT_PUBLIC_*` est considérée publique.
- Tout accès privilégié Supabase reste côté serveur. Si une requête a besoin du
  rôle de service, c’est que la politique RLS est à revoir.
- Toute entrée utilisateur est validée côté serveur.
- Toute mutation vérifie session, rôle, studio/projet, payload et journalise
  les opérations sensibles ; une action d’administration est journalisée dans la
  même transaction que son effet.
- Une suggestion IA reste modifiable, comparable et acceptée explicitement ;
  elle n’écrase jamais silencieusement un contenu ou une version approuvée.
- En cas de fuite de secret : révoquer d’abord chez le fournisseur, puis traiter
  Git, les logs et l’historique.
- Paiements : ne jamais choisir un prestataire, créer un paiement réel ni simuler
  une intégration comme si elle était active.
- Ne jamais afficher « abonnement disponible », « paiement sécurisé », « essai
  gratuit », « annulation à tout moment », « facture » ou « remboursement » tant
  que le paiement n’existe pas. Aucune statistique fictive.

## 6. Données, Auth et RLS

- Mode actuel : accès privé, deux administrateurs préenregistrés, inscription
  fermée. Ne pas lever le mode privé ni rouvrir l’inscription sans décision
  explicite (`docs/mode-prive.md`).
- Déjà en place, verrouillés par le mode privé : inscription, connexion,
  déconnexion, mot de passe oublié, profil et page de profil, studios (socle),
  équipes de projet et invitations. Ne pas les recréer.
- Rôles existants : `member` et `admin` (`profiles.role`, `is_admin()`) ;
  `owner`, `editor`, `viewer` dans un projet ; rôles de studio.
- Profil : nom affiché, prénom, nom, pays, ville, profession et type (`AUTHOR`,
  `DIRECTOR`, `PRODUCER`), lisibles du titulaire et des administrateurs seulement ;
  les équipes ne reçoivent que le nom affiché. Le type n’est pas un rôle d’accès.
  Photo de profil (lot Q2) : même visibilité, compartiment privé `profile-photos`
  sous `<compte>/`, octets réels contrôlés avant rattachement.
- Ne jamais dériver un rôle, studio, entitlement ou accès projet depuis le client.
- Chaque accès est fondé sur l’utilisateur authentifié et son adhésion réelle.
- Tout accès aux données de projet est protégé par RLS et testé entre au moins
  deux utilisateurs et deux studios. Cas à couvrir : porteur, éditeur, lecteur,
  administrateur, compte étranger, jeton expiré, adhésion révoquée.
- Le worker agit avec un contexte explicite par tâche ; une adhésion révoquée est
  revérifiée avant d’exécuter une tâche en attente.

### Supabase

- Toute évolution de schéma passe par une migration SQL versionnée dans
  `supabase/migrations/`, jamais à la main dans l’interface Supabase.
- Migrations non destructives, réversibles ou documentant ce qui ne l’est pas.
- Ne jamais modifier une migration déjà appliquée : écrire une nouvelle migration.
- Toute table nouvelle active RLS dans la même migration, avec ses policies.
- **Toute table nouvelle et tout compartiment de stockage reçoivent la politique
  restrictive « Mode privé : administrateurs uniquement »** ;
  `supabase/tests/mode_prive.test.sql` le vérifie.
- **Les administrateurs ont accès à tout** : toute table nouvelle leur donne
  lecture et écriture via `public.is_admin()`.
- Ne jamais désactiver RLS globalement ni contourner RLS sans validation.
- **Supabase accorde l’exécution de toute nouvelle fonction à `anon` et
  `authenticated`.** Une fonction `security definer` retire ces droits nommément
  (`revoke all ... from public, anon, authenticated`), puis ne rend que ceux
  nécessaires. Une fonction appelable par les comptes est ajoutée à la liste de
  `supabase/tests/privileges_fonctions.test.sql`.
- Toute migration de droits, rôles ou policies reçoit un test dans `tests/` (API)
  ou `supabase/tests/` (pgTAP). Un test qui ne peut pas échouer ne protège rien :
  vérifier qu’il tombe quand la protection est retirée.
- Stockage : jamais de compartiment public ; liens signés ; policies sur
  `storage.objects` fondées sur le projet en tête du chemin (`projet_du_chemin`).
- Ne jamais utiliser `supabase config push` sans `supabase config diff` : le
  fichier local assouplit la sécurité pour le développement.

## 7. Interface et qualité

- Interface, contenu et commentaires : français. Code, fichiers, variables et
  fonctions : anglais. Un commentaire explique pourquoi, pas quoi.
- Composants serveur par défaut. `"use client"` uniquement au niveau le plus bas utile.
- Fichiers `kebab-case`, composants `PascalCase`, fonctions `camelCase`,
  constantes partagées `SCREAMING_SNAKE_CASE`.
- Routes : `src/app/`. Composants réutilisables : `src/components/`.
- Pas de `any` sans justification.
- Utiliser les jetons de `globals.css`, pas de valeurs visuelles arbitraires.
- Mobile first : 375 px, 768 px, 1440 px.
- HTML sémantique, WCAG AA, focus clavier visible, reduced motion, équivalent
  accessible pour tout texte porté par une image ou une icône.
- Landing : noir / ivoire / or. Application authentifiée : bleu nuit / ivoire / or.

Une fonction est terminée si elle inclut : interface responsive, validation,
données réelles ou mock explicitement limité, contrôle d’accès serveur/RLS si
nécessaire, états loading/vide/erreur/succès, test ou contrôle manuel documenté.

## 8. Couche IA unique

**La couche existe : ne pas en créer une seconde.** Tout nouvel appel à Anthropic,
OpenAI, un modèle local, une recherche IA ou une génération d’images s’y ajoute.

```text
Action serveur (Next.js) : session, droits, devis, réservation
        ↓  (la base crée la tâche ; l’application n’appelle jamais un fournisseur)
Worker Railway, rôle PostgreSQL `filmfund_worker` sans droit sur les tables
        ↓
Agent : `worker/src/agents/`
        ↓
Passerelle : `worker/src/ia/passerelle.ts` — seul fichier important un SDK d’IA
        ↓
Fournisseur
```

- Profils versionnés (modèle, effort, plafond de sortie, consignes, tarifs) :
  `worker/src/ia/profils.ts`. Changer un profil, c’est publier une nouvelle version.
- Garde-fous en place : règle de lint et `tests/architecture.test.mjs` contre tout
  import de SDK hors passerelle.
- Répartition des fournisseurs : Anthropic pour le texte, OpenAI pour l’image
  (BOARD). Aucun SDK OpenAI n’est installé aujourd’hui.

### Exigences IA

- Tous les appels sont serveur uniquement.
- Le client ne choisit jamais librement fournisseur, modèle, budget ou limites.
- Le contexte d’exécution explicite comprend : studio, utilisateur, projet, rôle,
  plan, agent, action, version de document, quota et profil autorisé.
- Les paramètres coûteux ou non autorisés provenant du client sont rejetés.
- Les entrées et sorties sont validées par schéma lorsque possible.
- Toute requête vérifie : session → autorisation → limite de débit → quota →
  devis/réservation → provision du coût → appel fournisseur → coût confirmé →
  journalisation non sensible → règlement/restitution.
- Plafond mensuel des dépenses d’IA vérifié avant chaque appel (`ai_settings`).
- Aucun réessai automatique après une coupure : l’issue est inconnue, la tâche
  passe « à rapprocher ». Aucune bascule payante entre fournisseurs.
- Les sous-appels partagent le budget racine et les limites cumulées.
- Le contexte d’une génération suit l’ordre : projet, contexte, personnages,
  vision, documents, puis objectif. La longueur visée vient du profil versionné,
  jamais d’une valeur en dur dans une route ou un composant.
- Les appels payants, images, recherches ou paiements réels exigent une autorisation
  explicite et un budget de test défini.
- Les tests utilisent des fournisseurs factices, désignés comme tels, jamais de
  requêtes réelles. Un mock ne prouve pas qu’un agent fonctionne : livrer la part
  testable et documenter ce qui reste à valider en recette.
- Les clés IA sont exclusivement serveur ; jamais dans un préfixe public, Git,
  logs, fixtures, migrations, table en clair ou réponses API.
- Une configuration IA d’administration ne réaffiche jamais une clé sauvegardée.

**Les clés des fournisseurs ne sont pas des variables d’environnement.** Elles se
posent depuis **Administration → Intégrations IA**, par un administrateur, et
vivent chiffrées dans `vault.secrets`. Seul le worker les lit, par
`cle_fournisseur()`, réservée à son rôle, relue toutes les 60 secondes : poser
une clé met l’agent en service, la retirer l’en sort, sans redéploiement.
L’écran ne réaffiche jamais une clé enregistrée ; chaque changement est
journalisé, sans la valeur. `tests/architecture.test.mjs` refuse qu’un fichier
relise `ANTHROPIC_API_KEY` ou `OPENAI_API_KEY`.

Ce que ce choix déplace : un accès SQL au projet Supabase, ou le mot de passe du
worker, permet de déchiffrer la clé. Activer la journalisation complète des
requêtes PostgreSQL l’écrirait dans les journaux.

### Agents V1

Les onze agents font partie de la V1, sans être nécessairement activés en même
temps. Ce sont des profils internes, traçables par l’exécution et la facturation.

| Agent  | Responsabilité                                              |
| ------ | ----------------------------------------------------------- |
| WEAVER | Logline, synopsis court/standard/détaillé, note d’intention |
| SCRIPT | Traitement, bible, scénario                                 |
| VOICE  | Dialogues de fiction et séries                              |
| SCOUT  | Recherche documentaire                                      |
| GRIOT  | Contexte historique et anthropologique d’Afrique centrale   |
| ARC    | Analyse dramaturgique, personnages et arcs narratifs        |
| FRAME  | Découpage technique et focales                              |
| GEAR   | Matériel, calculs électriques et générateurs                |
| BOARD  | Storyboard : croquis à l’encre noir et blanc                |
| FIELD  | Budget, financement et calendrier                           |
| MATCH  | Financements, scoring et sources                            |

L’utilisateur voit un copilote unifié, pas onze applications séparées.

Un agent/opération reste désactivé tant que son fournisseur, ses limites, son
budget, ses permissions et ses tests ne sont pas validés. WEAVER/logline (appelée
« pitch » à l’écran) est le premier flux livré ; ses synopsis et sa note d’intention
suivent le même chemin (lot I2a), profils versionnés dans `worker/src/ia/profils.ts`.

### BOARD

- Visuels : croquis à l’encre noir sur fond blanc uniquement.
- Interdire couleur, photoréalisme, 3D et peinture numérique colorée.
- Centraliser cette contrainte dans le profil/prompt image, avec des tests de
  conformité. Ne pas modifier un prompt existant qui la respecte déjà.
- Une image par panneau lorsque le produit le nécessite.
- Quota image séparé du quota texte.
- Conserver plans, focales et annotations dans des données structurées hors image.
- Ne jamais remplacer une vignette approuvée sans action explicite.
- Pour un lot partiel : consommer uniquement les images livrées, libérer le solde
  réservé, conserver les réussites et retourner un état par vignette.
- Préparer les contrats sans générer d’image réelle sans autorisation.

## 9. Recherche et financement

Concerne SCOUT, GRIOT et MATCH.

- Ne jamais inventer preuve, URL, source, date, montant, opportunité ou critère.
- Toute donnée affichée comme réelle conserve : source/URL, organisme, date de
  collecte, extrait utile, statut (`non_verifie`, `verifie`, `expire`,
  `introuvable`, `demo`) et incertitude.
- Distinguer : non fourni, non trouvé, absent de la source et démonstration.
  Formulations : « Information non trouvée dans la source consultée. » et
  « Information non fournie. »
- Un résultat démo n’est jamais présenté comme réel.
- Un score de compatibilité est une aide à la décision, jamais une garantie.
- Centraliser les limites de recherche, pagination, retry, domaines autorisés et
  profondeur de crawl ; les tester.
- Mutualiser les sources publiques seulement si la séparation avec les données
  privées studio/projet est garantie.
- Avant tout fetch externe : HTTPS uniquement, refus de localhost/plages privées/
  métadonnées cloud, redirections limitées et revalidées, timeout, taille maximale,
  validation de contenu, aucun cookie/token interne transmis.

## 10. Fonctionnalités produit à préserver

**Le schéma existant fait foi.** Les listes ci-dessous décrivent l’intention
produit : les réaliser par migrations additives, sans renommer l’existant.

### Authentification et profils

- Inscription, connexion, déconnexion, récupération de mot de passe : livrés.
- Page de profil (`/profil`) : livrée (lot Q1) — nom affiché, prénom, nom, pays,
  ville, profession, type. Photo de profil : livrée (lot Q2).
- Ouverture publique reportée jusqu’à décision explicite ; le mode privé actuel
  reste prioritaire.

### Tableau de bord

- Accueil : « Bienvenue, [Prénom] » — livré ; le nom affiché à défaut de prénom.
- Statistiques : projets, documents générés, opportunités compatibles, échéances.
- Cartes projet : titre, genre, statut, dernière modification, score de maturité.
- Opportunités recommandées : fonds, montant, date limite, compatibilité sourcée.
- Chaque chiffre affiché est calculé sur des données réelles.

### Projets et assistant de création

- CRUD de projet : livré. Un projet appartient à son porteur (`owner_id`) et à un
  studio (`studio_id`), pas à un `user_id`.
- Existant : titre, format (`format`), étape (`stage`), logline, synopsis, couverture ;
  fiche (lot R1) : genre, pays de production (`countries`, le premier est le
  principal), langues, durée, synopsis court, thème, enjeux, vision artistique,
  objectifs, public cible ; personnages (`project_characters`, modèle du storyboard).
- Formats : documentaire, long métrage, court métrage, série, web-série, animation.
- Étapes : idée, développement, écriture, préproduction, production,
  postproduction, terminé.
- Assistant : livré (lots R1 et R2) — informations générales, concept,
  personnages, enjeux, vision, objectifs, public cible (`src/lib/assistant.ts`,
  `projets/[id]/assistant/`). Le projet naît à la première étape ; chaque étape
  suivante complète sa fiche ; le récapitulatif est l'onglet « Fiche ».

### Documents et édition

- Documents et versions (sauvegarder, modifier, restaurer) : livrés.
- Générations livrées : logline (pitch) ; synopsis court, standard et détaillé,
  note d’intention (lots I2a et I2b). Un texte accepté atterrit à sa place :
  pitch et synopsis dans le projet, synopsis court dans la fiche, synopsis
  détaillé et note d’intention dans un document versionné, créé en brouillon.
  Traitement et bible de série (lot J1), par l’agent SCRIPT, dans un document
  eux aussi ; analyse dramaturgique (lot J3a), par l’agent ARC, qui lit le
  projet sans le réécrire. L’encart de l’assistant se tient dans la rubrique où ce texte se
  lit ; le catalogue `LIVRABLES_IA` en est la seule source. Prévues : note de
  réalisation, personnages, pitch oral/écrit, scénario et dialogues — ces deux
  derniers dépassent les 20 000 caractères d’une proposition, et leur
  livraison reste à décider.
- Séries : concept, univers, personnages, arcs, saison, épisodes, pilote.
- Les documents restent cohérents avec les données de projet et entre eux.
- Éditeur : texte, titres, listes, gras, italique, sauvegarde automatique,
  comparaison de versions.
- Actions : régénérer, améliorer, raccourcir, développer, corriger.
- Toute génération crée une proposition puis une version ; aucun écrasement silencieux.

### Financement et opportunités

- Suivi des financements d’un projet : livré. Base d’opportunités : non livrée.
- Données : nom, organisme, description, site, pays, pays éligibles, types de
  projet, genres, budgets min/max, devise, ouverture, date limite, candidature,
  exigences, statut, source, dates.
- Catégories : fonds, subvention, résidence, festival, laboratoire, atelier,
  coproduction, bourse, forum de pitch.
- Filtres : pays, genre, type projet, montant, langue, deadline, type.
- Recherche plein texte.
- Matching, d’après : type, pays, genre, durée, stade, thématique, budget, exigences.
  Résultat : raisons, conditions remplies/manquantes, documents requis, échéance,
  montant et lien sourcé.
- Un score affiché inclut des critères compréhensibles et son incertitude.

### Project Readiness Score

Score sur 100. Pondération par défaut : concept 20, narration 15,
personnages 15, vision artistique 15, faisabilité 10, budget 10, plan de
financement 5, potentiel marché 5, dossier 5. Critères, pondérations et
recommandations (« à améliorer ») sont configurables et traçables.

- Calcul et encart : livrés (lot S1). Le score mesure ce qui est renseigné dans
  le projet, pas la qualité de l'écriture, et l'écran le dit. Il se montre au
  porteur, aux éditeurs et aux administrateurs : il tient compte du budget.
- Pondérations versionnées en base (`readiness_weight_versions`, total 100, en
  ajout seul) ; faits du projet par `faits_maturite()`, sous la RLS de
  l'appelant ; calcul dans `src/lib/maturite.ts`. Rien n'est stocké. Ne pas
  créer un second score : étendre celui-ci.
- Score sur les listes et publication des pondérations : livrés (lot S2). Les
  listes lisent les faits en lot par `faits_maturite_projets()` — cent projets
  au plus, seuls ceux dont l'appelant gère le budget. L'administration publie
  une version depuis « Score de maturité » (`/administration/ponderations`) ;
  elle s'applique aussitôt à tous les projets.

### Budget, financement, calendrier

- Budget, planning et suivi des financements : écrans livrés.
- Propositions structurées (décision 9, lot J3b-1) : FIELD propose des lignes de budget.
  La proposition garde son parent dans `ai_suggestions` et ses lignes dans
  `ai_suggestion_budget_lines`, acceptées ou écartées une à une ; elles suivent
  `peut_gerer_budget`, et le texte du parent, écrit par la base, ne porte aucun montant.
  Base et worker livrés, écran à venir (J3b-2). Ne pas créer un second modèle de
  proposition structurée : BOARD et MATCH reprennent celui-ci. FIELD ne propose ni
  financeur ni montant de financement.
- Budget audiovisuel, lignes prévues :
  - développement : recherche, écriture, repérages ;
  - préproduction : casting, préparation, autorisations ;
  - production : réalisateur, techniciens, matériel, transport, hébergement,
    restauration, décors, costumes ;
  - postproduction : montage, étalonnage, sound design, mixage, sous-titrage,
    mastering ;
  - distribution : festivals, communication, marketing.
- Plan de financement : budget total, producteur, fonds, télévision, coproducteur,
  investisseur, sponsor et autres ; calculer acquis, recherché et pourcentage.
- Calendrier : développement, préproduction, tournage, postproduction, distribution.
- Alertes internes et e-mail, non livrées : opportunité, deadline, dossier
  incomplet, matching.

### Exports et stockage

- Export du dossier en PDF (lots M1 et M2) et en Word (lot M3) : livré. Sections à
  la carte — dont la fiche du projet et ses personnages (lot M4, section
  `fiche_projet`) —, documents finalisés seulement, sans image ; fabriqué par le worker
  (`pdf_export`, `docx_export` : le format est l’action), rangé en base
  (`project_exports`, 5 Mo, 30 jours), lisible du porteur, des éditeurs et des
  administrateurs ; un seul quota d’exports pour tous les formats. Ne pas créer un
  second chemin d’export : étendre celui-ci.
- ZIP du projet (lot M5, action `zip_export`) : livré. Un fichier Word par texte
  (présentation, puis un par document finalisé), un classeur Excel par tableau
  (budget, plan de financement, planning), où nombres et dates restent des nombres
  et des dates. Les classeurs sont écrits par le worker (`worker/src/exports/xlsx.ts`),
  sans bibliothèque Excel.
- Stockage privé et limite de stockage par plan : livrés. Les photos de profil sont
  hors quota de studio (2 Mo, une par compte).
- Contrôler les octets avant/à la réception, type/taille réels et expiration
  des uploads incomplets.
- Ne pas refaire un export identique déjà disponible.
- Les limites de stockage n’empêchent pas la lecture/téléchargement de fichiers existants.

### Crédits, abonnements et administration

- Les « crédits IA » sont les unités déjà en place : plans versionnés (Gratuit,
  Pro, Studio), quotas mensuels, barème d’unités texte, devis et réservations.
  Ne pas créer un second système de crédits.
- Plans, prix, quotas et barème restent configurables par l’administration ;
  aucune utilisation IA illimitée implicite.
- Admin livré : journal d’administration, plans et quotas, pondérations du score
  de maturité.
- Admin prévu : utilisateurs (consulter, suspendre, rôles), opportunités (ajouter,
  modifier, supprimer, vérifier), statistiques anonymisées, fournisseurs/modèles/
  coûts/limites IA, abonnements.

## 11. État et ordre de mise en œuvre

`docs/backlog-status.md` est la source de vérité : lots A à P, avec leur statut.
Toujours le lire avant de commencer ; ne jamais replanifier un lot livré.

Les onze agents restent dans le plan V1. Leur activation est progressive, avec
contrôle des coûts, tests, permissions et validation métier.

## 12. Definition of Done

Une livraison est terminée si :

- Les fonctionnalités du lot validé sont présentes sans régression connue.
- Le contrôle d’accès serveur et la RLS nécessaires sont actifs et testés.
- Les validations d’entrée/sortie et états UX existent.
- Aucun secret ou appel fournisseur direct non autorisé n’a été introduit.
- Les migrations sont versionnées et les tests de sécurité ajoutés si nécessaires.
- Les validations disponibles ont été exécutées honnêtement.
- Le rapport final comprend :

```md
TICKET
STATUT
PROBLÈME OBSERVÉ
FICHIERS MODIFIÉS
ÉLÉMENTS RÉUTILISÉS
INVARIANTS PRÉSERVÉS
MIGRATIONS ET STRATÉGIE DE RETOUR ARRIÈRE
TESTS EXÉCUTÉS ET RÉSULTATS
TESTS NON EXÉCUTÉS ET MOTIF
RISQUES RÉSIDUELS
PROCHAINE ACTION
```

Un rapport de travail local se termine par : « Le travail local est terminé.
Souhaitez-vous que je prépare un commit ? »

Deux statuts de fin sont distincts : validé localement, et validé en recette
(conditions réelles, fournisseurs réels).

Ne pas commit, push, ouvrir de PR ou déployer sans confirmation explicite.
