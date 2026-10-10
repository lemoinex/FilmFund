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

| Sujet                             | Document à lire si présent                               |
| --------------------------------- | -------------------------------------------------------- |
| État réel, audit et plan des lots | `docs/implementation-audit.md`                           |
| Mode privé                        | `docs/mode-prive.md`                                     |
| Worker, passerelle IA, coûts      | `docs/worker.md`                                         |
| Rôles d’Anthropic et d’OpenAI     | `docs/roles-anthropic-openai-filmfund-africa.md`         |
| Produit, périmètre MVP, rôles     | `docs/product/PRD_MVP.md`                                |
| Découpage, matériel, électricité  | `docs/product/CDC_FRAME_GEAR.md`                         |
| Rubrique « Ressources »           | `docs/product/Claude_Code_Ressources_FilmFund_Africa.md` |
| Règles d’exécution                | `docs/engineering/VIBECODING_RULES.md`                   |
| Sécurité, risques, garde-fous     | `docs/engineering/GUARDRAILS_BACKLOG.md`                 |
| Lots et ordre d’exécution         | `docs/engineering/LOTS_IMPLEMENTATION.md`                |
| Décisions d’architecture          | `docs/decisions/ADR-0001-architecture-and-scope.md`      |
| Landing page                      | `docs/design/LANDING_PAGE_SPEC.md`                       |

Six de ces documents ne sont pas encore versionnés — `PRD_MVP.md`, les trois de
`docs/engineering/`, l’ADR et `LANDING_PAGE_SPEC.md` : signaler leur absence, ne jamais en
supposer le contenu.

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
  (BOARD), Perplexity pour la collecte de la recherche (SCOUT). OpenAI et
  Perplexity sont appelés sans SDK, chacun par une requête écrite dans la
  passerelle, vers une seule adresse : ne pas en installer un, ne pas appeler
  le réseau ailleurs. Perplexity ne génère pas d’image.

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

| Agent  | Responsabilité                                                 |
| ------ | -------------------------------------------------------------- |
| WEAVER | Logline, synopsis, notes d’intention et de réalisation, pitchs |
| SCRIPT | Traitement, bible, scénario                                    |
| VOICE  | Dialogues de fiction et séries                                 |
| SCOUT  | Recherche documentaire                                         |
| GRIOT  | Contexte historique et anthropologique d’Afrique centrale      |
| ARC    | Analyse dramaturgique, personnages et arcs narratifs           |
| FRAME  | Découpage technique et focales                                 |
| GEAR   | Matériel, calculs électriques et générateurs                   |
| BOARD  | Storyboard : croquis à l’encre noir et blanc                   |
| FIELD  | Budget, financement et calendrier                              |
| MATCH  | Financements, scoring et sources                               |

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
- Livré côté serveur (lot K1, action `storyboard_image`, profil
  `board.vignette@1`) : une image par scène, une scène par demande, sur le
  quota d’images. La vignette proposée reste en base (`ai_suggestion_images`) ;
  le worker n’a aucun droit sur le stockage ; `accepter_image_proposee` est le
  seul endroit où une image en remplace une autre. Une clé OpenAI est posée en
  production : BOARD est en service.
- Écran (lot K2) dans la carte de chaque scène (`storyboard/actions-image.ts`,
  `vignette-proposee.tsx`, `lecture-vignettes.ts`, catalogue
  `LIVRABLE_VIGNETTE`). La vignette proposée se lit par sa route
  (`storyboard/vignettes/[imageId]`), sous la session, jamais par lien signé.
  Remplacer une image déjà en place demande un second clic, annoncé avant.

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

### SCOUT

- Livré côté serveur (lot L1, action `research`, profil `scout.recherche@1`) :
  **Perplexity collecte, Anthropic synthétise**. Le moteur rend des pages et ne
  rédige rien ; le modèle ne reçoit que leurs extraits et ne cite qu’eux, par
  renvois « [n] ». Ne pas laisser un moteur rédiger la réponse.
- Seule la question part chez le moteur. Le worker ne visite aucune page : la
  seule adresse de plus est celle de Perplexity, dans la passerelle.
- Toute source naît `non_verifie` ; rien ne la vérifie encore. L’organisme n’est
  pas connu : `site` porte l’hôte de l’adresse, ne pas en déduire un organisme.
- Sources proposées dans `ai_suggestion_sources`, retenues une à une dans
  `project_sources` (`accepter_source_proposee`). La base tire le site de
  l’adresse et relit chaque renvoi : une synthèse qui cite hors de la collecte,
  ou écrit une adresse, est refusée.
- Le coût d’une requête de recherche a son registre
  (`provider_search_charges`), compté dans la dépense du mois ; SCOUT demande
  les deux clés. Ne pas créer un second modèle de source : GRIOT et MATCH
  reprennent celui-ci.
- Écran (lot L2) : onglet « Recherche » (`projets/[id]/recherche/`, catalogue
  `LIVRABLE_RECHERCHE`). Avant tout envoi, il dit que la question seule part
  chez un moteur externe et la remontre. La synthèse reste dans la proposition,
  jamais dans un document ; ses renvois mènent aux sources de la page. Titres et
  extraits viennent du web : affichés comme du texte. « Information non trouvée
  dans la source consultée. » ne se dit que si le moteur n'a rien rendu.
- Validé en recette le 6 octobre 2026. Non mesuré : ce que le moteur rend sur
  l'Afrique centrale — ne pas le présenter comme acquis.

### GRIOT

- Livré (lot L3, action `cultural_context`, profil `griot.contexte@1`) sur le
  socle de SCOUT : même exécuteur, mêmes tables, mêmes coûts. Ne pas lui écrire
  une mécanique à part.
