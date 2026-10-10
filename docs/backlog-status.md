# Suivi du backlog — directives de fiabilité

Tiré de `docs/implementation-audit.md` (section 13). Aucun ticket n'est coché avant d'être
réellement validé. Deux statuts de fin sont distincts : **validé localement** (tests et
navigateur sur la pile locale) et **validé en recette** (conditions réelles, fournisseurs
réels).

| Lot    | Ticket                                                                                                                         | Statut            | Bloqué par    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------- |
| A      | Journal des actions d'administration                                                                                           | validé en recette | —             |
| B      | Versions de documents                                                                                                          | validé en recette | —             |
| C      | Envois d'images orphelins                                                                                                      | validé en recette | —             |
| D      | Durcissements mineurs (`is_admin()` en `(select …)`, `touch_updated_at`, test du jeton expiré)                                 | validé en recette | —             |
| E      | Modèle studio (socle : studio personnel, projets rattachés, isolation)                                                         | validé en recette | —             |
| F      | Plans, profils, registres distincts — F1 : plans versionnés, abonnements, limites projets et membres ; F2 : limite de stockage | validé en recette | —             |
| F3     | Offre publique sur la vitrine (catalogue lisible par les visiteurs, section Tarifs)                                            | validé en recette | —             |
| G      | Devis, réservation atomique, idempotence                                                                                       | validé en recette | —             |
| H1     | Tâches persistantes, outbox, rapprochement — en base : tâches, essais, rôle dédié du worker                                    | validé en recette | —             |
| H2     | Worker Node (`worker/`) et son déploiement sur Railway                                                                         | validé en recette | —             |
| I1     | Passerelle IA et premier agent (WEAVER) : le pitch de bout en bout                                                             | validé en recette | —             |
| I1b    | Intégrations IA : les clés des fournisseurs posées depuis l'administration, rangées au coffre                                  | validé en recette | —             |
| I2a    | WEAVER : synopsis court / standard / détaillé et note d'intention — base, profils, agent                                       | validé en recette | —             |
| I2b    | WEAVER : écrans de génération, comparaison et application des propositions                                                     | validé en recette | —             |
| J1     | SCRIPT : traitement et bible                                                                                                   | validé en recette | —             |
| J2a    | SCRIPT : le scénario, une séquence par demande, ajoutée à la fin du document                                                   | validé en recette | —             |
| J2b-1  | VOICE : dialogues d'une scène — base, profil, agent                                                                            | validé en recette | —             |
| J2b-2  | VOICE : écran des dialogues, sous l'éditeur du scénario                                                                        | validé en recette | —             |
| J3a    | ARC : analyse dramaturgique                                                                                                    | validé en recette | —             |
| J3b-1  | FIELD : propositions de lignes de budget — base, profil, agent                                                                 | validé en recette | —             |
| J3b-2  | FIELD : écran des lignes proposées dans l'onglet Budget                                                                        | validé en recette | —             |
| J3b-3a | FIELD : propositions de jalons de planning — base, profil, agent                                                               | validé en recette | —             |
| J3b-3b | FIELD : écran des jalons proposés dans l'onglet Planning                                                                       | validé en recette | —             |
| J3c-1  | Découpage et matériel : tables, saisie manuelle, calcul électrique — sans IA                                                   | validé en recette | —             |
| J3c-2a | FRAME : propositions de plans pour une scène — base, profil, agent                                                             | validé en recette | —             |
| J3c-2b | FRAME : écran des plans proposés, dans le volet « Découpage »                                                                  | validé en recette | —             |
| J3c-3  | GEAR : propositions de matériel — base, profil, agent et écran                                                                 | validé en recette | —             |
| J3c-4  | Exports : sections « Découpage technique » et « Matériel »                                                                     | validé en recette | —             |
| K1     | BOARD : vignette d'une scène — base, passerelle d'images, profil, agent                                                        | en production     | —             |
| K2     | BOARD : écran de la vignette proposée, dans le storyboard                                                                      | en production     | —             |
| L1     | SCOUT : recherche sourcée — base, moteur de recherche, profil, agent                                                           | validé en recette | —             |
| L2     | SCOUT : écran de la recherche, onglet « Recherche »                                                                            | validé en recette | —             |
| L3     | GRIOT : contexte historique et culturel — base, profil, écran                                                                  | validé en recette | —             |
| L4     | MATCH : catalogue des opportunités, tenu par l'administration (sans IA)                                                        | validé en recette | —             |
| L5a    | MATCH : consultation du catalogue par les équipes, filtres et recherche (sans IA)                                              | validé en recette | —             |
| L5b    | MATCH : compatibilité d'une opportunité avec un projet, par règles lisibles (sans IA)                                          | en production     | —             |
| L6a    | MATCH : agent de veille, base et worker (opportunités proposées, non vérifiées)                                                | validé en recette | —             |
| L6b    | MATCH : agent de veille, écran d'administration                                                                                | validé en recette | —             |
| M1     | Exports PDF : contenu du dossier, fabrication par le worker, dépôt et purge                                                    | validé en recette | —             |
| M2     | Exports PDF : écran de sélection des sections et téléchargement                                                                | validé en recette | —             |
| M3     | Exports DOCX : le même dossier en Word, même écran, même quota                                                                 | validé en recette | —             |
| M4     | Exports : la fiche du projet et ses personnages dans le dossier, en PDF comme en Word                                          | validé en recette | —             |
| M5     | Exports ZIP : un fichier Word par texte, un classeur Excel par tableau, même écran, même quota                                 | validé en recette | —             |
| N      | Paiements                                                                                                                      | bloqué            | Décision 6, F |
| O      | Interface des quotas et incidents                                                                                              | bloqué            | F à N         |
| P      | Recette intégrée avant ouverture commerciale                                                                                   | bloqué            | Tous          |
| Q1     | Page de profil : prénom, nom, pays, ville, profession, type ; accueil du tableau de bord                                       | validé en recette | —             |
| Q2     | Photo de profil (stockage privé, politiques, contrôle des octets)                                                              | validé en recette | —             |
| R1     | Assistant de création, base : fiche du projet et personnages                                                                   | validé en recette | —             |
| R2     | Assistant de création, écrans : étapes, enregistrement étape par étape, récapitulatif                                          | validé en recette | —             |
| S1     | Score de maturité : pondérations versionnées, faits du projet, calcul, encart (page du projet, tableau de bord)                | validé en recette | —             |
| S2     | Score de maturité : cartes de la liste des projets, écran de publication des pondérations                                      | validé en recette | —             |
| T1     | Tableau de bord : chiffres, opportunités à étudier, prochaines échéances (sans IA)                                             | en production     | —             |
| U1     | Candidature préparée depuis une opportunité du catalogue : formulaire prérempli (sans IA)                                      | validé en recette | —             |
| V1     | Administration des comptes : liste, recherche, fiche d'un compte, changement de rôle (sans IA)                                 | en production     | —             |
| V2a    | Suspension d'un compte : table, contrôle avant requête, stockage, worker, journal (sans IA)                                    | en production     | —             |
| V2b    | Suspension d'un compte : écran de l'administration, page « Compte suspendu »                                                   | en production     | —             |
| W1     | Alertes internes : étapes, candidatures, opportunités — calculées, rien n'est stocké (sans IA)                                 | en production     | —             |
| X1     | WEAVER : note de réalisation, pitch développé, pitch oral — base, profils, écran                                               | validé en recette | —             |
| X2a    | ARC : personnages proposés — base, profil, agent                                                                               | validé en recette | —             |
| X2b    | ARC : écran des personnages proposés, dans l'étape « Personnages » de l'assistant                                              | validé en recette | —             |
| Y1     | Plafond mensuel des dépenses d'IA : lecture et changement depuis Intégrations IA (sans IA)                                     | validé en recette | —             |
| Z1     | Coûts de l'IA : douze mois, par agent, par profil et par modèle (sans IA)                                                      | validé en recette | —             |
| Z3     | Statistiques d'usage : des comptages, sans nom, titre, contenu ni montant (sans IA)                                            | validé en recette | —             |
| W2     | Alerte « nouvelle opportunité » : date de vérification en base, sixième nature (sans IA)                                       | en production     | —             |
| AA1    | Rubrique « Ressources » : bibliothèque de guides et de checklists, contenus versionnés (sans IA)                               | en production     | —             |
| ED1    | Éditeur : comparaison de deux versions d'un document (sans IA)                                                                 | en production     | —             |
| ED2a   | Éditeur : mise en forme par marqueurs, barre d'outils, aperçu et rendu à la lecture (sans IA)                                  | en production     | —             |
| ED2b   | Exports : les marqueurs rendus en PDF, en Word et dans le ZIP (sans IA)                                                        | en production     | —             |
| ED3    | Éditeur : sauvegarde automatique en brouillon, sans créer de version (sans IA)                                                 | en production     | —             |
| RT1    | WEAVER : retouches d'un passage — améliorer, raccourcir, développer, corriger (base et worker)                                 | en production     | —             |
| RT2    | WEAVER : écran des retouches, sous l'éditeur de tout document                                                                  | en production     | —             |
| OP1    | Opportunités : filtre par montant, devise par devise (sans IA)                                                                 | en production     | —             |
| OP2    | Opportunités : langue, durée et stade au catalogue ; compatibilité sur cinq critères (sans IA)                                 | en production     | —             |
| SE1    | Séries : épisodes d'un projet de série, saisie manuelle, une saison (sans IA)                                                  | en production     | —             |
| SE2a   | SCRIPT : épisodes proposés pour une série — base, profil, agent                                                                | en production     | —             |
| SE2b   | SCRIPT : écran des épisodes proposés, sur la page des épisodes                                                                 | en production     | —             |
| SE3a   | Séries : le scénario d'un épisode, rattaché à la main (sans IA)                                                                | en production     | —             |
| SE3b   | SCRIPT : la séquence écrite dans le scénario de l'épisode désigné                                                              | en production     | —             |
| AS1    | Assistant IA : ce que l'assistant sait faire pour un projet, et où le lui demander (sans IA)                                   | en production     | —             |
| AS2    | Assistant IA : ce qui attend sur un projet — propositions à décider, demandes en cours (sans IA)                               | en production     | —             |
| SE4    | Séries : les épisodes dans le dossier exporté — la saison, et l'épisode de chaque scénario (sans IA)                           | en production     | —             |
| SE5    | FRAME : la scène d'un épisode — le découpage lit le scénario de cet épisode                                                    | en production     | —             |
| Z4     | Administration : les administrateurs lisent les équipes de projet ; le comptage « membres d'équipe » redevient juste           | validé localement | —             |

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

## Recette du lot J3a

Le 4 octobre 2026, une analyse dramaturgique a été produite en production par un
administrateur, de l'écran au document écrit (mode privé actif), sur le projet « mami wata ».

- Fusion de la PR 78 (`cb17436`) à 15h02 UTC ; le worker, reconstruit par la fusion — le lot
  touche `worker/` —, annonce ses **onze** actions à 15h03, dont `dramatic_analysis`.
- **La migration n'a été poussée qu'une vingtaine de minutes après la fusion**, constatée en
  base à 15h26 UTC : le dépôt d'où partait la poussée n'avait pas été mis à jour, puis l'essai
  à blanc a échoué deux fois sur « failed to initialise login role: TransportError ». Dans
  l'intervalle, le code d'ARC tournait sans sa colonne : aucune erreur d'exécution chez
  Vercel, aucune demande d'analyse tentée. La vitrine, mise en cache cinq minutes, a servi son
  barème sans chiffres jusqu'à sa relecture.
- En base, relu après la migration : 40 migrations sur 40 ; colonne `dramatic_analysis`
  obligatoire et sans défaut, à 4 sur la version 1 du barème ; ses droits de lecture
  (visiteurs) et d'insertion (comptes connectés) ; le type `analyse` ; les deux contraintes et
  les quatre fonctions reprises. Lue sous le rôle des visiteurs, la colonne rend 4.
- Vitrine relue dans un navigateur : « 4 pour une analyse dramaturgique », entre la note
  d'intention et le traitement.

| Livrable            | Durée  | Caractères | Coût confirmé | Unités | Atterrissage                   |
| ------------------- | ------ | ---------- | ------------- | ------ | ------------------------------ |
| `dramatic_analysis` | 42,7 s | 7 305      | 0,104196 $    | 4/4    | document créé en brouillon, v1 |

- Devis à 15h42 UTC, 4 unités texte ; tâche réclamée cinq secondes après sa création, réussie
  au premier essai sur `claude-opus-5-5`, sans repli, avec le profil `arc.analyse@1` ; 7 164
  jetons en entrée, 3 777 en sortie.
- Proposition appliquée telle quelle 24 secondes plus tard : document « Analyse
  dramaturgique » créé en brouillon, avec sa première version, aux 7 305 caractères de la
  proposition — pour 7 000 visés par le profil.
- **ARC n'a rien réécrit** : le projet porte encore sa date de modification du 4 octobre à
  02h32 UTC, antérieure à la demande.
- Dépense du mois après cette demande : 0,762204 $ sur un plafond de 5 $ ; aucune tâche à
  rapprocher.

Non couvert par cette recette : l'encart de l'onglet Documents et le champ « Analyse
dramaturgique » de « Plans et quotas », que l'utilisateur a employés mais qui n'ont été relus
par aucune capture ; la publication d'une version du barème portant le nouveau prix (vérifiée
par les tests) ; une seconde analyse sur le même projet, qui réécrirait le document en lui
gardant une version ; une proposition écartée ; un éditeur et un lecteur réels, faute de
second compte tant que le mode privé est actif (vérifiés localement et par les tests).

## Recette du lot J3b : J3b-1 et J3b-2

Le 5 octobre 2026, des lignes de budget ont été proposées en production par un
administrateur, de l'écran aux lignes entrées au budget (mode privé actif), sur le projet
« une maison hantée », dont le budget portait déjà une ligne.

| Livrable      | Durée  | Lignes | Coût confirmé | Unités | Atterrissage                      |
| ------------- | ------ | ------ | ------------- | ------ | --------------------------------- |
| `budget_plan` | 34,8 s | 38     | 0,092968 $    | 6/6    | trois lignes acceptées, au budget |

- Devis à 12h49 UTC, 6 unités texte ; tâche réclamée trois secondes après sa création,
  réussie au premier essai sur `claude-opus-5-5`, sans repli, avec le profil
  `field.budget@1` ; 4 952 jetons en entrée, 3 658 en sortie, pour 0,342656 $ provisionnés.
- **Le schéma de sortie est accepté par le vrai fournisseur**, aux côtés du repli côté
  serveur : c'est ce que seule la recette pouvait établir. Les 38 lignes — pour 40 au plus —
  ont passé les contrôles du worker, puis ceux de la base au dépôt.
- **Le cloisonnement tient** : le texte de la proposition parente est « 38 lignes de budget
  proposées par l'assistant. », sans aucun montant.
- Trois lignes acceptées une à une, entrées au budget à la quantité et au coût proposés ;
  onze écartées une à une ; les vingt-quatre restantes écartées d'un bloc par « Écarter le
  reste ». Le budget du projet compte quatre lignes, celle d'origine intacte.
- Dépense du mois après cette demande : 0,855172 $ sur un plafond de 5 $ ; aucune tâche à
  rapprocher, aucune erreur d'exécution chez Vercel, rien d'autre aux journaux du worker que
  la réclamation et la réussite.
- L'écran a été déclaré conforme par l'utilisateur, sans capture.

Relevé lors de cette recette, laissé en l'état : écartée d'un bloc, la proposition finit à
l'état « écartée » alors que trois de ses lignes sont au budget, là où la décision 9 la dit
« appliquée dès qu'une ligne a été acceptée ». Les données sont justes ; seule l'étiquette de
la proposition parente est discutable, et la changer demanderait une migration.

Non couvert par cette recette : une ligne corrigée avant d'être acceptée, et « Tout
accepter » (vérifiés localement et par les tests) ; la liste des lignes en largeur mobile ;
une réponse du fournisseur hors bornes, qui ferait échouer la tâche et rendrait les unités
(vérifiée par les tests) ; un éditeur et un lecteur réels, faute de second compte tant que le
mode privé est actif (vérifiés localement et par les tests).

## Recette du lot J2a

Le 5 octobre 2026, deux séquences de scénario ont été écrites en production par un
administrateur, de l'écran au document (mode privé actif), sur le projet « une maison
hantée ».

Livraison dans l'ordre retenu : migration poussée par l'utilisateur et constatée en base
avant la fusion — 42 migrations —, puis PR 95 (`0b02896`) à 14h18 UTC. Le worker, redéployé
après la CI de `main`, annonce ses **treize** actions à 14h24, dont `screenplay`.

| Séquence            | Durée  | Caractères | Coût confirmé | Unités | Atterrissage                        |
| ------------------- | ------ | ---------- | ------------- | ------ | ----------------------------------- |
| première, 14h41 UTC | 52,1 s | 6 094      | 0,127876 $    | 2/2    | ouvre un document « Scénario » vide |
| seconde, 15h25 UTC  | 46,9 s | 3 690      | 0,126396 $    | 2/2    | ajoutée à la suite, version 6       |

- Les deux réussies au premier essai, sur `claude-opus-5-5`, sans repli, avec le profil
  `script.scenario@1` ; 9 794 puis 12 289 jetons en entrée, 4 435 puis 3 862 en sortie.
- **L'ajout à la fin est exact** : à la seconde séquence, le document est passé de 6 196 à
  9 888 caractères — le texte d'avant, une ligne vide, puis la séquence. Sa version 6 est, au
  caractère près, la version 5 suivie de la séquence ; rien de ce qui précédait n'a bougé.
- Une description mince donne une séquence courte : seize caractères de description pour la
  seconde, 3 690 caractères produits, là où la première, décrite en 800 caractères, en
  faisait 6 094 — pour 8 000 visés par le profil.
- Dépense du mois après ces deux demandes : 1,109444 $ sur un plafond de 5 $ ; aucune tâche à
  rapprocher, aucune erreur d'exécution chez Vercel.

**Défaut relevé à la première séquence, corrigé le jour même.** Le projet portait alors deux
scénarios : un finalisé de 6 244 caractères, et un brouillon plus récent, vide. Le contexte
retirait des documents finalisés tous ceux de type scénario et ne donnait que la fin du
document cible : SCRIPT a écrit sans voir le premier. Seul le document cible est désormais
écarté, et la description passe de 800 à 1 200 caractères — celle de la recette touchait la
borne (PR 96, `00debbe`, migration poussée avant la fusion, 43 migrations).

Non couvert par cette recette : le projet à deux scénarios, l'utilisateur ayant supprimé le
premier avant la seconde séquence (vérifié par le test ajouté avec le correctif) ; un scénario
arrivé à sa longueur maximale, une proposition modifiée avant d'être appliquée, une
proposition écartée (vérifiés par les tests) ; un éditeur et un lecteur réels, faute de second
compte tant que le mode privé est actif. L'écran a servi aux deux demandes, mais n'a été relu
par aucune capture. Une séquence s'ajoute aussi à un scénario finalisé, qui le reste : c'est
le comportement des autres livrables, laissé tel quel.

## Recette du lot J3b-3 : J3b-3a et J3b-3b

Le 5 octobre 2026, des jalons de planning ont été proposés en production par un
administrateur, de l'écran aux jalons entrés au planning (mode privé actif), sur le projet
« une maison hantée », dont le planning portait déjà un jalon.

| Livrable        | Durée  | Jalons | Coût confirmé | Unités | Atterrissage                      |
| --------------- | ------ | ------ | ------------- | ------ | --------------------------------- |
| `schedule_plan` | 17,8 s | 19     | 0,051948 $    | 3/3    | treize jalons acceptés, non datés |

- Devis à 17h27 UTC, 3 unités texte ; tâche envoyée au fournisseur cinq secondes après sa
  création, réussie au premier essai sur `claude-opus-5-5`, sans repli, avec le profil
  `field.planning@1` ; 4 697 jetons en entrée, 1 658 en sortie, pour 0,261756 $ provisionnés.
- **Le schéma de sortie est accepté par le vrai fournisseur**, et les 19 jalons — pour 30 au
  plus — ont passé les contrôles du worker puis ceux de la base. Le texte de la proposition
  parente est « 19 jalons de planning proposés par l'assistant. », écrit par la base.
- **Aucune date proposée** : ni dans les jalons, ni dans leurs intitulés. Les durées vont de
  10 à 90 jours ; aucun fonds ni festival nommé ; le jalon déjà au planning n'est pas redit.
- Six jalons écartés un à un, puis les treize restants acceptés par « Tout accepter », en
  moins de deux secondes. Ils sont entrés au planning non datés, chacun avec sa durée dans ses
  notes — « Durée estimée par l'assistant : 30 jours. ». Le planning du projet compte quatorze
  jalons, celui d'origine intact.
- Plus aucun jalon n'attendant, **la proposition s'est close d'elle-même, appliquée**.
- Dépense du mois après cette demande : 1,161392 $ sur un plafond de 5 $ ; aucune tâche à
  rapprocher, aucune erreur d'exécution chez Vercel.
- L'écran, que rien n'avait montré dans un navigateur avant la recette, a servi à toute la
  demande ; il a été déclaré conforme par l'utilisateur, sans capture.

Non couvert par cette recette : « Dater et accepter » — donc l'échéance proposée d'après la
durée et la correction d'un intitulé —, et « Écarter le reste » (vérifiés localement et par les
tests) ; la largeur mobile ; un lecteur de l'équipe, qui lit les jalons proposés sans en
décider, et un éditeur réel, faute de second compte tant que le mode privé est actif (vérifiés
par les tests) ; une réponse du fournisseur hors bornes (vérifiée par les tests).

## Recette du lot J2b : J2b-1 et J2b-2

Le 5 octobre 2026, les répliques d'une scène ont été réécrites en production par un
administrateur, de la sélection dans le scénario à la scène remplacée (mode privé actif), sur
le projet « une maison hantée ».

Livraison dans l'ordre retenu : migration poussée par l'utilisateur et constatée en base
avant la fusion — 45 migrations —, PR 102 (`542e477`) à 18h43 UTC, le worker annonçant ses
**quinze** actions à 18h50, dont `dialogue` ; puis l'écran, PR 103 (`e247847`) à 19h05 UTC,
sans migration.

| Livrable   | Durée | Passage | Scène réécrite | Coût confirmé | Unités | Atterrissage                |
| ---------- | ----- | ------- | -------------- | ------------- | ------ | --------------------------- |
| `dialogue` | 8,6 s | 821     | 800            | 0,021440 $    | 1/1    | passage remplacé, version 9 |

- Devis à 19h17 UTC, 1 unité texte ; tâche envoyée au fournisseur un dixième de seconde
  après sa création, réussie au premier essai sur `claude-opus-5-5`, sans repli, avec le
  profil `voice.dialogues@1` ; 1 360 jetons en entrée, 800 en sortie.
- **La chaîne du passage tient en conditions réelles** : la sélection faite dans le
  navigateur a été retrouvée par le serveur dans le document enregistré, désignée à la base
  par sa position, sa longueur et son empreinte, puis relue au devis, avant l'appel et à
  l'acceptation.
- **Seul le passage a été remplacé** : la version 9 du document est, au caractère près, la
  version 8 dont les 821 premiers caractères ont laissé place aux 800 de la scène réécrite —
  5 747 puis 5 726 caractères. La scène remplacée est conservée dans la proposition.
- **VOICE s'en est tenu aux répliques** : quatorze lignes avant, quatorze après ; treize sont
  identiques au même rang, une seule a changé, et les deux lignes en capitales — intitulé de
  scène et nom de personnage — sont intactes.
- Proposition appliquée telle quelle huit secondes après son arrivée. Dépense du mois :
  1,182832 $ sur un plafond de 5 $ ; aucune tâche à rapprocher, aucune erreur chez Vercel.
- L'écran, que rien n'avait montré dans un navigateur avant la recette, a servi à toute la
  demande : sélection, devis, comparaison, remplacement.

Relevé en préparant la recette, corrigé depuis : un scénario peut porter deux sortes de fins
de ligne — celles de l'éditeur, et celles d'un texte ajouté par l'assistant. La localisation
du passage retrouvait une scène dans l'une ou l'autre partie, mais refusait une sélection à
cheval sur leur jonction. Elle cherche désormais dans le contenu ramené à une seule sorte de
fin de ligne, et rend le passage tel que le document l'écrit ; deux passages qui ne diffèrent
que par leurs fins de ligne sont tenus pour ambigus, ce que l'ancienne recherche ne voyait
pas.

Non couvert par cette recette : un scénario modifié à cet endroit entre la demande et
l'acceptation, et un document non enregistré, que l'encart doit refuser (vérifiés par les
tests) ; une scène réécrite retouchée avant d'être appliquée, une proposition écartée ; la
largeur mobile ; un éditeur réel, faute de second compte tant que le mode privé est actif.

## Recette du lot J3c : J3c-1, J3c-2a et J3c-2b

Les 5 et 6 octobre 2026, la saisie du découpage et du matériel, puis le découpage proposé
par FRAME, ont été exercés en production par un administrateur (mode privé actif), sur le
projet « une maison hantée ».

Livraison dans l'ordre retenu, la migration avant le code à chaque fois : J3c-1, migration
constatée en base puis PR 107 (`84254a7`) le 5 octobre ; J3c-2a, migration constatée — 47
migrations — puis PR 109 (`c1456e4`) le 6 octobre, le worker annonçant ses **seize** actions
à 02h13 UTC, dont `shot_list`, après un arrêt propre du précédent ; J3c-2b, PR 110
(`cd65386`), sans migration.

### J3c-1 : saisie manuelle et besoin électrique

- Matériel : deux équipements ajoutés, l'un modifié ensuite ; réglages enregistrés. Les
  lignes lues en base sont celles saisies à l'écran.
- Découpage : deux plans ajoutés à la main dans une scène.
- **Défaut trouvé à la recette, corrigé depuis** (PR 108, `1a7b9aa`) : un groupe électrogène
  saisi dans la catégorie « Énergie » avec la puissance qu'il fournit était additionné à ce
  que le tournage consomme — 1 002 W de charge au lieu de 2 W. L'écran le signale désormais
  sous la ligne et dans l'encart ; le calcul ne change pas, un chargeur de batteries rangé
  au même endroit consommant bien du courant. La ligne de la recette n'a pas été corrigée
  par l'équipe : elle porte toujours ses 1 000 W.

