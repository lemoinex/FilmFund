# Suivi du backlog — directives de fiabilité

Tiré de `docs/implementation-audit.md` (section 13). Aucun ticket n'est coché avant d'être
réellement validé. Deux statuts de fin sont distincts : **validé localement** (tests et
navigateur sur la pile locale) et **validé en recette** (conditions réelles, fournisseurs
réels).

| Lot | Ticket                                                                                                                         | Statut                                      | Bloqué par       |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ---------------- |
| A   | Journal des actions d'administration                                                                                           | validé en recette                           | —                |
| B   | Versions de documents                                                                                                          | validé en recette                           | —                |
| C   | Envois d'images orphelins                                                                                                      | validé en recette                           | —                |
| D   | Durcissements mineurs (`is_admin()` en `(select …)`, `touch_updated_at`, test du jeton expiré)                                 | validé en recette                           | —                |
| E   | Modèle studio (socle : studio personnel, projets rattachés, isolation)                                                         | validé en recette                           | —                |
| F   | Plans, profils, registres distincts — F1 : plans versionnés, abonnements, limites projets et membres ; F2 : limite de stockage | F1 validé en recette ; F2 validé localement | —                |
| G   | Devis, réservation atomique, idempotence                                                                                       | bloqué                                      | F                |
| H   | Tâches persistantes, outbox, rapprochement                                                                                     | bloqué                                      | Décision 4, G    |
| I   | Passerelle IA et premier agent (WEAVER)                                                                                        | bloqué                                      | Décision 3, B, H |
| J   | Autres agents                                                                                                                  | bloqué                                      | I                |
| K   | BOARD (quota image, croquis noir et blanc)                                                                                     | bloqué                                      | I, décision 7    |
| L   | SCOUT, GRIOT, MATCH (sources et provenance)                                                                                    | bloqué                                      | I, décision 7    |
| M   | Exports PDF                                                                                                                    | bloqué                                      | Décision 8       |
| N   | Paiements                                                                                                                      | bloqué                                      | Décision 6, F    |
| O   | Interface des quotas et incidents                                                                                              | bloqué                                      | F à N            |
| P   | Recette intégrée avant ouverture commerciale                                                                                   | bloqué                                      | Tous             |

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
