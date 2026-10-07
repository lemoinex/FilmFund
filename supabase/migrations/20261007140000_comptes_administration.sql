-- Administration des comptes (lot V1) : la liste que l'administration lit.
--
-- Un administrateur lit déjà tous les profils, par la RLS. Il lui manquait ce
-- que `profiles` ne porte pas et que `auth.users` ne livre à aucun compte :
-- l'adresse, sa confirmation, la date de création et la dernière connexion.
-- Sans l'adresse, un compte ne se reconnaît pas — deux personnes peuvent
-- porter le même nom affiché — et `definir_role()` désigne le sien par elle.
--
-- Une seule fonction, en lecture : elle ne change rien, donc rien n'est
-- journalisé. Le changement de rôle reste celui de `definir_role()`, livrée
-- et journalisée depuis le premier jour, que le mode privé gèle toujours.
--
-- Ce qu'elle ne rend pas : ni mot de passe, ni jeton, ni téléphone, ni
-- métadonnées du compte — rien d'autre de `auth.users` que ces quatre
-- colonnes.
--
-- Aucune table nouvelle : ni RLS, ni politique du mode privé à poser. En mode
-- privé, la fonction reste réservée aux administrateurs, comme hors de lui.
--
-- Retour arrière :
--   `drop function public.comptes_administration(text, integer, integer, uuid)`.

create function public.comptes_administration(
  p_recherche text default '',
  p_limite integer default 50,
  p_decalage integer default 0,
  p_compte uuid default null
)
returns table (
  id uuid,
  email text,
  email_confirme boolean,
  cree_le timestamptz,
  derniere_connexion timestamptz,
  display_name text,
  role public.user_role,
  profile_type public.profile_type,
  country text,
  total bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recherche text := lower(btrim(coalesce(p_recherche, '')));
begin
  if (select auth.uid()) is null or not public.is_admin() then
    raise exception 'Action réservée à l''administration.' using errcode = '42501';
  end if;

  -- Une liste d'adresses ne se demande pas d'un bloc : cent comptes au plus
  -- par appel, et une recherche qui tient sur une ligne.
  if p_limite is null or p_limite not between 1 and 100
     or p_decalage is null or p_decalage not between 0 and 1000000
     or char_length(v_recherche) > 120 or v_recherche ~ '[[:cntrl:]]' then
    raise exception 'Demande de comptes hors des bornes admises.' using errcode = '22023';
  end if;

  -- `strpos` et non `like` : le texte cherché n'est jamais lu comme un motif.
  return query
  select
    u.id,
    u.email::text,
    u.email_confirmed_at is not null,
    u.created_at,
    u.last_sign_in_at,
    p.display_name,
    p.role,
    p.profile_type,
    p.country,
    count(*) over ()
  from auth.users u
  join public.profiles p on p.id = u.id
  where (p_compte is null or u.id = p_compte)
    and (
      v_recherche = ''
      or strpos(lower(coalesce(u.email, '')), v_recherche) > 0
      or strpos(lower(p.display_name), v_recherche) > 0
      or strpos(lower(p.first_name), v_recherche) > 0
      or strpos(lower(p.last_name), v_recherche) > 0
    )
  order by u.created_at desc, u.id
  limit p_limite
  offset p_decalage;
end;
$$;

comment on function public.comptes_administration(text, integer, integer, uuid) is
  'Comptes de la plateforme, pour l''administration : adresse, confirmation, création, dernière connexion, et l''essentiel du profil. Réservée aux administrateurs ; cent comptes au plus par appel.';

revoke all on function public.comptes_administration(text, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.comptes_administration(text, integer, integer, uuid)
  to authenticated;