Non exercés : déplacer, modifier et supprimer un plan ; supprimer un équipement ; une
tension ou une marge autre que celles par défaut.

### J3c-2 : le découpage proposé par FRAME

| Demande | Scène                        | Durée  | Entrée / sortie | Plans | Coût confirmé | Unités | Décision de l'équipe  |
| ------- | ---------------------------- | ------ | --------------- | ----- | ------------- | ------ | --------------------- |
| 1       | les pecheurs                 | 12,3 s | 6 714 / 865     | 5     | 0,044156 $    | 4/4    | 5 acceptés d'un bloc  |
| 2       | les pecheurs                 | 14,0 s | 7 074 / 837     | 4     | 0,045036 $    | 4/4    | 2 acceptés, 2 écartés |
| 3       | les pecheurs dans la pirogue | 10,9 s | 6 677 / 923     | 6     | 0,045168 $    | 4/4    | 3 acceptés, 3 écartés |

- Trois tâches réussies au premier essai sur `claude-opus-5-5`, sans repli, avec le profil
  `frame.decoupage@1`. Dépense du mois après la recette : 1,317192 $ sur un plafond de 5 $ ;
  aucune tâche à rapprocher, aucune erreur chez Vercel.
- **L'écran sert toute la demande** : devis, confirmation, suivi, « Tout accepter »,
  acceptation plan par plan, « Écarter le reste ».
- **Les plans atterrissent à leur place** : dans la première scène, les deux plans saisis à
  la main, puis les sept acceptés, à la suite et dans l'ordre.
- **FRAME complète sans redire** : la seconde demande sur la même scène propose quatre plans
  nouveaux, dont aucun ne répète ceux de la première.
- **Il s'en tient au dossier** : aucun personnage, aucune action ni aucun matériel de marque
  n'est inventé, y compris pour une scène qui n'a qu'un intitulé. Il ne plaque pas non plus
  le scénario — une maison hantée — sur une scène qui lui est étrangère.
- **Le schéma passe chez le fournisseur** : une réponse qui omet toutes les focales a été
  acceptée et déposée.

**Ce que la recette ne prouve pas** : que FRAME retrouve une scène dans le scénario et la
découpe d'après lui — c'est pourtant ce pour quoi il lit le scénario en entier. Les deux
scènes du storyboard parlent de pêcheurs, le scénario d'une maison ; elles ne se recoupent
pas, et FRAME a découpé d'après la seule scène, comme sa consigne le prévoit dans ce cas.
À éprouver sur une scène qui figure au scénario.

Non couverts non plus : un plan corrigé avant d'être accepté ; le coût d'un scénario long —
celui-ci fait 5 726 caractères — ; un lecteur réel, faute de second compte tant que le mode
privé est actif ; la largeur mobile.

Relevé, laissé en l'état : deux plans décrivent du son et un autre redit l'en-tête de la
scène, quand la consigne demande ce que montre le plan ; la resserrer serait publier une
nouvelle version du profil. Et une proposition dont des plans ont été acceptés est notée
« écartée » après « Écarter le reste », comme pour le budget et le planning : les plans
acceptés ne sont pas touchés.

## Recette du lot J3c-3 : GEAR

Le 6 octobre 2026, une liste de matériel a été demandée à GEAR en production par un
administrateur, de la demande aux équipements entrés au matériel (mode privé actif), sur le
projet « une maison hantée ».

Livraison dans l'ordre retenu : migration poussée par l'utilisateur et constatée en base
avant la fusion — 48 migrations —, puis PR 112 (`8e9ec01`) à 12h25 UTC, le worker annonçant
ses **dix-sept** actions à 12h29, dont `gear_list`, après un arrêt propre du précédent.

| Livrable    | Durée  | Entrée / sortie | Lignes | Coût confirmé | Unités | Décision de l'équipe             |
| ----------- | ------ | --------------- | ------ | ------------- | ------ | -------------------------------- |
| `gear_list` | 21,6 s | 2 964 / 2 085   | 20     | 0,053556 $    | 5/5    | 1 corrigée, 19 acceptées en bloc |

- Tâche réussie au premier essai sur `claude-opus-5-5`, sans repli, avec le profil
  `gear.materiel@1`. Dépense du mois : 1,370748 $ sur un plafond de 5 $ ; aucune tâche à
  rapprocher, aucune erreur chez Vercel.
- **Ni marque, ni modèle commercial, ni prix, ni groupe électrogène, ni calcul** dans les
  vingt désignations : la consigne tient en conditions réelles.
- **GEAR a lu le découpage** : la série d'objectifs proposée couvre 28, 35, 40, 50 et 85 mm,
  les focales des plans du projet ; rails de travelling et support d'épaule répondent à ses
  mouvements. Il n'a pas redit la caméra déjà saisie.
- **Il n'a rien inventé** : persiennes, orage, couloirs étroits et ampoules fatiguées, qui
  motivent plusieurs lignes, figurent dans la vision artistique du projet.
- **Une ligne corrigée avant d'être acceptée** — geste qu'aucune recette n'avait encore
  exercé, tous agents confondus : la désignation retenue au matériel est celle de l'équipe,
  et ce que l'agent avait proposé n'a pas changé.
- « Tout accepter » a fait entrer les dix-neuf autres lignes en cinq secondes, chacune à
  l'identique ; la proposition s'est close « appliquée » à l'instant de la dernière.
- Puissances prudentes — 200 W pour un projecteur LED, 20 W pour un moniteur — et laissées
  vides là où l'agent ne savait pas. Le besoin électrique recalculé à part sur les 22
  équipements du projet : 1 982 W de charge simultanée, 8,6 A sous 230 V, 2,6 kW de groupe
  conseillé, deux lignes sans puissance.

Relevé, laissé en l'état : un chargeur de batteries proposé à 0 W, alors qu'il se branche ;
une série d'objectifs portée en quantité 5 quand sa désignation décrit déjà la série ; et une
liste qui suit la vision artistique — une maison — sans rien tirer des deux scènes du
storyboard, qui parlent de pêcheurs. L'écran avertit que les puissances sont estimées.

Avant la demande, l'utilisateur a annoncé la recette faite à cinq reprises sans qu'aucune
requête n'arrive : les journaux de la passerelle Supabase l'ont montré, là où la base ne
disait que « rien ». À consulter en premier quand un écran semble muet.

Non couvert par cette recette : écarter une ligne, « Écarter le reste » ; un lecteur réel,
faute de second compte tant que le mode privé est actif ; la largeur mobile ; une liste
proche de sa borne de trois cents lignes.

## Recette du lot J3c-4 : découpage et matériel dans les exports

Le 6 octobre 2026, un dossier portant les deux nouvelles sections a été fabriqué en
production par un administrateur (mode privé actif), sur le projet « une maison hantée ».

Livraison dans l'ordre retenu : migration poussée par l'utilisateur et constatée en base
avant la fusion — 49 migrations —, puis PR 114 (`1faf059`) à 13h37 UTC, le worker redémarrant
à 13h42 après un arrêt propre du précédent. Avant la fusion, la base rendait déjà pour ce
projet deux scènes — neuf et trois plans — et vingt-deux équipements, chacun avec sa
catégorie, sa désignation, sa quantité et sa puissance, et rien d'autre.

| Format | Sections                | Durée | Pages | Taille        | Unités |
| ------ | ----------------------- | ----- | ----- | ------------- | ------ |
| PDF    | `decoupage`, `materiel` | 1,5 s | 5     | 21 377 octets | 1/1    |

- Tâche réussie au premier essai ; le fichier porte la signature d'un PDF et reste
  disponible trente jours. Aucune tâche à rapprocher.
- La chaîne tient en conditions réelles : les deux cases cochées à l'écran, le devis, la
  tâche, le worker redéployé, le fichier déposé — très loin du plafond de 5 Mo.

Non couvert par cette recette : l'intérieur du fichier, que la base ne permet pas de relire
— la lisibilité du tableau des plans, à six colonnes, reste à juger à l'œil — ; le Word et
l'archive ZIP avec ses deux classeurs, couverts par les tests seulement ; un long découpage.

Le lot J3c est livré en entier. Reste ouverte la réserve de J3c-2 : FRAME n'a pas encore
découpé une scène qui figure au scénario.

## Recette du lot X : X1, X2a et X2b

Le 7 octobre 2026, entre 23h01 et 23h11 UTC, les quatre livrables du lot X ont été demandés en
production par un administrateur (mode privé actif), porteur du projet « une maison hantée »,
sur accord et dans un plafond de 0,50 $. Quatre appels réels à Anthropic, un par livrable.

| Livrable            | Profil                      | Durée | Longueur         | Jetons (entrée / sortie) | Coût       | Unités |
| ------------------- | --------------------------- | ----- | ---------------- | ------------------------ | ---------- | ------ |
| Note de réalisation | `weaver.note_realisation@1` | 82 s  | 6 974 caractères | 11 981 / 7 530           | 0,198524 $ | 3/3    |
| Pitch oral          | `weaver.pitch_oral@1`       | 28 s  | 2 816 caractères | 11 967 / 3 274           | 0,113348 $ | 2/2    |
| Pitch développé     | `weaver.pitch_developpe@1`  | 24 s  | 3 139 caractères | 11 929 / 2 484           | 0,097396 $ | 2/2    |
| Personnages         | `arc.personnages@1`         | 28 s  | 7 personnages    | 4 784 / 2 098            | 0,061096 $ | 3/3    |

- Quatre tâches réussies au premier essai, sans repli de modèle ; aucune à rapprocher. Coût
  total : 0,470364 $.
- Les trois textes ont été acceptés. **Chacun a son document**, créé en brouillon, de la
  longueur exacte de sa proposition : aucun n'en a écrasé un autre.
- Longueurs : le pitch oral visait 2 700 caractères, la note 6 000, le pitch développé 2 500.
  Tous restent sous leur borne ; le pitch développé dépasse sa cible d'un quart.
- Trois faits contrôlés dans les textes viennent du dossier : le titre « La Maison du Seuil »
  de la fiche, « trente-deux ans » et « quinze ans » du traitement finalisé. C'est un sondage,
  pas une relecture.
- Personnages : un accepté seul, puis les six autres par « Tout accepter », quatre secondes
  après. Chacun est entré à la fin de la liste, dans l'ordre de la proposition.
- ARC désigne par la fonction ce que le dossier ne nomme pas — « La mère », « Le père », « La
  présence » —, et écrit du père que son rôle exact « reste à préciser par l'auteur » plutôt
  que de l'inventer.
- À l'écran, d'après l'utilisateur, sans capture : le devis avant chaque confirmation,
  l'avertissement au-dessus des personnages proposés, et la mention que la durée du pitch oral
  est une estimation.

Non couvert par cette recette :

- corriger un personnage avant de l'accepter, en écarter un, « Écarter le reste » ;
- **« ne pas redire un personnage déjà saisi »** : le porteur avait retiré les trois
  personnages du projet avant la demande, la liste transmise à ARC était vide ;
- la consigne sur les personnes réelles : le projet est une fiction ;
- la durée réelle du pitch oral, à voix haute ; la qualité des textes, qui se juge à la lecture ;
- un éditeur, un lecteur, l'affichage à 375 px.

Deux constats à garder :

- **le coût d'une rédaction suit les documents finalisés du projet.** Celui-ci en porte trois,
  18 000 caractères, qui partent avec chaque demande de WEAVER : près de 12 000 jetons d'entrée,
  et une note de réalisation à 0,20 $ là où 0,05 à 0,10 $ avaient été annoncés ;
- **le plafond mensuel est presque atteint** : 4,70 $ dépensés en octobre sur 5 $. La réserve
  au pire d'une note (0,46 $) ou d'un pitch (0,30 $) dépasse ce qui reste : la prochaine demande
  sera refusée pour plafond atteint, sans coût, tant que l'administration ne l'a pas relevé.

Le lot X est livré en entier.

## Recette du lot Y1 : le plafond mensuel d'IA depuis l'écran

Livraison le 8 octobre 2026 : PR 146 fusionnée à 00h22 UTC (`40ca8de`), migration poussée par
l'utilisateur aussitôt après (60 migrations). Relu en base après la poussée : la fonction de
lecture — réservée aux administrateurs, fermée aux visiteurs et au worker, rendant le calcul du
worker —, `depense_ia_du_mois()` toujours fermée aux comptes, les politiques du plafond et son
déclencheur de journal. Le worker n'a pas été redéployé : le lot ne le touche pas.

Le même jour, entre 00h30 et 00h34 UTC, un administrateur a changé le plafond depuis
**Administration → Intégrations IA**, en production (mode privé actif). Aucun coût : c'est un
réglage. La dépense du mois était de 4,719414 $.

| Heure (UTC) | Ancien | Nouveau |
| ----------- | ------ | ------- |
| 00h30:59    | 5 $    | 20 $    |
| 00h31:35    | 20 $   | 50 $    |
| 00h33:05    | 50 $   | 20 $    |
| 00h34:10    | 20 $   | 50 $    |

- Quatre changements, quatre entrées au journal d'administration, chacune au nom du compte
  connecté : ils sont passés par l'application, pas par la voie SQL.
- Un cinquième envoi, à 00h34:17, a renvoyé la valeur déjà en place : la ligne a été touchée,
  rien n'a été journalisé. Le journal ne retient qu'un plafond qui change.
- La chaîne tient en conditions réelles, à la hausse comme à la baisse : formulaire, action
  serveur, écriture sous la RLS, journal. Le plafond est à 50 $ ; il reste 45,28 $ pour octobre.
- À l'écran, d'après l'utilisateur, d'un « oui » à deux questions, sans capture : avant le
  premier changement, 4,72 $ dépensés, un reste de 0,28 $ et l'alerte « Reste faible » ; après
  un envoi, le message qui dit le plafond fixé et ce qui reste.

Non couvert par cette recette : une saisie refusée — au-dessus de 50 $, ou invalide — ; un
plafond fixé sous la dépense du mois, et la mise en garde qui le précède ; l'alerte « Plafond
atteint » ; l'affichage à 375 px ; ce que voit un compte qui n'est pas administrateur, qui ne
peut pas exister en mode privé.

Le lot Y1 est livré.

## Recette des lots Z1 et Z3, et ce qui reste de W2

Le 8 octobre 2026, l'utilisateur a ouvert en production, sous sa session d'administrateur (mode
privé actif), les trois écrans livrés le jour même, et en a transmis une capture chacun. Aucun
coût : ce sont des lectures. Chaque capture a été comparée à ce que la base rend au même moment.

**Coûts de l'IA (Z1)** — conforme, ligne à ligne.

- En tête, octobre 2026 : 4,72 $ comptés, plafond 50,00 $, reste 45,28 $, et le lien « Changer
  le plafond ».
- Synthèse : « 70 appels, 4,72 $ comptés, dont 2,43 $ de réserves », suivie de ses deux notes —
  4 appels sans issue connue, comptés à leur réserve ; 26 appels refusés par le fournisseur,
  sans coût.
- Sept agents, du plus coûteux au moins coûteux : BOARD 2,43 $, entièrement en réserves ;
  WEAVER 0,83 $ ; SCRIPT 0,49 $ ; FIELD 0,25 $ ; ARC 0,17 $ ; SCOUT 0,15 $ ; FRAME 0,13 $.
- La recherche de SCOUT se lit en requêtes — « Recherche (perplexity) », 2 requêtes —, sans
  modèle ni jetons.

Non couvert : le bas de la page — les agents suivants et la section « Mois précédents », qui ne
peut dire que « Aucun appel enregistré avant ce mois », la plateforme datant d'octobre.

**Statistiques (Z3)** — conforme.

- 2 comptes, 2 administrateurs, aucun suspendu ; 2 studios au plan Studio.
- 3 projets : 2 longs métrages et 1 court ; 2 à l'étape Idée, 1 en Écriture. 7 personnages,
  2 scènes, 12 plans, 22 équipements, 2 candidatures, 1 membre d'équipe.
- 13 documents, par type et par statut, tous nommés en français.
- Demandes des trente derniers jours, par livrable et par issue : dont 16 pitchs — 4 réussis,
  12 échoués — et 3 vignettes de storyboard, toutes échouées.

Non couvert : la fin de la page — propositions par décision, exports, opportunités —, hors de
la capture.

**Alertes (W2)** — seul l'état vide a été vu, **W2 reste « en production »**.

- La règle « Nouvelle opportunité » s'affiche avec son délai de quatorze jours et sa limite.
- Aucune alerte, et c'est conforme : aucune opportunité n'a été vérifiée depuis le lot. Les
  deux du catalogue l'étaient avant, donc sans date, et le journal d'administration n'a reçu
  aucune écriture ce jour-là.
- La capture a montré un oubli du lot : la phrase de l'état vide n'annonçait pas la sixième
  nature. Elle dit désormais « … aucune opportunité à étudier bientôt close ni nouvellement
  vérifiée », et un test la tient accordée aux six natures — vérifié en la retirant.

**Reste à faire pour W2, sans coût** : faire passer une opportunité à « vérifiée » depuis
« Catalogue et veille » — en vérifier une nouvelle, ou repasser l'une des deux existantes à
« non vérifiée » puis à « vérifiée » —, et lire l'alerte dans la rubrique « Alertes » et le bloc
« À traiter ». Les deux opportunités couvrent le Cameroun et le long métrage : l'alerte
concernera « une maison hantée ».

## Audit de sécurité et de fiabilité du 5 octobre 2026

Hors lot. Le dépôt et la production ont été relus : garde du middleware, authentification,
redirections, garde des actions serveur, téléchargement des exports, envois d'images et de
photos, passerelle, boucle du worker, fonctions `security definer` en production. Les
migrations et les écrans n'ont pas été relus ligne à ligne. Aucune faille critique ni élevée.

Trois constats, tous traités :

- **Le worker ne s'arrêtait jamais proprement en production.** Démarré par `npm start`, il
  ne recevait pas le signal d'arrêt, et Railway ne lui laissait aucun délai : à chaque
  redéploiement, les journaux portaient `npm error signal SIGTERM` à la place de
  `arret_demande` et `worker_arrete`. Une tâche en cours aurait été coupée, et un appel d'IA
  payé puis perdu ; aucun cas ne s'est produit. Le service est réglé depuis 11h06 UTC sur un
  démarrage direct par `node src/index.ts`, un délai d'arrêt de 200 secondes et l'attente de
  la CI ; la configuration active a été relue, et le worker tourne depuis 11h07 UTC comme
  processus principal de son conteneur. `docs/worker.md` le décrit (PR 92, `07f0583`).
- **`/profil` manquait aux routes gardées par le middleware.** Aucune donnée n'était
  exposée — la coque, la page et chaque action revérifiaient la session et le mode privé —,
  mais une couche de garde manquait. Corrigé, avec un test d'architecture qui exige que
  chaque rubrique de l'espace connecté y figure (PR 91, `486f8e9`).
- **Un commentaire de la passerelle** disait que la clé d'API vient de l'environnement du
  worker ; elle vient du coffre depuis le lot I1b. Corrigé (PR 91).

Validé localement : 683 tests de l'API et 554 tests SQL ; le nouveau test tombe quand on
retire `/profil`. Les deux PR sont en production.

**L'arrêt propre est prouvé** : au redéploiement du lot J2a, le 5 octobre à 14h24 UTC,
l'ancien conteneur a reçu SIGTERM et a journalisé `arret_demande` puis `worker_arrete`, sans
`npm error`. Depuis que l'attente de la CI est activée, le worker ne redémarre qu'une fois la
CI de `main` verte, soit six minutes environ après une fusion.

**Reste à valider en recette** : dans un navigateur, le retour sur `/profil` après connexion.

Relevé et laissé en l'état : la protection contre les mots de passe compromis est désactivée
dans Supabase Auth — à activer avant la levée du mode privé ; 22 clés étrangères sans index,
sans effet au volume actuel ; la convention `middleware` de Next.js 16, dépréciée au profit
de `proxy` ; pas de politique de sécurité de contenu au-delà de l'interdiction des cadres.
Un fichier `railway.json` n'a pas été retenu pour le réglage du worker : Railway a déprécié
ce mécanisme, hors service le 1er décembre 2026.

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

FIELD et la décision 9, tranchée le 4 octobre 2026 (lot J3b, découpé en J3b-1 — base et
worker du budget —, J3b-2 — écran — et J3b-3 — planning) : **une proposition peut porter des
données structurées**. Elle garde son parent dans `ai_suggestions` — tâche, coût, profil — et
range ses données dans une table fille typée, `ai_suggestion_budget_lines`, où chaque ligne a
son propre état. L'équipe accepte ou écarte **ligne par ligne**, en corrigeant au besoin la
ligne avant de l'accepter ; ce que l'agent avait proposé reste inscrit, ce qui est retenu
entre dans `budget_lines`. La proposition se clôt seule quand plus aucune ligne n'attend,
appliquée dès qu'une ligne a été acceptée ; l'écarter d'un bloc écarte les lignes restantes.
C'est le modèle que BOARD et MATCH reprendront.

Trois règles propres au budget. **Le cloisonnement** : toute l'équipe lit les propositions,
mais le budget ne s'ouvre qu'au porteur, aux éditeurs et aux administrateurs ; les lignes
proposées suivent donc `peut_gerer_budget`, et le texte de la proposition parente est écrit
par la base — un nombre de lignes, aucun montant, rien de ce que le modèle a produit. **La
devise** : sans budget ouvert, aucun devis. **Les montants** : FIELD n'a aucune grille
tarifaire, ses coûts sont des ordres de grandeur que l'écran devra présenter comme tels.

Les financements restent hors de FIELD : proposer un organisme ou un montant de fonds, ce
serait inventer une source. Ils relèvent du lot L (MATCH). Prix au barème : 6 unités texte
pour un budget, 3 prévues pour un planning ; 40 lignes au plus par proposition.

La réponse du fournisseur est contrainte par un schéma JSON, envoyé par la passerelle quand
le profil en porte un. Le schéma ne bornant ni les nombres ni les longueurs, le worker
contrôle chaque ligne, puis la base les contrôle de nouveau au dépôt ; une seule ligne hors
bornes fait échouer la tâche et rend les unités. Les profils structurés sont tenus à part
(`PROFILS_FIELD`) de ceux des textes (`PROFILS_IA`), que l'écran des propositions compare
aux siens.

J3b-1 livre la base et le worker sans écran : les demandes se font par l'écran de J3b-2.
Reste à valider en recette, avec le vrai fournisseur : que le schéma de sortie y est accepté
aux côtés du repli côté serveur, et ce que valent les lignes proposées sur un projet réel.

Écran des lignes proposées, décidé le 4 octobre 2026 (lot J3b-2) : l'encart se tient dans
l'onglet Budget, sous la synthèse, et n'apparaît qu'une fois le budget ouvert. Il reprend le
parcours des textes — devis, confirmation, suivi — puis montre les lignes une à une : poste,
libellé, quantité, coût unitaire, total. Chaque ligne s'accepte telle quelle, se corrige avant
d'être acceptée, ou s'écarte ; « Tout accepter » demande une confirmation, puisqu'il écrit
jusqu'à quarante lignes au budget, et « Écarter le reste » clôt la proposition. Un
avertissement fixe rappelle que les montants sont des estimations sans grille tarifaire.

Aucune migration : « tout accepter » est une boucle côté serveur sur
`accepter_ligne_budget`. Elle n'est donc pas atomique — une ligne refusée en chemin laisse
les précédentes au budget —, et l'écran dit alors combien sont passées. Un catalogue
`LIVRABLES_STRUCTURES`, tenu à part de `LIVRABLES_IA`, porte les libellés ; un test
d'architecture le lie aux profils structurés du worker. Les actions serveur vivent dans
`budget/actions-ia.ts` : le navigateur n'y choisit ni l'action, ni le modèle, ni les
paramètres du devis, et une ligne corrigée repasse par les lectures du formulaire du budget.

Vérifié dans le navigateur, sur la pile locale et avec des lignes écrites à la main à la
place du worker : devis à 6 unités, attente annulable, trois lignes affichées avec leur total,
refus d'un coût mal écrit, acceptation d'une ligne corrigée — entrée au budget à son coût
corrigé —, écart d'une ligne, confirmation de « tout accepter », clôture de la proposition ;
aucun débordement à 375 et 768 px au repos. Non vérifié : la liste des lignes en largeur
mobile, et tout appel réel au fournisseur.

Ce lot a été fusionné trois fois. Les deux premières, le 4 octobre 2026, il a dû être retiré
faute de sa migration : pendant 1 h 11 (PR 80 puis 81), puis 46 minutes (PR 83 puis 84), le
code déployé a lu une colonne `budget_plan` absente — vitrine sans les chiffres du barème,
« Plans et quotas » incapable de publier une version. Aucune donnée n'a été touchée. La
première fois, la poussée échouait dans le terminal d'où elle partait ; la seconde, elle a
été refusée à l'assistant par le garde-fou de son outil, après un essai à blanc pourtant
réussi.

La troisième fois, l'ordre a été inversé : la migration, purement additive, a été poussée et
constatée en base **avant** la fusion du code. Règle retenue, qui vaut pour tout lot à
venir : **un lot qui porte une migration additive pousse sa migration avant de fusionner son
code**, et la poussée en production est faite par une personne, jamais supposée possible.

J3b-1 et J3b-2 sont en production depuis le 4 octobre 2026 : migration poussée avant le code,
PR 88 (`ea92510`) fusionnée à 20h47 UTC, PR 87 (`e79b2f4`) à 20h51 UTC. Relu en base de
production le 5 octobre : 41 migrations, la dernière étant celle du lot ; la table
`ai_suggestion_budget_lines` et la colonne `budget_plan` du barème y sont. **La recette reste
à faire** : aucune tâche `budget_plan` n'a encore été demandée en production, aucune ligne
n'y a été proposée. Les deux lots gardent donc leur statut « validé localement ». La recette
a eu lieu le jour même : voir « Recette du lot J3b ».

Scénario et décision 8, tranchée le 5 octobre 2026 (lot J2, découpé en J2a — SCRIPT, le
scénario — et J2b — VOICE, les dialogues) : **un scénario se livre séquence par séquence**.
Il ne tient ni dans une proposition, plafonnée à 20 000 caractères, ni dans un appel au
fournisseur, borné à trois minutes ; relever le plafond pour l'écrire d'un bloc ferait payer
une réponse tronquée. Le devis chiffrait déjà par séquence : il n'en admet plus qu'une par
demande, à 2 unités.

