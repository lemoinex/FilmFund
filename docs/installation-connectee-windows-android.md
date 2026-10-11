# Application installable et connectée — Windows et Android

Lot IN1, 11 octobre 2026. **Périmètre local terminé ; activation et validation externes
restantes** : rien de ce qui suit n'est déployé, aucun paquet Android n'est compilé, aucune
installation n'a été faite sur un appareil.

## 1. Architecture retenue

```text
Icône installée (Windows ou Android)
               ↓
https://filmfund.vercel.app  — le domaine public
               ↓
Application web et serveur existants (Vercel)
               ↓
Supabase + worker (Railway) + fournisseurs d'IA
```

L'application installée **n'embarque rien** : c'est une fenêtre dédiée, ou une enveloppe
Android, qui ouvre le service en ligne. Il n'y a ni export statique, ni copie locale des pages,
ni service worker, ni cache hors ligne. Toutes les fonctions demandent le réseau ; sans lui,
l'application le dit et ne prétend pas être à jour.

Les clés des fournisseurs, les traitements sensibles et les rôles d'Anthropic, d'OpenAI et de
Perplexity ne changent pas : rien n'entre dans le paquet Android ni dans les fichiers publics.

Hors périmètre : un installateur Windows `.exe` ou `.msi`, une publication en boutique.

## 2. Ce que l'audit a trouvé

| Sujet                        | Existant                                              | Écart                                                 | Modification                                           |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Manifest, icônes             | `favicon.ico` seul                                    | rien d'installable                                    | `app/manifest.ts`, cinq icônes dans `public/icons/`    |
| Service worker               | aucun                                                 | non requis par le lot                                 | aucun                                                  |
| Version du build             | aucune                                                | une fenêtre ouverte ignore un déploiement             | `/api/version` et le composant d'actualisation         |
| Données                      | relues à chaque navigation et après chaque action     | rien au retour au premier plan ni au retour du réseau | relecture ciblée, jamais pendant une saisie            |
| Temps réel                   | aucun abonnement Supabase                             | demanderait un réglage de production                  | non activé, voir section 7                             |
| Caches                       | pages dynamiques ; vitrine régénérée toutes les 5 min | aucun cache privé côté navigateur                     | rien à changer                                         |
| Garde des routes             | redirige les pages protégées vers la connexion        | trois adresses publiques passaient par la garde       | écartées du filtre de `src/proxy.ts`                   |
| Politique de sécurité (CSP)  | tout vient de l'application                           | aucun                                                 | inchangée : manifest et icônes sont servis par le site |
| Outils Android               | ni Java, ni SDK, ni Bubblewrap sur ce poste           | pas de compilation possible                           | configuration et commandes préparées                   |
| Domaine, déploiement, commit | non relus dans ce lot                                 | **non confirmé** : voir section 9                     | —                                                      |

## 3. Installation sur Windows, depuis le navigateur

Prérequis : Microsoft Edge ou Google Chrome, et le lot déployé.

1. Ouvrir `https://filmfund.vercel.app` et se connecter.
2. Installer, au choix :
   - le bouton **« Installer l'application »**, sous « Se déconnecter » dans la barre latérale —
     il n'apparaît que si le navigateur propose l'installation ;
   - l'icône d'installation dans la barre d'adresse ;
   - le menu du navigateur : Edge → « Applications » → « Installer ce site en tant
     qu'application » ; Chrome → « Caster, enregistrer et partager » → « Installer la page en
     tant qu'application ».
3. L'icône FilmFund Africa apparaît dans le menu Démarrer. Elle ouvre le tableau de bord dans
   une fenêtre dédiée, sans barre d'adresse.

Une page web ne peut pas déclencher une installation d'elle-même : le bouton ne fait que
relayer l'invitation du navigateur. Firefox et Safari sur ordinateur n'installent pas
d'application de cette façon ; dans une fenêtre déjà installée, le bouton ne s'affiche pas.

