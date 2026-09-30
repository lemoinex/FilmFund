# Audit d'implémentation — FilmFund Africa

Audit réalisé le 30 septembre 2026 sur `main` (`60064ca`), en lecture seule, avant toute
intégration des directives de fiabilité, de sécurité et de contrôle des coûts
(`claude-code-directives-integration-filmfund-africa.md`).

Chaque affirmation ci-dessous a été vérifiée dans le code ou dans la base locale, qui
correspond exactement aux migrations (`supabase db diff` : aucun écart). Quatre statuts sont
employés : **existant**, **partiel**, **absent**, **inconnu**.

---

## 1. Synthèse

Le dépôt est une application **Next.js 16 + Supabase**, sans backend séparé. Elle couvre le
parcours de développement d'un projet — projet, équipe, budget, documents, storyboard,
planning, financements, images — avec une isolation par projet éprouvée par 160 tests
d'intégration et 7 tests SQL.

**Aucune des briques coûteuses visées par les directives n'existe encore** : aucun appel à
un fournisseur d'IA, de recherche, d'image, de PDF ou de paiement ; aucun agent ; aucune
file de tâches, aucun worker, aucun webhook ; aucun quota, registre de coûts ou abonnement.
La plupart des directives décrivent donc des garde-fous **à concevoir avec ces briques**,
et non des corrections de l'existant.

Trois écarts concernent en revanche le code actuel et peuvent être traités sans attendre de
décision produit :

1. **Aucun journal des actions d'administration** (suppression de projet, changement de
   rôle, bascule du mode privé).
2. **Les documents ne sont pas versionnés** : chaque enregistrement écrase le précédent.
   C'est un prérequis avant toute génération par un agent.
3. **Un envoi d'image interrompu peut laisser un fichier orphelin** dans le stockage.

Plusieurs directives supposent enfin des décisions qui n'ont pas été prises : existence d'un
« studio », fournisseur d'IA, infrastructure de tâches asynchrones, plans commerciaux,
prestataires de paiement. Elles sont listées en section 11 ; aucune architecture n'a été
inventée pour les combler.

---

## 2. Arborescence utile

```text
.github/workflows/ci.yml        CI GitHub Actions (qualité + sécurité)
CLAUDE.md                       Règles du projet (font autorité)
README.md
docs/
  mode-prive.md                 Activation et levée du mode privé
  implementation-audit.md       Ce document
public/images/                  Visuels de la vitrine (landing)
src/
  middleware.ts                 Rafraîchit la session, garde les routes
  app/
    page.tsx                    Vitrine
    mentions-legales/, confidentialite/
    (auth)/                     Connexion, inscription, mot de passe, accès réservé
      actions.ts
    auth/                       Routes : confirmation, réinitialisation, déconnexion
    (app)/                      Espace connecté (mise en page + gardes)
      layout.tsx, navigation.tsx
      tableau-de-bord/          Page, chargement, erreur, invitations reçues
      documents/, storyboard/   Vues transverses de la barre latérale
      projets/
        actions.ts              Créer, modifier, supprimer un projet
        actions-equipe.ts       Invitations, rôles, retrait de membres
        nouveau/
        [id]/                   Synthèse, équipe, onglets
          budget/, documents/, storyboard/, planning/, financements/, images/
  components/
    landing/                    Vitrine
    ui/                         Formulaires, onglets, confirmation, avancement,
                                couverture, envoi d'image
  lib/
    supabase/                   Clients serveur et navigateur, middleware, garde,
                                liens d'images, types générés
    acces-prive.ts              Liste blanche du mode privé
    budgets.ts, documents.ts, storyboard.ts, planning*.ts,
    financements*.ts, images.ts, equipes.ts, mes-projets.ts, projets.ts
    use-message-formulaire.ts
supabase/
  config.toml
  migrations/                   13 migrations
  rollbacks/                    Retour arrière du mode privé (non appliqué)
  tests/                        Tests SQL pgTAP
tests/                          Tests d'intégration Node (API Supabase réelle, locale)
```

