# Mise à jour des rôles des API — rapport

Mission du 11 octobre 2026 : vérifier les rôles d'Anthropic, d'OpenAI et de Perplexity, puis
actualiser leur affectation. Branche `chore/roles-api`. **Rien n'est commité, poussé ni
déployé ; aucun appel payant n'a été fait.**

## PROGRESSION

- [x] 1. Répartition cible lue
- [x] 2. Audit du fonctionnement actuel
- [x] 3. Matrice de conformité
- [x] 4. Corrections minimales
- [x] 5. Politique de sélection des modèles : documentée, non appliquée (voir DECISIONS)
- [x] 6. Les deux chaînes fonctionnelles vérifiées
- [x] 7. Replis et anciennes configurations inspectés
- [x] 8. Tests ciblés
- [x] 9. Livrable final

## MATRICE

Seules les fonctionnalités réellement présentes y figurent. « Code » : lu dans le code
exécuté. « Test » : tenu par `tests/roles-fournisseurs.test.mjs`. « Production » : lu dans le
registre des coûts de la base de production, en lecture seule.

| Fonctionnalité                                         | Fournisseur appelé                              | Modèle ou service                               | Fournisseur cible         | Point d'appel                                    | État                                                                     | Modification                            |
| ------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- | ------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------- |
| Logline (pitch)                                        | Anthropic                                       | `claude-opus-5-5`, effort moyen                 | Anthropic                 | `weaver.logline@1`                               | conforme — code, test, production (28 appels)                            | aucune                                  |
| Synopsis court, standard, détaillé                     | Anthropic                                       | `claude-opus-5-5`                               | Anthropic                 | `weaver.synopsis_*@1`                            | conforme — code, test, production                                        | aucune                                  |
| Notes d'intention et de réalisation, pitchs            | Anthropic                                       | `claude-opus-5-5`                               | Anthropic                 | `weaver.note_*@1`, `weaver.pitch_*@1`            | conforme — code, test, production                                        | aucune                                  |
| Retouches d'un passage                                 | Anthropic                                       | `claude-opus-5-5`, effort faible ou moyen       | Anthropic                 | `weaver.retouche_*@1`                            | conforme — code, test ; aucun appel réel                                 | aucune                                  |
| Traitement, bible, scénario, épisodes                  | Anthropic                                       | `claude-opus-5-5`, effort élevé                 | Anthropic                 | `script.*@1`                                     | conforme — code, test, production                                        | aucune                                  |
| Dialogues                                              | Anthropic                                       | `claude-opus-5-5`                               | Anthropic                 | `voice.dialogues@1`                              | conforme — code, test, production                                        | aucune                                  |
| Analyse dramaturgique, personnages                     | Anthropic                                       | `claude-opus-5-5`, effort élevé                 | Anthropic                 | `arc.*@1`                                        | conforme — code, test, production                                        | aucune                                  |
| Découpage d'une scène en plans                         | Anthropic                                       | `claude-opus-5-5`                               | Anthropic                 | `frame.decoupage@1`                              | conforme — code, test, production                                        | aucune                                  |
| Budget, planning, matériel                             | Anthropic                                       | `claude-opus-5-5`                               | Anthropic                 | `field.*@1`, `gear.materiel@1`                   | conforme — code, test, production                                        | aucune                                  |
| Vignette de storyboard                                 | OpenAI                                          | `gpt-image-2.5-flare`, `/v1/images/generations` | OpenAI                    | `board.vignette@1`                               | conforme — code, test ; aucune image produite à ce jour                  | aucune                                  |
| Recherche documentaire, contexte culturel              | Perplexity (collecte) puis Anthropic (synthèse) | API `/search` ; `claude-opus-5-5`               | Perplexity puis Anthropic | `scout.recherche@1`, `griot.contexte@1`          | conforme — code, test, production                                        | aucune                                  |
| Veille des opportunités (fonds, festivals, résidences) | Perplexity (collecte) puis Anthropic (relevé)   | API `/search` ; `claude-opus-5-5`               | Perplexity puis Anthropic | `match.veille@1`                                 | conforme — code, test, production                                        | aucune                                  |
| Libellé d'Anthropic dans Intégrations IA               | —                                               | —                                               | —                         | `src/lib/integrations-ia.ts`                     | **à corriger** : ne citait que le pitch                                  | **corrigé**                             |
| Document des rôles                                     | —                                               | —                                               | —                         | `docs/roles-anthropic-openai-filmfund-africa.md` | **à corriger** : ignorait Perplexity, décrivait des clés d'environnement | **corrigé** par une section d'état réel |

Fonctionnalités de la cible **absentes** de l'application, signalées et non développées :

