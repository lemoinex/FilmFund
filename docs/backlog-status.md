# Suivi du backlog — directives de fiabilité

Tiré de `docs/implementation-audit.md` (section 13). Aucun ticket n'est coché avant d'être
réellement validé. Deux statuts de fin sont distincts : **validé localement** (tests et
navigateur sur la pile locale) et **validé en recette** (conditions réelles, fournisseurs
réels).

| Lot | Ticket                                                                                                                         | Statut            | Bloqué par         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------ |
| A   | Journal des actions d'administration                                                                                           | validé en recette | —                  |
| B   | Versions de documents                                                                                                          | validé en recette | —                  |
| C   | Envois d'images orphelins                                                                                                      | validé en recette | —                  |
| D   | Durcissements mineurs (`is_admin()` en `(select …)`, `touch_updated_at`, test du jeton expiré)                                 | validé en recette | —                  |
| E   | Modèle studio (socle : studio personnel, projets rattachés, isolation)                                                         | validé en recette | —                  |
| F   | Plans, profils, registres distincts — F1 : plans versionnés, abonnements, limites projets et membres ; F2 : limite de stockage | validé en recette | —                  |
| F3  | Offre publique sur la vitrine (catalogue lisible par les visiteurs, section Tarifs)                                            | validé en recette | —                  |
| G   | Devis, réservation atomique, idempotence                                                                                       | validé en recette | —                  |
| H1  | Tâches persistantes, outbox, rapprochement — en base : tâches, essais, rôle dédié du worker                                    | validé en recette | —                  |
| H2  | Worker Node (`worker/`) et son déploiement sur Railway                                                                         | validé en recette | —                  |
| I1  | Passerelle IA et premier agent (WEAVER) : le pitch de bout en bout                                                             | validé en recette | —                  |
| I1b | Intégrations IA : les clés des fournisseurs posées depuis l'administration, rangées au coffre                                  | validé en recette | —                  |
| I2a | WEAVER : synopsis court / standard / détaillé et note d'intention — base, profils, agent                                       | validé en recette | —                  |
| I2b | WEAVER : écrans de génération, comparaison et application des propositions                                                     | validé en recette | —                  |
| J1  | SCRIPT : traitement et bible                                                                                                   | validé en recette | —                  |
| J2  | SCRIPT et VOICE : scénario et dialogues — textes longs                                                                         | à faire           | décision 8         |
| J3a | ARC : analyse dramaturgique                                                                                                    | validé localement | recette            |
| J3b | FIELD : budget, financement et calendrier — données structurées                                                                | à faire           | décision 9         |
| J3c | FRAME et GEAR : découpage technique, matériel et calculs électriques                                                           | à faire           | cahier des charges |
| K   | BOARD (quota image, croquis noir et blanc)                                                                                     | bloqué            | I1, décision 7     |
| L   | SCOUT, GRIOT, MATCH (sources et provenance)                                                                                    | bloqué            | I1, décision 7     |
| M1  | Exports PDF : contenu du dossier, fabrication par le worker, dépôt et purge                                                    | validé en recette | —                  |
| M2  | Exports PDF : écran de sélection des sections et téléchargement                                                                | validé en recette | —                  |
| M3  | Exports DOCX : le même dossier en Word, même écran, même quota                                                                 | validé en recette | —                  |
| M4  | Exports : la fiche du projet et ses personnages dans le dossier, en PDF comme en Word                                          | validé en recette | —                  |
| M5  | Exports ZIP : un fichier Word par texte, un classeur Excel par tableau, même écran, même quota                                 | validé en recette | —                  |
| N   | Paiements                                                                                                                      | bloqué            | Décision 6, F      |
| O   | Interface des quotas et incidents                                                                                              | bloqué            | F à N              |
| P   | Recette intégrée avant ouverture commerciale                                                                                   | bloqué            | Tous               |
| Q1  | Page de profil : prénom, nom, pays, ville, profession, type ; accueil du tableau de bord                                       | validé en recette | —                  |
| Q2  | Photo de profil (stockage privé, politiques, contrôle des octets)                                                              | validé en recette | —                  |
| R1  | Assistant de création, base : fiche du projet et personnages                                                                   | validé en recette | —                  |
| R2  | Assistant de création, écrans : étapes, enregistrement étape par étape, récapitulatif                                          | validé en recette | —                  |
| S1  | Score de maturité : pondérations versionnées, faits du projet, calcul, encart (page du projet, tableau de bord)                | validé en recette | —                  |
| S2  | Score de maturité : cartes de la liste des projets, écran de publication des pondérations                                      | validé en recette | —                  |

## Recette de WEAVER : I1, I1b, I2a et I2b

