-- Catalogue des opportunités : pas deux fois la même (correctif du lot L4).
--
-- Défaut vu en recette le 6 octobre 2026 : le même fonds est entré trois fois
-- au catalogue, par trois envois du même formulaire. L'écran y poussait — il
-- est corrigé dans le même lot — et rien, en base, ne s'y opposait.
--
-- Une opportunité se reconnaît à son nom chez son organisme, sans tenir
-- compte de la casse ni des espaces autour. Deux appels distincts d'un même
-- organisme portent des noms distincts ; la même opportunité saisie deux fois
-- est refusée, et l'écran renvoie alors vers la fiche à modifier.
--
-- Le catalogue de production est vide au moment de cette migration : aucun
-- doublon n'empêche de poser l'index.
--
-- Retour arrière :
--   `drop index public.funding_opportunities_nom_organisme_unique`.

create unique index funding_opportunities_nom_organisme_unique
  on public.funding_opportunities (lower(btrim(name)), lower(btrim(organization)));

comment on index public.funding_opportunities_nom_organisme_unique is
  'Une opportunité par nom et par organisme, sans tenir compte de la casse : la même saisie deux fois est refusée.';
