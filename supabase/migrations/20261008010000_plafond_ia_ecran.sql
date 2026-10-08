-- Plafond mensuel des dépenses d'IA : ce que son écran lit (lot Y1).
--
-- Le plafond existe depuis le lot I1 (`ai_settings`) : les administrateurs le
-- lisent et le modifient sous la RLS, et chaque changement est journalisé par
-- `ai_settings_journal`. Il ne se changeait qu'en SQL, faute d'écran.
--
-- Il manquait à cet écran une seule lecture : la dépense du mois.
-- `depense_ia_du_mois()` la calcule, mais elle est fermée aux comptes — elle
-- sert au worker, avant chaque appel. Cette migration n'ouvre pas celle-ci :
-- elle en pose une autre, réservée aux administrateurs, qui rend deux nombres
-- et rien d'autre — ni studio, ni projet, ni fournisseur.
--
-- Rien d'autre ne change : ni table, ni politique, ni droit du worker. La
-- borne de saisie de l'écran (50 $) n'est pas une contrainte de la base : la
-- voie SQL décrite dans docs/worker.md reste ouverte à l'exploitant.
--
-- Retour arrière — aucune donnée perdue :
--   `drop function public.depense_ia_administration()`.

-- La dépense du mois civil, en UTC, et le plafond en vigueur. Le mois et le
-- calcul sont ceux que le worker applique avant chaque appel : un seul calcul,
-- lu de deux endroits.
create or replace function public.depense_ia_administration()
returns table (depense numeric, plafond numeric)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Lecture réservée à l''administration.' using errcode = '42501';
  end if;

  return query
    select public.depense_ia_du_mois(), s.monthly_budget_usd
    from public.ai_settings s;
end;
$$;

comment on function public.depense_ia_administration() is
  'Dépense d''IA du mois civil (UTC) et plafond mensuel, pour l''écran de l''administration. Réservée aux administrateurs.';

revoke all on function public.depense_ia_administration() from public, anon, authenticated;
grant execute on function public.depense_ia_administration() to authenticated;