Désinstaller : menu « … » de la fenêtre → « Désinstaller », ou les paramètres de Windows.

## 4. Android — enveloppe TWA

Une _Trusted Web Activity_ affiche le site en plein écran dans Chrome, sans barre d'adresse,
**à condition que le site reconnaisse l'application** (section 5).

### Ce qui est préparé

- `android/twa-manifest.json` : la configuration de l'enveloppe, à donner à Bubblewrap.
- `android/assetlinks.modele.json` : un modèle documentaire, **non déployable**.
- `.gitignore` : les clés (`*.keystore`, `*.jks`) et les paquets fabriqués ne vont pas dans Git.

| Réglage         | Valeur                                             |
| --------------- | -------------------------------------------------- |
| Paquet          | `app.vercel.filmfund.twa`                          |
| Adresse         | `https://filmfund.vercel.app/tableau-de-bord`      |
| Nom, nom court  | FilmFund Africa, FilmFund                          |
| Version         | `1.0.0`, code `1`                                  |
| Couleur         | `#10141c`                                          |
| Permissions     | aucune ; notifications désactivées                 |
| Sans validation | repli sur un onglet personnalisé (barre d'adresse) |

**L'identifiant du paquet ne se change plus après une première distribution** : un autre
identifiant serait une autre application. À confirmer avant tout build distribué.

`twa-manifest.json` a été écrit à la main, d'après le format de Bubblewrap : **il n'a pas été
validé par l'outil**, absent de ce poste. `bubblewrap init` le régénère ; s'en servir comme
relevé des réponses à donner.

### Commandes, à lancer sur un poste équipé

Prérequis : Node.js, un JDK 17 et le SDK Android — Bubblewrap propose de les installer.

```powershell
npm install --global @bubblewrap/cli
cd android
bubblewrap init --manifest=https://filmfund.vercel.app/manifest.webmanifest
bubblewrap build
```

`init` demande les réglages du tableau ci-dessus, puis propose de créer une clé de signature.
`build` produit un `.apk` et un `.aab`, et affiche l'empreinte SHA-256 du certificat.

**Créer la clé de distribution est une décision** : la perdre, c'est ne plus pouvoir mettre
l'application à jour. Elle se garde hors de Git, avec son mot de passe, en lieu sûr.

Trois certificats à ne pas confondre :

| Certificat      | Usage                                 | Son empreinte va-t-elle sur le site ?         |
| --------------- | ------------------------------------- | --------------------------------------------- |
| de test         | un APK installé à la main pour essai  | oui, le temps de l'essai, puis à retirer      |
| de distribution | l'APK ou l'AAB remis aux utilisateurs | oui                                           |
| de la boutique  | si Google Play re-signe l'application | oui : c'est celui-là que les appareils voient |

Un APK signé par une clé de test n'est pas un paquet de distribution.

## 5. Association entre le site et l'application

Le site publie à `/.well-known/assetlinks.json` le paquet qu'il reconnaît et l'empreinte du
certificat qui le signe. Ici, ce n'est pas un fichier : c'est une route
(`src/app/.well-known/assetlinks.json/route.ts`) qui lit la variable d'environnement
`ANDROID_CERT_SHA256`.

- **Sans cette variable, l'adresse répond 404.** Aucun exemple n'est publié : il passerait
  pour une association valide.
- Avec une ou plusieurs empreintes bien formées, séparées par des virgules, elle répond le
  fichier attendu. Une seule valeur mal formée, et aucune n'est retenue.
- Une empreinte est publique : ce n'est pas un secret. Elle doit seulement être vraie.

État : **aucune empreinte n'existe**, donc aucune association. Pour finaliser :

1. compiler l'enveloppe et relever l'empreinte (`bubblewrap build`, ou
   `keytool -list -v -keystore filmfund.keystore`) ;
2. poser `ANDROID_CERT_SHA256` dans les variables de production de Vercel, puis redéployer ;
3. vérifier que `https://filmfund.vercel.app/.well-known/assetlinks.json` répond 200 et porte
   le paquet et l'empreinte ;
4. installer l'APK : l'application doit s'ouvrir sans barre d'adresse.

Tant que l'association n'est pas validée, l'application s'ouvre quand même, mais dans un onglet
personnalisé avec une barre d'adresse. Une TWA demande Chrome, ou un navigateur compatible,
à jour sur l'appareil ; sans lui, le site s'ouvre dans le navigateur par défaut.

La garde des routes ne redirige pas cette adresse : elle est écartée du filtre, et un test le
vérifie.

## 6. Actualisation du code, sans réinstallation

```text
Code fusionné dans main
        ↓
Build et déploiement de production réussis (Vercel)
        ↓
Domaine public
        ↓
Les fenêtres ouvertes lisent /api/version, puis se rechargent à un moment sûr
```

Un push, une prévisualisation et un déploiement de production ne sont pas la même chose : seul
le dernier change ce que sert le domaine. **Le worker et les migrations ont leurs propres
procédures** (`docs/worker.md`, `supabase db push`) : un déploiement Vercel ne les met pas à
jour.

### La version

- C'est le commit déployé (`VERCEL_GIT_COMMIT_SHA`, à défaut l'identifiant du déploiement) :
  la même au build et à l'exécution, jamais un horodatage.