**Correspondance avec les chemins indicatifs des directives** : il n'y a ni `backend/`, ni
`frontend/` séparés, ni `docs/adr/`, ni `docs/runbooks/`. La logique serveur vit dans les
actions serveur de Next.js (`src/app/**/actions.ts`) et dans la base (politiques RLS,
fonctions SQL). Ces dossiers ne sont pas créés artificiellement.

---

## 3. Stack réellement utilisée

| Rôle                                  | Réalité                                                                                | Statut      |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| Frontend et logique serveur           | Next.js 16.3.6 (App Router, actions serveur), React 19.2.8, TypeScript, Tailwind CSS 4 | existant    |
| Base, Auth, stockage                  | Supabase : PostgreSQL, Auth e-mail + mot de passe, Storage (1 compartiment privé)      | existant    |
| Accès aux données                     | `@supabase/supabase-js` 2 et `@supabase/ssr` ; aucun ORM                               | existant    |
| Migrations                            | SQL versionnées dans `supabase/migrations/`, appliquées par `supabase db push`         | existant    |
| Hébergement frontend                  | Vercel, projet `filmfund-africa`, configuration par défaut (aucun `vercel.json`)       | existant    |
| CI                                    | GitHub Actions (`.github/workflows/ci.yml`)                                            | existant    |
| Backend Python / FastAPI              | Aucun dans ce dépôt                                                                    | absent      |
| Railway, workers                      | Aucun                                                                                  | absent      |
| File de tâches, cache, cron, n8n      | Aucun                                                                                  | absent      |
| Fournisseurs d'IA (OpenAI, Anthropic) | Aucun SDK, aucune clé, aucun appel                                                     | absent      |
| Recherche, génération d'image, PDF    | Aucun                                                                                  | absent      |
| Paiement (Orange Money, MTN MoMo…)    | Aucun                                                                                  | absent      |
| E-mail transactionnel                 | Uniquement celui de Supabase Auth (confirmation, réinitialisation)                     | existant    |
| GitLab CI                             | Aucune référence dans le dépôt                                                         | absent      |
| Ancien projet FastAPI                 | Mentionné dans une session antérieure ; ni dans ce dépôt, ni sur ce poste              | **inconnu** |

Dépendances de production : `next`, `react`, `react-dom`, `@supabase/supabase-js`,
`@supabase/ssr` — rien d'autre.

---

## 4. Commandes

| Usage                            | Commande                                               | Ligne de base (`60064ca`) |
| -------------------------------- | ------------------------------------------------------ | ------------------------- |
| Lint                             | `npm run lint`                                         | 0 problème                |
| Types                            | `npm run typecheck`                                    | 0 erreur                  |
| Format                           | `npm run format:check`                                 | conforme                  |
| Build                            | `npm run build`                                        | réussi                    |
| Tests d'intégration et unitaires | `npm test` (fichiers en série, `--test-concurrency=1`) | **160 / 160**             |
| Tests SQL                        | `supabase test db`                                     | **7 / 7** (2 fichiers)    |
| Base locale                      | `npm run db:start`, `db:stop`, `db:reset`              | —                         |
| Écart base / migrations          | `supabase db diff`                                     | aucun écart               |
| Types générés                    | `npm run db:types`                                     | à jour                    |

**Aucun échec préexistant.** Les tests d'intégration s'exécutent contre une pile Supabase
locale (Docker), avec de vrais comptes et de vraies lignes : la RLS ne se simule pas.

La CI rejoue tout cela sur chaque pull request, sur une base neuve (`supabase db reset`), et
vérifie que les types générés correspondent au schéma. Les commits sont signés : le projet
Vercel exige des commits vérifiés pour ses prévisualisations.

---

## 5. Base de données

### 5.1 Migrations

