-- Droits d'administration.
--
-- La migration initiale ne donnait volontairement aucun pouvoir aux
-- administrateurs sur les projets. Ce besoin est désormais exprimé :
-- support, modération et suppression sur demande.
--
-- Ce que cette migration accorde, et ce qu'elle refuse :
--   - lecture de tous les projets : nécessaire au support et à la modération ;
--   - suppression de tout projet : nécessaire pour répondre à une demande
--     d'effacement ou retirer un contenu illicite ;
--   - modification des projets d'autrui : NON. Réécrire le travail d'un
--     auteur sans qu'il le sache ne répond à aucun besoin légitime, et le
--     jour où cela arriverait par erreur, rien ne permettrait de le retracer.
--     Un administrateur qui doit corriger un projet passe par son porteur.

-- ---------------------------------------------------------------------------
-- Projets : lecture et suppression par un administrateur
-- ---------------------------------------------------------------------------

create policy "Un administrateur lit tous les projets"
  on public.projects for select
  to authenticated
  using (public.is_admin());

create policy "Un administrateur supprime tout projet"
  on public.projects for delete
  to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Correction : permettre la création du tout premier administrateur
-- ---------------------------------------------------------------------------

-- Dans sa version initiale, `empecher_changement_de_role` refusait tout
-- changement de rôle à qui n'était pas déjà administrateur. Comme aucun
-- administrateur n'existe au départ, plus personne ne pouvait en créer un :
-- ni par l'application, ni depuis le SQL Editor, où `auth.uid()` est nul.
--
-- La règle devient : le garde-fou ne s'applique qu'aux requêtes venant d'une
-- session applicative. Une requête SQL directe ou passant par le rôle de
-- service en est exemptée — qui dispose d'un accès direct à la base a de
-- toute façon tout pouvoir sur elle, et la RLS interdit déjà le moindre
-- UPDATE à un visiteur anonyme, si bien que ce déclencheur n'est jamais
-- atteint sans authentification par l'API.
create or replace function public.empecher_changement_de_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and (select auth.uid()) is not null
     and not public.is_admin() then
    raise exception 'Seul un administrateur peut modifier un rôle.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promotion et rétrogradation d'un compte
-- ---------------------------------------------------------------------------

-- Le déclencheur `empecher_changement_de_role` interdit à quiconque n'est pas
-- déjà administrateur de toucher un rôle. Cette fonction offre le chemin
-- légitime, réservé aux administrateurs, et identifie le compte par son
-- adresse e-mail plutôt que par son identifiant interne.
create or replace function public.definir_role(
  email_cible text,
  nouveau_role public.user_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
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

  -- Un administrateur ne se rétrograde pas lui-même : sans ce garde-fou, le
  -- dernier administrateur peut se retirer ses propres droits et plus
  -- personne ne peut les lui rendre depuis l'application.
  if id_cible = (select auth.uid()) and nouveau_role <> 'admin' then
    raise exception 'Un administrateur ne peut pas retirer son propre rôle.'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = nouveau_role
  where id = id_cible;
end;
$$;

revoke execute on function public.definir_role(text, public.user_role) from public;
grant execute on function public.definir_role(text, public.user_role) to authenticated;

comment on function public.definir_role(text, public.user_role) is
  'Attribue un rôle à un compte désigné par son adresse e-mail. Réservé aux administrateurs. Le tout premier administrateur se crée par une requête SQL directe, aucun appelant n''étant encore habilité.';
