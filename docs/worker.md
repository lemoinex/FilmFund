# Worker — exploitation

Le worker exécute les tâches nées des réservations (table `jobs`, lots H1 et H2). Son code
vit dans `worker/` ; il tourne sur Railway et se connecte à la base sous le rôle PostgreSQL
`filmfund_worker`, qui n'a **aucun droit sur les tables** et n'exécute que ses quatorze
fonctions : six pour les tâches, quatre pour la passerelle IA, une pour lire la clé du
fournisseur, trois pour les exports.

Depuis le lot I1, le worker porte l'agent WEAVER, qui rédige une proposition de pitch
(action `logline`). **Sans clé de fournisseur au coffre, il n'a aucun agent** : les demandes
de pitch restent en file, annulables par leur auteur. La clé se pose depuis l'écran
Administration → Intégrations IA, jamais par une variable d'environnement.

Depuis le lot M1, il fabrique aussi les dossiers PDF (action `pdf_export`), depuis le lot M3
les dossiers Word (action `docx_export`), et depuis le lot M5 les archives ZIP (action
`zip_export`). Ces actions n'appellent aucun fournisseur : elles sont en service avec ou sans
clé.

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

### Dialogues d'une scène (lot J2b-1)

VOICE réécrit les répliques d'une scène du scénario (action `dialogue`, profil
`voice.dialogues@1`), et elles seules : intitulés et didascalies restent tels quels.

- **Le passage est désigné, pas transporté** : les paramètres de la demande portent le
  document, la position et la longueur du passage en caractères, et son empreinte MD5. Le
  texte de la scène ne voyage pas dans le devis, plafonné à 2 000 octets.
- **Trois relectures** par `passage_du_scenario` : au devis, à la préparation de l'appel, à
  l'acceptation. Si le passage n'est plus celui qui a été désigné, le devis est refusé, la
  tâche échoue sans appel — unités rendues —, ou l'acceptation est refusée (code `PR002`) :
  rien n'est remplacé, la proposition reste lisible.
- **Ce qui part chez le fournisseur** : le projet, ses personnages, la scène, et les 3 000
  caractères qui la précèdent. Ni la suite du scénario, ni les autres documents.
- **Bornes** : une scène par demande, 6 000 caractères au plus ; 12 000 pour la scène
  réécrite.
- **Atterrissage** : seul le passage est remplacé dans le document, qui garde une version ;
  la scène remplacée est conservée dans la proposition.

### Livrables structurés (lot J3b-1)

FIELD ne rend pas un texte mais des lignes de budget (action `budget_plan`, profil
`field.budget@1`).

- **Schéma de sortie** : le profil porte un schéma JSON, que la passerelle envoie dans
  `output_config.format`. Il fait partie de ce qui part chez le fournisseur : le modifier,
  c'est publier une nouvelle version du profil.
- **Trois contrôles** : le schéma chez le fournisseur, puis le worker
  (`lireLignesBudget` : catégorie connue, libellé de 200 caractères au plus, quantité et coût
  dans les bornes des colonnes, 40 lignes au plus), puis la base au dépôt
  (`livrer_proposition_budget`). Une seule ligne invalide fait échouer la tâche : motif
  « La réponse du fournisseur n'est pas une liste de lignes exploitable. », unités rendues.
- **Ce qui part chez le fournisseur** : le projet, son contexte, sa vision, le nombre de
  personnages, la devise et les lignes déjà saisies au budget, les jalons du planning. Ni
  document, ni équipe, ni identifiant.
- **Sans budget ouvert**, aucun devis n'est émis : la devise manquerait.
- **Dépôt** : une proposition parente dont le texte est écrit par la base, et une ligne par
  poste dans `ai_suggestion_budget_lines`. Rien n'entre au budget avant qu'une ligne soit
  acceptée par `accepter_ligne_budget`.

FIELD propose aussi des jalons de planning (lot J3b-3a, action `schedule_plan`, profil
`field.planning@1`), sur le même chemin.