- `/api/version` la rend, sans session, sans secret, sans cache (`no-store`).
- Chaque page porte la version du build qui l'a rendue ; le composant
  `src/components/actualisation.tsx` la compare à celle du serveur.
- Lectures : à l'arrivée sur une page (une fois par minute au plus), au retour au premier
  plan, au retour du réseau, puis toutes les cinq minutes. Écouteurs et minuteries sont
  retirés quand le composant se démonte.

Sur un poste de développement la version vaut `developpement` et rien n'est jamais rechargé.
**À vérifier après le premier déploiement** : que `/api/version` rend bien un commit. Si Vercel
n'exposait pas ses variables système, la version resterait `developpement` et l'actualisation
automatique serait simplement inactive — sans danger, mais sans effet.

### Le rechargement

La règle est dans `src/lib/actualisation.ts` (`decider`) :

| Situation                                              | Effet                                                |
| ------------------------------------------------------ | ---------------------------------------------------- |
| même version                                           | rien                                                 |
| version nouvelle, page au calme                        | rechargement automatique                             |
| un champ a été modifié sur la page                     | attente, avec une annonce                            |
| un clic ou une frappe depuis moins de 30 secondes      | attente                                              |
| hors connexion                                         | attente                                              |
| déjà rechargé une fois pour cette version, sans succès | annonce seule, bouton « Actualiser » : pas de boucle |

Une version en attente se charge à la première navigation vers une autre page, ou quand
l'utilisateur clique « Actualiser maintenant ». Rien n'est enregistré ni validé à sa place :
ni brouillon forcé, ni proposition acceptée, ni formulaire rejoué. Les brouillons de l'éditeur
gardent leur mécanisme (lot ED3).

Les délais — 30 secondes de calme, 5 minutes entre deux lectures — sont un choix de ce lot.

**Limite** : « une opération sensible est en cours » se déduit de l'activité récente et des
champs modifiés, pas d'un signal de chaque écran. Un envoi de fichier ou une demande à
l'assistant lancés depuis plus de 30 secondes, sans autre geste, sur une page où rien n'a été
saisi, pourraient être interrompus par un rechargement. L'envoi suit toujours un changement de
champ, donc une attente ; une demande à l'assistant tourne sur le serveur et survit au
rechargement de la page.

## 7. Actualisation des données

Les données ne sont pas dans le paquet : elles se lisent du serveur. Elles sont à jour :

