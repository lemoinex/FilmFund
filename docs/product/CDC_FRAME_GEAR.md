# Cahier des charges — FRAME et GEAR

Découpage technique, matériel et besoin électrique (lot J3c). Arrêté le 5 octobre 2026 avec
l'utilisateur. Ce document dit ce que le lot doit produire ; il ne décrit pas son
implémentation, que chaque sous-lot planifie à son tour.

## 1. Ce qui existe

- **Le storyboard** range des scènes par projet : décor, lieu, moment, description, et un seul
  cadrage par scène (`storyboard_scenes.shot`, neuf valeurs de `shot_type`). Toute l'équipe le
  lit ; le porteur, les éditeurs et les administrateurs l'écrivent.
- **Le modèle des propositions structurées** (décision 9), validé en recette avec le budget et
  le planning : l'agent propose des lignes dans une table fille, l'équipe les accepte ou les
  écarte une à une.
- **Rien pour le découpage ni le matériel** : aucune table, aucun écran.

## 2. FRAME — le découpage technique

**Objet** : pour une scène du storyboard, la liste de ses plans.

Le cadrage que porte déjà une scène reste son **cadrage principal** : rien n'est renommé ni
déplacé. Les plans s'ajoutent à côté.

| Champ         | Contenu                                                       |
| ------------- | ------------------------------------------------------------- |
| Rang          | sa place dans la scène                                        |
| Cadrage       | l'échelle déjà en base (`shot_type`), réutilisée telle quelle |
| Focale        | en millimètres, facultative                                   |
| Angle         | normal, plongée, contre-plongée                               |
| Mouvement     | fixe, panoramique, travelling, à l'épaule, autre              |
| Description   | ce que montre le plan, 500 caractères au plus                 |
| Durée estimée | en secondes, facultative                                      |

**Ce que FRAME propose** : les plans d'une scène à la fois, à partir de la scène, de ce qui la
précède et de la vision artistique du projet. Une scène par demande, vingt plans au plus.

**Ce que FRAME ne fait pas** : il ne touche ni à la scène ni au scénario ; il ne propose aucune
image — c'est le rôle de BOARD — ; il ne nomme ni caméra ni optique de marque.

**Écran** : dans l'onglet Storyboard, sous chaque scène, la liste de ses plans, saisissable à
la main avec ou sans l'assistant.

## 3. GEAR — le matériel et l'électricité

**Objet** : la liste du matériel du tournage, **par projet**, et ce qu'elle demande en courant.
C'est par projet qu'on loue un matériel et qu'on dimensionne un groupe électrogène.

| Champ              | Contenu                                                              |
| ------------------ | -------------------------------------------------------------------- |
| Catégorie          | image, lumière, son, machinerie, énergie, régie                      |
| Désignation        | 200 caractères au plus                                               |
| Quantité           | entier                                                               |
| Puissance unitaire | en watts, facultative ; zéro pour ce qui ne se branche pas           |
| Simultané          | oui ou non : compte-t-il dans la charge en même temps que les autres |

### Les calculs

**Les calculs sont faits par la plateforme, jamais par le modèle.** À partir des puissances
saisies :

- la charge simultanée, en watts ;
- l'intensité sous la tension du projet ;
- la puissance de groupe électrogène conseillée, marge comprise.

Les formules et la marge sont affichées à côté des résultats. Deux réglages par projet :

- **la tension**, 230 V par défaut ;
- **la marge du groupe électrogène**, 30 % par défaut.

Ces deux valeurs par défaut sont un choix du lot, pas une norme : aucune source n'est citée
pour la marge. L'écran le dit, et invite à les faire valider par un chef électricien.

**Ce que GEAR propose** : une liste d'équipements adaptée au format, aux décors et au
découpage. Les puissances qu'il avance sont des ordres de grandeur, annoncés comme tels et à
vérifier sur la plaque de chaque appareil — comme les montants de FIELD.

**Ce que GEAR ne fait pas** : il ne propose ni marque, ni loueur, ni prix — les prix sont au
budget — ; il ne rend aucun calcul.

**Écran** : un nouvel onglet « Matériel », avec la liste par catégorie et un encart « Besoin
électrique ».

## 4. Règles communes

- Propositions acceptées ou écartées une à une, sur le modèle du budget ; rien n'entre sans
  accord, et ce que l'agent a proposé ne change jamais.
- Lecture par toute l'équipe ; écriture par le porteur, les éditeurs et les administrateurs ;
  politique du mode privé sur chaque table nouvelle.
- Un prix au barème pour chaque agent : **4 unités** pour le découpage d'une scène, **5** pour
  une liste de matériel.
- Exports : le découpage et le matériel entrent dans le dossier comme deux sections de plus.

## 5. Découpage en lots

| Lot   | Contenu                                                                                      |
| ----- | -------------------------------------------------------------------------------------------- |
| J3c-1 | Tables et écrans de saisie manuelle du découpage et du matériel, calcul électrique. Sans IA. |
| J3c-2 | FRAME propose les plans d'une scène.                                                         |
| J3c-3 | GEAR propose la liste de matériel.                                                           |
| J3c-4 | Sections « Découpage » et « Matériel » dans les exports.                                     |

J3c-1 vient en premier : la saisie manuelle est utile seule, ne coûte aucun appel, et fixe les
données que les deux agents rempliront ensuite.

## 6. Hors périmètre

- Les images de plans : lot K (BOARD).
- Le plan de travail et le dépouillement.
- Les devis de location et les prix du matériel.
- Toute norme électrique : la plateforme additionne et divise, elle ne certifie rien.
