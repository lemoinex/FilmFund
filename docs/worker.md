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
| Plafond mensuel des dépenses d'IA          | Administration → Intégrations IA ; table `ai_settings`, journalisée    |
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

### Retouches d'un passage (lot RT1)

WEAVER retouche un passage d'un document de tout type : améliorer, raccourcir, développer,
corriger. Quatre actions — `text_improve`, `text_shorten`, `text_expand`, `text_correct` —,
quatre profils `weaver.retouche_*@1`, un seul prix au barème (`text_edit_per_passage`).

- **Même mécanique que les dialogues** : passage désigné, pas transporté ; trois relectures,
  ici par `passage_du_document`, qui n'exige aucun type de document ; acceptation refusée
  (code `PR002`) si le document a changé à cet endroit.
- **Contexte mince**, par `contexte_retouche` : le passage, les 1 500 caractères qui le
  précèdent et les 500 qui le suivent, le titre et le type du document, et du projet son
  titre, son format, son genre, ses langues et son pitch. Ni personnages, ni vision, ni budget.
- **Bornes** : 6 000 caractères pour un passage ; 12 000 pour un passage retouché, 6 000
  pour un passage raccourci. Le worker écarte une réponse plus longue avant le dépôt.
- Tenues à part de `PROFILS_IA` (`PROFILS_RETOUCHE`) : elles ne se demandent pas depuis un
  encart de texte. `executeursWeaver` les sert après les rédactions.

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

FRAME propose le découpage technique d'une scène (lot J3c-2a, action `shot_list`, profil
`frame.decoupage@1`), sur le même chemin. Sa demande désigne une scène du storyboard ; son
contexte porte le scénario enregistré en entier, ce qui en fait l'appel dont l'entrée est la
plus longue. Si la scène a été supprimée avant l'appel, rien n'est envoyé.

GEAR propose une liste de matériel (lot J3c-3, action `gear_list`, profil `gear.materiel@1`),
sur le même chemin. Sa demande vise le projet entier ; son contexte porte le storyboard, le
découpage résumé et le matériel déjà saisi, sans scénario ni budget. Il ne rend aucun calcul.

ARC propose des personnages (lot X2a, action `character_list`, profil `arc.personnages@1`),
sur le même chemin. Sa demande vise le projet entier ; son contexte porte le concept, la
vision et les personnages déjà saisis, sans scénario, document ni budget. Un nom rendu deux
fois n'est gardé qu'une ; un homonyme d'un personnage saisi est laissé à la décision de
l'équipe. `executeursArc` sert donc deux familles de profils : ses textes (`PROFILS_ARC`) et
ses lignes (`PROFILS_ARC_PERSONNAGES`).

SCRIPT propose les épisodes d'une série (lot SE2a, action `episode_list`, profil
`script.episodes@1`), sur le même chemin. Sa demande vise le projet entier ; son contexte porte
le concept, la vision, les personnages, les épisodes déjà saisis — cent au plus, le début de
chaque résumé — et la bible de série la plus récente, brouillon compris, bornée à 20 000
caractères ; ni scénario, ni autre document, ni budget. Une ligne rendue porte un titre et un
résumé, sans numéro ni durée : la base donne à l'épisode accepté le numéro qui suit le plus
grand. Un titre rendu deux fois n'est gardé qu'une. Le devis est refusé hors d'une série.
`executeursScript` sert donc deux familles de profils : ses textes (`PROFILS_SCRIPT`) et ses
lignes (`PROFILS_SCRIPT_EPISODES`). Le worker annonce une action de plus à son démarrage.

BOARD dessine la vignette d'une scène (lot K1, action `storyboard_image`, profil
`board.vignette@1`). Il est le seul agent servi par OpenAI : la passerelle l'appelle par une
requête HTTPS, sans SDK, vers une seule adresse. Sa clé se pose depuis Intégrations IA,
comme celle d'Anthropic, et les deux sont indépendantes : retirer l'une ne sort pas les
agents de l'autre. La vignette est déposée en base ; le worker n'a aucun droit sur le
stockage. Si la réponse ne rapporte pas sa consommation, le coût est laissé à rapprocher.

SCOUT répond à une question par une synthèse sourcée (lot L1, action `research`, profil
`scout.recherche@1`). Il lui faut **deux clés**, celle de Perplexity et celle d'Anthropic :
il sort du service dès qu'une manque.

- **Deux temps** : une requête à l'API de recherche de Perplexity, par HTTPS, sans SDK, vers
  une seule adresse ; puis la synthèse par Anthropic, sur les seuls extraits rendus.
- **Ce qui part chez Perplexity** : la question, et deux bornes du profil (nombre de pages,
  longueur des extraits). Rien d'autre du projet.
