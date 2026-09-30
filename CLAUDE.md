# FilmFund Africa — règles du projet

Plateforme SaaS pour les professionnels du cinéma africain. Ce fichier fait autorité
pour toute session de travail sur ce dépôt.

## Sécurité

Ces règles ne se négocient pas.

- **Aucun secret dans Git.** Ni token, ni mot de passe, ni clé API, ni chaîne de connexion,
  y compris dans un commentaire, un test, un fichier d'exemple ou un message de commit.
  Les valeurs réelles vivent dans `.env.local` (ignoré par Git), dans les variables
  d'environnement Vercel / Railway, ou dans les secrets GitHub Actions.
- **`.env.example` ne contient que des noms de variables**, jamais de valeurs.
- **Le préfixe `NEXT_PUBLIC_` expose la variable au navigateur.** `SUPABASE_SECRET_KEY`
  et tout autre secret ne doivent jamais le porter. Une clé secrète ne s'utilise que
  dans du code serveur.
- **La clé secrète Supabase ne contourne pas la RLS par confort.** Si une requête
  a besoin du rôle service, c'est que la politique RLS est à revoir.
- Les entrées utilisateur sont validées côté serveur, jamais seulement côté client.
- En cas de fuite d'un secret : le révoquer d'abord chez le fournisseur, réécrire
  l'historique ensuite. L'ordre inverse ne protège de rien.

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

## Git

- **Pas de push direct sur `main`.** Une branche par changement, puis une pull request.
- Nommage des branches : `feature/`, `fix/`, `chore/`, `docs/`.
- Messages de commit en français, au format Conventional Commits :
  `feat: ajoute la page de connexion`, `fix: corrige le calcul du budget total`.
- `npm run lint` et `npm run build` doivent être verts avant tout commit.
- Rien n'est commité, poussé ni déployé sans accord explicite de l'utilisateur.

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

## Stack

| Rôle                                               | Service  |
| -------------------------------------------------- | -------- |
| Code, branches, pull requests, CI                  | GitHub   |
| Front-end                                          | Vercel   |
| PostgreSQL, authentification, stockage, migrations | Supabase |
| Services backend, tâches de fond, cron jobs        | Railway  |

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, npm.
