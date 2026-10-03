-- Score de maturité, lot S2 : les faits de plusieurs projets en une lecture.
--
-- Une liste de projets affiche le score de chacun. Appeler `faits_maturite()`
-- projet par projet ferait trois requêtes par carte : cette fonction les
-- remplace par une seule.
--
-- Aucune table, aucune politique : la fonction s'appuie sur `faits_maturite()`
-- et sur `peut_gerer_budget()`, sans en réécrire les règles.
--
-- Retour arrière : `drop function public.faits_maturite_projets(uuid[]);`

-- Les faits des seuls projets dont l'appelant gère le budget : le score en
-- tient compte, et suit sa règle de lecture. Un lecteur de l'équipe, un compte
-- étranger ou un projet inexistant ne donnent aucune ligne.
--
-- Sans `security definer` : la RLS de l'appelant s'applique à chaque table
-- lue, comme dans `faits_maturite()`.
--
-- Cent projets au plus : au-delà, la lecture pèserait sur la page qui la
-- demande. Même valeur que `LIMITE_SCORES_LISTE` dans `src/lib/maturite.ts`.
create or replace function public.faits_maturite_projets(p_project_ids uuid[])
returns table (project_id uuid, faits jsonb)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if coalesce(cardinality(p_project_ids), 0) > 100 then
    raise exception 'Trop de projets demandés : 100 au plus.'
      using errcode = '22023';
  end if;

  return query
    select p.id, public.faits_maturite(p.id)
    from public.projects p
    where p.id = any (p_project_ids)
      and public.peut_gerer_budget(p.id);
end;
$$;

-- Sans `security definer`, mais fermée aux visiteurs tout de même.
revoke all on function public.faits_maturite_projets(uuid[]) from public, anon;
grant execute on function public.faits_maturite_projets(uuid[]) to authenticated;
