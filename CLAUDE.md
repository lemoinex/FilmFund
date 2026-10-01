# FilmFund Africa — Instructions Claude Code

Plateforme SaaS pour les professionnels du cinéma africain. Ce fichier fait autorité
pour toute session de travail sur ce dépôt.

## Ordre de lecture obligatoire

Lire intégralement, avant toute modification :

1. `docs/product/PRD_MVP.md`
2. `docs/engineering/VIBECODING_RULES.md`
3. `docs/engineering/GUARDRAILS_BACKLOG.md`
4. `docs/engineering/LOTS_IMPLEMENTATION.md`
5. `docs/decisions/ADR-0001-architecture-and-scope.md`
6. `docs/design/LANDING_PAGE_SPEC.md` si le lot concerne la landing.

Puis l'état réel du dépôt : `docs/backlog-status.md` (statut de chaque lot et décisions
prises), `docs/implementation-audit.md` (audit et plan des lots) et `docs/mode-prive.md`.

Les documents 1 à 6 ne sont pas encore versionnés dans le dépôt. Tant qu'un document
manque, le signaler plutôt que d'en supposer le contenu.

## Mode de travail : vibecoding discipliné

Produire vite sans livrer de fonctionnalités fictives. Travailler exclusivement par tranches verticales : interface, validation, données réelles, sécurité, états UX et vérification. Ne jamais déclarer un test exécuté s’il ne l’a pas été.

## Plateforme et workflow

- **GitHub est l’unique dépôt de référence** : code, branches, pull requests, issues et GitHub Actions. Ne jamais proposer GitLab, GitLab CI ni GitLab Container Registry, sauf demande explicite.
- **Vercel** héberge le front-end et les previews.
- **Supabase** fournit PostgreSQL, Auth, Storage, Realtime, Edge Functions et les migrations SQL, versionnées dans `supabase/migrations/`.
- **Railway** héberge les APIs spécialisées, workers et tâches planifiées si nécessaire.
- Code en **TypeScript** quand le projet le permet. Stack : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, npm.
- Branches `feature/*`, `fix/*`, `chore/*` ou `docs/*` et pull requests GitHub pour tout changement important ; jamais de push direct sur `main`. Changements petits, testables et réversibles.
- Vérifier les scripts existants dans `package.json` avant de proposer ou d’exécuter une commande npm.
- Commandes de validation proposées en PowerShell (Windows) quand nécessaire.
- Pour chaque modification, indiquer : fichiers créés ou modifiés, commandes de validation à exécuter, risques éventuels.

## Git

- Messages de commit en français, au format Conventional Commits :
  `feat: ajoute la page de connexion`, `fix: corrige le calcul du budget total`.
- `npm run lint` et `npm run build` doivent être verts avant tout commit.
- **Les commits sont signés** (clé SSH, configuration locale du dépôt). Le projet Vercel
  exige des commits vérifiés par GitHub : un commit non signé voit son déploiement de
  prévisualisation annulé, et la pull request affiche un check Vercel en échec. Les commits
  de fusion, signés par GitHub, se déploient normalement.

## Démarrage impératif

1. Auditer le dépôt sans modifier de fichier.
2. Cartographier architecture, dépendances, routes, composants, Auth, Supabase, migrations, RLS, Storage, variables d’environnement, GitHub (branches, pull requests, GitHub Actions), Vercel, Railway, appels coûteux et risques visibles.
3. Produire le plan du lot suivant (voir `docs/backlog-status.md`) au format de `VIBECODING_RULES.md`.
4. Attendre la validation humaine du plan avant de coder.

## Règles immuables

- Avant toute modification importante : analyser les fichiers concernés, présenter le plan et attendre la confirmation humaine.
- Ne faire aucun `git commit`, `git push`, déploiement, suppression, modification distante ni changement de secrets sans confirmation explicite.
- Ne supprimer, renommer, réinitialiser, déployer ni remplacer massivement aucun élément sans signaler l’impact et obtenir confirmation.
- Préférer les migrations non destructives, versionnées et testées.
- Ne jamais écrire, afficher, committer ni inventer de secret, token, mot de passe ou clé API.
- Ne jamais committer `.env`, `.env.local`, clé Supabase `service_role`, token GitHub, Vercel, Railway ou autre secret. `.env.example` ne contient que des noms de variables, sans valeur sensible.
- Ne placer aucun secret, service role, clé IA, clé de paiement ou clé privée côté client, dans Git, fixtures ou logs.
- Les valeurs réelles vivent dans `.env.local` (ignoré par Git), dans les variables d'environnement Vercel / Railway, ou dans les secrets GitHub Actions.
- **Le préfixe `NEXT_PUBLIC_` expose la variable au navigateur** : `SUPABASE_SECRET_KEY` et tout autre secret ne doivent jamais le porter.
- Tout accès privilégié Supabase reste strictement côté serveur.
- Ne jamais contourner la RLS Supabase sans explication et validation explicite. Si une requête a besoin du rôle service, c'est que la politique RLS est à revoir.
- Les entrées utilisateur sont validées côté serveur, jamais seulement côté client.
- Toute mutation vérifie session, rôle, accès studio/projet et payload ; elle produit un journal d’audit lorsque sensible.
- Tout accès aux données de projet doit être protégé par RLS et testé entre au moins deux utilisateurs/studios.
- Toute IA passe exclusivement côté serveur : session, accès, rate limit, droits, devis, réservation transactionnelle, appel fournisseur, journalisation non sensible, règlement ou restitution.
- Aucun appel IA payant, paiement réel, campagne de test payante ou migration de production sans autorisation explicite.
- Une suggestion IA est affichée, comparable, éditable et explicitement acceptée ; elle ne remplace jamais du contenu utilisateur automatiquement.
- En cas de fuite d'un secret : le révoquer d'abord chez le fournisseur, réécrire l'historique ensuite. L'ordre inverse ne protège de rien.