- Sa collecte ne sort pas d'une liste fermée de sites (`DOMAINES_CONTEXTE`, dans
  le profil). Le worker recontrôle ce que le moteur rend. L'écran nomme ces
  sites (`LIVRABLE_CONTEXTE.domaines`) : les deux listes doivent rester égales.
  Changer la liste, c'est publier une version du profil.
- Cette liste dit où chercher, elle ne valide rien : une source de GRIOT naît
  `non_verifie`. Ne jamais présenter ces sources comme vérifiées ou validées.
- Ses consignes sont celles d'un historien : d'où parle la source, de quand, ce
  qui est contesté, à qui l'affirmation s'applique. Ne pas les affaiblir.
- Écran : le choix « Où chercher » de l'onglet « Recherche ».
- Validé en recette le 6 octobre 2026. Vu une fois : un conseil au projet en
  fin de synthèse, sans renvoi. S'il revient, l'interdire dans une version 2.

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
- Livré (lot T1, sans IA, sans migration) : quatre chiffres — projets, documents,
  opportunités à étudier, échéances à trente jours —, le bloc « Opportunités à
  étudier » du projet mis en avant et le bloc « Prochaines échéances »
  (`src/lib/tableau-de-bord.ts`, `tableau-de-bord/chiffres.tsx`,
  `opportunites.tsx`, `echeances.tsx`). « À étudier » veut dire : au moins un
  critère rempli, aucun contredit (`estAEtudier`, calcul du lot L5b) — ne pas
  l'appeler « compatible », ne pas y mettre de pourcentage. « Documents », pas
  « documents générés » : la base ne les distingue pas. Une candidature de
  financement n'y remonte que par la RLS, sans montant.

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
  lit ; le catalogue `LIVRABLES_IA` en est la seule source. Scénario (lot J2a,
  décision 8) : une séquence par demande, décrite par l’équipe, que
  l’acceptation **ajoute à la fin** du document « Scénario » au lieu de le
  remplacer — un scénario ne tient ni dans une proposition (20 000 caractères)
  ni dans un appel. Ne pas relever ce plafond ni écrire un scénario d’un bloc.
  Dialogues (lot J2b-1, agent VOICE) : les répliques d’une scène, désignée par un
  passage du scénario — document, position, longueur, empreinte — que la base relit au
  devis, avant l’appel et à l’acceptation (`passage_du_scenario`). Seul ce passage est
  remplacé ; si le scénario a changé à cet endroit, l’acceptation est refusée. Écran (J2b-2) sous
  l’éditeur du scénario : le navigateur n’envoie que le texte sélectionné, le serveur le
  retrouve dans le document enregistré et calcule position et empreinte
  (`localiserPassage`, `documents/[documentId]/actions-ia.ts`) ; l’encart refuse d’agir sur
  un document non enregistré et recharge la page après une acceptation.
  Note de réalisation, pitch développé et pitch oral (lot X1, agent WEAVER,
  actions `direction_note`, `pitch_extended`, `pitch_oral`) : même chemin que la
  note d’intention, chacun dans son propre type de document — deux livrables qui
  partageraient un type s’écraseraient à l’acceptation. « Pitch » reste la
  logline : ne pas renommer ces deux-là. La durée d’un pitch oral est une
  estimation, que l’écran présente comme telle.
- Personnages proposés (lot X2, agent ARC, action `character_list`, profil
  `arc.personnages@1`, table `ai_suggestion_characters`) : sur le modèle des
  propositions structurées, acceptés ou écartés un à un. ARC lit le projet,
  son concept, sa vision et les personnages déjà saisis ; ni scénario, ni
  document, ni budget. **Il ne propose que des personnages à ajouter** : aucun
  chemin ne réécrit un personnage existant, et un personnage accepté prend la
  dernière place. Cinquante personnages au plus, tenus par la base à
  l’acceptation et au devis. Pour un documentaire, ses consignes lui
  interdisent d’écrire sur une personne réelle ce que le dossier ne dit pas :
  ne pas les affaiblir. Écran dans l’étape « Personnages » de l’assistant
  (`assistant/actions-ia.ts`, `personnages-proposes.tsx`, catalogue
  `LIVRABLE_PERSONNAGES`), ouvert au porteur et aux éditeurs ; un homonyme d’un
  personnage saisi est signalé, jamais refusé.
- Séries : concept, univers, personnages, arcs, saison, épisodes, pilote.
- Épisodes d'une série (lot SE1, sans IA) : livrés — table `project_episodes`,
  règles dans `src/lib/episodes.ts`, page `projets/[id]/episodes/`, ouverte
  depuis la « Fiche » des seules séries et rangée sous cet onglet : la barre
  d'onglets du projet ne change pas. Décisions du 9 octobre 2026 : **une seule
  saison par projet**, un épisode se repère par son numéro, et l'épisode 1 se
  présente comme le pilote — ne pas créer de table de saisons sans décision.
  Mêmes droits que les personnages : toute l'équipe lit, porteur, éditeurs et
  administrateurs écrivent. La base tient trois règles, quel que soit le
  chemin : un épisode n'existe que dans un projet de série ou de web-série
  (`SE001`) ; deux épisodes d'un projet n'ont pas le même numéro ; **un projet
  qui a des épisodes ne quitte pas le format série** (`SE002`) — il faut les
  retirer d'abord, la base ne les supprime jamais d'elle-même. Les épisodes
  entrent dans les exports depuis le lot SE4 ; ils n'entrent pas dans le score
  de maturité, et il a été décidé le 10 octobre 2026 de ne pas y toucher.
