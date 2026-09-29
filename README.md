# FilmFund Africa

Plateforme SaaS pour aider les professionnels du cinéma africain à développer, organiser, financer et piloter leurs projets de films.

## Périmètre du MVP

- Landing page cinématographique et responsive
- Authentification des utilisateurs
- Tableau de bord
- Création et gestion de projets de films
- Équipes et collaborateurs
- Budgets
- Planning de production et feuilles de service
- Storyboard
- Recherche et suivi d'opportunités de financement
- Préparation de dossiers de candidature

## Stack

| Rôle                                                    | Service  |
| ------------------------------------------------------- | -------- |
| Code, branches, pull requests, CI                       | GitHub   |
| Front-end                                               | Vercel   |
| Base PostgreSQL, authentification, stockage, migrations | Supabase |
| Services backend, tâches de fond, cron jobs             | Railway  |

## Règles du dépôt

- **Aucun secret dans Git** : ni token, ni mot de passe, ni clé API. Les valeurs réelles vont dans `.env.local` (ignoré par Git), dans les variables d'environnement Vercel / Railway, ou dans les secrets GitHub Actions.
- `.env.example` liste les variables attendues, **sans valeurs**.
- Les changements de base de données passent uniquement par des migrations SQL versionnées dans `supabase/migrations`.
- On ne pousse pas directement sur `main` : chaque changement passe par une branche et une pull request.

## Démarrage local

Prérequis : Node 20.9 ou plus (la version testée est indiquée dans `.nvmrc`), npm,
et Docker Desktop pour la base de données locale.

```bash
npm install
npm run db:start             # démarre Postgres, Auth et Storage en local
cp .env.example .env.local   # puis renseigner les valeurs affichées par db:start
npm run dev
```

`npm run db:start` affiche l'URL de l'API et les clés de la pile locale : reportez-les
dans `.env.local`. Ces clés sont propres à votre machine et n'ouvrent rien d'autre.

L'application est servie sur http://localhost:3000, et Supabase Studio sur
http://localhost:54323.

## Scripts

| Script                 | Rôle                                            |
| ---------------------- | ----------------------------------------------- |
| `npm run dev`          | Serveur de développement                        |
| `npm run build`        | Build de production                             |
| `npm run start`        | Sert le build de production                     |
| `npm run lint`         | ESLint                                          |
| `npm run typecheck`    | Vérification TypeScript sans émettre de fichier |
| `npm run format`       | Formate le code avec Prettier                   |
| `npm run format:check` | Vérifie le formatage sans rien modifier         |
| `npm test`             | Tests de cloisonnement et de droits             |
| `npm run db:start`     | Démarre la pile Supabase locale (Docker)        |
| `npm run db:stop`      | Arrête la pile locale                           |
| `npm run db:reset`     | Réinitialise la base et rejoue les migrations   |
| `npm run db:diff`      | Génère une migration à partir des changements   |
| `npm run db:types`     | Régénère les types TypeScript depuis le schéma  |

## Base de données

Le schéma vit dans `supabase/migrations`, en fichiers SQL versionnés. Aucune
modification ne se fait à la main dans l'interface Supabase : elle serait perdue au
prochain déploiement et absente des autres environnements.

Chaque table active la RLS dans la migration qui la crée, avec ses politiques.
Après toute migration, régénérez les types avec `npm run db:types`, sinon le typage
ment sur l'état réel de la base.

## Tests

```bash
npm run db:start   # la pile locale doit tourner
npm test
```

Les tests de `tests/` s'exécutent contre la base locale et créent de vrais comptes :
la RLS ne se simule pas, elle s'éprouve. Ils ne vérifient pas que les politiques
existent, ils **tentent de les contourner** — lecture croisée, auto-promotion en
administrateur, usurpation de propriété, accès anonyme.

Toute migration touchant une politique, un rôle ou un privilège doit s'accompagner
d'un test qui échoue sans elle. Deux défauts sérieux ont été trouvés ainsi :
l'impossibilité de créer le premier administrateur, et la perte du droit
d'exécution sur `is_admin` qui rendait les politiques d'administration
silencieusement inopérantes.

## Organisation du code

```
src/
├── app/
│   ├── (auth)/    Connexion et inscription
│   ├── (app)/     Espace connecté : tableau de bord, projets
│   └── auth/      Confirmation d'adresse e-mail
├── components/    Composants réutilisables
└── lib/
    └── supabase/  Clients navigateur, serveur et middleware
supabase/
└── migrations/    Schéma SQL versionné
public/            Fichiers statiques servis tels quels
```

Stack technique : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4,
Supabase (Postgres, Auth).

Les conventions de développement et les règles de sécurité sont détaillées dans `CLAUDE.md`.