Le 4 octobre 2026, les cinq livrables de l'assistant d'écriture ont été produits en
production par un administrateur, de l'écran au texte appliqué (mode privé actif).

Jusqu'au 3 octobre, aucune demande n'aboutissait : douze tâches `logline` ont échoué entre le
1er et le 3 octobre, d'abord en 400 — « Your credit balance is too low » —, puis en 401 après
une première clé invalide. Le motif se lit dans les journaux du worker, et un refus ne pèse
pas sur le plafond mensuel : les provisions de ces douze tâches sont soldées à zéro, et leurs
unités ont été rendues. **Le premier appel réel a réussi le 3 octobre à 02h49 UTC.**

Onze tâches d'IA ont réussi depuis, toutes au premier essai, toutes sur `claude-opus-5-5`,
**aucun repli**, aucune tâche à rapprocher. Dix propositions appliquées, une écartée.

| Livrable            | Durée  | Caractères | Coût confirmé | Atterrissage vérifié                      |
| ------------------- | ------ | ---------- | ------------- | ----------------------------------------- |
| `logline`           | 6,5 s  | 185        | 0,008756 $    | `projects.logline`                        |
| `synopsis_standard` | 16,3 s | 1 152      | 0,027412 $    | `projects.synopsis`                       |
| `synopsis_short`    | 10,5 s | 429        | 0,019896 $    | `projects.short_synopsis`                 |
| `synopsis_detailed` | 16,2 s | 1 804      | 0,028380 $    | document `synopsis` créé, version 1       |
| `intention_note`    | 40,1 s | 4 916      | 0,067588 $    | document `note_intention` créé, version 1 |
| `intention_note`    | 53,1 s | 4 722      | 0,089048 $    | même document, **version 2**              |

- Chaque proposition porte son profil versionné : `weaver.logline@1`, `synopsis_court@1`,
  `synopsis_standard@1`, `synopsis_detaille@1`, `note_intention@1`.
- Les unités ont été consommées exactement comme devisées — 1, 2, 1, 3, 3, 3 — et rien n'a été
  rendu sur une tâche réussie.
- **Rien n'est écrasé sans trace** : la seconde note d'intention a remplacé la première, le
  document porte deux versions — 4 916 puis 4 722 caractères — et le texte remplacé est
  conservé dans la proposition. C'est l'invariant central du lot, vérifié en réel.
- Un document créé par une acceptation naît **en brouillon** : à l'équipe de le finaliser, un
  dossier n'emportant que des documents finalisés.