- **Ce qui part chez Anthropic** : la question, le format, le genre et les pays du projet,
  et les extraits numérotés — sans leurs adresses.
- **Aucune page n'est visitée** : le worker ne suit aucun lien. Les adresses rendues sont
  triées (`adresseAdmise` : HTTPS, nom de domaine public, ni identifiant, ni port, ni
  adresse IP), dédoublonnées, et les pages sans extrait écartées.
- **Contrôles de la synthèse** : `lireSynthese`, puis la base au dépôt
  (`livrer_proposition_recherche`) — chaque renvoi « [n] » désigne une source collectée, il
  y en a au moins un, et le texte n'écrit aucune adresse. Sinon la tâche échoue : motif
  « La réponse du fournisseur n'est pas une synthèse exploitable… », unités rendues.
- **Sans page exploitable** : motif « Aucune source exploitable n'a été trouvée pour cette
  question. » La requête, servie, reste due ; le modèle n'est pas appelé.
- **Dépôt** : la synthèse dans la proposition, une ligne par source dans
  `ai_suggestion_sources`. Rien n'entre aux sources du projet avant qu'une source soit
  retenue par `accepter_source_proposee`, « non vérifiée ».

GRIOT situe un sujet dans son contexte historique et culturel (lot L3, action
`cultural_context`, profil `griot.contexte@1`). Il n'a pas d'exécuteur à lui : celui de
SCOUT, avec un autre profil. Deux différences :

- **Sites admis** : le profil porte une liste fermée (`DOMAINES_CONTEXTE`), transmise au
  moteur par `search_domain_filter`. Le worker ne s'y fie pas : `retenirSources` écarte toute
  page dont l'hôte n'est ni un site de la liste, ni l'un de ses sous-domaines.
- **Consignes** : celles d'un historien — d'où parle la source, de quand, ce qui est
  contesté, à qui l'affirmation s'applique.

Changer la liste ou les consignes, c'est publier une nouvelle version du profil. Si rien ne
revient des sites admis : « Aucune source exploitable n'a été trouvée pour cette question. »

MATCH relève les opportunités que des pages annoncent, pour le catalogue de
l'administration (lot L6a, action `opportunity_watch`, profil `match.veille@1`). Sa collecte
est celle de SCOUT (`collecter`, dans `agents/scout.ts`) : même moteur, même prix, même
registre. Ce qui lui est propre :

- **Une tâche de l'administration** : elle n'a ni projet, ni studio, ni réservation, et
  n'entame le quota d'aucun studio. Elle naît de `demander_veille`, réservée aux
  administrateurs et journalisée ; elle compte dans la dépense du mois, et le plafond la
  refuse comme toute autre. Une veille à la fois ; vingt par administrateur et par
  vingt-quatre heures. Le worker revérifie que son auteur est toujours administrateur.
- **Un relevé, pas une synthèse** : pour chaque opportunité, le rang de la page, un nom, un
  organisme, une catégorie et un résumé. Ni montant, ni date limite, ni pays, ni critère dans
  un champ à part. L'organisme reste vide si ni le titre ni l'extrait ne le nomment.
- **Contrôles** : le schéma chez le fournisseur, puis le worker (`lireOpportunites` : page
  de la collecte, catégorie du catalogue, 200 caractères pour un nom, 1 500 pour un résumé,
  aucune adresse écrite, 20 opportunités au plus), puis la base au dépôt
  (`livrer_proposition_veille`). L'adresse, le titre, l'extrait et la date d'une opportunité
  viennent de la page désignée, jamais du modèle.
- **Aucune opportunité relevée** : la tâche réussit, et la proposition se dépose close —
  rappeler le modèle ne trouverait rien de plus dans ces pages. Un relevé invalide, lui, fait
  échouer la tâche : « La réponse du fournisseur n'est pas un relevé exploitable… ».
- **Dépôt** : une proposition parente sans projet, dont le texte est écrit par la base, et
  une ligne par opportunité dans `ai_suggestion_opportunities`, lue des seuls
  administrateurs. Rien n'entre au catalogue avant `accepter_opportunite_proposee`, qui
  l'ajoute « non vérifiée » — nom, organisme et catégorie s'y corrigent, la provenance non.
  Une opportunité déjà au catalogue est refusée.

Ce que le worker ne fait pas : il ne visite aucune page. Le résumé est celui d'un extrait
rendu par le moteur, pas de la page entière ; vérifier une opportunité reste le geste d'un
administrateur, page ouverte.

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

