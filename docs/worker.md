# Worker — exploitation

Le worker exécute les tâches nées des réservations (table `jobs`, lots H1 et H2). Son code
vit dans `worker/` ; il tourne sur Railway et se connecte à la base sous le rôle PostgreSQL
`filmfund_worker`, qui n'a **aucun droit sur les tables** et n'exécute que ses onze fonctions :
six pour les tâches, quatre pour la passerelle IA, une pour lire la clé du fournisseur.

Depuis le lot I1, le worker porte l'agent WEAVER, qui rédige une proposition de pitch
(action `logline`). **Sans clé de fournisseur au coffre, il n'a aucun exécuteur** et ne prend
aucune tâche : il se connecte, récupère les baux expirés, et attend — les demandes restent en
file, annulables par leur auteur. La clé se pose depuis l'écran Administration →
Intégrations IA, jamais par une variable d'environnement.

## Ce qui est versionné, ce qui ne l'est pas

| Élément                                    | Où                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| Rôle, ses droits, sa connexion, ses délais | Migrations `…_taches.sql` et `…_worker_connexion.sql`                  |
| Certificat racine de Supabase (public)     | `worker/certs/prod-ca-2021.crt`                                        |
| **Mot de passe du rôle**                   | Fixé à la main dans Supabase, rangé dans Railway. **Jamais dans Git.** |
| **Clé d'API du fournisseur d'IA**          | Créée par l'exploitant, rangée dans Railway. **Jamais dans Git.**      |
| Profils d'agents, modèle, tarifs           | `worker/src/ia/profils.ts`                                             |
| Plafond mensuel des dépenses d'IA          | Table `ai_settings`, modifiable par un administrateur, journalisée     |
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

**Aucune clé de fournisseur d'IA ici** : depuis le lot « Intégrations IA », elles se posent
depuis l'écran d'administration et vivent dans le coffre de la base. Une variable
`ANTHROPIC_API_KEY` ou `OPENAI_API_KEY` ajoutée au service serait ignorée ;
`tests/architecture.test.mjs` refuse d'ailleurs qu'un fichier la relise.

## Passerelle IA (lot I1)

Le fournisseur n'est appelé que par `worker/src/ia/passerelle.ts`, seul fichier du dépôt à
importer son SDK ; le lint et `tests/architecture.test.mjs` refusent tout autre import.

- **Modèle** : `claude-opus-5-5`, effort `medium`, 8 000 jetons de sortie au plus par appel.
  Sur un refus de sécurité, Anthropic rejoue la demande sur son modèle de repli, dans le
  même appel ; le coût confirmé compte alors les deux modèles.
- **Ce qui part chez le fournisseur** : la fiche du projet — titre, format, étape, pitch
  actuel, synopsis — et rien d'autre : ni compte, ni adresse, ni identifiant, ni document.
- **Aucun réessai automatique** : après une coupure, on ignore si le fournisseur a
  travaillé, et la tâche passe « à rapprocher ». La seule reprise est décidée par la base,
  après un échec établi (erreur du fournisseur, refus, réponse inexploitable).
- **Rien n'est écrit dans le projet** : le worker dépose une proposition
  (`ai_suggestions`) ; le porteur ou un éditeur l'applique — modifiée ou non — ou l'écarte.

### Clé d'API : écran Intégrations IA

La clé ne se saisit ni dans Railway, ni dans Vercel, ni dans `.env.local` : elle se pose
depuis l'application, par un administrateur.

1. Dans la console Anthropic, créer un espace de travail réservé à FilmFund, avec une
   limite de dépense mensuelle égale au plafond ci-dessous : c'est le second verrou, tenu
   par le fournisseur lui-même.
2. Y créer une clé, puis la coller dans **Administration → Intégrations IA**. Elle part
   aussitôt dans `vault.secrets`, chiffrée par Supabase avec une clé qui ne vit pas dans la
   base. L'écran n'en garde que l'état — configurée le tel jour, par telle personne — et ne
   la réaffiche jamais.
3. Le worker relit le coffre **toutes les 60 secondes** : dans la minute, ses journaux
   affichent `cle_fournisseur_chargee` avec `"actions":["logline"]`. Aucun redéploiement.

**Remplacer** une clé : la reposer depuis le même écran. **Retirer** une clé arrête l'agent
sans rien casser : les demandes restent en file, annulables par leur auteur. Chaque
changement est inscrit au journal d'administration, sans la valeur.

**Qui peut lire la clé** : le worker, par `cle_fournisseur()`, réservée à son rôle. Ni
l'application, ni les administrateurs, ni l'API ne la relisent. Mais un accès SQL au projet
Supabase — le tableau de bord, par exemple — permet de la déchiffrer, et le mot de passe du
worker y mène aussi. C'est le prix de ce choix ; les garde-fous restent la limite de dépense
chez le fournisseur et le plafond mensuel interne.

**Un réglage à ne pas changer sans y penser** : la clé transite en paramètre d'une fonction
SQL. Les journaux PostgreSQL de production ne gardent aujourd'hui que les instructions de
structure (`log_statement = ddl`, sans paramètres). Activer la journalisation complète des
requêtes y écrirait les clés en clair.