- Une proposition écartée n'écrit rien nulle part : vérifié sur le premier synopsis détaillé.
- Dépense du mois : 0,329756 $ sur un plafond de 5 $.
- Les encarts des trois rubriques ont été relus à l'écran par l'utilisateur : page du projet
  (pitch, synopsis), fiche (synopsis court), documents (synopsis détaillé, note d'intention),
  chacun nommant le document qu'il remplacerait.

Non couvert par cette recette : un éditeur et un lecteur réels, faute de second compte tant
que le mode privé est actif (vérifiés localement et par les tests) ; l'annulation d'une tâche
en attente et le rapprochement d'une tâche interrompue, qu'aucune demande réelle n'a produits ;
une demande refusée pour quota épuisé, le studio d'essai disposant de 1 500 unités.

## Recette du lot M

Le 2 octobre 2026, un premier dossier a été fabriqué en production, de l'écran au
téléchargement, par un administrateur (mode privé actif).

- Demande depuis l'onglet « Dossier PDF » d'un projet : section « Synthèse » seule, devis puis
  lancement.
- Tâche `pdf_export` réclamée par le worker Railway cinq secondes plus tard, réussie au premier
  essai en 212 ms ; aucune alerte dans ses journaux.
- En base : un export de 2 pages et 10 684 octets, rattaché à sa tâche, expirant 30 jours
  après ; une unité PDF réservée, consommée, rien de rendu.
- Téléchargement servi par la route du dossier ; le fichier a été ouvert et jugé correct par
  l'utilisateur.

Non couvert par cette recette, faute de second compte tant que le mode privé est actif : un
éditeur et un lecteur réels (vérifiés localement et par les tests), un dossier avec documents,
budget, plan de financement et planning, et la purge d'un export arrivé à expiration.

## Recette du lot Q1

Le 2 octobre 2026, un administrateur a renseigné son profil en production (mode privé actif).

- Migration poussée 73 secondes après la fusion ; aucune requête n'est arrivée sur le site
  entre les deux, et le schéma de production ne présente aucun écart avec les migrations.
- Tableau de bord et page `/profil` servis sans erreur ; enregistrement du formulaire réussi,
  message « Profil enregistré. » vu par l'utilisateur.
- En base : le profil modifié à la seconde de l'enregistrement, un pays et un type renseignés ;
  aucune entrée au journal d'administration, le titulaire modifiant son propre profil.

Non couvert par cette recette : l'accueil par le prénom, aucun prénom n'ayant été saisi (le
tableau de bord salue alors par le nom affiché ; vérifié localement) ; un compte non
administrateur, faute de second compte tant que le mode privé est actif (vérifié par les
tests) ; la modification d'un profil par un administrateur tiers et sa trace au journal
(vérifiées par les tests).

## Recette du lot Q2

Le 2 octobre 2026, un administrateur a ajouté sa photo de profil en production (mode privé
actif).

- Migration poussée moins d'une minute après la fusion ; aucune requête n'est arrivée sur le
  site entre les deux ; compartiment, politiques et contrainte relus dans le catalogue, et
  aucun écart de schéma avec les migrations.
- Envoi direct du navigateur au stockage, puis rattachement par la page `/profil` réussi ;
  photo affichée, selon l'utilisateur.
- En base : une photo rattachée, un seul fichier dans le compartiment (un JPEG de 24 645
  octets), le chemin enregistré désignant bien ce fichier ; aucune entrée au journal
  d'administration, le titulaire modifiant son propre profil.

Non couvert par cette recette : le refus d'un fichier déguisé en image, le remplacement et le
retrait (vérifiés localement) ; un compte non administrateur, faute de second compte tant que
le mode privé est actif (vérifié par les tests).

## Recette du lot M3

Le 3 octobre 2026, un administrateur a fabriqué un dossier Word en production, de l'écran au
fichier ouvert (mode privé actif).

- Migration poussée 27 secondes après la fusion ; aucun écart de schéma avec les migrations ;
  le worker redéployé annonce `pdf_export`, `docx_export` et `logline`.
- Demande depuis l'onglet « Dossier », format Word : devis puis lancement.
- Tâche `docx_export` réclamée par le worker Railway deux secondes plus tard, réussie au
  premier essai en 254 ms ; aucune alerte dans ses journaux.
- Téléchargement servi par la route du dossier ; le fichier s'ouvre correctement, selon
  l'utilisateur.

Non couvert par cette recette : un dossier Word avec documents, budget, plan de financement et
planning (vérifiés localement et par les tests du worker) ; l'ouverture dans LibreOffice ; un
éditeur et un lecteur réels, faute de second compte tant que le mode privé est actif
(vérifiés par les tests).

## Recette du lot R

Le 3 octobre 2026, un administrateur a créé un projet avec l'assistant en production, de la
première étape à la fiche (mode privé actif). R1 (migration poussée à 01h41) et R2 (fusionné à
02h22, sans migration) sont recettés ensemble, R1 n'ayant pas d'écran propre.

- Projet créé par la première étape, puis renvoi vers « Concept » ; format, étape, genre,
  durée, pays et langues enregistrés.
- Un personnage ajouté, rattaché au projet, son auteur étant le porteur.
- Les six étapes à champs enregistrées l'une après l'autre, puis la fiche affichée avec le
  message de fin, selon l'utilisateur.
- Journaux Vercel : aucune erreur d'exécution, réponses 200 ; aucune entrée au journal
  d'administration, l'administrateur agissant dans son propre projet.

Non couvert par cette recette : plusieurs pays de production et le choix du principal, la
modification et le retrait d'un personnage, « Passer cette étape » (vérifiés localement et par
les tests) ; un éditeur et un lecteur réels, ni l'accès refusé à un compte étranger, faute de
second compte tant que le mode privé est actif (vérifiés localement et par les tests).

## Recette du lot M4

Le 3 octobre 2026, un administrateur a fabriqué en production un dossier PDF puis un dossier
Word contenant la fiche du projet, de l'écran au fichier ouvert (mode privé actif).

- Avant la fusion, la base de production ne s'écartait des migrations que par les deux
  fonctions du lot. Fusion à 04h06 UTC, migration poussée 38 secondes après ; aucun écart de
  schéma ensuite ; le worker redéployé annonce `pdf_export`, `docx_export` et `logline`.
- Demandes depuis l'onglet « Dossier » : sections « Synthèse » et « Fiche du projet », devis
  puis lancement, dans chaque format.
- Tâche `pdf_export` réclamée par le worker Railway cinq secondes plus tard, réussie au
  premier essai en 187 ms : un fichier de 3 pages et 12 800 octets. Tâche `docx_export`
  réclamée deux secondes plus tard, réussie au premier essai en 91 ms : 12 059 octets, sans
  nombre de pages. Aucune alerte dans les journaux du worker.
- Une unité d'export consommée pour chaque fichier, rien de rendu ; chaque empreinte
  correspond encore au contenu du projet.
