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

Prérequis : Node 20.9 ou plus (la version testée est indiquée dans `.nvmrc`) et npm.

```bash
npm install
cp .env.example .env.local   # puis renseigner les valeurs localement
npm run dev
```

L'application est servie sur http://localhost:3000.

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

## Organisation du code

```
src/
├── app/           Routes (App Router), layouts et pages
└── components/    Composants réutilisables
public/            Fichiers statiques servis tels quels
```

Stack technique : Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4.

Les conventions de développement et les règles de sécurité sont détaillées dans `CLAUDE.md`.
