# Worker — exploitation

Le worker exécute les tâches nées des réservations (table `jobs`, lots H1 et H2). Son code
vit dans `worker/` ; il tourne sur Railway et se connecte à la base sous le rôle PostgreSQL
`filmfund_worker`, qui n'a **aucun droit sur les tables** et n'exécute que ses quatorze
fonctions : six pour les tâches, quatre pour la passerelle IA, une pour lire la clé du
fournisseur, trois pour les exports PDF.

Depuis le lot I1, le worker porte l'agent WEAVER, qui rédige une proposition de pitch
(action `logline`). **Sans clé de fournisseur au coffre, il n'a aucun agent** : les demandes
de pitch restent en file, annulables par leur auteur. La clé se pose depuis l'écran
Administration → Intégrations IA, jamais par une variable d'environnement.

Depuis le lot M1, il fabrique aussi les dossiers PDF (action `pdf_export`). Cette action
n'appelle aucun fournisseur : elle est en service avec ou sans clé.

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

Un compte fournisseur sans crédit répond lui aussi 400 (`invalid_request_error`, « Your credit
balance is too low… »), et non 402 : lire `detail` avant de soupçonner la requête.

**Provision restée sans coût confirmé** : deux cas, à ne pas confondre.

- L'essai a échoué sur une réponse 4xx du fournisseur, mais date d'avant la confirmation
  automatique à zéro : rien n'a été facturé, la provision se solde à zéro.
- L'essai est d'issue inconnue (coupure) : l'appel a pu être facturé. Ne rien solder avant
  d'avoir lu la console du fournisseur — voir « Tâche à rapprocher ».

```sql
-- Provisions sans coût confirmé, avec l'état de leur essai.
select c.attempt_id, c.created_at, c.estimated_usd, a.state, a.error
from public.provider_charges c
join public.job_attempts a on a.id = c.attempt_id
left join public.provider_charge_settlements s on s.attempt_id = c.attempt_id
where s.attempt_id is null
order by c.created_at;

-- Solder à zéro la provision d'un essai refusé : la fonction qu'emploie le worker.
select public.confirmer_cout('<attempt_id>', '<modèle provisionné>', 0, 0, 0, false);
```

Un règlement ne se modifie ni ne se supprime : exécuter d'abord dans une transaction annulée,
en vérifiant le nombre de lignes et la dépense du mois, avant et après. Cette écriture n'est
pas journalisée ; sa seule trace est `settled_at`.

Fait une fois, le 2 octobre 2026 : douze provisions (1,952752 $) d'essais refusés les 1er et
2 octobre, avant la confirmation automatique, ont été soldées à zéro. Le motif de ces douze
refus n'avait pas été journalisé ; les essais suivants, eux journalisés, ont tous été refusés
faute de crédit sur le compte Anthropic.

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

## Exports PDF (lot M1)

Un dossier se compose à la carte : synthèse (pitch et synopsis), types de documents, budget,
plan de financement, planning. La page de garde est toujours présente. Décision 8, prise le
2 octobre 2026.

- **Ce que le worker reçoit** : le contenu des seules sections demandées, pour la seule
  tâche qu'il tient (`contexte_export`). Seuls les documents **finalisés** y entrent. Ni
  image, ni note interne d'une candidature, ni montant réalisé du budget, ni identité des
  membres.
- **Aucun fournisseur, aucun coût** : le PDF est fabriqué en mémoire par `pdfkit`. Rien ne
  s'inscrit au registre des dépenses d'IA.
- **Où va le fichier** : dans la table `project_exports`, déposé par `livrer_export`, qui
  conclut la tâche dans la même transaction. Pas dans le stockage Supabase : y écrire
  demanderait de confier au worker une clé qui contourne toute la RLS.
- **Qui le lit** : le porteur, les éditeurs et les administrateurs — la règle du budget,
  qu'un export peut contenir. Un lecteur du projet n'y a pas accès.
- **Bornes** : 5 Mo par fichier, 30 jours de conservation. Le worker purge les exports
  expirés au démarrage, puis toutes les heures (`purger_exports_expires`).
- **Export identique** : chaque fichier porte l'empreinte de son contenu.
  `export_disponible(projet, demande)` retrouve celui qui correspond encore à l'état du
  projet ; l'écran le propose alors au lieu d'engager une unité.

**Rien à exporter** : si aucune des sections demandées n'a de contenu — aucun document
finalisé, budget non ouvert —, la tâche échoue avec un motif clair et l'unité est rendue.
Une section demandée mais vide est omise du dossier, sans mention.

**Police** : Noto Serif, embarquée (licence OFL, paquet `@expo-google-fonts/noto-serif`). Elle
couvre l'alphabet latin étendu — ɛ, ɔ, ŋ, ɓ, ɗ —, le grec et le cyrillique. Elle ne couvre ni
l'arabe, ni l'amharique, ni le tifinagh : ces caractères sortiraient en cases vides.

**Interruption** : une tâche d'export coupée après son envoi passe « à rapprocher », comme un
appel d'IA. Rien n'a pu être facturé : elle se tranche en échec, l'unité est rendue, et
l'export se redemande.

```sql
-- Exports conservés, et leur poids dans la base.
select count(*) as exports, pg_size_pretty(coalesce(sum(size_bytes), 0)::bigint) as poids
from public.project_exports;
```

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
| `exports_expires_purges`         | Des exports de plus de 30 jours ont été supprimés                                                |
| `purge_exports_impossible`       | La purge a échoué : elle sera retentée à l'heure suivante                                        |
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