- Scénario d'un épisode (lot SE3a, sans IA) : colonne facultative
  `project_documents.episode_id`. La base tient trois règles : **seul un
  scénario se rattache à un épisode**, un épisode a un scénario au plus, et
  l'épisode est celui du même projet (`SE003`). Retirer un épisode ne
  supprime pas son scénario : le lien disparaît, le texte reste, « sans
  épisode ». Rattacher ne crée aucune version. Un scénario sans épisode reste
  possible — celui d'un film, ou d'une série commencée avant ce lot : **ne pas
  le rattacher d'office**. Chaque épisode ouvre ou crée son scénario depuis
  la page des épisodes (`creerScenarioEpisode`, titre tiré du numéro lu en
  base) ; l'éditeur d'un scénario de série dit son épisode et permet de le
  changer (`rattachement.tsx`, `rattacherScenario`), en ne proposant que les
  épisodes sans scénario.
- Scène d'un épisode (lot SE5, agent FRAME, profil inchangé
  `frame.decoupage@1`) : colonne facultative `storyboard_scenes.episode_id`,
  **jamais remplie d'office**. La base refuse l'épisode d'un autre projet
  (`SE005`) ; retirer un épisode ne supprime aucune scène, le lien se vide.
  Aucune politique ne change : la scène se lit de toute l'équipe et s'écrit
  par qui écrit le storyboard. Le formulaire d'une scène propose l'épisode aux
  séries seulement ; un formulaire qui ne porte pas le champ ne touche pas au
  rattachement. FRAME lit, comme la séquence depuis le lot SE3b, **le scénario
  de l'épisode de la scène, et aucun autre** : si cet épisode n'a pas de
  scénario, il n'en reçoit aucun — jamais celui d'un autre épisode —, et
  l'écran le dit avant la demande, scène par scène. Une scène sans épisode ne
  lit que le scénario sans épisode. Pour la scène d'un épisode, les scènes
  précédentes transmises sont celles du même épisode. **Sans épisode, le
  contexte garde exactement sa forme** : pour un film, rien ne change. BOARD,
  GEAR et les exports lisent les scènes sans leur épisode : ne pas l'y ajouter
  sans décision.
- Séquence d'un épisode (lot SE3b, agent SCRIPT, profil inchangé
  `script.scenario@1`, sans changement de schéma) : la demande de séquence
  peut désigner un épisode (`params.episode`), que la base relit dans le
  projet au devis, au contexte et à l'acceptation. La séquence s'ajoute alors
  **au scénario de cet épisode, et à lui seul**, créé en brouillon et
  rattaché s'il n'existe pas. **Sans épisode, la demande ne vise que les
  scénarios sans épisode** — pour un film, rien ne change. SCRIPT reçoit
  l'épisode, la saison (cent épisodes au plus, le début de chaque résumé) et
  la fin de ce scénario ; les scénarios des autres épisodes ne partent pas,
  même finalisés. Épisode retiré avant l'appel : rien ne part ; retiré avant
  l'acceptation : elle est refusée (`SE004`), rien n'est écrit ailleurs.
  Écran sous l'éditeur du scénario d'un épisode : l'encart commun
  (`proposition.tsx`, `episodeId`) y refuse d'agir sur un document non
  enregistré et recharge la page après une acceptation, comme les
  dialogues ; l'encart de l'onglet « Documents » ne suit que les demandes
  sans épisode. L'épisode vient de la page, jamais d'une saisie. Ne pas
  créer un second chemin pour la séquence : étendre celui-ci.
- Épisodes proposés (lot SE2a, agent SCRIPT, action `episode_list`, profil
  `script.episodes@1`, table `ai_suggestion_episodes`) : base et worker
  livrés — sur le modèle des personnages proposés, acceptés ou écartés un à
  un. SCRIPT lit le projet, son concept, sa vision, ses
  personnages, les épisodes déjà saisis et **la bible de série si elle
  existe**, seule parmi les documents ; ni scénario, ni budget. **Il ne
  propose que des épisodes à ajouter** : aucun chemin ne réécrit un épisode
  existant, et un épisode accepté prend le numéro qui suit le plus grand —
  jamais un trou, jamais la place d'un autre. Une ligne proposée porte un
  titre et un résumé : **ni numéro, ni durée**. Douze au plus par
  proposition, 3 unités. Un devis est refusé, avant toute dépense, pour un
  projet qui n'est pas une série ou dont la saison n'a plus de numéro libre.
  Ses consignes lui interdisent de contredire la bible, de numéroter, et
  d'écrire sur une série documentaire ce que le dossier ne dit pas : ne pas
  les affaiblir. Tenu à part de `PROFILS_SCRIPT`, dont chaque entrée est un
  texte (`PROFILS_SCRIPT_EPISODES`, catalogue `LIVRABLE_EPISODES`).
- Écran des épisodes proposés (lot SE2b, sans migration) : encart sur la page
  des épisodes (`episodes/actions-ia.ts`, `episodes-proposes.tsx`). Il dit ce
  qui part chez le fournisseur, bible comprise, avant tout envoi ; rien ne
  part sans devis affiché ni confirmation. Le navigateur ne choisit ni
  l'action, ni les paramètres du devis, ni le numéro d'un épisode. Un épisode
  se corrige avant d'être accepté — titre et résumé, par la lecture d'un
  épisode saisi. **La page se lit de toute l'équipe : un lecteur lit ce qui
  est proposé, sans bouton, et ne voit ni tâche ni demande en cours**
  (`peutDecider` vient de `peut_editer_contenu`, la fonction de la RLS). Un
  titre déjà pris dans la saison est signalé, jamais refusé. « Tout
  accepter » demande une confirmation, suit l'ordre de l'assistant et
  s'arrête au premier refus, en disant combien sont entrés.