- Téléchargements servis par la route du dossier ; aucune erreur d'exécution chez Vercel. Les
  deux fichiers ont été ouverts et jugés corrects par l'utilisateur.

Non couvert par cette recette : un projet à plusieurs personnages ou à plusieurs pays, et la
fiche aux côtés de documents, du budget, du plan de financement et du planning (vérifiés
localement et par les tests) ; un éditeur et un lecteur réels, faute de second compte tant que
le mode privé est actif (vérifiés par les tests).

Relevé lors de ce lot, corrigé depuis : dans un tableau Word, un retour à la ligne à
l'intérieur d'une cellule s'affichait comme une espace — la description d'un personnage,
l'échéance d'un financement. Chaque ligne d'une cellule y est désormais écrite séparément. Un
dossier Word fabriqué avant ce correctif garde l'ancien rendu tant qu'il est retrouvé à
l'identique : il se refait dès que le contenu du projet change, ou à son expiration.

## Recette du lot S1

Le 3 octobre 2026, un administrateur a lu en production le score de maturité d'un de ses
projets, sur le tableau de bord puis sur la page du projet (mode privé actif).

- Avant la fusion, essai à blanc : une seule migration à pousser, celle du lot. Fusion à
  14h08 UTC, migration poussée 18 secondes après ; 33 migrations appliquées sur 33. Le worker
  n'est pas redéployé : il n'a pas changé.
- En base, relu après la migration : RLS active sur `readiness_weight_versions`, ses trois
  politiques dont celle du mode privé, ses quatre déclencheurs, le total de 100 contrôlé, la
  version 1 aux pondérations du cahier des charges ; `faits_maturite()` sans
  `security definer`, fermée aux visiteurs.
- Sessions simulées dans une transaction annulée : un administrateur lit les 26 faits d'un
  projet et la version des pondérations ; un compte connecté inconnu ne lit ni les uns ni
  l'autre ; un visiteur est refusé.
- Tableau de bord : bloc « Maturité du dossier » à 36 / 100, 17 éléments à améliorer, avec la
  phrase qui dit ce que le score mesure (capture de l'utilisateur). Le calcul livré, appliqué
  aux faits lus en production, donne le même score et le même nombre.
- Page du projet : détail des neuf critères et version des pondérations, déclarés conformes
  par l'utilisateur aux valeurs recalculées (sans capture).
- Aucune erreur d'exécution chez Vercel depuis le déploiement.

Non couvert par cette recette : des critères « Vision artistique », « Budget », « Plan de
financement » et « Dossier » autres qu'à zéro — le projet lu n'a ni vision, ni budget, ni
candidature, ni document finalisé (vérifiés localement et par les tests) ; un éditeur et un
lecteur réels, faute de second compte tant que le mode privé est actif (vérifiés par les
tests) ; la publication d'une nouvelle version des pondérations et sa ligne au journal,
qu'aucun écran ne permet avant le lot S2 (vérifiées par les tests).

## Recette du lot S2

Le 3 octobre 2026, un administrateur a lu en production le score de ses projets sur les
listes (mode privé actif).

- Avant la fusion, essai à blanc : une seule migration à pousser, celle du lot. Fusion à
  15h25 UTC, migration poussée 10 secondes après, avant la fin de la construction du site ;
  34 migrations appliquées sur 34. Le worker n'est pas redéployé : il n'a pas changé.
- En base, relu après la migration : `faits_maturite_projets()` sans `security definer`,
  fermée aux visiteurs, avec la règle du budget et le plafond de cent projets.
- Sessions simulées dans une transaction annulée : un administrateur obtient une ligne par
  projet, aux mêmes faits que la lecture d'un projet seul ; un compte connecté inconnu
  n'obtient aucune ligne ; un visiteur est refusé ; cent un projets sont refusés.
- Listes : étiquettes « Maturité 36 / 100 » et « Maturité 5 / 100 », valeurs données par le
  calcul livré sur les faits lus en production, déclarées conformes par l'utilisateur (sans
  capture).
- Aucune erreur d'exécution chez Vercel depuis le déploiement.

Non couvert par cette recette : l'écran de publication en production — aucune version n'y a
été publiée (la version 1 reste seule en base, sans ligne au journal), et ni son affichage ni
le refus d'un total différent de 100 n'ont laissé de trace (vérifiés localement et par les
tests) ; un éditeur et un lecteur réels, faute de second compte tant que le mode privé est
actif (vérifiés localement et par les tests) ; une liste de plus de cent projets (vérifiée
localement).

## Recette du lot M5

Le 4 octobre 2026, un administrateur a fabriqué en production deux dossiers ZIP, de l'écran au
fichier ouvert dans Word et dans Excel (mode privé actif).