L'équipe décrit la séquence à chaque demande, en 1 200 caractères au plus ; aucune table de
séquences n'est créée, un séquencier pouvant venir plus tard. SCRIPT lit la fiche, les
personnages, la vision, les documents finalisés et les 6 000 derniers caractères du scénario
où la séquence atterrira — brouillon compris, seule exception à « finalisés seulement » : on
n'enchaîne pas sur un texte qu'on n'a pas lu. Il ne relit pas le début d'un long scénario, et
l'écran le dit.

L'acceptation est la première qui **ajoute** au lieu de remplacer : la séquence se place à la
fin du document « Scénario », après une ligne vide, et le document garde une version. Au-delà
de 200 000 caractères, elle est refusée avec un message qui le dit. Le profil
`script.scenario@1` est écrit à la main : une séquence n'est pas faite de paragraphes, et ses
répliques ne figurent dans aucun dossier. Aucune table, politique ni droit nouveaux.

J2b reste à cadrer : réécrire les dialogues d'une scène suppose de désigner un passage du
scénario et de le remplacer sans écraser le reste, ce que rien ne sait faire aujourd'hui.

Planning de FIELD, décidé le 5 octobre 2026 (lot J3b-3, découpé en J3b-3a — base et worker —
et J3b-3b — écran) : second livrable structuré, sur le modèle du budget. La proposition garde
son parent dans `ai_suggestions` et ses jalons dans `ai_suggestion_milestones`, acceptés ou
écartés un à un.

**FIELD ne propose aucune date.** Il ne connaît ni le jour ni le calendrier de l'équipe, et
une date écrite par un agent passerait pour un engagement : un jalon proposé porte un titre,
une phase et une durée en jours. L'équipe le date en l'acceptant ; dès qu'elle saisit un
début, l'écran propose l'échéance d'après la durée, qu'elle peut changer. Sans date, le jalon
entre au planning non daté, et la durée estimée est gardée dans ses notes.

Trois choses le distinguent du budget. **Les droits** : le planning se lit de toute l'équipe,
ses propositions aussi ; en décider reste à qui écrit le planning. Un lecteur voit les jalons
proposés sans bouton de demande ni de décision. **Le contexte** : il ne porte pas le budget,
que les lecteurs ne lisent pas. **Le prix** : 3 unités texte, trente jalons au plus par
proposition.

Le barème gagne la colonne `schedule_plan`, avec ses deux droits — publication et vitrine —,
comme l'analyse et le budget avant elle. La vitrine cite désormais « 3 pour un planning
prévisionnel ». Écarter la proposition d'un bloc écarte les jalons restants, par le même
déclencheur que le budget ; l'état « écartée » d'une proposition dont des lignes ont été
acceptées, relevé à la recette du budget, est laissé tel quel pour les deux.

J3b-3a et J3b-3b sont en production depuis le 5 octobre 2026 : migration poussée avant le
code — 44 migrations —, PR 98 (`d5e4ac7`) fusionnée à 16h26 UTC, le worker annonçant ses
**quatorze** actions à 16h32 ; puis PR 99 (`9e2eaf2`) à 16h57 UTC, sans migration. Validés
localement : 719 tests de l'API, 568 tests SQL, onze sabotages. **La recette reste à faire** :
aucune tâche `schedule_plan` n'a encore été demandée en production, et l'écran n'a été vu dans
aucun navigateur — ni par les tests, qui le lisent comme du texte, ni par une capture. Les
deux lots gardent donc leur statut « validé localement ». La recette a eu lieu
le soir même : voir « Recette du lot J3b-3 ».

Dialogues de VOICE, cadrés le 5 octobre 2026 (lot J2b, découpé en J2b-1 — base et worker —
et J2b-2 — écran) : réécrire les répliques d'une scène, c'est remplacer un passage du
scénario sans toucher au reste. Le scénario étant un texte continu, sans scènes en base, la
scène est **désignée par un passage** — document, position et longueur en caractères — et
scellée par son empreinte. Une table de scènes aurait été plus solide, mais c'était un lot
entier avant la première réplique.

Le texte de la scène ne voyage pas dans le devis, plafonné à 2 000 octets : la base le relit
elle-même, au devis, à la préparation de l'appel et à l'acceptation (`passage_du_scenario`).
Si le scénario a changé à cet endroit, le devis est refusé, la tâche échoue sans appel, ou
l'acceptation est refusée : rien n'est remplacé, la proposition reste lisible. Une scène par
demande, 6 000 caractères au plus ; 12 000 pour la scène réécrite.

VOICE ne réécrit que les répliques : intitulés et didascalies restent tels quels, pour que la
proposition se compare à la scène ligne à ligne. Il lit le projet, ses personnages, la scène
et les 3 000 caractères qui la précèdent — ni la suite du scénario, ni les autres documents.

À l'écran, le navigateur n'envoie que le texte sélectionné : le serveur le retrouve dans le
document enregistré, exige qu'il n'y figure qu'une fois, et calcule position et empreinte.
L'éditeur gardant en mémoire le texte qu'il a chargé, l'encart refuse d'agir sur un document
non enregistré et recharge la page après une acceptation — sans quoi un enregistrement
suivant écraserait la scène tout juste remplacée.

FRAME et GEAR, cadrés le 5 octobre 2026 (lot J3c, cahier des charges :
`docs/product/CDC_FRAME_GEAR.md`) : le découpage technique range les plans d'une scène du
storyboard — cadrage, focale, angle, mouvement, description, durée —, à côté du cadrage
principal que la scène porte déjà. Le matériel se tient par projet, avec la puissance de
chaque équipement. **Les calculs électriques sont faits par la plateforme, jamais par le
modèle** : charge simultanée, intensité sous la tension du projet, groupe électrogène
conseillé. Tension de 230 V et marge de 30 % par défaut, réglables par projet : ce sont des
choix du lot, pas une norme, et l'écran le dit.

Quatre lots : J3c-1, les tables et la saisie manuelle, sans IA et utile seul ; J3c-2, FRAME
propose les plans d'une scène (4 unités) ; J3c-3, GEAR propose une liste de matériel (5
unités) ; J3c-4, les sections du dossier. Ni marque, ni loueur, ni prix : les prix restent au
budget.

J3c-1, écrit le 5 octobre 2026 : trois tables et aucun appel d'IA. `scene_shots` range les
plans d'une scène — un plan porte le projet de sa scène, et une clé étrangère composée
refuse qu'il en porte un autre — ; `project_gear`, le matériel d'un projet ;
`project_power_settings`, la tension et la marge, dans leur propre table plutôt que sur
`projects`, qu'un administrateur ne réécrit pas. Mêmes droits que le storyboard, journal
d'administration compris. Les plans se saisissent sous chaque scène de l'onglet Storyboard,
dans un volet replié ; le matériel a son onglet, « Matériel », ouvert à toute l'équipe.

Le besoin électrique sort d'un seul module (`src/lib/materiel-calculs.ts`), recalculé à
chaque lecture et jamais stocké : charge simultanée, intensité — charge ÷ tension, en
monophasé, sans facteur de puissance — et groupe conseillé, marge comprise. Un équipement
sans puissance renseignée n'entre pas dans le calcul, et l'écran dit combien sont dans ce
cas. La tension se règle de 100 à 250 V : au-delà, l'alimentation serait triphasée et la
formule fausse. Deux bornes d'écran, sans équivalent en base : 50 plans par scène, 300
lignes de matériel par projet.

FRAME, précisé le 6 octobre 2026 (lot J3c-2, découpé en J3c-2a — base et worker — et J3c-2b
— écran) : l'assistant doit proposer le découpage **d'après le scénario et le concept**, pas
d'après la seule scène du storyboard. FRAME lit donc le scénario enregistré en entier —
borne de 220 000 caractères décidée par l'utilisateur, un document en portant 200 000 au
plus —, le concept du projet et sa vision artistique ; la scène du storyboard dit laquelle
découper, et rien ne relie encore une scène à un passage du scénario : c'est le modèle qui
le retrouve. Ni budget, ni équipe, ni autre document.

J3c-2a reprend le modèle des propositions structurées : action `shot_list` à 4 unités, la
scène en paramètre du devis, vérifiée par la base ; table `ai_suggestion_shots` ; plans
acceptés ou écartés un à un, un plan accepté s'ajoutant à la fin de sa scène, corrigé ou
non. Profil `frame.decoupage@1`, vingt plans au plus, focale et durée facultatives. Ce que
ce choix coûte : le scénario entier entre dans chaque appel, et son prix réel n'est pas
mesuré — il le sera en recette. Sans écran tant que J3c-2b n'est pas livré.

J3c-2b, écrit le 6 octobre 2026 : l'encart de l'assistant se tient dans le volet « Découpage »
de chaque scène du storyboard. Qui écrit le storyboard y demande un découpage, suit la
demande, puis accepte chaque plan — tel quel ou corrigé — ou l'écarte ; un lecteur lit les
plans proposés sans en décider. Le volet s'ouvre de lui-même dès que l'assistant a quelque
chose à montrer, et l'écran dit quand le projet n'a pas de scénario enregistré. L'écran
refuse un plan de plus dans une scène qui en compte déjà cinquante. Sans migration.

Le rendu a été contrôlé en local avec une vraie session, pour le porteur et pour un lecteur,
sur le storyboard et sur l'onglet Matériel — premier contrôle de ces écrans ailleurs que dans
des tests qui lisent le code. Il ne remplace pas la recette : ni les gestes au clic, ni les
largeurs mobiles, ni le vrai fournisseur n'y sont exercés.

GEAR, écrit le 6 octobre 2026 (lot J3c-3, livré d'un seul tenant : base, worker et écran) :
quatrième livrable structuré, sur le modèle du budget, du planning et du découpage. Action
`gear_list` à 5 unités, sans paramètre : une demande vise le projet entier. Table
`ai_suggestion_gear` ; équipements acceptés ou écartés un à un, tels quels ou corrigés.
Profil `gear.materiel@1`, trente lignes au plus.

GEAR lit le concept du projet, les scènes du storyboard, le découpage — résumé en
mouvements, cadrages, angles et focales, sans ses descriptions — et le matériel déjà saisi.
Ni scénario, ni budget, ni équipe. Il ne nomme ni marque, ni modèle commercial, ni loueur,
ni prix ; cela ne tient qu'à sa consigne, la base ne sachant pas reconnaître une marque
dans une désignation.

**GEAR ne rend aucun calcul** : son schéma et sa table n'ont aucun champ où déposer un
total ou une intensité, et l'encart n'en affiche aucun sur des lignes seulement proposées.
Le besoin électrique reste celui de la plateforme, sur ce que l'équipe a accepté. Une
puissance proposée est un ordre de grandeur, facultatif, que l'écran présente comme
« estimée » ; il renvoie à la plaque de l'appareil. Décidé avec l'utilisateur : **GEAR ne
propose pas de groupe électrogène** — sa puissance s'ajouterait à ce que le tournage
consomme, défaut trouvé à la recette de J3c-1 —, l'écran calculant déjà le groupe conseillé.

Exports du découpage et du matériel, écrits le 6 octobre 2026 (lot J3c-4) : deux sections de
plus dans un dossier, sur le geste du lot M4 — `parametres_export` et `contenu_dossier`
reprises avec un seul ajout chacune, sans table, politique ni fonction nouvelle. Une demande
qui ne les désigne pas garde sa forme, donc son empreinte : les dossiers déjà fabriqués
restent retrouvés.

Le découpage sort scène par scène — les seules qui ont des plans —, chacune avec son
en-tête et le tableau de ses plans. Le matériel sort rangé par catégorie. En archive, deux
classeurs de plus, `decoupage.xlsx` et `materiel.xlsx`, où focales, durées, quantités et
puissances restent des nombres. Décidé avec l'utilisateur : **le dossier ne porte aucun
calcul électrique** — ni charge, ni intensité, ni groupe conseillé. Ce chiffrage n'est pas
certifié, et le refaire dans la base ou le worker en aurait créé un second.

BOARD, décision 7 tranchée pour l'image le 6 octobre 2026 (lot K, découpé en K1 — base et
worker — et K2 — écran) : OpenAI pour l'image ; **une image par scène**, une scène par
demande ; jamais de remplacement d'une vignette sans accord explicite. Le budget de test de
la recette reste à fixer par l'utilisateur. Le lot L (SCOUT, GRIOT, MATCH) attend toujours
la même décision pour la recherche.

K1, écrit le même jour. OpenAI est appelé **sans son SDK**, par une requête HTTPS écrite
dans la passerelle : une seule adresse, fixe, sans redirection suivie ni réessai, sans
dépendance de plus. Sa clé suit la règle des autres — le coffre de la base, depuis l'écran
Intégrations IA — et BOARD n'entre en service que si elle est posée, indépendamment de
celle d'Anthropic. Profil `board.vignette@1` : modèle `gpt-image-2.5-flare`, 1536 × 1024,
qualité moyenne ; le croquis à l'encre noire sur fond blanc y est écrit une fois, en tête
de la demande, et les interdits — couleur, photoréalisme, 3D, peinture numérique, texte
dans l'image — en fin. Action `storyboard_image`, une unité sur le quota d'images du plan.

La vignette proposée reste en base (`ai_suggestion_images`, PNG de 5 Mo au plus), comme un
export, tant que l'équipe n'a pas décidé : **le worker ne reçoit aucun droit sur le
stockage**. À l'acceptation, l'application dépose le fichier sous la session de qui décide,
et `accepter_image_proposee` vérifie que l'objet y est, le rattache à la scène et rend
l'ancienne image, à supprimer. BOARD lit la scène, ses six premiers plans, le genre et un
extrait de la vision artistique ; ni scénario, ni budget.

Ce qui n'est pas établi : le poids d'une image en jetons, qu'OpenAI ne publie pas sur les
pages consultées. La provision d'avant l'appel emploie un plafond choisi par le lot —
20 000 jetons, soit 0,60 $ au pire — ; le coût confirmé vient de l'usage que la réponse
rapporte, relevé dans le code du SDK d'OpenAI, au tarif lu le 6 octobre 2026 (5 $ et 30 $ le
million). Et rien ne vérifie un dessin par programme : que l'image soit bien un croquis en
noir et blanc ne se jugera qu'à l'œil, en recette.

K1 est en production depuis le 6 octobre 2026 (PR 116, `cb81a30`, 50 migrations). **Une clé
OpenAI était déjà posée dans le coffre** — ce que le rapport du lot avait d'abord nié, faute
de l'avoir vérifié — : le worker l'a chargée à son redémarrage, à 14h47 UTC, et BOARD est en
service, dix-huitième action. Aucune vignette n'a été demandée.

K2, écrit le même jour, sans migration : l'encart de la vignette se tient dans la carte de
chaque scène du storyboard. Qui écrit le storyboard demande une vignette, suit la demande,
puis l'accepte ou l'écarte ; un lecteur la voit sans en décider. La vignette proposée se lit
par sa propre route, sous la session — elle n'est pas dans le stockage, aucun lien signé n'y
mène —, servie comme un PNG ou pas du tout, sans cache.

**Accepter est le seul geste qui change l'image d'une scène.** L'action relit le fichier sous
la session de qui décide, le dépose dans le compartiment privé à un chemin tiré au sort,
puis laisse la base le rattacher ; l'ancienne image n'est supprimée qu'après son accord, et
un refus retire le fichier tout juste déposé. Si la scène porte déjà une image, l'écran le
dit en toutes lettres et demande un second clic.

K2 est en production depuis le 6 octobre 2026 (PR 117, `c77c295`, sans migration). La
première demande de vignette, le même jour, a échoué : **le compte OpenAI n'avait plus de
crédits** (429, `insufficient_quota`). La chaîne a tenu jusqu'au fournisseur — devis,
réservation, tâche, clé chargée, appel —, aucune image n'a été produite, rien n'a été
facturé. La recette de BOARD attend que ce compte soit crédité. L'utilisateur a envisagé un
second fournisseur d'images, puis choisi de maintenir le système en place.

SCOUT, décision 7 tranchée pour la recherche le 6 octobre 2026 (lot L1) : **Perplexity
collecte, Anthropic synthétise**. Perplexity ne génère pas d'image — sa documentation n'en
propose pas — : il ne peut pas servir le storyboard, seulement la recherche. Son API de
recherche rend des pages (adresse, titre, extrait, date) et ne rédige rien ; le modèle de
texte ne reçoit que ces extraits et ne cite qu'eux. C'est le « pipeline avant modèle » de
`docs/roles-anthropic-openai-filmfund-africa.md`. Prix au barème : 3 unités texte.

L1, écrit le même jour, base et worker, sans écran. Une recherche est une question en clair,
de 10 à 500 caractères ; **elle seule part chez le moteur** — ni titre, ni texte du projet, ni
budget. Le worker ne visite aucune page rendue : la seule sortie réseau de plus est l'adresse
fixe de Perplexity, appelée sans SDK depuis la passerelle. Il ne peut donc rien vérifier, et
**toute source naît « non vérifiée »** ; aucune fonction de ce lot n'en vérifie une.

Deux fournisseurs dans une tâche, donc deux coûts : la requête de recherche a son registre
(`provider_search_charges`, `provider_search_settlements`), compté avec celui des modèles
dans la dépense du mois. Elle est provisionnée avec, en réserve, le pire coût de la synthèse :
le plafond refuse l'ensemble avant le premier appel, pas après une collecte payée. SCOUT
n'entre en service qu'avec les deux clés, celle de Perplexity et celle d'Anthropic.

La base ne se fie ni au site ni aux renvois annoncés : elle tire le site de l'adresse, relit
chaque renvoi « [n] » de la synthèse, et refuse un texte qui citerait une source absente de
la collecte, n'en citerait aucune, ou écrirait une adresse de lui-même. Les sources proposées
(`ai_suggestion_sources`, sixième table fille) se retiennent ou s'écartent une à une, par qui
écrit le projet ; une source retenue entre dans `project_sources` avec son adresse, son
extrait, sa date de collecte et la question posée. **L'organisme n'est pas connu** — le moteur
ne le donne pas, le déduire serait l'inventer — : la colonne `site` porte l'hôte de l'adresse,
rien de plus. La synthèse reste dans la proposition : ce lot ne la range nulle part.

Ce qui reste à voir en recette, et que les fournisseurs factices ne prouvent pas : que
Perplexity accepte la requête telle qu'elle est écrite — ses paramètres ont été relevés dans
sa documentation par un résumé automatique —, ce que valent les pages qu'il rend sur des
sujets d'Afrique centrale, et que le modèle s'en tient aux extraits. Aucun écran ne propose
encore la recherche (lot L2) ; GRIOT et MATCH restent à cadrer.

L1 est en production depuis le 6 octobre 2026 (PR 118, `2c7f6a8`, 51 migrations, migration
poussée avant la fusion et vérifiée en base). SCOUT y reste hors service tant qu'aucune clé
Perplexity n'est posée.

Correctif du même jour (PR 119, `33785d0`, sans migration) : un compte OpenAI sans crédits
répond par un 429, que le worker tenait pour douteux ; la provision de chaque refus restait
au registre. La passerelle reconnaît désormais ce refus au type ou au code de l'erreur, solde
le coût à zéro et l'inscrit en clair sur la tâche. **Les quatre provisions du 6 octobre
(2,43 $) restent au registre de production** : ce correctif ne vaut que pour la suite.

L2, écrit le même jour, sans migration : l'onglet « Recherche » du projet, lisible de toute
l'équipe. Qui écrit le projet y pose une question, lit le devis, confirme, suit la demande,
puis retient ou écarte chaque source ; un lecteur lit la synthèse et les sources sans en
décider, et ne lit pas la question, qui vit sur la tâche. **Avant tout envoi, l'écran dit que
la question, et elle seule, part chez un moteur de recherche externe**, et la remontre telle
qu'elle partira.

La synthèse reste dans la proposition, lisible sur l'onglet — décidé avec l'utilisateur : elle
n'est versée dans aucun document. Ses renvois « [n] » mènent à la source de la page, jamais à
une adresse qu'un modèle aurait écrite ; titres et extraits, venus du web, sont affichés
comme du texte. Chaque source porte son site, sa date si elle est connue, et dit si la
synthèse la cite. Les sources retenues se rangent sous « Sources du projet », marquées
« Non vérifiée », avec leur date de collecte et la question posée ; qui écrit le projet peut
en retirer une, personne ne peut en corriger une. Une recherche qui n'a rendu aucune page
exploitable le dit par « Information non trouvée dans la source consultée. » — et seulement
dans ce cas, pas pour une panne.

Ce que l'écran ne fait pas : il ne montre que la dernière recherche — les synthèses
précédentes restent en base, sans écran pour les relire — et ne propose pas de retenir
toutes les sources d'un geste : chacune se juge.

L2 est en production depuis le 6 octobre 2026 (PR 120, `4035088`, sans migration).

**Recette de SCOUT, le 6 octobre 2026, lots L1 et L2.** L'utilisateur a posé la clé de
Perplexity depuis Intégrations IA à 20h40 UTC — l'ajout est au journal d'administration —,
puis demandé, sur le projet « une maison hantée » : « c'est quoi un dossier de film? ». Un
seul essai, 16,5 secondes, sans repli. **Perplexity a accepté la requête telle qu'elle est
écrite** et rendu 9 pages : le doute sur ses paramètres, relevés par un résumé automatique de
sa documentation, est levé. Synthèse de 3 112 caractères, sans adresse écrite par le modèle,
tous ses renvois dans la collecte. Coût confirmé : **0,060928 $** — 0,005 $ pour la requête,
0,055928 $ pour la synthèse (5 342 jetons en entrée, 1 728 en sortie) —, 3 unités texte.

À la lecture, le modèle s'en tient à ce que les sources avancent, signale les extraits
tronqués, les sources sans date et celles qui se contredisent, écarte de lui-même deux pages
hors sujet, et dit ce qui manque par la formule prévue : aucune source ne traite d'un long
métrage produit au Cameroun ni des fonds africains. La synthèse n'a pas été comparée aux
extraits ligne à ligne, et aucune page n'a été ouverte.

L'utilisateur a ensuite retenu une source, en a écarté six une à une et deux d'un geste,
entre 21h01 et 21h02 UTC. La source retenue est aux sources du projet, « non vérifiée »,
avec la question posée et l'instant de sa collecte.

Réserves :

- **Couverture** : une seule question, généraliste, et neuf sources françaises ou
  généralistes — un site de scénario, Eduscol, un blog de location de matériel, des fiches
  de révision. Aucune n'est africaine. Ce que le moteur rend sur l'Afrique centrale reste à
  mesurer, sur des questions ciblées.
- **« Citée » ne veut pas dire « utile »** : les neuf sources sont marquées citées, dont les
  deux que la synthèse ne nomme que pour les écarter.
- **Titres** : celui d'une source est arrivé mal formé du moteur, et s'affiche tel quel.
- **Proposition « écartée »** : écarter d'un geste les sources restantes ferme la proposition
  sous cet état, même si une source a été retenue — comme pour les autres livrables
  structurés. Sans effet à l'écran, où la synthèse et la source retenue restent lisibles.
- **Non éprouvés** : l'aspect de la page, que l'utilisateur n'a pas commenté et qui n'a pas
  été vu ; le téléphone ; le retrait d'une source retenue ; le parcours d'un éditeur et d'un
  lecteur réels, le mode privé ne laissant entrer que les administrateurs.

Le correctif du refus faute de crédits (PR 119) est prouvé en production le même soir : une
demande de vignette de 20h41 UTC, refusée par OpenAI, a ses deux essais soldés à 0 $ et porte
sur la tâche « Le compte du fournisseur n'a plus de crédits : rien n'a été produit ni
facturé. ». Le compte OpenAI reste sans crédits : la recette de BOARD attend toujours. La
dépense du mois est à 3,97 $ sur 5 $, dont les 2,43 $ de provisions du 6 octobre, antérieures
au correctif.

GRIOT, lot L3, écrit le 6 octobre 2026 en un seul lot — base, worker, écran — puisque le
socle de SCOUT existe. **Aucune mécanique nouvelle** : même exécuteur, mêmes tables, même
registre des coûts ; la migration n'ouvre qu'une action (`cultural_context`), son prix au
barème (3 unités) et les trois fonctions du worker aux deux actions. Ni table, ni droit, ni
politique de plus.

Ce qui distingue GRIOT tient à son profil (`griot.contexte@1`) :

- **Une collecte restreinte à une liste fermée de sites**, validée par l'utilisateur comme
  point de départ : `persee.fr`, `openedition.org`, `cairn.info`, `hal.science`, `erudit.org`,
  `jstor.org`, `unesco.org`, `africamuseum.be`, `horizon.documentation.ird.fr`. La liste part
  chez le moteur, et le worker **recontrôle ce qui revient** : une page d'un autre site est
  écartée, même si le moteur la rend ; un nom qui en imite un autre ne passe pas.
- **Des consignes d'historien** : dire d'où parle chaque source — administration coloniale,
  mission, voyageur, chercheur, tradition orale rapportée — et sa date ; exposer les
  désaccords sans trancher ; ne pas étendre à un peuple, une région ou une époque ce qu'un
  extrait dit d'un lieu ; rapporter entre guillemets tout terme dépréciatif.

L'onglet « Recherche » propose désormais le choix « Où chercher » : recherche documentaire,
sur tout le web public, ou contexte historique et culturel, sur la liste fermée. L'écran
nomme chaque site, et dit ce que la liste ne garantit pas : elle ne vérifie rien, une bonne
part de l'écrit sur l'Afrique centrale est d'époque coloniale ou vient des missions, et ces
sites peuvent ne rien rendre. Une source de GRIOT naît elle aussi « non vérifiée ».

Ce que les fournisseurs factices ne prouvent pas, et que la recette dira : que le moteur
accepte le filtre de sites tel qu'il est écrit — son nom et sa forme viennent d'un résumé
automatique de sa documentation ; un refus ne coûterait rien —, ce que ces sites rendent
réellement, et si le modèle tient ses consignes. La passerelle vers le moteur reçoit par
ailleurs ses premiers tests directs, `fetch` remplacé : adresse, corps de la requête, refus
sans frais, coupure sans réessai.

