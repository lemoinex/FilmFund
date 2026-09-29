# Mode privé : application réservée aux administrateurs

Mode temporaire : seuls les comptes de la liste blanche accèdent à l'application, les
inscriptions sont fermées, et la gestion des membres est réservée aux administrateurs.
Aucune donnée n'est supprimée ; lever le mode rétablit le comportement habituel.

## Trois verrous, à activer ensemble

| Verrou          | Où                                                                   | Ce qu'il protège                                                                                                                                                                          |
| --------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application     | Variables Vercel `PRIVATE_ADMIN_ONLY_MODE` et `ALLOWED_ADMIN_EMAILS` | Pages (redirection vers `/acces-refuse`), actions serveur (refus `403` par le middleware, puis par l'action elle-même), inscription, liens d'inscription                                  |
| Base de données | `public.app_settings.private_admin_only`                             | Lecture et écriture réservées aux administrateurs (`is_admin()`) sur toutes les tables ; gestion des membres réservée aux administrateurs ; changement de rôle applicatif interdit à tous |
| Supabase Auth   | Dashboard                                                            | Création de compte par appel direct à l'API d'authentification                                                                                                                            |

Les deux premiers se complètent : la liste blanche décide qui entre dans l'application, le rôle
administrateur décide qui lit les données. Les comptes autorisés doivent donc **à la fois**
figurer dans `ALLOWED_ADMIN_EMAILS` **et** avoir le rôle `admin` dans `public.profiles`.

Les valeurs réelles ne figurent jamais dans le dépôt : `.env.example` ne porte que les noms.

## Activation en production — dans cet ordre

L'ordre compte : activer le verrou en base avant que les comptes autorisés soient
administrateurs fermerait l'application à tout le monde, eux compris.

1. **Vérifier les comptes autorisés** (SQL Editor, lecture seule) : chacun doit exister, avoir
   confirmé son adresse, posséder un profil et le rôle `admin`.
2. **Les promouvoir si nécessaire**, par une requête SQL directe examinée au préalable. Aucun
   compte ne peut le faire depuis l'application tant qu'aucun administrateur n'existe.
3. **Appliquer la migration** `20260929220000_mode_prive_administrateurs.sql`
   (`supabase db push`). Elle est inerte tant que l'interrupteur est à `false`.
4. **Configurer Vercel** (Production) : `PRIVATE_ADMIN_ONLY_MODE=true` et
   `ALLOWED_ADMIN_EMAILS=<adresses séparées par des virgules>`, puis **redéployer** — les
   pages publiques sont construites à l'avance et ne relisent pas ces variables sans
   redéploiement.
5. **Activer le verrou en base** (SQL Editor) :

   ```sql
   update public.app_settings set private_admin_only = true where id;
   ```

6. **Fermer les inscriptions** — action manuelle obligatoire :

   ```text
   Supabase Dashboard
   → Authentication
   → Configuration / General configuration
   → désactiver « Allow new users to sign up »
   ```

   Sans cette étape, un appel direct à l'API d'authentification crée encore un compte. Il
   n'entrerait pas dans l'application et ne lirait aucune donnée, mais le compte existerait.

7. **Vérifier** avec chacun des deux comptes : connexion, tableau de bord, projets, budget,
   équipe. Et avec tout autre compte : arrivée sur `/acces-refuse`.

## Ce que le mode privé bloque

| Qui                        | Pages           | Actions serveur | Données (RLS)               | Gestion des membres | Rôles applicatifs |
| -------------------------- | --------------- | --------------- | --------------------------- | ------------------- | ----------------- |
| Visiteur non connecté      | `/connexion`    | refusées        | aucune                      | —                   | —                 |
| Compte hors liste blanche  | `/acces-refuse` | `403`           | aucune, pas même son profil | bloquée             | bloqués           |
| Administrateur de la liste | toutes          | autorisées      | toutes, comme avant         | autorisée           | bloqués           |

Restent accessibles à tous : l'accueil, les pages légales, la connexion, la réinitialisation de
mot de passe et les routes `/auth/*` (liens reçus par e-mail, déconnexion).

## Lever le mode privé

Sans rien retirer, en inversant les étapes :

1. `update public.app_settings set private_admin_only = false where id;`
2. Vercel : `PRIVATE_ADMIN_ONLY_MODE=false` (ou suppression de la variable), puis redéploiement.
3. Supabase Dashboard : réactiver « Allow new users to sign up ».
4. Vérifier l'inscription d'un compte de test, la création d'un projet et l'invitation d'un
   membre.

Les politiques et déclencheurs du mode privé restent en place, inertes. Pour les retirer
définitivement, **après** ces tests : copier
`supabase/rollbacks/20260929220000_mode_prive_administrateurs.rollback.sql` dans
`supabase/migrations/` sous un nouveau nom horodaté, et suivre le parcours habituel (branche,
pull request, CI, `supabase db push`).

## Tests

- `tests/mode-prive.test.mjs` : active le verrou en base, éprouve chaque refus et chaque droit
  conservé, puis le lève. Il bascule un réglage global : `npm test` exécute donc les fichiers
  un par un.
- `tests/acces-prive.test.mjs` : la liste blanche côté application (casse, espaces, liste vide,
  valeurs ambiguës du drapeau).