- Avant la fusion, essai à blanc : une seule migration à pousser, celle du lot. Fusion de la
  PR 68 (`8d33136`), migration poussée aussitôt ; après le push, `supabase db diff --linked`
  ne trouve aucun écart entre la base de production et les migrations.
- En base, relu après la migration : `creer_devis`, `contexte_export` et `livrer_export`
  portent la branche `zip` ; `export_format` admet `pdf`, `docx` et `zip` ; `devis_action_connue`
  admet `zip_export`.
- Le worker a été reconstruit par la fusion elle-même — le lot touche `worker/` —, en 37
  secondes, et annonce à 22h48 UTC `pdf_export`, `docx_export`, `zip_export` et `logline`. Ses
  journaux portent un SIGTERM à la bascule du conteneur ; l'instance qui a suivi a servi les
  deux tâches, sans autre alerte.
- Premier dossier, à 22h51 UTC : sections « Synthèse » et « Fiche du projet », documents
  « Traitement » et « Scénario ». Tâche `zip_export` réclamée par le worker Railway, réussie
  au premier essai en 202 ms : 45 931 octets, sans nombre de pages.
- Second dossier, à 22h58 UTC : les cinq sections — synthèse, fiche du projet, budget, plan de
  financement et planning — et trois documents. Réussie au premier essai en 286 ms : 68 061
  octets, expirant le 2 novembre 2026.
- Une unité d'export réservée puis consommée pour chaque dossier, rien de rendu, sur la même
  unité et la même période mensuelle que les exports PDF et Word du même studio : le quota
  commun aux trois formats est vérifié en conditions réelles.
- Téléchargements servis par la route du dossier ; aucune erreur d'exécution chez Vercel
  depuis le déploiement. Les deux archives ont été ouvertes par l'utilisateur : fichiers Word
  et classeurs Excel jugés corrects, nombres et dates exploitables.

Non couvert par cette recette : un éditeur et un lecteur réels, faute de second compte tant
que le mode privé est actif (vérifiés localement et par les tests) ; la purge d'une archive
arrivée à expiration ; un dossier dépassant la taille maximale d'un export.

## Recette du lot J1

Le 4 octobre 2026, un traitement et une bible de série ont été produits en production par un
administrateur, de l'écran au document écrit (mode privé actif), sur le projet « mami wata ».

- Fusion à 03h45 UTC, migration poussée aussitôt ; le worker, reconstruit par la fusion — le
  lot touche `worker/` —, annonce ses **dix** actions à 03h46 : trois exports, la logline, les
  quatre rédactions de WEAVER, le traitement et la bible.
- Les quatre encarts de l'onglet Documents ont été relus à l'écran, chacun nommant sa cible :
  « remplacerait le document « … », qui en garderait une version » pour les trois types déjà
  présents, « aucun document de type « Bible de série » : la proposition en créerait un, en
  brouillon » pour le quatrième.

| Livrable    | Durée  | Caractères | Coût confirmé | Unités | Atterrissage                     |
| ----------- | ------ | ---------- | ------------- | ------ | -------------------------------- |
| `treatment` | 24,4 s | 2 437      | 0,039588 $    | 8/8    | document existant mis à jour, v1 |
| `bible`     | 45,3 s | 5 263      | 0,080604 $    | 10/10  | document créé en brouillon, v1   |

- Les deux réussies au premier essai, sur `claude-opus-5-5`, sans repli, avec leurs profils
  `script.traitement@1` et `script.bible@1`.
- **Les deux branches de l'atterrissage sont exercées** : le document « Traitement » existait,
  vide — sa mise à jour a inscrit un `replaced_content` de zéro caractère, non nul, et créé sa
  première version ; la bible n'existait pas — elle a été créée, en brouillon, avec sa
  première version.
- Dépense du mois après ces deux demandes : 0,544616 $ sur un plafond de 5 $. Quinze tâches
  d'IA réussies depuis le début, zéro repli, zéro à rapprocher.

### Longueurs réellement produites — à garder pour la décision 8

Les textes produits sont très en deçà de ce que les profils visent, et plus encore du plafond
de 20 000 caractères d'une proposition :

| Livrable            | Visé par le profil | Produit | Plafond |
| ------------------- | ------------------ | ------- | ------- |
| `synopsis_detailed` | 12 000             | 1 804   | 20 000  |
| `intention_note`    | 6 000              | 4 916   | 20 000  |
| `treatment`         | 9 000              | 2 437   | 20 000  |
| `bible`             | 9 000              | 5 263   | 20 000  |