- au lancement et à chaque navigation — les pages sont rendues à la demande ;
- après une action — les écrans relisent déjà (`revalidatePath`, `router.refresh`) ;
- **au retour au premier plan et au retour du réseau** — nouveau : la page relit ses données
  (`router.refresh`), une fois par 30 secondes au plus, **jamais pendant une saisie**.

Ce que la relecture ne remplace pas : un champ en cours de saisie, un brouillon, une version.
Les mécanismes de versions et d'acceptation restent seuls à écrire.

**Pas de temps réel.** Aucun écran ne s'abonne à Supabase Realtime : une donnée modifiée par
quelqu'un d'autre pendant qu'un écran reste ouvert n'apparaît qu'au prochain des moments
ci-dessus. L'activer demanderait d'ajouter des tables à la publication `supabase_realtime` —
une migration, donc un changement de production — et de filtrer chaque abonnement par projet
sous la RLS. Rien n'en est préparé au-delà de cette note ; à décider selon le besoin.

Une migration du schéma, une mise à jour des données et une modification du code sont trois
choses : seule la dernière passe par un déploiement Vercel. Une fenêtre restée ouverte sur
l'ancien code garde ce code jusqu'à son rechargement : un changement incompatible du serveur
doit donc rester compatible avec la version précédente le temps que les fenêtres se rechargent.

## 8. Cache et données privées

- Aucun service worker : aucune page authentifiée ni réponse privée n'est mise en cache hors
  ligne. Vérifié dans un navigateur : zéro service worker, zéro cache.
- Le manifest et les icônes sont des fichiers publics, sans donnée.
- Le composant n'écrit qu'une valeur, dans le stockage de session de l'onglet : la version
  pour laquelle il a déjà rechargé. Il ne vide aucun stockage du navigateur.
- Les fichiers versionnés de Next (`/_next/static/`) gardent leur cache long : leur nom change
  à chaque build.

## 9. Ce qui reste non confirmé

- **Domaine, déploiement et commit** : ce lot n'a pas rattaché le domaine au déploiement qui le
  sert. Après la mise en production, `/api/version` le dira : il doit rendre le commit fusionné.
- **L'installation réelle** sur Windows et sur Android.
- **Le rechargement automatique dans un navigateur** : la règle est testée, l'annonce « version
  disponible » a été vue pendant une saisie, mais le rechargement lui-même n'a pas été observé —
  le navigateur d'essai s'est fermé avant.
- **L'apparence des icônes** une fois rognées par Windows ou Android.

## 10. Quand une mise à jour du paquet reste nécessaire

Le code du site et les données n'exigent **aucune** réinstallation. Une nouvelle version de
l'enveloppe Android reste nécessaire si changent :

- l'identifiant du paquet, ou un réglage embarqué — nom, icône, couleurs, adresse de départ ;
- l'adresse du site, sans redirection ni continuité prévue ;
- une permission ou un composant natif ;
- l'outillage de l'enveloppe (Bubblewrap, bibliothèque TWA, version cible d'Android exigée par
  une boutique) ;
- la clé de signature ou le mode de distribution.

Sur Windows, l'application installée relit le manifest d'elle-même : un changement de nom ou
d'icône arrive sans réinstallation, mais pas à l'instant.

## 11. Fichiers

Nouveaux :

- `src/lib/installation.ts`, `src/lib/actualisation.ts` — les règles, sans navigateur ;
- `src/app/manifest.ts`, `src/app/api/version/route.ts`,
  `src/app/.well-known/assetlinks.json/route.ts` ;
- `src/components/actualisation.tsx`, `src/components/installation.tsx` ;
- `public/icons/` — cinq icônes tirées du logo fourni : 192 et 512 ordinaires, 192 et 512
  rognables, 180 pour l'écran d'accueil d'iOS ;
- `android/twa-manifest.json`, `android/assetlinks.modele.json` ;
- `tests/installation-app.test.mjs`.