## Base de données

- **Toute modification de schéma passe par une migration SQL versionnée** dans
  `supabase/migrations`. Jamais de changement à la main dans l'interface Supabase :
  il serait perdu au prochain déploiement et absent des autres environnements.
- **La RLS est activée à la création de la table**, dans la même migration, avec ses
  politiques. L'ajouter après coup sur une table déjà peuplée coûte bien plus cher.
- Une migration ne se modifie plus une fois poussée : on en écrit une nouvelle.
- Les migrations sont réversibles ou, à défaut, documentent explicitement ce qui ne l'est pas.
- **Toute migration touchant une politique, un rôle ou un privilège s'accompagne
  d'un test dans `tests/`.** Un test qui ne peut pas échouer ne protège rien :
  vérifiez qu'il tombe quand la protection est retirée. Ce qui ne s'observe pas
  par l'API — droits d'exécution, état du catalogue — se teste en SQL (pgTAP)
  dans `supabase/tests/`, avec `supabase test db`.
- **Supabase accorde l'exécution de toute nouvelle fonction à `anon` et
  `authenticated`.** Une fonction `security definer` retire ces droits
  nommément (`revoke all ... from public, anon, authenticated`), puis ne rend
  que ceux dont elle a besoin. Une fonction appelable par les comptes connectés
  doit être ajoutée à la liste de `supabase/tests/privileges_fonctions.test.sql`.
- **Les administrateurs ont accès à tout** : toute nouvelle table donne lecture et écriture
  aux administrateurs (`public.is_admin()`) dans ses politiques.
- **Toute nouvelle table reçoit la politique restrictive du mode privé**
  (« Mode privé : administrateurs uniquement », voir
  `supabase/migrations/20260929220000_mode_prive_administrateurs.sql`). Sans elle, la table
  échapperait au verrou ; `supabase/tests/mode_prive.test.sql` le vérifie.
- **Stockage : jamais de compartiment public.** Les fichiers se servent par liens signés,
  délivrés avec la session de l'utilisateur. Un nouveau compartiment reçoit des
  politiques sur `storage.objects` fondées sur le projet en tête du chemin
  (`projet_du_chemin`), et sa propre politique restrictive du mode privé.
- Ne jamais pousser la configuration avec `supabase config push` sans passer par
  `supabase config diff` : le fichier local déclare des assouplissements propres
  au développement — confirmation d'e-mail désactivée, MFA désactivé — dont la
  propagation en production serait une régression de sécurité.

## Code

- **Langue** : interface, contenu et commentaires en français. Le code (noms de variables,
  de fonctions, de fichiers) reste en anglais.
- **Composants serveur par défaut.** `"use client"` uniquement quand le composant a besoin
  d'état, d'effets, ou d'événements du navigateur — et le plus bas possible dans l'arbre.
- **Nommage** : fichiers en `kebab-case`, composants React en `PascalCase`, fonctions et
  variables en `camelCase`, constantes partagées en `SCREAMING_SNAKE_CASE`.
- **Organisation** : les routes dans `src/app/`, les composants réutilisables dans
  `src/components/`, les composants propres à une page dans un sous-dossier dédié.
- **TypeScript strict** : pas de `any` sans justification écrite en commentaire.
- **Tailwind** : pas de feuille de style séparée sauf nécessité. Les couleurs et espacements
  passent par les jetons définis dans `globals.css`, pas par des valeurs en dur.
- Les commentaires expliquent **pourquoi**, pas **quoi**. Un commentaire qui paraphrase
  la ligne suivante est du bruit.

## Accessibilité et responsive

- Conception mobile d'abord, vérifiée à 375 px, 768 px et 1440 px.
- HTML sémantique : `header`, `nav`, `main`, `section`, `footer`, titres hiérarchisés.
- Contrastes conformes WCAG AA.
- Focus visible au clavier, navigation possible sans souris.
- Les animations respectent `prefers-reduced-motion`.
- Tout texte porté par une image ou une icône a son équivalent accessible.

## Architecture produit

- Les onze agents internes sont : WEAVER, SCRIPT, VOICE, SCOUT, GRIOT, ARC, FRAME, GEAR, BOARD, FIELD et MATCH.
- Ils doivent être des profils/actions internes traçables par l’exécution et la facturation.
- L’utilisateur final voit un copilote unifié avec des actions adaptées au contexte, jamais onze applications distinctes.
- La landing publique utilise le système noir/ivoire/or documenté dans `LANDING_PAGE_SPEC.md`.
- L’application authentifiée utilise le système bleu nuit/ivoire/or documenté dans `PRD_MVP.md`.

## Définition de terminé

Une fonction est terminée uniquement avec : interface responsive, données réelles ou mock explicitement borné, validation des entrées, contrôle d’accès serveur et RLS si nécessaire, états chargement/vide/erreur/succès, test pertinent ou contrôle manuel documenté, et compte rendu honnête des commandes de validation.
