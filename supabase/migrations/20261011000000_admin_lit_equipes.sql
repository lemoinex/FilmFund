-- Les administrateurs lisent les équipes de projet (lot Z4).
--
-- `project_members` n'avait qu'une règle de lecture : « Un membre voit
-- l'équipe de ses projets ». Un administrateur n'y lisait donc que les
-- équipes dont il fait lui-même partie. Deux conséquences :
--
--   - le comptage « membres d'équipe » des statistiques d'usage (lot Z3),
--     calculé sous les droits de l'appelant, ne comptait pas la plateforme
--     mais les seules équipes de l'administrateur qui le lisait — le défaut
--     même que ce lot voulait éviter ;
--   - la règle du dépôt, « les administrateurs ont accès à tout », n'était pas
--     tenue pour cette table.
--
-- Une règle de lecture de plus, pour les administrateurs, écrite comme celle
-- des projets. Rien d'autre ne change : ni l'écriture, ni la règle des
-- membres, ni le mode privé, qui reste une règle restrictive.
--
-- Ce que cela ouvre : un administrateur lit directement toute adhésion à un
-- projet. Il les lisait déjà projet par projet, par `equipe_du_projet()`.
--
-- Retour arrière :
--   drop policy "Un administrateur lit toutes les équipes" on public.project_members;

create policy "Un administrateur lit toutes les équipes"
  on public.project_members for select
  to authenticated
  using ((select public.is_admin()));
