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
| M1  | Exports PDF : contenu du dossier, fabrication par le worker, dépôt et purge                                                    | validé localement | —              |
| M2  | Exports PDF : écran de sélection des sections et téléchargement                                                                | à faire           | M1             |
| N   | Paiements                                                                                                                      | bloqué            | Décision 6, F  |
| O   | Interface des quotas et incidents                                                                                              | bloqué            | F à N          |
| P   | Recette intégrée avant ouverture commerciale                                                                                   | bloqué            | Tous           |

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