L3 est en production depuis le 6 octobre 2026 (PR 122, `f837f36`, 52 migrations ; migration
poussée avant la fusion, à 21h46 UTC, et vérifiée en base).

**Recette de GRIOT, le 6 octobre 2026.** L'utilisateur a demandé, sur le projet « une maison
hantée », en mode « Contexte historique et culturel » : « quels sont les atouts du cinéma
camerounais par rapport à l'occident? ». Posée pendant le redémarrage du worker, la demande a
attendu en file une minute et demie, puis a été prise par la nouvelle version : un seul essai,
21,2 secondes, sans repli. **Perplexity a accepté le filtre de sites tel qu'il est écrit**, et
les dix sources rendues viennent toutes de la liste — Cairn, HAL, OpenEdition, Érudit. Le
doute sur ce paramètre est levé. Synthèse de 3 849 caractères, sans adresse, tous ses renvois
dans la collecte. Coût confirmé : **0,0661 $** — 0,005 $ pour la requête, 0,0611 $ pour la
synthèse (4 335 jetons en entrée, 2 188 en sortie) —, 3 unités texte.

À la lecture, les consignes d'historien sont tenues sur l'essentiel : la synthèse dit d'entrée
que les extraits ne comparent pas le cinéma camerounais à celui de l'Occident, situe chaque
source (thèse, article, compte rendu) avec sa date ou « non daté », borne une observation aux
cinéastes anglophones plutôt qu'à tout le cinéma camerounais, rapporte entre guillemets les
termes chargés en les attribuant, et donne les fragilités à côté des atouts. L'utilisateur a
jugé la réponse juste et utile, retenu six sources et écarté quatre ; la proposition s'est
close « appliquée ». Deux sources sur dix n'étaient pas citées, et l'écran le disait.

Réserves :

- **Une phrase sort du cadre** : la synthèse se termine par un conseil au projet — « Pour
  votre long métrage dramatique, ces sources suggèrent quelques pistes… » —, sans renvoi, tiré
  du format et du genre transmis. Si cela se reproduit, une version 2 du profil devra
  l'interdire.
- **Non comparé aux extraits** : la synthèse n'a pas été relue ligne à ligne contre les
  extraits, et aucune page n'a été ouverte. Aucun chiffre n'est certifié.
- **Une seule question**, et de cinéma plutôt que d'histoire ou d'anthropologie : la tenue de
  GRIOT sur un sujet de société ancien, où l'écrit colonial domine, reste à éprouver.
- **Non éprouvés** : le cas où la liste fermée ne rend rien ; l'aspect de la page et le
  téléphone ; un éditeur et un lecteur réels.

Dépense d'IA du mois au 6 octobre au soir : 4,04 $ sur 5 $, dont les 2,43 $ de provisions du
6 octobre restées au registre.

MATCH, cadré le 6 octobre 2026 avec l'utilisateur, en trois lots : **le catalogue d'abord**
(L4, sans IA), **la consultation et la compatibilité ensuite** (L5, sans IA : un score calculé
par des règles lisibles, comme le score de maturité), **l'agent en dernier** (L6 : une veille
qui propose des opportunités à l'administration, en « non vérifié »). Un score calculé sur des
opportunités non vérifiées enverrait une équipe vers un fonds fermé ou un montant inventé.

L4, écrit le même jour. La table `funding_opportunities` porte ce qu'une opportunité annonce —
nom, organisme, catégorie, pays éligibles, types de projet, genres, montants, devise, dates,
exigences — et **d'où on le tient** : adresse de la source, date de collecte, extrait, statut.
Le catalogue n'appartient à aucun projet ni à aucun studio.

Ce que la base garantit, quel que soit le chemin :

- **« Vérifiée » engage** : une opportunité ne porte ce statut qu'avec sa source, la date de
  sa collecte et l'extrait qui la fonde. Une collecte ne peut pas être datée de l'avenir.
- **Une démonstration ne passe pas pour réelle** : les comptes ne lisent que le vérifié et
  l'expiré ; ni ce qui attend une vérification, ni ce qui n'a pas été retrouvé, ni une
  démonstration.
- **Seule l'administration écrit**, et ni l'auteur ni les dates d'écriture ne se fournissent.
- **Tout est journalisé** dans la transaction de l'écriture — ajout, changement avec l'ancien
  statut, retrait —, sans autre donnée que le nom, l'organisme et les statuts.

L'écran « Opportunités » de l'administration liste le catalogue, dit combien de lignes les
comptes voient, et permet d'ajouter, de modifier et de retirer. Le formulaire explique ce que
chaque statut engage. Ce que la source ne dit pas reste vide et s'affiche « Information non
fournie. » ; un catalogue vide n'affiche aucune opportunité fictive. **Une date limite passée
ne réécrit rien en base** : c'est l'écran qui présente alors l'opportunité comme expirée, et
le dit.

Ce que ce lot ne fait pas : aucun écran pour les équipes, aucun score, aucune recherche —
c'est L5. Le catalogue naît vide : sa valeur dépendra de ce que l'administration y saisira.

Correctif de L4, le 7 octobre 2026 : en recette, le même fonds est entré trois fois au
catalogue par trois envois du même formulaire. Un index unique sur le nom et l'organisme —
casse et espaces autour mis à part — le refuse désormais ; le formulaire se vide après un
ajout et mène à la fiche créée. En production le 7 octobre (PR 125, `ef9428a`, 54 migrations,
index vérifié en base). L'écran n'a pas été revu en recette.

**Décision de l'utilisateur, le 7 octobre 2026 : les opportunités ne se saisissent plus de
mémoire, un agent les propose, avec leur source et un résumé.** L6 passe donc avant L5, en
deux lots : base et worker (L6a), écran (L6b). Quatre choix, sur recommandation :

- **Le résumé est celui de l'extrait rendu par le moteur**, pas de la page entière : le worker
  ne visite toujours aucune page.
- **Une veille est une tâche de l'administration**, sans projet ni studio : ni devis, ni
  réservation, aucun quota entamé. Elle compte dans la dépense d'IA du mois.
- **L'agent propose un nom, un organisme, une catégorie et un résumé.** Ni montant, ni date
  limite, ni pays, ni critère dans un champ à part : un extrait tronqué en donnerait de faux.
- **Le formulaire manuel reste** : c'est par lui qu'une fiche se complète et se vérifie.

L6a, écrit le même jour. La mécanique est celle de SCOUT — la collecte est désormais une
fonction commune (`collecter`), que SCOUT, GRIOT et MATCH partagent. Ce que la base garantit,
quoi que dépose le worker :

- **La provenance vient de la page** : adresse, titre, extrait et date d'une opportunité
  proposée sont lus dans la collecte, au rang que le modèle désigne ; il n'écrit aucune
  adresse.
- **Rien ne naît vérifié** : une opportunité acceptée entre au catalogue « non vérifiée »,
  invisible des comptes. Son nom, son organisme et sa catégorie se corrigent à l'acceptation ;
  sa provenance, non. Sans organisme nommé par la page, il se saisit — il ne se devine pas.
- **Pas deux fois la même** : une opportunité déjà au catalogue est refusée.
- **Seule l'administration** demande une veille, lit ses propositions et en décide. La
  demande est journalisée ; l'ajout au catalogue l'est par le catalogue. Une veille à la
  fois, vingt par administrateur et par vingt-quatre heures ; le worker revérifie le rôle de
  l'auteur avant d'exécuter.
- **Aucune opportunité relevée n'est pas un échec** : la tâche réussit et la proposition se
  dépose close, sans rappeler le modèle.

Pour porter une tâche sans projet, trois tables rendent facultatifs le studio et le projet
— `jobs` (et sa réservation), les deux registres de coûts, `ai_suggestions` —, tenus à la
seule action `opportunity_watch` par une contrainte. Quatre fonctions livrées sont reprises
à l'identique, à un ajout près : `clore_travail`, `reclamer_travail`, `annuler_travail`,
`provisionner_recherche`.

Ce que ce lot ne fait pas : aucun écran — la veille ne se demande encore que par la base ;
c'est L6b. Ce que les fournisseurs factices ne prouvent pas, et que la recette dira : ce que
le moteur rend sur les fonds ouverts au cinéma africain, si le modèle s'en tient aux
extraits, et s'il distingue un appel d'un palmarès.

L6a est en production depuis le 7 octobre 2026 (PR 126, `bbcae24`, 55 migrations ; migration
poussée avant la fusion et vérifiée en base ; worker redémarré à 02h03 UTC avec 21 actions,
dont `opportunity_watch`). Les trois clés étant posées, MATCH est en service.

L6b, écrit le même jour, sans migration : la section « Veille » d'Administration →
Opportunités. L'administrateur écrit ce qu'il cherche ; l'écran lui remontre la recherche
telle qu'elle partira, et dit qu'elle seule quitte la plateforme, que l'appel est payant et
compté dans la dépense du mois. Chaque opportunité proposée est montrée « non vérifiée »,
avec le résumé de l'extrait, la page d'où elle vient, la date de la collecte et l'extrait
lui-même. Son nom, son organisme et sa catégorie se corrigent avant d'accepter ; sans
organisme nommé par la page, l'écran demande de le lire sur la page, pas de le déduire du
site. Une opportunité déjà au catalogue est signalée avant même d'être refusée. Une veille
qui ne relève rien le dit, sans échec. Le formulaire manuel reste, pour compléter et vérifier.

Vérifié en local sous une vraie session d'administrateur, par la page que le serveur rend ;
**pas au navigateur** : ni l'aspect, ni le téléphone, ni les clics n'ont été vus.

L6b est en production depuis le 7 octobre 2026 (PR 127, `0798bfc`, sans migration ; CI de
`main` verte).

**Recette de MATCH, le 7 octobre 2026, lots L6a et L6b.** Un administrateur a demandé, depuis
la section « Veille » d'Administration → Opportunités (mode privé actif) : « fonds de soutien
au documentaire ouverts aux réalisateurs d'Afrique centrale en 2027 ». La demande est au
journal d'administration, à 09h47 UTC. Tâche sans studio, sans projet et sans réservation,
envoyée au fournisseur une seconde après sa création : un seul essai, 41,9 secondes, sans
repli, sur `claude-opus-5-5`, avec le profil `match.veille@1`. Le moteur a rendu 10 pages ;
MATCH y a relevé **6 opportunités, tirées de 4 pages**. Coût confirmé : **0,12286 $** —
0,005 $ pour la requête, 0,11786 $ pour le relevé (8 630 jetons en entrée, 4 167 en sortie) —,
pour 0,20444 $ provisionnés. Aucun quota entamé.

Le texte de la proposition parente est écrit par la base : la recherche, « 6 opportunités
relevées dans les 10 pages collectées », et « Rien n'est vérifié. ».

Onze minutes plus tard, une opportunité a été acceptée telle quelle — un fonds de soutien au
documentaire. Relu en base :

- **Elle est entrée au catalogue « non vérifiée »**, donc invisible des comptes, et son ajout
  est au journal dans la même seconde.
- **Sa provenance est celle de la page** : même adresse et même extrait que dans la collecte,
  date de collecte du jour.
- **Ni montant, ni date limite, ni pays dans un champ à part** : ces colonnes sont vides au
  catalogue.
- Nom, organisme et catégorie sont ceux que l'agent proposait ; rien n'a été corrigé.

À la lecture des six résumés, le modèle dit ce que l'extrait ne dit pas — « ne précise ni les
montants, ni les dates de dépôt » —, signale les pages non datées et, pour un fonds, qu'une
autre page de 2020 le donnait comme nouvellement lancé : « l'information est donc à vérifier ».
Sans organisme nommé par la page, il a laissé l'organisme vide plutôt que de le déduire.

Réserves :

- **Une fiche de projet relevée comme opportunité** : la sixième proposition est un programme
  financé par un bailleur, classé « atelier », dont le résumé dit lui-même « Il s'agit d'une
  fiche de projet et non d'un appel ». Le modèle distingue donc, mais relève quand même. Si
  cela se reproduit, une version 2 du profil devra l'écarter.
- **Des montants et une date dans la prose du résumé** : le résumé de l'opportunité acceptée
  cite deux plafonds en euros et une date limite en 2027, repris de l'extrait. Aucun champ ne
  les porte, et l'écran dit que le résumé est celui d'un extrait ; ils restent à vérifier sur
  la page comme le reste.
- **Une déduction** : « L'absence de condition de nationalité rend en principe ce dispositif
  accessible aux réalisateurs d'Afrique centrale. » L'extrait ne le dit pas.
- **Deux pages ont donné chacune deux opportunités**, dont une « condition commune à cinq
  fonds » que le résumé reprend deux fois sans savoir à qui elle s'applique — et il le dit.
- **Non comparé aux extraits** : les résumés n'ont pas été relus ligne à ligne contre les
  extraits, et aucune page n'a été ouverte. Aucun chiffre n'est certifié.
- **Une seule veille, une seule décision** : cinq opportunités attendent encore ; la
  proposition reste ouverte. **Écarter** — une opportunité ou le reste —, **corriger avant
  d'accepter**, saisir un organisme manquant, le signalement d'une opportunité déjà au
  catalogue et une veille qui ne relève rien n'ont pas été exercés.
- **Non éprouvés** : l'aspect de la page, qu'aucune capture n'a montré, et le téléphone ; la
  limite d'une veille à la fois et de vingt par vingt-quatre heures en conditions réelles.

**L4 reste « en production », sans être dit validé en recette.** Son écran a servi en
production le 6 octobre — trois ajouts puis trois retraits, tous au journal —, et le catalogue
a reçu le 7 octobre sa première ligne par la veille. Mais ni le correctif des doublons n'a été
revu à l'écran, ni une modification, ni surtout le passage d'une opportunité à « vérifiée »,
avec sa source, sa date et son extrait : c'est la garantie centrale du lot, et elle n'a encore
été exercée que par les tests. Le catalogue de production compte une opportunité, non
vérifiée ; les comptes n'en lisent aucune.

Dépense d'IA du mois au 7 octobre, après cette veille : 4,25 $ sur 5 $ d'après les registres,
dont quatre provisions restées sans coût confirmé. Aucune tâche en attente ni à rapprocher.

L5, écrit le 7 octobre 2026 en deux lots, **sans IA, sans migration, sans dépendance** : la
politique du lot L4 ouvrait déjà aux comptes les opportunités vérifiées et expirées.

L5a, la consultation. La rubrique « Opportunités » (`/opportunites`) liste ce que les équipes
lisent du catalogue, avec la source et le jour de sa lecture ; chaque opportunité a sa fiche
(`/opportunites/[id]`), où ce que la source ne dit pas s'affiche « Information non fournie. ».
Filtres par type, pays éligible, type de projet, genre et état de la date limite, et recherche
dans le nom, l'organisme et la description. Trois choix :

- **La page filtre elle-même sur « vérifiée » et « expirée »** : la RLS le garantit aux
  comptes, mais un administrateur lit tout, et il y aurait vu une démonstration.
- **Un filtre ne retient que ce qui est précisé** : une liste de pays vide veut dire « la
  source ne le dit pas », pas « tous les pays ». L'écran le dit sous les filtres.
- **Aucune saisie ne part dans une requête** : les filtres s'appliquent aux lignes déjà lues,
  deux cents au plus, ce que la page annonce quand la borne est atteinte.

Dans le menu, la rubrique d'administration s'appelle désormais « Catalogue et veille » : un
administrateur aurait vu deux entrées « Opportunités ».

L5b, la compatibilité. L'onglet « Opportunités » d'un projet, ouvert à toute l'équipe,
compare le projet aux opportunités non expirées, par des règles écrites dans
`src/lib/compatibilite.ts` ; rien n'est stocké. Ce que le calcul fait, et ne fait pas :

- **Trois critères, ceux que le catalogue et le projet portent tous deux** : type de projet,
  pays, genre. Ni la durée, ni le stade, ni la thématique, ni la langue, ni les exigences ne
  sont jugés — le catalogue ne les porte pas dans un champ comparable —, et l'écran le dit.
- **Quatre états par critère** : rempli, non rempli, non précisé par l'opportunité, non
  renseigné dans le projet. Un critère que la source ne précise pas n'est jamais compté rempli.
- **Un décompte, pas une note** : « 2 critères remplis sur 3 évalués ; 1 critère non évalué »,
  sans pourcentage. L'écran dit que c'est une aide pour trier, pas une garantie d'éligibilité.
- **Le montant n'est pas un critère** : c'est celui de l'aide, pas une fourchette de budget
  éligible. La comparaison ne lit donc ni budget ni financement.
- **Pays** : un pays de production commun suffit ; l'écran rappelle qu'une opportunité peut
  entendre par là la nationalité ou la résidence de l'auteur.
- **Classement** : ce que rien ne contredit d'abord, puis le plus de critères remplis ; une
  opportunité sans précision passe avant une opportunité contredite.

Défaut trouvé au rendu réel, corrigé avant livraison : un squelette de chargement posé sur ces
routes faisait répondre 200, et non 404, à une fiche absente comme au projet d'autrui. Celui
de la liste vit désormais dans un groupe de routes qui ne couvre pas la fiche, la page du
projet n'en a pas, et un test refuse qu'on en repose un.

Vérifié en local par le rendu réel des pages sous trois sessions — membre, administratrice,
compte étranger — sur des opportunités fictives ; **pas au navigateur** : ni l'aspect, ni le
téléphone n'ont été vus. Hors lot : les cartes « opportunités recommandées » et « échéances »
du tableau de bord, et la création d'une candidature depuis une opportunité. La recette
demande au moins une opportunité « vérifiée » au catalogue de production, qui n'en compte
aucune : elle fera aussi celle de L4.

L5a et L5b sont en production depuis le 7 octobre 2026 (PR 129, `d06767c`, sans migration ; CI
de `main` verte, déploiement Vercel prêt sur ce commit). Vérifié depuis l'extérieur : un
visiteur est renvoyé à la connexion sur les trois routes, et aucune erreur d'exécution n'est
relevée chez Vercel dans l'heure. Les pages elles-mêmes n'ont pas été vues en production.

T1, écrit le 7 octobre 2026, **sans IA, sans migration, sans dépendance** : le tableau de bord
reçoit ce que le cahier des charges lui prévoyait et qui manquait. Tout se lit sous la RLS de
l'utilisateur ; rien n'est stocké.

- **Quatre chiffres**, chacun avec ce qu'il compte : projets portés ou partagés, documents de
  ces projets (brouillons compris), opportunités à étudier pour le projet mis en avant,
  échéances dans les trente jours. Au-delà de cent projets, le chiffre dit « 100 et plus ».
- **« Opportunités à étudier »**, et non « compatibles » : au moins un critère rempli, aucun
  contredit, d'après le calcul du lot L5b — il n'y en a pas de second. Les trois premières sont
  montrées avec leur décompte ; la règle est écrite sous le titre, sans pourcentage.
- **« Prochaines échéances »**, tous projets confondus, cinq au plus, en trois natures
  nommées : étape du planning, candidature de financement à préparer, date limite d'une
  opportunité à étudier. Une échéance passée n'y figure pas : le planning dit déjà le retard.
- **« Documents », et non « documents générés »** : la base ne distingue pas un document écrit
  à la main d'un document né d'une proposition.

Le cloisonnement du budget tient sans code propre : une candidature de financement ne remonte
qu'à qui gère le budget du projet, parce que la base ne rend ces lignes qu'à lui ; aucun
montant de candidature n'est lu. Vérifié au rendu réel : la porteuse lit quatre échéances dont
une candidature, un lecteur du même projet en lit deux et aucune candidature.

Vérifié en local par le rendu réel sous quatre sessions — porteuse, lecteur, compte sans
projet, administratrice — sur des données fictives ; **pas au navigateur** : ni l'aspect, ni
le téléphone n'ont été vus. La page étant servie en flux, le bloc des échéances arrive en
plusieurs fragments : un contrôle qui ne lirait que le premier se tromperait.

U1, écrit le 7 octobre 2026, **sans IA, sans migration, sans dépendance** : depuis l'onglet
« Opportunités » d'un projet, « Préparer une candidature » ouvre le formulaire des
financements, rempli d'après l'opportunité. Décision de l'utilisateur : pas de colonne de lien,
la candidature est une copie datée qui vit ensuite sa vie.

- **Un lien n'écrit rien** : il ouvre le formulaire livré, et c'est son envoi, par l'action et
  les contrôles existants, qui crée la candidature. L'action serveur n'a pas changé.
- **Ce qui se reprend** : l'organisme, le nom (dans « programme »), la date limite si elle est
  à venir, la devise si le budget la connaît, et la source avec son jour de lecture, en note.
- **Ce qui ne se reprend pas** : le montant demandé — celui d'une opportunité est celui de
  l'aide, montré en repère à côté du champ, qui reste vide — ; et le type, sauf pour une
  résidence ou une coproduction, qui ont leur équivalent exact. Pour le reste, le type se
  choisit : un « fonds » peut être public ou privé.
- **Même filtre que les écrans des équipes** : une démonstration, une opportunité non vérifiée
  ou expirée, un identifiant inconnu ou mal formé laissent le formulaire vide, sans erreur —
  y compris pour un administrateur.
- **Le bouton ne se montre qu'à qui gère le budget** ; un lecteur lit la comparaison sans lui,
  et la page des financements lui reste introuvable.

Limites assumées : sans lien conservé, rien n'empêche de préparer deux fois la même
candidature ; après un ajout, l'adresse garde l'opportunité et le formulaire se présente de
nouveau rempli — « Vider le formulaire » l'efface.

Vérifié en local par le rendu réel sous trois sessions — porteuse, lecteur, administratrice —
sur des opportunités fictives : champs repris, démonstration et expirée sans effet, aucune
candidature créée par la seule ouverture des liens. **Non exercé : l'envoi du formulaire
prérempli lui-même**, qui passe par l'action déjà livrée, et tout contrôle au navigateur.

T1 est en production depuis le 7 octobre 2026 (PR 130, `338c064`), U1 depuis le même jour
(PR 131, `748da04`), tous deux sans migration ; CI de `main` verte, déploiement Vercel prêt sur
ce dernier commit, servi par l'adresse de production. Le worker n'est pas redéployé : il n'a
pas changé.

**Recette du 7 octobre 2026 : L4, L5a et U1.** Un administrateur a mené en production, de
l'administration à la candidature, le chemin que ces lots forment ensemble (mode privé actif),
sur le projet « une maison hantée ». Les faits ci-dessous sont relus en base et dans les
journaux de la passerelle Supabase ; **un seul écran a été vu, par une capture**, celle de la
rubrique vide.

- **Avant** : le catalogue compte une opportunité, non vérifiée, entrée le matin par la veille.
  La rubrique « Opportunités » affiche « Aucune opportunité vérifiée n'est encore au
  catalogue. […] » (capture de l'utilisateur, à 12h25 UTC) : un administrateur n'y lit pas ce
  que les comptes ne liraient pas.
- **Passage à « vérifiée »**, à 12h34 UTC, depuis « Catalogue et veille » : une seule écriture
  sur le catalogue, acceptée ; l'opportunité porte son adresse de source, sa date de collecte
  et son extrait — 1 999 caractères pour 2 000 admis —, et la ligne du journal
  d'administration est de la même transaction. Message lu par l'utilisateur : « « IBF
  Classic » est enregistrée. ». **C'est la garantie centrale du lot L4, exercée pour la
  première fois à l'écran.**
- **Consultation** : rubrique, onglet « Opportunités » du projet et page des financements lus
  ensuite sans erreur ; le droit de gérer le budget a répondu, et le lien « Préparer une
  candidature » a mené au formulaire.
- **Un lien n'écrit rien** : la page des financements a été ouverte une première fois depuis
  l'opportunité, à 12h50 UTC, sans qu'aucune écriture n'arrive à la base ; aucune candidature
  n'existait alors.
- **Candidature créée à 12h56 UTC**, par l'envoi du formulaire : une seule écriture, acceptée.
  Elle porte l'organisme et le nom de l'opportunité, et en note « Reprise du catalogue des
  opportunités. », suivie de la source et de son jour de lecture. **Le montant demandé et le
  type sont ceux que l'utilisateur a saisis** : pour un fonds, le formulaire ne propose aucun
  type et oblige à choisir. Sans date limite ni devise au catalogue, aucune n'a été reprise.
  Statut « à préparer » ; l'autre candidature du projet n'a pas bougé ; rien au journal
  d'administration, l'administrateur agissant dans un projet.
- Aucune erreur d'exécution chez Vercel sur la période.

Relevé pendant cette recette : le bouton « Préparer une candidature » n'existe que dans
l'onglet du projet. L'utilisateur l'a d'abord cherché dans la rubrique et sur la fiche de
l'opportunité, qui ne le portent pas — une opportunité s'y lit sans projet. Laissé en l'état.

**L5b et T1 restent « en production », sans être dits validés en recette.** L'opportunité
vérifiée ne dit ni ses types de projet, ni ses pays, ni ses genres, ni sa date limite : la
veille ne remplit pas ces champs, et personne ne les a saisis. Les trois critères sont donc
« non précisé », aucun n'a été comparé à un projet, et rien ne peut remonter dans
« Opportunités à étudier » ni dans les échéances du tableau de bord. L'onglet et le tableau de
bord ont été chargés sans erreur ; ce qu'ils calculent n'a pas été exercé. Il suffira de
compléter cette opportunité d'après sa source, puis de relire les deux écrans.

Non couvert par cette recette : pour L4, le refus d'un doublon, la saisie des critères et une
date limite passée ; pour L5a, les filtres et la recherche, faute de plusieurs opportunités, et
la fiche d'une opportunité aux champs remplis ; pour U1, le type repris d'une résidence ou
d'une coproduction, la devise et la date limite reprises, « Vider le formulaire » ; pour tous,
l'aspect des pages et le téléphone, et un éditeur ou un lecteur réel, faute de second compte
tant que le mode privé est actif (vérifiés localement et par les tests).

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

Administration des comptes, décidée le 7 octobre 2026 (lot V) : le sujet se coupe en V1 —
consulter les comptes et changer un rôle — et V2 — suspendre un compte —, qui demande un audit
à part : beaucoup d'actions passent par des fonctions `security definer`, qu'une politique RLS
ne suffit pas à fermer. **V2 n'est ni cadré ni écrit.**

Lot V1, sans IA : une seule fonction de lecture, `comptes_administration()`, réservée aux
administrateurs, rend ce que `profiles` ne porte pas — l'adresse, sa confirmation, la date de
création, la dernière connexion — avec l'essentiel du profil ; cent comptes au plus par appel,
et un texte cherché qui n'est jamais lu comme un motif. Aucune table nouvelle. Le changement
de rôle reste celui de `definir_role()`, livrée et journalisée depuis le premier jour : l'écran
n'écrit le rôle par aucun autre chemin, et l'adresse qu'elle demande est relue en base, jamais
reçue du navigateur. Écran : rubrique « Utilisateurs » (`/administration/utilisateurs`), liste
par cinquante, recherche par adresse ou par nom, fiche d'un compte (compte, profil, studio
personnel et plan, projets portés, rôle). Un rôle se change en deux clics, le premier disant ce
qu'il ouvre ou retire.