- Les documents restent cohérents avec les données de projet et entre eux.
- Éditeur : texte, titres, listes, gras, italique, sauvegarde automatique,
  comparaison de versions. Lot ED, décisions du 8 octobre 2026 : **la mise en
  forme se fera par marqueurs dans le texte** (`# Titre`, `- élément`,
  `**gras**`, `*italique*`), jamais par un éditeur riche — le contenu d’un
  document reste une chaîne de texte, que lisent tels quels les exports, les
  agents, l’ajout d’une séquence et le repérage d’un passage ; **la sauvegarde
  automatique enregistrera un brouillon en cours, sans créer de version**.
- Comparaison de deux versions (lot ED1, sans IA, sans migration) : livrée —
  `documents/[documentId]/comparaison?de=&a=`, calcul dans
  `src/lib/comparaison.ts`. Toujours lue de la plus ancienne à la plus récente ;
  ligne par ligne, puis mot par mot dans une ligne récrite ; une borne de
  calcul, au-delà de laquelle la page le dit. Une lecture seule, ouverte à
  toute l’équipe sous la RLS des versions. Un changement ne se signale jamais
  par la seule couleur. Ne pas créer un second calcul : étendre celui-ci.
- Mise en forme à l’écran (lot ED2a, sans IA, sans migration) : livrée. Cinq
  marqueurs — `# `, `## `, `- ` en début de ligne, `**gras**`, `*italique*` —
  et rien d’autre ; la règle est dans `src/lib/mise-en-forme.ts`, le rendu dans
  `src/components/texte-mis-en-forme.tsx`, qui construit des éléments et
  n’injecte jamais de HTML. La barre d’outils (`documents/barre-outils.tsx`)
  n’écrit que ces marqueurs dans le texte. Un marqueur non refermé reste du
  texte. **Un scénario garde son texte brut** (`TYPES_SANS_MISE_EN_FORME`) : un
  tiret en tête de réplique n’y est pas une puce. La comparaison de versions
  montre le texte brut. Les consignes des agents ne demandent pas de
  marqueurs. Ne pas créer une seconde règle : étendre celle-ci.
- Mise en forme dans les exports (lot ED2b, sans IA, sans migration) : livrée
  en PDF, en Word et dans le ZIP. Le worker ne peut pas importer
  l’application : il tient **une copie de la lecture**
  (`worker/src/exports/mise-en-forme.ts`), que
  `tests/exports-mise-en-forme.test.mjs` refuse de voir différer — changer
  l’une, c’est changer l’autre. Seul le texte d’un document est mis en forme
  (bloc `texte_mis_en_forme` du plan) : **ni un scénario, ni les champs de la
  fiche**. Dans un Word, les titres d’un document sont de niveau 3 et 4, sous
  ceux du dossier.
- Sauvegarde automatique (lot ED3, sans IA) : livrée. Quelques secondes après
  la dernière frappe (`DELAI_BROUILLON_MS`, `src/lib/brouillons.ts`), le titre
  et le texte partent dans `project_document_drafts`, **un brouillon par compte
  et par document, qui ne crée aucune version et ne touche pas au document**.
  Rien d’autre que l’éditeur ne le lit : ni les exports, ni les agents, ni le
  repérage d’un passage. Seul « Enregistrer » modifie le document, et supprime
  le brouillon. Un brouillon trouvé à l’ouverture est **proposé, jamais
  appliqué d’office** ; si le document a été enregistré depuis
  (`base_version`, posé par la base), l’écran le dit. Lu et écrit par son seul
  titulaire, tant qu’il peut éditer le projet ; les administrateurs lisent
  tout, et la suppression du brouillon d’un autre est journalisée. Type et
  statut ne vont pas au brouillon. Ne pas sauvegarder dans
  `project_documents.content` : chaque écriture y crée une version.
- Actions : régénérer, améliorer, raccourcir, développer, corriger. Régénérer,
  c'est redemander un livrable depuis son encart.
- Retouches d'un passage (lot RT1, agent WEAVER, base et worker, sans écran) :
  améliorer, raccourcir, développer, corriger — quatre actions (`text_improve`,
  `text_shorten`, `text_expand`, `text_correct`), chacune son profil
  `weaver.retouche_*@1`, **un seul prix** (`text_edit_per_passage`, 1 unité).
  Une retouche porte sur **un passage sélectionné, jamais sur un document
  entier**, et sur tout type de document. Même mécanique que les dialogues :
  le passage est désigné — document, position, longueur, empreinte — et relu
  par la base au devis, avant l'appel et à l'acceptation
  (`passage_du_document`) ; seul ce passage est remplacé, et si le document a
  changé à cet endroit l'acceptation est refusée. `passage_du_scenario` reste
  celui des dialogues. Le contexte transmis est mince : le passage, ce qui
  l'entoure, le titre et le type du document, quelques repères du projet — ni
  personnages, ni vision, ni budget. Les consignes gardent les marqueurs de
  mise en forme du passage, et « corriger » ne reformule pas : ne pas les
  affaiblir. Tenues à part de `PROFILS_IA` et de `LIVRABLES_IA`, comme les
  dialogues (`PROFILS_RETOUCHE`, `LIVRABLES_RETOUCHE`).