Sur un projet à la fiche maigre, ce n'est pas la colonne qui limite, c'est la matière
disponible. Le plafond ne mordra que sur des projets bien renseignés — et il reste
rédhibitoire pour un scénario, qui demande un ordre de grandeur de plus. La décision 8 garde
donc tout son sens pour le lot J2, mais elle ne bloque que le scénario et les dialogues.

Non couvert par cette recette : un éditeur et un lecteur réels, faute de second compte tant
que le mode privé est actif (vérifiés localement et par les tests) ; une proposition de
traitement ou de bible écartée plutôt qu'appliquée ; un document finalisé réécrit par une
proposition, les deux documents touchés étant en brouillon.

## Décisions attendues

Voir `docs/implementation-audit.md`, section 11. Décisions 1, 3 et 4 prises le 30 septembre
2026 ; décision 2 non tranchée ; valeurs de la décision 5 à préciser.

Modèle studio, précisé le 1er octobre 2026 : studio personnel créé automatiquement pour
chaque compte ; le propriétaire d'un studio ne voit rien d'un projet dont il n'est pas
l'équipe ; tout membre d'un studio peut y créer un projet ; socle seul, sans invitation
ni écran de gestion des membres du studio.

Plans, décidés le 1er octobre 2026 : Gratuit, Pro (20 000 XAF par mois), Studio (100 000 XAF
par mois) ; quotas mensuels à date anniversaire ; unités texte comptées par livrable pondéré
(logline 1, synopsis court / standard / détaillé 1 / 2 / 3, note d'intention 3, traitement 8,
bible 10, scénario 2 par séquence, dialogues 1 par scène) ; valeurs modifiables par
l'administration, une modification publiant une nouvelle version appliquée à chaque studio à
partir de sa prochaine période.

Devis, décidés le 1er octobre 2026 : un devis reste valable 15 minutes ; le barème des unités
texte est versionné en base et publié depuis « Plans et quotas », chaque version s'appliquant
à un studio à partir de sa prochaine période ; seuls le porteur et les éditeurs d'un projet
— et les administrateurs — demandent un devis et réservent des unités.

Tâches, décidées le 1er octobre 2026 : lot H découpé en H1 (base de données) et H2 (worker et
déploiement) ; le worker se connecte sous un rôle PostgreSQL dédié, sans aucun droit sur les
tables, dont le mot de passe reste hors de Git ; son code vit dans `worker/`, dans ce dépôt.
Bail de 5 minutes, deux essais au plus. Au lot H2 : le service Railway « FilmFund » existant
est réutilisé (dossier `worker/`, région Europe) ; la connexion passe par le pooler Supabase
en mode session, vérifiée par le certificat racine de Supabase ; le worker ne réclame que les
actions qu'il sait exécuter — aucune avant le lot I. Exploitation : `docs/worker.md`.

Exports PDF, décidés le 2 octobre 2026 (décision 8) : un dossier se compose à la carte —
synthèse, types de documents, budget, plan de financement, planning ; seuls les documents
finalisés y entrent ; le PDF est fabriqué par le worker, jamais par le navigateur ; pas
d'image dans la première version. Le fichier est rangé en base (5 Mo au plus, 30 jours),
lisible du porteur, des éditeurs et des administrateurs. Lot M découpé en M1 (base et worker)
et M2 (écran). Exploitation : `docs/worker.md`.

Exports Word, décidés le 3 octobre 2026 (lot M3) : le même dossier, composé sur le même
écran, sort au choix en PDF ou en Word ; un export Word consomme la même unité d'export
qu'un PDF, sur le même quota (« exports par mois, PDF ou Word ») ; le fichier Word est
fabriqué par le worker avec le paquet `docx`. Le format est l'action de la tâche
(`pdf_export`, `docx_export`) ; un export identique ne se retrouve que dans son format.

Profil, décidé le 2 octobre 2026 : lot Q découpé en Q1 (champs professionnels et page) et Q2
(photo). Prénom, nom, pays, ville, profession et type ne sont lisibles que du titulaire et
des administrateurs ; les équipes ne reçoivent toujours que le nom affiché, qui reste
distinct du prénom et du nom. Le type (auteur, réalisateur, producteur) n'ouvre aucun droit.
Les noms de pays ne sont pas rédigés dans le dépôt : seuls les codes ISO y figurent.

Photo de profil, décidée le 3 octobre 2026 (lot Q2) : même visibilité que le reste du profil,
affichée sur la page de profil et dans le bloc de compte ; compartiment privé distinct des
images de projet, fondé sur le compte, hors quota de studio (2 Mo, JPEG, PNG ou WebP, une
photo par compte) ; octets réels contrôlés par le serveur avant tout rattachement ; ni
recadrage ni redimensionnement, faute de dépendance de traitement d'image.