V1 est validé localement le 7 octobre 2026 : 18 tests SQL et 17 tests de l'API de plus, quinze
sabotages attrapés un par un — le quinzième avait d'abord échappé : retirer le contrôle du rôle
de la fiche ne faisait tomber aucun test, celui de l'architecture se contentant d'un
`notFound()` quelque part dans la page ; un test du lot le vérifie désormais. Rendu réel
contrôlé sur un serveur de production local, 29 points sur 29 sous quatre situations — visiteur,
membre, administrateur, mode privé —, et l'action de changement de rôle rejouée telle que le
navigateur l'envoie, 14 points sur 14 : appel forgé par un membre, saisies refusées, gel du mode
privé, promotion puis retour, chacun relu en base et au journal. **Aucun contrôle au
navigateur** : ni l'aspect des pages, ni le téléphone, ni les deux clics eux-mêmes.

**La recette en production ne pourra porter que sur la consultation.** Le mode privé gèle les
rôles pour tous, administrateurs compris : tant qu'il est actif, la fiche le dit et ne propose
aucun changement. Le changement de rôle ne sera éprouvé en conditions réelles qu'à sa levée.

V1 est en production depuis le 7 octobre 2026 (PR 133, `3be3247`, 56 migrations ; migration
poussée après la fusion, CI de `main` verte, déploiement Vercel terminé, worker non redéployé).
Relu en base : la fonction y est `security definer`, stable, refusée à un visiteur et au
worker ; un appel sans session est refusé (42501) ; sous la session simulée d'un
administrateur, elle rend les deux comptes de la production. **Le refus opposé à un simple
membre n'y a pas été éprouvé** : la production ne compte que ses deux administrateurs.

**Recette du 7 octobre 2026 : la consultation.** Un administrateur a ouvert la rubrique et la
fiche d'un compte en production (mode privé actif), de 15h45 à 15h52 UTC : cinq lectures de
`comptes_administration()` et deux de `mode_prive()`, toutes réussies, relevées aux journaux de
Supabase. Il déclare avoir vu les quatre sections de la fiche — compte, profil, rôle, projets
portés —, sans capture. Aucun appel à `definir_role()` : aucun rôle n'a changé.

**V1 reste « en production », sans être dit validé en recette.** Le changement de rôle, moitié
du lot, est gelé par le mode privé et ne s'éprouvera en réel qu'à sa levée. Non couvert non
plus : la recherche et la pagination, faute de comptes ; le message du gel des rôles, que la
fiche doit afficher à la place du bouton, non confirmé explicitement ; l'aspect des pages et le
téléphone.

Suspension d'un compte, décidée le 7 octobre 2026 (lot V2, découpé en V2a — base — et V2b —
écran) : un compte suspendu garde ses données et peut encore se connecter, mais ne lit ni
n'écrit plus rien ; le rétablir lui rend tout. L'état vit dans une table à part
(`account_suspensions`, une ligne par compte suspendu), et non dans `profiles`, que chaque
compte modifie. Le motif est obligatoire, lisible des seuls administrateurs, et entre au
journal. Le mode privé ne gèle pas la suspension.

**Pourquoi pas une politique de plus par table** : trente-quatre fonctions `security definer`
sont appelables par un compte, et la RLS ne les ferme pas. La suspension se joue en trois
endroits, un par chemin d'accès : l'API, par une fonction que PostgREST appelle avant chaque
requête (`pgrst.db_pre_request`, `controle_avant_requete()`, refus sous le code `CS001`) ; le
stockage, que ce contrôle ne couvre pas, par une politique restrictive sur `storage.objects` ;
le worker, par `peut_engager_unites_pour()`, déjà consultée à la réclamation d'une tâche.
Garde-fous : un administrateur ne se suspend pas et ne peut pas être suspendu, et un compte
suspendu ne devient pas administrateur — l'administration ne peut pas se fermer la porte.

Ce que la suspension ne fait pas : elle ne ferme pas la session chez Supabase Auth, elle
n'interrompt pas une tâche déjà en cours, et un lien signé déjà émis vers un fichier reste
valable jusqu'à son expiration.

V2a est validé localement le 7 octobre 2026 : 24 tests SQL et 12 tests de l'API de plus,
dix-sept sabotages attrapés un par un, dont le retrait du réglage `db_pre_request` lui-même.
**Un défaut a été attrapé en écrivant le lot** : dans sa première forme, le contrôle refusait
tout visiteur — PostgreSQL vérifie le droit d'exécuter une fonction dès qu'il prépare
l'expression qui la nomme, même si elle n'est jamais évaluée —, et la vitrine serait tombée
avec lui. Corrigé avant tout commit ; un test de l'API et un test SQL le tiennent.

**V2a n'a pas d'écran** : la suspension ne se fait que par l'API, sous une session
d'administrateur. Un compte suspendu voit aujourd'hui les pages de l'application échouer, sans
message qui le lui dise : c'est l'objet de V2b. **En production, il n'y a personne à
suspendre** — deux comptes, tous deux administrateurs : la recette attendra la levée du mode
privé. Retour d'urgence du contrôle de l'API : `docs/mode-prive.md`.

V2a est fusionné depuis le 7 octobre 2026 (PR 135, `4e166e4`), CI verte sur une base neuve :
le réglage `db_pre_request` s'y applique, et toute la suite passe avec lui. **Sa migration
n'est pas poussée en production** : elle le sera avec V2b, pour qu'un compte suspendu lise un
message et non des pages en erreur.

Lot V2b, sans migration : la fiche d'un compte porte une section « Suspension » — le motif,
puis une confirmation qui dit ce que la suspension retire ; une fois le compte suspendu, son
état, son auteur, son motif et le bouton qui le rétablit. La liste étiquette les comptes
suspendus. Un compte suspendu n'y reçoit plus la proposition du rôle d'administrateur, et
l'écran dit pourquoi un administrateur ne se suspend pas. Les actions n'écrivent que le compte
et le motif : l'auteur et la date restent ceux de la base.

Pour le compte suspendu : le middleware interroge `compte_suspendu()` sur chaque page
protégée, et le renvoie à « Compte suspendu » (`/compte-suspendu`) dès que la base répond par
le code `CS001` ; une action postée reçoit un refus 403. La page dit la suspension et que les
données sont conservées, **jamais le motif**, et ne lit rien en base. **C'est une requête de
plus par page protégée, pour tous les comptes** : le prix d'une suspension qui prend effet à la
page suivante, sans attendre l'expiration d'un jeton. Tout autre échec de cet appel laisse
passer — la base reste le verrou. `exigerAcces` n'a pas reçu de contrôle de plus : le
middleware refuse déjà toute action postée, et la base toute requête.

V2b est validé localement le 7 octobre 2026 : 13 tests de plus, treize sabotages attrapés un
par un — le treizième avait d'abord échappé : le test du code de suspension lisait toute la
migration, qui lève d'autres codes ailleurs ; il lit désormais le contrôle lui-même. Rendu réel
et actions rejoués sur un serveur de production local, 37 points sur 37 : refus, suspension,
ce que voit l'administration, ce que voit le compte suspendu sur quatre pages, vitrine servie
à un visiteur comme au compte suspendu, rétablissement. **Aucun contrôle au navigateur** : ni
l'aspect, ni le téléphone, ni les clics eux-mêmes.

V2a et V2b sont en production depuis le 7 octobre 2026 : V2b fusionné à 18h22 UTC (PR 136,
`89e7c17`, sans migration), puis la migration de V2a poussée à 18h27 UTC (57 migrations),
déploiement Vercel terminé, worker non redéployé. Entre les deux, cinq minutes pendant
lesquelles la section « Suspension » ne pouvait rien enregistrer ; rien d'autre n'était touché.

Relu en production aussitôt après la poussée, le contrôle s'exécutant désormais pour chaque
requête : le réglage `pgrst.db_pre_request` est posé sur `authenticator` — l'hébergement
l'accepte, ce qui n'avait pas pu être éprouvé avant — ; **un visiteur lit toujours les plans et
leurs versions par l'API**, à travers le contrôle ; il ne lit aucun projet et se voit refuser
`compte_suspendu()` ; sous leurs sessions simulées, les deux administrateurs passent le
contrôle ; la politique du stockage et les quatre politiques de la table sont en place ; aucune
erreur serveur aux journaux de l'API ; la vitrine, la connexion et la page « Compte suspendu »
répondent.

**V2a et V2b restent « en production », sans être dits validés en recette.** La production ne
compte que ses deux administrateurs, qui ne peuvent pas être suspendus : aucune suspension n'y
a eu lieu, et aucune ne pourra y être éprouvée avant la levée du mode privé. Le coût de la
requête de plus que le middleware fait sur chaque page protégée n'a pas été mesuré.

Alertes internes, décidées le 7 octobre 2026 (lot W1, sans IA, sans migration) : une alerte
est **calculée à la lecture et jamais stockée**, comme le score de maturité et la
compatibilité. Elle existe tant que sa cause existe et disparaît quand on l'a traitée : il n'y
a donc ni « lu », ni « non lu », ni historique. Cinq natures, de la plus pressante à la moins
pressante : étape en retard ; dossier incomplet — une candidature « à préparer » dont la date
limite tombe dans les 30 jours, sans pièce jointe ou avec une pièce qui n'est pas finalisée ;
candidature à déposer — pièces finalisées, date limite dans les 14 jours ; opportunité à
étudier bientôt close, dans les 14 jours ; étape à venir, dans les 7 jours. **Ces délais sont
un choix du lot, pas une norme : l'écran le dit.** Une candidature ne donne jamais deux
alertes, et une date limite passée n'alerte plus.

Écartés de ce lot : l'e-mail, qui demande de choisir un service d'envoi ; un compteur dans la
barre latérale, que la coque ne recalcule pas à chaque navigation et qui serait donc périmé ;
l'alerte « nouvelle opportunité », la base ne gardant pas la date à laquelle une opportunité
est devenue visible.

Écran : rubrique « Alertes » (`/alertes`), groupée par projet, chaque ligne menant à la page
où elle se traite, avec le principe et les cinq règles dits en clair ; bloc « À traiter » en
tête du tableau de bord, les trois plus pressantes et le total, absent quand il n'y a rien.
Règles dans `src/lib/alertes.ts`, lecture dans `alertes/lecture.ts`, bornée — cent projets,
cent lignes par nature — et sous la RLS de l'utilisateur : une candidature n'alerte que qui
gère le budget, son montant n'est pas lu, et le catalogue ne rend jamais une démonstration.
« À étudier » est la règle du lot L5b, pas une seconde.

W1 est validé localement le 7 octobre 2026 : 25 tests de plus, vingt et un sabotages attrapés
un par un. Rendu réel sur un serveur de production local, 22 points sur 22 sous cinq sessions —
porteuse, éditeur, lecteur, compte sans projet, administratrice : six alertes pour la porteuse
et l'éditeur, trois pour le lecteur, sans aucun nom de financeur ; aucune pour un projet
d'autrui ; et quatre une fois trois causes traitées. **Aucun contrôle au navigateur** : ni
l'aspect, ni le téléphone. Le tableau de bord relit étapes et candidatures une seconde fois
pour ce bloc : le lot T1 n'a pas été réécrit.

W1 est en production depuis le 7 octobre 2026 (PR 138, `ae62b76`, sans migration ;
déploiement Vercel terminé, un visiteur renvoyé à la connexion depuis `/alertes`, worker non
redéployé).

**Recette du 7 octobre 2026 : l'état vide seulement.** Un administrateur a ouvert la rubrique
et le tableau de bord en production (mode privé actif), de 19h13 à 19h16 UTC : trois lectures
des étapes bornées par le délai des alertes, huit des candidatures et cinq de leurs pièces,
toutes réussies, relevées aux journaux de Supabase. La rubrique lui a répondu, mot pour mot :
« Aucune alerte : aucune étape en retard ni à venir, aucune candidature à déposer, aucune
opportunité à étudier bientôt close. » C'est exact : relue en base, la production n'a aucune
cause d'alerte — ni étape datée non terminée dans le délai, ni candidature « à préparer »,
ni opportunité dont la date limite approche.

**W1 reste « en production », sans être dit validé en recette.** Aucune alerte n'a été vue en
conditions réelles, donc ni le bloc « À traiter », qui ne s'affiche que s'il y en a une, ni la
disparition d'une alerte une fois sa cause traitée. Non couverts non plus : un éditeur ou un
lecteur réel, faute de second compte tant que le mode privé est actif (vérifiés localement) ;
l'aspect des pages et le téléphone. Il suffira d'une étape du planning dont l'échéance est
passée pour éprouver le reste.

**Mesuré pendant cette recette : le coût du contrôle de suspension (lot V2b).** En moins de
quatre minutes de navigation d'un seul compte, `compte_suspendu()` a été appelée 151 fois. Le
middleware l'interroge à chaque requête vers une page protégée, et Next précharge les pages
vers lesquelles pointent les liens affichés : chaque préchargement compte. Aucune erreur, mais
c'est une charge à réduire avant l'ouverture. Non corrigé dans ce lot.

**Coût du contrôle de suspension : décision du 7 octobre 2026.** Rien n'est changé pour
l'instant. À deux comptes en production, 153 appels légers en quatre minutes ne pèsent pas, et
aucune erreur ni lenteur n'a été constatée. **La correction se fera quand la plateforme
comptera plus de cinq utilisateurs**, et sa forme est arrêtée : le middleware garde en
mémoire, trente secondes et par compte, la réponse « non suspendu ». Seule cette réponse est
gardée — une suspension constatée ne l'est jamais. Contrepartie acceptée : un compte suspendu
pendant qu'il navigue peut mettre jusqu'à trente secondes à être renvoyé vers « Compte
suspendu », en voyant des pages en erreur mais aucune donnée, la base refusant tout aussitôt.
Limite connue : cette mémoire est propre à chaque instance du serveur, et le gain réel ne se
mesurera qu'en production.

**Une piste essayée et abandonnée, à ne pas reprendre** : ne pas interroger la base pour un
préchargement, en lisant l'en-tête `next-router-prefetch`. Elle ne peut pas marcher — Next
retire ses en-têtes internes de la requête avant d'appeler le middleware
(`server/web/adapter.js`, Next 16.3.6), qui ne voit donc jamais celui-là. Les tests de lecture
du code passaient : ils vérifiaient que la condition était écrite, pas qu'elle servait. C'est
le compte des appels reçus par la base locale, requête par requête, qui l'a montré — un appel
par préchargement, comme avant. Écartée aussi : sortir les préchargements du middleware par
son `matcher`. La session s'y rafraîchit ; un préchargement tombant sur un jeton expiré le
ferait renouveler là où le nouveau jeton ne peut pas être enregistré.

Livrables d'écriture manquants, décidés le 7 octobre 2026 (lot X) : le sujet se coupe en X1 —
trois textes sur le chemin de WEAVER — et X2 — les personnages, qui sont une liste en base et
demandent le modèle des propositions structurées. X2 est décrit après X1, ci-dessous.

Lot X1 : la note de réalisation, le pitch développé et le pitch oral suivent le chemin de la
note d'intention — devis, réservation, tâche, worker, proposition, acceptation —, et
atterrissent chacun dans un document versionné, créé en brouillon. « Pitch » désigne déjà la
logline à l'écran : ces deux-là s'appellent **pitch développé** — le projet en une page, pour
un dossier — et **pitch oral** — un texte à dire, trois minutes environ. La durée d'un pitch
oral n'est pas mesurée : l'écran dit que c'est une estimation, à vérifier à voix haute.

Prix décidés avec l'utilisateur : 3 unités pour la note de réalisation, 2 pour chaque pitch,
modifiables depuis « Plans et quotas ». Bornes : 20 000 caractères pour la note, 6 000 pour un
pitch. Profils `weaver.note_realisation@1`, `weaver.pitch_developpe@1` et
`weaver.pitch_oral@1`, visant 6 000, 2 500 et 2 700 caractères.

**Chaque livrable a son type de document** — `note_realisation`, `pitch_developpe`,
`pitch_oral`. L'acceptation réécrit le document le plus récemment modifié de son type : deux
livrables qui en partageraient un s'écraseraient l'un l'autre. Ces trois valeurs d'énumération
ne se retirent pas. La migration reprend d'un coup `creer_devis`, `contexte_redaction`,
`livrer_proposition` et `accepter_proposition`, telles qu'elles étaient, avec trois cas de
plus ; elle n'ouvre ni table, ni politique, ni droit au worker.

X1 est validé localement le 7 octobre 2026, **sans aucun appel payant** : 15 tests SQL et 14
tests de l'API de plus, avec un fournisseur factice, de la demande au document versionné ;
vingt sabotages attrapés un par un — le vingtième avait d'abord échappé : relever en base la
borne du dépôt d'un pitch ne faisait tomber aucun test, le worker refusant déjà un texte trop
long avant de le déposer ; un test SQL lit désormais les bornes dans les fonctions en place.
Rendu réel sur un serveur de production local, 13 points sur 13 : les trois encarts pour la
porteuse et aucun pour un lecteur, le document que chacun remplacerait, les trois prix au
barème de l'administration et sur la vitrine.

Une vingtaine de tests existants énuméraient les prix du barème ou les actions, et ont été
complétés. Sept tests d'architecture relisaient la migration d'un lot antérieur en y cherchant
tous les livrables actuels : ils ignorent désormais ceux nés après elle, et le bloc qui lit
l'état courant pointe sur la migration du lot X1.

X1 est en production depuis le 7 octobre 2026 : code fusionné à 20h58 UTC (PR 141,
`7358085`), worker redémarré à 21h05 UTC — 24 actions annoncées, dont `direction_note`,
`pitch_extended` et `pitch_oral` —, puis migration poussée vers 21h15 UTC (58 migrations).
Relu en base après la poussée : les trois prix au barème (3, 2 et 2), leurs valeurs par défaut
retirées, les droits par colonne — lecture aux visiteurs, lecture et insertion aux comptes —,
les trois types de document, la contrainte des devis, et les quatre fonctions à jour, aucune
ouverte aux visiteurs. La vitrine affiche « 3 pour une note de réalisation, 2 pour un pitch
développé ou oral ». Pendant le quart d'heure entre la fusion et la poussée, le code était en
avance sur la base ; ce que la vitrine et l'écran montraient alors n'a pas été observé.

**Non vérifié en production** : l'écran sous session, et tout appel réel — aucun devis, aucune
tâche, aucune proposition de ces trois actions n'y existe.

X1 est validé en recette le 7 octobre 2026 : voir « Recette du lot X », plus haut.

Lot X2 : ARC propose les personnages qui manquent à un projet (action `character_list`, profil
`arc.personnages@1`, table `ai_suggestion_characters`). Cinquième livrable structuré, sur le
modèle du budget, du planning, du découpage et du matériel : une proposition parente, ses
lignes dans une table fille, acceptées ou écartées une à une. Cadré et approuvé le 7 octobre
2026 : 3 unités, douze personnages au plus par proposition, écran dans l'étape « Personnages »
de l'assistant.

ARC lit le projet, son concept, sa vision et les personnages déjà saisis ; ni scénario, ni
document, ni budget. **Il ne propose que des personnages à ajouter** : aucun chemin ne réécrit
un personnage existant, et un personnage accepté prend la dernière place. Ses consignes lui
interdisent, pour un documentaire, d'écrire sur une personne réelle ce que le dossier ne dit
pas.

Cinquante personnages par projet : l'écran tenait seul cette borne. La base la tient désormais
à l'acceptation, sous le verrou du projet — deux propositions du même projet se décident sous
des verrous distincts —, et refuse un devis quand la liste est déjà pleine, avant toute
dépense. La saisie à la main reste bornée par l'écran seul, comme avant.

Trois écarts au plan présenté :

- un lecteur ne voit pas les personnages proposés. La base le lui permet, comme pour le
  matériel ; mais l'assistant de création n'existe que pour le porteur et les éditeurs, et
  l'encart y vit. Un administrateur hors équipe ne le voit pas non plus à l'écran ;
- un personnage proposé qui porte le nom d'un personnage déjà saisi n'est pas refusé : l'écran
  le signale et laisse l'équipe décider. Seul un nom rendu deux fois dans la même réponse est
  dédoublonné, par le worker ;
- `src/lib/fiche.ts` a été touché, hors liste, pour un commentaire devenu faux.

X2a et X2b sont validés localement le 7 octobre 2026, **sans aucun appel payant** : 13 tests
SQL, 15 tests de l'API avec un fournisseur factice, 8 tests d'architecture et 18 tests d'écran
de plus ; suites complètes à 772 tests SQL et 1 285 tests de l'API. Trente-deux sabotages
attrapés un par un — le dixième avait d'abord échappé : retirer en base le contrôle du rôle au
dépôt ne faisait tomber aucun test, le worker écartant déjà un rôle inconnu avant de déposer ;
un test SQL lit désormais ce contrôle, et les bornes du dépôt, dans les fonctions en place.
Rendu réel sur un serveur de production local, 31 points sur 31 sous six situations —
porteuse, éditeur, lecteur, étranger, administrateur hors équipe, visiteur : l'encart et ses
trois états, un balisage venu du modèle affiché comme du texte, l'homonyme signalé, le
personnage accepté à la fin de l'onglet « Fiche », le prix sur la vitrine et au barème de
l'administration.

**Non couvert** : les boutons eux-mêmes. Le rendu a lu les pages et décidé par les fonctions de
la base ; aucun clic n'a été joué dans un navigateur, ni la correction d'un personnage, ni
« Tout accepter », ni l'affichage à 375 px.

Treize fichiers de tests existants énuméraient les prix du barème, les fonctions du worker ou les actions
servies, et ont été complétés. Le bloc d'architecture qui lit l'état courant des devis pointe
sur la migration du lot X2a ; contexte et propositions de texte restent ceux du lot X1.

X2a et X2b sont en production depuis le 7 octobre 2026 : code fusionné à 22h26 UTC (PR 143,
`ba0ddf7`), migration poussée vers 22h28 UTC (59 migrations), worker redémarré à 22h33 UTC —
25 actions annoncées, dont `character_list`. Relu en base après la poussée : le prix au barème
(3) et son défaut retiré, les droits de la colonne, la contrainte des devis, la table — RLS
active, sa politique de lecture et la politique restrictive du mode privé, ses deux
déclencheurs, lisible des comptes sans qu'ils y écrivent, fermée aux visiteurs et au worker —,
les sept fonctions et leurs droits, la borne de cinquante dans le devis, et l'écartement d'un
bloc étendu aux huit tables filles.

Comme prévu, la vitrine a montré son repli entre la fusion et la poussée : relue à 22h28 UTC,
elle expliquait l'unité texte sans aucun chiffre du barème ; à 22h34 UTC, elle affichait
« 3 pour une liste de personnages ». Elle se régénère toutes les cinq minutes.

**Non vérifié en production** : l'écran sous session, et tout appel réel — la table des
personnages proposés est vide.

X2a et X2b sont validés en recette le 7 octobre 2026, avec des réserves : voir « Recette du
lot X », plus haut.

Lot Y1 : le plafond mensuel des dépenses d'IA a son écran, décidé le 8 octobre 2026. Le
plafond existait depuis le lot I1 (`ai_settings`, 5 $ à la mise en service), journalisé à
chaque changement, mais ne se lisait ni ne se changeait qu'en SQL. La recette du lot X l'a
montré : à 4,72 $ dépensés sur 5 $, la prochaine rédaction était refusée, et rien à l'écran ne
le disait à l'administration.

La section « Plafond mensuel des dépenses » ouvre **Administration → Intégrations IA** : la
dépense du mois, le plafond, ce qui reste, le jour de la remise à zéro — le mois se compte en
UTC —, et un formulaire pour changer le plafond. Elle prévient quand il reste moins de 1 $, et
quand le plafond est atteint. Elle dit aussi ce que ce plafond n'est pas : le crédit d'un compte
chez son fournisseur se gère à part.

La migration ne pose qu'une fonction, `depense_ia_administration()`, réservée aux
administrateurs : elle rend la dépense du mois et le plafond, et rien d'autre.
`depense_ia_du_mois()`, que le worker appelle avant chaque appel, reste fermée aux comptes ; la
nouvelle fonction en rend le résultat, pour qu'il n'existe qu'un calcul. L'écriture passe par
la politique déjà en place, sous la RLS, et par son déclencheur de journal : ni table, ni
politique, ni droit du worker ne changent.

**La saisie est bornée à 50 $**, choix de l'utilisateur : un garde-fou de l'écran contre une
faute de frappe, pas une contrainte de la base. Conséquence assumée : si la dépense d'un mois
dépasse 50 $, l'écran ne peut plus fixer un plafond qui rouvre les demandes ; la voie SQL de
`docs/worker.md` le peut. La dépense affichée est arrondie au centime supérieur, pour ne pas
montrer un reste que le worker, qui compte au micro-dollar, n'a déjà plus.

Y1 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : 11 tests SQL et
19 tests de l'API de plus ; suites complètes à 783 tests SQL et 1 304 tests de l'API.
Vingt-cinq sabotages attrapés un par un, après deux retouches. Le premier échappé : relâcher la
politique d'écriture du plafond ne changeait rien depuis l'API, un compte ordinaire ne lisant
pas la ligne qu'il aurait dû modifier ; un test SQL lit désormais les politiques au catalogue.
Le second n'était pas une faille — déplacer le contrôle de la saisie après la garde rejette
toujours une saisie invalide avant toute écriture — et a été remplacé par le retrait du
contrôle, qui tombe. Rendu réel sur un serveur de production local, 19 points sur 19, sous
trois sessions — administrateur, compte ordinaire, visiteur : les trois états de la section,
le journal après un changement, la page introuvable pour qui n'est pas administrateur.