- **Aucune date** : un jalon proposé porte un titre, une phase et une durée en jours. FIELD
  ne connaît ni le jour ni le calendrier de l'équipe ; elle date le jalon en l'acceptant.
  Sans date, la durée estimée est gardée dans les notes du jalon.
- **Contrôles** : le schéma chez le fournisseur, puis le worker (`lireJalons` : phase connue
  hors « terminé », titre de 200 caractères au plus, durée entière de 1 à 730 jours, 30
  jalons au plus), puis la base au dépôt (`livrer_proposition_planning`). Un seul jalon
  invalide fait échouer la tâche : motif « La réponse du fournisseur n'est pas une liste de
  jalons exploitable. », unités rendues.
- **Ce qui part chez le fournisseur** : le projet, son contexte, sa vision, le nombre de
  personnages et les jalons déjà saisis. Jamais le budget : les lecteurs de l'équipe lisent
  le planning, pas le budget.
- **Dépôt** : une proposition parente dont le texte est écrit par la base, et une ligne par
  jalon dans `ai_suggestion_milestones`, lisible de toute l'équipe. Rien n'entre au planning
  avant qu'un jalon soit accepté par `accepter_jalon_propose`, réservé à qui écrit le
  planning.

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

## Exports PDF, Word et ZIP (lots M1 à M5)

Un dossier se compose à la carte : synthèse (pitch et synopsis), fiche du projet, types de
documents, budget, plan de financement, planning. La page de garde est toujours présente.
Décision 8, prise le 2 octobre 2026 ; le Word s'y ajoute le 3 octobre 2026, la fiche du projet
(lot M4) et l'archive ZIP (lot M5) le même jour.

- **Fiche du projet** (lot M4) : la section `fiche_projet` reprend la fiche de l'assistant de
  création, dans son ordre — repères (genre, durée, pays de production, langues), synopsis
  court, thème, personnages, enjeux, vision artistique, objectifs, public cible. Elle suit la
  synthèse et précède les documents. Un champ vide est omis ; une fiche entièrement vide,
  aussi. Les personnages sont ceux du seul projet, dans l'ordre de l'écran, sans leur auteur.
  Le format et l'étape n'y figurent pas : la page de garde les porte déjà. Les pays sont
  nommés par `Intl`, comme à l'écran ; les genres et les rôles, par la copie des libellés que
  tient le worker.

- **Format** : c'est l'action de la tâche — `pdf_export`, `docx_export` ou `zip_export`. Le
  worker compose le même plan de dossier, puis le rend avec `pdfkit`, avec le paquet `docx`,
  ou en archive. Un worker qui ne connaît pas encore une action laisse ses tâches en file.

- **Archive ZIP** (lot M5) : chaque pièce sort dans le format où elle se retravaille.
  - `presentation.docx` : la synthèse et la fiche du projet.
  - `documents/NN-<type>-<titre>.docx` : un fichier par document finalisé, numéroté dans
    l'ordre du dossier. Les noms sont réduits à des minuscules sans accent, des chiffres et
    des tirets : aucun séparateur de dossier ne peut venir d'un titre.
  - `budget.xlsx`, `plan-de-financement.xlsx`, `planning.xlsx` : un classeur par tableau.
    Quantités et montants y sont des nombres, échéances et périodes des dates ; le plan de
    financement porte un total par devise.
  - Une pièce demandée mais vide est omise, comme une section d'un dossier.
  - Les classeurs sont écrits par `worker/src/exports/xlsx.ts`, sans bibliothèque Excel :
    six fichiers XML dans une archive (`jszip`). Un texte y est rangé dans la table des
    textes partagés : un tableur ne l'interprète jamais, et un libellé qui commence par
    « = » reste un texte. Les caractères que le XML interdit sont retirés.
  - La base ne distingue pas une archive d'un Word par ses octets — un DOCX est une
    archive ZIP : c'est l'action de la tâche qui fixe le format rangé.