Assistant de création, décidé le 3 octobre 2026 (lot R) : le projet naît à la première étape,
chaque étape suivante complète sa fiche, et l'assistant se rouvre pour la compléter ; les
personnages forment une vraie liste, protégée comme le storyboard ; un projet peut avoir
plusieurs pays de production, le premier étant le principal. Lot R découpé en R1 (base : champs
de la fiche, table des personnages) et R2 (écrans). La fiche suit les droits du projet : un
administrateur la lit mais ne la réécrit pas.

Écrans de l'assistant (lot R2) : « Nouveau projet » propose l'assistant ou la création rapide ;
sept étapes — informations, concept, personnages, enjeux, vision, objectifs, public — chacune
enregistrée, passable et reprise à volonté, ouvertes au porteur et aux éditeurs seuls (page
introuvable pour les autres) ; le récapitulatif est l'onglet « Fiche » du projet, lisible de
toute l'équipe.

Fiche dans les exports (lot M4), décidé le 3 octobre 2026 : une seule section « Fiche du
projet », cochée comme les autres sur l'écran du dossier, placée après la synthèse. Elle
reprend la fiche dans l'ordre de l'assistant, personnages compris ; ses champs vides sont omis.
Aucune table, politique ni dépendance nouvelle : deux fonctions de la base reprises, et la
composition du worker étendue. Exploitation : `docs/worker.md`.

Exports ZIP (lot M5), décidé le 3 octobre 2026 : un troisième format sur le même chemin,
l'action `zip_export`, comptée une unité sur le même quota. L'archive range un fichier Word
par texte — la présentation (synthèse et fiche du projet), puis un fichier par document
finalisé — et un classeur Excel par tableau : budget, plan de financement, planning, ce
dernier ajouté à ce que le cahier des charges citait. Les classeurs sont écrits par le worker,
sans bibliothèque Excel : `jszip`, déjà installé par le paquet `docx`, devient une dépendance
déclarée. Nombres et dates y restent des nombres et des dates ; un texte n'y devient jamais une
formule. Aucune table ni politique nouvelle : trois fonctions de la base reprises. Reste à
livrer : ouverture d'une archive d'essai dans Word et Excel par l'utilisateur, fusion,
migration poussée, redéploiement du worker, puis recette. Exploitation : `docs/worker.md`.

Synopsis et note d'intention, décidés le 4 octobre 2026 (lot I2, découpé en I2a — base,
profils et agent — et I2b — écrans) : quatre actions de plus sur le chemin du pitch, dont le
devis connaissait déjà les unités. Le contexte d'une rédaction est plus riche que celui de la
logline — fiche du projet, personnages, vision, documents finalisés — et il est lu par une
fonction distincte, `contexte_redaction` : le profil `weaver.logline@1` garde le contexte pour
lequel il a été écrit, puisque lui en donner davantage changerait sa version. Chaque texte
accepté atterrit à sa place : le synopsis court dans la fiche, le synopsis standard dans le
synopsis du projet, le synopsis détaillé et la note d'intention dans un document, versionné
par le lot B — rien n'est écrasé sans trace, et le document naît en brouillon, à l'équipe de
le finaliser. Un type de document `synopsis` est ajouté ; un enum ne se rétrécissant pas, ce
choix est irréversible. Les longueurs visées vivent dans les profils versionnés, les longueurs
admises dans la base, et un test d'architecture refuse qu'elles divergent. Aucune table ni
politique nouvelle. Reste à livrer : les écrans (I2b), et la recette, qui attend la recette de
I1 — donc une clé Anthropic en état de marche.

ARC, décidé le 4 octobre 2026 (lot J3, découpé en J3a — ARC —, J3b — FIELD — et J3c — FRAME
et GEAR) : l'analyse dramaturgique est le premier livrable d'un agent qui **lit** le projet
sans le réécrire. Elle suit le chemin de WEAVER et de SCRIPT et atterrit dans un document de
type `analyse`, versionné, créé en brouillon. Son profil lui interdit d'inventer ce qui
comblerait un manque : il nomme le manque. Prix : 4 unités texte, entre la note d'intention
(3) et le traitement (8).

C'est la première colonne ajoutée au barème depuis sa mise en place. Les versions déjà
publiées sont remplies à 4 — un studio resté sur l'une d'elles doit avoir un prix, sans quoi
son devis échouerait —, puis le défaut est retiré : une version publiée ensuite doit dire sa
valeur, et l'omettre échoue au lieu de valoir 4 en silence. L'écran d'administration suit
seul : il est piloté par `CHAMPS_BAREME` et insère les valeurs en bloc.

Les droits du barème étant accordés colonne par colonne, la migration ouvre la colonne
nouvelle à la publication (`insert`, comptes connectés) et à la vitrine (`select`, visiteurs) :
sans cela, l'administration ne publiait plus aucune version, et la vitrine perdait ses
chiffres. La vitrine cite désormais le prix d'une analyse avec les autres. Toute colonne
ajoutée au barème demandera ces deux mêmes droits.