- Écran des retouches (lot RT2, sans migration) : encart « Retoucher un
  passage » sous l'éditeur de tout document (`documents/[documentId]/retouches.tsx`,
  `demanderDevisRetouche` et `appliquerRetouche` dans `actions-ia.ts`), à part
  de celui des dialogues, qui reste sur le seul scénario. Le navigateur
  n'envoie que le texte sélectionné et le nom de la retouche, admis seulement
  parmi les quatre du catalogue ; position et empreinte sont calculées par le
  serveur. L'encart dit ce qui part chez le fournisseur avant tout envoi, et
  rien ne part sans devis affiché ni confirmation. La proposition se lit en
  regard du passage, **avec les deux longueurs et leur écart** : la base ne
  garantit pas qu'un passage « raccourci » soit plus court, ne pas l'écrire.
  Si le texte à cette position n'a plus l'empreinte de la demande, rien n'est
  montré en regard. Comme les dialogues, l'encart refuse d'agir sur un
  document non enregistré et recharge la page après une acceptation.
- Toute génération crée une proposition puis une version ; aucun écrasement silencieux.

### Financement et opportunités

- Suivi des financements d’un projet : livré.
- Catalogue des opportunités (lot L4, sans IA) : livré côté administration
  (`funding_opportunities`, `/administration/opportunites`, `src/lib/opportunites.ts`).
  Une opportunité ne se dit `verifie` qu’avec sa source, sa date de collecte et
  son extrait ; les comptes ne lisent que le vérifié et l’expiré, jamais une
  démonstration ; chaque écriture est journalisée. Une date limite passée ne
  réécrit rien : l’écran présente l’opportunité comme expirée. Ne pas créer un
  second catalogue.
- Consultation (lot L5a, sans IA, sans migration) : rubrique « Opportunités »
  (`/opportunites`, fiche `/opportunites/[id]`, filtres dans `src/lib/opportunites.ts`).
  Les pages des équipes filtrent elles-mêmes sur `STATUTS_VISIBLES` : un
  administrateur n'y lit pas une démonstration. Une liste vide (pays, formats,
  genres) veut dire « non précisé », jamais « tous ». Aucun `loading.tsx` ne
  couvre une fiche ni une page de projet : il ferait répondre 200 à une page absente.
- Filtre par montant (lot OP1, sans IA, sans migration) : dans « Opportunités »,
  une devise puis un montant minimal (`lireFiltreMontant`, `filtrerParMontant`,
  `src/lib/opportunites.ts`). **Deux devises ne se comparent jamais** : le
  catalogue ne porte aucun taux de change, ne pas en supposer un. Une
  opportunité sans montant n'est jamais retenue par ce filtre ; seules les
  devises dans lesquelles le catalogue visible dit un montant sont proposées.
  Tenu à part de `lireFiltres`, appliqué sur les lignes lues, après les autres
  filtres. Le montant reste hors de la compatibilité.
- Compatibilité (lot L5b, sans IA) : onglet « Opportunités » du projet, ouvert à
  toute l'équipe ; règles dans `src/lib/compatibilite.ts`, rien n'est stocké.
  Cinq critères depuis le lot OP2 — type de projet, pays, genre, durée, stade
  d'avancement —, quatre états, **un décompte et non une note** : ni
  pourcentage, ni score sur 100. Le montant n'est pas un critère, et la
  comparaison ne lit ni budget ni financement. Ne pas créer un second calcul :
  étendre celui-ci.
- Langue, durée et stade (lot OP2, sans IA) : quatre colonnes du catalogue —
  `languages` (cinq langues, liste fermée : `LANGUES_OPPORTUNITE`, égale à
  celle de la base), `stages`, `duration_min_minutes`, `duration_max_minutes`.
  Vides ou nulles, elles veulent dire « non précisé », jamais « tout ». **La
  durée se compare à une fourchette, bornes comprises ; le stade comparé est
  l'étape du projet, toujours renseignée.** « À étudier » garde sa règle — au
  moins un critère rempli, aucun contredit — sur cinq critères : un stade ou
  une durée contredits écartent une opportunité du tableau de bord et des
  alertes. **La langue est un filtre, pas un critère** : les langues d'un
  projet sont un texte libre, ne pas les comparer. Filtre tenu à part de
  `lireFiltres` (`lireFiltreLangue`, `filtrerParLangue`), appliqué en dernier,
  proposé seulement si une opportunité lue demande une langue. Ajouter une
  langue, c'est une migration. Thématique et exigences restent sur la fiche.
- Candidature depuis une opportunité (lot U1, sans IA, sans migration) : le bouton
  « Préparer une candidature » de l'onglet « Opportunités » ouvre le formulaire
  des financements, prérempli (`preremplirCandidature`, `?opportunite=<id>`).
  Un lien n'écrit rien ; seule l'action livrée crée la candidature. Le montant
  demandé ne se reprend jamais, le type seulement pour une résidence ou une
  coproduction. Aucune colonne ne relie la candidature à l'opportunité : ne pas
  en ajouter sans décision.
- Veille des opportunités (lot L6, agent MATCH, action `opportunity_watch`,
  profil `match.veille@1`) : livrée. Sur le socle de SCOUT — même collecte
  (`collecter`), mêmes coûts —, MATCH relève dans les extraits rendus par le
  moteur les opportunités qu’ils annoncent : nom, organisme, catégorie, résumé,
  et le rang de la page. **Ni montant, ni date limite, ni pays, ni critère** ;
  l’adresse et l’extrait viennent de la page, jamais du modèle. C’est une tâche
  de l’administration, sans projet ni studio, sans devis ni réservation
  (`demander_veille`) : ne pas la rattacher à un projet. Une opportunité
  acceptée (`accepter_opportunite_proposee`) entre au catalogue `non_verifie` ;
  aucun chemin ne la fait naître vérifiée. Le résumé est celui d’un extrait, pas
  de la page : l’écran le dit, ne pas le présenter autrement. Écran : la section
  « Veille » d’Administration → Opportunités (`actions-veille.ts`, `veille.tsx`,
  catalogue `LIVRABLE_VEILLE`).
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
  Base et worker (J3b-1) et écran dans l'onglet Budget (J3b-2, catalogue
  `LIVRABLES_STRUCTURES`, actions dans `budget/actions-ia.ts`) écrits. Ne pas créer un second modèle de
  proposition structurée : BOARD et MATCH reprennent celui-ci. FIELD ne propose ni
  financeur ni montant de financement.
