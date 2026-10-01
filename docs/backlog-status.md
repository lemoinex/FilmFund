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
| I1  | Passerelle IA et premier agent (WEAVER) : le pitch de bout en bout                                                             | validé localement | —              |
| I1b | Intégrations IA : les clés des fournisseurs posées depuis l'administration, rangées au coffre                                  | validé localement | —              |
| I2  | WEAVER : synopsis court / standard / détaillé, note d'intention                                                                | à faire           | recette de I1  |
| J   | Autres agents                                                                                                                  | bloqué            | I1             |
| K   | BOARD (quota image, croquis noir et blanc)                                                                                     | bloqué            | I1, décision 7 |
| L   | SCOUT, GRIOT, MATCH (sources et provenance)                                                                                    | bloqué            | I1, décision 7 |
| M   | Exports PDF                                                                                                                    | bloqué            | Décision 8     |
| N   | Paiements                                                                                                                      | bloqué            | Décision 6, F  |
| O   | Interface des quotas et incidents                                                                                              | bloqué            | F à N          |
| P   | Recette intégrée avant ouverture commerciale                                                                                   | bloqué            | Tous           |

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