Le découpage vient de ce que les trois agents restants ne produisent pas du texte. FIELD
voudrait poser des lignes dans `budget_lines` et `project_milestones`, ce qu'une proposition
— une colonne `text` — ne transporte pas : c'est la **décision 9**, qui commande aussi BOARD
et MATCH. FRAME et GEAR n'ont aucune table — ni découpage technique, ni matériel — et
demandent d'abord un cahier des charges produit.

SCRIPT, décidé le 4 octobre 2026 (lot J, découpé en J1 — traitement et bible —, J2 — scénario
et dialogues — et J3 — ARC, FRAME, GEAR, FIELD) : le traitement et la bible sont deux
livrables de plus sur le chemin de WEAVER, dont le barème connaissait déjà les unités —
8 et 10. Ils atterrissent chacun dans un document versionné, créé en brouillon, comme le
synopsis détaillé. L'agent n'a pas de mécanique propre : il reprend la fabrique d'exécuteurs
de WEAVER avec ses propres profils, `script.traitement@1` et `script.bible@1`.

Ce découpage vient d'une limite de la base : **une proposition plafonne à 20 000 caractères**,
soit une dizaine de pages. Un traitement de long métrage en fait davantage, et un scénario dix
fois plus. Le traitement que SCRIPT produit est donc condensé, et le scénario ne peut pas être
livré du tout en l'état. Trois issues restent ouvertes pour J2, et aucune n'est tranchée :
livrer par séquence — le devis chiffre déjà par séquence —, relever le plafond de
`ai_suggestions.content`, ou écrire directement dans le document sans proposition, ce que
« aucun écrasement silencieux » interdit. C'est la décision 8.

J3 est d'une autre nature : ARC, FRAME, GEAR et FIELD n'ont ni action ni unité au barème, et
FRAME comme GEAR produisent des données structurées — focales, calculs électriques — qui ne
sont pas des propositions de texte. Ce lot demandera une version du barème, l'écran
d'administration qui la publie, et sans doute des tables.

Écrans des propositions, décidés le 4 octobre 2026 (lot I2b) : l'encart de l'assistant se
tient près de ce qu'il écrit — pitch et synopsis sur la page du projet, synopsis court dans la
fiche, synopsis détaillé et note d'intention dans les documents. Un catalogue unique
(`LIVRABLES_IA`) porte libellés, longueurs et rubrique ; les actions serveur refusent toute
action qui n'y figure pas, et un test d'architecture refuse que ses bornes s'écartent de celles
de la base. Pour un livrable qui atterrit dans un document, l'écran montre celui que la base
réécrira — le plus récemment modifié de son type — et le dit ; s'il n'en existe pas, il annonce
qu'un document sera créé en brouillon. Une seule boucle de rafraîchissement par rubrique, même
avec deux encarts.

Score de maturité, décidé le 3 octobre 2026 (lot S) : sans IA, le score mesure ce qui est
renseigné dans le projet, critère par critère, et ne juge pas la qualité de l'écriture —
l'écran le dit. Il se montre au porteur, aux éditeurs et aux administrateurs : il tient compte
du budget et du financement, que les lecteurs de l'équipe ne lisent pas. Les neuf critères
gardent les pondérations du cahier des charges, versionnées en base
(`readiness_weight_versions`, total 100, en ajout seul, publication journalisée) ; la base
rend les faits d'un projet (`faits_maturite()`, des compteurs et des oui/non, sous la RLS de
l'appelant) et l'application calcule (`src/lib/maturite.ts`). Rien n'est stocké : le score est
recalculé à chaque affichage. Lot S découpé en S1 (base, calcul, encart sur la page du projet
et le tableau de bord, libellé de la publication au journal d'administration) et S2 (cartes de
la liste des projets, écran de publication des pondérations).

Lot S2 : les listes — « Mes projets » et les autres projets récents du tableau de bord —
affichent le score de chaque carte par une lecture groupée (`faits_maturite_projets()`), qui
ne rend que les projets dont l'appelant gère le budget et refuse plus de cent projets ; les
faits restent ceux de `faits_maturite()`. Au-delà de cent projets affichés, la page le dit et
le score se lit sur la page du projet. L'administration publie une version depuis « Score de
maturité » (`/administration/ponderations`) : neuf entiers dont le total fait 100, validés
par l'action puis par la base ; la version s'applique aussitôt à tous les projets, puisque
rien n'est stocké. Aucune version n'a encore été publiée en production depuis cet écran : la
première publication y sera un changement réel, à relire au journal.