**Non couvert** : le formulaire n'a pas été envoyé depuis un navigateur — le changement a été
fait par la requête que l'action envoie, sous la session d'un administrateur —, ni l'affichage
à 375 px. Le lot lui-même n'a pas touché au plafond de production.

Y1 est en production et validé en recette le 8 octobre 2026 : voir « Recette du lot Y1 », plus
haut. Le plafond de production, que le lot n'avait pas touché, a été porté de 5 $ à 50 $ par
l'utilisateur, depuis l'écran.

Administration prévue et alertes non livrées, cadrées le 8 octobre 2026 en cinq lots : Z1 —
coûts de l'IA —, Z2 — studios et abonnements —, Z3 — statistiques d'usage —, W2 — alerte
« nouvelle opportunité » —, W3 — alertes par e-mail. **L'utilisateur en retient trois : Z1, Z3
et W2.** Z2 et W3 sont écartés, sans date : W3 demande de choisir un service d'envoi, ce qui
n'a pas été fait ; Z2 ne pouvait être qu'une vue de lecture, les abonnements payants n'ayant
ni prestataire ni décision.

Lot Z1 : la rubrique « Coûts de l'IA » (`/administration/couts`) montre ce que les appels aux
fournisseurs ont coûté sur douze mois, par agent, par profil et par modèle. Le mois courant se
lit face au plafond, avec le chemin pour le changer ; les mois précédents se déplient. Chaque
ligne dit ses appels, son volume — des jetons pour un modèle, des requêtes pour une recherche —
et son montant compté. L'écran dit en clair ce qui empêche de lire un montant comme acquis :
appels sans issue connue, comptés à leur réserve ; appels au tarif inconnu, à rapprocher de la
facture ; appels servis par un modèle de repli ; appels refusés par le fournisseur, sans coût.
Il dit aussi que ces montants viennent des tarifs relevés à la main dans les profils, et que
seule la facture du fournisseur fait foi.

La migration ne pose qu'une fonction, `couts_ia_par_mois()`. **Elle s'exécute sous les droits
de l'appelant** : ce sont les politiques déjà en place sur les quatre registres de coûts qui
décident de ce qu'elle voit. Un administrateur lit tout ; un compte ordinaire reçoit une liste
vide ; un visiteur ne l'exécute pas. Aucun droit ne change, et rien ne sort par studio, par
projet ni par tâche. Le mois est celui du plafond — civil, en UTC — et la somme d'un mois égale
`depense_ia_du_mois()` : les deux écrans de l'administration disent le même total, un test le
tient. Profils et modèles vivent dans le code du worker, pas en base : l'écran montre ce qui a
été appelé, pas un catalogue.

Z1 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : 14 tests SQL et
18 tests de l'API de plus ; suites complètes à 797 tests SQL et 1 322 tests de l'API.
Vingt-cinq sabotages attrapés un par un, après deux tests renforcés : des montants additionnés
en flottants ne faisaient rien tomber, les valeurs d'essai étant exactes en binaire — une
valeur qui ne l'est pas est maintenant lue — ; et une rubrique poussée dans la navigation de
tous les comptes échappait à un test qui lisait trop large. Rendu réel sur un serveur de
production local, 19 points sur 19, sous trois sessions — administrateur, compte ordinaire,
visiteur —, chaque montant comparé à ce que la base rend.

**Non couvert** : les mois précédents dépliés — la base locale n'a d'appels qu'en octobre, le
rendu n'a vu que « Aucun appel enregistré avant ce mois » ; l'affichage à 375 px, où les
tableaux défilent horizontalement ; l'exactitude des tarifs eux-mêmes, que seule une facture
permet de juger.

**Reste à faire** : la livraison — PR, CI, fusion, puis la migration
`20261008030000_couts_ia.sql`. Entre la fusion et la poussée, la rubrique répond par une
erreur ; le reste de l'administration n'est pas touché. Puis une recette sans coût : ouvrir la
rubrique en production et comparer octobre aux appels connus.

Z1 est en production depuis le 8 octobre 2026 : PR 148 fusionnée à 01h36 UTC (`961081b`), CI
de `main` verte, migration poussée par l'utilisateur (61 migrations). Entre les deux, la
rubrique a répondu par une erreur pendant plus d'une heure : le fichier de migration du lot Z3,
présent sur le disque et pas encore fusionné, se serait poussé avec celui de Z1 ; il a fallu
attendre la fin des sabotages de Z3 pour le mettre de côté. **Une migration non fusionnée ne
doit pas se trouver dans le dépôt au moment d'une poussée.** Relu en base ensuite : la fonction
en place, sous les droits de l'appelant, fermée aux visiteurs et au worker ; le total d'octobre
qu'elle rend, 4,719414 $, est exactement celui que le plafond compte. Non vérifié : l'écran sous
session.

Ce que la rubrique montre dès sa première lecture : sur les 4,72 $ comptés en octobre, 2,43 $
sont des réserves, pas des dépenses — quatre tentatives de vignette du 6 octobre, refusées par
OpenAI par un 429 et jamais soldées. C'est le comportement voulu du worker pour un 429
ordinaire, qui peut survenir après un début de traitement ; le cas « compte sans crédits »,
reconnu depuis, se solde à zéro, mais ces quatre-là datent d'avant. Elles pèseront sur octobre
jusqu'à la fin du mois. Les solder à zéro serait une écriture en production, à ne faire que sur
demande et facture d'OpenAI à l'appui.

Lot Z3 : la rubrique « Statistiques » (`/administration/statistiques`) montre l'usage de la
plateforme en comptages : comptes et studios par plan ; projets par format et par étape, et ce
qu'ils contiennent ; documents par type et par statut ; demandes à l'assistant des trente
derniers jours, par livrable et par issue ; propositions par livrable et par décision ; exports
disponibles ; catalogue des opportunités par statut. **Ni nom, ni titre, ni contenu, ni
montant, et aucun taux ni pourcentage** : sur aussi peu de données, un pourcentage ferait croire
à une mesure. L'écran dit en tête que ces chiffres sont calculés à chaque lecture, et qu'avec
très peu de comptes un comptage peut désigner quelqu'un.

La migration ne pose qu'une fonction, `statistiques_usage()`, exécutée sous les droits de
l'appelant : elle n'ouvre rien aux administrateurs, qui lisent déjà ces tables. Elle refuse
nommément qui n'est pas administrateur — sans ce refus, un compte ordinaire compterait ses
propres projets, qui passeraient pour les chiffres de la plateforme. Un code que l'écran ne
connaît pas reste affiché tel quel, et un état inconnu garde sa colonne : aucun nombre ne
disparaît en silence.

**Limite connue** : la lecture passe par les politiques de chaque table. Sur la base locale —
16 000 projets, 27 000 comptes de test —, elle prend 3,8 secondes ; en production, avec trois
projets, elle est immédiate. Si le volume vient, le remède est de la passer en
`security definer`, son contrôle de l'administrateur suffisant alors à la garder.

Un écart au plan : `tests/architecture.test.mjs` a été touché. Un garde du lot L6 interdit de
nommer l'action de veille hors de l'administration ; le catalogue de libellés des statistiques
le déclenchait. Il admet désormais ce module, et vérifie en retour qu'il n'appelle rien et
qu'une seule page l'emploie, celle de l'administration.

Z3 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : 16 tests SQL et
16 tests de l'API de plus ; suite SQL complète à 813 tests. La suite complète de l'API a donné
1 337 tests verts sur 1 338, le seul échec étant le garde d'architecture ci-dessus, corrigé
puis relancé seul avec son fichier (131 sur 131) : la suite entière n'a pas été rejouée après
ce correctif, la CI de la PR le fera. Vingt-cinq sabotages attrapés un par un. Rendu réel sur
un serveur de production local, 22 points sur 22, sous trois sessions — administrateur,
porteuse, visiteur —, chaque nombre comparé à ce que la base rend.

**Non couvert** : l'affichage à 375 px, où les tableaux croisés défilent horizontalement ; un
état ou un code inconnu de l'écran, que seule une évolution de la base ferait apparaître.

**Reste à faire** : la livraison — PR, CI, fusion, puis la migration
`20261008050000_statistiques_usage.sql`. Entre la fusion et la poussée, la rubrique répond par
une erreur. Puis une recette sans coût : ouvrir la rubrique en production.

Z3 est en production depuis le 8 octobre 2026 : PR 149 fusionnée à 08h47 UTC (`12658f1`), CI
de `main` verte — la suite entière de l'API y est repassée avec le garde d'architecture
corrigé —, migration poussée par l'utilisateur (62 migrations), seule sur le disque cette fois.
Relu en base : la fonction en place, sous les droits de l'appelant, fermée aux visiteurs et au
worker. Exécutée sous la session simulée d'un administrateur, dans une transaction annulée,
elle rend les comptages de la production : 2 comptes, 3 projets, 13 documents, les demandes
des trente derniers jours et les propositions par livrable. Non vérifié : l'écran sous session.

Lot W2 : l'alerte « nouvelle opportunité », écartée du lot W1 parce que la base ne gardait pas
la date à laquelle une opportunité devient visible des comptes. `updated_at` ne la dit pas :
corriger une faute de frappe la changerait.

La migration ajoute `funding_opportunities.verified_at`, posée par la base et par elle seule,
à l'instant où le statut devient « vérifiée » — à la création comme à la modification, et de
nouveau si l'opportunité quitte ce statut puis y revient. La colonne n'est accordée ni en
insertion ni en modification, et le déclencheur écrase ce qu'une requête directe lui
remettrait. Corriger une opportunité vérifiée ne la redate pas. **Les opportunités vérifiées
avant le lot restent sans date** : on ne sait pas quand elles le sont devenues, et l'inventer
les ferait passer pour nouvelles. Aucune politique ne change.

La sixième nature d'alerte, la moins pressante : une opportunité à étudier pour un projet,
vérifiée depuis quatorze jours au plus, sans date limite ou à une date qui n'est pas passée.
Elle est calculée à la lecture comme les cinq autres ; rien n'est stocké, et la règle affichée
dit qu'elle n'est pas marquée comme lue et cesse d'être nouvelle passé ce délai. Une
opportunité ne donne qu'une alerte par projet : « bientôt close » l'emporte quand sa date
limite approche. La lecture fait une requête de plus, bornée, sur les seules opportunités
« vérifiées », et fusionne par identifiant avec celle des clôtures proches.

Un écart au plan : `src/app/(app)/alertes/page.tsx` a été touché, pour le style que la rubrique
porte par nature d'alerte.

W2 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : 14 tests SQL et
11 tests de l'API de plus ; suites complètes à 827 tests SQL et 1 349 tests de l'API. Vingt et
un sabotages attrapés un par un, après un test renforcé : alerter deux fois pour une
opportunité lue par les deux requêtes ne faisait rien tomber, le test vérifiant que la fusion
existait, pas qu'elle servait. Rendu réel sur un serveur de production local, 17 points sur
17, sous trois sessions — porteuse, autre compte, visiteur : deux nouveautés avec leur détail,
une opportunité bientôt close qui n'alerte qu'une fois, une opportunité vérifiée depuis vingt
jours qui se tait, une autre qui ne concerne pas le projet, le bloc « À traiter » du tableau de
bord, la fiche liée.

**Non couvert** : l'affichage à 375 px ; plus de deux cents opportunités vérifiées en quatorze
jours, borne de la lecture, que la rubrique signale alors comme les autres.

**Reste à faire** : la livraison. La migration `20261008100000_opportunite_verifiee_le.sql`
n'ajoute qu'une colonne et son déclencheur : elle se pousse **avant** la fusion, sans effet sur
le code en place. Dans l'ordre inverse, la lecture des alertes demanderait une colonne qui
n'existe pas encore, et la rubrique « Alertes » comme le bloc « À traiter » ne montreraient
plus les opportunités jusqu'à la poussée. Puis PR, CI, fusion, et une recette sans coût : faire
passer une opportunité à « vérifiée » en production, et lire l'alerte.

W2 est en production depuis le 8 octobre 2026, dans l'ordre retenu : migration poussée par
l'utilisateur d'abord (63 migrations), relue en base — la colonne, nulle par défaut, lisible
des comptes sans qu'ils la fournissent ni la modifient ; le déclencheur actif à côté des deux
du catalogue ; l'index ; les cinq politiques inchangées —, puis PR 150 fusionnée à 09h25 UTC
(`df02c0a`), CI de `main` verte. Aucune interruption : le code en place ignorait la colonne.
Sous la session simulée d'un administrateur, dans une transaction annulée, les deux lectures
des alertes s'exécutent ; elles ne rendent rien, comme attendu — aucune opportunité ne clôt
dans les quatorze jours, et les deux opportunités vérifiées du catalogue l'étaient avant le
lot, donc sans date.

**Non vérifié en production** : les trois écrans sous session — Coûts de l'IA, Statistiques,
Alertes — et l'alerte elle-même, qui demande qu'une opportunité devienne « vérifiée » après le
lot et soit à étudier pour un projet.

**Reste à faire, sans coût** : la recette des trois lots. Ouvrir Coûts de l'IA et
Statistiques ; faire passer une opportunité à « vérifiée » depuis « Catalogue et veille », puis
lire l'alerte dans la rubrique « Alertes » et dans le bloc « À traiter ».

Cadrage du 8 octobre 2026, après les lots Z et W. L'utilisateur arrête les recettes écran par
écran, et fixe l'échéance : **l'application reste fermée au grand public six mois, puis sera
déployée publiquement**, vers avril 2027. Cela ne change pas ce qu'il faut construire, mais
l'ordre : paiements, quotas et recette avant ouverture (lots N, O, P) attendront, les fonctions
du cahier des charges passent d'abord.

Un audit ciblé du cahier des charges contre le code, le même jour, relève neuf écarts.
Constatés dans le dépôt : l'éditeur de documents est une zone de texte brut — ni titres, ni
listes, ni gras, ni italique — ; il n'a pas de sauvegarde automatique, seulement un
avertissement avant de quitter ; une version se restaure mais ne se compare pas ; aucune action
de retouche — améliorer, raccourcir, développer, corriger — n'existe ; les séries n'ont que
leur bible, ni saison, ni épisodes, ni pilote ; les opportunités n'ont pas de filtre par
montant ni par langue ; la compatibilité compare trois critères sur les huit prévus ; les
studios n'ont aucun écran, ni invitations ni gestion des membres ; deux rubriques du menu
étaient annoncées « Bientôt » sans page. L'audit est une recherche ciblée, pas une relecture
ligne à ligne ; `PRD_MVP.md` et `LANDING_PAGE_SPEC.md` manquent toujours au dépôt.

Des deux rubriques annoncées : « Ressources » a reçu sa spécification, versionnée dans
`docs/product/Claude_Code_Ressources_FilmFund_Africa.md`, et fait l'objet du lot AA1.
« Assistant IA » était prévue comme le point d'accès commun aux onze agents ; les deux autres
principes de sa note — l'utilisateur garde la main, les calculs restent du code — sont tenus
partout, mais l'interface commune n'existe pas. Elle n'apporterait aucune capacité nouvelle,
seulement un endroit où voir ce que l'assistant sait faire : recommandée pour la préparation de
l'ouverture, **non décidée**. L'entrée du menu reste annoncée.

Ordre proposé pour la suite : éditeur, retouches par l'IA, opportunités, séries, studios.

Lot AA1 : la rubrique « Ressources », une bibliothèque de guides, de modèles, de checklists et
de références. La liste (`/ressources`) offre une recherche sur le titre et la description —
sans casse ni accents, tous les mots — et deux filtres, par catégorie et par type, dans un
formulaire en GET : les filtres tiennent dans l'adresse, rien ne part à chaque frappe. Chaque
ressource a sa page (`/ressources/[slug]`).

**Les contenus sont versionnés dans le dépôt** (`src/lib/ressources.ts`), sur le modèle des
pages légales : ni table, ni migration, ni stockage, ni back-office. Un contenu est fait de
blocs de texte — paragraphes, listes, points à vérifier — rendus comme du texte : aucune
syntaxe n'est interprétée. Les points à vérifier s'affichent en liste numérotée, pas en cases à
cocher : rien n'étant enregistré, une case cochée se perdrait. La rubrique ne génère rien,
n'appelle aucun fournisseur, et ne lit en base que le rôle de l'appelant.

**Cinq brouillons, aucun publié.** Rédigés pour la plateforme le 8 octobre 2026 — ils ne
figuraient pas dans la spécification — : comprendre et rédiger une logline ; structurer un
synopsis ; préparer une note d'intention ; vérifier les pièces d'un dossier de candidature ;
préparer une checklist de préproduction. Un brouillon ne se montre qu'à l'administration, sous
son étiquette, et son adresse est introuvable pour tout autre compte. **Un compte ordinaire
voit donc aujourd'hui une bibliothèque vide**, qui dit que les premiers guides sont en
relecture. Publier un contenu est une décision de l'utilisateur, prise après l'avoir lu.

Ce que le lot ne contient pas, par choix : aucune référence externe ni aucun modèle
téléchargeable — aucun lien ni fichier n'étant fourni, aucun n'est inventé — ; ni favoris, ni
notation, ni recommandation. La catégorie « Utilisation de filmfundAfrica » existe, sans
contenu encore.

Trois écarts au plan. Les pages de la liste sont rangées dans un groupe de routes `(liste)`,
comme celles des opportunités, pour que leur squelette de chargement ne couvre pas la page
d'une ressource, qui répondrait sinon 200 à une adresse inconnue. La spécification n'a pas été
copiée sous un nouveau nom : l'utilisateur l'avait déjà déposée dans `docs/product/`, elle y
est gardée sous le sien, seuls ses blancs ayant été remis en forme. Et
`src/lib/supabase/middleware.ts` a été touché : un garde d'architecture, tombé à la suite
complète, exige que chaque rubrique de l'espace connecté figure dans la liste des routes que
le middleware protège. `/ressources` n'y était pas. Les pages vérifiaient bien la session —
d'où un rendu réel sans défaut —, mais le middleware est seul à appliquer le mode privé et la
suspension avant d'atteindre la page, et à mémoriser la destination d'un visiteur renvoyé à la
connexion. La route y est maintenant.

AA1 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : 25 tests de
plus ; aucun test SQL, le lot ne touchant pas la base. La suite complète de l'API a donné
1 374 tests verts sur 1 375, le seul échec étant ce garde du middleware ; corrigé, puis
relancé avec son fichier et celui du lot (156 sur 156) — la suite entière n'a pas été rejouée
après ce correctif d'une ligne, la CI de la PR le fait. Trente et un sabotages attrapés un par
un, du premier coup. Rendu réel sur un serveur de production local, rejoué après le
correctif, 26 points sur 26, sous trois sessions — administrateur, compte ordinaire,
visiteur : les cinq brouillons et leur étiquette, la recherche et les filtres, la recherche
sans résultat, une adresse recopiée de travers, la page d'un guide, la bibliothèque vide d'un
compte ordinaire et la page introuvable d'un brouillon.

**Non couvert** : l'affichage à 375 px ; une référence externe réelle, aucune n'existant ; et
la justesse des cinq textes, qui ne se juge qu'à la lecture.

**Reste à faire** : la livraison — PR, CI, fusion, sans migration —, puis la relecture des cinq
brouillons par l'utilisateur, qui décidera lesquels publier.

AA1 est en production depuis le 8 octobre 2026 : PR 153 fusionnée à 13h02 UTC (`ad57c64`), CI
de `main` verte — la suite entière de l'API y est repassée avec le correctif du middleware —,
sans migration. Sans session, la rubrique comme la page d'un brouillon renvoient à la
connexion. Non vérifié : l'écran sous session. Les cinq brouillons attendent la relecture de
l'utilisateur ; aucun n'est publié.

Lot ED, l'éditeur de documents, premier écart relevé par l'audit. Il se découpe en trois : ED1,
comparer deux versions ; ED2, la mise en forme ; ED3, la sauvegarde automatique. Deux
décisions de l'utilisateur, le 8 octobre 2026, fixent les deux derniers :

- **la mise en forme se fera par marqueurs dans le texte** — `# Titre`, `- élément`,
  `**gras**`, `*italique*` —, pas par un éditeur riche. Le contenu d'un document reste une
  chaîne de texte : les exports, le contexte des agents, l'ajout d'une séquence au scénario et
  le repérage d'un passage pour les dialogues le lisent tel quel, et un format structuré les
  aurait tous obligés à changer ;
- **la sauvegarde automatique enregistrera un brouillon en cours, sans créer de version.** La
  base crée aujourd'hui une version à chaque changement du titre ou du texte : sauvegarder
  toutes les quelques secondes noierait l'historique. Une version naîtra du bouton
  « Enregistrer ».

Lot ED1 : une version se restaurait, mais ne se comparait pas. La page
`documents/[documentId]/comparaison?de=3&a=5` montre ce qui a changé entre deux versions,
**toujours de la plus ancienne à la plus récente**, d'où que l'on vienne : un ajout se lit
comme un ajout. Le calcul (`src/lib/comparaison.ts`, sans dépendance) compare ligne par ligne ;
autant de lignes retirées que de lignes ajoutées, à la suite, sont lues comme des lignes
récrites et comparées mot par mot, sauf si elles n'ont aucun mot en commun. Ce que deux textes
ont de commun au début et à la fin n'est pas calculé, si bien que deux longs textes qui
diffèrent d'un paragraphe se comparent sans peine ; au-delà d'une borne, la page dit que les
versions sont trop différentes pour être comparées ici.

La page dit le titre, changé ou non, puis un bilan en une phrase, puis le texte : les lignes
inchangées loin d'une modification sont repliées et comptées, trois restant de part et
d'autre. **Un changement ne tient jamais à la seule couleur** : un retrait est un élément
`del`, barré, précédé d'un « − » et annoncé « retiré » aux lecteurs d'écran ; un ajout, un
élément `ins`, souligné, précédé d'un « + » et annoncé « ajouté ». Le texte comparé s'affiche
comme du texte.

Deux accès : dans l'historique, « Comparer à la précédente » sur chaque version sauf la
première ; sur la page d'une version, « Comparer à la version actuelle », sauf si elle l'est.
La page ne fait que lire, sous la RLS des versions : toute l'équipe du projet y accède,
lecteurs compris ; elle n'écrit rien et n'offre aucune action. Une adresse mal formée, une
version absente ou un projet inaccessible donnent la même page introuvable.

ED1 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur ni migration :
23 tests de plus, suite complète de l'API à 1 398 tests. Trente sabotages attrapés un par un,
du premier coup. Rendu réel sur un serveur de production local, 25 points sur 25, sous quatre
sessions — porteuse, lecteur, étranger, visiteur : une ligne récrite lue mot par mot, une
ligne retirée et une ajoutée, vingt-cinq lignes repliées, un balisage affiché comme du texte,
l'adresse inversée, un changement de titre seul, deux versions identiques, les deux accès,
quatre adresses introuvables.

**Non couvert** : l'affichage à 375 px ; deux versions réellement trop différentes, que seuls
les tests du calcul éprouvent ; la lecture de la page avec un lecteur d'écran.

ED1 est en production depuis le 8 octobre 2026 (PR 154, `1035a4c`), sans migration. Non vu
sous session en production : l'utilisateur a demandé l'arrêt des recettes.

Lot ED2, la mise en forme, se découpe en deux : ED2a, l'éditeur et l'affichage, dans
l'application seule ; ED2b, les exports, qui touche le worker et le redéploie.

Lot ED2a : cinq marqueurs, et rien d'autre — `# ` pour un titre, `## ` pour un sous-titre,
`- ` pour un élément de liste, en début de ligne ; `**gras**` et `*italique*` autour d'un
passage, sur une ligne. La règle est un module pur (`src/lib/mise-en-forme.ts`) : elle lit un
texte en titres, paragraphes et listes, et sait poser ou retirer une marque sur une sélection.
**Aucun caractère n'est jamais perdu** : un marqueur qui n'est pas refermé, ou qui entoure du
vide, reste du texte. Le contenu enregistré est inchangé : une chaîne de texte, que lisent
tels quels les exports, les agents, l'ajout d'une séquence et le repérage d'un passage.

À l'écran : une barre d'outils au-dessus de la zone de texte — Titre, Sous-titre, Liste, Gras,
Italique —, dont chaque bouton n'écrit que ce qu'on écrirait à la main, et retire la marque si
elle est déjà là ; une phrase qui nomme les marqueurs et dit qu'ils restent dans le texte ; un
aperçu, à la demande, du texte en cours de saisie. Le texte mis en forme se lit sur la page
d'un document, pour qui ne peut pas l'éditer, et sur la page d'une version. Le rendu
(`src/components/texte-mis-en-forme.tsx`) construit des éléments à partir du texte et
n'injecte jamais de HTML : un balisage saisi s'affiche comme du texte. Les titres d'un
document sont de niveau 2 et 3, le niveau 1 restant le titre de la page.

Deux exclusions, décidées avec le plan :

- **un scénario garde son texte brut** (`TYPES_SANS_MISE_EN_FORME`) : ni barre, ni aperçu, ni
  rendu, et l'éditeur le dit. Les agents l'écrivent sans marqueur, et un tiret en tête de
  réplique n'y est pas une puce ;
- **la comparaison de versions montre le texte brut**, marqueurs compris : c'est le texte
  enregistré qui s'y compare.

Les consignes des agents ne changent pas : aucun ne reçoit l'ordre d'écrire des marqueurs.

ED2a est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur ni migration :
34 tests de plus, suite complète de l'API à 1 432 tests. Vingt-quatre sabotages attrapés un par un, du premier coup. Rendu réel sur
un serveur de production local, 33 points sur 33, sous quatre sessions — porteuse, lecteur,
étranger, visiteur : titres, liste, gras, italique et retour à la ligne rendus sur la page
d'un document et sur celle d'une version ; un marqueur non refermé et un balisage affichés
comme du texte ; la barre et l'aide dans l'éditeur ; le scénario laissé brut dans ses trois
pages ; la comparaison inchangée.

**Non couvert** : le clic sur un bouton de la barre et l'ouverture de l'aperçu dans un
navigateur — la pose des marques est éprouvée par les tests de la règle, pas par un clic ;
l'affichage à 375 px ; la lecture avec un lecteur d'écran.

