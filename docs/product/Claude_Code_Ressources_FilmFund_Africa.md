# Claude Code — Rubrique « Ressources » de FilmFund Africa

## Mission

Implémente ou complète la rubrique « Ressources » comme bibliothèque de guides, modèles et références utiles aux créateurs audiovisuels. Travaille dans le dépôt existant et adapte chaque décision à son architecture réelle.

## Règle absolue : préserver la structure existante

Cette intervention ne doit en aucun cas désorganiser la structure déjà mise en place.

- Ne refonds pas l’architecture, les routes, la navigation, le dashboard ou le schéma de données global.
- Ne déplace, ne renomme et ne supprime aucun fichier existant sans mon accord explicite.
- Réutilise les composants, conventions, services, styles, types et mécanismes de sécurité existants.
- Ne crée pas de deuxième système d’authentification, de stockage, de recherche ou de gestion documentaire.
- Ne modifie pas le fonctionnement de Mes projets, Documents, Storyboard, Assistant IA ou des agents IA.
- Ne remplace pas un fichier de configuration global pour ajouter cette rubrique.
- Ne touche pas aux modifications non commitées qui ne concernent pas cette tâche.
- Si une modification structurelle devient indispensable, arrête-toi et présente sa justification, son impact et une alternative minimale. Attends mon accord.

## 1. Audit obligatoire avant de coder

1. Lis CLAUDE.md et les instructions applicables au dépôt et aux sous-dossiers concernés.
2. Consulte git status et identifie les changements déjà présents sans les écraser.
3. Repère la stack, le gestionnaire de paquets et les commandes de lint, de test, de vérification TypeScript et de build.
4. Localise la route Ressources, la navigation existante, le layout du dashboard, les composants partagés et les systèmes de données et d’authentification.
5. Vérifie si des ressources, catégories, favoris, filtres ou modèles existent déjà.
6. Repère les intégrations Supabase et les règles RLS existantes, sans afficher de secrets.
7. Présente un plan court : constats, fichiers à modifier, composants réutilisés, données nécessaires, risques et tests.
8. Attends ma validation de ce plan avant toute modification de code.

## 2. Rôle de la rubrique

Ressources est une bibliothèque transversale de supports réutilisables.

- Ressources : apprendre, consulter une référence ou récupérer un modèle.
- Assistant IA : demander une aide contextualisée sur un projet.
- Documents : conserver et modifier les contenus propres à un projet.
- Mes projets : gérer les projets et leur avancement.
  Ne duplique pas ces fonctions. La rubrique ne doit pas déclencher automatiquement de génération IA.

## 3. Périmètre initial

### Catégories

Prévois des catégories compatibles avec les conventions existantes :

- Écriture et développement : logline, synopsis, traitement, note d’intention, personnages.
- Dossier et financement : préparation de dossier, pitch, checklist de candidature.
- Préproduction : budget, planning, repérages, storyboard.
- Utilisation de FilmFund Africa : guides des fonctionnalités réellement disponibles.

### Types de ressources

- Guide : contenu pédagogique structuré.
- Modèle : trame réutilisable, uniquement si son contenu ou son fichier existe réellement.
- Checklist : étapes à vérifier.
- Référence externe : lien vers une source identifiable.

### Informations d’une ressource

Adapte ces champs au modèle existant ; ne crée pas mécaniquement une nouvelle table :

- Identifiant stable et slug si le routage le nécessite.
- Titre et courte description.
- Catégorie et type.
- Langue, français par défaut.
- Contenu interne OU lien externe OU référence de fichier existant.
- Source et auteur lorsqu’ils sont connus.
- Date de mise à jour et date de vérification du lien lorsqu’elles sont réelles.
- Statut brouillon/publié si le système existant le permet.
- Tags uniquement s’ils apportent une utilité réelle.
  Ne collecte pas de données personnelles inutiles.

## 4. Interface attendue

Réutilise la direction visuelle et les composants du dashboard, sans créer un design parallèle.

- Titre : Ressources.
- Introduction : « Guides, modèles et références pour développer votre projet et préparer votre dossier. »
- Champ de recherche sur titre et description.
- Filtres par catégorie et type.
- Liste ou grille de cartes cohérente avec l’application.
- Chaque carte affiche titre, description, catégorie, type et action appropriée.
- Actions possibles : Lire, Consulter la source, Télécharger un modèle réellement disponible.
- Vue de détail utilisant le routage ou les modales déjà adoptés.
- États de chargement, d’erreur, de liste vide et de recherche sans résultat.
- Responsive, navigation clavier, focus visible, labels accessibles et contrastes cohérents.
- Pagination ou chargement progressif si le volume le justifie.
  Ne rends aucun bouton actif si sa destination ou son fichier n’existe pas.

## 5. Limites métier

