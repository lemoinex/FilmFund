# Worker — exploitation

Le worker exécute les tâches nées des réservations (table `jobs`, lots H1 et H2). Son code
vit dans `worker/` ; il tourne sur Railway et se connecte à la base sous le rôle PostgreSQL
`filmfund_worker`, qui n'a **aucun droit sur les tables** et n'exécute que ses six fonctions.

Tant qu'aucun exécuteur n'existe (`worker/src/executeurs.ts`, vide jusqu'au lot I), le worker
ne prend aucune tâche : il se connecte, récupère les baux expirés, et attend.

## Ce qui est versionné, ce qui ne l'est pas

| Élément                                    | Où                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Rôle, ses droits, sa connexion, ses délais | Migrations `…_taches.sql` et `…_worker_connexion.sql`                  |
| Certificat racine de Supabase (public)     | `worker/certs/prod-ca-2021.crt`                                        |
| **Mot de passe du rôle**                   | Fixé à la main dans Supabase, rangé dans Railway. **Jamais dans Git.** |
| Réglages du service Railway                | Dans Railway ; décrits ci-dessous                                      |

## Mot de passe du rôle

Un rôle sans mot de passe ne peut pas s'authentifier : la migration ouvre la connexion, le
mot de passe se fixe ensuite, par l'exploitant seul.

1. Générer un mot de passe long (40 caractères, lettres et chiffres) dans un gestionnaire
   de mots de passe.
2. Dans Supabase, SQL Editor : `alter role filmfund_worker password '…';`
3. Supprimer la requête de l'éditeur, qui l'enregistre automatiquement.
4. Dans Railway, service du worker, Variables : `PGPASSWORD`, scellée (« Seal »).

**Rotation** : refaire les étapes 1 à 4, puis redéployer le service. Entre l'étape 2 et le
redéploiement, le worker en place garde sa connexion ouverte ; une nouvelle connexion avec
l'ancien mot de passe échoue, et le service redémarre de lui-même.

**En cas de fuite** : changer le mot de passe d'abord (étape 2), ensuite seulement nettoyer
l'endroit où il a fui. Le rôle ne lit aucune table : une fuite permet au pire de réclamer,
conclure ou rapprocher des tâches — à vérifier dans `jobs` et `job_attempts`.

## Variables du service Railway

| Variable     | Valeur                                 | Secret  |
| ------------ | -------------------------------------- | ------- |
| `PGHOST`     | `aws-1-eu-west-1.pooler.supabase.com`  | non     |
| `PGPORT`     | `5432` (pooler en mode session)        | non     |
| `PGDATABASE` | `postgres`                             | non     |
| `PGUSER`     | `filmfund_worker.bqlaromihijgzopsjorh` | non     |
| `PGPASSWORD` | fixé par l'exploitant                  | **oui** |

La connexion passe par le pooler en mode session : la connexion directe à la base est en
IPv6, que le service Railway n'emprunte pas. Elle est chiffrée, et l'identité du serveur
vérifiée par le certificat racine ; aucune variable ne permet de s'en dispenser.

## Réglages du service Railway

- Dépôt `lemoinex/FilmFund`, branche `main`, **dossier racine `worker`**.
- Démarrage : `npm start` (`node src/index.ts` ; Node 22 exécute le TypeScript tel quel).
- Redéploiement seulement quand `worker/**` change.
- Redémarrage en cas d'échec. Aucun domaine public : le worker n'écoute rien.
- Région Europe, proche de la base (`eu-west-1`).

## Lire les journaux

Une ligne JSON par événement, sans contenu d'œuvre, paramètre ni secret.

| Événement                        | Sens                                                                              |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `worker_demarre`                 | Connecté ; `role` doit valoir `filmfund_worker` ; `actions` liste le savoir-faire |
| `variable_manquante`             | Une variable `PG…` manque : le service s'arrête                                   |
| `connexion_impossible`           | Hôte, utilisateur, mot de passe ou certificat à vérifier                          |
| `tache_reclamee`                 | Une tâche est prise                                                               |
| `tache_reussie`                  | Conclue, réservation réglée                                                       |
| `essai_echoue`                   | Le fournisseur a répondu par un échec ; une reprise au plus                       |
| `issue_inconnue`                 | Coupure après l'envoi : la tâche passera « à rapprocher », sans relance           |
| `bail_perdu_avant_envoi`         | La tâche a été récupérée entre-temps : rien n'a été envoyé                        |
| `baux_expires_recuperes`         | Des tâches abandonnées ont été remises en file ou mises à rapprocher              |
| `boucle_en_echec`                | Base injoignable : le worker patiente et réessaie                                 |
| `arret_demande`, `worker_arrete` | Arrêt propre, après la tâche en cours                                             |

## Tâche « à rapprocher »

L'issue d'un essai est inconnue : le fournisseur a peut-être travaillé. Elle n'est jamais
relancée. Une fois l'issue établie, un administrateur la tranche par
`rapprocher_travail_admin(tâche, succès, unités consommées)` — journalisé — ; à partir du
lot I, le worker pourra le faire en interrogeant le fournisseur.

## En local

Les tests (`tests/worker.test.mjs`) font tourner la vraie boucle contre la base locale, sous
le rôle du worker, avec des exécuteurs factices désignés comme tels. Le mot de passe local
du rôle, dans `tests/helpers.mjs`, ne vaut que pour le conteneur Docker.