| Migration                                       | Objet                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `20260929092712_profiles_et_roles`              | Profils, rôle applicatif (`member`, `admin`), `is_admin()`, garde-fou sur les rôles |
| `20260929092713_projets_de_film`                | Projets, format, étape                                                              |
| `20260929142730_droits_administration`          | Lecture et suppression des projets par les administrateurs ; `definir_role`         |
| `20260929144616_retablit_execution_is_admin`    | Correction des droits d'exécution de `is_admin()`                                   |
| `20260929200048_equipes_de_projet`              | Membres, invitations, rôles d'équipe, `acces_au_projet()`                           |
| `20260929202735_revoque_fonctions_declencheurs` | Retrait de l'exécution directe des fonctions de déclencheur                         |
| `20260929210000_budgets`                        | Budget et lignes, `peut_gerer_budget()`                                             |
| `20260929220000_mode_prive_administrateurs`     | Interrupteur `app_settings`, politiques restrictives, gel des membres et des rôles  |
| `20260929233921_documents`                      | Documents, `peut_editer_contenu()`                                                  |
| `20260930003828_storyboard`                     | Scènes, `deplacer_scene()`                                                          |
| `20260930010431_planning`                       | Étapes datées                                                                       |
| `20260930013630_financements`                   | Candidatures, pièces du dossier (clés composites)                                   |
| `20260930020639_images`                         | Compartiment `project-images`, politiques de stockage, chemins d'images             |

Toutes sont additives. La RLS est activée dans la migration qui crée chaque table.

### 5.2 Tables