Modifiés : `src/app/layout.tsx` (métadonnées d'installation, composant d'actualisation),
`src/app/(app)/layout.tsx` (bouton), `src/proxy.ts` (trois adresses écartées du filtre),
`.gitignore`, `.env.example`.

Sans migration, sans dépendance nouvelle, sans appel à un fournisseur d'IA.

## 12. Tests

| Nature                      | Ce qui a été fait                                                                                                                                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Règles, sans navigateur     | `tests/installation-app.test.mjs` : 35 tests ; 21 sabotages attrapés, un par un                                                                                                                                                                                       |
| Serveur local de production | manifest 200 `application/manifest+json` ; `/api/version` 200 `no-store` ; association 404 sans empreinte, 200 avec une empreinte d'essai ; cinq icônes 200 ; lien du manifest, couleur et icône présents sur trois pages ; `/tableau-de-bord` renvoie à la connexion |
| Navigateur réel             | manifest lu ; zéro service worker, zéro cache ; après un changement de version pendant une saisie, la page n'est pas rechargée et l'annonce s'affiche                                                                                                                 |
| Build Android               | **non fait** : aucun outil sur ce poste                                                                                                                                                                                                                               |
| Appareil                    | **non fait**                                                                                                                                                                                                                                                          |
| Production                  | **non fait** : rien n'est déployé                                                                                                                                                                                                                                     |

Scénarios d'actualisation de la mission :

| Scénario                             | Couverture                                                 |
| ------------------------------------ | ---------------------------------------------------------- |
| 1. fenêtre ouverte, version nouvelle | règle testée ; annonce vue dans un navigateur              |
| 2. fermeture puis réouverture        | la page se charge du serveur : rien à faire                |
| 3. retour au premier plan            | règle testée ; lecture déclenchée dans un navigateur       |
| 4. donnée distante modifiée          | relecture au retour et à la navigation ; pas de temps réel |
| 5. saisie active à la détection      | règle testée ; vu dans un navigateur                       |
| 6. perte puis retour du réseau       | règle testée ; non observé dans un navigateur              |
| 7. ancienne session, nouveau serveur | non simulé ; voir la fin de la section 7                   |

Non testés dans ce lot : la connexion et les liens reçus par e-mail dans une fenêtre installée,
le retour arrière d'Android, le clavier virtuel, les envois et téléchargements depuis
l'application installée.

## 13. Livrables

| Livrable                         | Préparé | Compilé    | Testé                                   | Déployé ou publié | Blocage ou action restante                    |
| -------------------------------- | ------- | ---------- | --------------------------------------- | ----------------- | --------------------------------------------- |
| Manifest et icônes               | oui     | build Next | serveur local, navigateur               | non               | fusion et déploiement                         |
| Bouton d'installation            | oui     | build Next | par ses règles ; non vu à l'écran       | non               | à voir sous session après déploiement         |
| Installation Windows             | oui     | sans objet | non                                     | non               | installer depuis Edge après déploiement       |
| Adresse de version               | oui     | build Next | serveur local                           | non               | vérifier qu'elle rend un commit en production |
| Rechargement sûr                 | oui     | build Next | règles ; annonce vue dans un navigateur | non               | rechargement automatique à observer           |
| Relecture des données            | oui     | build Next | règles                                  | non               | à observer sous session                       |
| Temps réel                       | non     | sans objet | sans objet                              | non               | décision ; migration de la publication        |
| Configuration de l'enveloppe TWA | oui     | non        | cohérence avec le site                  | non               | poste équipé : JDK, SDK, Bubblewrap           |
| APK                              | non     | non        | non                                     | non               | outils absents ; clé de signature à décider   |
| Association site-application     | oui     | build Next | serveur local, empreinte d'essai        | non               | empreinte réelle dans `ANDROID_CERT_SHA256`   |
| Publication en boutique          | non     | sans objet | sans objet                              | non               | hors périmètre                                |