**En cas de fuite** : révoquer la clé dans la console Anthropic d'abord, en créer une
nouvelle ensuite, et la reposer depuis l'écran.

```sql
-- Qui est configuré, et depuis quand. La clé n'est pas ici.
select provider, configured_at from public.ai_provider_keys;
```

### Coûts et plafond

Chaque appel est inscrit dans un registre en ajout seul, lisible par les seuls
administrateurs :

- `provider_charges` — la **provision**, écrite avant l'appel, au pire (toute l'entrée, et le
  plafond de sortie) : de l'ordre de 0,17 $ ;
- `provider_charge_settlements` — le **coût confirmé**, d'après l'usage que le fournisseur
  facture : de l'ordre de 0,01 à 0,02 $ pour un pitch. Il est inscrit dès que le fournisseur
  a répondu, que la proposition soit exploitable ou non. Un montant vide signale un modèle
  sans tarif connu dans `profils.ts` : à rapprocher de la facture.

**Requête refusée** (statut 4xx hors 429) : le fournisseur ne l'a ni traitée ni facturée. Le
coût est alors confirmé à **zéro**, pour que la provision cesse de peser sur le plafond du
mois. Le motif exact figure dans le champ `detail` de l'événement `essai_echoue`, lisible
dans les journaux Railway — jamais en base, où l'équipe du projet ne lit qu'un message
général.

Le **plafond mensuel** (`ai_settings.monthly_budget_usd`, 5 $ à la mise en service) borne la
somme du mois civil, en UTC : le coût confirmé quand il existe, la provision sinon. Une
provision qui le dépasserait est refusée : rien n'est envoyé, la tâche échoue avec le motif
« Plafond mensuel des dépenses d'IA atteint. », et l'unité est rendue. Une provision jamais
confirmée (coupure) continue de compter à son montant provisionné : le plafond se resserre
plutôt qu'il ne cède.

```sql
-- Dépense du mois et plafond.
select public.depense_ia_du_mois() as depense, monthly_budget_usd as plafond
from public.ai_settings;

-- Changer le plafond : journalisé, avec ou sans compte administrateur connecté.
update public.ai_settings set monthly_budget_usd = 10;
```

Les tarifs par modèle sont dans `worker/src/ia/profils.ts` : à revoir à chaque changement
de modèle ou de grille, et à confronter à la facture du fournisseur, qui seule fait foi.

## Réglages du service Railway

- Dépôt `lemoinex/FilmFund`, branche `main`, **dossier racine `worker`**.
- Démarrage : `npm start` (`node src/index.ts` ; Node 22 exécute le TypeScript tel quel).
- Redéploiement seulement quand `worker/**` change.
- Redémarrage en cas d'échec. Aucun domaine public : le worker n'écoute rien.
- Région Europe, proche de la base (`eu-west-1`).

## Lire les journaux

Une ligne JSON par événement, sans contenu d'œuvre, paramètre ni secret.

| Événement                        | Sens                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `worker_demarre`                 | Connecté ; `role` doit valoir `filmfund_worker` ; `actions` liste le savoir-faire                |
| `variable_manquante`             | Une variable `PG…` manque : le service s'arrête                                                  |
| `connexion_impossible`           | Hôte, utilisateur, mot de passe ou certificat à vérifier                                         |
| `tache_reclamee`                 | Une tâche est prise                                                                              |
| `tache_reussie`                  | Conclue, réservation réglée                                                                      |
| `essai_echoue`                   | Le fournisseur a répondu par un échec ; une reprise au plus. `detail` porte sa réponse, tronquée |
| `issue_inconnue`                 | Coupure après l'envoi : la tâche passera « à rapprocher », sans relance                          |
| `bail_perdu_avant_envoi`         | La tâche a été récupérée entre-temps : rien n'a été envoyé                                       |
| `baux_expires_recuperes`         | Des tâches abandonnées ont été remises en file ou mises à rapprocher                             |
| `boucle_en_echec`                | Base injoignable : le worker patiente et réessaie                                                |
| `arret_demande`, `worker_arrete` | Arrêt propre, après la tâche en cours                                                            |

## Tâche « à rapprocher »

L'issue d'un essai est inconnue : le fournisseur a peut-être travaillé. Elle n'est jamais
relancée. Une fois l'issue établie, un administrateur la tranche par
`rapprocher_travail_admin(tâche, succès, unités consommées)` — journalisé.

Pour un pitch, une coupure laisse une provision sans coût confirmé et aucune proposition :
l'issue se tranche en échec (unité rendue), après avoir vérifié dans la console du
fournisseur si l'appel a été facturé.

## En local

Les tests font tourner la vraie boucle contre la base locale, sous le rôle du worker, **sans
aucun appel payant** : `tests/worker.test.mjs` avec des exécuteurs factices,
`tests/worker-weaver.test.mjs` avec un fournisseur factice pour l'agent, puis avec le vrai
SDK contre un serveur HTTP local pour la passerelle. Le mot de passe local du rôle, dans
`tests/helpers.mjs`, ne vaut que pour le conteneur Docker. Aucune de ces doublures ne prouve
que l'agent fonctionne avec le vrai fournisseur : cela se vérifie en recette, dans le budget
autorisé.
