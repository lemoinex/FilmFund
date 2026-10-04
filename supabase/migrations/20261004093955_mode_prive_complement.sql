-- Mode privé : les trois fonctions que le durcissement du 4 octobre a laissées
-- ouvertes.
--
-- La migration 20261004091003 a mis `equipe_du_projet()` et `mes_invitations()`
-- sous le verrou. Trois fonctions `security definer` appelables par un compte
-- connecté l'ignoraient encore, et chacune forme la paire manquante d'une
-- protection déjà posée :
--
-- 1. `accepter_invitation()` — `mes_invitations()` cache désormais les
--    invitations, mais qui en détient l'identifiant les acceptait encore et
--    entrait dans un projet, mode privé actif. Cacher la liste sans fermer
--    l'action ne protège rien.
-- 2. `refuser_invitation()` — même paire. Supprimer une invitation que la
--    table refuse de montrer reste une écriture.
-- 3. `ecarter_proposition()` — `accepter_proposition()` consulte le verrou
--    depuis sa création ; écarter ne le consultait pas. Un compte non
--    administrateur pouvait donc détruire une proposition sans pouvoir en
--    appliquer aucune.
--
-- Portée réelle : le mode privé n'autorise aujourd'hui que deux comptes, tous
-- deux administrateurs. Aucun de ces trois trous n'est exploitable en l'état ;
-- ils le deviendraient le jour de l'ouverture, c'est-à-dire quand personne n'y
-- penserait plus.
--
-- Le message d'erreur ne distingue pas le refus du verrou de l'absence de
-- droit : un compte n'apprend pas, du refus qu'il reçoit, si l'objet existe.
--
-- Aucune table, aucune politique, aucune donnée modifiée. `create or replace`
-- conserve les droits d'exécution déjà réglés.
--
-- Retour arrière, sans perte : reprendre `accepter_invitation()` et
-- `refuser_invitation()` de 20260929200048_equipes_de_projet.sql, et
-- `ecarter_proposition()` de 20261001091842_passerelle_ia.sql.

-- ---------------------------------------------------------------------------
-- 1. Accepter une invitation
-- ---------------------------------------------------------------------------

create or replace function public.accepter_invitation(p_invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  invitation public.project_invitations;
begin
  -- Mode privé : rien ne se rejoint tant que l'inscription est fermée. Le
  -- refus est celui d'une invitation introuvable, pour ne rien révéler.
  if public.mode_prive() and not public.is_admin() then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;

  select * into invitation
  from public.project_invitations
  where id = p_invitation_id
    and email = public.email_confirme_courant()
  for update;

  -- Même réponse pour une invitation inexistante et pour celle d'un autre :
  -- l'appelant n'apprend rien d'un identifiant qui ne lui est pas destiné.
  if invitation.id is null then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;

  -- Le porteur qui s'invite lui-même n'a rien à rejoindre ; un membre déjà
  -- présent garde son rôle, que le porteur peut changer par ailleurs.
  if not exists (
    select 1 from public.projects
    where id = invitation.project_id
      and owner_id = (select auth.uid())
  ) then
    insert into public.project_members (project_id, user_id, role, job_title, added_by)
    values (
      invitation.project_id,
      (select auth.uid()),
      invitation.role,
      invitation.job_title,
      invitation.invited_by
    )
    on conflict (project_id, user_id) do nothing;
  end if;

  delete from public.project_invitations where id = invitation.id;

  return invitation.project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Refuser une invitation
-- ---------------------------------------------------------------------------

create or replace function public.refuser_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if public.mode_prive() and not public.is_admin() then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;

  delete from public.project_invitations
  where id = p_invitation_id
    and email = public.email_confirme_courant();

  if not found then
    raise exception 'Invitation introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Écarter une proposition
-- ---------------------------------------------------------------------------

-- Reprise de la migration passerelle_ia, avec la même condition que
-- `accepter_proposition()` : le verrou d'abord, le droit ensuite, et un seul
-- message pour les deux.
create or replace function public.ecarter_proposition(p_suggestion_id uuid)
returns public.ai_suggestions
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_proposition public.ai_suggestions;
begin
  select s.* into v_proposition
  from public.ai_suggestions s
  where s.id = p_suggestion_id
  for update;

  if v_proposition.id is null
     or (public.mode_prive() and not public.is_admin())
     or not public.peut_engager_unites(v_proposition.project_id) then
    raise exception 'Proposition introuvable, ou droits insuffisants pour l''écarter.'
      using errcode = '42501';
  end if;

  if v_proposition.state = 'dismissed' then
    return v_proposition;
  end if;
  if v_proposition.state <> 'proposed' then
    raise exception 'Cette proposition a déjà été appliquée.' using errcode = 'PR001';
  end if;

  update public.ai_suggestions
  set state = 'dismissed', decided_by = (select auth.uid()), decided_at = now()
  where id = v_proposition.id
  returning * into v_proposition;

  return v_proposition;
end;
$$;
