-- Statistiques d'usage : la lecture de l'écran d'administration (lot Z3).
--
-- Des comptages, et rien d'autre : ni nom, ni adresse, ni titre, ni contenu,
-- ni montant, ni identifiant. Une seule fonction les rend tous, pour que la
-- page ne fasse pas quinze lectures.
--
-- Elle s'exécute **avec les droits de l'appelant**. Les administrateurs lisent
-- déjà chacune de ces tables sous la RLS ; la fonction ne leur ouvre rien.
-- Un compte ordinaire, lui, ne compterait que ce qu'il voit — ses propres
-- projets —, ce qui passerait pour les chiffres de la plateforme : la
-- fonction le refuse nommément au lieu de rendre des nombres trompeurs.
--
-- « Anonymisées » a une limite que l'écran dit : avec très peu de comptes, un
-- comptage désigne quelqu'un. Aucun seuil ne masque les petits nombres — tout
-- serait masqué.
--
-- Retour arrière — aucune donnée perdue :
--   `drop function public.statistiques_usage()`.

create or replace function public.statistiques_usage()
returns table (domaine text, cle text, detail text, nombre bigint)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Lecture réservée à l''administration.' using errcode = '42501';
  end if;

  return query
    select 'comptes'::text, 'total'::text, null::text, count(*) from public.profiles
    union all
    select 'comptes', 'administrateurs', null, count(*) from public.profiles p where p.role = 'admin'
    union all
    select 'comptes', 'suspendus', null, count(*) from public.account_suspensions

    union all
    select 'studios_par_plan', a.plan_code, null, count(*)
    from public.studio_subscriptions a
    group by a.plan_code

    union all
    select 'projets_par_format', p.format::text, null, count(*)
    from public.projects p
    group by p.format
    union all
    select 'projets_par_etape', p.stage::text, null, count(*)
    from public.projects p
    group by p.stage

    union all
    select 'documents', d.type::text, d.status::text, count(*)
    from public.project_documents d
    group by d.type, d.status

    union all
    select 'contenus', 'personnages', null, count(*) from public.project_characters
    union all
    select 'contenus', 'scenes', null, count(*) from public.storyboard_scenes
    union all
    select 'contenus', 'plans', null, count(*) from public.scene_shots
    union all
    select 'contenus', 'equipements', null, count(*) from public.project_gear
    union all
    select 'contenus', 'candidatures', null, count(*) from public.project_fundings
    union all
    select 'contenus', 'membres_equipe', null, count(*) from public.project_members

    -- Trente jours glissants : l'activité récente, pas l'historique.
    union all
    select 'demandes_30j', j.action, j.state, count(*)
    from public.jobs j
    where j.created_at >= now() - interval '30 days'
    group by j.action, j.state

    union all
    select 'propositions', s.action, s.state, count(*)
    from public.ai_suggestions s
    group by s.action, s.state

    -- Les exports encore disponibles : ils expirent au bout de trente jours.
    union all
    select 'exports', e.format, null, count(*)
    from public.project_exports e
    group by e.format

    union all
    select 'opportunites', o.status, null, count(*)
    from public.funding_opportunities o
    group by o.status;
end;
$$;

comment on function public.statistiques_usage() is
  'Comptages d''usage de la plateforme, pour l''écran de l''administration : ni nom, ni titre, ni contenu, ni montant. Sous les droits de l''appelant, et refusée à qui n''est pas administrateur.';

revoke all on function public.statistiques_usage() from public, anon, authenticated;
grant execute on function public.statistiques_usage() to authenticated;
