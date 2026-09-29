-- Rétablit le droit d'exécution sur les fonctions d'administration.
--
-- Constaté sur le projet distant après application des migrations
-- précédentes : le rôle `authenticated` n'avait plus le droit d'exécuter
-- `is_admin()`. Or les quatre politiques d'administration l'appellent, si
-- bien qu'aucun administrateur ne pouvait exercer ses droits — la lecture
-- des profils et des projets d'autrui échouait sur une erreur de
-- permission.
--
-- Origine probable : la correction « Function Search Path Mutable » proposée
-- par le Security Advisor de Supabase. Elle recrée la fonction, et une
-- fonction recréée perd les privilèges qui lui avaient été accordés.
--
-- Deux décisions pour que le problème ne revienne pas :
--
--   1. On adopte le `search_path` recommandé, `pg_catalog, public`, plutôt
--      que `public, pg_temp`. Il protège tout autant — pg_catalog en tête
--      empêche qu'un schéma intercalé détourne un appel — et il ne
--      déclenchera plus de suggestion de correction automatique.
--   2. Les GRANT sont réaffirmés ici, dans une migration versionnée. Une
--      correction passée par l'interface serait effacée au prochain
--      `db push` ; celle-ci sera rejouée à l'identique sur chaque
--      environnement.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function public.definir_role(
  email_cible text,
  nouveau_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  id_cible uuid;
begin
  if not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.'
      using errcode = '42501';
  end if;

  select u.id into id_cible
  from auth.users u
  where lower(u.email) = lower(btrim(email_cible));

  if id_cible is null then
    raise exception 'Aucun compte ne correspond à cette adresse e-mail.'
      using errcode = 'P0002';
  end if;

  if id_cible = (select auth.uid()) and nouveau_role <> 'admin' then
    raise exception 'Un administrateur ne peut pas retirer son propre rôle.'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = nouveau_role
  where id = id_cible;
end;
$$;

-- Privilèges : rien pour le pseudo-rôle PUBLIC ni pour les visiteurs
-- anonymes, l'exécution pour les seuls comptes connectés.
revoke all on function public.is_admin() from public, anon;
revoke all on function public.definir_role(text, public.user_role) from public, anon;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.definir_role(text, public.user_role) to authenticated;
