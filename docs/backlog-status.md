# Suivi du backlog — directives de fiabilité

Tiré de `docs/implementation-audit.md` (section 13). Aucun ticket n'est coché avant d'être
réellement validé. Deux statuts de fin sont distincts : **validé localement** (tests et
navigateur sur la pile locale) et **validé en recette** (conditions réelles, fournisseurs
réels).

| Lot | Ticket                                                                                                                         | Statut            | Bloqué par     |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------------- |
| A   | Journal des actions d'administration                                                                                           | validé en recette | —              |
| B   | Versions de documents                                                                                                          | validé en recette | —              |
| C   | Envois d'images orphelins                                                                                                      | validé en recette | —              |
| D   | Durcissements mineurs (`is_admin()` en `(select …)`, `touch_updated_at`, test du jeton expiré)                                 | validé en recette | —              |
| E   | Modèle studio (socle : studio personnel, projets rattachés, isolation)                                                         | validé en recette | —              |
| F   | Plans, profils, registres distincts — F1 : plans versionnés, abonnements, limites projets et membres ; F2 : limite de stockage | validé en recette | —              |
| F3  | Offre publique sur la vitrine (catalogue lisible par les visiteurs, section Tarifs)                                            | validé en recette | —              |
| G   | Devis, réservation atomique, idempotence                                                                                       | validé en recette | —              |
| H1  | Tâches persistantes, outbox, rapprochement — en base : tâches, essais, rôle dédié du worker                                    | validé en recette | —              |
| H2  | Worker Node (`worker/`) et son déploiement sur Railway                                                                         | validé en recette | —              |
| I1  | Passerelle IA et premier agent (WEAVER) : le pitch de bout en bout                                                             | validé localement | recette        |
| I1b | Intégrations IA : les clés des fournisseurs posées depuis l'administration, rangées au coffre                                  | validé localement | recette de I1  |
| I2  | WEAVER : synopsis court / standard / détaillé, note d'intention                                                                | à faire           | recette de I1  |
| J   | Autres agents                                                                                                                  | bloqué            | I1             |
| K   | BOARD (quota image, croquis noir et blanc)                                                                                     | bloqué            | I1, décision 7 |
| L   | SCOUT, GRIOT, MATCH (sources et provenance)                                                                                    | bloqué            | I1, décision 7 |
| M1  | Exports PDF : contenu du dossier, fabrication par le worker, dépôt et purge                                                    | validé en recette | —              |
| M2  | Exports PDF : écran de sélection des sections et téléchargement                                                                | validé en recette | —              |
| M3  | Exports DOCX : le même dossier en Word, même écran, même quota                                                                 | validé en recette | —              |
| M4  | Exports : la fiche du projet et ses personnages dans le dossier, en PDF comme en Word                                          | validé en recette | —              |
| N   | Paiements                                                                                                                      | bloqué            | Décision 6, F  |
| O   | Interface des quotas et incidents                                                                                              | bloqué            | F à N          |
| P   | Recette intégrée avant ouverture commerciale                                                                                   | bloqué            | Tous           |
| Q1  | Page de profil : prénom, nom, pays, ville, profession, type ; accueil du tableau de bord                                       | validé en recette | —              |
| Q2  | Photo de profil (stockage privé, politiques, contrôle des octets)                                                              | validé en recette | —              |
| R1  | Assistant de création, base : fiche du projet et personnages                                                                   | validé en recette | —              |
| R2  | Assistant de création, écrans : étapes, enregistrement étape par étape, récapitulatif                                          | validé en recette | —              |

## Recette de I1

Au 2 octobre 2026, la recette du pitch n'a pas abouti : chaque demande est refusée par
Anthropic, faute de crédit sur le compte (`400 invalid_request_error`). Aucune tâche n'a
encore réussi en production : la requête elle-même n'a donc jamais été validée par la vraie
API.

- Le motif d'un refus se lit désormais dans les journaux du worker, et un refus ne pèse plus
  sur le plafond mensuel (`docs/worker.md`, « Coûts et plafond »).
- Les provisions des essais refusés avant ce correctif ont été soldées à zéro.
- Reste à faire : créditer le compte de la clé enregistrée dans « Intégrations IA », relancer
  un pitch, puis vérifier une tâche réussie, une proposition affichée et un coût confirmé non
  nul. I1 et I1b passeront alors « validé en recette », ce qui ouvre I2.

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