- Jalons de planning (lot J3b-3a) : même modèle, table `ai_suggestion_milestones`. FIELD
  propose un titre, une phase et une durée, **jamais de date** : l’équipe date le jalon
  en l’acceptant. Les jalons proposés suivent les droits du planning — lus de toute
  l’équipe, décidés par `peut_editer_contenu` —, et le contexte de l’agent ne porte pas
  le budget. Écran dans l’onglet Planning (J3b-3b, actions dans `planning/actions-ia.ts`) :
  les lecteurs y lisent les jalons proposés sans en décider ; l’échéance est proposée
  d’après la durée dès qu’un début est saisi ; « Tout accepter » ajoute des jalons non datés.
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
- Alertes internes (lot W1, sans IA, sans migration) : livrées. **Calculées à la
  lecture, jamais stockées** : ni « lu », ni historique, une alerte disparaît
  avec sa cause. Cinq natures — étape en retard, dossier incomplet, candidature
  à déposer, opportunité bientôt close, étape à venir —, règles et délais dans
  `src/lib/alertes.ts`, lecture bornée dans `alertes/lecture.ts`, écrans
  `/alertes` et bloc « À traiter » du tableau de bord. Les délais (7, 14 et
  30 jours) sont un choix du lot : l’écran le dit. Une candidature n’alerte que
  qui gère le budget, sans son montant. Ne pas créer un second calcul, ni de
  table d’alertes, ni de compteur dans la coque : étendre celui-ci.
- Alerte « nouvelle opportunité » (lot W2, sans IA) : sixième nature, la moins
  pressante. Une opportunité à étudier pour un projet, **vérifiée depuis
  14 jours au plus** ; sans « lu », elle cesse d’être nouvelle passé ce délai.
  La base pose seule `funding_opportunities.verified_at`, à l’instant où le
  statut devient « vérifiée » — ni l’écran ni une requête ne la réécrivent, et
  corriger une opportunité ne la redate pas. Une opportunité vérifiée avant le
  lot n’a pas de date : elle n’est jamais « nouvelle », ne pas lui en inventer
  une. Une opportunité ne donne qu’une alerte par projet : « bientôt close »
  l’emporte.
- Alertes par e-mail : non livrées, écartées le 8 octobre 2026 faute de
  service d’envoi choisi.

### Découpage technique et matériel

- Cahier des charges : `docs/product/CDC_FRAME_GEAR.md` (lot J3c).
- Saisie manuelle écrite (lot J3c-1), sans IA : plans d’une scène du storyboard
  (`scene_shots`, sous chaque scène de l’onglet Storyboard) ; matériel du projet
  (`project_gear`) et réglages électriques (`project_power_settings`), dans
  l’onglet « Matériel ». Mêmes droits que le storyboard. Le cadrage que porte la
  scène reste son cadrage principal.
- **Le besoin électrique est calculé par la plateforme, jamais par un modèle**,
  dans `src/lib/materiel-calculs.ts`, et n’est jamais stocké. 230 V et 30 % par
  défaut sont un choix du lot, pas une norme : l’écran le dit. Ne pas créer un
  second calcul : étendre celui-ci.
- FRAME (lot J3c-2a, action `shot_list`, table `ai_suggestion_shots`) propose
  les plans d’une scène, sur le modèle des propositions structurées : acceptés
  ou écartés un à un, un plan accepté s’ajoutant à la fin de sa scène. Il lit
  le scénario enregistré en entier et le concept du projet ; la scène du
  storyboard dit laquelle découper. Écran (J3c-2b) dans le volet « Découpage »
  de chaque scène (`storyboard/actions-ia.ts`, `plans-proposes.tsx`, catalogue
  `LIVRABLE_DECOUPAGE`) : les lecteurs y lisent les plans proposés sans en décider.
- GEAR (lot J3c-3, action `gear_list`, table `ai_suggestion_gear`) propose des
  équipements sur le même modèle, depuis l’onglet « Matériel »
  (`materiel/actions-ia.ts`, `lignes-proposees.tsx`, catalogue
  `LIVRABLE_MATERIEL`). Il lit le storyboard, le découpage et le matériel déjà
  saisi ; ni scénario, ni budget. Il ne propose ni marque, ni loueur, ni prix,
  ni groupe électrogène, et **ne rend aucun calcul** : une puissance proposée
  est une estimation, facultative, que l’écran présente comme telle.

### Assistant IA

- Point d'entrée (lot AS1, sans IA, sans migration) : livré — rubrique
  `/assistant-ia`, qui mène à la page de chaque projet
  (`projets/[id]/assistant-ia`), ouverte aussi depuis la « Synthèse » et
  rangée sous cet onglet : la barre d'onglets du projet ne change pas.
  Décisions du 10 octobre 2026 : **un annuaire, pas un douzième agent** — la
  page dit ce que l'assistant sait faire, à quel prix, et mène à l'écran où
  la demande se fait. **Elle ne lance rien** : ni action, ni devis, ni
  bouton ; chaque demande garde son encart, son devis affiché et sa
  confirmation. Ne pas y ajouter de demande en texte libre ni de routage par
  un modèle sans décision : ce serait un appel payant de plus.