- **Analyse d'adéquation entre un projet et une opportunité par un modèle.** La compatibilité
  existe, mais par règles lisibles, sans IA (`src/lib/compatibilite.ts`).
- **Retouche d'une image de storyboard.** Seule la génération existe ; l'adresse de retouche
  n'est pas appelée.
- **Références visuelles** (personnages, costumes, décors) transmises au modèle d'image.
- **Vérification automatique des pages officielles.** Toute source naît « non vérifiée » ; une
  opportunité ne devient « vérifiée » que par un administrateur, à la main, avec sa source, sa
  date de collecte et son extrait. Ce mécanisme manuel est préservé.
- **Recherche stratégique approfondie**, et **modèle léger** pour les tâches simples.

Usages hors périmètre (embeddings, audio, modération) : **aucun trouvé**.

## DECISIONS

1. **Aucun changement de fournisseur.** Le code exécuté était déjà conforme à la cible.
2. **Aucun changement de modèle.** Tout le texte tourne sur `claude-opus-5-5`. La distinction
   entre écriture courante et analyse exigeante existe déjà, mais par l'**effort** du profil
   (faible, moyen, élevé), non par le modèle : c'est le « mécanisme existant de choix du niveau
   d'analyse », et je l'ai conservé. Passer l'écriture courante sur Sonnet 5.5 est l'écart
   principal avec la cible ; je ne l'ai pas appliqué, pour quatre raisons :
   - changer le modèle d'un profil, c'est publier une version nouvelle de ce profil — règle du
     dépôt —, soit une quinzaine de profils ;
   - le tarif du nouveau modèle doit être relevé sur la page de prix, pas supposé ;
   - les sorties validées en recette l'ont été avec le modèle actuel ;
   - le script demande une comparaison sur des cas métier avant de généraliser, et elle
     suppose des appels payants, exclus de cette mission.
3. **Perplexity reste sur son API de recherche**, sans modèle Sonar. Décision du dépôt du
   6 octobre 2026 : le moteur rend des pages et ne rédige rien. Sonar Pro rédige une réponse,
   ce qui déplacerait la synthèse d'Anthropic vers Perplexity, à l'inverse de la cible.
4. **Le document des rôles n'est ni renommé ni réécrit** : `CLAUDE.md` le cite par son nom. Une
   section datée, en tête, dit l'état réel et prime sur la suite.
5. **Le rapport est à la racine**, comme le demande le script, alors que les documents du dépôt
   vivent dans `docs/`. À déplacer ou à ne pas versionner, selon votre choix.

## BLOCAGES

- **Références de modèles non confirmées.** Je n'ai consulté aucun catalogue officiel pendant
  la mission. `claude-sonnet-5-5` est un identifiant que je connais, sans l'avoir vérifié par
  la documentation ni par un appel. GPT Image 1.5, GPT Image 2.5 Sunburst, Sonar Pro et l'Agent
  API de Perplexity n'ont pas été vérifiés.
- **Aucune image n'a jamais été produite en production.** Le compte OpenAI était sans crédits
  lors des essais d'octobre ; le modèle `gpt-image-2.5-flare` n'est donc confirmé par aucun
  appel réussi.
- **Écrans non vus** : le nouveau libellé n'a pas été regardé dans un navigateur.

## TESTS

| Contrôle                                            | Résultat                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typage (application et worker), format, build | passent                                                                                                                               |
| `tests/roles-fournisseurs.test.mjs`                 | 14 sur 14                                                                                                                             |
| Suite complète de l'API                             | 1 869 sur 1 869                                                                                                                       |
| Sabotages                                           | 3 attrapés : un profil d'écriture passé sur un modèle d'OpenAI ; la passerelle appelant OpenAI pour du texte ; l'ancien libellé remis |

Ce que le test tient : tout profil exporté est inscrit à la matrice ; chaque fournisseur reste
dans son rôle ; la passerelle n'a que deux adresses fixes hors du SDK d'Anthropic ; aucune
bascule entre fournisseurs ; le seul repli reste chez Anthropic, et le modèle servi est gardé ;
aucun nom de modèle hors des profils ; les libellés de l'écran disent le rôle d'aujourd'hui.

**Ces tests lisent le code ; ils n'appellent aucun fournisseur.** Ils prouvent une
affectation, pas qu'un fournisseur répond. Tests SQL non relancés : aucun fichier SQL touché.

## LIVRABLE

### 1. Matrice finale des rôles

