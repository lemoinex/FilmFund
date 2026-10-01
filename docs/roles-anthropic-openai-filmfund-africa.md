# Rôles respectifs d’Anthropic et OpenAI — FilmFund Africa

## Décision d’architecture

Anthropic et OpenAI ne sont pas des fournisseurs interchangeables appelés arbitrairement. FilmFund Africa utilise une couche serveur unique `AIService` / `AIProvider` qui centralise tous les appels IA, les permissions, les quotas, les coûts, les validations et les journaux non sensibles.

Aucun composant client, route métier, action serveur, worker ou script ne doit appeler directement un SDK fournisseur hors des adaptateurs autorisés.

```text
Route / Server Action / Worker
        ↓
Service métier / agent
        ↓
AIService ou AIProvider
        ↓
Adaptateur fournisseur
        ↓
Anthropic / OpenAI / image / modèle local
```

Principes :

- Le client ne choisit jamais librement le fournisseur, le modèle, le budget ou les limites.
- Toutes les clés restent côté serveur.
- Aucun fallback payant automatique entre fournisseurs sans politique explicite et testée.
- Une sortie IA est une proposition versionnée, éditable et explicitement acceptée ; elle n’écrase jamais silencieusement une version utilisateur ou approuvée.
- Les appels réels sont soumis à session, autorisation, quota, réservation de coût, journalisation non sensible et règlement ou restitution.

## Répartition recommandée

| Domaine                                    | Fournisseur prioritaire                     | Rôle                                                          | Agents concernés           |
| ------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------- | -------------------------- |
| Écriture narrative longue et structurée    | Anthropic                                   | Rédaction, continuité, réécriture et sorties structurées      | WEAVER, SCRIPT, VOICE      |
| Analyse narrative et recommandations       | Anthropic                                   | Analyse de contexte, cohérence et recommandations explicables | ARC, FRAME, FIELD          |
| Recherche documentaire et synthèse sourcée | Anthropic après collecte contrôlée          | Synthèse, extraction et explication des sources vérifiées     | SCOUT, GRIOT, MATCH        |
| Storyboard                                 | OpenAI ou fournisseur image validé          | Génération visuelle de vignettes                              | BOARD                      |
| Analyse d’images et documents visuels      | OpenAI en priorité                          | Vision multimodale sur références, moodboards et planches     | BOARD, FRAME, GEAR         |
| Audio ou transcription à terme             | Fournisseur audio/multimodal validé         | Transcription, traitement audio et outils voix                | VOICE                      |
| Tâches simples à volume élevé              | Modèle économique validé par administration | Classement ou extraction structurée sous quotas               | Fonctions internes ciblées |

## Anthropic : fournisseur éditorial principal

Anthropic est le fournisseur par défaut du copilote textuel. Il convient aux tâches où la cohérence entre les informations d’un projet est essentielle.

### WEAVER

WEAVER produit ou améliore :

- Logline
- Synopsis court, standard et détaillé
- Note d’intention
- Note de réalisation
- Pitch oral et pitch écrit
- Réécriture, développement, raccourcissement et correction

Le contexte transmis reste minimal et pertinent : genre, langue, cadre culturel choisi, protagoniste, objectif, conflit, enjeu, thème, vision créative, documents validés utiles et objectif exact de la demande.

Ne pas transmettre automatiquement : e-mail, téléphone, adresse, jeton de session, clés, données financières, documents complets non nécessaires, liens signés, fichiers privés ou identifiants techniques inutiles.

### SCRIPT et VOICE

Anthropic peut servir à :

- Développer un traitement à partir de documents validés
- Construire une bible de série : concept, univers, personnages, arcs, saisons, épisodes et pilote
- Proposer des scènes et dialogues avec des intentions dramatiques explicites
- Vérifier la cohérence entre synopsis, note d’intention, traitement, personnages et vision du réalisateur

### ARC, FRAME, FIELD et GEAR

Anthropic peut produire du texte structuré pour :

- `ARC` : personnages, relations, contradictions et progression des arcs
- `FRAME` : découpage narratif et technique, intentions de plans et focales
- `FIELD` : budget, plan de financement, calendrier et risques de faisabilité
- `GEAR` : suggestions de matériel et hypothèses de calcul électrique

Les résultats techniques, électriques, budgétaires ou financiers sont des estimations à vérifier. Ils ne sont jamais affichés comme une garantie, une certification ou un avis professionnel définitif.

## OpenAI : fournisseur visuel et multimodal

OpenAI est réservé aux capacités visuelles ou multimodales lorsqu’elles apportent une valeur claire au produit.

### BOARD

BOARD est chargé du storyboard visuel :

```text
Scène ou script validé
        ↓
Découpage en panneaux
        ↓
Profil BOARD et prompt normalisé
        ↓
Une image par vignette
        ↓
Stockage privé
        ↓
Annotations et données techniques séparées
```

Le profil visuel doit imposer :

```text
Storyboard cinematographic ink sketch.
Black ink lines on white paper.
Monochrome only.
No colour.
No photorealism.
No 3D render.
No coloured digital painting.
```

Règles BOARD :