- Le catalogue est `src/lib/assistant-ia.ts` : vingt-six demandes, rangées
  par besoin, chacune avec son écran et la colonne du barème qui dit son
  prix. `tests/assistant-ia.test.mjs` refuse qu'une action d'un livrable
  (`propositions.ts`) ou qu'un prix du barème y manque : **ajouter un
  livrable, c'est l'inscrire aussi ici**. La veille des opportunités, tâche
  de l'administration, n'y figure pas.
- **Aucun agent n'est nommé à l'écran** : l'équipe voit un assistant. Les
  prix viennent du barème publié, jamais d'une valeur en dur, et la page dit
  que le devis fait foi. Elle se lit de toute l'équipe ; les liens ne se
  montrent qu'au porteur, aux éditeurs et aux administrateurs — la règle de
  `peut_engager_unites`, que les comptes n'appellent pas — et la demande du
  budget qu'à qui le gère (`peut_gerer_budget`). Les épisodes ne se
  proposent qu'à une série.
- Ce qui attend (lot AS2, sans IA, sans migration) : livré, en tête de la
  page du projet — les propositions à décider, puis les demandes en file, en
  cours ou à rapprocher. **Calculé à la lecture, jamais stocké** : ni « lu »,
  ni compteur, et rien ne se décide depuis la page ; chaque entrée mène à son
  écran. Règles dans `src/lib/assistant-ia.ts` (`ceQuiAttend`), lecture
  bornée dans `assistant-ia/lecture.ts` : les cent dernières tâches du
  projet, puis l'existence de leurs propositions.
- **La règle est celle des écrans : la dernière demande de chaque cible** —
  l'action, ou la scène, le document, l'épisode (`cibleDe`). Une demande plus
  récente, même annulée, cache la proposition qui la précède : ne pas lister
  toutes les propositions « proposées » de la base, aucun écran n'ouvrirait
  les plus anciennes. Le parent (`ai_suggestions`) dit seul si quelque chose
  attend : ne pas lire les tables de lignes.
- La lecture ne rapatrie des tâches que l'action, l'état, la date et la
  cible — **jamais le reste des paramètres**, qui porte ce que l'équipe a
  écrit — et des propositions que leur existence, jamais leur contenu. Une
  cible retirée ne donne aucun lien. **Un lecteur ne lit que les propositions
  que leur écran lui montre** (`lecteur` au catalogue : épisodes, matériel,
  jalons, plans, vignette, recherche), jamais une demande en cours ; la
  proposition de budget ne se montre qu'à qui le gère, bien que la base en
  laisse lire le parent à toute l'équipe. Ne pas créer un second calcul, ni
  de table, ni de compteur dans la coque : étendre celui-ci.

### Ressources

- Rubrique « Ressources » (lot AA1, sans IA, sans migration) : livrée —
  `/ressources` et `/ressources/[slug]`, contenus dans `src/lib/ressources.ts`.
  Une bibliothèque de guides, modèles, checklists et références : **des
  contenus versionnés dans le dépôt, pas une table**. Ne pas créer de table, de
  favoris, de notation ni de back-office sans décision.
- **Un contenu est un brouillon tant qu’il n’a pas été validé** : il ne se
  montre qu’à l’administration, sous son étiquette, et son adresse est
  introuvable pour un autre compte. Publier, c’est passer `statut` à
  « publie » et dater `misAJourLe`, après relecture par l’utilisateur — jamais
  d’office.
- Le contenu n’est que du texte, rendu comme tel. Aucun lien dans un texte ;
  une référence externe porte une adresse `https`, sa source et le jour où le
  lien a été vérifié. Ni fonds, ni montant, ni échéance, ni promesse
  d’éligibilité : ce rôle est celui de MATCH. Aucun modèle téléchargeable sans
  fichier réel.
- La rubrique ne génère rien et n’appelle aucun fournisseur.

### Exports et stockage

- Export du dossier en PDF (lots M1 et M2) et en Word (lot M3) : livré. Sections à
  la carte — dont la fiche du projet et ses personnages (lot M4, section
  `fiche_projet`) —, documents finalisés seulement, sans image ; fabriqué par le worker
  (`pdf_export`, `docx_export` : le format est l’action), rangé en base
  (`project_exports`, 5 Mo, 30 jours), lisible du porteur, des éditeurs et des
  administrateurs ; un seul quota d’exports pour tous les formats. Ne pas créer un
  second chemin d’export : étendre celui-ci.
- Découpage et matériel dans le dossier (lot J3c-4, sections `decoupage` et
  `materiel`) : les plans de chaque scène, et le matériel par catégorie, dans les
  trois formats ; deux classeurs de plus dans le ZIP. **Aucun calcul électrique
  n’entre dans un dossier** : ni charge, ni intensité, ni groupe conseillé.
- Épisodes dans le dossier (lot SE4, section `episodes`) : livrés dans les
  trois formats. La saison — numéro, titre, durée, résumé entier — ouvre le
  dossier après la fiche ; l'épisode 1 s'y dit « pilote ». Le scénario d'un
  épisode dit lequel (« Scénario · Épisode N »), **d'après le lien du document
  et non d'après son titre**, et les scénarios se rangent sans épisode
  d'abord, puis par numéro. Un classeur de plus dans le ZIP (`episodes.xlsx`).
  La base admet la section pour tout projet — un film n'a pas d'épisodes, la
  section est vide et omise — ; l'écran ne la propose qu'aux séries
  (`SECTIONS_DE_SERIE`). **Un document sans épisode garde exactement sa
  forme** : l'empreinte d'un dossier déjà fabriqué ne change pas, ne pas
  ajouter de clé à tous les documents. La saison part entière : sa lecture
  est bornée à cinq cents épisodes, la borne d'un numéro.
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
  de maturité, catalogue et veille des opportunités, intégrations IA, plafond
  mensuel et coûts de l’IA, statistiques d’usage, comptes.