| Fournisseur | Rôle                                                                            | Ne fait pas                    |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------ |
| Anthropic   | écriture, analyse, propositions structurées, découpage, synthèse des recherches | image, recherche sur le web    |
| OpenAI      | vignette de storyboard                                                          | texte, analyse, recherche      |
| Perplexity  | collecte des sources d'une recherche                                            | rédaction, image, vérification |

### 2. Anciennes affectations identifiées

Aucune dans le code exécuté, ni dans les valeurs par défaut, ni dans les replis, ni en base.
Deux dans ce qui se lit : le libellé d'Anthropic à l'écran, et le document des rôles.

### 3. Corrections appliquées

- `src/lib/integrations-ia.ts` : le libellé d'Anthropic dit son rôle réel.
- `docs/roles-anthropic-openai-filmfund-africa.md` : section « État réel au 11 octobre 2026 ».
- `tests/roles-fournisseurs.test.mjs` : nouveau.

### 4. Fichiers modifiés

Les trois ci-dessus, et ce rapport.

### 5. Modèles et variables

- Texte : `claude-opus-5-5` ; replis d'Anthropic tarifés : `claude-opus-5`, `claude-opus-4-8`.
- Image : `gpt-image-2.5-flare`, 1536 × 1024, qualité moyenne.
- Recherche : API `/search` de Perplexity, sans modèle.
- **Aucune variable d'environnement** ne porte un modèle ni une clé. Les modèles sont dans les
  profils versionnés ; les clés dans le coffre de la base, posées depuis Intégrations IA. En
  production, les trois clés sont posées.

### 6. Tests exécutés

Voir TESTS.

### 7. Vérifications non effectuées

- Aucun appel réel à un fournisseur.
- Aucune consultation des catalogues officiels.
- Aucun écran regardé dans un navigateur.
- Les réglages des comptes chez les fournisseurs (crédits, modèles ouverts au compte).

### 8. Actions restantes

- Relire, puis décider du commit de la branche `chore/roles-api`.
- Décider si l'écriture courante doit passer sur un modèle moins coûteux (voir DECISIONS, 2).
- Créditer le compte OpenAI pour qu'une première vignette confirme le modèle d'image.

### Conformité, par niveau

| Niveau        | Constat                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Code          | conforme pour les trois fournisseurs                                                                                      |
| Configuration | conforme : trois clés posées, aucun modèle hors des profils, aucune ancienne valeur en base                               |
| Appel réel    | Anthropic : 60 appels servis par `claude-opus-5-5`, aucun repli. Perplexity : 4 requêtes. OpenAI : aucune image produite. |

### Tableau final

| Usage                 | Ancienne configuration                               | Configuration retenue | Règle de sélection         | Justification                                                            | Niveau de vérification          |
| --------------------- | ---------------------------------------------------- | --------------------- | -------------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| Écriture courante     | Anthropic, `claude-opus-5-5`, effort faible ou moyen | inchangée             | le profil de la demande    | modèle validé en recette ; un changement demande une comparaison payante | code, test, appel réel          |
| Analyse exigeante     | Anthropic, `claude-opus-5-5`, effort élevé           | inchangée             | le profil de la demande    | déjà la configuration avancée                                            | code, test, appel réel          |
| Découpage textuel     | Anthropic, `claude-opus-5-5`                         | inchangée             | profil `frame.decoupage@1` | conforme à la cible                                                      | code, test, appel réel          |
| Image de storyboard   | OpenAI, `gpt-image-2.5-flare`                        | inchangée             | profil `board.vignette@1`  | aucun motif documenté de changer                                         | code, test ; aucun appel réussi |
| Retouche d'image      | absente                                              | absente               | —                          | fonctionnalité non livrée                                                | —                               |
| Recherche courante    | Perplexity `/search`, puis synthèse Anthropic        | inchangée             | profils de recherche       | le moteur ne rédige pas : décision du dépôt                              | code, test, appel réel          |
| Recherche stratégique | absente                                              | absente               | —                          | demanderait une intégration nouvelle                                     | —                               |
| Tâches simples        | absentes comme telles                                | absentes              | —                          | aucun bénéfice démontré                                                  | —                               |

Références proposées : **confirmée par appel réel**, `claude-opus-5-5` ; **configurée sans
appel réussi**, `gpt-image-2.5-flare` ; **non confirmées**, Claude Sonnet 5.5, GPT Image 1.5,
GPT Image 2.5 Sunburst, Sonar Pro, Agent API. Modèles conservés : tous. Changement de modèle
appliqué : aucun. Comparaisons restant à faire : écriture courante sur deux modèles
d'Anthropic ; modèles d'image sur une même séquence de plans.

MISSION ACCOMPLIE — en attente de revue humaine (aucun commit, push ni déploiement effectué).