**Connu** : un dossier exporté en PDF, en Word ou en ZIP montre encore les marqueurs tels
qu'ils sont écrits, jusqu'au lot ED2b.

ED2a est en production depuis le 8 octobre 2026 (PR 155, `f5ef79b`), sans migration ; CI de
`main` verte, déploiement terminé. Non vu sous session en production.

Lot ED2b : les exports lisent les mêmes marqueurs. Le worker ne peut pas importer
l'application ; il tient donc **une copie de la lecture**
(`worker/src/exports/mise-en-forme.ts`), et un test refuse que les deux diffèrent, déclaration
par déclaration puis sur un corpus de textes. Le plan du dossier gagne un bloc,
`texte_mis_en_forme`, produit pour le seul texte d'un document dont le type n'est pas un
scénario ; le texte y reste tel qu'il est enregistré, et c'est le rendu qui le lit.

- **PDF** : titre et sous-titre en gras, en corps 14 et 12 ; liste à puces, la puce à la
  marge et le texte en retrait, retrait gardé quand l'élément passe à la ligne ; gras et
  italique dans la phrase, par changement de police.
- **Word** : de vrais titres, de niveau 3 et 4 — les deux premiers sont ceux du dossier, et
  le sommaire d'un traitement de texte les range dessous ; une vraie liste à puces ; gras et
  italique.
- **ZIP** : le fichier Word de chaque document en hérite.

**Un scénario et les champs de la fiche restent du texte brut** — synopsis court, thème,
enjeux, vision, objectifs, public : ce ne sont pas des documents, et leur saisie n'a pas de
barre d'outils. Un document sans marqueur sort comme avant.

ED2b est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur ni
migration, sans dépendance : 23 tests de plus, suite complète de l'API à 1 455 tests. Vingt-trois sabotages attrapés un par un, du
premier coup. Les fichiers sont réellement fabriqués : le Word est relu dans son XML ; le PDF,
dont le texte est écrit en numéros de glyphes, dans ses polices et dans la position de ses
lignes.

**Non couvert** : l'ouverture des fichiers dans un lecteur de PDF et dans un traitement de
texte — aucun n'est installé sur le poste de test.

**Connu** : un export déjà fabriqué n'est pas refait tant que le contenu demandé n'a pas
changé ; un dossier exporté avant ce lot garde ses marqueurs jusqu'à son expiration ou jusqu'à
une modification du projet.

ED2b est en production depuis le 8 octobre 2026 (PR 156, `b9d9ffb`), sans migration ; CI de
`main` verte, worker redéployé par Railway. Aucun export fait en production depuis.

Lot ED3, la sauvegarde automatique. L'éditeur n'enregistrait que sur son bouton ; entre deux
clics, le texte ne vivait que dans le navigateur. Quelques secondes après la dernière frappe
(cinq, `DELAI_BROUILLON_MS`), le titre et le texte partent désormais dans une table à part,
`project_document_drafts` : **un brouillon par compte et par document, qui ne crée aucune
version et ne touche pas au document**. Rien d'autre que l'éditeur ne le lit — ni les exports,
ni les agents, ni le repérage d'un passage, qui lisent tous le texte enregistré.

- **Seul « Enregistrer » modifie le document** et crée une version ; il supprime alors le
  brouillon du compte.
- **Un brouillon trouvé à l'ouverture est proposé, jamais appliqué d'office** : « Reprendre le
  brouillon » le remet à l'écran sans rien enregistrer, « Abandonner le brouillon » le
  supprime. Tant que cette décision n'est pas prise, la sauvegarde automatique attend. Un
  brouillon identique au document n'est pas proposé.
- **Si le document a été enregistré depuis** — par un autre éditeur, une restauration, une
  proposition acceptée —, la proposition le dit : la base pose seule, à la naissance du
  brouillon, le numéro de la dernière version du document (`base_version`).
- L'éditeur dit l'état de la sauvegarde, son échec compris, et ce qu'est un brouillon.
  L'avertissement du navigateur à la fermeture se tait quand le texte est à l'abri ; le type
  et le statut ne vont pas au brouillon et le gardent.

Droits : un brouillon est lu et écrit par son seul titulaire, tant qu'il peut éditer le
projet — un lecteur n'en a pas, un éditeur sorti de l'équipe ne lit plus le sien. Les
administrateurs lisent tout, écrivent le leur comme un éditeur, et peuvent supprimer celui
d'un autre, ce qui est journalisé ; ils ne réécrivent pas le brouillon d'un autre. Les
écritures ordinaires ne sont pas journalisées : un administrateur qui tape dans un projet qui
n'est pas le sien n'a encore rien changé au projet, et son intervention l'est quand il
enregistre le document. La table porte la politique restrictive du mode privé.

ED3 est validé localement le 8 octobre 2026, sans aucun appel à un fournisseur : une
migration (`20261008160000_brouillons_documents.sql`, une table, deux fonctions de
déclencheur), 27 tests SQL et 27 tests d'API de plus ; suites complètes à 854 tests SQL et 1 482 tests d'API. Trente-cinq sabotages un par un, sur la
base et sur le code : trente-quatre attrapés du premier coup ; le dernier — une politique de
suppression ouverte à toute l'équipe — ne se constatait pas par un essai, un compte ne
supprimant que ce qu'il lit, et a reçu son contrôle. Rendu réel sur un serveur de production
local, 19 points sur 19, sous six sessions — porteuse, éditeur, lecteur, administratrice,
étranger, visiteur.

**Non couvert** : la frappe, la minuterie et les deux boutons dans un navigateur — la règle
est éprouvée par ses tests, pas par une frappe ; deux onglets du même compte sur le même
document, qui partagent un seul brouillon ; l'affichage à 375 px.

**Connu** : un brouillon dont le titulaire a quitté l'équipe reste en base jusqu'à la
suppression du document ou du compte ; seul un administrateur peut le supprimer.

ED3 est en production depuis le 8 octobre 2026 (PR 157, `1d79af9`) ; migration poussée par
l'utilisateur avant la fusion, 64 migrations ; CI de `main` verte, déploiement terminé. Non vu
sous session en production : la sauvegarde automatique n'y a été exercée par personne. Le lot
ED, l'éditeur, est clos côté livraison.

Lot RT, les retouches d'un texte : améliorer, raccourcir, développer, corriger — les quatre
actions que le cahier des charges prévoit et qu'aucun lot n'avait livrées. « Régénérer »
existe déjà : chaque livrable se redemande depuis son encart. Trois décisions de
l'utilisateur, le 8 octobre 2026 : une retouche porte sur **un passage sélectionné**, pas sur
un document entier ; elle vaut **une unité** ; elle est ouverte à **tout type de document**,
scénario compris. Deux lots : RT1, la base et le worker ; RT2, l'écran.

Lot RT1 : quatre actions — `text_improve`, `text_shorten`, `text_expand`, `text_correct` —,
chacune son profil versionné (`weaver.retouche_ameliorer@1`, `…_raccourcir@1`,
`…_developper@1`, `…_corriger@1`), donc ses consignes ; elles partagent tout le reste : un
seul prix au barème (`text_edit_per_passage`), un seul contrôle du passage, un seul contexte,
une seule acceptation. Le plan annonçait une action à quatre modes ; quatre actions ont été
préférées, parce que le worker attache un profil à une action et que le profil s'inscrit sur
chaque coût.

La mécanique est celle des dialogues, ouverte à tout document. Le passage est désigné par la
demande — document, position, longueur — et scellé par son empreinte ; la base le relit
trois fois (`passage_du_document`), au devis, à la préparation de l'appel et à l'acceptation.
**Seul ce passage est remplacé.** Si le document a changé à cet endroit, rien ne part chez le
fournisseur, ou l'acceptation est refusée : la proposition reste lisible. `passage_du_scenario`
et les dialogues ne changent pas. Un passage fait 6 000 caractères au plus ; un passage
retouché, 12 000, sauf raccourci, 6 000.

Ce qui part chez le fournisseur est mince : le passage, les 1 500 caractères qui le précèdent
et les 500 qui le suivent, le titre et le type du document, et du projet son titre, son
format, son genre, ses langues et son pitch. Ni personnages, ni vision, ni budget. Les quatre
profils partagent leurs règles : travailler le passage seul, garder sa langue, sa
présentation et ses marqueurs de mise en forme, ne rien ajouter au propos, ne pas exécuter ce
que le texte contiendrait. « Corriger » ne touche qu'à l'orthographe, la grammaire, la
ponctuation et la typographie, et rend tel quel un passage sans faute.