Une recherche de SCOUT ajoute une ligne à un second registre, de même forme :
`provider_search_charges` (la requête provisionnée, 0,005 $) et
`provider_search_settlements` (les requêtes servies : une, ou zéro si le moteur a refusé).
Les deux registres comptent dans la dépense du mois. La requête est provisionnée avec, en
réserve, le pire coût de la synthèse : le plafond refuse l'ensemble avant le premier appel.
Si la synthèse échoue après une collecte servie, la tâche repart une fois, et une seconde
requête est payée.

**Requête refusée** (statut 4xx hors 429) : le fournisseur ne l'a ni traitée ni facturée. Le
coût est alors confirmé à **zéro**, pour que la provision cesse de peser sur le plafond du
mois. Le motif exact figure dans le champ `detail` de l'événement `essai_echoue`, lisible
dans les journaux Railway — jamais en base, où l'équipe du projet ne lit qu'un message
général.

Un cas à part : **le compte d'OpenAI sans crédits**. OpenAI le signale par un 429, comme une
limite de débit, mais n'a rien traité : la passerelle le reconnaît au type ou au code de
l'erreur (`insufficient_quota`, `credit_balance_exhausted`), solde le coût à zéro et inscrit
sur la tâche « Le compte du fournisseur n'a plus de crédits ». Tout autre 429 reste douteux.
Le 6 octobre 2026, avant ce correctif, quatre refus de ce genre ont laissé 2,43 $ de
provisions au registre.

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

Depuis le lot Y1, la dépense du mois, le plafond et ce qui reste se lisent en tête
d'**Administration → Intégrations IA**, où un administrateur change le plafond. L'écran borne
la saisie à 50 $ : un garde-fou contre une faute de frappe, pas une limite de la base. Il
prévient quand il reste moins de 1 $, et quand le plafond est atteint.

Ce plafond est celui de la plateforme. Le crédit d'un compte chez son fournisseur est autre
chose : un compte Anthropic ou OpenAI à sec fait échouer l'appel quel que soit le plafond, et
un plafond atteint refuse la demande quel que soit le crédit.

Depuis le lot Z1, **Administration → Coûts de l'IA** montre ce que les appels ont coûté sur
douze mois, par agent, par profil et par modèle : appels, jetons ou requêtes, montant compté,
et ce qui empêche de le lire comme acquis — appels sans issue connue, comptés à leur réserve ;
appels au tarif inconnu, à rapprocher ; replis de modèle ; refus du fournisseur, sans coût. La
somme d'un mois est celle que le plafond compte. Ces montants viennent des tarifs relevés à la
main dans `worker/src/ia/profils.ts` : la facture du fournisseur seule fait foi.

La voie SQL reste ouverte à l'exploitant, au-delà de 50 $ compris :

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
- **Découpage et matériel** (lot J3c-4) : les sections `decoupage` et `materiel` ferment le
  dossier, après le planning. Le découpage sort scène par scène — celles qui ont des plans,
  et elles seules —, chacune avec son en-tête et le tableau de ses plans ; le matériel, rangé
  par catégorie. En archive, deux classeurs de plus, `decoupage.xlsx` et `materiel.xlsx`.
  **Aucun calcul électrique n'entre dans un dossier** : ni charge, ni intensité, ni groupe
  conseillé — la base ne les rend pas, et le worker n'additionne rien.

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

## Note de réalisation et pitchs (lot X1)

Trois actions de plus pour WEAVER, sans mécanique propre : `direction_note`,
`pitch_extended` et `pitch_oral` passent par la fabrique d'exécuteurs des autres rédactions,
avec leurs profils — `weaver.note_realisation@1`, `weaver.pitch_developpe@1`,
`weaver.pitch_oral@1`. Ce qui part chez le fournisseur est le contexte des autres
rédactions : projet, contexte, personnages, vision, documents finalisés. Bornes de la base au
dépôt : 20 000 caractères pour la note, 6 000 pour un pitch ; le worker refuse un texte plus
long avant de le déposer, et la tâche échoue après deux essais, unités rendues. Le worker
annonce donc trois actions de plus à son démarrage. Suite locale :
`tests/worker-realisation-pitch.test.mjs`, avec un fournisseur factice.

## Tâche d'un compte suspendu (lot V2a)

Le worker ne passe pas par l'API : le contrôle qui refuse tout à un compte suspendu ne le
concerne pas. C'est `peut_engager_unites_pour()`, consultée par `reclamer_travail()`, qui tient
ce verrou. Une tâche **en attente** dont l'auteur est suspendu n'est pas exécutée : elle est
close « Droits de l'auteur retirés avant l'exécution », comme pour une adhésion révoquée, et
ses unités sont rendues. Une tâche **déjà en cours** se termine : son coût est engagé chez le
fournisseur. La proposition qu'elle dépose attend le rétablissement du compte, ou la décision
d'un autre membre de l'équipe.

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