- Comptes (lot V1, sans IA) : rubrique « Utilisateurs »
  (`/administration/utilisateurs`, `src/lib/comptes.ts`) — liste, recherche, fiche
  d’un compte, changement de rôle. Les adresses ne se lisent que par
  `comptes_administration()`, réservée aux administrateurs, cent comptes au plus
  par appel : ne pas les lire autrement, ni avec le rôle de service. Le rôle ne
  s’écrit que par `definir_role()`, que le mode privé gèle : l’écran le dit au
  lieu de proposer un changement. Ne pas créer un second chemin.
- Suspension d’un compte (lot V2a, base seule, sans écran) : table
  `account_suspensions`, écrite par les seuls administrateurs. Elle se joue en
  trois endroits, un par chemin d’accès : l’API, par `controle_avant_requete()`
  que PostgREST appelle avant chaque requête (`pgrst.db_pre_request`, code
  `CS001`) ; le stockage, par une politique restrictive ; le worker, par
  `peut_engager_unites_pour()`. **Cette fonction s’exécute pour chaque requête,
  visiteurs compris** : ne pas l’alourdir, et ne jamais y nommer une fonction
  qu’un visiteur n’exécute pas dans une condition qu’il atteint. Un
  administrateur ne se suspend pas et ne peut pas être suspendu. Retour
  d’urgence : `docs/mode-prive.md`. Ne pas ajouter de contrôle de suspension
  table par table.
- Écran de la suspension (lot V2b) : section « Suspension » de la fiche d’un
  compte (`formulaire-suspension.tsx`), étiquette dans la liste. Le compte
  suspendu est renvoyé à `/compte-suspendu` par le middleware, qui interroge
  `compte_suspendu()` sur chaque page protégée et ne réagit qu’au code `CS001`.
  Cette page ne lit rien en base et **ne montre jamais le motif**, réservé à
  l’administration. Ne pas la placer sous la coque de l’application.
- Plafond mensuel des dépenses d’IA (lot Y1, sans IA) : section en tête
  d’« Intégrations IA » (`formulaire-plafond.tsx`, `src/lib/plafond-ia.ts`) —
  dépense du mois, plafond, reste, changement du plafond. La dépense ne se lit
  que par `depense_ia_administration()`, réservée aux administrateurs, qui rend
  le calcul du worker (`depense_ia_du_mois()`, toujours fermée aux comptes) :
  ne pas créer un second calcul. Le plafond s’écrit sous la RLS, journalisé par
  le déclencheur déjà en place. **La borne de saisie de 50 $ est un garde-fou
  de l’écran, décidé avec l’utilisateur, pas une contrainte de la base** : ne
  pas la relever sans décision. Ce plafond est celui de la plateforme ; le
  crédit d’un compte chez son fournisseur est autre chose, et l’écran le dit.
- Coûts de l’IA (lot Z1, sans IA) : rubrique « Coûts de l’IA »
  (`/administration/couts`, `src/lib/couts-ia.ts`) — douze mois, par agent, par
  profil et par modèle. Une seule lecture, `couts_ia_par_mois()`, **exécutée
  sous les droits de l’appelant** : la RLS des registres de coûts décide de ce
  qu’elle voit, et un compte ordinaire reçoit une liste vide. Ne pas la passer
  en `security definer`. La somme du mois est celle du plafond
  (`depense_ia_du_mois()`). Aucun détail par studio ni par projet ; l’écran dit
  que seule la facture du fournisseur fait foi. Ne pas créer un second calcul.
- Statistiques d’usage (lot Z3, sans IA) : rubrique « Statistiques »
  (`/administration/statistiques`, `src/lib/statistiques.ts`) — **des
  comptages, et rien d’autre** : ni nom, ni titre, ni contenu, ni montant, ni
  taux, ni pourcentage. Une seule lecture, `statistiques_usage()`, sous les
  droits de l’appelant, et refusée nommément à qui n’est pas administrateur —
  sans ce refus, un compte ordinaire compterait ses propres projets, qui
  passeraient pour les chiffres de la plateforme. L’écran dit qu’avec très peu
  de comptes un comptage peut désigner quelqu’un : ne pas le présenter comme
  anonyme sans cette réserve. Ne pas créer une seconde lecture : étendre
  celle-ci.
- Lecture des équipes par l’administration (lot Z4) : `project_members` a sa
  règle de lecture pour les administrateurs. Sans elle, le comptage « membres
  d’équipe » ne comptait que les équipes de qui le lisait. **Une lecture sous
  les droits de l’appelant n’est juste que si un administrateur lit en entier
  chaque table qu’elle compte** : `supabase/tests/admin_lit_equipes.test.sql`
  le vérifie table par table, et refuse qu’une table lue par
  `statistiques_usage()` manque à sa liste. Ajouter une table à cette
  lecture, c’est l’y inscrire. La règle ne donne que la lecture : un
  administrateur hors équipe ne change ni ne retire un membre par cette table.
- Écartés le 8 octobre 2026, sans nouvelle demande : la vue des studios et
  abonnements, les alertes par e-mail.

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