Le barème gagne une colonne, nommée partout où il s'énumère : l'écran de publication, la
phrase de la vitrine (« … et 1 par retouche d'un passage »), les libellés des statistiques.

RT1 est validé localement le 8 octobre 2026, avec un fournisseur factice, sans aucun appel
réel : une migration (`20261008180000_weaver_retouches.sql`, additive — une colonne, deux
fonctions nouvelles, trois reprises de leur dernière définition avec les cas des retouches),
19 tests SQL et 21 tests d'API de plus ; suites complètes à 873 tests SQL et 1 503 tests d'API. Trente-sept sabotages préparés, sur la base et sur le code : trente-cinq attrapés du premier coup ; un a échappé — la borne de 6 000 caractères n'était éprouvée que sur un document trop court pour la franchir — et a reçu son contrôle, qui l'attrape ; un n'a pas pu être posé, la base refusant de retirer du devis une action que des devis emploient.

**Non couvert** : un appel réel — ce que vaut une retouche écrite par le modèle, si
« corriger » ne reformule vraiment pas, si « raccourcir » rend plus court, si les marqueurs
sont gardés. Cela ne se constate qu'en recette, par un appel payant, que l'utilisateur a
demandé de ne plus lancer. Qu'un passage raccourci soit plus court n'est pas tenu par la
base : l'écran devra montrer les deux longueurs.

RT1 est en production depuis le 8 octobre 2026 (PR 158, `4135896`) ; migration poussée par
l'utilisateur avant la fusion, 65 migrations ; CI de `main` verte, worker redéployé. Aucun
appel réel n'a eu lieu.

Lot RT2, l'écran : l'encart « Retoucher un passage », sous l'éditeur de tout document, pour
qui peut l'écrire. Il est tenu à part de celui des dialogues, qui reste sur le seul scénario ;
un scénario montre donc les deux. Le parcours est celui des dialogues, avec un choix de plus :

1. l'encart dit d'abord ce qui part chez le fournisseur, et que rien n'est remplacé sans
   accord ;
2. un passage se sélectionne dans le texte, puis une des quatre retouches se choisit —
   chacune avec son effet en une phrase. Le document doit être enregistré ;
3. le devis s'affiche — une unité, le solde de la période — et rien ne part sans le bouton
   de confirmation ;
4. en file, la demande s'annule ; en cours, l'encart le dit ;
5. la proposition se lit en regard du passage actuel, **avec les deux longueurs et leur écart
   en toutes lettres** : rien ne garantit qu'un passage « raccourci » soit plus court. Elle
   se reprend à la main avant d'être appliquée, ou s'écarte ;
6. après une acceptation, la page se recharge, pour que l'éditeur reparte du texte à jour.

Le navigateur n'envoie que le texte sélectionné et le nom de la retouche, que le serveur
n'admet que parmi les quatre du catalogue ; position et empreinte sont calculées par le
serveur, dans le document enregistré. Si le texte à la position de la demande n'a plus son
empreinte, l'encart dit que le passage ne se retrouve plus, au lieu de montrer un autre texte
en regard ; la base, elle, refuse alors le remplacement, et le refus est dit avec les mots
d'un document, pas ceux d'un scénario. Les messages des dialogues ne changent pas.

RT2 est validé localement le 8 octobre 2026, sans migration ni appel à un fournisseur — une
proposition est déposée comme le ferait le worker : 22 tests de plus, suite complète de l'API à 1 525 tests. Vingt-six sabotages du
code attrapés un par un ; un vingt-septième, mal conçu, ne retirait aucune protection. Rendu
réel sur un serveur de production local, 19 points sur 19, sous quatre sessions — porteuse,
lecteur, étranger, visiteur : repos, demande en file, proposition, document changé, scénario
aux deux encarts.

**Non couvert** : la sélection et les clics dans un navigateur — le devis demandé depuis
l'encart, la confirmation, l'acceptation ; une retouche réelle ; l'affichage à 375 px.

RT2 est en production depuis le 8 octobre 2026 (PR 159, `795cc15`), sans migration ; CI de
`main` verte, déploiement terminé. Le lot RT est livré. Ce que vaut une retouche écrite par le
modèle reste à constater : aucune n'a été faite, et ni la sélection ni les clics n'ont été vus
dans un navigateur.

Lot OP, les opportunités : ce que le cahier des charges demande et que les lots L5a et L5b
n'ont pas livré. Des sept filtres prévus, cinq existaient avec la recherche ; manquaient le
montant et la langue. Des huit éléments de compatibilité, trois existaient ; manquaient la
durée, le stade, la thématique, le budget et les exigences. Deux lots : OP1, le filtre par
montant, sans migration ; OP2, la langue, la durée et le stade, que le catalogue ne porte pas
encore. La thématique et les exigences, textes libres, restent sur la fiche ; le budget reste
hors de la compatibilité, comme décidé au lot L5b.

Lot OP1 : dans « Opportunités », un filtre « Montant accordé » — une devise, puis un montant
minimal. **Deux devises ne se comparent jamais** : le catalogue ne porte aucun taux de change,
et en supposer un ferait dire à une source ce qu'elle ne dit pas. Une devise seule retient
toute opportunité qui dit un montant dans cette devise ; avec un minimum, il faut que le
montant qu'elle dit accorder — son plafond, à défaut son plancher — l'atteigne. **Une
opportunité sans montant n'est jamais retenue** : « non fourni » n'est pas « toute somme ».
Le filtre ne propose que les devises dans lesquelles le catalogue visible dit un montant, et
n'apparaît pas s'il n'y en a aucune. Un montant sans devise, ou mal écrit, est ignoré sans
erreur. L'écran dit ce que le filtre ne fait pas, et que le montant affiché est celui que
l'opportunité accorde, pas ce qu'un projet obtiendrait.

Le filtre est tenu à part des autres (`lireFiltreMontant`, `filtrerParMontant`), s'applique
aux lignes déjà lues, après eux, sans défaire leur tri : rien ne s'ajoute à la requête.

OP1 est validé localement le 8 octobre 2026, sans migration ni appel à un fournisseur : 20 tests de plus, suite complète de l'API à 1 545 tests. Vingt-trois sabotages attrapés un par un, du premier coup. Rendu réel sur
un serveur de production local, 18 points sur 18, avec cinq opportunités d'essai posées puis
retirées de la base locale.

**Non couvert** : l'affichage à 375 px ; le filtre en production, où le catalogue ne compte
presque rien — il n'y changera rien de visible tant que des opportunités chiffrées n'auront
pas été vérifiées.

OP1 est en production depuis le 8 octobre 2026 (PR 160, `7844a0c`), sans migration ; CI de
`main` verte, déploiement Vercel terminé. L'écran n'a pas été ouvert sous session en
production.

Lot OP2 : la langue, la durée et le stade, que le catalogue ne portait pas. Une migration
ajoute quatre colonnes à `funding_opportunities` — `languages`, `stages`,
`duration_min_minutes`, `duration_max_minutes` —, vides ou nulles par défaut : « la source ne
le précise pas », jamais « tout ». Les droits d'écriture du catalogue étant accordés colonne
par colonne, ils le sont pour ces quatre-là ; aucune politique ne change. Décisions du
8 octobre 2026 : cinq langues, liste fermée (français, anglais, portugais, arabe,
espagnol) — en ajouter une demandera une migration ; la langue est un filtre et non un
critère, les langues d'un projet étant un texte libre.

**La compatibilité passe de trois à cinq critères** : la durée, comparée à une fourchette
bornes comprises, et le stade, comparé à l'étape du projet. Le stade d'un projet est toujours
renseigné : ce critère n'est jamais « non renseigné ». La règle « à étudier » ne change pas —
au moins un critère rempli, aucun contredit —, mais elle porte sur cinq critères : **une
opportunité dont le stade ou la durée contredit le projet sort du tableau de bord et des
alertes**. Rien ne change pour une opportunité qui ne précise ni l'un ni l'autre, donc pour
tout le catalogue saisi avant ce lot. La thématique et les exigences restent sur la fiche ;
le montant reste hors de la compatibilité.

Le filtre « Langue demandée » de la rubrique « Opportunités » est tenu à part des autres,
comme celui du montant (`lireFiltreLangue`, `filtrerParLangue`), s'applique en dernier sur
les lignes lues, et n'est proposé que pour les langues qu'une opportunité lue demande. Une
opportunité qui ne dit rien de la langue n'y est jamais retenue. L'administration saisit les
quatre champs dans le formulaire du catalogue ; la fiche d'une opportunité les montre, ou
dit « Information non fournie. ».

OP2 est validé localement le 8 octobre 2026, sans appel à un fournisseur : 29 tests de
plus, suite complète de l'API à 1 574 tests, 882 tests SQL. Quarante-cinq sabotages attrapés
un par un — trente-huit dans le code, sept à chaud dans la base locale, restaurée. Rendu réel
sur un serveur de production local, 44 points sur 44, avec un projet et quatre opportunités
d'essai posés puis retirés de la base locale.

**Non couvert** : l'affichage à 375 px ; la saisie des quatre champs par le formulaire dans
un navigateur — le rendu a lu les pages servies, il n'a pas envoyé le formulaire ; l'effet en
production, où aucune opportunité ne renseigne encore ces champs.

OP2 est en production depuis le 9 octobre 2026 (PR 161, `445297e`) ; migration poussée par
l'utilisateur le même jour, soixante-six migrations en base. Vérifié en base par lecture
seule : les quatre colonnes, leurs défauts, les trois contraintes, les droits d'écriture des
comptes sous la RLS, et rien de lisible pour un visiteur ni pour le worker. CI de `main`
verte, déploiement Vercel terminé.

**Non vu en production** : aucune page ouverte sous session. Les deux opportunités du
catalogue ne précisent ni langue, ni durée, ni stade : le filtre « Langue demandée »
n'apparaît pas et les décomptes restent ceux d'avant, tant que l'administration n'aura pas
saisi ces champs.

Lot SE, les séries. Les formats « série » et « web-série » existaient, avec la bible de série
(lot J1), mais rien ne traitait une série autrement qu'un film : ni saison, ni épisodes, ni
pilote. Décisions du 9 octobre 2026 : **une seule saison par projet** ; les séries avant
l'assistant unifié ; trois lots — SE1, les épisodes saisis à la main ; SE2, les épisodes
proposés par SCRIPT ; SE3, le scénario par épisode, qui touche la règle « un scénario par
projet ».

Lot SE1 : la table `project_episodes` — un numéro, un titre, un résumé, une durée
facultative — et sa page, `projets/[id]/episodes`. L'épisode 1 se présente comme le pilote.
Mêmes droits que les personnages : toute l'équipe lit, le porteur, les éditeurs et les
administrateurs écrivent ; politique du mode privé, journal des interventions de
l'administration, droits accordés colonne par colonne. La base tient trois règles, quel que
soit le chemin : un épisode n'existe que dans un projet de série ou de web-série ; deux
épisodes d'un projet n'ont pas le même numéro ; **un projet qui a des épisodes ne quitte pas
le format série** — il faut les retirer d'abord, la base ne les supprime jamais d'elle-même.

La page s'ouvre depuis la « Fiche » des seules séries, qui en donne le décompte, et se range
sous cet onglet : la barre d'onglets du projet n'a pas changé. Pour un projet qui n'est pas
une série, pour un projet illisible ou pour un identifiant mal formé, elle répond comme une
page absente. Un lecteur y lit les épisodes sans formulaire ni bouton. Le formulaire d'ajout
propose le numéro qui suit le plus grand.

SE1 est validé localement le 9 octobre 2026, sans appel à un fournisseur : 50 tests de plus,
suite complète de l'API à 1 624 tests, 906 tests SQL. Soixante-sept sabotages attrapés un par
un — quarante-cinq dans le code, vingt-deux à chaud dans la base locale. Un sabotage sans
effet a révélé un trou : aucun test n'éprouvait un nombre écrit autrement qu'en chiffres
(`1e2`, `0x10`, `3.0`) ; les cas ont été ajoutés. Rendu réel sur un serveur de production
local, 25 points sur 25 — porteur, lecteur, étranger, série vide, film —, données d'essai
retirées.

**Non couvert** : l'affichage à 375 px ; l'envoi des formulaires dans un navigateur — le
rendu a lu les pages servies, les écritures sont éprouvées par l'API ; le message rendu par
l'assistant de création quand la base refuse un changement de format : il reste le message
générique « L'enregistrement a échoué », son fichier n'étant pas de ce lot. Les épisodes
n'entrent ni dans les exports, ni dans le contexte d'un agent, ni dans le score de maturité.

SE1 est en production depuis le 9 octobre 2026 (PR 163, `02fd12f`) ; migration poussée par
l'utilisateur le même jour, soixante-sept migrations en base. Vérifié en base par lecture
seule : la RLS, les cinq politiques dont celle du mode privé, les trois déclencheurs de la
table et le garde du format sur les projets, les cinq contraintes, les droits des comptes
colonne par colonne, et rien de lisible pour un visiteur ni pour le worker. CI de `main`
verte, déploiement Vercel terminé.

**Non vu en production** : aucune page ouverte sous session, aucun épisode saisi.

Correctif du 9 octobre 2026, sans migration : le format d'un projet se modifie à deux
endroits — l'étape « Informations » de l'assistant de création et le formulaire du projet —,
et tous deux répondaient « L'enregistrement a échoué » quand la base refusait de sortir du
format série un projet qui a des épisodes. Ils disent maintenant pourquoi : « Ce projet a des
épisodes : retirez-les avant de changer son format. » Tout autre refus garde le message
générique, et le message de la base n'est jamais rendu tel quel. Validé localement : deux
tests de plus, six sabotages attrapés ; aucune page ne change, le message n'a pas été vu dans
un navigateur.

Lot SE2a, les épisodes proposés par SCRIPT : la base et le worker, sans écran. Sixième
livrable structuré, sur le modèle des personnages proposés par ARC (lot X2a) : une
proposition parente, ses lignes dans `ai_suggestion_episodes`, acceptées ou écartées une à
une par qui écrit les épisodes. Décisions du 9 octobre 2026 : 3 unités, comme une liste de
personnages ; douze épisodes au plus par proposition ; la bible de série est lue.

SCRIPT lit le projet, son concept, sa vision, ses personnages, les épisodes déjà saisis — cent
au plus, le début de chaque résumé — et la bible la plus récente, brouillon compris, bornée à
20 000 caractères. Seule la bible part parmi les documents : ni scénario, ni note, ni budget.
**Il ne propose que des épisodes à ajouter** : une ligne proposée porte un titre et un résumé,
sans numéro ni durée, et l'épisode accepté prend le numéro qui suit le plus grand — jamais un
trou, jamais la place d'un autre. Un devis est refusé, avant toute dépense, pour un projet qui
n'est pas une série, ou dont la saison a atteint son dernier numéro. Un projet sorti du format
série ne reçoit plus d'épisode, même d'une proposition restée en attente.

Le barème gagne une colonne, `episode_list` : la vitrine des tarifs dit son prix, et
l'administration le saisit avec les autres depuis « Plans et quotas ».

SE2a est validé localement le 9 octobre 2026, **sans aucun appel à un fournisseur** — le
fournisseur des tests est factice, désigné comme tel : 29 tests de plus, suite complète de
l'API à 1 655 tests, 922 tests SQL (16 de plus). Soixante-douze sabotages attrapés un par un — trente-deux
dans le code, quarante à chaud dans la base locale. Un sabotage passait : rendre le contexte
des épisodes à une tâche d'une autre action ne faisait tomber aucun test ; la vérification a
été ajoutée au test SQL du lot.

**Non couvert** : un appel réel — ni ce que valent les épisodes proposés, ni si SCRIPT s'en
tient à la bible, ni son coût ; l'écran, qui fait l'objet du lot SE2b. L'agent entre en
service en production dès la fusion, la clé Anthropic étant posée, mais rien ne permet encore
de l'appeler depuis l'application.

SE2a est en production depuis le 9 octobre 2026 (PR 166, `164aec4`) ; migration poussée par
l'utilisateur le même jour, soixante-huit migrations en base. Vérifié en base par lecture
seule : le barème compte une liste d'épisodes pour 3 unités, sans défaut, lisible de la
vitrine ; la table a sa RLS, ses deux politiques dont celle du mode privé, ses deux
déclencheurs, et ne s'écrit que par ses fonctions ; le contexte et le dépôt sont réservés au
worker, la décision aux comptes ; `creer_devis` porte le cas des épisodes et tous les
précédents. CI de `main` verte, déploiement Vercel terminé. Le worker a redémarré à 15h39 UTC
sous le rôle `filmfund_worker` et annonce trente actions, dont `episode_list`.

**Non vu en production** : aucune tâche d'épisodes, aucune proposition — il n'y a pas encore
d'écran ; ni la vitrine des tarifs ni « Plans et quotas » n'ont été ouverts sous session.

Lot SE2b, l'écran : l'encart « Épisodes proposés par l'assistant », sur la page des épisodes
d'une série. Sans migration : il n'appelle que les fonctions livrées au lot SE2a. Sept
actions serveur — devis, lancement, annulation, acceptation, écart, « tout accepter », « tout
écarter » —, dont aucune n'écrit une table directement ni n'appelle un fournisseur.

L'encart dit, avant tout envoi, ce qui part chez le fournisseur — bible de série comprise —,
et rien ne part sans devis affiché ni confirmation. Le navigateur ne choisit ni l'action, ni
les paramètres du devis, ni le numéro d'un épisode : la base le donne. Un épisode se corrige
avant d'être accepté, titre et résumé, par la lecture d'un épisode saisi à la main. Un titre
déjà pris dans la saison est signalé, jamais refusé. « Tout accepter » demande une
confirmation, suit l'ordre de l'assistant — qui devient celui des numéros — et s'arrête au
premier refus, en disant combien sont entrés. Le texte rendu par le modèle s'affiche comme du
texte, jamais comme du balisage.

**La page des épisodes se lit de toute l'équipe** : un lecteur y lit ce qui est proposé, sans
aucun bouton, et ne voit ni tâche ni demande en cours — seulement une proposition qui attend
la décision de l'équipe. Le droit de décider vient de `peut_editer_contenu`, la fonction que
la RLS applique.

SE2b est validé localement le 9 octobre 2026, sans appel à un fournisseur : 21 tests de
plus, suite complète de l'API à 1 676 tests, 922 tests SQL. Quarante-sept sabotages attrapés
un par un. Un sabotage passait : lire la demande avant le contrôle d'accès de la page ne
faisait tomber aucun test ; le test a été renforcé. Rendu réel sur un serveur de production
local, 30 points sur 30 — porteur, lecteur, étranger ; au repos, demande en file, proposition,
après décision —, avec une proposition déposée par un fournisseur factice, données d'essai
retirées.

**Non couvert** : un appel réel ; l'affichage à 375 px ; les clics dans un navigateur — le
rendu a lu les pages servies, les décisions sont éprouvées par l'API ; l'annulation d'une
demande en file et la correction d'un épisode à l'écran. En production, un administrateur
peut désormais déclencher un appel payant depuis l'encart, après devis et confirmation : son
coût n'est pas mesuré.

SE2b est en production depuis le 9 octobre 2026 (PR 168, `06bd13b`), sans migration ; CI de
`main` verte, déploiement Vercel terminé. Le worker n'a pas été redéployé : le lot ne le
touche pas.

**Non vu en production** : l'encart n'a pas été ouvert sous session, et aucune demande
d'épisodes n'a été faite — ni devis, ni appel réel.

Lot SE3, le scénario par épisode, cadré le 9 octobre 2026. La règle « un scénario par
projet » n'était pas dans la base : `project_documents` n'a aucune unicité par type, et une
équipe pouvait déjà créer plusieurs scénarios. C'était une convention des chemins d'IA —
l'écriture d'une séquence et le découpage de FRAME visent « le scénario le plus récemment
modifié » ; les dialogues et les retouches, eux, désignent leur document. Décisions : tous
les épisodes peuvent avoir leur scénario, pas le pilote seulement ; le scénario qu'une série
portait déjà reste « sans épisode », et ne se rattache qu'à la main ; deux lots — SE3a, le
lien, sans IA ; SE3b, la séquence écrite dans le scénario de l'épisode désigné.

**Limite connue, non traitée** : FRAME lit toujours le dernier scénario modifié du projet.
Pour une série, ce peut être celui d'un autre épisode. Le corriger demande de relier les
scènes du storyboard aux épisodes : un lot à part, non planifié.

Lot SE3a : la colonne facultative `project_documents.episode_id`. La base tient trois
règles, quel que soit le chemin : seul un scénario se rattache à un épisode ; un épisode a un
scénario au plus ; l'épisode est celui du même projet. Retirer un épisode ne supprime pas son
scénario — le lien disparaît, le texte reste. Rattacher ne crée aucune version. Aucune
politique ne change ; le droit de modifier est accordé pour cette colonne.

Depuis la page des épisodes, chaque épisode ouvre son scénario, ou le crée en brouillon —
« Scénario — épisode N », titre tiré du numéro lu en base — pour qui écrit le projet ; un
lecteur ouvre un scénario existant, sans pouvoir en créer. L'éditeur d'un scénario de série
dit à quel épisode il est rattaché et permet de le changer ou de le détacher, en ne proposant
que les épisodes sans scénario ; un lecteur y lit seulement de quel épisode il s'agit. Pour
un film, ou pour un document qui n'est pas un scénario, rien ne s'affiche. Changer le type
d'un scénario rattaché est refusé par la base, et l'écran dit pourquoi.

SE3a est validé localement le 9 octobre 2026, sans appel à un fournisseur : 31 tests de
plus, suite complète de l'API à 1 707 tests, 939 tests SQL (17 de plus). Quarante-huit
sabotages attrapés un par un — trente-cinq dans le code, treize à chaud dans la base locale.
Rendu réel sur un serveur de production local, 22 points sur 22 — porteur, lecteur,
étranger ; scénario rattaché, sans épisode, d'un film ; épisode retiré —, données d'essai
retirées.

**Non couvert** : l'affichage à 375 px ; les clics dans un navigateur — créer un scénario
depuis un épisode et enregistrer un rattachement sont éprouvés par l'API et par la lecture du
code, pas par un envoi de formulaire.

**À savoir jusqu'à SE3b** : avec un scénario par épisode, la demande de séquence à SCRIPT
s'ajoute au scénario modifié en dernier, quel que soit son épisode. Le défaut existait dès
qu'un projet portait deux scénarios ; ce lot le rend plus fréquent. L'encart de la séquence
nomme le document visé avant d'agir.

SE3a est en production depuis le 9 octobre 2026 (PR 170, `7020f7c`) ; migration poussée par
l'utilisateur le même jour, soixante-neuf migrations en base. Vérifié en base par lecture
seule : la colonne, facultative et sans défaut ; la contrainte, l'index unique et le
déclencheur ; le lien qui se vide quand l'épisode est retiré ; les droits des comptes sous la
RLS, et rien de lisible pour un visiteur ni pour le worker ; les cinq politiques des
documents, inchangées. CI de `main` verte, déploiement Vercel terminé.

**Non vu en production** : aucune page ouverte sous session. Des treize documents en base,
aucun n'est rattaché à un épisode : rien n'a changé pour l'existant.

Lot SE3b : la séquence écrite dans le scénario de l'épisode désigné. Aucun schéma ne
change ; une migration reprend trois fonctions pour un paramètre facultatif de la demande,
`episode`. Le devis vérifie que l'épisode est un épisode du projet, avant toute réservation.
Le contexte rend l'épisode, la saison — cent épisodes au plus, le début de chaque résumé — et
la fin du scénario de cet épisode ; les scénarios des autres épisodes ne partent pas, même
finalisés. L'acceptation ajoute la séquence au scénario de l'épisode, créé en brouillon et
rattaché s'il n'existe pas. Sans épisode, la demande ne vise plus que les scénarios sans
épisode : pour un film, rien ne change ; dans une série, elle ne s'ajoute plus jamais au
scénario d'un épisode. Le profil de SCRIPT ne change pas (`script.scenario@1`), ni le prix.

Si l'épisode est retiré entre la demande et l'appel, la base ne rend aucun contexte et rien
ne part chez le fournisseur ; retiré avant l'acceptation, celle-ci est refusée (`SE004`) et
rien n'est écrit ailleurs — la proposition reste lisible, à reporter à la main ou à écarter.

L'encart se tient sous l'éditeur du scénario d'un épisode, pour qui écrit le projet ;
appliquer reste au porteur et aux éditeurs. Il dit où la séquence s'ajouterait et ce qui part
chez le fournisseur. Comme celui des dialogues, il refuse d'agir sur un document non
enregistré et recharge la page après une acceptation : sans cela, l'éditeur réenregistrerait
l'ancien texte par-dessus la séquence ajoutée. L'encart de l'onglet « Documents » ne suit que
les demandes sans épisode, et ne nomme qu'un scénario sans épisode.

SE3b est validé localement le 9 octobre 2026, sans appel à un fournisseur — le fournisseur
des tests est factice : suite complète de l'API à 1 733 tests, 952 tests SQL (13 de plus).
Trente-quatre sabotages attrapés un par un — dix-neuf dans le code, quinze à chaud dans la
base locale. Rendu réel sur un serveur de production local, 27 points sur 27 — porteur,
lecteur, étranger ; au repos, demande en file, proposition, après acceptation —, données
d'essai retirées.

**Non couvert** : l'affichage à 375 px ; les clics dans un navigateur — le refus d'agir sur
un document non enregistré et le rechargement après acceptation sont éprouvés par la lecture
du code, pas dans un navigateur ; ce que SCRIPT fait réellement de l'épisode et de la saison
qu'il reçoit, qui ne se vérifie qu'en recette, avec le vrai fournisseur.

**À savoir** : le contrôle du type de `episode` au devis double celui de sa forme — retiré
seul, il ne change aucun refus ; il est gardé par prudence. Une tâche de séquence dont
l'épisode a été retiré avant l'appel échoue puis suit le sort de tout échec connu, sans
appel au fournisseur.

**Limite inchangée** : FRAME lit toujours le dernier scénario modifié du projet.

SE3b est en production depuis le 9 octobre 2026 (PR 172, `3ffd3fe`) ; migration poussée par
l'utilisateur le même jour, soixante-dix migrations en base. Vérifié en base par lecture
seule : une seule définition de chacune des trois fonctions, au chemin de recherche fermé ;
leurs droits, inchangés — devis et acceptation aux comptes, contexte au worker seul, rien
pour un visiteur ; le contrôle de l'épisode au devis, le choix du scénario de l'épisode au
contexte et à l'acceptation, le refus `SE004`. Avant la fusion comme après la poussée, aucune
séquence n'était en file ni en cours, et aucune proposition de séquence n'attendait. CI de
`main` verte, déploiement Vercel terminé. Worker redéployé sur ce commit à 23h18 UTC : il annonce trente actions, comme avant — le lot n'en ajoute aucune.

**Non vu en production** : aucune page ouverte sous session, aucune demande de séquence —
ni devis, ni appel réel. Des treize documents en base, aucun n'est rattaché à un épisode :
rien n'a changé pour l'existant.

Le lot SE3 est livré en entier. **Reste, hors lot** : la limite de FRAME, qui demande de
relier les scènes du storyboard aux épisodes.

Lot AS, l'Assistant IA, cadré le 10 octobre 2026. La rubrique était annoncée « Bientôt »
depuis l'origine, sans page. Deux façons de la construire : un point d'entrée qui dit ce que
l'assistant sait faire et mène au bon écran, sans IA ni coût ; ou une demande en texte libre
routée vers l'agent, soit un appel payant de plus par demande, un profil et un budget à
décider. Décisions : la première ; l'accès depuis un projet par un lien de la « Synthèse »,
sans treizième onglet ; la rubrique du menu liste les projets et mène à la page de chacun ;
aucun agent n'est nommé à l'écran ; deux lots — AS1, le point d'entrée ; AS2, ce qui attend
sur un projet.

Lot AS1 : la page « Assistant IA » d'un projet. Vingt-six demandes rangées en six besoins —
présenter le projet, construire le récit, reprendre un texte, documenter, préparer le
tournage, chiffrer —, chacune avec ce qu'elle produit, l'écran où elle se fait et son prix,
lu au barème publié. La page ne lance rien : ni action, ni devis, ni bouton ; elle mène à
l'encart existant, qui garde son devis et sa confirmation. Elle redit ce qui ne change pas :
l'équipe garde la main, les calculs restent ceux de la plateforme. Toute l'équipe la lit ; un
lecteur n'y trouve aucun lien, et la page lui dit pourquoi ; la demande du budget ne se montre
qu'à qui le gère, celle des épisodes qu'à une série. Le catalogue est un module pur
(`src/lib/assistant-ia.ts`) ; un test refuse qu'une action d'un livrable ou qu'un prix du
barème y manque. La veille des opportunités, tâche de l'administration, n'y figure pas.

AS1 est validé localement le 10 octobre 2026, sans migration ni appel à un fournisseur :
21 tests de plus, suite complète de l'API à 1 754 tests, 952 tests SQL, inchangés.
Vingt-quatre sabotages attrapés un par un. Rendu réel sur un serveur de production local,
38 points sur 38 — porteur, lecteur, étranger, visiteur ; une série et un film ; les dix
écrans de destination, la rubrique du menu, le lien de la Synthèse —, données d'essai
retirées. Le rendu a trouvé un défaut que les tests ne voyaient pas : la page interrogeait
`peut_engager_unites`, que les comptes n'appellent pas, et traitait le porteur en lecteur ;
elle applique désormais la règle des autres pages.

**Non couvert** : l'affichage à 375 px ; les clics dans un navigateur. L'ancre de la demande
du budget n'existe que si l'encart est rendu : sur un projet sans budget, le lien ouvre la
page du budget sans s'y positionner.

**À savoir** : « Assistant IA » et « Assistant de création » sont deux écrans distincts, aux
noms proches.

AS1 est en production depuis le 9 octobre 2026 à 23h55 UTC (PR 174, `06ccbb2`), sans
migration. CI de `main` verte, déploiement Vercel terminé ; le worker n'est pas concerné.

Vu en production le 10 octobre 2026, sans session, à l'adresse publique du site : un
visiteur est renvoyé à la connexion sur `/assistant-ia` comme sur la page d'un projet,
identifiant mal formé compris. **Non vu** : les pages sous session — le menu, la page d'un
projet, le lien de la Synthèse.

Lot AS2 : ce qui attend sur un projet, en tête de sa page « Assistant IA » — les
propositions à décider, puis les demandes en file, en cours ou à rapprocher, chacune avec sa
date, ce qu'elle vise et un lien vers son écran. Rien n'est stocké, rien ne se décide depuis
la page : ni « lu », ni compteur, ni bouton.

L'audit a écarté la lecture des onze tables de propositions. Chaque écran ne montre que la
dernière demande de sa cible — l'action, ou la scène, le document, l'épisode : une proposition
plus ancienne, jamais décidée, reste « proposée » en base sans qu'aucun écran ne l'ouvre. La
page applique donc la règle des écrans, et non l'état de la base : la dernière tâche de chaque
cible, puis l'existence de sa proposition. Deux lectures bornées — les cent dernières tâches
du projet, au-delà desquelles la page le dit —, et jusqu'à trois de plus pour nommer les
cibles. Des tâches, seuls l'action, l'état, la date et la cible sont lus, jamais le reste des
paramètres ; des propositions, leur existence, jamais leur contenu.

Un lecteur ne lit que les propositions que leur écran lui montre — épisodes, matériel,
jalons, plans, vignette, recherche —, jamais une demande en cours. La proposition de budget ne
se montre qu'à qui le gère : la base en laisse lire le parent à toute l'équipe, c'est la page
qui la tait. Une demande dont la cible a été retirée reste listée, sans lien, et la page dit
pourquoi. Un échec ou une annulation ne sont pas listés : l'encart les dit déjà.

AS2 est validé localement le 10 octobre 2026, sans migration ni appel à un fournisseur — le
fournisseur des tests est factice : 23 tests de plus, suite complète de l'API à 1 777 tests,
952 tests SQL, inchangés. Vingt-huit sabotages attrapés un par un. Rendu réel sur un serveur
de production local, 28 points sur 28 — porteur, lecteur, étranger ; rien n'attend, demande en
file, proposition, épisodes proposés, séquence d'un épisode, scénario détaché, demande
annulée —, données d'essai retirées.

**Non couvert** : l'affichage à 375 px ; les clics dans un navigateur. Au rendu, le découpage,
la vignette, les dialogues et les retouches ne sont éprouvés que par les règles, pas par une
vraie demande. La lecture contre la base rejoue les requêtes de la page, dont un test vérifie
qu'elles sont bien les siennes : le fichier de la page importe des alias que Node ne résout
pas.

**À savoir** : la lecture des tâches par projet n'a pas d'index — comme celles des écrans
existants. Sans effet à l'échelle actuelle ; à revoir avec le volume. Un administrateur hors
de l'équipe lit ce qui attend, comme il lit le projet.

AS2 est en production depuis le 10 octobre 2026 à 00h42 UTC (PR 176, `35b5dac`), sans
migration. CI de `main` verte, déploiement Vercel terminé. Vu sans session à l'adresse
publique du site : la vitrine répond, et les deux routes de l'assistant renvoient toujours à
la connexion.

**Non vu en production** : la section « Ce qui attend », qui n'existe que sous session.
Aucune page de l'Assistant IA n'a été ouverte sous session.

**Reste à faire** : rien de planifié pour l'Assistant IA. Un compteur sur la rubrique du menu
a été écarté de ce lot ; la demande en texte libre, routée vers un agent, reste non décidée.

Limites des séries, auditées le 10 octobre 2026. Trois endroits ne tenaient pas compte des
épisodes. Le dossier exporté : la saison n'y figurait pas, et les scénarios d'épisode y
entraient rangés par date de création — l'épisode 3 pouvait précéder l'épisode 1. FRAME : son
contexte lit le scénario le plus récemment modifié, et une scène du storyboard n'a aucun lien
avec un épisode. Le score de maturité : il compte les documents par type, un scénario
d'épisode y compte déjà comme un scénario. Décisions : SE4, les épisodes dans le dossier,
d'abord ; SE5, FRAME par épisode, ensuite — il demande une colonne sur la scène et un champ
dans son formulaire ; le score de maturité n'est pas touché.

Lot SE4 : une migration sans schéma reprend `parametres_export`, qui admet une huitième
section, `episodes`, et `contenu_dossier`, qui rend la saison — numéro, titre, durée, résumé
entier, dans l'ordre des numéros — et le numéro d'épisode de chaque scénario rattaché. Les
scénarios se rangent sans épisode d'abord, puis par numéro. Dans le dossier, la saison ouvre
après la fiche, l'épisode 1 s'y dit « pilote », et un scénario d'épisode est annoncé
« Scénario · Épisode N » d'après le lien du document, non d'après son titre. Dans le ZIP, un
classeur `episodes.xlsx`. L'écran ne propose la section qu'aux séries, cochée d'office quand
la saison a des épisodes.

Un document sans épisode garde exactement la forme qu'il avait : l'empreinte d'un dossier
déjà fabriqué ne change pas, et aucun n'est refait pour rien. La base admet la section pour
tout projet : un film n'a pas d'épisodes, la section est vide et omise sans mention. La
saison part entière — sa lecture est bornée à cinq cents épisodes, la borne d'un numéro.

SE4 est validé localement le 10 octobre 2026, sans appel à un fournisseur : 15 tests de
plus, suite complète de l'API à 1 792 tests, 973 tests SQL (21 de plus). Trente et un
sabotages attrapés un par un — dix-huit dans le code, treize à chaud dans la base locale. Les
trois formats sont réellement fabriqués par le worker local, pour une série et pour un film,
puis relus dans leur XML. Rendu réel de l'écran du dossier, 11 points sur 11 — série avec et
sans épisode, film, lecteur —, données d'essai retirées.

**Non couvert** : l'ouverture des fichiers dans un traitement de texte ou un tableur ; le
contenu d'un PDF, dont seuls la signature et le nombre de pages sont vérifiés ; l'affichage à
375 px ; les clics dans un navigateur.

**À savoir** : dans le ZIP, la saison a son classeur et n'est pas redite dans le fichier de
présentation. Un dossier reste borné à 5 Mo : une saison de scénarios finalisés peut s'en
approcher, et le refus existant le dit.

SE4 est en production depuis le 10 octobre 2026 (PR 178, `607a1b7`) ; migration poussée par
l'utilisateur le même jour, soixante et onze migrations en base. Vérifié en base par lecture
seule : une seule définition de chacune des deux fonctions, sous les droits de l'appelant,
stables, au chemin de recherche fermé ; leurs droits, inchangés — les comptes, ni visiteur ni
worker ; la section `episodes` admise ; la lecture de la saison bornée, les scénarios rangés
par épisode. Pour les sept dossiers disponibles, l'empreinte que la base calcule est la même
avant et après la poussée : aucun ne sera refait pour rien. Aucun export n'était en file ni
en cours. CI de `main` verte, déploiement Vercel terminé, worker redéployé sur ce commit.

**Non vu en production** : aucun dossier de série fabriqué — la base ne compte aucun
épisode —, et l'écran du dossier n'a pas été ouvert sous session.

Lot SE5 : la scène d'un épisode. Une migration ajoute la colonne facultative
`storyboard_scenes.episode_id`, jamais remplie d'office, et la règle que la base tient —
l'épisode est celui du même projet (`SE005`). Retirer un épisode ne supprime aucune scène : le
lien se vide. Aucune politique ne change ; le droit d'écrire est accordé pour la colonne. La
migration reprend aussi `contexte_decoupage`.

Trois règles, alignées sur l'écriture d'une séquence (lot SE3b). La scène d'un épisode lit le
scénario de cet épisode, et aucun autre. Si cet épisode n'a pas de scénario, FRAME n'en reçoit
aucun, plutôt que celui d'un autre épisode ; l'écran le dit avant la demande, scène par scène.
Une scène sans épisode ne lit que le scénario sans épisode. Pour la scène d'un épisode, les
scènes précédentes transmises sont celles du même épisode. Sans épisode, le contexte garde
exactement sa forme : pour un film, rien ne change. Le profil de FRAME ne change pas
(`frame.decoupage@1`), ni le prix.

À l'écran : le formulaire d'une scène propose l'épisode, pour les séries seulement, avec ce
que l'assistant lira ; la carte de la scène dit son épisode ; un lecteur le lit sans pouvoir
le changer. Un formulaire qui ne porte pas le champ ne touche pas au rattachement.

SE5 est validé localement le 10 octobre 2026, sans appel à un fournisseur — le fournisseur
des tests est factice : 27 tests de plus, suite complète de l'API à 1 819 tests,
993 tests SQL (20 de plus). Trente-trois sabotages attrapés un par un — vingt dans
le code, treize à chaud dans la base locale. Rendu réel du storyboard sur un serveur de
production local, 17 points sur 17 — porteur et lecteur ; une série et un film ; les trois
avertissements, scène par scène —, données d'essai retirées.

**Non couvert** : l'affichage à 375 px ; les clics dans un navigateur — l'envoi du formulaire
d'une scène est éprouvé par l'API et par la lecture du code ; ce que FRAME fait réellement de
l'épisode qu'il reçoit, qui ne se vérifie qu'en recette.

**À savoir** : dans une série, une scène sans épisode perd le scénario d'épisode que FRAME
lisait jusqu'ici par hasard — aucun cas en production. BOARD, GEAR et les exports lisent les
scènes sans leur épisode : inchangé, hors lot.

**Un test hors lot tombe par intermittence en local** : `tests/statistiques-ecran.test.mjs`,
« un administrateur lit des comptages », sur un délai d'exécution dépassé (`57014`). Il a
échoué une fois dans la suite complète, puis une fois sur trois rejoué seul. La base locale
compte plus de 24 000 projets et près de 40 000 comptes d'essai, accumulés par les suites :
`statistiques_usage()` y frôle la borne. Ce lot ne touche pas cette fonction. À traiter à
part — purger la base locale, ou alléger la lecture ; la base de la CI, neuve à chaque
passage, n'est pas concernée.

SE5 est en production depuis le 10 octobre 2026 (PR 180, `64b9aa4`), soixante-douze
migrations en base. **La migration a été poussée avant la fusion**, à l'inverse de l'ordre
habituel : la page du storyboard lit la colonne nouvelle avec chaque scène, et le code
déployé avant elle aurait affiché tous les storyboards vides jusqu'à la poussée. La migration
ne fait qu'ajouter — le code d'avant l'ignore —, ce qui rendait l'ordre inverse sûr. À
retenir : quand le code lit une colonne nouvelle, la migration passe d'abord.

Vérifié en base par lecture seule : la colonne, facultative et sans défaut ; le lien qui se
vide quand l'épisode est retiré ; le déclencheur, dont la fonction ne s'appelle pas
directement ; le droit d'écrire la colonne pour les comptes, rien de lisible pour un visiteur
ni pour le worker ; le contexte du découpage au worker seul ; les cinq politiques des scènes,
inchangées. Deux scènes en base, aucune rattachée ; aucun découpage en file ni en cours. La CI
de la PR, sur une base neuve, passe en entier : le test des statistiques qui tombait en local
y passe. CI de `main` verte, déploiement Vercel terminé, worker redéployé sur ce commit.

**Non vu en production** : le storyboard sous session, et FRAME sur la scène d'un épisode —
la base ne compte aucun épisode, et aucun appel réel n'a été fait.

Les limites des séries auditées le 10 octobre sont traitées, sauf le score de maturité,
laissé tel quel par décision. **Reste, hors lot** : le test des statistiques, intermittent sur
une base locale chargée.

Le test des statistiques, audité le 10 octobre 2026. Sa lenteur tenait au seul volume de la
base locale : `statistiques_usage()` s'exécute sous les droits de l'appelant, dans le délai de
huit secondes des comptes, et chaque comptage y paie la RLS ligne par ligne — 5,4 secondes au
repos sur une base qui portait près de 40 000 comptes et 24 000 projets d'essai, davantage
pendant une suite. La base locale a été remise à zéro depuis les migrations, sur accord. La
lecture n'est pas réécrite : elle ralentira avec la plateforme, à revoir alors.

L'audit a trouvé un défaut sans rapport avec le volume. `project_members` n'avait qu'une règle
de lecture, celle des membres : un administrateur n'y lisait que les équipes dont il fait
partie. Le comptage « membres d'équipe » des statistiques ne comptait donc pas la plateforme
— le défaut même que le lot Z3 voulait éviter —, et la règle « les administrateurs ont accès
à tout » n'était pas tenue pour cette table. En production, la table ne portait qu'une
adhésion, celle d'un administrateur : aucun écart n'était visible.

Lot Z4 : une règle de lecture de plus sur `project_members`, pour les administrateurs,
écrite comme celle des projets. Rien d'autre ne change : ni l'écriture, ni la règle des
membres, ni le mode privé. Un administrateur lisait déjà l'équipe de tout projet, par
`equipe_du_projet()` ; aucun écran ne change. Un test SQL compare désormais, pour chacune des
quinze tables que lisent les statistiques, ce qui existe et ce qu'un administrateur lit, et
refuse qu'une table lue par la fonction manque à sa liste.

Z4 est validé localement le 10 octobre 2026, sur la base remise à zéro : 7 tests de
plus, suite complète de l'API à 1 826 tests, 1 005 tests SQL (12 de plus). Six
sabotages à chaud attrapés un par un. Le test SQL supposait d'abord une base vide et aurait
échoué en CI, où il tourne après la suite de l'API : corrigé avant le commit, et les sabotages
rejoués avec le test corrigé.

**Non couvert** : la rubrique Statistiques vue sous session. Aucun fichier de l'application
ni du worker ne change.

**À savoir** : un administrateur hors équipe ne change ni ne retire un membre par cette
table — la règle ne donne que la lecture, comme avant pour l'écriture.

**Reste à faire** : pousser la migration `20261011000000_admin_lit_equipes.sql`, puis
vérifier la règle en production. Elle ne fait qu'ajouter : l'ordre avec la fusion est libre.