- Croquis à l’encre noire sur fond blanc uniquement
- Interdiction de couleur, photoréalisme, rendu 3D et peinture numérique colorée
- Une image par panneau lorsque le produit le demande
- Quota image distinct du quota texte
- Plans, focales, durée, mouvement, action, son et annotations stockés dans des champs structurés, pas dessinés dans l’image
- Une vignette approuvée n’est jamais remplacée sans action explicite de l’utilisateur
- En cas de lot partiellement réussi, consommer seulement les images réellement livrées et libérer les réservations non utilisées
- Préserver les vignettes réussies et retourner un statut par vignette

### Analyse multimodale

Plus tard, OpenAI peut être utilisé pour analyser, avec consentement et quota :

- Images de référence
- Storyboards existants
- Moodboards
- Visuels de décor ou costumes
- Scans de documents de production

Les fichiers restent privés, servis avec les politiques Storage existantes et, lorsque nécessaire, par URL signée temporaire.

## SCOUT, GRIOT et MATCH : pipeline avant modèle

SCOUT, GRIOT et MATCH ne dépendent pas d’abord d’un fournisseur IA : leur valeur dépend de la fiabilité des sources.

```text
Collecte de sources autorisées
        ↓
Validation des URL et protection SSRF
        ↓
Stockage de provenance
        ↓
Extraction de faits citables
        ↓
Synthèse IA
        ↓
Affichage avec source, date, statut et incertitude
```

Anthropic est le fournisseur textuel par défaut pour résumer, classer et expliquer les résultats après collecte contrôlée.

Règles :

- Ne jamais inventer une preuve, URL, opportunité, deadline, montant ou critère d’éligibilité
- Conserver URL ou référence, organisme, horodatage, extrait utile, statut et incertitude
- Utiliser les statuts `non_verifie`, `verifie`, `expire`, `introuvable` ou `demo`
- Distinguer donnée non fournie, non trouvée, absente de la source et résultat de démonstration
- Ne jamais présenter un résultat `demo` comme une opportunité réelle
- Présenter le score de compatibilité comme une aide à la décision, jamais comme une garantie de financement
- Centraliser les limites de recherche, pagination, tentatives, profondeur et domaines autorisés
- Protéger les fetchs : HTTPS uniquement, blocage localhost/plages privées/métadonnées cloud, redirections limitées et revalidées, timeout, taille maximale et validation de contenu
- Ne jamais transmettre cookies internes, jetons ou en-têtes d’autorisation aux sources externes

## Politique de routage

Cette politique est côté serveur. Elle sert de référence et ne doit pas être configurable par le navigateur.

```ts
const agentRouting = {
  WEAVER: { provider: "anthropic", modality: "text" },
  SCRIPT: { provider: "anthropic", modality: "text" },
  VOICE: { provider: "anthropic", modality: "text" },
  SCOUT: { provider: "anthropic", modality: "text-with-sources" },
  GRIOT: { provider: "anthropic", modality: "text-with-sources" },
  ARC: { provider: "anthropic", modality: "text" },
  FRAME: { provider: "anthropic", modality: "text" },
  GEAR: { provider: "anthropic", modality: "structured-text" },
  BOARD: { provider: "openai", modality: "image" },
  FIELD: { provider: "anthropic", modality: "structured-text" },
  MATCH: { provider: "anthropic", modality: "text-with-sources" },
} as const;
```

Un agent peut être déclaré dans le registre sans être actif. Son activation exige : fournisseur configuré, permissions, budget, quotas, validation de sécurité, tests et décision produit.

## Sécurité et secrets

Variables strictement serveur, sans valeur dans Git :

```text
ANTHROPIC_API_KEY
OPENAI_API_KEY
AI_SECRETS_MASTER_KEY
```

Règles :

- Jamais de préfixe `NEXT_PUBLIC_` pour une clé fournisseur
- Jamais de clé dans le code, Git, logs, fixtures, migrations, navigateur ou réponse API
- Jamais de clé stockée en clair dans une table applicative
- Une interface d’administration peut ajouter, remplacer, tester ou désactiver un fournisseur, mais ne réaffiche jamais la clé après sauvegarde
- Les clés administrées via dashboard sont chiffrées côté serveur ; la clé maître reste exclusivement dans une variable secrète Vercel ou Railway
- Les tests utilisent des mocks et ne déclenchent aucun appel payant réel

## Ce qu’il faut éviter

- Appeler Anthropic et OpenAI pour une même action utilisateur sans expérimentation explicitement autorisée et plafonnée
- Mettre la logique métier dans les SDK fournisseurs
- Basculer automatiquement vers un autre fournisseur après un échec : cela peut multiplier les coûts et produire des sorties incohérentes
- Activer BOARD avant validation du budget image, du profil visuel, des quotas et du stockage privé
- Présenter des calculs de générateur, budgets, scores de compatibilité ou opportunités comme garantis
- Générer ou afficher une donnée de recherche sans provenance utilisable

## Activation MVP

Activer en premier :

```text
Anthropic → WEAVER → Logline
```

Préparer sans activer de coût réel :

```text
Anthropic → SCRIPT, VOICE, SCOUT, GRIOT, ARC, FRAME, GEAR, FIELD, MATCH
OpenAI → BOARD et analyse d’images
```

Cette répartition donne une responsabilité claire à chaque fournisseur : Anthropic est le moteur éditorial et analytique textuel ; OpenAI est le moteur visuel et multimodal. La couche `AIProvider` permet d’ajuster les fournisseurs ou modèles à l’avenir sans casser les fonctionnalités métier.