- **Ce que le worker reçoit** : le contenu des seules sections demandées, pour la seule
  tâche qu'il tient (`contexte_export`). Seuls les documents **finalisés** y entrent. Ni
  image, ni note interne d'une candidature, ni montant réalisé du budget, ni identité des
  membres.
- **Aucun fournisseur, aucun coût** : le fichier est fabriqué en mémoire. Rien ne s'inscrit
  au registre des dépenses d'IA.
- **Quota** : un export Word ou ZIP consomme la même unité qu'un PDF
  (`pdf_exports_per_month`), sur le même quota.
- **Où va le fichier** : dans la table `project_exports`, déposé par `livrer_export`, qui
  conclut la tâche dans la même transaction. Pas dans le stockage Supabase : y écrire
  demanderait de confier au worker une clé qui contourne toute la RLS. La base contrôle la
  signature selon le format (`%PDF-`, ou `PK` pour un Word comme pour une archive) ; un PDF
  compte ses pages, un Word n'en déclare pas — le traitement de texte recalcule la
  pagination —, une archive non plus.
- **Qui le lit** : le porteur, les éditeurs et les administrateurs — la règle du budget,
  qu'un export peut contenir. Un lecteur du projet n'y a pas accès.
- **Bornes** : 5 Mo par fichier, 30 jours de conservation. Le worker purge les exports
  expirés au démarrage, puis toutes les heures (`purger_exports_expires`).
- **Export identique** : chaque fichier porte l'empreinte de son contenu.
  `export_disponible(projet, demande, format)` retrouve celui qui correspond encore à l'état
  du projet, dans ce format (PDF par défaut) ; l'écran le propose alors au lieu d'engager
  une unité.
- **Écran** (lots M2 et M3) : onglet « Dossier » du projet, visible de qui lit le budget,
  avec le choix du format. Le fichier se télécharge par la route
  `/projets/<projet>/dossier/<export>`, lue avec la session de l'utilisateur : c'est la RLS
  qui décide, et tout refus répond 404. Le type servi vient du format rangé en base, confirmé
  par les octets du fichier.

**Rien à exporter** : si aucune des sections demandées n'a de contenu — aucun document
finalisé, budget non ouvert, fiche vide —, la tâche échoue avec un motif clair et l'unité est
rendue.
Une section demandée mais vide est omise du dossier, sans mention.

**Police** : Noto Serif, embarquée (licence OFL, paquet `@expo-google-fonts/noto-serif`). Elle
couvre l'alphabet latin étendu — ɛ, ɔ, ŋ, ɓ, ɗ —, le grec et le cyrillique. Elle ne couvre ni
l'arabe, ni l'amharique, ni le tifinagh : ces caractères sortiraient en cases vides. Un
fichier Word, lui, n'embarque aucune police : il demande Cambria, livrée avec Office, qui
couvre ɛ, ɔ et ŋ ; LibreOffice la remplace par Caladea, de mêmes dimensions.

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
- Démarrage : `node src/index.ts`, directement (Node 22 exécute le TypeScript tel quel).
  Jamais `npm start` : npm devient alors le processus principal, le signal d'arrêt ne
  parvient pas au worker, et la tâche en cours est coupée au lieu d'être menée à son terme.
- Délai d'arrêt (_draining_) : 200 secondes entre SIGTERM et SIGKILL, au-dessus des trois
  minutes que la passerelle laisse à un appel. La valeur par défaut de Railway est zéro.
- Attente de la CI (_Wait for CI_) : Railway ne déploie qu'une fois la CI GitHub verte sur
  `main`, soit quelques minutes après la fusion.
- Redéploiement seulement quand `worker/**` change. Un redéploiement doit laisser aux
  journaux `arret_demande` puis `worker_arrete` ; `npm error signal SIGTERM` à leur place
  signale un démarrage par npm.
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