| Table                 | RLS | Politiques | dont restrictives                      |
| --------------------- | --- | ---------- | -------------------------------------- |
| `profiles`            | oui | 5          | 1                                      |
| `projects`            | oui | 9          | 1                                      |
| `project_members`     | oui | 4          | 1                                      |
| `project_invitations` | oui | 4          | 1                                      |
| `project_budgets`     | oui | 4          | 1                                      |
| `budget_lines`        | oui | 5          | 1                                      |
| `project_documents`   | oui | 5          | 1                                      |
| `storyboard_scenes`   | oui | 5          | 1                                      |
| `project_milestones`  | oui | 5          | 1                                      |
| `project_fundings`    | oui | 5          | 1                                      |
| `funding_documents`   | oui | 4          | 1                                      |
| `app_settings`        | oui | 1          | 0 (porte l'interrupteur du mode privé) |

Stockage : compartiment `project-images`, privé, 5 Mo, JPEG/PNG/WebP ; 4 politiques
permissives et 1 restrictive (mode privé).

### 5.3 Fonctions

| Fonction                                                                       | `security definer` | Exécutable par `authenticated`                                 |
| ------------------------------------------------------------------------------ | ------------------ | -------------------------------------------------------------- |
| `is_admin()`                                                                   | oui                | oui                                                            |
| `acces_au_projet(uuid)`                                                        | oui                | oui                                                            |
| `email_confirme_courant()`                                                     | oui                | oui                                                            |
| `equipe_du_projet(uuid)`                                                       | oui                | oui                                                            |
| `mes_invitations()`                                                            | oui                | oui                                                            |
| `accepter_invitation(uuid)`                                                    | oui                | oui                                                            |
| `refuser_invitation(uuid)`                                                     | oui                | oui                                                            |
| `definir_role(text, user_role)`                                                | oui                | oui                                                            |
| `peut_gerer_budget(uuid)`                                                      | non                | oui                                                            |
| `peut_editer_contenu(uuid)`                                                    | non                | oui                                                            |
| `mode_prive()`                                                                 | non                | oui                                                            |
| `projet_du_chemin(text)`                                                       | non                | oui                                                            |
| `deplacer_scene(uuid, boolean)`                                                | non                | oui                                                            |
| `definir_pieces_candidature(uuid, uuid[])`                                     | non                | oui                                                            |
| `handle_new_user()`, `empecher_changement_de_role()`                           | oui                | non (déclencheurs)                                             |
| `empecher_changement_de_porteur()`, `geler_gestion_membres()`, `geler_roles()` | non                | non (déclencheurs)                                             |
| `touch_updated_at()`                                                           | non                | oui (déclencheur ; exécution directe inoffensive mais inutile) |

Toutes ont un `search_path` figé. Aucune n'est exécutable par `anon`, ce que vérifie un test
SQL. La liste des fonctions `security definer` ouvertes aux comptes connectés est fermée :
toute nouvelle fonction fait échouer la CI tant qu'elle n'y est pas ajoutée.

### 5.4 Déclencheurs

`on_auth_user_created` (création du profil), horodatage `*_avant_update` sur 8 tables,
`profiles_avant_update` (rôles), `projects_porteur_immuable`, et trois déclencheurs du mode
privé (`profiles_roles_mode_prive`, `project_members_mode_prive`,
`project_invitations_mode_prive`).

---

## 6. Authentification, autorisation, isolation

### 6.1 Ce qui existe

- **Authentification** : Supabase Auth, e-mail et mot de passe. Confirmation d'adresse
  exigée en production ; inscriptions fermées tant que le mode privé est actif. Aucun OAuth,
  aucun lien magique.
- **Identité côté serveur** : `getUser()` (jeton vérifié auprès du serveur d'authentification),
  jamais `getSession()`. Le middleware, la mise en page de l'espace connecté et chaque action
  serveur (`exigerAcces`) revérifient l'utilisateur.
- **Aucun rôle ni identifiant de projet n'est cru sur parole** : les droits sont calculés en
  base à partir de `auth.uid()` (`acces_au_projet`, `peut_editer_contenu`,
  `peut_gerer_budget`, `is_admin`). Un identifiant forgé renvoie zéro ligne, sans divulguer
  l'existence de la ressource (même 404).
- **Rôles** : administrateur global (`profiles.role = 'admin'`) ; par projet, porteur
  (`projects.owner_id`), éditeur, lecteur (`project_members`). Le rôle vit en base, jamais
  dans les métadonnées du jeton.
- **Mode privé** : application réservée à une liste blanche (variables serveur) et, en base,
  aux administrateurs. Actif en production depuis le 29 septembre 2026. Voir
  `docs/mode-prive.md`.

### 6.2 La notion de « studio » n'existe pas

Les directives raisonnent par **studio** : une organisation qui regroupe des membres, des
projets, un plan et des quotas. **Le schéma n'a pas cette notion.** L'unité d'isolation est
le **projet**, et chaque projet a sa propre équipe.

Conséquences :

- Les tests d'« accès croisé entre deux studios » existent sous la forme **accès croisé entre
  deux projets** : `cloisonnement`, `equipes`, `budgets`, `documents`, `storyboard`,
  `planning`, `financements`, `images`. Ils couvrent projets, documents, fichiers, budgets
  et candidatures.
- Il n'y a ni studio_id à ignorer, ni plan, ni quota à rattacher à un studio.
- Introduire des studios est une **décision produit** (section 11), qui conditionne le modèle
  des quotas et des paiements. Rien n'est créé en attendant.

### 6.3 Écarts constatés sur l'existant

| Constat                                                                                                                                                | Statut                                  | Portée                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Aucune action d'administration n'est journalisée : suppression de projet par un administrateur, `definir_role`, bascule de `app_settings` (SQL direct) | **absent**                              | Directive « journaliser avant exécution » non respectée                                                                         |
| Quatre politiques anciennes appellent `public.is_admin()` sans `(select …)` (`profiles` ×2, `projects` ×2)                                             | partiel                                 | Performance seulement ; les politiques récentes utilisent la forme recommandée                                                  |
| Huit fonctions `security definer` vivent dans le schéma `public`, exposé par l'API                                                                     | partiel                                 | Chacune vérifie son appelant et est couverte par des tests ; les directives préfèrent un schéma non exposé « lorsque possible » |
| Jeton expiré                                                                                                                                           | existant                                | L'accès est refusé (middleware + `getUser()`), mais aucun test automatisé ne le couvre                                          |
| Adhésion révoquée                                                                                                                                      | existant pour l'accès synchrone (testé) | Sans objet pour les tâches asynchrones, qui n'existent pas                                                                      |
| Connexion SQL ou pool réutilisé                                                                                                                        | sans objet                              | Aucune connexion directe : tout passe par l'API Supabase, requête par requête                                                   |

### 6.4 Conflit entre règles à arbitrer

La directive 10 demande que **le support n'obtienne pas un accès général aux œuvres,
scénarios ou dossiers**. La règle actuelle du projet, décidée par l'utilisateur, est inverse :
**les administrateurs ont accès à tout** — ils lisent tous les projets, documents, budgets et
candidatures, et suppriment tout projet (sans en modifier le contenu). Rien n'est changé tant
que ce point n'est pas tranché (section 11).

---

## 7. Appels fournisseurs

**Aucun.** Recherche faite dans `src`, `supabase/migrations`, `package.json` et la CI :

- aucun SDK OpenAI, Anthropic ou autre SDK d'IA ;
- aucun appel `fetch` sortant dans `src` ;
- aucune clé fournisseur dans `.env.example` ni dans le code ;
- la clé secrète Supabase n'est utilisée nulle part dans `src` (tests locaux uniquement,
  avec les clés publiques par construction de la pile Docker).

Seuls services externes appelés : Supabase (Auth, base, stockage), avec la clé publiable et
la session de l'utilisateur.

---

## 8. Tâches, workers, webhooks, automatisations

**Aucun.** Pas de file de tâches, pas de worker, pas de webhook entrant, pas de tâche
planifiée, pas de n8n. Toutes les opérations sont synchrones : action serveur → requête
Supabase → réponse.

Conséquence technique à prendre en compte : les fonctions Vercel ont une durée d'exécution
limitée. Une génération par un agent (texte long, lot d'images, recherche) ne pourra pas
s'exécuter de façon fiable dans une action serveur ; elle supposera une infrastructure
asynchrone qui reste à choisir (section 11).

---

## 9. Paiement, quotas, usage, coûts, journalisation

| Élément                                                 | Statut                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Plans, abonnements                                      | absent                                                                                                          |
| Quotas (texte, images, PDF, stockage, projets, membres) | absent — seule limite : 5 Mo par image, imposée par le compartiment                                             |
| Registre des droits commerciaux                         | absent                                                                                                          |
| Registre des coûts fournisseurs                         | absent (aucun fournisseur)                                                                                      |
| Registre des paiements                                  | absent                                                                                                          |
| Devis, réservations, idempotence                        | absent — les doubles envois sont seulement limités côté interface (bouton désactivé pendant l'envoi)            |
| Journal d'audit                                         | absent                                                                                                          |
| Montants                                                | `numeric` en base, calculs en centimes entiers côté application ; aucun flottant pour les sommes — **conforme** |

---

## 10. Matrice exigence → existant → écart → action minimale

### 10.1 Directives transverses

| Exigence                                                            | Existant                                                                                                                                                         | Écart                                                                                            | Action minimale proposée                                                                                                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Passerelle IA unique**                                         | Aucun appel IA                                                                                                                                                   | Rien à migrer                                                                                    | À créer **avec le premier agent**, pas avant ; y adjoindre dès l'origine une règle de lint interdisant l'import direct des SDK hors de la passerelle           |
| **2. Isolation et autorisation serveur**                            | Isolation par projet, calculée en base, testée pour chaque table et le stockage                                                                                  | Pas de studio ; pas de test « jeton expiré »                                                     | Décision sur les studios ; ajouter le test manquant                                                                                                            |
| **2. Journalisation des actions d'administration**                  | Aucune                                                                                                                                                           | Absente                                                                                          | Table de journal en ajout seul ; journalisation **avant** exécution dans les actions d'administration                                                          |
| **3. Trois registres distincts**                                    | Aucun registre                                                                                                                                                   | Tout est à concevoir                                                                             | Après décision sur les plans et les fournisseurs ; trois tables séparées, montants en `numeric`, écritures compensatoires plutôt que suppressions              |
| **4. Devis, réservation, idempotence**                              | Aucun                                                                                                                                                            | Tout est à concevoir                                                                             | Avec les registres ; réservation atomique en SQL (verrou de ligne ou contrainte), clé d'idempotence unique par (portée, action, clé) avec empreinte de requête |
| **5. Tâches persistantes, outbox**                                  | Aucune file                                                                                                                                                      | Tout est à concevoir                                                                             | Choisir **une** infrastructure (section 11) ; outbox transactionnelle dans PostgreSQL, états explicites, rapprochement des échecs ambigus                      |
| **6. Sources et financements**                                      | Candidatures saisies par l'utilisateur ; aucun catalogue ni score, pour ne pas inventer de données — **conforme dans l'esprit**                                  | Pas de modèle de source, pas de provenance                                                       | À concevoir avec SCOUT, GRIOT et MATCH : source, horodatage, extrait, statut de vérification, marquage des démonstrations                                      |
| **7. Stockage**                                                     | Compartiment privé, liens signés d'une heure, taille et type imposés par Supabase, chemins contraints au projet, fichiers effacés avec leur scène ou leur projet | Envoi interrompu entre le dépôt du fichier et son rattachement : fichier orphelin, jamais expiré | Registre des envois en attente et nettoyage des orphelins ; ou rattachement préalable du chemin                                                                |
| **7. Quota de stockage**                                            | Aucun                                                                                                                                                            | Absent                                                                                           | Avec les registres de droits ; la consultation des fichiers existants reste toujours possible                                                                  |
| **7. Exports PDF**                                                  | Aucun                                                                                                                                                            | Absent                                                                                           | À concevoir, avec cache par empreinte du contenu pour ne pas facturer deux fois un export identique                                                            |
| **8. Paiements**                                                    | Aucun                                                                                                                                                            | Absent                                                                                           | Aucun code avant décision, sandbox et contrat réels (Orange Money, MTN MoMo…)                                                                                  |
| **9. Interface des quotas**                                         | Aucune                                                                                                                                                           | Absente                                                                                          | Étendre le tableau de bord et les pages existantes, pas de page concurrente                                                                                    |
| **10. Exceptions financières, alertes**                             | Aucune                                                                                                                                                           | Absente                                                                                          | Avec les registres                                                                                                                                             |
| **Versions de documents**                                           | Un document a un seul contenu ; chaque enregistrement l'écrase                                                                                                   | **Écart direct avec « aucune version utilisateur écrasée »**                                     | Table de versions en ajout seul ; chaque enregistrement crée une version ; prérequis avant toute génération                                                    |
| **Contexte de génération** (projet, personnages, vision, documents) | Projet, pitch, synopsis, documents, storyboard existent                                                                                                          | Personnages, bible, vision absents                                                               | À créer avec ARC et SCRIPT                                                                                                                                     |
| **Longueurs documentaires configurables**                           | Limites de stockage seulement (200 000 caractères par document)                                                                                                  | Pas de spécifications de longueur                                                                | À créer avec WEAVER et SCRIPT, dans une configuration versionnée                                                                                               |
| **Données absentes affichées comme absentes**                       | Appliqué partout : « Non renseigné », « Aucune scène », aucun pourcentage inventé                                                                                | —                                                                                                | Conserver ; en faire une règle de revue pour les agents                                                                                                        |
| **Secrets**                                                         | Aucun secret dans le dépôt ; `.env.example` sans valeur ; variables serveur sans préfixe public                                                                  | —                                                                                                | Conserver                                                                                                                                                      |

### 10.2 Les onze agents

**Aucun agent n'existe.** Tous sont à créer, derrière la passerelle unique, un par un.

| Agent  | Données existantes sur lesquelles il pourrait s'appuyer                 | Manquant avant de le construire                                                                                           |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| WEAVER | `projects.logline`, `projects.synopsis`, documents « note d'intention » | Versions de documents, passerelle, quotas                                                                                 |
| SCRIPT | Documents « traitement », « scénario »                                  | Idem, plus la bible et les personnages                                                                                    |
| VOICE  | —                                                                       | Personnages, versions                                                                                                     |
| SCOUT  | —                                                                       | Modèle de sources, fournisseur de recherche, protections des requêtes sortantes                                           |
| GRIOT  | —                                                                       | Idem, et sources validées sur l'Afrique centrale                                                                          |
| ARC    | —                                                                       | Table des personnages                                                                                                     |
| FRAME  | Scènes (décor, lieu, moment, cadrage)                                   | Versions des scènes, validation d'un découpage                                                                            |
| GEAR   | —                                                                       | Modèle de matériel, règles de calcul électrique à valider par un spécialiste                                              |
| BOARD  | Scènes et images de planches (envoyées par l'utilisateur aujourd'hui)   | Fournisseur d'image, quota image, profil imposant le croquis à l'encre noir et blanc, protection des vignettes approuvées |
| FIELD  | Budget (lignes, postes, devise), planning                               | Passerelle, validation des sorties                                                                                        |
| MATCH  | Candidatures, plan de financement                                       | Catalogue sourcé d'organisations et d'appels, score explicable — jamais présenté comme une garantie                       |

**Exigence BOARD** : il n'existe aujourd'hui aucun prompt de storyboard. La contrainte du
croquis à l'encre noir et blanc sera portée par le profil central de BOARD dès sa création,
avec un test de conformité.

---

## 11. Décisions et informations manquantes

Ces points bloquent les lots correspondants. Aucune hypothèse n'a été retenue à leur place.

1. **Studio** : faut-il une organisation au-dessus des projets (membres, plan, quotas
   communs) ? Si oui, comment s'articule-t-elle avec les équipes de projet existantes ?
2. **Accès du support** : maintenir « les administrateurs ont accès à tout », ou restreindre
   l'accès aux contenus, comme le demande la directive 10 ?
3. **Fournisseur d'IA** : lequel, quels modèles, quel budget de test autorisé, quelles données
   du projet ont le droit de lui être transmises ? La politique de confidentialité devra le
   mentionner.
4. **Infrastructure asynchrone** : les générations ne tiennent pas dans une action serveur
   Vercel. Options possibles, à arbitrer : file PostgreSQL (Supabase Queues) avec un worker
   sur Railway, fonctions Supabase, autre. Une seule doit être retenue.
5. **Plans commerciaux** : unités (texte, images, PDF, stockage, projets, membres), volumes
   par plan, périodes.
6. **Paiements** : prestataires, contrats et bacs à sable réellement disponibles.
7. **Recherche et image** : fournisseurs, conditions d'usage, coûts.
8. **Exports PDF** : format attendu des dossiers, génération côté serveur ou côté navigateur.
9. **Ancien projet FastAPI** : existe-t-il encore, et doit-il être rapproché de ce dépôt ?

---

### Décisions prises le 30 septembre 2026

| #   | Sujet                            | Décision                                                                                                                                                                                                                        | Conséquence                                                                                 |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Studio                           | **Oui** : une organisation au-dessus des projets                                                                                                                                                                                | Lot E à concevoir ; l'isolation par projet actuelle est conservée à l'intérieur d'un studio |
| 2   | Accès du support                 | **Non tranché**                                                                                                                                                                                                                 | La règle actuelle reste en vigueur : les administrateurs ont accès à tout                   |
| 3   | Fournisseurs d'IA                | Couche unique `AIService`, configurée par variables d'environnement. **Texte** : Anthropic par défaut pour les agents narratifs et analytiques, OpenAI utilisable selon la configuration. **Image** : OpenAI pour le storyboard | Lot I ; aucune clé ni aucun appel tant que le budget de test n'est pas autorisé             |
| 4   | Tâches asynchrones               | **Table de tâches PostgreSQL + worker Node sur Railway**, réclamation par `FOR UPDATE SKIP LOCKED`                                                                                                                              | Voir ci-dessous                                                                             |
| 5   | Plans, paiements, recherche, PDF | Principe accepté ; **volumes, prix, prestataires et formats restent à préciser**                                                                                                                                                | Lots F, K, L, M, N toujours bloqués sur ces valeurs                                         |

**Pourquoi une table de tâches dans PostgreSQL plutôt qu'une file externe.** La tâche naît
dans la même transaction que la réservation de quota : l'outbox exigée par la directive 5
est native, et une tâche ne peut pas se perdre entre la base et la file. Aucune brique
supplémentaire n'est ajoutée : Railway est déjà désigné dans `CLAUDE.md` pour les tâches de
fond, et un worker n'y subit pas les limites de durée des fonctions Vercel ou Supabase.
La réclamation par `FOR UPDATE SKIP LOCKED` garantit qu'une tâche n'est prise que par un
seul worker ; les états et le rapprochement des échecs ambigus restent à concevoir au lot H.

## 12. Risques de régression et dépendances externes

- **Isolation** : chaque nouvelle table doit recevoir sa RLS dans la même migration, la
  politique restrictive du mode privé et ses tests ; la CI le vérifie en partie (test SQL de
  couverture). Le risque principal serait une fonction `security definer` ajoutée sans
  contrôle de l'appelant : la liste fermée des fonctions ouvertes limite ce risque.
- **Mode privé** : toute nouvelle route protégée doit être ajoutée à `ROUTES_PROTEGEES` dans
  le middleware.
- **Formulaires** : React 19 réinitialise un formulaire après son action ; deux défauts de ce
  type ont déjà été corrigés. Tout nouvel éditeur à listes déroulantes doit le prendre en
  compte.
- **Versions de documents** : les introduire modifiera le chemin d'enregistrement de
  l'éditeur ; les tests existants des documents devront être étendus, pas remplacés.
- **Durée d'exécution Vercel** : toute opération longue lancée depuis une action serveur
  risque l'interruption.
- **Dépendances externes non validées** : aucune pour l'instant ; chaque fournisseur
  ajouté devra être validé en recette, et non sur la foi d'un faux fournisseur de test.

---

## 13. Plan de changements minimaux

Ordre proposé, fondé sur les dépendances réelles du dépôt. Les lots A à D ne dépendent
d'aucune décision de la section 11 ; les suivants, si.

| Lot   | Ticket                                                          | Dépend de        | Migration                                                                                                                                                | Tests à ajouter                                                                                               |
| ----- | --------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **A** | Journal des actions d'administration                            | —                | Oui : table en ajout seul, écriture seule par les administrateurs, jamais de modification ni de suppression                                              | Journalisation avant exécution ; non-administrateur refusé ; journal non modifiable                           |
| **B** | Versions de documents                                           | —                | Oui : table de versions, en ajout seul                                                                                                                   | Enregistrement → nouvelle version ; ancienne version intacte ; restauration ; droits identiques aux documents |
| **C** | Envois d'images orphelins                                       | —                | Oui, légère : registre des envois en attente                                                                                                             | Envoi rattaché conservé ; envoi abandonné expiré ; aucun fichier rattaché supprimé                            |
| **D** | Durcissements mineurs                                           | —                | Oui : politiques `is_admin()` sous forme `(select …)` via `alter policy`, sans changement de sens ; retrait de l'exécution directe de `touch_updated_at` | Tests existants inchangés et verts ; test du jeton expiré                                                     |
| E     | Modèle studio                                                   | Décision 1       | Selon décision                                                                                                                                           | Accès croisé entre studios                                                                                    |
| F     | Plans, profils, registres (droits, coûts, paiements)            | Décisions 1, 5   | Oui                                                                                                                                                      | Séparation des registres, montants exacts, écritures compensatoires                                           |
| G     | Devis, réservation atomique, idempotence                        | F                | Oui                                                                                                                                                      | Concurrence sur le dernier quota, clé réutilisée, conflit d'empreinte                                         |
| H     | Tâches persistantes, outbox, rapprochement                      | Décision 4, G    | Oui                                                                                                                                                      | Double livraison, crash après envoi, restitution unique                                                       |
| I     | Passerelle IA et premier agent (WEAVER)                         | Décision 3, B, H | Selon besoin                                                                                                                                             | Paramètres interdits refusés, aucun import direct hors passerelle, version utilisateur préservée              |
| J     | Autres agents, un par un (SCRIPT, VOICE, ARC, FRAME, FIELD…)    | I                | Selon agent                                                                                                                                              | Par agent                                                                                                     |
| K     | BOARD : quota image, profil noir et blanc, vignettes approuvées | I, décision 7    | Oui                                                                                                                                                      | Conformité du profil, lot partiel réglé au livré                                                              |
| L     | SCOUT, GRIOT, MATCH : sources et provenance                     | I, décision 7    | Oui                                                                                                                                                      | Aucune source inventée, absence affichée comme absence, requêtes sortantes protégées                          |
| M     | Exports PDF                                                     | Décision 8       | Selon besoin                                                                                                                                             | Export identique non refacturé                                                                                |
| N     | Paiements                                                       | Décision 6, F    | Oui                                                                                                                                                      | Webhook dupliqué, retour navigateur sans effet, ordre inversé                                                 |
| O     | Interface des quotas et incidents                               | F à N            | Non                                                                                                                                                      | États distincts affichés, boutons protégés côté serveur                                                       |
| P     | Recette intégrée avant ouverture commerciale                    | Tous             | —                                                                                                                                                        | Parcours complets avec fournisseurs réels, budget de test autorisé                                            |

Chaque lot suit le déroulé déjà en vigueur : branche dédiée, migration additive avec RLS,
tests qui tentent de contourner chaque protection et que l'on vérifie capables d'échouer,
validation dans le navigateur, puis revue avant tout commit, fusion ou application en
production.