- Ne transforme pas Ressources en moteur de recherche de financements : ce rôle relève de MATCH.
- N’invente pas de fonds, de liens, d’échéances, de critères d’éligibilité ni de promesses de financement.
- Ne présente pas un guide général comme une recommandation juridique ou financière personnalisée.
- Ne présente pas un contenu d’exemple comme une source vérifiée.
- N’ajoute pas de favoris, de recommandations IA, de système de notation ou de back-office complet au périmètre initial, sauf s’ils existent déjà et peuvent être réutilisés sans extension structurelle.
- Ne copie pas automatiquement un modèle dans Documents et ne modifie pas un projet sans action explicite et sans mécanisme existant adapté.

## 6. Données : choisir la solution minimale

Priorité : réutiliser la source de données et le système éditorial existants.
Si aucun système n’existe, propose d’abord la solution la plus simple compatible avec le dépôt, par exemple des contenus versionnés, sans imposer Supabase ou un nouveau service.
Si une persistance Supabase est nécessaire :

- Présente le schéma et les politiques d’accès avant toute migration.
- Utilise des migrations additives, versionnées et compatibles avec les données existantes.
- Aucun DROP, TRUNCATE, reset de base ou remplacement de table.
- Une migration doit rester réversible autant que possible sans perdre les données.
- Ne lance aucune migration distante sans mon accord explicite.
- Vérifie que la lecture publique ou authentifiée correspond au modèle d’accès actuel ; ne rends pas le dashboard public par défaut.
- Restreins les écritures aux rôles autorisés via les mécanismes existants.
- Ne crée pas un worker Railway pour une simple bibliothèque.

## 7. Sécurité et performance

- Ne mets jamais de clé secrète ou de clé service_role dans le navigateur, le code versionné ou les logs.
- Réutilise les contrôles de session, de rôle et d’accès existants.
- Applique les politiques RLS si les ressources sont exposées via Supabase.
- Valide les entrées et les URL ; refuse les protocoles dangereux.
- N’affiche pas de HTML non fiable sans nettoyage adapté ; réutilise le rendu sécurisé existant.
- Pour les fichiers, conserve les règles d’accès du stockage existant ; ne rends aucun bucket privé public.
- N’ajoute pas de récupération automatique côté serveur d’URL arbitraires.
- Évite les requêtes à chaque frappe : filtrage local si le catalogue est petit, ou recherche temporisée et bornée si elle est distante.
- Réutilise la stratégie de cache existante, sans mettre en cache publiquement des données privées.
- Aucun appel payant ou appel IA ne doit être nécessaire pour consulter cette rubrique.

## 8. Contenus initiaux

Si aucun contenu approuvé n’existe, propose quelques brouillons éditoriaux clairement identifiés :

1. Comprendre et rédiger une logline.
2. Structurer un synopsis.
3. Préparer une note d’intention.
4. Vérifier les pièces d’un dossier de candidature.
5. Préparer une checklist de préproduction.
   Présente ces propositions pour validation ; ne les publie pas automatiquement et ne prétends pas qu’elles étaient déjà validées dans la spécification historique.
   Utilise uniquement des fichiers réellement disponibles pour les téléchargements. Ne télécharge aucun document tiers et ne reproduis aucun contenu protégé sans autorisation.

## 9. Tests et critères d’acceptation

La tâche est terminée uniquement si :

- La rubrique s’intègre à la navigation existante sans doublon.
- L’accès conserve les règles de l’application.
- Recherche, filtres, lecture et liens disponibles fonctionnent.
- Les états vide, erreur et chargement sont traités.
- Les autres rubriques gardent leur comportement et leur présentation.
- Aucun secret, appel IA payant ni dépendance inutile n’a été ajouté.
- Les liens externes et fichiers ne sont pas fictifs.
- Les permissions de lecture et d’écriture sont testées si une base est utilisée.
- Les commandes pertinentes de lint, types, tests et build ont été exécutées avec le gestionnaire de paquets du dépôt.
- Les échecs préexistants sont distingués des régressions introduites.
  Ne contourne pas un test, une règle de lint ou une vérification de sécurité pour obtenir un résultat vert.

## 10. Livrable et limites d’exécution

À la fin, fournis :

1. Résumé de ce qui a été implémenté.
2. Liste exacte des fichiers ajoutés et modifiés.
3. Explication des éléments existants réutilisés et des moyens employés pour préserver la structure.
4. Commandes exécutées et résultats réels.
5. Limites restantes, contenus à valider et éventuelles actions manuelles.
6. Procédure de retour arrière limitée à tes propres changements, sans écraser ceux d’autrui.

Ne fais aucun commit, push, déploiement Vercel/Railway, modification de secret, écriture en production ou migration distante sans mon accord explicite. Si un outil, un accès ou une information manque, signale-le au lieu d’inventer un résultat.

## Première réponse attendue

Commence uniquement par l’audit et le plan minimal. Ne code pas avant ma validation. Ton objectif est d’ajouter de la valeur à Ressources sans désorganiser, remplacer ou fragiliser FilmFund Africa.
